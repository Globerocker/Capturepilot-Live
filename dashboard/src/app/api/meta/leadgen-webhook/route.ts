import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getLeadMagnet, sendLeadMagnetEmail } from "@/lib/lead-magnets";
import { sendCAPIEvent, newEventId } from "@/lib/meta-capi";
import { enrichPersonViaApollo } from "@/lib/lead-enrichment";
import { upsertHubSpotContact } from "@/lib/hubspot";
import { enqueueLeadBrief } from "@/lib/lead-brief";

export const runtime = "nodejs";
// Webhook responses must be fast (Meta tolerates ~20s before timeout). All
// work runs inline since both Graph API and Resend are typically <1s combined.
export const maxDuration = 30;

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
    const allowedFormId = env("META_LEAD_FORM_ID"); // optional — when set, ignore events from other forms

    if (!accessToken || !resendKey) {
        console.error("[leadgen-webhook] missing required env vars", {
            accessToken: !!accessToken, resendKey: !!resendKey,
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
                const result = await processLead({ leadgenId, formId, accessToken, db });
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

const MAGNET_KEY_FOR_META = "meta-lead-field-manual";

type ProcessArgs = {
    leadgenId: string;
    formId: string | undefined;
    accessToken: string;
    db: DB | null;
};

async function processLead({ leadgenId, formId, accessToken, db }: ProcessArgs): Promise<string> {
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
            magnet_key: MAGNET_KEY_FOR_META,
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

    const firstName = fullName ? fullName.split(" ")[0] : undefined;
    const lastName = fullName && fullName.split(" ").length > 1
        ? fullName.split(" ").slice(1).join(" ")
        : undefined;

    // 3a. Apollo enrichment — mirror /api/leads so the brief that emails
    //     americurial@gmail.com has the same enriched payload regardless of
    //     entry path. Non-fatal: null result means the brief LLM works off
    //     the bare-form data instead.
    const apolloEnrichment = await enrichPersonViaApollo({
        firstName,
        lastName,
        email,
        companyName: company || null,
    });

    if (apolloEnrichment && db) {
        await db
            .from("marketing_leads")
            .update({
                apollo_enriched_at: new Date().toISOString(),
                apollo_data: apolloEnrichment as unknown as Record<string, unknown>,
                phone: phone || apolloEnrichment.phone || null,
            })
            .eq("meta_leadgen_id", leadgenId)
            .then(({ error }) => {
                if (error && !error.message?.includes("schema cache")) {
                    console.warn("[leadgen-webhook] apollo patch non-fatal:", error.message);
                }
            });
    }

    // 3b. HubSpot CRM sync — partner workflow runs through HubSpot manually,
    //     so we want the contact in CRM the instant the lead converts.
    const hubspotId = await upsertHubSpotContact({
        email,
        firstname: firstName || apolloEnrichment?.first_name || undefined,
        lastname: lastName || apolloEnrichment?.last_name || undefined,
        phone: phone || apolloEnrichment?.phone || undefined,
        company: company || apolloEnrichment?.organization_name || undefined,
        jobtitle: apolloEnrichment?.title || undefined,
        lifecyclestage: "lead",
        extra: {
            lead_source_cp: ("meta_lead_ad" as never),
        },
    }).catch((err) => {
        console.warn("[leadgen-webhook] hubspot sync failed (non-fatal):", (err as Error).message);
        return null;
    });

    if (hubspotId && db) {
        await db
            .from("marketing_leads")
            .update({
                hubspot_contact_id: hubspotId,
                hubspot_synced_at: new Date().toISOString(),
            })
            .eq("meta_leadgen_id", leadgenId);
    }

    // 4. Deliver via the shared lead-magnet pipeline so we don't drift from
    //    /api/leads (the website form path).
    const magnet = getLeadMagnet(MAGNET_KEY_FOR_META);
    if (!magnet) throw new Error(`magnet_not_configured: ${MAGNET_KEY_FOR_META}`);

    const result = await sendLeadMagnetEmail({
        magnet,
        to: email,
        firstName: firstName || apolloEnrichment?.first_name || undefined,
        company: company || apolloEnrichment?.organization_name || undefined,
    });
    if (!result.sent) throw new Error(`resend: ${result.error || "unknown"}`);

    if (db) {
        await db
            .from("marketing_leads")
            .update({
                resend_synced: true,
                ...(result.resendId ? { magnet_resend_id: result.resendId } : {}),
            })
            .eq("meta_leadgen_id", leadgenId);
    }

    // 5. Enqueue the AI lead brief so americurial@gmail.com gets the call
    //    script + fit score + top opportunity matches. Worker picks it up
    //    within ~30s; brief lands in the partner's inbox a minute or two later.
    if (db) {
        try {
            const { data: leadRow } = await db
                .from("marketing_leads")
                .select("id")
                .eq("meta_leadgen_id", leadgenId)
                .maybeSingle();
            if (leadRow?.id) {
                await enqueueLeadBrief(db, leadRow.id);
            }
        } catch (e) {
            console.warn("[leadgen-webhook] enqueueLeadBrief failed (non-fatal):", (e as Error).message);
        }
    }

    // Server-side CAPI fire. Meta already counts the form submission since
    // the user did it through their Lead Ad — but firing CAPI with the
    // hashed email + phone gives us better match-quality and shows up in
    // the Events Manager alongside the Lead Ads stats. event_id includes
    // the leadgen_id so this is idempotent across Meta retries.
    void sendCAPIEvent({
        eventName: "Lead",
        eventId: `meta-leadgen-${leadgenId}`,
        eventSourceUrl: "https://www.facebook.com/leadgen",
        userData: { email, phone },
        customData: {
            content_name: "meta_lead_form",
            content_category: "lead_magnet",
            form_id: formId || undefined,
            magnet_key: MAGNET_KEY_FOR_META,
        },
    }).catch(err => console.warn("[leadgen-webhook] CAPI Lead fire failed:", err));

    // Log captured fields for analytics — phone/company aren't persisted on the
    // lead row, but they're useful to see in Vercel logs while we tune the form.
    console.log("[leadgen-webhook] sent", { leadgenId, email, company, phone: phone ? "[set]" : "[empty]" });

    return "sent";
}
