import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  // Run middleware on every request EXCEPT:
  //  - Next.js internals (_next/static, _next/image, favicon, image assets)
  //  - /api/cron/* — these are server-to-server (Vercel cron, GitHub Actions,
  //    external schedulers) and run their own auth via guardCron(). Letting
  //    updateSession() touch them adds latency, risks supabase-auth failures
  //    breaking the cron, and the Cache-Control: no-store header it sets is
  //    irrelevant. The enrichment_orchestrator stopped firing on 2026-05-26
  //    at 23:08 UTC — best-guess cause was middleware interference.
  //  - /api/health and /api/public/* — anonymous, cached, no session needed.
  //  - /outreach-console.html — token-gated static tool (its own token + the
  //    /api/outreach-console endpoint check); the auth gate must not 307 it to /login.
  //  - /site/* — PUBLIC shareable contractor one-pagers (served raw by the
  //    /site/[slug] route handler). The auth gate must not 307 them to /login.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/cron/|api/health|api/public/|outreach-console|site/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
