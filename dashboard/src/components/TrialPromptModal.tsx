"use client";

import { useEffect, useState } from "react";
import { X, Sparkles, CheckCircle2, Loader2 } from "lucide-react";

/**
 * Three-feature in-product trial prompt (W3-4.3).
 *
 * Renders globally inside (dashboard)/layout. On mount it polls
 * /api/user/trial-prompt-state, which counts distinct features the user has
 * touched (Quick Checker run, capability statement saved, match saved,
 * pursuit created). Once the count reaches 3 AND the user hasn't already
 * dismissed the modal AND they're not already on Pro/trial, the modal
 * appears. Dismissal persists to user_profiles.notes.trial_prompt_state so
 * it never re-shows.
 *
 * "Start trial" hits /api/stripe/checkout for the trialing Pro plan and
 * forwards the user into Stripe. "Maybe later" marks the prompt dismissed
 * and closes.
 */

interface State {
    features_used: number;
    should_show: boolean;
    dismissed_at: string | null;
    features?: {
        quick_checker: boolean;
        capability_statement: boolean;
        match_saved: boolean;
        pursuit_created: boolean;
    };
}

interface Props {
    /** Skip the prompt on a list of route prefixes (e.g. ["/onboard"]). */
    skipPrefixes?: string[];
}

export default function TrialPromptModal({ skipPrefixes = ["/onboard", "/billing"] }: Props) {
    const [open, setOpen] = useState(false);
    const [features, setFeatures] = useState<State["features"] | null>(null);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        // Skip on certain routes (onboard, billing — already paying attention).
        if (typeof window !== "undefined") {
            const path = window.location.pathname;
            if (skipPrefixes.some((p) => path.startsWith(p))) return;
        }
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch("/api/user/trial-prompt-state", { cache: "no-store" });
                if (!res.ok) return;
                const data = (await res.json()) as State;
                if (cancelled) return;
                if (data.should_show) {
                    setFeatures(data.features ?? null);
                    setOpen(true);
                    // Record that the modal was shown — useful for analytics
                    // even though the dismissed_at check is what gates re-shows.
                    fetch("/api/user/trial-prompt-state", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ shown: true }),
                    }).catch(() => {});
                }
            } catch {
                /* non-fatal — prompt is purely additive */
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [skipPrefixes]);

    const dismiss = async () => {
        setOpen(false);
        await fetch("/api/user/trial-prompt-state", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ dismissed: true }),
        }).catch(() => {});
    };

    const startTrial = async () => {
        setSubmitting(true);
        try {
            const res = await fetch("/api/stripe/checkout", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ plan: "pro", interval: "monthly", source: "trial_prompt_3_features" }),
            });
            const data = await res.json();
            if (data?.url) {
                // Mark dismissed so the modal doesn't re-appear if Stripe
                // checkout fails and the user lands back in /dashboard.
                await fetch("/api/user/trial-prompt-state", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ dismissed: true }),
                }).catch(() => {});
                window.location.href = data.url;
                return;
            }
        } catch {
            /* fall through */
        } finally {
            setSubmitting(false);
        }
    };

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="trial-prompt-title"
        >
            <div className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl border border-stone-200">
                <button
                    type="button"
                    onClick={dismiss}
                    className="absolute top-3 right-3 p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition"
                    aria-label="Close"
                >
                    <X className="w-4 h-4" />
                </button>
                <div className="p-6">
                    <div className="flex items-center gap-2 mb-3">
                        <div className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-emerald-50 text-emerald-600">
                            <Sparkles className="w-5 h-5" />
                        </div>
                        <span className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                            You're on a roll
                        </span>
                    </div>
                    <h2
                        id="trial-prompt-title"
                        className="text-xl font-bold text-stone-900 leading-tight mb-2"
                    >
                        You've explored three CapturePilot features. Want to see the rest?
                    </h2>
                    <p className="text-sm text-stone-600 mb-4">
                        Pro unlocks unlimited matches, SLED across 48 states, AI proposal drafts,
                        and capability-statement automation. 14 days free, no card needed up front.
                    </p>

                    {features ? (
                        <ul className="space-y-1.5 mb-5 text-sm text-stone-700">
                            <FeatureRow done={features.quick_checker} label="Ran the Quick Checker" />
                            <FeatureRow done={features.capability_statement} label="Saved a capability statement" />
                            <FeatureRow done={features.match_saved} label="Saved a federal match" />
                            <FeatureRow done={features.pursuit_created} label="Started a pursuit" />
                        </ul>
                    ) : null}

                    <div className="flex flex-col gap-2">
                        <button
                            type="button"
                            onClick={startTrial}
                            disabled={submitting}
                            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 transition disabled:opacity-50"
                        >
                            {submitting ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Opening Stripe...
                                </>
                            ) : (
                                <>Start the 14-day Pro trial</>
                            )}
                        </button>
                        <button
                            type="button"
                            onClick={dismiss}
                            className="w-full rounded-lg border border-stone-200 px-4 py-2 text-sm text-stone-700 hover:bg-stone-50 transition"
                        >
                            Maybe later
                        </button>
                    </div>

                    <p className="mt-3 text-[11px] text-stone-400 text-center">
                        No card upfront. Cancel any time from Billing.
                    </p>
                </div>
            </div>
        </div>
    );
}

function FeatureRow({ done, label }: { done: boolean; label: string }) {
    return (
        <li className="flex items-center gap-2">
            <CheckCircle2
                className={`w-4 h-4 ${done ? "text-emerald-600" : "text-stone-300"}`}
            />
            <span className={done ? "text-stone-700" : "text-stone-400 line-through"}>
                {label}
            </span>
        </li>
    );
}
