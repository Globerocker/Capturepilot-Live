"use client";

import { useState, Suspense, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { ArrowRight, CheckCircle2, Loader2, Gift } from "lucide-react";
import clsx from "clsx";
import { createSupabaseClient } from "@/lib/supabase/client";
import { trackWithCapi } from "@/lib/analytics";

interface InviteDetails {
  email: string;
  recipient_name: string | null;
  company_name: string | null;
  claimed: boolean;
}

function SignupPageContent() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [invite, setInvite] = useState<InviteDetails | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const analysisId = searchParams.get("analysis_id");
  const inviteToken = searchParams.get("invite");
  const supabase = createSupabaseClient();

  // Load invite details if a token is present
  useEffect(() => {
    if (!inviteToken) return;
    (async () => {
      try {
        const res = await fetch(`/api/beta-invites/${inviteToken}`);
        const data = await res.json();
        if (!res.ok) {
          setInviteError(data.error || "Invalid invitation link");
          return;
        }
        setInvite(data);
        setEmail(data.email);
      } catch {
        setInviteError("Could not load invitation");
      }
    })();
  }, [inviteToken]);

  const claimInvite = async (authUserId: string | undefined) => {
    if (!inviteToken) return;
    try {
      await fetch(`/api/beta-invites/${inviteToken}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auth_user_id: authUserId }),
      });
    } catch {
      // non-blocking
    }
  };

  const AUTH_ERROR_MAP: Record<string, string> = {
    "Anonymous sign-ins are disabled": "Please enter your email and password to create an account.",
    "User already registered": "An account with this email already exists. Try signing in instead.",
    "Password should be at least 6 characters": "Your password must be at least 6 characters long.",
    "Invalid email": "Please enter a valid email address.",
    "Signup requires a valid password": "Please enter a password to create your account.",
    "Email rate limit exceeded": "Too many attempts. Please try again in a few minutes.",
  };

  function friendlyError(msg: string): string {
    return AUTH_ERROR_MAP[msg] || "Something went wrong. Please try again.";
  }

  const handleGoogleSignup = async () => {
    setLoading(true);
    setError("");
    const callbackParams = new URLSearchParams();
    if (analysisId) callbackParams.set("analysis_id", analysisId);
    if (inviteToken) callbackParams.set("invite", inviteToken);
    const qs = callbackParams.toString();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback${qs ? `?${qs}` : ""}`,
      },
    });
    if (error) {
      setError(friendlyError(error.message));
      setLoading(false);
    }
  };

  const handleEmailSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: invite
          ? {
              beta_invite: true,
              recipient_name: invite.recipient_name || undefined,
              company_name: invite.company_name || undefined,
            }
          : undefined,
      },
    });
    if (error) {
      setError(friendlyError(error.message));
      setLoading(false);
    } else {
      if (inviteToken) await claimInvite(data.user?.id);
      // Pixel + CAPI dual-fire. Passing email + Supabase user_id improves
      // Meta's Event Match Quality dramatically (4.3 → ~8 range).
      trackWithCapi("signup_completed", {
        user: { email, externalId: data.user?.id || null },
        customData: { source: inviteToken ? "beta_invite" : "signup" },
      });
      // Fire-and-forget HubSpot sync — do not block redirect
      fetch("/api/hubspot/sync-contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          source: inviteToken ? "beta_invite" : "signup",
          account_type: "self_service",
          company_name: invite?.company_name,
          contact_name: invite?.recipient_name,
        }),
      }).catch((err) => console.error("[HubSpot sync failed]", err));

      // CAPI server-side CompleteRegistration — dedups against client
      // via capi_event_id. Survives AdBlockers, hashes email server-side.
      const onboardParams = new URLSearchParams();
      if (analysisId) onboardParams.set("analysis_id", analysisId);
      if (invite?.company_name) onboardParams.set("company", invite.company_name);
      if (invite?.recipient_name) onboardParams.set("name", invite.recipient_name);
      // Preserve the plan param from /pricing → /signup so it survives
      // through /onboard and into /billing for the trial-start redirect.
      const planParam = searchParams.get("plan");
      if (planParam === "light" || planParam === "pro") onboardParams.set("plan", planParam);
      const onboardQs = onboardParams.toString();
      router.push(`/onboard${onboardQs ? `?${onboardQs}` : ""}`);
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center space-x-3 mb-10">
          <Image src="/logo.png" alt="CapturePilot" width={40} height={40} className="rounded-xl shadow-lg" />
          <h1 className="text-2xl font-bold">CapturePilot</h1>
        </div>

        <div className="bg-white rounded-[32px] p-8 border border-stone-200 shadow-sm">
          {invite ? (
            <>
              <div className="flex items-center justify-center w-12 h-12 bg-emerald-100 rounded-full mx-auto mb-4">
                <Gift className="w-6 h-6 text-emerald-700" />
              </div>
              <h2 className="text-xl font-bold text-center mb-2">
                {invite.recipient_name
                  ? `Welcome, ${invite.recipient_name.split(" ")[0]}`
                  : "You're invited to the beta"}
              </h2>
              <p className="text-sm text-stone-500 text-center mb-2">
                {invite.company_name
                  ? <>Your beta account for <strong>{invite.company_name}</strong> is pre-approved. Just set a password.</>
                  : "Your beta account is pre-approved. Just set a password."}
              </p>
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 mb-6 text-center">
                <span className="text-xs font-bold text-emerald-700">
                  25% off locked in for life when paid plans launch
                </span>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-xl font-bold text-center mb-2">
                Start Your Free Trial
              </h2>
              <p className="text-sm text-stone-500 text-center mb-2">
                It&apos;s completely free right now. No credit card required.
              </p>
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 mb-6 text-center">
                <span className="text-xs font-bold text-emerald-700">
                  Beta users save 25% on their subscription when we launch paid plans
                </span>
              </div>
            </>
          )}

          {inviteError && (
            <div className="bg-amber-50 text-amber-700 text-xs p-3 rounded-xl border border-amber-200 mb-6">
              {inviteError}. You can still sign up below.
            </div>
          )}

          {/* Google OAuth */}
          <button
            onClick={handleGoogleSignup}
            disabled={loading}
            className="w-full flex items-center justify-center space-x-3 bg-white border-2 border-stone-200 text-stone-700 py-3.5 rounded-2xl font-medium text-sm hover:border-stone-400 hover:bg-stone-50 transition-all disabled:opacity-50"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            <span>Sign up with Google</span>
          </button>

          <div className="flex items-center my-6">
            <div className="flex-1 border-t border-stone-200" />
            <span className="px-4 text-xs text-stone-400">or</span>
            <div className="flex-1 border-t border-stone-200" />
          </div>

          {/* Email/Password */}
          <form onSubmit={handleEmailSignup} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                readOnly={!!invite}
                className={clsx(
                  "w-full px-4 py-3 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-stone-400",
                  invite
                    ? "bg-stone-50 border-stone-200 text-stone-600 cursor-not-allowed"
                    : "border-stone-200"
                )}
                placeholder="you@company.com"
                required
              />
              {invite && (
                <p className="text-xs text-stone-400 mt-1.5">This invitation is tied to {email}.</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-stone-400"
                placeholder="Min 6 characters"
                required
                minLength={6}
              />
              <p className="text-xs text-stone-400 mt-1.5">Minimum 6 characters</p>
            </div>

            {error && (
              <div className="bg-red-50 text-red-600 text-xs p-3 rounded-xl border border-red-200">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-black text-white py-3.5 rounded-2xl font-semibold text-sm hover:bg-stone-800 transition-colors disabled:opacity-50 flex items-center justify-center space-x-2"
            >
              <span>{loading ? "Creating Account..." : "Create Account"}</span>
              {!loading && <ArrowRight className="w-4 h-4" />}
            </button>
          </form>
        </div>

        {/* Benefits */}
        <div className="mt-8 space-y-2">
          {[
            "Completely free during beta — no limits",
            "Win probability scoring on every match",
            "AI-powered email drafts & win strategies",
            "Beta users save 25% when paid plans launch",
          ].map((b) => (
            <div
              key={b}
              className="flex items-center space-x-2 text-xs text-stone-500"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
              <span>{b}</span>
            </div>
          ))}
        </div>

        <p className="text-center text-sm text-stone-500 mt-6">
          Already have an account?{" "}
          <Link
            href="/login"
            className="text-stone-900 font-semibold hover:underline"
          >
            Sign In
          </Link>
        </p>
        <p className="text-center text-xs text-stone-400 mt-4">
          By creating an account, you agree to our{" "}
          <Link href="/terms" className="underline hover:text-stone-600">Terms of Service</Link>
          {" "}and{" "}
          <Link href="/privacy" className="underline hover:text-stone-600">Privacy Policy</Link>
        </p>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-stone-50"><Loader2 className="w-8 h-8 animate-spin text-stone-400" /></div>}>
      <SignupPageContent />
    </Suspense>
  );
}
