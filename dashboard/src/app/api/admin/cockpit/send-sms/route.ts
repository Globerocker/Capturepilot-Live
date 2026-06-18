/**
 * POST /api/admin/cockpit/send-sms
 *
 * Fires a SHORT personalized SMS to a LEAD's phone via Twilio — the SMS half of
 * the outreach cockpit's multi-channel composer. The operator reviews the
 * AI-drafted text (from /api/admin/cockpit/message with channel:"sms") and sends
 * it from here. Good as a follow-up after a LinkedIn connect, or when a call
 * doesn't land.
 *
 * Body:
 *   to            string  (required — the lead's phone, any common US format)
 *   body          string  (required — the message text; clamped to 1 segment-ish)
 *   contractor_id?  string  (for the send log)
 *   analysis_id?    string  (for the send log)
 *   lead_company?   string  (for the send log)
 *
 * Returns { ok: true, sid } | { ok: false, error, needsVerification? }.
 *
 * Twilio trial caveat: trial accounts only deliver to verified numbers — a 21608
 * comes back as a friendly "verify this number or upgrade" message.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertAdminWithUser } from "@/lib/auth-admin";
import { sendSmsToRecipient } from "@/lib/sms";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const runtime = "nodejs";
export const maxDuration = 30;

function db() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );
}

/** Best-effort E.164 normalization (US default). Returns null when implausible. */
function toE164(raw: string): string | null {
    const s = (raw || "").trim();
    if (!s) return null;
    if (s.startsWith("+")) {
        const d = s.replace(/[^\d]/g, "");
        return /^\d{8,15}$/.test(d) ? `+${d}` : null;
    }
    const digits = s.replace(/\D/g, "");
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
    if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;
    return null;
}

export async function POST(req: NextRequest) {
    const gate = await assertAdminWithUser();
    if (!gate.ok) return gate.response;

    let raw: Record<string, unknown>;
    try {
        raw = (await req.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }

    const contractor_id = typeof raw.contractor_id === "string" ? raw.contractor_id : null;
    const analysis_id = typeof raw.analysis_id === "string" ? raw.analysis_id : null;
    const lead_company = typeof raw.lead_company === "string" ? raw.lead_company.trim() : "";
    const bodyText = (typeof raw.body === "string" ? raw.body : "").trim();
    const to = toE164(typeof raw.to === "string" ? raw.to : "");

    if (!to) {
        return NextResponse.json(
            { ok: false, error: "A valid phone number is required (couldn't read this one)." },
            { status: 400 },
        );
    }
    if (!bodyText) {
        return NextResponse.json({ ok: false, error: "Message body is required." }, { status: 400 });
    }

    const result = await sendSmsToRecipient(to, bodyText);

    // ── Best-effort send log (never block the response on logging) ───────────
    void logSend({
        contractor_id,
        analysis_id,
        to,
        bodyText,
        lead_company,
        sent_by: gate.userId,
        result,
    });

    if (!result.sent) {
        const friendly = result.needsVerification
            ? "This number isn't verified on your Twilio trial. Verify it in the Twilio console, or upgrade the account to text any number."
            : result.error || "SMS send failed.";
        return NextResponse.json(
            { ok: false, error: friendly, needsVerification: !!result.needsVerification },
            { status: 502 },
        );
    }
    return NextResponse.json({ ok: true, sid: result.sid });
}

async function logSend(entry: {
    contractor_id: string | null;
    analysis_id: string | null;
    to: string;
    bodyText: string;
    lead_company: string;
    sent_by: string;
    result: { sent: boolean; sid?: string; error?: string };
}) {
    const row = {
        contractor_id: entry.contractor_id,
        analysis_id: entry.analysis_id,
        to_email: entry.to, // reuse the column for the destination (phone here)
        from_email: process.env.TWILIO_PHONE_NUMBER || null,
        subject: "[SMS]",
        channel: "sms",
        lead_company: entry.lead_company || null,
        sent_by: entry.sent_by,
        status: entry.result.sent ? "sent" : "failed",
        provider_id: entry.result.sent ? entry.result.sid || null : null,
        error: entry.result.sent ? null : entry.result.error || null,
        sent_at: new Date().toISOString(),
    };
    try {
        const sb = db();
        const { error } = await sb.from("cockpit_send_log").insert(row);
        if (error) console.log("[cockpit/send-sms] send-log (no table/col):", JSON.stringify(row));
    } catch (e) {
        console.log("[cockpit/send-sms] send-log (insert threw):", JSON.stringify(row), e);
    }
}
