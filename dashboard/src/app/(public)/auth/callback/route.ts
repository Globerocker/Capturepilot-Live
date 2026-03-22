import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const analysisId = searchParams.get("analysis_id") || "";

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        // Try to link analysis_id if provided or find by email
        let resolvedAnalysisId = analysisId;

        if (!resolvedAnalysisId && user.email) {
          // Look up by lead_email
          const sb = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_KEY!
          );
          const { data: matchedAnalysis } = await sb
            .from("company_analyses")
            .select("id")
            .eq("lead_email", user.email)
            .is("converted_user_id", null)
            .order("created_at", { ascending: false })
            .limit(1)
            .single();

          if (matchedAnalysis) {
            resolvedAnalysisId = matchedAnalysis.id;
          }
        }

        const { data: profile } = await supabase
          .from("user_profiles")
          .select("onboarding_complete")
          .eq("auth_user_id", user.id)
          .single();

        if (!profile || !profile.onboarding_complete) {
          const onboardUrl = resolvedAnalysisId
            ? `${origin}/onboard?analysis_id=${resolvedAnalysisId}`
            : `${origin}/onboard`;
          return NextResponse.redirect(onboardUrl);
        }

        return NextResponse.redirect(`${origin}/dashboard`);
      }
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
