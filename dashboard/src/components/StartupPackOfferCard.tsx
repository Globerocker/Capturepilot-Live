"use client";

import { useEffect, useState } from "react";
import { Sparkles, Clock, Lock, CheckCircle2, ArrowRight, Loader2, Package } from "lucide-react";
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
    // Countdown
    const expiresAt = new Date(new Date(analysisCreatedAt).getTime() + STARTUP_PACK_OFFER_DAYS * 86400_000);
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, []);
    const diff = Math.max(0, expiresAt.getTime() - now);
    const expired = diff === 0;

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

    // Expired
    if (expired) {
        return (
            <div className="rounded-[28px] border border-stone-300 bg-stone-50 overflow-hidden">
                <div className="p-6 sm:p-8 text-center">
                    <Clock className="w-8 h-8 text-stone-400 mx-auto mb-2" />
                    <p className="text-[10px] font-bold uppercase tracking-widest text-stone-500">Offer Expired</p>
                    <h3 className="font-bold text-lg text-stone-700 mt-1">The 50% launch pricing has ended</h3>
                    <p className="text-sm text-stone-500 mt-2 max-w-md mx-auto">
                        The Federal Launch Kit is still available at full price ({fmtPrice(STARTUP_PACK_FULL_PRICE_CENTS)}).
                        Drop us a line and we&apos;ll send a fresh window next time we run the promo.
                    </p>
                    <button
                        type="button"
                        onClick={handleCheckout}
                        disabled={loading}
                        className="mt-4 bg-stone-900 text-white px-5 py-3 rounded-2xl font-bold text-sm hover:bg-black transition-all inline-flex items-center gap-2 disabled:opacity-50"
                    >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />}
                        Buy at full price ({fmtPrice(STARTUP_PACK_FULL_PRICE_CENTS)})
                    </button>
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
                    <div className="flex items-center gap-2 text-xs">
                        <Clock className="w-3.5 h-3.5" />
                        <span className="font-mono font-bold tabular-nums">
                            {days}d {pad(hours)}h {pad(minutes)}m {pad(seconds)}s
                        </span>
                        <span className="text-white/70 hidden sm:inline">left at this price</span>
                    </div>
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
