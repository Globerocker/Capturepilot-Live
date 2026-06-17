/**
 * Septeo bounce-reactivation SEND endpoint (token-gated, service-key backed, Resend).
 *
 * This is a SEPARATE campaign from the CapturePilot outreach engine. It sends the
 * bounce-reactivation emails approved in the Septeo review dashboard
 * (https://review-dashboard-indol.vercel.app), one mail per firm, using the
 * per-reason templates in septeo_reason_templates.
 *
 * Contract (the dashboard calls this cross-origin):
 *   OPTIONS                          -> CORS preflight (204)
 *   GET  /api/septeo-send?token=&count=1
 *        -> { ok, approved, sales_held, already_sent, by_category:{recipient_unknown,policy_spam,mailbox_full,permanently_undeliverable} }
 *   POST /api/septeo-send?token=     body { mode:'test'|'live', test_email?, limit? }
 *        -> { ok, mode, attempted, sent, failed, skipped, log_sample }
 *
 * Mirrors /api/outreach-console: token query gate + service-key Supabase client.
 * Uses a SEPARATE Resend key: process.env.SEPTEO_RESEND_API_KEY.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Resend } from "resend";

export const runtime = "nodejs";
export const maxDuration = 300;
/* eslint-disable @typescript-eslint/no-explicit-any */

const TOKEN = "7615965f4a5c1c90f1e9";
const DASHBOARD_ORIGIN = "https://review-dashboard-indol.vercel.app";
const REASON_CATEGORIES = ["recipient_unknown", "policy_spam", "mailbox_full", "permanently_undeliverable"] as const;
type ReasonCat = (typeof REASON_CATEGORIES)[number];

type SbAny = SupabaseClient<any, any, any>;

function sb(): SbAny {
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, { auth: { persistSession: false } });
}

const CORS: Record<string, string> = {
    "Access-Control-Allow-Origin": DASHBOARD_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Max-Age": "86400",
};

function json(body: any, status = 200) {
    return NextResponse.json(body, { status, headers: { ...CORS, "cache-control": "no-store" } });
}

function delay(ms: number) {
    return new Promise((res) => setTimeout(res, ms));
}

function esc(s: string): string {
    return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function hasPlaceholder(v: any): boolean {
    return typeof v === "string" && v.includes("[");
}

// ---- bounce block ------------------------------------------------------------
// Build a plain-text {{bounce_block}} (and parallel HTML <li> list) from the
// firm's bounced_contacts MINUS its excluded_record_ids. Cap at 15 visible
// lines; if more remain add a "… sowie N weitere Adressen Ihrer Domain" line.
function buildBounceBlock(firm: any): { text: string; htmlItems: string[]; activeCount: number } {
    const excluded = new Set<string>((Array.isArray(firm?.excluded_record_ids) ? firm.excluded_record_ids : []).map((x: any) => String(x)));
    const contacts: any[] = Array.isArray(firm?.bounced_contacts) ? firm.bounced_contacts : [];
    const active = contacts.filter((c) => !(c?.record_id != null && excluded.has(String(c.record_id))));

    const CAP = 15;
    const shown = active.slice(0, CAP);
    const lines: string[] = [];
    const htmlItems: string[] = [];

    for (const c of shown) {
        const rawName = c?.name;
        const hasName = rawName != null && String(rawName).trim() !== "" && String(rawName).trim() !== "(ohne Namen)";
        const email = c?.email ? String(c.email) : "";
        const reason = c?.reason ? String(c.reason) : "";
        const namePart = hasName ? `${String(rawName).trim()} – ` : "";
        const reasonPart = reason ? `  (${reason})` : "";
        lines.push(`  • ${namePart}${email}${reasonPart}`);
        const namePartH = hasName ? `${esc(String(rawName).trim())} &ndash; ` : "";
        const reasonPartH = reason ? ` <span style="color:#888">(${esc(reason)})</span>` : "";
        htmlItems.push(`${namePartH}${esc(email)}${reasonPartH}`);
    }

    const remaining = active.length - shown.length;
    if (remaining > 0) {
        lines.push(`  • … sowie ${remaining} weitere Adressen Ihrer Domain`);
        htmlItems.push(`&hellip; sowie ${remaining} weitere Adressen Ihrer Domain`);
    }

    return { text: lines.join("\n"), htmlItems, activeCount: active.length };
}

// ---- placeholder fill --------------------------------------------------------
function fillPlaceholders(tpl: string, firm: any, sender: any, bounceText: string, multi: boolean): string {
    if (!tpl) return "";
    const map: Record<string, string> = {
        firma: firm?.firma || firm?.domain || "",
        bounce_block: bounceText,
        kam_kamen: multi ? "kamen" : "kam",
        adresse_adressen: multi ? "E-Mail-Adressen" : "E-Mail-Adresse",
        person_personen_hint: multi ? " (bzw. die genannten Personen)" : "",
        absenderin: sender?.absenderin || "",
        absenderin_rolle: sender?.absenderin_rolle || "",
        absender_firma: sender?.absender_firma || "",
        absenderin_email: sender?.absenderin_email || "",
        absenderin_tel: sender?.absenderin_tel || "",
    };
    return tpl.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (full, key) => {
        const k = String(key).toLowerCase();
        return k in map ? map[k] : full;
    });
}

// Render a filled text body into a simple HTML body. Paragraphs split on \n\n,
// single \n -> <br>. The {{bounce_block}} region is rendered as a <ul>.
function textToHtml(filledText: string, bounceText: string, htmlItems: string[]): string {
    let html = "";
    if (bounceText && filledText.includes(bounceText)) {
        const idx = filledText.indexOf(bounceText);
        const before = filledText.slice(0, idx);
        const after = filledText.slice(idx + bounceText.length);
        html += paragraphsToHtml(before);
        if (htmlItems.length) {
            html += `<ul style="margin:8px 0 8px 0;padding-left:20px">${htmlItems.map((i) => `<li>${i}</li>`).join("")}</ul>`;
        }
        html += paragraphsToHtml(after);
    } else {
        html += paragraphsToHtml(filledText);
    }
    return html;
}

function paragraphsToHtml(chunk: string): string {
    if (!chunk || !chunk.trim()) return "";
    return chunk
        .split(/\n\n+/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => `<p style="margin:0 0 12px 0;line-height:1.5">${esc(p).replace(/\n/g, "<br>")}</p>`)
        .join("");
}

// ---- counts ------------------------------------------------------------------
async function buildCounts(db: SbAny) {
    const cnt = async (build: (q: any) => any) => {
        const { count } = await build(db.from("septeo_bounce_firms").select("domain", { count: "exact", head: true }));
        return count || 0;
    };
    const approved = await cnt((q) => q.eq("review_status", "freigegeben").or("sales_hold.is.null,sales_hold.eq.false"));
    const sales_held = await cnt((q) => q.eq("review_status", "freigegeben").eq("sales_hold", true));
    const already_sent = await cnt((q) => q.eq("review_status", "gesendet"));

    const by_category: Record<string, number> = { recipient_unknown: 0, policy_spam: 0, mailbox_full: 0, permanently_undeliverable: 0 };
    const { data: rows } = await db
        .from("septeo_bounce_firms")
        .select("bounce_reason_category, sales_hold")
        .eq("review_status", "freigegeben")
        .limit(100000);
    for (const r of (rows || []) as any[]) {
        if (r.sales_hold === true) continue;
        const cat = REASON_CATEGORIES.includes(r.bounce_reason_category) ? r.bounce_reason_category : "recipient_unknown";
        by_category[cat] = (by_category[cat] || 0) + 1;
    }
    return { approved, sales_held, already_sent, by_category };
}

// ---- handlers ----------------------------------------------------------------
export function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(req: NextRequest) {
    const url = new URL(req.url);
    if (url.searchParams.get("token") !== TOKEN) return json({ error: "unauthorized" }, 401);
    if (url.searchParams.get("count") === "1") {
        try {
            const counts = await buildCounts(sb());
            return json({ ok: true, ...counts });
        } catch (e: any) {
            return json({ error: e?.message || String(e) }, 500);
        }
    }
    return json({ ok: true, hint: "POST {mode:'test'|'live', test_email?, limit?} to send; GET ?count=1 for counts" });
}

export async function POST(req: NextRequest) {
    const url = new URL(req.url);
    if (url.searchParams.get("token") !== TOKEN) return json({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({} as any));
    const mode: "test" | "live" = body?.mode === "live" ? "live" : "test";
    const test_email: string | undefined = body?.test_email;
    const limit = Math.max(1, Math.min(2000, Number(body?.limit) || (mode === "test" ? 5 : 500)));

    if (!process.env.SEPTEO_RESEND_API_KEY) return json({ error: "SEPTEO_RESEND_API_KEY not set" }, 400);
    if (mode === "test" && !test_email) return json({ error: "test_email required for mode=test" }, 400);

    const db = sb();

    // sender settings
    const { data: senderRow } = await db.from("septeo_settings").select("value").eq("key", "sender").maybeSingle();
    const sender: any = (senderRow?.value as any) || {};
    if (mode === "live") {
        const senderFields = [
            sender.from_email, sender.from_name, sender.reply_to, sender.absenderin, sender.absenderin_rolle,
            sender.absender_firma, sender.absenderin_email, sender.absenderin_tel, sender.physical_address,
        ];
        if (senderFields.some(hasPlaceholder)) {
            return json({ error: "Absender-Daten in septeo_settings noch nicht ausgefüllt" }, 400);
        }
        if (!sender.from_email || !sender.from_name) {
            return json({ error: "Absender-Daten in septeo_settings noch nicht ausgefüllt" }, 400);
        }
    }

    // reason templates by category
    const { data: tplRows } = await db.from("septeo_reason_templates").select("category, subject, body_text");
    const tplByCat: Record<string, { subject: string; body_text: string }> = {};
    for (const t of (tplRows || []) as any[]) tplByCat[t.category] = { subject: t.subject || "", body_text: t.body_text || "" };

    // approved + not sales-held firms
    let q = db
        .from("septeo_bounce_firms")
        .select("domain, firma, marktsegment, bounce_reason_category, bounced_contacts, excluded_record_ids, freigegeben_email, email_empfohlen, review_status, sales_hold")
        .eq("review_status", "freigegeben")
        .or("sales_hold.is.null,sales_hold.eq.false")
        .limit(limit);
    const { data: firms, error: firmsErr } = await q;
    if (firmsErr) return json({ error: firmsErr.message }, 500);

    const resend: any = new Resend(process.env.SEPTEO_RESEND_API_KEY);
    const fromHeader = `${sender.from_name || "Septeo"} <${sender.from_email}>`;
    const replyTo = sender.reply_to || sender.from_email;
    const unsubLine = "Wenn Sie keine weiteren Nachrichten wünschen, antworten Sie bitte mit „abmelden“.";
    const physical = sender.physical_address || "";

    let attempted = 0, sent = 0, failed = 0, skipped = 0;
    const log_sample: any[] = [];
    const logRows: any[] = [];

    for (const firm of (firms || []) as any[]) {
        // recipient
        let to: string | null;
        if (mode === "test") {
            to = test_email!;
        } else {
            to = firm.freigegeben_email || firm.email_empfohlen || null;
            if (!to) {
                skipped++;
                logRows.push({ domain: firm.domain, mode, to_email: null, subject: null, status: "error", provider_id: null, error: "no recipient address" });
                if (log_sample.length < 10) log_sample.push({ domain: firm.domain, status: "skipped", error: "no recipient address" });
                continue;
            }
        }

        // template
        const cat: ReasonCat = (REASON_CATEGORIES as readonly string[]).includes(firm.bounce_reason_category)
            ? (firm.bounce_reason_category as ReasonCat)
            : "recipient_unknown";
        const tpl = tplByCat[cat] || tplByCat["recipient_unknown"] || { subject: "", body_text: "" };

        // bounce block + multi
        const block = buildBounceBlock(firm);
        const multi = block.activeCount > 1;

        const subject = fillPlaceholders(tpl.subject, firm, sender, block.text, multi);
        let textBody = fillPlaceholders(tpl.body_text, firm, sender, block.text, multi);
        const footerText = `\n\n—\n${unsubLine}${physical ? `\n${physical}` : ""}`;
        textBody = textBody + footerText;

        let html = textToHtml(textBody, block.text, block.htmlItems);
        html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222">${html}<hr style="border:none;border-top:1px solid #ddd;margin:16px 0"><p style="margin:0;font-size:12px;color:#888">${esc(unsubLine)}${physical ? `<br>${esc(physical)}` : ""}</p></div>`;

        attempted++;
        try {
            const resp = await resend.emails.send({
                from: fromHeader,
                to,
                replyTo,
                subject,
                text: textBody,
                html,
            });
            const providerId = resp?.data?.id || resp?.id || null;
            if (resp?.error) throw new Error(resp.error?.message || JSON.stringify(resp.error));
            sent++;
            logRows.push({ domain: firm.domain, mode, to_email: to, subject, status: "sent", provider_id: providerId, error: null });
            if (log_sample.length < 10) log_sample.push({ domain: firm.domain, to_email: to, status: "sent", provider_id: providerId });
            if (mode === "live") {
                await db.from("septeo_bounce_firms").update({ review_status: "gesendet" }).eq("domain", firm.domain);
            }
        } catch (e: any) {
            failed++;
            const msg = e?.message || String(e);
            logRows.push({ domain: firm.domain, mode, to_email: to, subject, status: "error", provider_id: null, error: msg });
            if (log_sample.length < 10) log_sample.push({ domain: firm.domain, to_email: to, status: "error", error: msg });
        }

        await delay(600);
    }

    if (logRows.length) {
        try { await db.from("septeo_send_log").insert(logRows); } catch { /* non-blocking */ }
    }

    return json({ ok: true, mode, attempted, sent, failed, skipped, log_sample });
}
