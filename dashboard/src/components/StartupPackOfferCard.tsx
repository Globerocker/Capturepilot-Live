"use client";

import { useEffect, useState } from "react";
import { Sparkles, Clock, Lock, CheckCircle2, ArrowRight, Loader2 } from "lucide-react";
import {
    STARTUP_PACK_ASSETS,
    STARTUP_PACK_SECTIONS,
    STARTUP_PACK_PRICE_CENTS,
    STARTUP_PACK_FULL_PRICE_CENTS,
    STARTUP_PACK_OFFER_DAYS,
    PRODUCT_NAME,
} from "@/lib/startup-pack-assets";

interface Props {
    analysisId: string;
    /** ISO timestamp the analysis was created — countdown starts here. */
    analysisCreatedAt: string;
    /** Already-known buyer email (from LeadMagnetForm). Pre-fills Stripe Checkout. */
    leadEmail?: string;
    /** Already purchased — show downloads CTA instead of buy button. */
    alreadyOwned?: boolean;
    /** URL to navigate to when alreadyOwned is true. */
    downloadUrl?: string;
}

function pad(n: number): string {
    return n < 10 ? `0${n}` : String(n);
}

function fmtPrice(cents: number): string {
    return `$${(cents / 100).toFixed(0)}`;
}

export default function StartupPackOfferCard({ analysisId, analysisCreatedAt, leadEmail, alreadyOwned, downloadUrl }: Props) {
    // Countdown — localStorage-backed per-analysis 7-day window. Starts on first
    // page view, NOT on `analysisCreatedAt` (so the offer always feels fresh
    // even if the lead opens their email a week later). If the localStorage
    // window has somehow expired we simply hide the counter and keep the
    // $70 offer visible — never show an "expired" state.
    const [endsAt, setEndsAt] = useState<number>(0);
    const [now, setNow] = useState<number>(0);

    useEffect(() => {
        const key = `launchkit_offer_ends_${analysisId}`;
        let target = 0;
        try {
            const saved = Number(localStorage.getItem(key) || "0") || 0;
            if (saved > Date.now()) {
                target = saved;
            } else {
                target = Date.now() + STARTUP_PACK_OFFER_DAYS * 86400_000;
                localStorage.setItem(key, String(target));
            }
        } catch {
            target = Date.now() + STARTUP_PACK_OFFER_DAYS * 86400_000;
        }
        setEndsAt(target);
        setNow(Date.now());
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
        // Intentionally use analysisCreatedAt as a non-readonly hint to keep
        // multiple-analysis hosts safe; the value is otherwise unused.
    }, [analysisId, analysisCreatedAt]);

    const diff = endsAt > 0 ? Math.max(0, endsAt - now) : 0;
    const showCountdown = endsAt > 0 && diff > 0;

    const totalSeconds = Math.floor(diff / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const handleCheckout = async () => {
        setLoading(true);
        setError("");
        try {
            const res = await fetch("/api/startup-pack/checkout", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ analysis_id: analysisId, email: leadEmail }),
            });
            const data = await res.json();
            if (!res.ok || !data.url) throw new Error(data.error || "Could not start checkout");
            window.location.href = data.url;
        } catch (e) {
            setError((e as Error).message);
            setLoading(false);
        }
    };

    // Already bought — render confirmation card with link to downloads
    if (alreadyOwned) {
        return (
            <div className="rounded-[28px] border-2 border-emerald-300 bg-gradient-to-br from-emerald-50 via-white to-emerald-50/40 shadow-md overflow-hidden">
                <div className="p-6 sm:p-8 flex flex-col sm:flex-row items-center gap-5">
                    <div className="w-16 h-16 rounded-2xl bg-emerald-500 text-white flex items-center justify-center flex-shrink-0">
                        <CheckCircle2 className="w-8 h-8" />
                    </div>
                    <div className="flex-1 text-center sm:text-left">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">Already Yours</p>
                        <h3 className="font-black text-lg sm:text-xl text-emerald-900 mt-0.5">Federal Launch Kit — Unlocked</h3>
                        <p className="text-sm text-emerald-800/80 mt-0.5">All templates, playbooks &amp; worksheets are waiting in your download library.</p>
                    </div>
                    {downloadUrl && (
                        <a
                            href={downloadUrl}
                            className="bg-emerald-600 text-white px-5 py-3 rounded-2xl font-bold text-sm hover:bg-emerald-700 transition-all inline-flex items-center gap-2 shadow-md"
                        >
                            Open Downloads <ArrowRight className="w-4 h-4" />
                        </a>
                    )}
                </div>
            </div>
        );
    }

    const savings = STARTUP_PACK_FULL_PRICE_CENTS - STARTUP_PACK_PRICE_CENTS;
    const savingsPct = Math.round((savings / STARTUP_PACK_FULL_PRICE_CENTS) * 100);

    // Highlight 6 most "Most Popular" / first assets
    const previewAssets = STARTUP_PACK_ASSETS.slice(0, 8);

    return (
        <div className="rounded-[28px] border-2 border-emerald-400 shadow-xl overflow-hidden relative">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500 via-emerald-600 to-blue-700 opacity-95" />
            <div className="relative text-white">
                {/* Header / urgency bar */}
                <div className="bg-black/20 border-b border-white/10 px-5 sm:px-8 py-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-amber-300" />
                        <p className="text-xs font-bold uppercase tracking-widest">Launch Offer · {savingsPct}% off</p>
                    </div>
                    {showCountdown && (
                        <div className="flex items-center gap-2 text-xs">
                            <Clock className="w-3.5 h-3.5" />
                            <span className="font-mono font-bold tabular-nums">
                                {days}d {pad(hours)}h {pad(minutes)}m {pad(seconds)}s
                            </span>
                            <span className="text-white/70 hidden sm:inline">left at this price</span>
                        </div>
                    )}
                </div>

                {/* Main pitch */}
                <div className="p-6 sm:p-10">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-amber-300 mb-2">
                                Unlock with your free check
                            </p>
                            <h3 className="font-black text-2xl sm:text-3xl leading-tight">
                                The {PRODUCT_NAME}
                            </h3>
                            <p className="text-white/85 text-sm sm:text-base mt-3 leading-relaxed">
                                SAM.gov registration walkthroughs, capability statement templates, playbooks for every
                                solicitation type, certification worksheets, our internal best-practice library and a
                                30-min founder call — bundled. Everything you need to land your first federal contract.
                            </p>

                            <div className="flex items-baseline gap-3 mt-6">
                                <span className="text-4xl sm:text-5xl font-black">{fmtPrice(STARTUP_PACK_PRICE_CENTS)}</span>
                                <span className="text-lg text-white/70 line-through">{fmtPrice(STARTUP_PACK_FULL_PRICE_CENTS)}</span>
                                <span className="text-xs font-bold bg-amber-300 text-amber-900 px-2 py-1 rounded-md uppercase tracking-wider">
                                    Save {fmtPrice(savings)}
                                </span>
                            </div>

                            <button
                                type="button"
                                onClick={handleCheckout}
                                disabled={loading}
                                className="mt-6 w-full sm:w-auto bg-white text-emerald-700 px-6 py-4 rounded-2xl font-bold text-base hover:bg-amber-100 transition-all inline-flex items-center justify-center gap-2 shadow-lg disabled:opacity-60"
                            >
                                {loading ? (
                                    <><Loader2 className="w-5 h-5 animate-spin" /> Opening checkout…</>
                                ) : (
                                    <><Lock className="w-4 h-4" /> Unlock the Pack — {fmtPrice(STARTUP_PACK_PRICE_CENTS)}</>
                                )}
                            </button>
                            {error && (
                                <p className="text-amber-200 text-xs mt-3 bg-red-900/30 px-3 py-2 rounded-lg">{error}</p>
                            )}
                            <p className="text-[10px] text-white/70 mt-3">
                                Instant access · 7-day no-questions refund · Pay once, keep forever
                            </p>
                        </div>

                        {/* Asset preview list */}
                        <div className="bg-white/10 backdrop-blur-sm border border-white/15 rounded-2xl p-5">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-white/80 mb-3">
                                {STARTUP_PACK_ASSETS.length} assets across {STARTUP_PACK_SECTIONS.length} categories
                            </p>
                            <ul className="space-y-2.5">
                                {previewAssets.map(a => (
                                    <li key={a.id} className="flex items-start gap-2.5 text-sm">
                                        <CheckCircle2 className="w-4 h-4 text-amber-300 flex-shrink-0 mt-0.5" />
                                        <div className="min-w-0 flex-1">
                                            <p className="font-semibold leading-snug">{a.title}</p>
                                            <p className="text-[11px] text-white/60">{a.format}{a.sizeHint ? ` · ${a.sizeHint}` : ""}</p>
                                        </div>
                                    </li>
                                ))}
                                {STARTUP_PACK_ASSETS.length > previewAssets.length && (
                                    <li className="text-xs text-white/70 italic pl-6">
                                        + {STARTUP_PACK_ASSETS.length - previewAssets.length} more bonus assets…
                                    </li>
                                )}
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
