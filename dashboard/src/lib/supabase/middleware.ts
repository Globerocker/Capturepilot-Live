import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://ryxgjzehoijjvczqkhwr.supabase.co";

const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ5eGdqemVob2lqanZjenFraHdyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwNDg0NTUsImV4cCI6MjA4NzYyNDQ1NX0.q0HivHixjE-A2MuQZlmlZOO2eLpQEm8c6XhQQQKaJsY";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.capturepilot.com";
const MARKETING_URL = process.env.NEXT_PUBLIC_MARKETING_URL || "https://www.capturepilot.com";

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
  const host = request.headers.get("host") || "";

  // Determine which domain we're on
  const isLocalhost = host.includes("localhost") || host.includes("127.0.0.1");
  const isAppDomain = host.startsWith("app.");
  const isMarketingDomain = !isAppDomain && !isLocalhost;

  // Always allow these paths regardless of domain
  if (
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/")
  ) {
    return supabaseResponse;
  }

  // ─── Marketing domain (www.capturepilot.com) ───
  if (isMarketingDomain) {
    const marketingRoutes = ["/", "/login", "/signup", "/pricing"];
    const isMarketingRoute = marketingRoutes.includes(pathname);

    // Authenticated user on marketing login/signup/home → send to app
    if (user && (pathname === "/" || pathname === "/login" || pathname === "/signup")) {
      return NextResponse.redirect(`${APP_URL}/dashboard`);
    }

    // Allow marketing routes for unauthenticated users
    if (isMarketingRoute) {
      return supabaseResponse;
    }

    // Any dashboard route on marketing domain → redirect to app domain
    return NextResponse.redirect(`${APP_URL}${pathname}`);
  }

  // ─── App domain (app.capturepilot.com) ───
  if (isAppDomain) {
    // Unauthenticated user on app domain → send to marketing login
    if (!user && pathname !== "/onboard") {
      return NextResponse.redirect(`${MARKETING_URL}/login`);
    }

    // Authenticated user on "/" of app domain → dashboard
    if (user && pathname === "/") {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }

    // Onboarding gate
    if (user && pathname !== "/onboard" && pathname !== "/login" && pathname !== "/signup") {
      const onboardingCookie = request.cookies.get("cp_onboarding_complete");
      if (onboardingCookie?.value !== "true") {
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

  // ─── Localhost (development) — original behavior ───
  const publicRoutes = ["/", "/login", "/signup", "/pricing", "/auth/callback"];
  const isPublicRoute = publicRoutes.includes(pathname);

  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && (pathname === "/" || pathname === "/login" || pathname === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  if (user && !isPublicRoute && pathname !== "/onboard") {
    const onboardingCookie = request.cookies.get("cp_onboarding_complete");
    if (onboardingCookie?.value !== "true") {
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
