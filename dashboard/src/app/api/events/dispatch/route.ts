import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { fireWebhookEvent, type WebhookEvent } from "@/lib/webhooks";

export const maxDuration = 30;

/**
 * POST /api/events/dispatch
 *   body: { event: WebhookEvent, data: Record<string, unknown> }
 *
 * Client-invoked event dispatcher. Resolves the caller's user_profile_id
 * from the auth cookie and fires any matching webhook_endpoints.
 * This is the safe way for browser code to trigger webhooks — it never
 * exposes the service role key or lets the client spoof user_profile_id.
 *
 * Non-blocking: the dispatch runs fire-and-forget so the client gets a
 * 202 response immediately. Errors are logged to webhook_deliveries only.
 */

const ALLOWED_EVENTS: WebhookEvent[] = [
    "pursuit.added",
    "pursuit.stage_changed",
    "match.hot",
    "match.warm",
    "opportunity.dropped",
    "proposal.completed",
    "capture_brief.generated",
    "recompete.high_confidence",
];

export async function POST(req: NextRequest) {
    const cookieStore = await cookies();
    const sb = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll: () => cookieStore.getAll() } }
    );
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const event = body.event as WebhookEvent | undefined;
    const data = (body.data as Record<string, unknown>) || {};

    if (!event || !ALLOWED_EVENTS.includes(event)) {
        return NextResponse.json({ error: `Invalid event. Allowed: ${ALLOWED_EVENTS.join(", ")}` }, { status: 400 });
    }

    const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data: profile } = await admin
        .from("user_profiles")
        .select("id")
        .eq("auth_user_id", user.id)
        .single();
    if (!profile) return NextResponse.json({ error: "No profile" }, { status: 404 });
    const userProfileId = (profile as { id: string }).id;

    // Fire-and-forget — the dispatcher logs deliveries asynchronously
    fireWebhookEvent(userProfileId, event, data).catch(() => {
        /* logged in webhook_deliveries */
    });

    return NextResponse.json({ queued: true }, { status: 202 });
}
