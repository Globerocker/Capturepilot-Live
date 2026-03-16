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

  // Public routes that don't require auth
  const publicRoutes = ["/", "/login", "/signup", "/auth/callback"];
  const isPublicRoute =
    publicRoutes.includes(pathname) ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/");

  // If user is not authenticated and trying to access a protected route
  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // If authenticated user visits public pages, redirect to dashboard
  if (user && (pathname === "/" || pathname === "/login" || pathname === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  // Onboarding gate: force authenticated users to complete onboarding
  if (user && !isPublicRoute && pathname !== "/onboard") {
    // Check cookie first to avoid DB query on every request
    const onboardingCookie = request.cookies.get("cp_onboarding_complete");
    if (onboardingCookie?.value !== "true") {
      // Query DB to check onboarding status
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("onboarding_complete")
        .eq("auth_user_id", user.id)
        .single();

      if (!profile || !profile.onboarding_complete) {
        const url = request.nextUrl.clone();
        url.pathname = "/onboard";
        return NextResponse.redirect(url);
      }

      // Onboarding is complete - set cookie so we skip DB query next time
      supabaseResponse.cookies.set("cp_onboarding_complete", "true", {
        path: "/",
        maxAge: 86400 * 30,
        httpOnly: true,
        sameSite: "lax",
      });
    }
  }

  return supabaseResponse;
}
