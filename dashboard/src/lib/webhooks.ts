/**
 * Outbound webhook dispatcher — powers Zapier + other integrations.
 *
 * Call `fireWebhookEvent()` wherever a domain event occurs (e.g. a new
 * pursuit is added, a HOT match is classified, an opportunity is dismissed).
 * We look up active webhook_endpoints subscribed to that event name and
 * POST the payload; delivery attempts are logged to webhook_deliveries.
 *
 * Payload format:
 *   {
 *     event: "pursuit.added",
 *     timestamp: ISO-8601,
 *     user_profile_id: uuid,
 *     data: { ...event-specific fields }
 *   }
 *
 * Signature: HMAC-SHA256 of the raw body using the endpoint's secret,
 * sent as `X-CapturePilot-Signature: sha256=<hex>`.
 */
import { createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export type WebhookEvent =
    | "pursuit.added"
    | "pursuit.stage_changed"
    | "match.hot"
    | "match.warm"
    | "opportunity.dropped"
    | "proposal.completed"
    | "capture_brief.generated"
    | "recompete.high_confidence";

interface WebhookPayload {
    event: WebhookEvent;
    timestamp: string;
    user_profile_id: string;
    data: Record<string, unknown>;
}

function sign(secret: string, body: string): string {
    return createHmac("sha256", secret).update(body).digest("hex");
}

function admin() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
}

export async function fireWebhookEvent(
    userProfileId: string,
    event: WebhookEvent,
    data: Record<string, unknown>
): Promise<{ dispatched: number; failed: number }> {
    const db = admin();

    const { data: endpoints } = await db
        .from("webhook_endpoints")
        .select("id, url, secret, events")
        .eq("user_profile_id", userProfileId)
        .eq("active", true);

    const matching = (endpoints || []).filter((e) => {
        const events = (e.events as string[]) || [];
        return events.includes(event) || events.includes("*");
    });

    if (matching.length === 0) return { dispatched: 0, failed: 0 };

    const payload: WebhookPayload = {
        event,
        timestamp: new Date().toISOString(),
        user_profile_id: userProfileId,
        data,
    };
    const body = JSON.stringify(payload);

    let dispatched = 0;
    let failed = 0;

    // Dispatch in parallel but cap concurrency at 5
    const queue = [...matching];
    async function worker() {
        while (queue.length > 0) {
            const ep = queue.shift();
            if (!ep) break;
            const headers: Record<string, string> = {
                "Content-Type": "application/json",
                "User-Agent": "CapturePilot-Webhooks/1.0",
                "X-CapturePilot-Event": event,
            };
            if (ep.secret) {
                headers["X-CapturePilot-Signature"] = `sha256=${sign(ep.secret, body)}`;
            }

            let statusCode: number | null = null;
            let responseText: string | null = null;
            let errorMessage: string | null = null;
            try {
                const res = await fetch(ep.url, {
                    method: "POST",
                    headers,
                    body,
                    signal: AbortSignal.timeout(10_000),
                });
                statusCode = res.status;
                responseText = (await res.text()).slice(0, 2000);
                if (res.ok) dispatched++;
                else failed++;
            } catch (e) {
                errorMessage = e instanceof Error ? e.message : "fetch failed";
                failed++;
            }

            await db.from("webhook_deliveries").insert({
                webhook_id: ep.id,
                event,
                payload: payload as unknown as Record<string, unknown>,
                status_code: statusCode,
                response_text: responseText,
                error_message: errorMessage,
                attempt: 1,
            });
        }
    }

    await Promise.all(Array.from({ length: Math.min(5, matching.length) }, () => worker()));

    return { dispatched, failed };
}
