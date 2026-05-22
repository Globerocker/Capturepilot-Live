"use client";

import { useState, Suspense, useEffect, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
    Globe, Loader2, ArrowRight, Sparkles, ShieldCheck, Clock, Zap, Star,
    Target, FileText, Building2, CheckCircle2, TrendingUp, DollarSign,
    Award, Users, MapPin, Lock, ChevronDown, Database,
} from "lucide-react";
import Image from "next/image";
import clsx from "clsx";
import { AnalysisProgressStepper, statusToStep } from "@/components/AnalysisProgressStepper";

// Big-claim numbers reused across the marketing site
const STATS = [
    { label: "Federal opportunities scanned", value: "40,000+" },
    { label: "Average federal spend / year", value: "$700B+" },
    { label: "Time to first result", value: "60 sec" },
];

const STEPS = [
    {
        icon: Globe,
        title: "Drop your website",
        body: "We crawl your homepage to detect services, certifications, leadership, and contact info — no signup, no commitment.",
    },
    {
        icon: Database,
        title: "Cross-check the federal databases",
        body: "We look up SAM.gov registration, query USASpending for past awards, and infer the right NAICS codes via OpenAI.",
    },
    {
        icon: Sparkles,
        title: "Score & deliver",
        body: "Your readiness score (0–10), the top matching opportunities, certification roadmap, and competitor intel — all in one page.",
    },
];

const PROOF_LINES = [
    { icon: TrendingUp, label: "AI-classified NAICS — 87% accuracy" },
    { icon: ShieldCheck, label: "SAM.gov + USASpending verified data" },
    { icon: Lock, label: "We never share or sell your info" },
];

const DELIVERABLES = [
    {
        title: "Government Contracting Readiness Score",
        body: "0–10 readiness rating with the exact factors holding you back — and how to fix each.",
    },
    {
        title: "Top 10 Matching Opportunities",
        body: "Pulled from 37K+ active SAM.gov notices, scored against your detected NAICS, geography and set-asides.",
    },
    {
        title: "Past Award History",
        body: "Federal contracts your business has already won — straight from USASpending.gov.",
    },
    {
        title: "Top 3 Competitors",
        body: "Companies winning contracts in your NAICS — by award $, agency, and certification stack.",
    },
    {
        title: "Certification Roadmap",
        body: "Which set-asides (8(a), HUBZone, WOSB, SDVOSB) would unlock the most additional revenue.",
    },
    {
        title: "Easy Wins Checklist",
        body: "5 fast actions to lift your readiness score and qualify for more opportunities.",
    },
];

const TESTIMONIALS = [
    {
        quote: "I had no idea we were already a fit for $3M+ in active contracts. The Quick Check saved me two weeks of research.",
        author: "Jordan M.",
        role: "Founder, WOSB construction services",
    },
    {
        quote: "Most accurate NAICS classification I've gotten from any tool — including the ones I pay for.",
        author: "Andre S.",
        role: "8(a) IT services owner",
    },
    {
        quote: "Used the readiness breakdown to fix three things on our website. Won our first Sources Sought response four weeks later.",
        author: "Tasha P.",
        role: "SDVOSB cybersecurity",
    },
];

const FAQS = [
    {
        q: "Is this really free?",
        a: "Yes. The Quick Check is the entry point of our platform. You give us your website, we give you a complete federal readiness report. No credit card, no signup wall — submit your email if you want the full report and the $70 Federal Launch Kit offer.",
    },
    {
        q: "How accurate is the NAICS classification?",
        a: "We use OpenAI gpt-4o with your detected services + page content to assign NAICS codes — typically 85–90% accuracy on first try. You can correct them on the result page if anything looks off, and we'll re-score against your fixes in seconds.",
    },
    {
        q: "What data sources do you use?",
        a: "SAM.gov (Entity API + Opportunity API), USASpending.gov (past award history), your public website (via Cheerio crawler), and Apollo.io (for decision-maker enrichment). All public-API data — nothing scraped illegally.",
    },
    {
        q: "Do I need to be registered on SAM.gov first?",
        a: "No. The Quick Check works for anyone with a website. If you aren't registered, we'll tell you that's the #1 thing to fix and walk you through it.",
    },
    {
        q: "What's the $70 Federal Launch Kit on the result page?",
        a: "An optional one-time purchase. SAM.gov registration walkthroughs, capability statement templates, playbooks for every solicitation type (Sources Sought, RFI, Pre-Sol, RFP, RFQ, IDIQ task orders), certification eligibility worksheets, our internal best-practice library, CO outreach scripts, pricing toolkit, plus a 30-min founder onboarding call. The kit is $70 for 7 days after your check, $150 after that.",
    },
    {
        q: "Will you spam me?",
        a: "No. If you submit your email we send your full report and (rarely) educational drops on federal contracting. Every email has one-click unsubscribe. We do not sell your data.",
    },
];

function CheckContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [website, setWebsite] = useState("");
    const [samRegistered, setSamRegistered] = useState<"yes" | "no" | null>(null);
    const [uei, setUei] = useState("");
    const [capFile, setCapFile] = useState<File | null>(null);
    const [running, setRunning] = useState(false);
    const [step, setStep] = useState(0);
    const [error, setError] = useState("");
    const [displayName, setDisplayName] = useState("");
    const [openFaq, setOpenFaq] = useState<number | null>(0);
    const startedRef = useRef(false);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const analysisIdRef = useRef<string | null>(null);

    const autoWebsite = searchParams.get("website") || "";
    const autoUei = searchParams.get("uei") || "";

    const stopPolling = useCallback(() => {
        if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
        }
    }, []);

    const startPolling = useCallback((id: string) => {
        analysisIdRef.current = id;
        stopPolling();
        pollRef.current = setInterval(async () => {
            try {
                const res = await fetch(`/api/analyze-company/status/${id}`);
                if (!res.ok) return;
                const data = await res.json();
                if (data.company_name && data.company_name.length > 1) {
                    const domain = getDomain(website || autoWebsite);
                    if (data.company_name !== domain) setDisplayName(data.company_name);
                }
                if (data.status === "error") {
                    stopPolling();
                    setError(data.error_message || "Analysis failed. Please try again.");
                    return;
                }
                setStep(statusToStep(data.status));
                // Hand off to the result page as soon as the pipeline has
                // produced something the user can interact with. The result
                // page handles the confirm step, the in-progress UI for the
                // post-confirm scoring phase, and the final report — so any
                // status past "classifying" belongs there.
                const HANDOFF_STATUSES = new Set([
                    "awaiting_naics_selection",
                    "scoring",
                    "finding_opportunities",
                    "finding_competitors",
                    "generating",
                    "complete",
                ]);
                if (HANDOFF_STATUSES.has(data.status)) {
                    stopPolling();
                    router.push(`/check/${id}`);
                }
            } catch { /* ignore transient errors */ }
        }, 2000);
    }, [router, stopPolling, website, autoWebsite]);

    useEffect(() => {
        if (startedRef.current) return;
        if (autoWebsite) {
            startedRef.current = true;
            setWebsite(autoWebsite);
            // Auto-start assumes SAM-registered yes when a UEI is supplied
            setSamRegistered(autoUei ? "yes" : "no");
            runAnalysis(autoWebsite, autoUei, null);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoWebsite, autoUei]);

    useEffect(() => () => stopPolling(), [stopPolling]);

    function getDomain(url: string): string {
        try {
            return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(/^www\./, "");
        } catch { return url; }
    }

    function runAnalysis(site: string, ueiVal: string, file: File | null) {
        let url = site.trim();
        if (!/^https?:\/\//i.test(url)) url = "https://" + url;
        setRunning(true);
        setError("");
        setStep(0);
        setDisplayName(getDomain(url));
        fetch("/api/analyze-company", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                website: url,
                uei: ueiVal || undefined,
            }),
        })
            .then(async (res) => {
                if (!res.ok) {
                    const data = await res.json().catch(() => ({}));
                    throw new Error(data.error || `Analysis failed (${res.status})`);
                }
                return res.json();
            })
            .then(async (data) => {
                if (!data.analysis_id) {
                    setError("Failed to start analysis.");
                    setRunning(false);
                    return;
                }
                // Trigger the heavy pipeline from the client. We tried
                // server-side after() and server-side fire-and-forget fetch
                // and both got silently killed on Vercel mid-classify. The
                // client-initiated fetch survives because the browser holds
                // the connection open until the worker responds (Vercel
                // doesn't propagate the browser disconnect, so even if the
                // user navigates away the worker still runs to completion).
                //
                // We do NOT await this — polling handles progress.
                fetch(data.run_url || `/api/analyze-company/run/${data.analysis_id}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                }).catch(() => { /* swallow — polling will surface any failure */ });

                // Optional capability statement upload — fire-and-forget, fails silently.
                if (file) {
                    try {
                        const fd = new FormData();
                        fd.append("file", file);
                        fd.append("analysis_id", data.analysis_id);
                        fetch("/api/analyze-company/upload-cap-statement", { method: "POST", body: fd })
                            .catch(() => { /* swallow — upload is best-effort */ });
                    } catch { /* ignore */ }
                }
                startPolling(data.analysis_id);
            })
            .catch((err) => {
                setError(err.message || "Something went wrong.");
                setRunning(false);
            });
    }

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!website.trim()) return;
        if (samRegistered === null) {
            setError("Please answer: are you registered on SAM.gov?");
            return;
        }
        runAnalysis(website.trim(), uei.trim().toUpperCase(), capFile);
    }

    function scrollToForm() {
        document.getElementById("check-form")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    // ── Running state ────────────────────────────────────────────────────────
    if (running) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-stone-50 to-blue-50 flex items-center justify-center px-4">
                <div className="max-w-md mx-auto w-full">
                    <div className="text-center mb-8">
                        <div className="flex items-center justify-center gap-2 mb-4">
                            <Image src="/logo.png" alt="CapturePilot" width={20} height={20} className="rounded" />
                            <span className="font-bold text-lg">CapturePilot</span>
                        </div>
                        <h2 className="font-bold text-xl sm:text-2xl mb-2">
                            Analyzing {displayName}
                        </h2>
                        <p className="text-sm text-stone-500">Crawling website &amp; matching against federal opportunities…</p>
                    </div>
                    <AnalysisProgressStepper currentStep={step} />
                    {error && (
                        <div className="mt-6 bg-red-50 border border-red-200 rounded-2xl p-4 text-center">
                            <p className="text-sm text-red-600 mb-3">{error}</p>
                            <button
                                type="button"
                                onClick={() => { setRunning(false); setError(""); stopPolling(); }}
                                className="bg-black text-white px-5 py-2 rounded-xl text-sm font-bold"
                            >
                                Try Again
                            </button>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // ── Landing state ────────────────────────────────────────────────────────
    return (
        <div className="min-h-screen bg-stone-50">
            {/* Header */}
            <header className="px-4 sm:px-6 py-4 flex items-center justify-between max-w-6xl mx-auto">
                <Link href="/" className="flex items-center space-x-2">
                    <Image src="/logo.png" alt="CP" width={22} height={22} className="rounded" />
                    <span className="font-bold text-base">CapturePilot</span>
                    <span className="text-[9px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full uppercase font-bold">Quick Check</span>
                </Link>
                <Link
                    href="/startup-pack"
                    className="text-xs text-stone-500 hover:text-stone-800 inline-flex items-center gap-1"
                >
                    Skip to Launch Kit <ArrowRight className="w-3 h-3" />
                </Link>
            </header>

            <main className="max-w-6xl mx-auto px-4 pb-20">
                {/* HERO + FORM */}
                <section className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-emerald-600 via-emerald-700 to-blue-800 text-white shadow-2xl mt-2">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.15),transparent_50%)]" />
                    <div className="relative p-7 sm:p-12 grid grid-cols-1 lg:grid-cols-5 gap-8 items-start">
                        {/* Left: copy */}
                        <div className="lg:col-span-3">
                            <div className="inline-flex items-center gap-2 bg-amber-300 text-amber-900 px-3 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wider mb-5">
                                <Sparkles className="w-3.5 h-3.5" /> Free · No signup
                            </div>
                            <h1 className="font-black text-4xl sm:text-5xl lg:text-[3.4rem] leading-[1.05]">
                                Can your business win federal contracts?
                            </h1>
                            <p className="text-white/85 text-lg mt-5 leading-relaxed max-w-xl">
                                Drop your website. In 60 seconds we&apos;ll score your federal readiness, find your matching opportunities,
                                and show you exactly what&apos;s blocking your first contract.
                            </p>
                            <div className="flex flex-wrap items-center gap-x-5 gap-y-3 mt-6 text-[11px]">
                                {PROOF_LINES.map(p => {
                                    const Icon = p.icon;
                                    return (
                                        <div key={p.label} className="flex items-center gap-1.5 text-white/85">
                                            <Icon className="w-3.5 h-3.5 text-amber-300" />
                                            {p.label}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Right: form */}
                        <div id="check-form" className="lg:col-span-2 bg-white/95 backdrop-blur-sm rounded-[24px] p-5 sm:p-6 shadow-2xl border border-white/30 text-stone-900">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700 mb-2">
                                Start your free check
                            </p>
                            <form onSubmit={handleSubmit} className="space-y-3">
                                <div>
                                    <label className="block text-xs font-bold text-stone-600 mb-1.5">
                                        Your website <span className="text-emerald-600">*</span>
                                    </label>
                                    <div className="relative">
                                        <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                                        <input
                                            type="text"
                                            value={website}
                                            onChange={(e) => setWebsite(e.target.value)}
                                            className="w-full pl-10 pr-4 py-3 rounded-xl border-2 border-stone-200 text-sm focus:outline-none focus:ring-4 focus:ring-emerald-100 focus:border-emerald-500"
                                            placeholder="www.acmelogistics.com"
                                            required
                                            autoFocus
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-stone-600 mb-1.5">
                                        Are you registered on SAM.gov? <span className="text-emerald-600">*</span>
                                    </label>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setSamRegistered("yes")}
                                            className={clsx(
                                                "px-4 py-3 rounded-xl border-2 text-sm font-bold transition-all",
                                                samRegistered === "yes"
                                                    ? "bg-emerald-50 text-emerald-700 border-emerald-500"
                                                    : "bg-white text-stone-500 border-stone-200 hover:border-emerald-300",
                                            )}
                                        >
                                            ✓ Yes
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => { setSamRegistered("no"); setUei(""); }}
                                            className={clsx(
                                                "px-4 py-3 rounded-xl border-2 text-sm font-bold transition-all",
                                                samRegistered === "no"
                                                    ? "bg-stone-100 text-stone-800 border-stone-400"
                                                    : "bg-white text-stone-500 border-stone-200 hover:border-stone-400",
                                            )}
                                        >
                                            Not yet
                                        </button>
                                    </div>
                                </div>

                                {samRegistered === "yes" && (
                                    <div className="animate-in fade-in slide-in-from-top-1 duration-200">
                                        <label className="block text-xs font-bold text-stone-600 mb-1.5">
                                            UEI <span className="text-stone-400 font-normal">(optional · helps us match faster)</span>
                                        </label>
                                        <input
                                            type="text"
                                            value={uei}
                                            onChange={(e) => setUei(e.target.value.toUpperCase())}
                                            className="w-full px-4 py-3 rounded-xl border-2 border-stone-200 text-sm focus:outline-none focus:ring-4 focus:ring-emerald-100 focus:border-emerald-500 font-mono"
                                            placeholder="ABC123456789"
                                            maxLength={12}
                                        />
                                    </div>
                                )}

                                <div>
                                    <label className="block text-xs font-bold text-stone-600 mb-1.5">
                                        Capability statement <span className="text-stone-400 font-normal">(optional · improves AI match summaries)</span>
                                    </label>
                                    <label
                                        className={clsx(
                                            "block w-full px-4 py-4 rounded-xl border-2 border-dashed text-sm cursor-pointer transition-colors",
                                            capFile
                                                ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                                                : "bg-stone-50 border-stone-300 text-stone-500 hover:border-emerald-300 hover:bg-emerald-50/40",
                                        )}
                                    >
                                        <input
                                            type="file"
                                            accept=".pdf,.docx,.doc,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                                            onChange={(e) => {
                                                const f = e.target.files?.[0];
                                                if (!f) { setCapFile(null); return; }
                                                if (f.size > 10 * 1024 * 1024) {
                                                    setError("Capability statement must be under 10 MB");
                                                    return;
                                                }
                                                setError("");
                                                setCapFile(f);
                                            }}
                                            className="hidden"
                                        />
                                        {capFile ? (
                                            <span className="flex items-center justify-between gap-2">
                                                <span className="truncate font-bold">📄 {capFile.name}</span>
                                                <span className="text-[10px] text-emerald-600 flex-shrink-0">{(capFile.size / 1024).toFixed(0)} KB · uploaded</span>
                                            </span>
                                        ) : (
                                            <span className="flex items-center justify-center gap-2">
                                                <span>📄 Click to upload (PDF, DOCX, ≤10 MB)</span>
                                            </span>
                                        )}
                                    </label>
                                </div>

                                {error && (
                                    <div className="bg-red-50 text-red-600 text-xs p-3 rounded-xl border border-red-200">
                                        {error}
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    className="w-full bg-gradient-to-r from-emerald-600 to-blue-600 text-white py-3.5 rounded-2xl font-black text-sm hover:opacity-95 transition-all flex items-center justify-center gap-2 shadow-md"
                                >
                                    <Zap className="w-4 h-4" /> Run Free Readiness Check
                                </button>
                                <p className="text-[10px] text-stone-400 text-center">
                                    Takes ~60 seconds · No signup required
                                </p>
                            </form>
                        </div>
                    </div>

                    {/* Stat band */}
                    <div className="relative border-t border-white/15 bg-black/15 backdrop-blur-sm">
                        <div className="grid grid-cols-3 divide-x divide-white/15">
                            {STATS.map(s => (
                                <div key={s.label} className="px-4 py-4 sm:py-5 text-center">
                                    <p className="font-black text-xl sm:text-2xl text-white">{s.value}</p>
                                    <p className="text-[10px] sm:text-[11px] text-white/70 uppercase tracking-widest mt-0.5">{s.label}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* HOW IT WORKS */}
                <section className="mt-16">
                    <div className="text-center max-w-2xl mx-auto mb-10">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">How it works</p>
                        <h2 className="font-black text-3xl sm:text-4xl text-stone-900 mt-1">
                            Three steps. One full report.
                        </h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {STEPS.map((s, i) => {
                            const Icon = s.icon;
                            return (
                                <div key={s.title} className="bg-white border border-stone-200 rounded-2xl p-6 hover:border-emerald-300 hover:shadow-md transition-all relative">
                                    <span className="absolute -top-3 -left-3 w-9 h-9 bg-emerald-500 text-white rounded-2xl flex items-center justify-center font-black text-sm shadow-md">
                                        {i + 1}
                                    </span>
                                    <Icon className="w-7 h-7 text-emerald-600 mb-3" />
                                    <p className="font-bold text-stone-900">{s.title}</p>
                                    <p className="text-sm text-stone-500 mt-2 leading-relaxed">{s.body}</p>
                                </div>
                            );
                        })}
                    </div>
                </section>

                {/* WHAT YOU GET */}
                <section className="mt-16 bg-white border border-stone-200 rounded-[28px] p-7 sm:p-10 shadow-sm">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">In your report</p>
                            <h2 className="font-black text-3xl text-stone-900 mt-1">
                                Six things most founders pay $500+ to know.
                            </h2>
                            <p className="text-sm text-stone-500 mt-4 leading-relaxed">
                                Every Quick Check delivers the same depth of report — whether you&apos;re a one-person LLC or a 50-person prime.
                                After the check, you can refine your NAICS, state and certifications to re-score instantly.
                            </p>
                            <button
                                type="button"
                                onClick={scrollToForm}
                                className="mt-6 inline-flex items-center gap-2 text-emerald-700 font-bold text-sm hover:text-emerald-900"
                            >
                                Run my check now <ArrowRight className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {DELIVERABLES.map((d, i) => {
                                const Icon = [Target, FileText, DollarSign, Building2, Award, CheckCircle2][i] || CheckCircle2;
                                return (
                                    <div key={d.title} className="bg-stone-50 border border-stone-100 rounded-2xl p-4">
                                        <Icon className="w-5 h-5 text-emerald-600 mb-2" />
                                        <p className="font-bold text-sm text-stone-900">{d.title}</p>
                                        <p className="text-xs text-stone-500 mt-1 leading-relaxed">{d.body}</p>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </section>

                {/* TRUST / TESTIMONIALS */}
                <section className="mt-16">
                    <div className="text-center max-w-2xl mx-auto mb-10">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">What founders say</p>
                        <h2 className="font-black text-3xl text-stone-900 mt-1">
                            Built by founders who&apos;ve won federal work.
                        </h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

                {/* DATA SOURCES STRIP */}
                <section className="mt-16 bg-stone-100 border border-stone-200 rounded-2xl p-5 sm:p-7">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-stone-500 text-center mb-4">
                        Powered by official data sources
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-stone-700">
                        <span className="inline-flex items-center gap-2"><Building2 className="w-4 h-4 text-stone-500" /> SAM.gov</span>
                        <span className="inline-flex items-center gap-2"><DollarSign className="w-4 h-4 text-stone-500" /> USASpending.gov</span>
                        <span className="inline-flex items-center gap-2"><Users className="w-4 h-4 text-stone-500" /> Apollo.io</span>
                        <span className="inline-flex items-center gap-2"><Award className="w-4 h-4 text-stone-500" /> SBA Set-Asides</span>
                        <span className="inline-flex items-center gap-2"><MapPin className="w-4 h-4 text-stone-500" /> NAICS Catalog</span>
                    </div>
                </section>

                {/* FAQ */}
                <section className="mt-16">
                    <div className="text-center max-w-2xl mx-auto mb-10">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">Common questions</p>
                        <h2 className="font-black text-3xl text-stone-900 mt-1">
                            Read this before you skip it.
                        </h2>
                    </div>
                    <div className="max-w-3xl mx-auto space-y-3">
                        {FAQS.map((f, i) => {
                            const open = openFaq === i;
                            return (
                                <div key={f.q} className={clsx(
                                    "bg-white border rounded-2xl overflow-hidden transition-all",
                                    open ? "border-emerald-300 shadow-sm" : "border-stone-200",
                                )}>
                                    <button
                                        type="button"
                                        onClick={() => setOpenFaq(open ? null : i)}
                                        className="w-full text-left px-5 py-4 flex items-center justify-between gap-3 hover:bg-stone-50/50"
                                    >
                                        <p className="font-bold text-sm text-stone-900">{f.q}</p>
                                        <ChevronDown className={clsx("w-4 h-4 text-stone-500 transition-transform flex-shrink-0", open && "rotate-180")} />
                                    </button>
                                    {open && (
                                        <div className="px-5 pb-4 text-sm text-stone-600 leading-relaxed">
                                            {f.a}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </section>

                {/* BOTTOM CTA */}
                <section className="mt-16 bg-gradient-to-br from-stone-900 to-stone-800 text-white rounded-[28px] p-8 sm:p-12 text-center shadow-xl">
                    <Clock className="w-8 h-8 text-amber-300 mx-auto mb-3" />
                    <h2 className="font-black text-3xl sm:text-4xl">
                        60 seconds. Free. Worth running.
                    </h2>
                    <p className="text-white/75 text-base mt-3 max-w-xl mx-auto">
                        You&apos;ll either find $1M+ in opportunities you didn&apos;t know existed, or confirm you&apos;re not ready to bid yet.
                        Either answer is worth the minute.
                    </p>
                    <button
                        type="button"
                        onClick={scrollToForm}
                        className="mt-6 inline-flex items-center gap-2 bg-gradient-to-r from-emerald-400 to-amber-300 text-emerald-900 px-7 py-4 rounded-2xl font-black text-base hover:opacity-95 transition-all shadow-xl"
                    >
                        <Zap className="w-5 h-5" /> Run my free check
                    </button>
                </section>
            </main>

            <footer className="border-t border-stone-200 py-6 text-center text-[11px] text-stone-400">
                © {new Date().getFullYear()} CapturePilot · <Link href="/terms" className="underline">Terms</Link> · <Link href="/privacy" className="underline">Privacy</Link>
            </footer>
        </div>
    );
}

export default function CheckPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center bg-stone-50">
                <Loader2 className="w-8 h-8 animate-spin text-stone-400" />
            </div>
        }>
            <CheckContent />
        </Suspense>
    );
}
