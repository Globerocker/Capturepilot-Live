import { NextRequest, NextResponse } from "next/server";

/**
 * Centralized cron-route authorization. Fail-closed in production: if
 * `CRON_SECRET` is missing in prod, every request returns 401. The previous
 * scattered pattern (`if (!process.env.CRON_SECRET) return true`) would silently
 * expose every cron handler the moment the env var got unset, so callers
 * should migrate to this helper.
 *
 * Accepts either:
 *   Authorization: Bearer <CRON_SECRET>            (Vercel cron)
 *   Authorization: Bearer <SUPABASE_SERVICE_KEY>   (pg_cron-triggered fan-out)
 *
 * Local dev (NODE_ENV !== "production") with no CRON_SECRET set is allowed
 * so `npm run dev` curl tests don't need to ship the secret.
 */
export function isAuthorizedCron(authHeader: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }
  const expectedCron = `Bearer ${secret}`;
  const expectedSvc = process.env.SUPABASE_SERVICE_KEY
    ? `Bearer ${process.env.SUPABASE_SERVICE_KEY}`
    : null;
  return authHeader === expectedCron || authHeader === expectedSvc;
}

/** One-liner guard for `GET(req)` handlers. Returns `null` on success or a
 *  401 NextResponse on failure — caller does `if (denied) return denied;`. */
export function guardCron(req: NextRequest): NextResponse | null {
  if (isAuthorizedCron(req.headers.get("authorization"))) return null;
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
