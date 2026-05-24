import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Resend } from "resend";

export const runtime = "nodejs";
// Webhook responses must be fast (Meta tolerates ~20s before timeout). All
// work runs inline since both Graph API and Resend are typically <1s combined.
export const maxDuration = 30;

const MAGNET_KEY = "meta-lead-field-manual";

function env(name: string): string | null {
    const v = process.env[name];
    return v && v.length > 0 ? v : null;
}

// `any` schema because generated Database types here don't yet include
// migration 070's marketing_leads table or 073's new columns. Same pattern
// other admin routes use; see CLAUDE.md note on Supabase type casts.
type DB = SupabaseClient<any, "public", any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function getDb(): DB | null {
    const url = env("NEXT_PUBLIC_SUPABASE_URL");
    const key = env("SUPABASE_SERVICE_KEY");
    if (!url || !key) return null;
    return createClient(url, key);
}

/**
 * Meta sends `X-Hub-Signature-256: sha256=<hex>` where <hex> is HMAC-SHA256
 * of the raw request body keyed by the App Secret. Without this check, anyone
 * who knows the URL could forge lead events and trigger arbitrary email sends.
 */
function verifySignature(rawBody: string, signatureHeader: string | null): boolean {
    const secret = env("META_APP_SECRET");
    if (!secret) return false;
    if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;

    const expected = crypto
        .createHmac("sha256", secret)
        .update(rawBody, "utf8")
        .digest("hex");
    const received = signatureHeader.slice("sha256=".length);

    if (expected.length !== received.length) return false;
    return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(received, "hex"));
}

// ─────────────────────────────────────────────────────────────────────────────
// GET — Meta webhook verification handshake
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get("hub.mode");
    const token = searchParams.get("hub.verify_token");
    const challenge = searchParams.get("hub.challenge");
    const verifyToken = env("META_WEBHOOK_VERIFY_TOKEN");

    if (mode === "subscribe" && verifyToken && token === verifyToken && challenge) {
        return new NextResponse(challenge, { status: 200 });
    }
    return new NextResponse("Forbidden", { status: 403 });
}

// ─────────────────────────────────────────────────────────────────────────────
// POST — leadgen event
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
    const rawBody = await req.text();

    if (!verifySignature(rawBody, req.headers.get("x-hub-signature-256"))) {
        return new NextResponse("Invalid signature", { status: 401 });
    }

    const accessToken = env("META_SYSTEM_TOKEN");
    const resendKey = env("RESEND_API_KEY");
    const pdfUrl = env("LEAD_MAGNET_PDF_URL");
    const allowedFormId = env("META_LEAD_FORM_ID"); // optional — when set, ignore events from other forms

    if (!accessToken || !resendKey || !pdfUrl) {
        console.error("[leadgen-webhook] missing required env vars", {
            accessToken: !!accessToken, resendKey: !!resendKey, pdfUrl: !!pdfUrl,
        });
        // Still 200 so Meta doesn't hammer us with retries while we fix config.
        return NextResponse.json({ ok: true, skipped: "missing_config" });
    }

    let payload: unknown;
    try {
        payload = JSON.parse(rawBody);
    } catch {
        return new NextResponse("Bad JSON", { status: 400 });
    }

    const db = getDb();
    const resend = new Resend(resendKey);
    const fromEmail = env("LEAD_MAGNET_FROM_EMAIL") || "Andre @ CapturePilot <andre@capturepilot.com>";

    const entries = (payload as { entry?: unknown[] }).entry ?? [];
    const results: Array<{ leadgen_id: string; status: string; error?: string }> = [];

    for (const entry of entries) {
        const changes = (entry as { changes?: unknown[] }).changes ?? [];
        for (const change of changes) {
            const c = change as { field?: string; value?: { leadgen_id?: string; form_id?: string } };
            if (c.field !== "leadgen") continue;
            const leadgenId = c.value?.leadgen_id;
            const formId = c.value?.form_id;
            if (!leadgenId) continue;
            if (allowedFormId && formId !== allowedFormId) {
                results.push({ leadgen_id: leadgenId, status: "skipped_other_form" });
                continue;
            }

            try {
                const result = await processLead({ leadgenId, formId, accessToken, db, resend, fromEmail, pdfUrl });
                results.push({ leadgen_id: leadgenId, status: result });
            } catch (err) {
                console.error("[leadgen-webhook] lead processing failed", leadgenId, err);
                results.push({ leadgen_id: leadgenId, status: "error", error: (err as Error).message });
                // Don't propagate — one bad lead in a batch shouldn't fail the whole webhook.
            }
        }
    }

    return NextResponse.json({ ok: true, processed: results.length, results });
}

// ─────────────────────────────────────────────────────────────────────────────

type ProcessArgs = {
    leadgenId: string;
    formId: string | undefined;
    accessToken: string;
    db: DB | null;
    resend: Resend;
    fromEmail: string;
    pdfUrl: string;
};

async function processLead({ leadgenId, formId, accessToken, db, resend, fromEmail, pdfUrl }: ProcessArgs): Promise<string> {
    // 1. Fetch the lead from Graph API. Bearer header avoids leaking the token
    //    into Vercel access logs (URL query strings get logged by default).
    const graphRes = await fetch(
        `https://graph.facebook.com/v21.0/${encodeURIComponent(leadgenId)}?fields=field_data,created_time,form_id`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!graphRes.ok) {
        const errText = await graphRes.text();
        throw new Error(`graph_${graphRes.status}: ${errText.slice(0, 200)}`);
    }
    const lead = await graphRes.json();

    const fields: Record<string, string> = {};
    for (const f of (lead.field_data ?? []) as Array<{ name: string; values: string[] }>) {
        fields[f.name] = f.values?.[0] || "";
    }
    const email = (fields.work_email || fields.email || "").trim().toLowerCase();
    const fullName = (fields.full_name || `${fields.first_name || ""} ${fields.last_name || ""}`).trim();
    const company = (fields.company_name || "").trim();
    const phone = (fields.phone_number || "").trim();

    if (!email) return "skipped_no_email";

    // 2. Insert into marketing_leads. Unique constraint on meta_leadgen_id
    //    short-circuits Meta retries; the inserted row count tells us whether
    //    this was a fresh lead (→ send email) or a duplicate (→ noop).
    let isNew = true;
    if (db) {
        const { error } = await db.from("marketing_leads").insert({
            email,
            company: company || null,
            magnet_key: MAGNET_KEY,
            source: "meta-lead-ad",
            utm_source: "meta",
            utm_medium: "lead-ad",
            utm_campaign: formId || null,
            meta_leadgen_id: leadgenId,
            meta_form_id: formId || null,
            resend_synced: false,
        });
        if (error) {
            // 23505 = unique_violation — already processed this leadgen_id.
            if ((error as { code?: string }).code === "23505") {
                isNew = false;
            } else {
                throw new Error(`db_insert: ${error.message}`);
            }
        }
    }

    if (!isNew) return "duplicate";

    // 3. Send the lead magnet.
    const greeting = fullName ? `Hi ${fullName.split(" ")[0]},` : "Hi,";
    const html = renderLeadMagnetEmail({ greeting, pdfUrl, company });

    const { error: sendErr } = await resend.emails.send({
        from: fromEmail,
        to: email,
        replyTo: "andre@capturepilot.com",
        subject: "Your Field Manual: Win Your First Government Contract",
        html,
    });
    if (sendErr) throw new Error(`resend: ${sendErr.message || String(sendErr)}`);

    if (db) {
        await db
            .from("marketing_leads")
            .update({ resend_synced: true })
            .eq("meta_leadgen_id", leadgenId);
    }

    // Log captured fields for analytics — phone/company aren't persisted on the
    // lead row, but they're useful to see in Vercel logs while we tune the form.
    console.log("[leadgen-webhook] sent", { leadgenId, email, company, phone: phone ? "[set]" : "[empty]" });

    return "sent";
}

function renderLeadMagnetEmail({ greeting, pdfUrl, company }: { greeting: string; pdfUrl: string; company: string }) {
    const intro = company
        ? `Thanks for grabbing the field manual — I pulled it together so folks at companies like ${escapeHtml(company)} can skip the year of trial-and-error most first-time bidders go through.`
        : `Thanks for grabbing the field manual — I pulled it together so first-time bidders can skip the year of trial-and-error most folks go through.`;

    return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f5f5f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1c1917;line-height:1.55;">
<div style="max-width:560px;margin:24px auto;background:#fff;border-radius:16px;padding:32px;">
  <p style="margin:0 0 16px;font-size:16px;">${greeting}</p>
  <p style="margin:0 0 16px;font-size:15px;color:#44403c;">${intro}</p>
  <p style="margin:0 0 24px;font-size:15px;color:#44403c;">Here&rsquo;s the PDF — 24 pages, no fluff:</p>
  <p style="margin:0 0 24px;">
    <a href="${pdfUrl}" style="display:inline-block;background:#059669;color:#fff;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:10px;font-size:15px;">
      Download the Field Manual
    </a>
  </p>
  <p style="margin:0 0 8px;font-size:14px;font-weight:600;color:#1c1917;">What&rsquo;s inside:</p>
  <ul style="margin:0 0 24px;padding-left:20px;font-size:14px;color:#44403c;">
    <li style="margin:0 0 4px;">Bid / No-Bid Decision Matrix</li>
    <li style="margin:0 0 4px;">PWin (Probability of Win) Calculator</li>
    <li style="margin:0 0 4px;">RFP Response Framework</li>
    <li style="margin:0;">Pricing-to-Win Worksheet</li>
  </ul>
  <p style="margin:0 0 8px;font-size:14px;color:#44403c;">
    If you want me to walk through one of your live opportunities, hit reply &mdash; happy to take a look.
  </p>
  <p style="margin:24px 0 0;font-size:14px;color:#1c1917;">&mdash; Andre, CapturePilot</p>
  <p style="margin:32px 0 0;padding-top:16px;border-top:1px solid #e7e5e4;font-size:11px;color:#a8a29e;">
    You&rsquo;re getting this because you requested the field manual through our Facebook / Instagram ad.
    Reply &ldquo;unsubscribe&rdquo; and I&rsquo;ll take you off the list.
  </p>
</div>
</body></html>`;
}

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
