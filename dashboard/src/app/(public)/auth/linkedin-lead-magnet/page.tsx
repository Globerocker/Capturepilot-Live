"use client";

/**
 * LinkedIn lead-magnet auth shim.
 *
 * Entry point for the "Continue with LinkedIn" buttons on
 * https://www.capturepilot.com/downloads/*. The website (separate Next.js
 * app on a different origin) cannot run Supabase OAuth itself — cookies have
 * to land on app.capturepilot.com so the callback can exchange the PKCE code
 * server-side.
 *
 * Flow:
 *   1. Marketing site links here with ?magnet=field-manual&return_to=<url>.
 *   2. We persist (magnet, return_to) in sessionStorage so the callback can
 *      pick them up after the redirect dance.
 *   3. Kick off signInWithOAuth({ provider: 'linkedin_oidc' }) with
 *      redirectTo set to /auth/callback?intent=lead_magnet&magnet=...
 *   4. /auth/callback exchanges the code, fires
 *      POST /api/lead-magnet/deliver with the LinkedIn payload, and 302s
 *      back to the marketing site's thank-you URL.
 */

import { useEffect, useRef, useState } from "react";
import { Loader2, Linkedin } from "lucide-react";
import { createSupabaseClient } from "@/lib/supabase/client";

const SESSION_KEY = "cp_lead_magnet_oauth";

function readParams(): { magnet: string; returnTo: string } {
    if (typeof window === "undefined") return { magnet: "", returnTo: "" };
    const sp = new URLSearchParams(window.location.search);
    return {
        magnet: (sp.get("magnet") || "").trim(),
        returnTo: (sp.get("return_to") || "").trim(),
    };
}

export default function LinkedInLeadMagnetPage() {
    const [error, setError] = useState<string>("");
    const [magnet, setMagnet] = useState<string>("");
    const startedRef = useRef(false);

    useEffect(() => {
        if (startedRef.current) return;
        startedRef.current = true;

        const { magnet, returnTo } = readParams();
        setMagnet(magnet);

        if (!magnet) {
            setError("Missing magnet key — go back and try the download link again.");
            return;
        }

        // Stash the magnet + return_to so the callback can read them after
        // OAuth round-trips us through linkedin.com.
        try {
            window.sessionStorage.setItem(
                SESSION_KEY,
                JSON.stringify({ magnet, return_to: returnTo, ts: Date.now() }),
            );
        } catch {
            // Private mode / disabled storage — non-fatal, callback has
            // query-string fallback below.
        }

        (async () => {
            try {
                const sb = createSupabaseClient();
                // The callback infers the lead-magnet flow from
                // intent=lead_magnet + the magnet key on the URL. We pass
                // return_to too so the callback doesn't have to rely on
                // sessionStorage (which is gone if cookies were rotated).
                const cbUrl = new URL(`${window.location.origin}/auth/callback`);
                cbUrl.searchParams.set("intent", "lead_magnet");
                cbUrl.searchParams.set("magnet", magnet);
                if (returnTo) cbUrl.searchParams.set("return_to", returnTo);

                const { error: oauthError } = await sb.auth.signInWithOAuth({
                    provider: "linkedin_oidc",
                    options: {
                        redirectTo: cbUrl.toString(),
                        scopes: "openid profile email",
                    },
                });
                if (oauthError) {
                    setError(oauthError.message || "LinkedIn sign-in failed");
                }
                // Success: browser navigates away to linkedin.com.
            } catch (e) {
                setError((e as Error).message || "LinkedIn sign-in failed");
            }
        })();
    }, []);

    return (
        <main className="min-h-screen bg-stone-50 flex items-center justify-center px-4">
            <div className="max-w-md w-full bg-white border border-stone-200 rounded-2xl p-8 text-center shadow-sm">
                <div className="w-14 h-14 rounded-2xl bg-[#0A66C2]/10 text-[#0A66C2] flex items-center justify-center mx-auto mb-5">
                    <Linkedin className="w-7 h-7" />
                </div>
                <h1 className="font-black text-2xl text-stone-900">
                    Redirecting to LinkedIn{magnet ? "…" : ""}
                </h1>
                <p className="text-stone-600 text-sm mt-3 leading-relaxed">
                    Sign in with LinkedIn and we&rsquo;ll email the download instantly &mdash; no
                    forms, no typing.
                </p>
                {!error && (
                    <div className="mt-6 inline-flex items-center gap-2 text-stone-500 text-sm">
                        <Loader2 className="w-4 h-4 animate-spin" /> Opening LinkedIn…
                    </div>
                )}
                {error && (
                    <div className="mt-6 bg-rose-50 border border-rose-200 rounded-xl p-4 text-left">
                        <p className="text-sm font-bold text-rose-800">Could not start LinkedIn sign-in</p>
                        <p className="text-xs text-rose-700 mt-1">{error}</p>
                    </div>
                )}
            </div>
        </main>
    );
}
