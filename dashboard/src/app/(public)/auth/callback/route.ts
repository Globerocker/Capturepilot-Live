import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { syncLinkedInProfile } from "@/lib/linkedin-enrichment";

// Marketing-site origins we'll trust as `return_to` targets after the
// LinkedIn lead-magnet flow. Anything else falls back to /thank-you on the
// dashboard origin (prevents open-redirect abuse).
const ALLOWED_RETURN_HOSTS = new Set([
  "www.capturepilot.com",
  "capturepilot.com",
  "americurial.com",
  "www.americurial.com",
  "localhost",
]);

function safeReturnTo(returnTo: string | null, fallback: string): string {
  if (!returnTo) return fallback;
  try {
    const url = new URL(returnTo);
    if (!ALLOWED_RETURN_HOSTS.has(url.hostname)) return fallback;
    return url.toString();
  } catch {
    return fallback;
  }
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const analysisId = searchParams.get("analysis_id") || "";
  // When the LeadMagnetForm initiates LinkedIn OAuth it tags the redirect
  // with intent=lead_prefill so we know to bounce the user straight back to
  // the Quick Checker results page instead of routing into the dashboard.
  //
  // The marketing-site "Continue with LinkedIn" buttons on /downloads/*
  // tag the redirect with intent=lead_magnet + magnet=<key> + return_to=
  // <thank-you url>. We fire the magnet delivery server-side then 302 the
  // user back to capturepilot.com.
  const intent = searchParams.get("intent") || "";
  const magnetKey = (searchParams.get("magnet") || "").trim();
  const returnToParam = searchParams.get("return_to");

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        // ── LinkedIn OIDC enrichment ──
        // Fires for every callback where the active identity is linkedin_oidc.
        // Pulls the verified OIDC claims (picture, locale, email_verified) into
        // user_profiles + marketing_leads and pushes them to HubSpot so the
        // sales rep sees the LinkedIn photo on the contact card. Idempotent
        // and fire-and-forget — failure here never blocks the auth flow.
        const hasLinkedInIdentity = (user.identities || []).some(
          (i) => i.provider === "linkedin_oidc",
        );
        if (hasLinkedInIdentity) {
          try {
            await syncLinkedInProfile(user);
          } catch (e) {
            console.warn(
              "[auth/callback] syncLinkedInProfile failed:",
              (e as Error).message,
            );
          }
        }

        // Lead-magnet flow short-circuits everything else. Fire the magnet
        // delivery (writes marketing_leads, sends the PDF via Resend) then
        // 302 back to the marketing-site thank-you URL. We never land the
        // user on the dashboard — they came from www.capturepilot.com and
        // expect to land back there.
        if (intent === "lead_magnet" && magnetKey) {
          const fallback = `${origin}/thank-you?magnet=${encodeURIComponent(magnetKey)}`;
          const returnTo = safeReturnTo(returnToParam, fallback);

          // Build an absolute URL for the internal POST. We hit this app's
          // own /api/lead-magnet/deliver so the same Supabase session +
          // service key are in play.
          try {
            const meta = (user.user_metadata || {}) as Record<string, unknown>;
            const deliverUrl = new URL(`${origin}/api/lead-magnet/deliver`);
            const resp = await fetch(deliverUrl.toString(), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                magnet: magnetKey,
                email: user.email || null,
                user_metadata: meta,
                source: "linkedin_oauth",
                // Echo the original UTM/source if the marketing site put
                // them on the return_to URL — lets us attribute the magnet
                // grab back to the ad / page that triggered it.
                return_to: returnTo,
              }),
            });
            if (!resp.ok) {
              const body = await resp.text().catch(() => "");
              console.warn("[auth/callback] lead-magnet deliver non-200", {
                status: resp.status,
                body: body.slice(0, 300),
              });
            }
          } catch (e) {
            // Non-fatal — we still send the user to the thank-you page; the
            // sales team will see a half-finished lead in HubSpot worst case.
            console.warn(
              "[auth/callback] lead-magnet deliver call failed:",
              (e as Error).message,
            );
          }

          const target = new URL(returnTo);
          // Make sure the magnet key rides along so the thank-you page can
          // render the right copy.
          if (!target.searchParams.get("magnet")) {
            target.searchParams.set("magnet", magnetKey);
          }
          return NextResponse.redirect(target.toString());
        }

        // Lead-prefill flow short-circuits everything else: send the user
        // back to /check/{analysisId}?linkedin=1 so the page can read the
        // verified payload off the supabase session and auto-submit.
        if (intent === "lead_prefill" && analysisId) {
          return NextResponse.redirect(`${origin}/check/${analysisId}?linkedin=1`);
        }

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
          .select("onboarding_complete, account_type, company_name")
          .eq("auth_user_id", user.id)
          .single();

        // Consulting clients go to /portal (skip onboarding)
        if (profile?.account_type === "consulting") {
          return NextResponse.redirect(`${origin}/portal`);
        }

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
