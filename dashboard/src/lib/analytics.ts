/**
 * Conversion-event helpers for the dashboard app. Mirrors `website/lib/analytics.ts`
 * — call these from anywhere; they're no-ops on the server or when no pixel
 * is loaded (e.g. before cookie consent).
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

export function track(event: ConversionEvent, params: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  const w = window as FbqWindow;
  if (w.fbq) {
    w.fbq("track", META_MAP[event], params);
  }
}
