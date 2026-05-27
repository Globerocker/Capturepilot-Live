/**
 * Conversion-event helpers for the dashboard app. Mirrors `website/lib/analytics.ts`
 * — call these from anywhere; they're no-ops on the server or when no pixel
 * is loaded (e.g. before cookie consent).
 *
 * Every call returns an `event_id` so a matching server-side CAPI fire
 * from `@/lib/meta-capi` can dedup against the client event. Best match-
 * rate happens when both fire with the same id.
 */

type FbqWindow = Window & {
  fbq?: (...args: unknown[]) => void;
};

export type ConversionEvent =
  | "signup_completed"
  | "trial_started"
  | "pro_upgrade"
  | "check_started"
  | "demo_clicked"
  | "lead";

const META_MAP: Record<ConversionEvent, string> = {
  signup_completed: "CompleteRegistration",
  trial_started: "StartTrial",
  pro_upgrade: "Purchase",
  check_started: "Search",
  demo_clicked: "Schedule",
  lead: "Lead",
};

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Fire a Meta Pixel standard event. Returns the `event_id` so the caller
 * can pass the SAME id to a server-side CAPI dual-fire for dedup:
 *
 *   const eventId = track("lead", { content_name: "quick_check" });
 *   fetch("/api/...", {
 *     body: JSON.stringify({ ..., capi_event_id: eventId }),
 *   });
 *
 * Pass `{ eventId: "<existing>" }` in params to reuse an id you minted
 * elsewhere (rare — usually you only need this when wiring matching
 * pairs across page navigation).
 */
export function track(event: ConversionEvent, params: Record<string, unknown> = {}): string {
  const eventId = (params.eventId as string | undefined) || newId();
  if (typeof window === "undefined") return eventId;
  const w = window as FbqWindow;
  if (w.fbq) {
    // Strip eventId from custom data — Meta wants it as the third
    // positional ({ eventID }) for client/server dedup.
    const { eventId: _drop, ...rest } = { eventId, ...params };
    void _drop;
    w.fbq("track", META_MAP[event], rest, { eventID: eventId });
  }
  return eventId;
}

/**
 * Fire client Pixel + server CAPI in one call. Returns the eventId so the
 * caller can chain it if needed.
 *
 * `user` carries the high-signal match parameters Meta uses to stitch the
 * event back to a real Facebook user — pass the user's email + Supabase
 * user_id whenever you have them. We hash server-side; never send hashed
 * PII from the client.
 *
 * The CAPI POST is fire-and-forget — failures are swallowed in the network
 * layer (the /api/meta/capi-track route always returns 200). Don't await
 * this in user-facing flows.
 */
export function trackWithCapi(
  event: ConversionEvent,
  opts: {
    user?: { email?: string | null; phone?: string | null; externalId?: string | null };
    customData?: Record<string, unknown>;
  } = {},
): string {
  const eventId = track(event, opts.customData || {});
  if (typeof window === "undefined") return eventId;
  // Fire-and-forget — CAPI tracking must never block a user-facing flow.
  void fetch("/api/meta/capi-track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event: META_MAP[event],
      event_id: eventId,
      email: opts.user?.email || undefined,
      phone: opts.user?.phone || undefined,
      external_id: opts.user?.externalId || undefined,
      custom_data: opts.customData || undefined,
      event_source_url: window.location.href,
    }),
    keepalive: true,
  }).catch(() => {});
  return eventId;
}
