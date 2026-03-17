"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Zap, ArrowRight, CheckCircle2 } from "lucide-react";
import { createSupabaseClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createSupabaseClient();

  const handleGoogleSignup = async () => {
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
    }
  };

  const handleEmailSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.push("/onboard");
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center space-x-3 mb-10">
          <div className="w-10 h-10 rounded-xl bg-black flex items-center justify-center shadow-lg">
            <Zap className="h-5 w-5 text-white" />
          </div>
          <h1 className="text-2xl font-bold font-typewriter">CapturePilot</h1>
        </div>

        <div className="bg-white rounded-[32px] p-8 border border-stone-200 shadow-sm">
          <h2 className="text-xl font-bold font-typewriter text-center mb-2">
            Start Your Free Trial
          </h2>
          <p className="text-sm text-stone-500 text-center mb-2">
            It&apos;s completely free right now. No credit card required.
          </p>
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 mb-6 text-center">
            <span className="text-xs font-typewriter font-bold text-emerald-700">
              Beta users save 25% on their subscription when we launch paid plans
            </span>
          </div>

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
              <label className="block text-xs font-typewriter font-medium text-stone-500 mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-stone-400"
                placeholder="you@company.com"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-typewriter font-medium text-stone-500 mb-1.5">
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
              <span>Create Account</span>
              <ArrowRight className="w-4 h-4" />
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
      </div>
    </div>
  );
}
