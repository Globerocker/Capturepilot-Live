import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://ryxgjzehoijjvczqkhwr.supabase.co";

const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ5eGdqemVob2lqanZjenFraHdyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwNDg0NTUsImV4cCI6MjA4NzYyNDQ1NX0.q0HivHixjE-A2MuQZlmlZOO2eLpQEm8c6XhQQQKaJsY";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const hostname = request.headers.get("host") || "";

  // ─── Prevent browser back-button from showing cached auth pages ───
  supabaseResponse.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  supabaseResponse.headers.set("Pragma", "no-cache");
  supabaseResponse.headers.set("Expires", "0");

  // ─── Always-public routes (no auth needed) ───
  const isAlwaysPublic =
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/check") ||
    pathname.startsWith("/analyze") ||
    pathname.startsWith("/startup-pack") ||
    pathname.startsWith("/invite") ||
    pathname.startsWith("/unsubscribed") ||
    pathname === "/privacy" ||
    pathname === "/terms";

  if (isAlwaysPublic) return supabaseResponse;

  // ─── Admin subdomain routing ───
  if (hostname.startsWith("admin.")) {
    if (pathname === "/") {
      const url = request.nextUrl.clone();
      url.pathname = "/admin/overview";
      return NextResponse.rewrite(url);
    }
    if (!pathname.startsWith("/admin") && !pathname.startsWith("/login") && !pathname.startsWith("/auth") && !pathname.startsWith("/api") && !pathname.startsWith("/_next")) {
      const url = request.nextUrl.clone();
      url.pathname = "/admin/overview";
      return NextResponse.redirect(url);
    }
  }

  // ─── Admin pages — always accessible (no onboarding gate) ───
  if (pathname.startsWith("/admin")) return supabaseResponse;

  // ─── Not logged in → send to login ───
  if (!user) {
    if (pathname === "/" || pathname === "/login" || pathname === "/signup" || pathname === "/pricing") {
      return supabaseResponse; // let them see these pages
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // ─── Logged in: get profile once ───
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("account_type, onboarding_complete, subscription_status, trial_ends_at")
    .eq("auth_user_id", user.id)
    .single();

  const accountType = profile?.account_type || "self_service";
  const onboardingDone = profile?.onboarding_complete || false;
  const subscriptionStatus = (profile?.subscription_status as string | null) || null;
  const trialEndsAt = profile?.trial_ends_at as string | null;

  // ─── Root / login / signup → redirect to correct home ───
  if (pathname === "/" || pathname === "/login" || pathname === "/signup") {
    const url = request.nextUrl.clone();
    if (accountType === "admin") {
      url.pathname = "/admin/overview";
    } else if (accountType === "consulting") {
      url.pathname = "/portal";
    } else if (onboardingDone) {
      url.pathname = "/dashboard";
    } else {
      url.pathname = "/onboard";
    }
    return NextResponse.redirect(url);
  }

  // ─── Portal routes — consulting clients only, no onboarding gate ───
  if (pathname.startsWith("/portal")) return supabaseResponse;

  // ─── Onboarding page — always accessible when logged in ───
  if (pathname === "/onboard") return supabaseResponse;

  // ─── Consulting clients: ALWAYS redirect to portal (never show SaaS dashboard) ───
  if (accountType === "consulting" && !pathname.startsWith("/portal")) {
    const url = request.nextUrl.clone();
    url.pathname = "/portal" + (pathname === "/dashboard" ? "" : pathname.replace(/^\/(dashboard|settings|matches|pipeline|opportunities|actions)/, ""));
    return NextResponse.redirect(url);
  }

  // ─── Admin: skip onboarding entirely ───
  if (accountType === "admin") {
    return supabaseResponse;
  }

  // Self-service: check onboarding
  if (!onboardingDone) {
    const url = request.nextUrl.clone();
    url.pathname = "/onboard";
    return NextResponse.redirect(url);
  }

  // ─── Beta hard paywall ───
  // Beta ends 2026-05-09 (founder's birthday). After that date, self-service users
  // must have an active subscription OR an unexpired trial to access the dashboard.
  // Billing + settings stay accessible so they can complete checkout.
  const BETA_END = new Date("2026-05-09T00:00:00Z");
  if (Date.now() >= BETA_END.getTime()) {
    const isAllowedStatus =
      subscriptionStatus === "active" ||
      subscriptionStatus === "trialing" ||
      subscriptionStatus === "past_due"; // 1 grace period — webhook can downgrade later
    const trialStillActive = trialEndsAt && new Date(trialEndsAt).getTime() > Date.now();
    const hasAccess = isAllowedStatus || trialStillActive;

    const isPaywallExempt =
      pathname.startsWith("/billing") ||
      pathname.startsWith("/settings") ||
      pathname === "/onboard";

    if (!hasAccess && !isPaywallExempt) {
      const url = request.nextUrl.clone();
      url.pathname = "/billing";
      url.searchParams.set("paywall", "1");
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
