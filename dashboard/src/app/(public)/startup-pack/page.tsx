"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
    CheckCircle2, Lock, Clock, FileText, Search, Scale, Award, Trophy, Mail,
    DollarSign, Video, ArrowRight, Loader2, Star, ShieldCheck, ClipboardCheck,
    BookOpen, Building2,
} from "lucide-react";
import {
    STARTUP_PACK_ASSETS,
    STARTUP_PACK_SECTIONS,
    STARTUP_PACK_PRICE_CENTS,
    STARTUP_PACK_FULL_PRICE_CENTS,
    PRODUCT_NAME,
    type AssetSection,
} from "@/lib/startup-pack-assets";

const ICON_MAP: Record<AssetSection["icon"], React.ComponentType<{ className?: string }>> = {
    FileText, Search, Scale, Award, Trophy, Mail, DollarSign, Video, ClipboardCheck, BookOpen, Building2,
};

// Folder-level metadata not yet in startup-pack-assets (format mix + highlight badges)
const FOLDER_META: Record<string, { formats: string[]; highlight?: string }> = {
    sam_gov: { formats: ["PDF", "XLSX"] },
    capability_statement: { formats: ["DOCX", "PDF"] },
    solicitation_playbooks: { formats: ["PDF"], highlight: "Highest ROI" },
    bid_no_bid: { formats: ["XLSX"] },
    certifications: { formats: ["XLSX", "PDF"] },
    past_performance: { formats: ["DOCX", "PDF"] },
    outreach: { formats: ["PDF"] },
    pricing: { formats: ["XLSX", "PDF"] },
    best_practices: { formats: ["XLSX", "PDF", "DOCX"] },
    onboarding: { formats: ["PDF", "Calendly"], highlight: "Free with kit" },
};

const FORMAT_BREAKDOWN = [
    { label: "PDFs", count: 31, color: "bg-emerald-100 text-emerald-800" },
    { label: "Spreadsheets", count: 15, color: "bg-blue-100 text-blue-800" },
    { label: "Word templates", count: 12, color: "bg-amber-100 text-amber-800" },
    { label: "Calendly / link", count: 2, color: "bg-stone-100 text-stone-700" },
];

const TOTAL_FILES = 60;

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

    return (
        <div className="min-h-screen bg-stone-50">
            {/* COUNTDOWN BAR */}
            <div className="sticky top-0 z-50 bg-gradient-to-r from-amber-400 via-amber-300 to-amber-400 border-b-2 border-amber-500 shadow-md">
                <div className="max-w-6xl mx-auto px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap text-amber-950">
                    <div className="flex items-center gap-2 text-xs sm:text-sm font-black">
                        <Clock className="w-4 h-4" />
                        <span className="uppercase tracking-widest">
                            {expired ? "Offer ended" : `${savingsPct}% off ends in`}
                        </span>
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
                    <Image src="/logo.png" alt="CapturePilot" width={22} height={22} className="rounded" />
                    <span className="font-bold text-base">CapturePilot</span>
                </Link>
                <Link href="/check" className="text-xs text-stone-500 hover:text-stone-800 inline-flex items-center gap-1">
                    Free Readiness Check <ArrowRight className="w-3 h-3" />
                </Link>
            </header>

            <main className="max-w-5xl mx-auto px-4 pb-24 space-y-16">

                {/* ── HERO ──────────────────────────────────────────────────── */}
                <section className="grid lg:grid-cols-2 gap-8 items-center pt-4">
                    {/* Left: copy */}
                    <div>
                        <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-600 mb-3">
                            Federal Launch Kit
                        </p>
                        <h1 className="font-black text-4xl sm:text-5xl lg:text-[3.2rem] leading-[1.06] text-stone-900">
                            60 files.<br />
                            11 categories.<br />
                            <span className="text-emerald-600">Built by people<br />who&apos;ve done this.</span>
                        </h1>
                        <p className="text-stone-600 text-lg mt-5 leading-relaxed max-w-lg">
                            Every template, playbook, checklist, and worksheet a small business
                            needs to get registered, pick the right bids, price them correctly, and
                            build a relationship with the contracting officer before the RFP drops.
                        </p>

                        {/* Credibility line — the brand as a small mark, not a wordmark. */}
                        <div className="flex items-center gap-2.5 mt-4">
                            <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-stone-900 text-white text-xs font-black flex-shrink-0">A</span>
                            <p className="text-sm text-stone-500 leading-snug">
                                <span className="font-bold text-stone-700">Three years of federal capture at Americurial</span>, packaged into one kit.
                            </p>
                        </div>

                        {/* Format pills */}
                        <div className="flex flex-wrap gap-2 mt-5">
                            {FORMAT_BREAKDOWN.map((f) => (
                                <span
                                    key={f.label}
                                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${f.color}`}
                                >
                                    <span className="text-sm font-black">{f.count}</span>
                                    {f.label}
                                </span>
                            ))}
                        </div>

                        {/* Price + CTA */}
                        <div className="flex flex-wrap items-baseline gap-3 mt-6">
                            <span className="text-5xl font-black text-stone-900">
                                {fmtPrice(STARTUP_PACK_PRICE_CENTS)}
                            </span>
                            <span className="text-xl text-stone-400 line-through">
                                {fmtPrice(STARTUP_PACK_FULL_PRICE_CENTS)}
                            </span>
                            <span className="text-xs font-bold bg-amber-300 text-amber-900 px-2 py-1 rounded-md uppercase tracking-wider">
                                Save {fmtPrice(savings)}
                            </span>
                        </div>
                        <button
                            type="button"
                            onClick={handleBuy}
                            disabled={loading || expired}
                            className="mt-5 w-full sm:w-auto inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-7 py-4 rounded-2xl font-black text-base transition-all shadow-lg disabled:opacity-60"
                        >
                            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Lock className="w-5 h-5" />}
                            Get the Kit — {fmtPrice(STARTUP_PACK_PRICE_CENTS)}
                        </button>
                        <p className="text-[11px] text-stone-400 mt-2.5">
                            Instant access · Lifetime use · 7-day refund · Stripe-secured
                        </p>
                        {error && (
                            <p className="text-red-600 text-sm mt-3 bg-red-50 border border-red-200 px-3 py-2 rounded-lg max-w-md">
                                {error}
                            </p>
                        )}
                    </div>

                    {/* Right: hero graphic */}
                    <div className="relative">
                        <div className="absolute -inset-4 bg-emerald-600/8 rounded-[40px] blur-2xl" />
                        <Image
                            src="/flk-hero-wingap.png"
                            alt="The Government Contract Win Gap — timing diagram showing the 18-month Winners' Window before an RFP drops"
                            width={600}
                            height={600}
                            priority
                            className="relative rounded-3xl shadow-2xl w-full"
                        />
                    </div>
                </section>

                {/* ── TRUST STRIP ───────────────────────────────────────────── */}
                <div className="border-y border-stone-200 py-5">
                    <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-xs text-stone-500 text-center">
                        <span className="font-semibold text-stone-700">60 files across 10 categories</span>
                        <span>·</span>
                        <span>Sources through to debrief</span>
                        <span>·</span>
                        <span>Instant download on purchase</span>
                        <span>·</span>
                        <span>7-day refund with a single email</span>
                    </div>
                </div>

                {/* ── WHY THIS EXISTS ───────────────────────────────────────── */}
                <section>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">Why this exists</p>
                    <h2 className="font-black text-3xl text-stone-900 mt-1 max-w-2xl">
                        Most first-time federal bidders waste a year before they win anything.
                    </h2>
                    <p className="text-stone-500 mt-3 max-w-2xl">
                        It&apos;s not because they&apos;re not good at what they do. It&apos;s usually one of three things.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-7">
                        {[
                            {
                                title: "They never finish SAM.gov",
                                body: "Registration is genuinely confusing — UEI process, notarized letter requirements, unexpected wait times. About half of first-time registrants give up partway through. Folder 01 is a 32-page annotated walkthrough of every screen.",
                            },
                            {
                                title: "They show up at the RFP and wonder why they lose",
                                body: "By the time an RFP is posted, the incumbent usually knows the agency, the KO knows the incumbent, and everyone else is bidding cold. The Sources Sought playbook shows you how to start that relationship 12 to 18 months earlier.",
                            },
                            {
                                title: "They price by feel and hope for the best",
                                body: "Federal pricing is its own discipline — wrap rates, indirect costs, G&A, price-to-win banding. Guessing low doesn't always win; sometimes it signals you don't understand the work. Folder 08 has the formulas.",
                            },
                        ].map((item, i) => (
                            <div key={i} className="bg-white border border-stone-200 rounded-2xl p-5">
                                <p className="font-bold text-stone-900 text-sm">{item.title}</p>
                                <p className="text-sm text-stone-500 mt-2 leading-relaxed">{item.body}</p>
                            </div>
                        ))}
                    </div>
                </section>

                {/* ── WIN RATE GRAPHIC ──────────────────────────────────────── */}
                <section className="grid lg:grid-cols-5 gap-8 items-center">
                    <div className="lg:col-span-2">
                        <Image
                            src="/flk-winrate-wingap.png"
                            alt="Win rate comparison chart: first-time bidder 3%, under 10 years in federal market 20%, experienced small contractor 30%"
                            width={600}
                            height={600}
                            className="rounded-3xl shadow-xl w-full"
                        />
                    </div>
                    <div className="lg:col-span-3">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 mb-3">
                            The qualification gap
                        </p>
                        <h2 className="font-black text-3xl text-stone-900 leading-tight">
                            First-time bidders win about 3% of the contracts they chase.
                        </h2>
                        <p className="text-stone-500 mt-4 leading-relaxed">
                            That&apos;s not a motivation problem. It&apos;s a preparation problem. Most new entrants show up at
                            solicitations they were never going to win, without the relationships or the positioning that
                            experienced firms built 12 months before the RFP posted.
                        </p>
                        <p className="text-stone-500 mt-3 leading-relaxed">
                            The firms with 30% win rates don&apos;t bid more. They bid less — on the right opportunities,
                            after doing the capture work. The Bid/No-Bid toolkit and the Sources Sought playbook are the
                            two pieces of this kit that change that equation fastest.
                        </p>
                        <button
                            type="button"
                            onClick={handleBuy}
                            disabled={loading || expired}
                            className="mt-6 inline-flex items-center gap-2 bg-stone-900 hover:bg-black text-white px-6 py-3.5 rounded-xl font-bold text-sm transition-all disabled:opacity-60"
                        >
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                            Get the Kit — {fmtPrice(STARTUP_PACK_PRICE_CENTS)}
                        </button>
                    </div>
                </section>

                {/* ── WHAT'S INSIDE ─────────────────────────────────────────── */}
                <section>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">What&apos;s inside</p>
                    <h2 className="font-black text-3xl text-stone-900 mt-1">
                        {TOTAL_FILES} files. {STARTUP_PACK_SECTIONS.length} folders.
                    </h2>
                    <p className="text-stone-500 mt-2 max-w-2xl">
                        Built from our internal consulting toolkit. The Master Playbook alone is 40+ pages.
                    </p>

                    {/* Format breakdown */}
                    <div className="flex flex-wrap gap-2 mt-4">
                        {FORMAT_BREAKDOWN.map((f) => (
                            <span
                                key={f.label}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${f.color}`}
                            >
                                <span className="text-sm font-black">{f.count}</span>
                                {f.label}
                            </span>
                        ))}
                    </div>

                    {/* Folder grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
                        {STARTUP_PACK_SECTIONS.map((section, idx) => {
                            const Icon = ICON_MAP[section.icon] || FileText;
                            const items = STARTUP_PACK_ASSETS.filter(a => a.category === section.category);
                            const meta = FOLDER_META[section.category] ?? { formats: [] };
                            const folderNum = String(idx + 1).padStart(2, "0");
                            return (
                                <div
                                    key={section.category}
                                    className="bg-white border border-stone-200 rounded-2xl p-5 hover:border-emerald-300 hover:shadow-md transition-all"
                                >
                                    <div className="flex items-start gap-3">
                                        <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center flex-shrink-0 border border-emerald-100">
                                            <Icon className="w-5 h-5" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-start justify-between gap-2 flex-wrap">
                                                <div>
                                                    <span className="text-[10px] font-bold text-stone-400 tabular-nums">{folderNum}</span>
                                                    <p className="font-bold text-stone-900 text-sm leading-snug">{section.label}</p>
                                                </div>
                                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                                    {meta.highlight && (
                                                        <span className="text-[9px] font-black bg-emerald-600 text-white px-2 py-0.5 rounded uppercase tracking-wider">
                                                            {meta.highlight}
                                                        </span>
                                                    )}
                                                    <span className="text-[10px] font-bold bg-stone-100 text-stone-600 border border-stone-200 px-2 py-0.5 rounded">
                                                        {items.length} files
                                                    </span>
                                                </div>
                                            </div>
                                            <p className="text-xs text-stone-500 leading-snug mt-1.5">{section.description}</p>
                                            <div className="flex gap-1 mt-2">
                                                {meta.formats.map((fmt) => (
                                                    <span key={fmt} className="text-[9px] font-bold bg-stone-100 text-stone-500 px-1.5 py-0.5 rounded">
                                                        {fmt}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                    {/* Item list — first 4 */}
                                    <ul className="space-y-1.5 mt-3 pl-1">
                                        {items.slice(0, 4).map(a => (
                                            <li key={a.id} className="text-xs text-stone-600 flex items-start gap-2">
                                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />
                                                <span className="leading-snug">
                                                    <span className="font-semibold text-stone-800">{a.title}</span>
                                                    <span className="text-stone-400"> · {a.format}{a.sizeHint ? `, ${a.sizeHint}` : ""}</span>
                                                </span>
                                            </li>
                                        ))}
                                        {items.length > 4 && (
                                            <li className="text-[11px] text-stone-400 italic pl-6">
                                                + {items.length - 4} more in this folder…
                                            </li>
                                        )}
                                    </ul>
                                </div>
                            );
                        })}
                    </div>

                    {/* Master Playbook callout */}
                    <div className="mt-6 bg-gradient-to-r from-emerald-50 to-stone-50 border border-emerald-200 rounded-2xl p-5 flex items-start gap-4">
                        <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center flex-shrink-0">
                            <BookOpen className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <p className="font-bold text-stone-900 text-sm">
                                Also included: Navigation Guide + Master Field Manual
                            </p>
                            <p className="text-xs text-stone-500 mt-1 leading-relaxed">
                                The Navigation Guide maps every file to the stage of your capture process.
                                The Master Field Manual is 40+ pages on the full government contracting lifecycle
                                — registered entity through awarded contract.
                            </p>
                        </div>
                    </div>
                </section>

                {/* ── TESTIMONIALS ──────────────────────────────────────────── */}
                <section>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">What customers say</p>
                    <h2 className="font-black text-3xl text-stone-900 mt-1">People who&apos;ve used it.</h2>
                    <p className="text-stone-500 mt-2 text-sm">These are real quotes. We didn&apos;t write them.</p>
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

                {/* ── GUARANTEE ─────────────────────────────────────────────── */}
                <section className="bg-white border border-stone-200 rounded-[28px] p-6 sm:p-8 shadow-sm">
                    <div className="flex flex-col sm:flex-row items-start gap-5">
                        <div className="w-14 h-14 rounded-2xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
                            <ShieldCheck className="w-7 h-7 text-emerald-600" />
                        </div>
                        <div>
                            <h3 className="font-bold text-lg text-stone-900">7-day refund, no questions</h3>
                            <p className="text-sm text-stone-600 mt-2 leading-relaxed max-w-2xl">
                                Open everything. Try the templates. If by day seven you don&apos;t think the {PRODUCT_NAME} saved
                                you weeks of research and at least one bad bid, reply to the receipt email and we&apos;ll refund
                                the {fmtPrice(STARTUP_PACK_PRICE_CENTS)}. No form, no survey, no runaround.
                            </p>
                        </div>
                    </div>
                </section>

                {/* ── FINAL CTA ─────────────────────────────────────────────── */}
                <section className="relative overflow-hidden rounded-[32px] bg-stone-900 text-white p-8 sm:p-12 shadow-xl">
                    <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-600/15 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
                    <div className="relative">
                        {!expired && (
                            <div className="inline-flex items-center gap-2 bg-amber-300 text-amber-900 px-4 py-2 rounded-full text-sm font-black uppercase tracking-wider mb-6">
                                <Clock className="w-4 h-4" />
                                <span className="font-mono tabular-nums">{days}d {pad(hours)}h {pad(minutes)}m {pad(seconds)}s</span>
                                <span>left at this price</span>
                            </div>
                        )}
                        <div className="max-w-2xl">
                            <h2 className="font-black text-3xl sm:text-4xl">
                                You&apos;ve read enough. The kit either fits your situation or it doesn&apos;t.
                            </h2>
                            <p className="text-white/70 text-base mt-4 leading-relaxed">
                                {fmtPrice(STARTUP_PACK_PRICE_CENTS)} once. Instant download. Seven days to decide if
                                it was worth it. If not, one email and you get it back.
                            </p>
                            <div className="flex flex-wrap items-center gap-4 mt-7">
                                <button
                                    type="button"
                                    onClick={handleBuy}
                                    disabled={loading || expired}
                                    className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-white px-7 py-4 rounded-2xl font-black text-base transition-all shadow-xl disabled:opacity-60"
                                >
                                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Lock className="w-5 h-5" />}
                                    Buy the Kit — {fmtPrice(STARTUP_PACK_PRICE_CENTS)}
                                </button>
                                <Link
                                    href="/check"
                                    className="text-white/60 hover:text-white text-sm inline-flex items-center gap-1.5 transition-colors"
                                >
                                    Free readiness check first <ArrowRight className="w-3.5 h-3.5" />
                                </Link>
                            </div>
                            <p className="text-[11px] text-white/45 mt-3">
                                Secure Stripe checkout · Apple Pay, Google Pay &amp; cards accepted
                            </p>
                        </div>
                    </div>
                </section>
            </main>

            <footer className="border-t border-stone-200 py-6 text-center text-[11px] text-stone-400">
                © {new Date().getFullYear()} CapturePilot ·{" "}
                <Link href="/terms" className="underline">Terms</Link> ·{" "}
                <Link href="/privacy" className="underline">Privacy</Link>
            </footer>
        </div>
    );
}
