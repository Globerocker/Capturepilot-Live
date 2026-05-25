import { createHash, randomUUID } from "node:crypto";

/**
 * Meta Conversions API (CAPI) — server-side conversion events.
 *
 * Why CAPI on top of the client-side Pixel:
 *   - AdBlocker / ITP / Brave kills 30-40% of client-side fbevents.js loads.
 *     Server fires regardless and improves match-rate.
 *   - Lets us hash PII (email, phone) server-side so it never leaves our
 *     stack in plaintext.
 *
 * Dedup: send the SAME `event_id` from client `track()` AND this server
 * call. Meta drops the duplicate within ~48h based on event_id +
 * event_name + ad-account window.
 *
 * Required env:
 *   - NEXT_PUBLIC_META_PIXEL_ID  (also used by client Pixel)
 *   - META_CAPI_TOKEN            (server-side only — never NEXT_PUBLIC_*)
 *
 * Optional env:
 *   - META_TEST_EVENT_CODE       (for Meta Events Manager → Test Events tab)
 */

const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;
const TOKEN = process.env.META_CAPI_TOKEN;
const TEST_EVENT_CODE = process.env.META_TEST_EVENT_CODE;
const API_VERSION = "v22.0";

// Meta requires these names verbatim (Standard Events). Client-side
// analytics.ts maps the internal event keys → these standard names; we
// reuse the same mapping here so client + server stay in sync.
export type CAPIEventName =
    | "Lead"
    | "CompleteRegistration"
    | "Purchase"
    | "Search"
    | "StartTrial"
    | "Schedule";

export interface CAPIUserData {
    /** Plaintext email — we hash before sending. */
    email?: string | null;
    /** Plaintext phone (digits only ideal). We hash before sending. */
    phone?: string | null;
    /** External user id (e.g. user_profiles.id). Hashed. */
    externalId?: string | null;
    /** Client IP — Meta wants the raw v4/v6, NOT hashed. */
    clientIpAddress?: string | null;
    /** Browser user-agent, NOT hashed. */
    clientUserAgent?: string | null;
    /** fbp cookie (from `_fbp` cookie in browser). */
    fbp?: string | null;
    /** fbc cookie (constructed from ?fbclid= param). */
    fbc?: string | null;
}

export interface CAPICustomData {
    currency?: string;
    value?: number;
    content_name?: string;
    content_category?: string;
    content_ids?: string[];
    [k: string]: unknown;
}

export interface SendCAPIArgs {
    eventName: CAPIEventName;
    /** Same id used in client-side `track()` call for dedup. */
    eventId: string;
    /** Unix seconds — defaults to now. */
    eventTime?: number;
    /** URL the event happened on (e.g. https://app.capturepilot.com/check). */
    eventSourceUrl?: string;
    userData?: CAPIUserData;
    customData?: CAPICustomData;
}

/** SHA-256 lowercased trimmed value — Meta's required PII format. */
function hash(v: string | null | undefined): string | undefined {
    if (!v) return undefined;
    const cleaned = v.toString().trim().toLowerCase();
    if (!cleaned) return undefined;
    return createHash("sha256").update(cleaned).digest("hex");
}

/** Phone-specific: strip non-digits before hashing. */
function hashPhone(v: string | null | undefined): string | undefined {
    if (!v) return undefined;
    const digits = v.toString().replace(/\D/g, "");
    if (!digits) return undefined;
    return createHash("sha256").update(digits).digest("hex");
}

/**
 * Convenience: build a UUID v4 you can use for both client and server calls.
 * Client side analytics.ts generates one too — pass the SAME id to both.
 */
export function newEventId(): string {
    return randomUUID();
}

/**
 * Send a single event to the Conversions API. Returns the API response so
 * callers can log it if needed. Throws on network/auth errors so the caller
 * can decide whether to swallow them (most should — never block a user-
 * facing flow on ad-tracking).
 */
export async function sendCAPIEvent(args: SendCAPIArgs): Promise<{
    success: boolean;
    events_received?: number;
    fbtrace_id?: string;
    error?: string;
}> {
    if (!PIXEL_ID || !TOKEN) {
        // Silently skip when not configured — keeps dev/preview noise-free.
        return { success: false, error: "META_CAPI_TOKEN or NEXT_PUBLIC_META_PIXEL_ID not set" };
    }

    const ud = args.userData || {};
    const userData: Record<string, string | string[]> = {};
    const em = hash(ud.email);          if (em) userData.em = em;
    const ph = hashPhone(ud.phone);     if (ph) userData.ph = ph;
    const xid = hash(ud.externalId);    if (xid) userData.external_id = xid;
    if (ud.clientIpAddress) userData.client_ip_address = ud.clientIpAddress;
    if (ud.clientUserAgent) userData.client_user_agent = ud.clientUserAgent;
    if (ud.fbp) userData.fbp = ud.fbp;
    if (ud.fbc) userData.fbc = ud.fbc;

    const eventPayload = {
        data: [{
            event_name: args.eventName,
            event_time: args.eventTime ?? Math.floor(Date.now() / 1000),
            event_id: args.eventId,
            action_source: "website",
            event_source_url: args.eventSourceUrl,
            user_data: userData,
            custom_data: args.customData || {},
        }],
        ...(TEST_EVENT_CODE ? { test_event_code: TEST_EVENT_CODE } : {}),
    };

    const url = `https://graph.facebook.com/${API_VERSION}/${PIXEL_ID}/events?access_token=${TOKEN}`;
    try {
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(eventPayload),
            // CAPI is fire-and-forget for our purposes — short timeout so
            // a slow Meta API doesn't hold up the user flow.
            signal: AbortSignal.timeout(5_000),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
            return {
                success: false,
                error: body?.error?.message || `HTTP ${res.status}`,
                fbtrace_id: body?.error?.fbtrace_id,
            };
        }
        return {
            success: true,
            events_received: body.events_received,
            fbtrace_id: body.fbtrace_id,
        };
    } catch (e) {
        return { success: false, error: (e as Error).message };
    }
}

/**
 * Extract fbp / fbc / ip / user-agent from a Next.js Request. Use this in
 * API route handlers to populate `userData` without each caller doing it.
 */
export function userDataFromRequest(req: Request, opts?: { email?: string | null; phone?: string | null; externalId?: string | null }): CAPIUserData {
    const headers = req.headers;
    const cookieHeader = headers.get("cookie") || "";
    const cookies = Object.fromEntries(
        cookieHeader.split(";").map(c => {
            const i = c.indexOf("=");
            return [c.slice(0, i).trim(), decodeURIComponent(c.slice(i + 1).trim())];
        }).filter(([k]) => k),
    );
    return {
        email: opts?.email ?? null,
        phone: opts?.phone ?? null,
        externalId: opts?.externalId ?? null,
        clientIpAddress: (headers.get("x-forwarded-for") || "").split(",")[0]?.trim() || null,
        clientUserAgent: headers.get("user-agent") || null,
        fbp: cookies._fbp || null,
        fbc: cookies._fbc || null,
    };
}
