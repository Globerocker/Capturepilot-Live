import { NextRequest, NextResponse } from "next/server";
import { sendCAPIEvent, userDataFromRequest, type CAPIEventName } from "@/lib/meta-capi";

export const dynamic = "force-dynamic";

/**
 * POST /api/meta/capi-track
 *
 * Generic Meta Conversions API fire-from-client endpoint. Use this from
 * components that fire a Pixel event and want a matching server-side
 * CAPI dual-fire WITHOUT building a bespoke API route.
 *
 * Body:
 *   {
 *     event: "Lead" | "CompleteRegistration" | "Purchase" | "Search"
 *          | "StartTrial" | "Schedule",
 *     event_id: string,             // mint client-side, server reuses for dedup
 *     email?: string,               // hashed before send
 *     phone?: string,               // hashed before send
 *     external_id?: string,         // hashed (your internal user id)
 *     custom_data?: Record<string, unknown>,
 *   }
 *
 * Returns:
 *   { success: true } on accept (events_received also surfaced for debugging)
 *   200 even on Meta-side failures — Meta tracking should NEVER block a
 *   user-facing flow. We log internally.
 *
 * Why not gate this behind admin? Anyone could already fire arbitrary
 * Pixel events client-side. The only secret involved is the CAPI access
 * token which never leaves the server. We accept that a bot can fire
 * fake Lead events at us — Meta de-dupes against the client-side Pixel
 * and the noise floor is acceptable.
 */
const ALLOWED_EVENTS: ReadonlySet<CAPIEventName> = new Set([
    "Lead",
    "CompleteRegistration",
    "Purchase",
    "Search",
    "StartTrial",
    "Schedule",
]);

export async function POST(req: NextRequest) {
    let body: {
        event?: string;
        event_id?: string;
        email?: string;
        phone?: string;
        external_id?: string;
        custom_data?: Record<string, unknown>;
        event_source_url?: string;
    };
    try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: "invalid json" }, { status: 400 }); }

    const event = (body.event || "") as CAPIEventName;
    if (!ALLOWED_EVENTS.has(event)) {
        return NextResponse.json({ success: false, error: `event must be one of: ${[...ALLOWED_EVENTS].join(", ")}` }, { status: 400 });
    }
    if (!body.event_id || typeof body.event_id !== "string") {
        return NextResponse.json({ success: false, error: "event_id required" }, { status: 400 });
    }

    const userData = userDataFromRequest(req, {
        email: body.email || null,
        phone: body.phone || null,
        externalId: body.external_id || null,
    });

    const result = await sendCAPIEvent({
        eventName: event,
        eventId: body.event_id,
        eventSourceUrl: body.event_source_url || req.headers.get("referer") || undefined,
        userData,
        customData: body.custom_data || {},
    });

    // Always 200 — never let CAPI failures bubble into user-facing flows.
    return NextResponse.json(result);
}
