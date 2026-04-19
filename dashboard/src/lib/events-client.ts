/**
 * Client-side webhook event dispatcher.
 * Fires-and-forgets to /api/events/dispatch which validates the caller owns
 * the session + resolves user_profile_id server-side.
 *
 * Usage:
 *   import { dispatchEvent } from "@/lib/events-client";
 *   await dispatchEvent("pursuit.added", { opportunity_id, notice_id, stage });
 *
 * Never blocks UI — returns void immediately. Failures are silent on the
 * client; the server logs them to webhook_deliveries.
 */
export type ClientWebhookEvent =
    | "pursuit.added"
    | "pursuit.stage_changed"
    | "match.hot"
    | "match.warm"
    | "opportunity.dropped"
    | "proposal.completed"
    | "capture_brief.generated"
    | "recompete.high_confidence";

export function dispatchEvent(event: ClientWebhookEvent, data: Record<string, unknown>): void {
    fetch("/api/events/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event, data }),
        keepalive: true, // survives navigation
    }).catch(() => {
        /* swallow — webhook delivery is best-effort */
    });
}
