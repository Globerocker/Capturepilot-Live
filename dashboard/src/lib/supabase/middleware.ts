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

  // admin.capturepilot.com → only admin pages
  const isAdminDomain = hostname.startsWith("admin.");
  if (isAdminDomain) {
    // Rewrite root to /admin/overview on admin subdomain
    if (pathname === "/" || pathname === "/login") {
      // Allow login page on admin domain
      if (pathname === "/") {
        const url = request.nextUrl.clone();
        url.pathname = "/admin/overview";
        return NextResponse.rewrite(url);
      }
    }
    // Block non-admin routes on admin domain (except auth, api, static)
    if (!pathname.startsWith("/admin") && !pathname.startsWith("/auth") && !pathname.startsWith("/api") && !pathname.startsWith("/_next") && !pathname.startsWith("/login")) {
      const url = request.nextUrl.clone();
      url.pathname = "/admin/overview";
      return NextResponse.redirect(url);
    }
  }

  // Public routes that don't require auth
  const publicRoutes = ["/", "/login", "/signup", "/pricing", "/auth/callback", "/analyze", "/check"];
  const isPublicRoute =
    publicRoutes.includes(pathname) ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/analyze/") ||
    pathname.startsWith("/check/") ||
    pathname.startsWith("/admin/");

  // If user is not authenticated and trying to access a protected route
  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/signup";
    return NextResponse.redirect(url);
  }

  // If authenticated user visits public pages, redirect based on account type
  if (user && (pathname === "/" || pathname === "/login" || pathname === "/signup")) {
    // Check if consulting client → redirect to portal
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("account_type, onboarding_complete")
      .eq("auth_user_id", user.id)
      .single();

    const url = request.nextUrl.clone();
    if (profile?.account_type === "consulting") {
      url.pathname = "/portal";
    } else {
      url.pathname = "/dashboard";
    }
    return NextResponse.redirect(url);
  }

  // Onboarding gate: force non-consulting users to complete onboarding
  const isPortalRoute = pathname.startsWith("/portal");
  if (user && !isPublicRoute && !isPortalRoute && pathname !== "/onboard") {
    const onboardingCookie = request.cookies.get("cp_onboarding_complete");
    if (onboardingCookie?.value !== "true") {
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("onboarding_complete, account_type")
        .eq("auth_user_id", user.id)
        .single();

      // Consulting clients skip onboarding (admin did it for them)
      if (profile?.account_type === "consulting") {
        supabaseResponse.cookies.set("cp_onboarding_complete", "true", {
          path: "/", maxAge: 86400 * 30, httpOnly: true, sameSite: "lax",
        });
      } else if (!profile || !profile.onboarding_complete) {
        const url = request.nextUrl.clone();
        url.pathname = "/onboard";
        return NextResponse.redirect(url);
      } else {
        supabaseResponse.cookies.set("cp_onboarding_complete", "true", {
          path: "/", maxAge: 86400 * 30, httpOnly: true, sameSite: "lax",
        });
      }
    }
  }

  return supabaseResponse;
}
