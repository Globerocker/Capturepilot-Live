import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  // Use app URL for cross-domain redirects, fallback to origin for localhost
  const appBase = process.env.NEXT_PUBLIC_APP_URL || origin;
  const marketingBase = process.env.NEXT_PUBLIC_MARKETING_URL || origin;

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { data: profile } = await supabase
          .from("user_profiles")
          .select("onboarding_complete")
          .eq("auth_user_id", user.id)
          .single();

        if (!profile || !profile.onboarding_complete) {
          return NextResponse.redirect(`${appBase}/onboard`);
        }

        return NextResponse.redirect(`${appBase}/dashboard`);
      }
    }
  }

  return NextResponse.redirect(`${marketingBase}/login?error=auth`);
}
