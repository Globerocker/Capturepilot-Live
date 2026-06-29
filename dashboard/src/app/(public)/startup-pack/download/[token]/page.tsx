"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
    Loader2, Mail, ExternalLink, Download, CheckCircle2, ArrowRight, AlertCircle,
    Sparkles, Video, Package, Eye, X, BookOpen, ListChecks, FileText, MapPin,
} from "lucide-react";
import clsx from "clsx";
import {
    LAUNCH_KIT_PHASES,
    MASTER_GUIDE,
    MASTER_LIST,
    BONUS_ITEM,
    PRODUCT_NAME,
    type LaunchKitFile,
    type LaunchKitItem,
    type LaunchKitPhase,
} from "@/lib/startup-pack-assets";

// Total distinct files presented (master docs + every guide + template + bonus).
const KIT_FILE_COUNT = (() => {
    const set = new Set<string>([MASTER_GUIDE.localPath, MASTER_LIST.localPath]);
    for (const ph of LAUNCH_KIT_PHASES) for (const it of ph.items) { set.add(it.guide.localPath); it.templates.forEach(t => set.add(t.localPath)); }
    set.add(BONUS_ITEM.guide.localPath); BONUS_ITEM.templates.forEach(t => set.add(t.localPath));
    return set.size;
})();

const phaseAnchor = (slug: string) => `phase-${slug}`;
const itemAnchor = (id: string) => `kit-${id}`;

/** Build token-gated file-route URLs for a kit file. */
function fileUrls(file: LaunchKitFile, token: string) {
    const base = `/api/startup-pack/file/${encodeURIComponent(token)}/${encodeURIComponent(file.id)}`;
    return { previewUrl: base, downloadUrl: `${base}?dl=1` };
}

/** Scroll-reveal wrapper — fades + slides children up on first view (Loom-friendly). */
function Reveal({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
    const ref = useRef<HTMLDivElement>(null);
    const [shown, setShown] = useState(false);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setShown(true); return; }
        const io = new IntersectionObserver((e) => { if (e[0]?.isIntersecting) { setShown(true); io.disconnect(); } }, { threshold: 0.1, rootMargin: "0px 0px -4% 0px" });
        io.observe(el);
        return () => io.disconnect();
    }, []);
    return (
        <div
            ref={ref}
            className={className}
            style={{
                opacity: shown ? 1 : 0,
                transform: shown ? "none" : "translateY(24px)",
                transition: `opacity .6s ease-out ${delay}ms, transform .7s cubic-bezier(.16,.84,.44,1) ${delay}ms`,
                willChange: "transform, opacity",
            }}
        >
            {children}
        </div>
    );
}

interface AccessData {
    ok: boolean;
    email: string;
    company_name: string | null;
    purchased_at: string;
    amount_paid_cents: number;
    analysis_id: string | null;
}

export default function StartupPackDownloadPage() {
    const params = useParams();
    const token = params.token as string;
    const [access, setAccess] = useState<AccessData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [activeHash, setActiveHash] = useState("");

    useEffect(() => {
        if (!token) return;
        // Drop a cookie so the /kit/<id> deep-links inside the guide PDFs can
        // bounce a returning reader back to THIS tokenized page. Not httpOnly —
        // it's only a convenience pointer; the token already lives in the URL.
        try {
            document.cookie = `sp_kit_token=${encodeURIComponent(token)}; path=/; max-age=${60 * 60 * 24 * 120}; samesite=lax`;
        } catch { /* ignore */ }

        let cancelled = false;
        fetch(`/api/startup-pack/access/${token}`, { cache: "no-store" })
            .then(async (res) => {
                const body = await res.json();
                if (cancelled) return;
                if (!res.ok || !body.ok) {
                    setError(body.error || "We couldn't verify your download link.");
                    setLoading(false);
                    return;
                }
                setAccess(body as AccessData);
                setLoading(false);
            })
            .catch(() => {
                if (cancelled) return;
                setError("Could not load your purchase.");
                setLoading(false);
            });
        return () => { cancelled = true; };
    }, [token]);

    // Track the URL hash so a deep-link (#kit-sam-registration) highlights the
    // matching item once content has rendered.
    useEffect(() => {
        const read = () => setActiveHash(window.location.hash.replace(/^#/, ""));
        read();
        window.addEventListener("hashchange", read);
        return () => window.removeEventListener("hashchange", read);
    }, []);

    // After content loads, scroll to the deep-linked item (content is async, so
    // the browser's native anchor jump misses on first paint).
    useEffect(() => {
        if (!access || !activeHash) return;
        const el = document.getElementById(activeHash);
        if (el) requestAnimationFrame(() => el.scrollIntoView({ behavior: "smooth", block: "start" }));
    }, [access, activeHash]);

    if (loading) {
        return (
            <div className="min-h-screen bg-stone-50 flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-stone-400 animate-spin" />
            </div>
        );
    }

    if (error || !access) {
        return (
            <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4">
                <div className="max-w-md text-center bg-white border border-stone-200 rounded-[28px] p-8 shadow-sm">
                    <div className="w-12 h-12 rounded-2xl bg-red-100 flex items-center justify-center mx-auto mb-4">
                        <AlertCircle className="w-6 h-6 text-red-500" />
                    </div>
                    <h2 className="font-bold text-lg mb-1">Access Link Invalid</h2>
                    <p className="text-sm text-stone-500 mb-5">{error || "Your access token couldn't be verified."}</p>
                    <p className="text-xs text-stone-400 mb-5">
                        If you recently purchased the Launch Kit, check your inbox for the confirmation email — it has the right link.
                        Otherwise reply to <a href="mailto:support@capturepilot.com" className="underline">support@capturepilot.com</a> and we&apos;ll resend it.
                    </p>
                    <Link href="/check" className="bg-black text-white px-5 py-2.5 rounded-2xl font-bold text-sm">
                        Back to Quick Check
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-stone-50">
            {/* Header */}
            <header className="px-4 sm:px-6 py-4 flex items-center justify-between max-w-6xl mx-auto">
                <Link href="/check" className="flex items-center space-x-2">
                    <Image src="/logo.png" alt="CP" width={20} height={20} className="rounded" />
                    <span className="font-bold text-base">CapturePilot</span>
                    <span className="text-[9px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full uppercase">Launch Kit</span>
                </Link>
                <a href="mailto:support@capturepilot.com" className="text-xs text-stone-500 hover:text-stone-700 inline-flex items-center gap-1">
                    <Mail className="w-3 h-3" /> Support
                </a>
            </header>

            <main className="max-w-5xl mx-auto px-4 pb-16 space-y-8">
                {/* Hero / confirmation */}
                <section className="bg-gradient-to-br from-emerald-500 via-emerald-600 to-blue-700 text-white rounded-[28px] p-6 sm:p-10 shadow-xl">
                    <div className="flex items-center gap-2 mb-3">
                        <CheckCircle2 className="w-5 h-5 text-amber-300" />
                        <p className="text-[10px] font-bold uppercase tracking-widest text-amber-200">Order Confirmed</p>
                    </div>
                    <h1 className="font-black text-3xl sm:text-4xl leading-tight">
                        Welcome to the {PRODUCT_NAME}.
                    </h1>
                    <p className="text-white/85 text-base sm:text-lg mt-3 max-w-2xl leading-relaxed">
                        This is your permanent download library, so bookmark it. Everything below comes out of three years
                        of running federal capture at Americurial, laid out in the order you'll actually use it: register,
                        build your identity, find work, reach out, bid, and win.
                    </p>
                    <div className="mt-5 flex flex-wrap gap-2 text-xs">
                        <span className="bg-white/15 border border-white/20 px-3 py-1.5 rounded-lg">{KIT_FILE_COUNT} files</span>
                        <span className="bg-white/15 border border-white/20 px-3 py-1.5 rounded-lg">6 phases · SAM to award</span>
                        <span className="bg-amber-300 text-amber-900 px-3 py-1.5 rounded-lg font-bold">7-day refund · No questions</span>
                    </div>
                </section>

                {/* Three ways to use it */}
                <Reveal>
                    <section className="bg-white border border-stone-200 rounded-[28px] p-6 sm:p-7 shadow-sm">
                        <h2 className="font-bold text-base text-stone-900 mb-4">Three ways to use this kit</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            {[
                                { icon: BookOpen, title: "Read the Master Guide first", body: "The whole path, start to finish. Best if federal contracting is new to you." },
                                { icon: FileText, title: "Go phase by phase", body: "Each template has a one-page guide in front of it telling you what it is and how to use it." },
                                { icon: ListChecks, title: "Skip to the templates", body: "Already know your way around? Jump to the Master Template List and grab what you need." },
                            ].map((c, i) => (
                                <div key={i} className="rounded-2xl border border-stone-200 bg-stone-50/60 p-4">
                                    <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center mb-2.5">
                                        <c.icon className="w-4.5 h-4.5" />
                                    </div>
                                    <p className="font-bold text-[13px] text-stone-900 leading-snug">{c.title}</p>
                                    <p className="text-xs text-stone-500 mt-1 leading-relaxed">{c.body}</p>
                                </div>
                            ))}
                        </div>
                    </section>
                </Reveal>

                {/* Master Guide — the "Start Here" hero card */}
                <Reveal>
                    <MasterDocCard
                        file={MASTER_GUIDE}
                        token={token}
                        eyebrow="Start here"
                        title="Master Guide"
                        body="The full path from SAM.gov registration to your first award, with a link to every template along the way. Read this first."
                        accent="emerald"
                    />
                </Reveal>

                {/* High-dominance booking CTA */}
                <a
                    href={process.env.NEXT_PUBLIC_HUBSPOT_MEETINGS_URL || "https://meetings.hubspot.com/andre-schuler"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block bg-gradient-to-br from-amber-400 via-amber-500 to-orange-600 text-stone-900 rounded-[28px] p-6 sm:p-8 shadow-xl hover:shadow-2xl hover:scale-[1.01] transition-all border-2 border-amber-300"
                >
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="flex-1 min-w-[260px]">
                            <div className="flex items-center gap-2 mb-2">
                                <span className="inline-flex items-center gap-1.5 bg-stone-900 text-amber-300 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest">
                                    <span className="relative flex w-2 h-2">
                                        <span className="animate-ping absolute inline-flex w-2 h-2 rounded-full bg-amber-400 opacity-75" />
                                        <span className="relative inline-flex rounded-full w-2 h-2 bg-amber-300" />
                                    </span>
                                    Limited slots · High demand
                                </span>
                            </div>
                            <h2 className="font-black text-2xl sm:text-3xl leading-tight text-stone-900">
                                Skip the learning curve. Book your 30-min onboarding call.
                            </h2>
                            <p className="mt-2 text-stone-800 text-sm sm:text-base leading-relaxed max-w-2xl">
                                Walk through your kit with the founder. We'll pick your first 3 opportunities to chase, set up your sam.gov saved searches, and answer anything the PDFs didn't. Free with your purchase. We cap these at ~6 a week to keep them useful, so book before slots run out for the week.
                            </p>
                        </div>
                        <div className="flex items-center gap-2 self-center">
                            <span className="bg-stone-900 hover:bg-stone-800 text-amber-300 px-6 py-4 rounded-xl font-bold text-base inline-flex items-center gap-2 transition-colors whitespace-nowrap shadow-lg">
                                Book my call <ArrowRight className="w-5 h-5" />
                            </span>
                        </div>
                    </div>
                </a>

                {/* ZIP download banner */}
                <ZipDownloadBanner token={token} assetCount={KIT_FILE_COUNT} />

                {/* Phase nav */}
                <PhaseNav />

                {/* The six phases */}
                {LAUNCH_KIT_PHASES.map((phase, i) => (
                    <Reveal key={phase.slug} delay={(i % 2) * 60}>
                        <PhaseBlock phase={phase} token={token} activeHash={activeHash} />
                    </Reveal>
                ))}

                {/* Bonus */}
                <Reveal>
                    <section id={phaseAnchor("bonus")} className="scroll-mt-24">
                        <PhaseHeader n="★" title="Bonus" blurb="Included free with your kit." />
                        <ItemBlock item={BONUS_ITEM} token={token} active={activeHash === itemAnchor(BONUS_ITEM.id)} />
                    </section>
                </Reveal>

                {/* Master Template List — the "skip to the end" card */}
                <Reveal>
                    <MasterDocCard
                        file={MASTER_LIST}
                        token={token}
                        eyebrow="The whole index"
                        title="Master Template List"
                        body="Every template in the kit, in order, with nothing else. For when you know what you need and just want the file."
                        accent="stone"
                    />
                </Reveal>

                {/* Footer / next steps */}
                <section className="bg-white border border-stone-200 rounded-[28px] p-6 sm:p-8 shadow-sm">
                    <div className="flex items-start gap-3 mb-4">
                        <Sparkles className="w-5 h-5 text-emerald-500" />
                        <div>
                            <h2 className="font-bold text-lg">What to do this week</h2>
                            <p className="text-sm text-stone-500">
                                Most founders send their first real response within 30 days if they work it in this order.
                            </p>
                        </div>
                    </div>
                    <ol className="space-y-3 text-sm text-stone-700 list-decimal pl-6">
                        <li>Read the <strong>Master Guide</strong>, then finish your <strong>SAM.gov registration</strong> (Phase 1).</li>
                        <li>Fill in the <strong>Capability Statement</strong> with your logo and three services (Phase 2).</li>
                        <li>Find two <strong>Sources Sought</strong> from your CapturePilot matches and respond using the template (Phase 3).</li>
                        <li>Use the <strong>Contracting Officer Outreach</strong> pack to follow up (Phase 4).</li>
                        <li>Book your <strong>30-min Founder Onboarding Call</strong> and we'll review your first response live.</li>
                    </ol>
                    <div className="flex flex-col sm:flex-row gap-3 mt-6">
                        <a
                            href={BONUS_ITEM.calendly || "https://calendly.com/capturepilot/launch-kit-onboarding"}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 bg-emerald-600 text-white rounded-2xl p-4 flex items-center justify-center gap-2 font-bold text-sm hover:bg-emerald-700 transition-all"
                        >
                            <Video className="w-4 h-4" /> Book Onboarding Call
                        </a>
                        {access.analysis_id && (
                            <Link
                                href={`/check/${access.analysis_id}`}
                                className="flex-1 bg-white border border-stone-200 rounded-2xl p-4 flex items-center justify-center gap-2 font-bold text-sm hover:shadow-md transition-all"
                            >
                                Back to my report <ArrowRight className="w-4 h-4" />
                            </Link>
                        )}
                    </div>
                </section>
            </main>
        </div>
    );
}

// ──────────────────────────────────────────────────────────────────────────────
// PhaseNav — sticky pill nav, one per phase + Master Guide + Template List.
// ──────────────────────────────────────────────────────────────────────────────
function PhaseNav() {
    return (
        <nav
            aria-label="Kit phases"
            className="sticky top-2 z-30 bg-white/85 backdrop-blur-md border border-stone-200 rounded-2xl px-3 py-2.5 shadow-sm"
        >
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-thin">
                <span className="text-[10px] font-bold uppercase tracking-widest text-stone-400 px-2 flex-shrink-0">Jump to</span>
                {LAUNCH_KIT_PHASES.map((phase) => (
                    <a
                        key={phase.slug}
                        href={`#${phaseAnchor(phase.slug)}`}
                        className="group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-50 hover:bg-emerald-50 border border-stone-200 hover:border-emerald-300 text-xs font-bold text-stone-700 hover:text-emerald-700 whitespace-nowrap transition-colors flex-shrink-0"
                    >
                        <span className="text-[10px] tabular-nums text-stone-400 group-hover:text-emerald-500">{phase.n}</span>
                        <span>{phase.title}</span>
                    </a>
                ))}
            </div>
        </nav>
    );
}

function PhaseHeader({ n, title, blurb }: { n: number | string; title: string; blurb: string }) {
    return (
        <div className="flex items-start gap-3 mb-4 px-1">
            <div className="w-10 h-10 rounded-xl bg-stone-900 text-white flex items-center justify-center flex-shrink-0 font-black text-lg tabular-nums">
                {n}
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">Phase</span>
                </div>
                <h2 className="font-black text-xl text-stone-900 leading-tight">{title}</h2>
                <p className="text-sm text-stone-500 leading-snug mt-0.5 max-w-2xl">{blurb}</p>
            </div>
        </div>
    );
}

function PhaseBlock({ phase, token, activeHash }: { phase: LaunchKitPhase; token: string; activeHash: string }) {
    return (
        <section id={phaseAnchor(phase.slug)} className="scroll-mt-24">
            <PhaseHeader n={phase.n} title={phase.title} blurb={phase.blurb} />
            <div className="space-y-4">
                {phase.items.map((item) => (
                    <ItemBlock key={item.id} item={item} token={token} active={activeHash === itemAnchor(item.id)} />
                ))}
            </div>
        </section>
    );
}

// ──────────────────────────────────────────────────────────────────────────────
// ItemBlock — one deliverable folder: a "read first" guide + its templates.
// Carries the #kit-<id> anchor that the guide PDFs deep-link to, and glows
// briefly when it's the deep-link target.
// ──────────────────────────────────────────────────────────────────────────────
function ItemBlock({ item, token, active }: { item: LaunchKitItem; token: string; active: boolean }) {
    return (
        <div
            id={itemAnchor(item.id)}
            className={clsx(
                "scroll-mt-24 rounded-[24px] border bg-white p-4 sm:p-5 transition-all duration-500",
                active ? "border-emerald-400 ring-2 ring-emerald-300/60 shadow-lg" : "border-stone-200 shadow-sm",
            )}
        >
            <div className="flex items-center justify-between gap-2 mb-3">
                <h3 className="font-bold text-base text-stone-900">{item.title}</h3>
                <span className="text-[10px] font-bold uppercase tracking-widest text-stone-400">
                    {item.templates.length + 1} {item.templates.length + 1 === 1 ? "file" : "files"}
                </span>
            </div>

            {/* Guide — read first */}
            <FileCard file={item.guide} token={token} tone="guide" />

            {/* Calendly (bonus only) */}
            {item.calendly && (
                <a
                    href={item.calendly}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800 hover:bg-emerald-100 transition-colors"
                >
                    <Video className="w-4 h-4" /> Book your onboarding call <ArrowRight className="w-3.5 h-3.5" />
                </a>
            )}

            {/* Templates */}
            {item.templates.length > 0 && (
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                    {item.templates.map((t) => <FileCard key={t.id} file={t} token={token} tone="template" />)}
                </div>
            )}
        </div>
    );
}

// ──────────────────────────────────────────────────────────────────────────────
// FileCard — a single previewable / downloadable file.
//   tone="guide"    emerald, "Read this first"
//   tone="template" neutral
// ──────────────────────────────────────────────────────────────────────────────
function FileCard({ file, token, tone }: { file: LaunchKitFile; token: string; tone: "guide" | "template" }) {
    const { previewUrl, downloadUrl } = fileUrls(file, token);
    const isPdf = /\.pdf$/i.test(file.localPath);
    const isOffice = /\.(xlsx|docx|pptx)$/i.test(file.localPath);
    const canPreview = isPdf || isOffice;
    const [showPreview, setShowPreview] = useState(false);

    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const fileAbs = `${origin}${previewUrl}`;
    const frameSrc = isPdf ? previewUrl : `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(fileAbs)}`;
    const isGuide = tone === "guide";

    return (
        <div
            className={clsx(
                "rounded-2xl border p-4 transition-all duration-300 h-full",
                isGuide
                    ? "border-emerald-200 bg-emerald-50/50 hover:border-emerald-300 hover:shadow-md"
                    : "border-stone-200 bg-white hover:border-emerald-300 hover:shadow-md hover:-translate-y-0.5",
            )}
        >
            <div className="flex items-start justify-between gap-2 mb-1.5">
                <span className={clsx(
                    "text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded border",
                    isGuide ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-stone-100 text-stone-600 border-stone-200",
                )}>
                    {isGuide ? "Read first" : file.format}
                </span>
                {isGuide && <span className="text-[10px] text-emerald-600 font-semibold">1-page guide</span>}
            </div>
            <h4 className={clsx("font-bold leading-snug", isGuide ? "text-sm text-stone-900" : "text-[13px] text-stone-900")}>
                {file.title}
            </h4>

            <div className="mt-3 flex flex-wrap gap-2">
                {canPreview && (
                    <button
                        type="button"
                        onClick={() => setShowPreview((v) => !v)}
                        className={clsx(
                            "inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg transition-colors",
                            showPreview ? "bg-stone-900 text-white hover:bg-black" : "bg-emerald-600 text-white hover:bg-emerald-700",
                        )}
                    >
                        {showPreview ? <><X className="w-3.5 h-3.5" /> Close</> : <><Eye className="w-3.5 h-3.5" /> Preview</>}
                    </button>
                )}
                <a
                    href={previewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 bg-white border border-stone-200 text-stone-700 text-xs font-bold px-3 py-2 rounded-lg hover:border-emerald-300 hover:text-emerald-700 transition-colors"
                >
                    <ExternalLink className="w-3.5 h-3.5" /> Open
                </a>
                <a
                    href={downloadUrl}
                    className="inline-flex items-center gap-1.5 bg-white border border-stone-200 text-stone-700 text-xs font-bold px-3 py-2 rounded-lg hover:border-stone-300 transition-colors"
                >
                    <Download className="w-3.5 h-3.5" /> Download
                </a>
            </div>

            {canPreview && showPreview && (
                <div className="mt-3 rounded-xl overflow-hidden border border-stone-200 bg-stone-100 shadow-inner">
                    <iframe src={frameSrc} title={file.title} className={clsx("w-full bg-white", isGuide ? "h-[620px]" : "h-[540px]")} />
                    {isOffice && (
                        <p className="text-[10px] text-stone-400 px-2 py-1 bg-white border-t border-stone-100">
                            Rendered via Microsoft Office viewer. If it doesn&apos;t load, use Download.
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}

// ──────────────────────────────────────────────────────────────────────────────
// MasterDocCard — the prominent Master Guide / Master Template List card.
// ──────────────────────────────────────────────────────────────────────────────
function MasterDocCard({
    file, token, eyebrow, title, body, accent,
}: { file: LaunchKitFile; token: string; eyebrow: string; title: string; body: string; accent: "emerald" | "stone" }) {
    const { previewUrl, downloadUrl } = fileUrls(file, token);
    const [showPreview, setShowPreview] = useState(false);
    const isEmerald = accent === "emerald";

    return (
        <section
            id={isEmerald ? "master-guide" : "master-list"}
            className={clsx(
                "scroll-mt-24 rounded-[28px] border-2 p-6 sm:p-7 shadow-sm",
                isEmerald ? "border-emerald-300 bg-gradient-to-br from-emerald-50 to-white" : "border-stone-300 bg-white",
            )}
        >
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <div className={clsx(
                    "w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0",
                    isEmerald ? "bg-emerald-600 text-white" : "bg-stone-900 text-white",
                )}>
                    {isEmerald ? <MapPin className="w-6 h-6" /> : <ListChecks className="w-6 h-6" />}
                </div>
                <div className="flex-1 min-w-0">
                    <p className={clsx("text-[10px] font-bold uppercase tracking-widest", isEmerald ? "text-emerald-600" : "text-stone-400")}>{eyebrow}</p>
                    <h2 className="font-black text-xl text-stone-900 leading-tight">{title}</h2>
                    <p className="text-sm text-stone-600 leading-relaxed mt-1 max-w-2xl">{body}</p>
                </div>
                <div className="flex flex-wrap gap-2 sm:self-center">
                    <button
                        type="button"
                        onClick={() => setShowPreview((v) => !v)}
                        className={clsx(
                            "inline-flex items-center gap-1.5 text-sm font-bold px-4 py-3 rounded-xl transition-colors",
                            showPreview ? "bg-stone-900 text-white hover:bg-black"
                                : isEmerald ? "bg-emerald-600 text-white hover:bg-emerald-700" : "bg-stone-900 text-white hover:bg-black",
                        )}
                    >
                        {showPreview ? <><X className="w-4 h-4" /> Close</> : <><Eye className="w-4 h-4" /> Preview</>}
                    </button>
                    <a
                        href={downloadUrl}
                        className="inline-flex items-center gap-1.5 bg-white border border-stone-200 text-stone-700 text-sm font-bold px-4 py-3 rounded-xl hover:border-stone-300 transition-colors"
                    >
                        <Download className="w-4 h-4" /> Download
                    </a>
                </div>
            </div>
            {showPreview && (
                <div className="mt-4 rounded-xl overflow-hidden border border-stone-200 bg-stone-100 shadow-inner">
                    <iframe src={previewUrl} title={title} className="w-full h-[640px] bg-white" />
                </div>
            )}
        </section>
    );
}

// ──────────────────────────────────────────────────────────────────────────────
// ZipDownloadBanner — "download everything as one ZIP" panel.
// ──────────────────────────────────────────────────────────────────────────────
function ZipDownloadBanner({ token, assetCount }: { token: string; assetCount: number }) {
    const [status, setStatus] = useState<"idle" | "downloading" | "done" | "error">("idle");
    const [errorMsg, setErrorMsg] = useState("");

    async function handleDownload() {
        if (status === "downloading") return;
        setStatus("downloading");
        setErrorMsg("");
        try {
            const res = await fetch(`/api/startup-pack/zip/${token}`);
            if (!res.ok) {
                const text = await res.text();
                throw new Error(text || `Server returned ${res.status}`);
            }
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "Federal_Launch_Kit.zip";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 60_000);
            setStatus("done");
        } catch (err) {
            console.error("[zip-download]", err);
            setErrorMsg(err instanceof Error ? err.message : "Download failed");
            setStatus("error");
        }
    }

    return (
        <section className="bg-white border-2 border-emerald-200 rounded-[28px] p-5 sm:p-7 shadow-sm">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
                    <Package className="w-6 h-6 text-emerald-700" />
                </div>
                <div className="flex-1 min-w-0">
                    <h2 className="font-bold text-base text-stone-900">
                        Download everything as one ZIP
                    </h2>
                    <p className="text-sm text-stone-500 leading-snug mt-0.5">
                        Get all {assetCount} files in a single download, organized into the same phase folders you see below.
                        No clicking through every link.
                    </p>
                    {status === "error" && (
                        <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5" />
                            {errorMsg || "Something went wrong. Try again."}
                        </p>
                    )}
                    {status === "done" && (
                        <p className="text-xs text-emerald-700 mt-1 flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            ZIP saved — check your downloads folder.
                        </p>
                    )}
                </div>
                <button
                    type="button"
                    onClick={handleDownload}
                    disabled={status === "downloading"}
                    className={clsx(
                        "flex-shrink-0 inline-flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-sm transition-all",
                        status === "downloading"
                            ? "bg-stone-100 text-stone-500 cursor-not-allowed"
                            : status === "done"
                                ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                                : "bg-emerald-600 text-white hover:bg-emerald-700 shadow-md hover:shadow-lg hover:-translate-y-0.5",
                    )}
                >
                    {status === "downloading" ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Preparing ZIP…</>
                    ) : status === "done" ? (
                        <><CheckCircle2 className="w-4 h-4" /> Download again</>
                    ) : (
                        <><Download className="w-4 h-4" /> Download All ({assetCount} files)</>
                    )}
                </button>
            </div>
        </section>
    );
}
