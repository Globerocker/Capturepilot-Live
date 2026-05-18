"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
    CheckCircle2, Lock, Sparkles, Clock, FileText, Search, Scale, Award, Trophy, Mail,
    DollarSign, Video, ArrowRight, Loader2, Star, PlayCircle, ShieldCheck, ClipboardCheck,
    BookOpen, Building2, Zap, Target,
} from "lucide-react";
import clsx from "clsx";
import {
    STARTUP_PACK_ASSETS,
    STARTUP_PACK_SECTIONS,
    STARTUP_PACK_PRICE_CENTS,
    STARTUP_PACK_FULL_PRICE_CENTS,
    PRODUCT_NAME,
    PRODUCT_TAGLINE,
    type AssetSection,
} from "@/lib/startup-pack-assets";

const ICON_MAP: Record<AssetSection["icon"], React.ComponentType<{ className?: string }>> = {
    FileText, Search, Scale, Award, Trophy, Mail, DollarSign, Video, ClipboardCheck, BookOpen, Building2,
};

const TESTIMONIALS = [
    {
        quote: "Used the Sources Sought template on a $1.4M HHS notice four days after I bought the kit. Won the spot on the awarded IDIQ.",
        author: "Marcus T.",
        role: "Founder, regional IT services firm",
    },
    {
        quote: "The SAM.gov walkthrough alone saved me three weeks. I had restarted my registration twice before.",
        author: "Jenna R.",
        role: "8(a) construction subcontractor",
    },
    {
        quote: "Honestly skeptical of $70 'kit' offers, but the PWin calculator made us drop two bids that would've cost us $40k to chase.",
        author: "David K.",
        role: "SDVOSB cybersecurity",
    },
    {
        quote: "The internal best-practice library is gold. This is the stuff our last consultant charged us $4k for.",
        author: "Andrea L.",
        role: "WOSB facilities services",
    },
];

function fmtPrice(cents: number): string { return `$${(cents / 100).toFixed(0)}`; }
function pad(n: number): string { return n < 10 ? `0${n}` : String(n); }

export default function LaunchKitLandingPage() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    // Marketing countdown — 72-hour rolling window from page mount.
    // Specific buyers (those coming from /check) get a 7-day window keyed off
    // their analysis row; this LP is the cold-traffic version so we use a
    // localStorage-backed 72h timer instead.
    const COUNTDOWN_HOURS = 72;
    const [endsAt, setEndsAt] = useState<number>(0);
    const [now, setNow] = useState<number>(0);

    useEffect(() => {
        const KEY = "launchkit_promo_ends_at";
        let saved = 0;
        try { saved = Number(localStorage.getItem(KEY) || "0") || 0; } catch { /* SSR / privacy mode */ }
        const target = saved > Date.now() ? saved : Date.now() + COUNTDOWN_HOURS * 3600_000;
        try { localStorage.setItem(KEY, String(target)); } catch { /* ignore */ }
        setEndsAt(target);
        setNow(Date.now());
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, []);

    const diff = Math.max(0, endsAt - now);
    const expired = endsAt > 0 && diff === 0;
    const totalSeconds = Math.floor(diff / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const handleBuy = async () => {
        setLoading(true);
        setError("");
        try {
            const res = await fetch("/api/startup-pack/checkout", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
            });
            const data = await res.json();
            if (!res.ok || !data.url) throw new Error(data.error || "Checkout failed");
            window.location.href = data.url;
        } catch (e) {
            setError((e as Error).message);
            setLoading(false);
        }
    };

    const savings = STARTUP_PACK_FULL_PRICE_CENTS - STARTUP_PACK_PRICE_CENTS;
    const savingsPct = Math.round((savings / STARTUP_PACK_FULL_PRICE_CENTS) * 100);
    const totalAssets = STARTUP_PACK_ASSETS.length;

    return (
        <div className="min-h-screen bg-stone-50">
            {/* COUNTDOWN BAR — sticky at top, doesn't disappear when scrolling */}
            <div className="sticky top-0 z-50 bg-gradient-to-r from-amber-400 via-amber-300 to-amber-400 border-b-2 border-amber-500 shadow-md">
                <div className="max-w-6xl mx-auto px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap text-amber-950">
                    <div className="flex items-center gap-2 text-xs sm:text-sm font-black">
                        <Clock className="w-4 h-4" />
                        <span className="uppercase tracking-widest">{expired ? "Offer ended" : `${savingsPct}% off ends in`}</span>
                        {!expired && (
                            <span className="font-mono text-base sm:text-lg tabular-nums">
                                {days}d {pad(hours)}h {pad(minutes)}m {pad(seconds)}s
                            </span>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={handleBuy}
                        disabled={loading || expired}
                        className="bg-stone-900 text-amber-100 px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-black transition-all inline-flex items-center gap-1.5 disabled:opacity-60"
                    >
                        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
                        Claim for {fmtPrice(STARTUP_PACK_PRICE_CENTS)}
                    </button>
                </div>
            </div>

            <header className="px-4 sm:px-6 py-4 flex items-center justify-between max-w-6xl mx-auto">
                <Link href="/" className="flex items-center space-x-2">
                    <Image src="/logo.png" alt="CP" width={22} height={22} className="rounded" />
                    <span className="font-bold text-base">CapturePilot</span>
                </Link>
                <Link href="/check" className="text-xs text-stone-500 hover:text-stone-800 inline-flex items-center gap-1">
                    Free Readiness Check <ArrowRight className="w-3 h-3" />
                </Link>
            </header>

            <main className="max-w-5xl mx-auto px-4 pb-20 space-y-12">
                {/* HERO */}
                <section className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-emerald-600 via-emerald-700 to-blue-800 text-white p-8 sm:p-14 shadow-2xl">
                    <div className="inline-flex items-center gap-2 bg-amber-300 text-amber-900 px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-wider mb-5">
                        <Sparkles className="w-3.5 h-3.5" /> Launch offer · {savingsPct}% off · 72-hour window
                    </div>
                    <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-200 mb-2">{PRODUCT_NAME}</p>
                    <h1 className="font-black text-4xl sm:text-5xl lg:text-[3.4rem] leading-[1.05] max-w-3xl">
                        {PRODUCT_TAGLINE}
                    </h1>
                    <p className="text-white/85 text-lg mt-5 max-w-2xl leading-relaxed">
                        {totalAssets} templates, playbooks, checklists, worksheets and outreach scripts that small businesses
                        normally pay {fmtPrice(STARTUP_PACK_FULL_PRICE_CENTS * 5)}+ for. Bundled. Honest.
                        <strong> {fmtPrice(STARTUP_PACK_PRICE_CENTS)} today.</strong>
                    </p>
                    <div className="flex flex-wrap items-baseline gap-3 mt-6">
                        <span className="text-5xl sm:text-6xl font-black">{fmtPrice(STARTUP_PACK_PRICE_CENTS)}</span>
                        <span className="text-2xl text-white/70 line-through">{fmtPrice(STARTUP_PACK_FULL_PRICE_CENTS)}</span>
                        <span className="text-xs font-bold bg-amber-300 text-amber-900 px-2 py-1 rounded-md uppercase tracking-wider">
                            Save {fmtPrice(savings)}
                        </span>
                    </div>
                    <button
                        type="button"
                        onClick={handleBuy}
                        disabled={loading || expired}
                        className="mt-7 w-full sm:w-auto inline-flex items-center gap-2 bg-white text-emerald-700 px-7 py-4 rounded-2xl font-black text-base hover:bg-amber-100 transition-all shadow-xl disabled:opacity-60"
                    >
                        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Lock className="w-5 h-5" />}
                        Unlock the Kit — {fmtPrice(STARTUP_PACK_PRICE_CENTS)}
                    </button>
                    <p className="text-[11px] text-white/65 mt-3">
                        Instant access · Lifetime use · 7-day no-questions refund · Stripe-secured
                    </p>
                    {error && (
                        <p className="text-amber-200 text-sm mt-4 bg-red-900/30 px-3 py-2 rounded-lg max-w-md">{error}</p>
                    )}
                </section>

                {/* VIDEO PLACEHOLDER */}
                <section className="bg-gradient-to-br from-stone-900 to-stone-800 rounded-[28px] overflow-hidden shadow-xl">
                    <div className="relative aspect-video flex items-center justify-center px-6 text-center">
                        <div>
                            <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 flex items-center justify-center mx-auto mb-4 ring-4 ring-emerald-500/10">
                                <PlayCircle className="w-8 h-8 text-emerald-400" />
                            </div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-300">Sales walkthrough · coming soon</p>
                            <h3 className="font-bold text-xl text-white mt-1">A 3-minute tour of the {PRODUCT_NAME}</h3>
                            <p className="text-white/65 text-sm mt-2 max-w-md mx-auto leading-relaxed">
                                The full asset tour drops this week. Until then, scroll down — every template, playbook
                                and worksheet is listed below.
                            </p>
                        </div>
                    </div>
                </section>

                {/* PAIN POINTS */}
                <section>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">Why this kit exists</p>
                    <h2 className="font-black text-3xl text-stone-900 mt-1">Most first-time bidders waste a year before their first contract.</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                        {[
                            { title: "They never finish SAM.gov", body: "Half of first-time registrants give up mid-way. We hand you the exact 32-page walkthrough + pre-flight checklist." },
                            { title: "They chase Solicitations instead of Sources Sought", body: "By the time an RFP is public, the winner is shaped. Our Sources Sought playbook flips that 6–18 months earlier." },
                            { title: "They under-price by 25–40%", body: "Federal pricing is its own discipline. Our PWin calculator + indirect-rate workbook lets you bid like a 10-year prime." },
                        ].map((item, i) => (
                            <div key={i} className="bg-white border border-stone-200 rounded-2xl p-5">
                                <p className="font-bold text-stone-900">{item.title}</p>
                                <p className="text-sm text-stone-500 mt-2 leading-relaxed">{item.body}</p>
                            </div>
                        ))}
                    </div>
                </section>

                {/* LIBRARY SHOWCASE — all 10 categories */}
                <section>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">What&apos;s inside</p>
                    <h2 className="font-black text-3xl text-stone-900 mt-1">{totalAssets} battle-tested assets across {STARTUP_PACK_SECTIONS.length} categories.</h2>
                    <p className="text-stone-500 mt-2 max-w-2xl">
                        Built from our internal consulting toolkit — what we charge $4–8k for in capture engagements. Yours for the price of a tank of gas.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
                        {STARTUP_PACK_SECTIONS.map((section) => {
                            const Icon = ICON_MAP[section.icon] || FileText;
                            const items = STARTUP_PACK_ASSETS.filter(a => a.category === section.category);
                            return (
                                <div key={section.category} className="bg-white border border-stone-200 rounded-2xl p-5 hover:border-emerald-300 hover:shadow-md transition-all">
                                    <div className="flex items-start gap-3 mb-3">
                                        <div className="w-11 h-11 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0">
                                            <Icon className="w-5 h-5" />
                                        </div>
                                        <div className="min-w-0">
                                            <div className="flex items-baseline gap-2 flex-wrap">
                                                <p className="font-bold text-stone-900">{section.label}</p>
                                                <span className="text-[10px] font-bold bg-stone-100 text-stone-600 border border-stone-200 px-2 py-0.5 rounded">
                                                    {items.length} {items.length === 1 ? "asset" : "assets"}
                                                </span>
                                            </div>
                                            <p className="text-xs text-stone-500 leading-snug mt-0.5">{section.description}</p>
                                        </div>
                                    </div>
                                    <ul className="space-y-1.5 mt-3 pl-1">
                                        {items.slice(0, 5).map(a => (
                                            <li key={a.id} className="text-xs text-stone-600 flex items-start gap-2">
                                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />
                                                <span className="leading-snug">
                                                    <span className="font-semibold text-stone-800">{a.title}</span>
                                                    <span className="text-stone-400"> · {a.format}{a.sizeHint ? `, ${a.sizeHint}` : ""}</span>
                                                </span>
                                            </li>
                                        ))}
                                        {items.length > 5 && (
                                            <li className="text-[11px] text-stone-400 italic pl-6">+ {items.length - 5} more in this category…</li>
                                        )}
                                    </ul>
                                </div>
                            );
                        })}
                    </div>
                </section>

                {/* TESTIMONIALS */}
                <section>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">What founders say</p>
                    <h2 className="font-black text-3xl text-stone-900 mt-1">Built for first-time bidders by founders who&apos;ve been there.</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                        {TESTIMONIALS.map(t => (
                            <div key={t.author} className="bg-white border border-stone-200 rounded-2xl p-5">
                                <div className="flex gap-0.5 mb-3">
                                    {Array.from({ length: 5 }).map((_, j) => (
                                        <Star key={j} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                                    ))}
                                </div>
                                <p className="text-sm text-stone-700 leading-relaxed">&ldquo;{t.quote}&rdquo;</p>
                                <p className="text-xs font-bold text-stone-900 mt-4">{t.author}</p>
                                <p className="text-[11px] text-stone-500">{t.role}</p>
                            </div>
                        ))}
                    </div>
                </section>

                {/* GUARANTEE */}
                <section className="bg-white border border-stone-200 rounded-[28px] p-6 sm:p-8 shadow-sm">
                    <div className="flex flex-col sm:flex-row items-start gap-5">
                        <div className="w-14 h-14 rounded-2xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
                            <ShieldCheck className="w-7 h-7 text-emerald-600" />
                        </div>
                        <div>
                            <h3 className="font-bold text-lg text-stone-900">7-day no-questions refund</h3>
                            <p className="text-sm text-stone-600 mt-2 leading-relaxed max-w-2xl">
                                Open everything. Read the playbooks. Try the templates. If by day seven you don&apos;t think the {PRODUCT_NAME} saved you weeks of
                                research and at least one bad bid, reply to the receipt email and we&apos;ll refund the {fmtPrice(STARTUP_PACK_PRICE_CENTS)}.
                                No forms, no &ldquo;why are you leaving&rdquo; survey.
                            </p>
                        </div>
                    </div>
                </section>

                {/* FINAL CTA */}
                <section className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-stone-900 to-stone-800 text-white p-8 sm:p-12 shadow-xl text-center">
                    {!expired && (
                        <div className="inline-flex items-center gap-2 bg-amber-300 text-amber-900 px-4 py-2 rounded-full text-sm font-black uppercase tracking-wider mb-5">
                            <Clock className="w-4 h-4" />
                            <span className="font-mono tabular-nums">{days}d {pad(hours)}h {pad(minutes)}m {pad(seconds)}s</span>
                            <span>left</span>
                        </div>
                    )}
                    <h2 className="font-black text-3xl sm:text-4xl">Stop reading. Start bidding.</h2>
                    <p className="text-white/75 text-base mt-3 max-w-xl mx-auto">
                        {fmtPrice(STARTUP_PACK_PRICE_CENTS)} once. Lifetime access. Refund-able with a single email for 7 days.
                    </p>
                    <button
                        type="button"
                        onClick={handleBuy}
                        disabled={loading || expired}
                        className="mt-6 inline-flex items-center gap-2 bg-gradient-to-r from-emerald-400 to-amber-300 text-emerald-900 px-7 py-4 rounded-2xl font-black text-base hover:opacity-95 transition-all shadow-xl disabled:opacity-60"
                    >
                        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5" />}
                        Buy the Kit — {fmtPrice(STARTUP_PACK_PRICE_CENTS)}
                    </button>
                    <p className="text-[10px] text-white/55 mt-3">
                        Secure Stripe checkout · Apple Pay, Google Pay &amp; cards accepted
                    </p>
                </section>
            </main>

            <footer className="border-t border-stone-200 py-6 text-center text-[11px] text-stone-400">
                © {new Date().getFullYear()} CapturePilot · <Link href="/terms" className="underline">Terms</Link> · <Link href="/privacy" className="underline">Privacy</Link>
            </footer>
        </div>
    );
}
