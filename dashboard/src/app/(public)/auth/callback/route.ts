import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Check if user has completed onboarding
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
          return NextResponse.redirect(`${origin}/onboard`);
        }

        return NextResponse.redirect(`${origin}/dashboard`);
      }
    }
  }

  // Something went wrong, redirect to login
  return NextResponse.redirect(`${origin}/login?error=auth`);
}
