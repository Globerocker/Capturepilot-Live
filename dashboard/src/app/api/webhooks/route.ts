import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Webhook System — Zapier/Make/n8n compatible.
 *
 * POST /api/webhooks — Register a webhook
 * GET /api/webhooks — List webhooks for a user
 * DELETE /api/webhooks?id=xxx — Remove a webhook
 *
 * Events:
 * - new_match: when a new high-scoring match is found
 * - task_assigned: when admin assigns a task
 * - task_completed: when client completes a task
 * - document_uploaded: when client uploads a document
 * - opportunity_expiring: when a pursued opportunity is expiring
 * - pipeline_stage_change: when a deal moves stages
 *
 * Webhook payload format (Zapier-compatible):
 * { event, timestamp, data: { ...event-specific fields } }
 */

function getDb() {
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
}

// Webhook types
const VALID_EVENTS = [
    "new_match",
    "task_assigned",
    "task_completed",
    "document_uploaded",
    "opportunity_expiring",
    "pipeline_stage_change",
    "new_lead",
    "client_created",
];

/**
 * POST /api/webhooks — Register a new webhook
 * Body: { user_profile_id, url, events: string[], secret? }
 */
export async function POST(req: NextRequest) {
    try {
        const { user_profile_id, url, events, secret } = await req.json();

        if (!user_profile_id || !url || !events?.length) {
            return NextResponse.json({ error: "user_profile_id, url, and events[] required" }, { status: 400 });
        }

        // Validate URL
        try { new URL(url); } catch { return NextResponse.json({ error: "Invalid webhook URL" }, { status: 400 }); }

        // Validate events
        const invalidEvents = events.filter((e: string) => !VALID_EVENTS.includes(e));
        if (invalidEvents.length > 0) {
            return NextResponse.json({ error: `Invalid events: ${invalidEvents.join(", ")}. Valid: ${VALID_EVENTS.join(", ")}` }, { status: 400 });
        }

        const db = getDb();

        // Store webhook (using client_activity_log as storage since we don't have a dedicated table yet)
        // In production, create a dedicated webhooks table
        const { data, error } = await db.from("client_activity_log").insert({
            user_profile_id,
            action: "webhook_registered",
            description: `Webhook registered for events: ${events.join(", ")}`,
            metadata: { webhook_url: url, events, secret: secret || null, active: true },
        }).select("id").single();

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        return NextResponse.json({
            success: true,
            webhook_id: data.id,
            url,
            events,
            test_payload: {
                event: "test",
                timestamp: new Date().toISOString(),
                data: { message: "Webhook test from CapturePilot" },
            },
        });

    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}

/**
 * GET /api/webhooks?user_profile_id=xxx — List webhooks
 */
export async function GET(req: NextRequest) {
    try {
        const profileId = req.nextUrl.searchParams.get("user_profile_id");
        if (!profileId) return NextResponse.json({ error: "user_profile_id required" }, { status: 400 });

        const db = getDb();
        const { data } = await db.from("client_activity_log")
            .select("id, metadata, created_at")
            .eq("user_profile_id", profileId)
            .eq("action", "webhook_registered")
            .order("created_at", { ascending: false });

        const webhooks = (data || []).map(w => ({
            id: w.id,
            url: (w.metadata as Record<string, unknown>)?.webhook_url,
            events: (w.metadata as Record<string, unknown>)?.events,
            active: (w.metadata as Record<string, unknown>)?.active,
            created_at: w.created_at,
        }));

        return NextResponse.json({
            webhooks,
            available_events: VALID_EVENTS,
        });

    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}

/**
 * Utility: Send webhook to all registered URLs for an event.
 * Called internally by other API routes.
 */
export async function sendWebhook(
    userProfileId: string,
    event: string,
    eventData: Record<string, unknown>,
) {
    try {
        const db = getDb();
        const { data: hooks } = await db.from("client_activity_log")
            .select("metadata")
            .eq("user_profile_id", userProfileId)
            .eq("action", "webhook_registered");

        if (!hooks?.length) return;

        const payload = {
            event,
            timestamp: new Date().toISOString(),
            data: eventData,
        };

        for (const hook of hooks) {
            const meta = hook.metadata as Record<string, unknown>;
            if (!meta?.active) continue;
            const events = (meta.events || []) as string[];
            if (!events.includes(event)) continue;
            const url = String(meta.webhook_url || "");
            if (!url) continue;

            // Fire and forget
            fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(meta.secret ? { "X-Webhook-Secret": String(meta.secret) } : {}),
                },
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(5000),
            }).catch(() => {});
        }
    } catch {
        // Webhooks are best-effort
    }
}
