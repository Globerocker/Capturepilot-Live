/**
 * GET  /api/admin/cockpit/sender — returns the configured cockpit sender plus
 *      the sending identities the UI can offer as DROPDOWNS instead of free text:
 *        - domains:       the account's VERIFIED Resend domains (so the UI can
 *                         build from-address options like info@<domain>,
 *                         sergio@<domain>, …). Degrades to [] if the Resend call
 *                         fails or RESEND_API_KEY is unset.
 *        - reply_options: previously-saved reply_to addresses (stored under
 *                         outreach_settings key='cockpit_reply_options') merged
 *                         with the current sender's from_email / reply_to so the
 *                         operator can pick a known inbox (e.g. an existing Gmail
 *                         or info@) or add a new one.
 *
 * POST /api/admin/cockpit/sender — upsert the cockpit sender row AND append any
 *      reply_to that isn't already in cockpit_reply_options, so the dropdown
 *      remembers addresses the operator typed.
 *
 * The cockpit sends cold lead-in emails AS the operator (Sergio), not from the
 * platform noreply@ address. That sender identity is stored once in
 * outreach_settings under key='cockpit_sender' as a jsonb value:
 *
 *   {
 *     from_email,         // required before any send is allowed
 *     from_name,
 *     reply_to,
 *     footer_html,        // optional extra HTML appended inside the footer block
 *     physical_address    // CAN-SPAM physical mailing address
 *   }
 *
 * The human fills from_email later. /api/admin/cockpit/send-email refuses to
 * send until from_email is set and non-placeholder (no '[' character).
 *
 * GET contract:
 *   {
 *     sender:        { from_email, from_name, reply_to, footer_html, physical_address },
 *     configured:    boolean,
 *     updated_at:    string | null,
 *     domains:       Array<{ name: string; status: string }>,   // verified only
 *     reply_options: string[],                                   // de-duped email list
 *   }
 *
 * Admin-gated via assertAdmin().
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertAdmin } from "@/lib/auth-admin";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const runtime = "nodejs";
export const maxDuration = 30;

const SETTINGS_KEY = "cockpit_sender";
const REPLY_OPTIONS_KEY = "cockpit_reply_options";

export interface CockpitSender {
    from_email: string;
    from_name: string;
    reply_to: string;
    footer_html: string;
    physical_address: string;
}

export interface ResendDomain {
    name: string;
    status: string;
}

export interface CockpitSenderGetResponse {
    sender: CockpitSender;
    configured: boolean;
    updated_at: string | null;
    domains: ResendDomain[];
    reply_options: string[];
}

// Placeholders intentionally contain '[' so the send endpoint's
// "contains '['" guard treats an unconfigured sender as not-yet-set.
const DEFAULT_SENDER: CockpitSender = {
    from_email: "[set me] e.g. sergio@capturepilot.com",
    from_name: "Sergio · CapturePilot",
    reply_to: "",
    footer_html: "",
    physical_address: "CapturePilot, 1209 Orange Street, Wilmington, DE 19801",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function db() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );
}

export async function GET() {
    const unauth = await assertAdmin();
    if (unauth) return unauth;

    const sb = db();

    // Pull the sender row + the saved reply-options list in one round trip.
    const { data: rows, error } = await sb
        .from("outreach_settings")
        .select("key, value, updated_at")
        .in("key", [SETTINGS_KEY, REPLY_OPTIONS_KEY]);

    if (error) {
        console.error("[cockpit/sender] GET failed:", error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const senderRow = (rows || []).find((r: any) => r.key === SETTINGS_KEY);
    const replyRow = (rows || []).find((r: any) => r.key === REPLY_OPTIONS_KEY);

    const stored = (senderRow?.value || {}) as Partial<CockpitSender>;
    // Merge over defaults so a partial row still returns a complete shape and
    // missing from_email surfaces as a placeholder the UI can flag.
    const sender: CockpitSender = {
        from_email: stored.from_email ?? DEFAULT_SENDER.from_email,
        from_name: stored.from_name ?? DEFAULT_SENDER.from_name,
        reply_to: stored.reply_to ?? DEFAULT_SENDER.reply_to,
        footer_html: stored.footer_html ?? DEFAULT_SENDER.footer_html,
        physical_address: stored.physical_address ?? DEFAULT_SENDER.physical_address,
    };

    const configured = isConfigured(sender.from_email);

    // Verified Resend domains for from-address dropdowns. Never let a Resend
    // outage break the GET — degrade to [].
    const domains = await fetchVerifiedResendDomains();

    // Reply-to options = saved list ∪ current sender's reply_to/from_email.
    const savedReply = toEmailArray(replyRow?.value);
    const reply_options = dedupeEmails([
        ...savedReply,
        sender.reply_to,
        configured ? sender.from_email : "",
    ]);

    const payload: CockpitSenderGetResponse = {
        sender,
        configured,
        updated_at: senderRow?.updated_at ?? null,
        domains,
        reply_options,
    };

    return NextResponse.json(payload);
}

export async function POST(req: NextRequest) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;

    let body: Partial<CockpitSender>;
    try {
        body = (await req.json()) as Partial<CockpitSender>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const value: CockpitSender = {
        from_email: str(body.from_email),
        from_name: str(body.from_name) || DEFAULT_SENDER.from_name,
        reply_to: str(body.reply_to),
        footer_html: str(body.footer_html),
        physical_address: str(body.physical_address) || DEFAULT_SENDER.physical_address,
    };

    const sb = db();

    const { error } = await sb
        .from("outreach_settings")
        .upsert(
            { key: SETTINGS_KEY, value, updated_at: new Date().toISOString() },
            { onConflict: "key" },
        );

    if (error) {
        console.error("[cockpit/sender] POST failed:", error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Remember any reply_to the operator typed so the dropdown can offer it next
    // time (e.g. an existing Gmail or info@ inbox). Best-effort — a failure here
    // must not fail the save.
    const reply_options = await rememberReplyOptions(sb, [value.reply_to, value.from_email]);

    return NextResponse.json({
        ok: true,
        sender: value,
        configured: isConfigured(value.from_email),
        reply_options,
    });
}

// ── Resend verified-domain lookup ───────────────────────────────────────────

/**
 * GET https://api.resend.com/domains → only the verified domains. Returns []
 * on any failure (missing key, network error, non-2xx, parse error) so the
 * cockpit GET degrades gracefully instead of 500ing.
 */
async function fetchVerifiedResendDomains(): Promise<ResendDomain[]> {
    const key = process.env.RESEND_API_KEY;
    if (!key) return [];

    try {
        const res = await fetch("https://api.resend.com/domains", {
            method: "GET",
            headers: { Authorization: `Bearer ${key}` },
            // Don't hang the whole settings load on a slow Resend response.
            signal: AbortSignal.timeout(8000),
            cache: "no-store",
        });
        if (!res.ok) {
            console.warn("[cockpit/sender] Resend /domains returned", res.status);
            return [];
        }
        const json: any = await res.json();
        // Resend returns { data: [{ id, name, status, region, created_at }] }.
        const list: any[] = Array.isArray(json?.data)
            ? json.data
            : Array.isArray(json)
                ? json
                : [];
        return list
            .map((d) => ({ name: str(d?.name), status: str(d?.status) }))
            .filter((d) => d.name.length > 0 && d.status.toLowerCase() === "verified");
    } catch (e) {
        console.warn(
            "[cockpit/sender] Resend /domains fetch failed:",
            e instanceof Error ? e.message : String(e),
        );
        return [];
    }
}

// ── reply-option persistence ────────────────────────────────────────────────

/**
 * Merge new candidate emails into the saved cockpit_reply_options list and
 * persist. Returns the de-duped list (or the current list unchanged on error).
 */
async function rememberReplyOptions(sb: any, candidates: string[]): Promise<string[]> {
    try {
        const { data } = await sb
            .from("outreach_settings")
            .select("value")
            .eq("key", REPLY_OPTIONS_KEY)
            .maybeSingle();

        const current = toEmailArray(data?.value);
        const merged = dedupeEmails([...current, ...candidates]);

        // Only write if the set actually changed.
        if (merged.length !== current.length || merged.some((m, i) => m !== current[i])) {
            const { error } = await sb
                .from("outreach_settings")
                .upsert(
                    { key: REPLY_OPTIONS_KEY, value: merged, updated_at: new Date().toISOString() },
                    { onConflict: "key" },
                );
            if (error) {
                console.warn("[cockpit/sender] reply-options upsert failed:", error.message);
                return current;
            }
        }
        return merged;
    } catch (e) {
        console.warn(
            "[cockpit/sender] reply-options persist threw:",
            e instanceof Error ? e.message : String(e),
        );
        return [];
    }
}

// ── helpers ─────────────────────────────────────────────────────────────────

// from_email is "configured" only when set and free of placeholder brackets.
function isConfigured(fromEmail: string | null | undefined): boolean {
    const v = (fromEmail || "").trim();
    return v.length > 0 && !v.includes("[") && v.includes("@");
}

function str(v: unknown): string {
    return typeof v === "string" ? v.trim() : "";
}

// Coerce a stored jsonb value into a clean string[] of email-shaped entries.
function toEmailArray(v: unknown): string[] {
    if (!Array.isArray(v)) return [];
    return v
        .map((x) => str(x))
        .filter((x) => x.length > 0 && EMAIL_RE.test(x));
}

// De-dupe (case-insensitive), drop blanks + non-email values, preserve order.
function dedupeEmails(list: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of list) {
        const v = str(raw);
        if (!v || !EMAIL_RE.test(v)) continue;
        const key = v.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(v);
    }
    return out;
}
