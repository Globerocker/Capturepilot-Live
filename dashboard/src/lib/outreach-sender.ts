/**
 * Outreach cadence sender — multi-channel (email + SMS) campaign step delivery.
 *
 * Used by /api/cron/run_outreach_cadence to fire the next step for an
 * outreach_campaign_contacts row. Both senders:
 *   1. Check outreach_optouts (email or phone) — short-circuit if suppressed.
 *   2. Render merge tags against the contact's fields.
 *   3. Call provider (Resend for email, Twilio for SMS).
 *   4. Upsert an outreach_campaign_step_runs row with provider_message_id +
 *      status so the cadence runner can advance the contact safely.
 *
 * Merge tags supported:
 *   {{firstName}} {{lastName}} {{company}} {{title}} {{state}}
 *   {{customField:key}}
 *
 * Missing fields fall back to friendly defaults ("there" / "your company") so
 * a missing first name never leaks "Hi {{firstName}}" into a live send.
 */
import { Resend } from "resend";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Twilio is imported lazily so the cron route doesn't blow up if the SDK is
// missing in a particular deployment (CI builds without TWILIO_* set).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SbAny = SupabaseClient<any, any, any>;

let _resend: Resend | null = null;
function getResend(): Resend | null {
    if (!process.env.RESEND_API_KEY) return null;
    if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
    return _resend;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _twilio: any = null;
async function getTwilio(): Promise<unknown | null> {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !token) return null;
    if (_twilio) return _twilio;
    try {
        const mod = await import("twilio");
        // twilio package exports a default factory: twilio(sid, token)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const factory = (mod as any).default || (mod as any);
        _twilio = factory(sid, token);
        return _twilio;
    } catch (e) {
        console.error("[outreach-sender] twilio import failed:", e);
        return null;
    }
}

function getDbAdmin(): SbAny | null {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) return null;
    return createClient(url, key, { auth: { persistSession: false } });
}

// ───────────────────────── Merge tag rendering ─────────────────────────

export interface ContactForRender {
    first_name?: string | null;
    last_name?: string | null;
    company?: string | null;
    title?: string | null;
    state?: string | null;
    custom_fields?: Record<string, unknown> | null;
    [key: string]: unknown;
}

/**
 * Render a template string against a contact. Unknown tags are left in place
 * so the caller can spot bugs (vs silently emitting an empty string), with the
 * exception of the known short-list which use friendly fallbacks.
 *
 *   {{firstName}} → contact.first_name || "there"
 *   {{lastName}}  → contact.last_name || ""
 *   {{company}}   → contact.company || "your company"
 *   {{title}}     → contact.title || ""
 *   {{state}}     → contact.state || ""
 *   {{customField:key}} → String(contact.custom_fields?.[key] ?? "")
 */
export function renderTemplate(template: string, contact: ContactForRender): string {
    if (!template) return "";

    const firstName = (contact.first_name || "").trim() || "there";
    const lastName = (contact.last_name || "").trim();
    const company = (contact.company || "").trim() || "your company";
    const title = (contact.title || "").trim();
    const state = (contact.state || "").trim();

    return template
        .replace(/\{\{\s*firstName\s*\}\}/gi, firstName)
        .replace(/\{\{\s*lastName\s*\}\}/gi, lastName)
        .replace(/\{\{\s*company\s*\}\}/gi, company)
        .replace(/\{\{\s*title\s*\}\}/gi, title)
        .replace(/\{\{\s*state\s*\}\}/gi, state)
        .replace(/\{\{\s*customField\s*:\s*([\w-]+)\s*\}\}/gi, (_full, key) => {
            const v = contact.custom_fields?.[key];
            if (v === undefined || v === null) return "";
            return String(v);
        });
}

// ───────────────────────── Optout check ─────────────────────────

async function isOptedOut(
    sb: SbAny,
    channel: "email" | "sms",
    address: string,
): Promise<boolean> {
    if (!address) return false;
    // outreach_optouts is keyed off email today. SMS optouts share the same
    // table — phone goes in as the address. Future: dedicated column if Twilio
    // adds STOP-keyword handling that needs richer attribution.
    try {
        const lookup = channel === "email" ? address.toLowerCase() : address;
        const { data } = await sb
            .from("outreach_optouts")
            .select("email, reason")
            .eq("email", lookup)
            .maybeSingle();
        return !!data;
    } catch (e) {
        // Fail-open: a Supabase blip should not black-hole legitimate sends.
        console.error(`[outreach-sender] optout check failed for ${address}:`, e);
        return false;
    }
}

// ───────────────────────── Step-run persistence ─────────────────────────

interface StepRunUpsert {
    runId?: string | null;
    campaignId: string;
    stepId: string;
    contactId: string;
    channel: "email" | "sms";
    status: "sent" | "failed" | "suppressed" | "skipped";
    providerMessageId?: string | null;
    error?: string | null;
    renderedSubject?: string | null;
    renderedBody?: string | null;
}

async function persistStepRun(sb: SbAny, params: StepRunUpsert): Promise<void> {
    const row: Record<string, unknown> = {
        campaign_id: params.campaignId,
        step_id: params.stepId,
        contact_id: params.contactId,
        channel: params.channel,
        status: params.status,
        provider_message_id: params.providerMessageId ?? null,
        error: params.error ?? null,
        rendered_subject: params.renderedSubject ?? null,
        rendered_body: params.renderedBody ?? null,
        sent_at: new Date().toISOString(),
    };
    try {
        if (params.runId) {
            await sb.from("outreach_campaign_step_runs")
                .update(row)
                .eq("id", params.runId);
        } else {
            await sb.from("outreach_campaign_step_runs").insert(row);
        }
    } catch (e) {
        console.error("[outreach-sender] step_run persist failed:", e);
    }
}

// ───────────────────────── Email sender ─────────────────────────

export interface SendOutreachEmailParams {
    to: string;
    from: string;
    subject: string;
    html: string;
    replyTo?: string;
    campaignId: string;
    stepId: string;
    contactId: string;
    runId?: string | null;
    contact?: ContactForRender;
}

export interface SendOutreachResult {
    ok: boolean;
    status: "sent" | "failed" | "suppressed" | "skipped";
    providerMessageId?: string | null;
    error?: string;
}

/**
 * Send a single outreach email step. Honors suppression, renders merge tags,
 * persists an outreach_campaign_step_runs row. Returns success state so the
 * cadence runner can advance / mark-failed atomically.
 */
export async function sendOutreachEmail(
    params: SendOutreachEmailParams,
): Promise<SendOutreachResult> {
    const sb = getDbAdmin();
    if (!sb) {
        return { ok: false, status: "failed", error: "supabase not configured" };
    }

    const { to, from, replyTo, campaignId, stepId, contactId, runId, contact } = params;

    if (!to || !to.includes("@")) {
        await persistStepRun(sb, {
            runId, campaignId, stepId, contactId,
            channel: "email", status: "failed", error: "invalid email address",
        });
        return { ok: false, status: "failed", error: "invalid email address" };
    }

    if (await isOptedOut(sb, "email", to)) {
        await persistStepRun(sb, {
            runId, campaignId, stepId, contactId,
            channel: "email", status: "suppressed", error: "recipient opted out",
        });
        return { ok: true, status: "suppressed" };
    }

    const renderedSubject = renderTemplate(params.subject, contact || {});
    const renderedHtml = renderTemplate(params.html, contact || {});

    const r = getResend();
    if (!r) {
        await persistStepRun(sb, {
            runId, campaignId, stepId, contactId,
            channel: "email", status: "failed", error: "RESEND_API_KEY not set",
            renderedSubject, renderedBody: renderedHtml,
        });
        return { ok: false, status: "failed", error: "RESEND_API_KEY not set" };
    }

    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sendArgs: any = {
            from,
            to,
            subject: renderedSubject,
            html: renderedHtml,
        };
        if (replyTo) sendArgs.replyTo = replyTo;

        const res = await r.emails.send(sendArgs);
        // Resend v6 SDK returns { data: { id }, error } — both surfaces possible.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = (res as any)?.data || res;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const err = (res as any)?.error;
        if (err) {
            const msg = typeof err === "string" ? err : (err.message || JSON.stringify(err));
            await persistStepRun(sb, {
                runId, campaignId, stepId, contactId,
                channel: "email", status: "failed", error: msg.slice(0, 500),
                renderedSubject, renderedBody: renderedHtml,
            });
            return { ok: false, status: "failed", error: msg };
        }
        const providerMessageId = (data?.id as string | undefined) || null;
        await persistStepRun(sb, {
            runId, campaignId, stepId, contactId,
            channel: "email", status: "sent",
            providerMessageId,
            renderedSubject, renderedBody: renderedHtml,
        });
        return { ok: true, status: "sent", providerMessageId };
    } catch (e) {
        const msg = (e instanceof Error ? e.message : String(e)).slice(0, 500);
        await persistStepRun(sb, {
            runId, campaignId, stepId, contactId,
            channel: "email", status: "failed", error: msg,
            renderedSubject, renderedBody: renderedHtml,
        });
        return { ok: false, status: "failed", error: msg };
    }
}

// ───────────────────────── SMS sender ─────────────────────────

export interface SendOutreachSMSParams {
    to: string;
    body: string;
    campaignId: string;
    stepId: string;
    contactId: string;
    runId?: string | null;
    contact?: ContactForRender;
    from?: string; // optional — defaults to TWILIO_PHONE_NUMBER
}

const E164_RE = /^\+[1-9]\d{1,14}$/;

/**
 * Send a single outreach SMS step via Twilio. Requires the `to` number in
 * E.164 format (e.g. +12025551234). Honors suppression list and renders
 * merge tags before delivery. Persists outreach_campaign_step_runs row with
 * provider_message_id + status.
 */
export async function sendOutreachSMS(
    params: SendOutreachSMSParams,
): Promise<SendOutreachResult> {
    const sb = getDbAdmin();
    if (!sb) {
        return { ok: false, status: "failed", error: "supabase not configured" };
    }

    const { to, campaignId, stepId, contactId, runId, contact } = params;
    const from = params.from || process.env.TWILIO_PHONE_NUMBER || "";

    if (!to || !E164_RE.test(to)) {
        await persistStepRun(sb, {
            runId, campaignId, stepId, contactId,
            channel: "sms", status: "failed", error: "invalid E.164 phone number",
        });
        return { ok: false, status: "failed", error: "invalid E.164 phone number" };
    }
    if (!from) {
        await persistStepRun(sb, {
            runId, campaignId, stepId, contactId,
            channel: "sms", status: "failed", error: "TWILIO_PHONE_NUMBER not set",
        });
        return { ok: false, status: "failed", error: "TWILIO_PHONE_NUMBER not set" };
    }

    if (await isOptedOut(sb, "sms", to)) {
        await persistStepRun(sb, {
            runId, campaignId, stepId, contactId,
            channel: "sms", status: "suppressed", error: "recipient opted out",
        });
        return { ok: true, status: "suppressed" };
    }

    const renderedBody = renderTemplate(params.body, contact || {});

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = (await getTwilio()) as any;
    if (!client) {
        await persistStepRun(sb, {
            runId, campaignId, stepId, contactId,
            channel: "sms", status: "failed", error: "Twilio not configured",
            renderedBody,
        });
        return { ok: false, status: "failed", error: "Twilio not configured" };
    }

    try {
        const res = await client.messages.create({
            from,
            to,
            body: renderedBody,
        });
        const providerMessageId = (res?.sid as string | undefined) || null;
        await persistStepRun(sb, {
            runId, campaignId, stepId, contactId,
            channel: "sms", status: "sent",
            providerMessageId,
            renderedBody,
        });
        return { ok: true, status: "sent", providerMessageId };
    } catch (e) {
        const msg = (e instanceof Error ? e.message : String(e)).slice(0, 500);
        await persistStepRun(sb, {
            runId, campaignId, stepId, contactId,
            channel: "sms", status: "failed", error: msg,
            renderedBody,
        });
        return { ok: false, status: "failed", error: msg };
    }
}
