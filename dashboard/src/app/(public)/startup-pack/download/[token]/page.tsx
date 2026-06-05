"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
    Loader2, FileText, Search, Scale, Award, Trophy, Mail, DollarSign, Video,
    ExternalLink, Download, CheckCircle2, ArrowRight, AlertCircle, Sparkles,
    ClipboardCheck, BookOpen, Building2, ChevronDown,
} from "lucide-react";
import clsx from "clsx";
import {
    STARTUP_PACK_SECTIONS,
    STARTUP_PACK_ASSETS,
    PRODUCT_NAME,
    type StartupPackAsset,
    type AssetSection,
    resolveDriveLinks,
} from "@/lib/startup-pack-assets";

const ICON_MAP: Record<AssetSection["icon"], React.ComponentType<{ className?: string }>> = {
    FileText, Search, Scale, Award, Trophy, Mail, DollarSign, Video, ClipboardCheck, BookOpen, Building2,
};

/** Anchor id for a category section — used by the sticky nav + overview tiles. */
const anchorIdFor = (cat: string) => `category-${cat}`;

/** Two-digit display index ("01", "02", … "10"). */
const sectionNumber = (i: number) => String(i + 1).padStart(2, "0");

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

    useEffect(() => {
        if (!token) return;
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

    const totalAssets = STARTUP_PACK_ASSETS.filter(a => a.localPath || a.gdriveUrl).length;
    const comingSoonCount = STARTUP_PACK_ASSETS.length - totalAssets;
    const buyer = access.company_name?.trim() || access.email?.split("@")[0] || "there";

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
                        Welcome to the {PRODUCT_NAME}, {buyer}.
                    </h1>
                    <p className="text-white/85 text-base sm:text-lg mt-3 max-w-2xl leading-relaxed">
                        Bookmark this page — it&apos;s your permanent download library. Every template, playbook and worksheet you need to
                        land your first federal contract is below.
                    </p>
                    <div className="mt-5 flex flex-wrap gap-2 text-xs">
                        <span className="bg-white/15 border border-white/20 px-3 py-1.5 rounded-lg">{totalAssets} active assets</span>
                        {comingSoonCount > 0 && (
                            <span className="bg-white/15 border border-white/20 px-3 py-1.5 rounded-lg">+{comingSoonCount} more coming soon</span>
                        )}
                        <span className="bg-amber-300 text-amber-900 px-3 py-1.5 rounded-lg font-bold">7-day refund · No questions</span>
                    </div>
                </section>

                {/* Sticky category nav — 10 pills, jump to any kit. */}
                <CategoryNav />

                {/* "What's in this kit" — 10-tile overview grid replacing the old video placeholder. */}
                <KitOverview />

                {/* Asset sections — each with anchor id + collapsible body. */}
                {STARTUP_PACK_SECTIONS.map((section, i) => (
                    <SectionBlock key={section.category} section={section} index={i} />
                ))}

                {/* Footer / next steps */}
                <section className="bg-white border border-stone-200 rounded-[28px] p-6 sm:p-8 shadow-sm">
                    <div className="flex items-start gap-3 mb-4">
                        <Sparkles className="w-5 h-5 text-emerald-500" />
                        <div>
                            <h2 className="font-bold text-lg">What to do next</h2>
                            <p className="text-sm text-stone-500">
                                Most founders win their first response within 30 days if they follow this order.
                            </p>
                        </div>
                    </div>
                    <ol className="space-y-3 text-sm text-stone-700 list-decimal pl-6">
                        <li>Customize the <strong>Capability Statement DOCX</strong> with your logo + 3 services.</li>
                        <li>Read the <strong>Sources Sought Playbook</strong> — these are the highest-leverage notices in federal.</li>
                        <li>Pick 2 Sources Sought from your CapturePilot matches and respond using the template.</li>
                        <li>Use the <strong>CO Outreach Sequence</strong> to follow up with the contracting officer.</li>
                        <li>Book your <strong>30-min Founder Onboarding Call</strong> — we&apos;ll review your first response live.</li>
                    </ol>
                    <div className="flex flex-col sm:flex-row gap-3 mt-6">
                        <a
                            href="https://calendly.com/capturepilot/startup-pack-onboarding"
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
// Sticky category nav — 10 pills that scroll to the matching section anchor.
// Lives just below the hero, sticks at top with a soft backdrop blur. Uses
// native anchor links (`href="#category-..."`) so it works without JS too.
// ──────────────────────────────────────────────────────────────────────────────
function CategoryNav() {
    return (
        <nav
            aria-label="Kit categories"
            className="sticky top-2 z-30 bg-white/85 backdrop-blur-md border border-stone-200 rounded-2xl px-3 py-2.5 shadow-sm"
        >
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-thin">
                <span className="text-[10px] font-bold uppercase tracking-widest text-stone-400 px-2 flex-shrink-0">
                    Jump to
                </span>
                {STARTUP_PACK_SECTIONS.map((section, i) => {
                    const Icon = ICON_MAP[section.icon] || FileText;
                    const count = STARTUP_PACK_ASSETS.filter(a => a.category === section.category).length;
                    return (
                        <a
                            key={section.category}
                            href={`#${anchorIdFor(section.category)}`}
                            className="group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-50 hover:bg-emerald-50 border border-stone-200 hover:border-emerald-300 text-xs font-bold text-stone-700 hover:text-emerald-700 whitespace-nowrap transition-colors flex-shrink-0"
                        >
                            <span className="text-[10px] tabular-nums text-stone-400 group-hover:text-emerald-500">
                                {sectionNumber(i)}
                            </span>
                            <Icon className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">{section.label.replace(/ Kit$| Playbooks$| Library$| Toolkit$| Worksheets$| Templates$/i, "")}</span>
                            <span className="text-[10px] font-semibold tabular-nums bg-stone-200 group-hover:bg-emerald-200 text-stone-600 group-hover:text-emerald-800 px-1.5 py-0.5 rounded">
                                {count}
                            </span>
                        </a>
                    );
                })}
            </div>
        </nav>
    );
}

// ──────────────────────────────────────────────────────────────────────────────
// "What's in this kit" — 10 clickable tiles, mirrors the brand aesthetic of
// the rest of the page (emerald gradient, stone surfaces, rounded-[28px]).
// Replaces the old "Coming this week" video placeholder.
// ──────────────────────────────────────────────────────────────────────────────
function KitOverview() {
    return (
        <section className="bg-white border border-stone-200 rounded-[28px] p-6 sm:p-8 shadow-sm">
            <div className="flex items-start gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0">
                    <Sparkles className="w-5 h-5" />
                </div>
                <div>
                    <h2 className="font-bold text-lg text-stone-900">What&apos;s in this kit</h2>
                    <p className="text-sm text-stone-500 leading-snug">
                        Ten kits, every template you need. Click any tile to jump straight to it.
                    </p>
                </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
                {STARTUP_PACK_SECTIONS.map((section, i) => {
                    const Icon = ICON_MAP[section.icon] || FileText;
                    const count = STARTUP_PACK_ASSETS.filter(a => a.category === section.category).length;
                    return (
                        <a
                            key={section.category}
                            href={`#${anchorIdFor(section.category)}`}
                            className="group relative bg-gradient-to-br from-stone-50 to-white hover:from-emerald-50 hover:to-white border border-stone-200 hover:border-emerald-300 rounded-2xl p-4 transition-all hover:shadow-md hover:-translate-y-0.5"
                        >
                            <div className="flex items-center justify-between mb-2.5">
                                <span className="text-[10px] font-bold tabular-nums uppercase tracking-widest text-stone-400 group-hover:text-emerald-500">
                                    {sectionNumber(i)}
                                </span>
                                <span className="text-[10px] font-bold tabular-nums bg-stone-100 group-hover:bg-emerald-100 text-stone-600 group-hover:text-emerald-700 px-1.5 py-0.5 rounded">
                                    {count} {count === 1 ? "asset" : "assets"}
                                </span>
                            </div>
                            <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center mb-2">
                                <Icon className="w-4.5 h-4.5" />
                            </div>
                            <p className="font-bold text-[13px] text-stone-900 leading-snug">
                                {section.label}
                            </p>
                        </a>
                    );
                })}
            </div>
        </section>
    );
}

// ──────────────────────────────────────────────────────────────────────────────
// SectionBlock — one per category. Has #category-<cat> anchor, numbered label,
// asset-count chip, and a collapse/expand toggle (default = expanded).
// ──────────────────────────────────────────────────────────────────────────────
function SectionBlock({ section, index }: { section: AssetSection; index: number }) {
    const Icon = ICON_MAP[section.icon] || FileText;
    const assets = useMemo(
        () => STARTUP_PACK_ASSETS.filter(a => a.category === section.category),
        [section.category],
    );
    const [open, setOpen] = useState(true);
    if (assets.length === 0) return null;

    return (
        <section
            id={anchorIdFor(section.category)}
            // Scroll-margin so the sticky nav doesn't overlap the section header when jumping.
            className="scroll-mt-24"
        >
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                aria-expanded={open ? "true" : "false"}
                aria-controls={`${anchorIdFor(section.category)}-body`}
                className="w-full flex items-start gap-3 mb-4 px-1 text-left group"
            >
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center flex-wrap gap-2">
                        <span className="text-[10px] font-bold tabular-nums uppercase tracking-widest text-stone-400">
                            {sectionNumber(index)} ·
                        </span>
                        <h2 className="font-bold text-lg text-stone-900 group-hover:text-emerald-700 transition-colors">
                            {section.label}
                        </h2>
                        <span className="text-[10px] font-bold tabular-nums bg-stone-100 text-stone-600 border border-stone-200 px-2 py-0.5 rounded">
                            {assets.length} {assets.length === 1 ? "asset" : "assets"}
                        </span>
                    </div>
                    <p className="text-sm text-stone-500 leading-snug mt-0.5">{section.description}</p>
                </div>
                <ChevronDown
                    className={clsx(
                        "w-5 h-5 text-stone-400 group-hover:text-stone-600 flex-shrink-0 mt-2 transition-transform",
                        open ? "rotate-180" : "rotate-0",
                    )}
                />
            </button>
            {open && (
                <div
                    id={`${anchorIdFor(section.category)}-body`}
                    className="grid grid-cols-1 md:grid-cols-2 gap-3"
                >
                    {assets.map(asset => <AssetCard key={asset.id} asset={asset} />)}
                </div>
            )}
        </section>
    );
}

function AssetCard({ asset }: { asset: StartupPackAsset }) {
    const { previewUrl, downloadUrl } = resolveDriveLinks(asset);
    const available = !!previewUrl;
    const isLocal = !!asset.localPath;
    const isCalendly = asset.format === "Calendly";

    // Label the primary CTA based on where the file lives.
    const openLabel = isCalendly
        ? "Open in Calendly"
        : isLocal
            ? "View"
            : "Open in Drive";

    return (
        <div
            className={clsx(
                "bg-white border rounded-2xl p-5 transition-all",
                available ? "border-stone-200 hover:border-emerald-300 hover:shadow-md" : "border-stone-200 opacity-70",
            )}
        >
            <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest bg-stone-100 text-stone-600 border border-stone-200 px-2 py-0.5 rounded">
                        {asset.format}
                    </span>
                    {asset.sizeHint && (
                        <span className="text-[10px] text-stone-400">{asset.sizeHint}</span>
                    )}
                </div>
                {asset.badge && (
                    <span className="text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded uppercase">
                        {asset.badge}
                    </span>
                )}
            </div>
            <h3 className="font-bold text-sm text-stone-900 leading-snug">{asset.title}</h3>
            <p className="text-xs text-stone-500 mt-1 leading-relaxed">{asset.description}</p>

            <div className="mt-4 flex flex-wrap gap-2">
                {available ? (
                    <>
                        <a
                            href={previewUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 bg-emerald-600 text-white text-xs font-bold px-3 py-2 rounded-lg hover:bg-emerald-700 transition-colors"
                        >
                            <ExternalLink className="w-3.5 h-3.5" />
                            {openLabel}
                        </a>
                        {downloadUrl && !isCalendly && (
                            <a
                                href={downloadUrl}
                                download={isLocal ? "" : undefined}
                                className="inline-flex items-center gap-1.5 bg-white border border-stone-200 text-stone-700 text-xs font-bold px-3 py-2 rounded-lg hover:border-stone-300 transition-colors"
                            >
                                <Download className="w-3.5 h-3.5" /> Download
                            </a>
                        )}
                    </>
                ) : (
                    <span className="text-[11px] text-stone-400 italic">Coming soon — we&apos;ll email you the link.</span>
                )}
            </div>
        </div>
    );
}
