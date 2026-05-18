"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
    Loader2, FileText, Search, Scale, Award, Trophy, Mail, DollarSign, Video,
    ExternalLink, Download, CheckCircle2, ArrowRight, AlertCircle, Sparkles, PlayCircle,
    ClipboardCheck, BookOpen, Building2,
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

    const totalAssets = STARTUP_PACK_ASSETS.filter(a => a.gdriveUrl).length;
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

                {/* Welcome video — TODO: drop in the founder orientation video (YouTube/Vimeo embed
                    or a direct MP4). Until then we render a polished placeholder so the page never
                    ships with a "Rickroll" or broken iframe. */}
                <section className="bg-gradient-to-br from-stone-900 to-stone-800 rounded-[28px] overflow-hidden shadow-xl">
                    <div className="relative aspect-video flex items-center justify-center px-6 text-center">
                        <div>
                            <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 flex items-center justify-center mx-auto mb-4 ring-4 ring-emerald-500/10">
                                <PlayCircle className="w-8 h-8 text-emerald-400" />
                            </div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-300">Coming this week</p>
                            <h3 className="font-bold text-xl text-white mt-1">Founder orientation video</h3>
                            <p className="text-white/65 text-sm mt-2 max-w-md mx-auto leading-relaxed">
                                A 4-minute walkthrough of every asset and the 30-day plan to your first
                                federal RFI response. We&apos;ll email you the link as soon as it&apos;s up.
                            </p>
                        </div>
                    </div>
                    <div className="border-t border-white/10 p-5 sm:p-6 flex items-start gap-3">
                        <PlayCircle className="w-6 h-6 text-emerald-400 flex-shrink-0 mt-0.5" />
                        <div className="text-white/90 text-sm">
                            <p className="font-bold mb-1">Don&apos;t wait for the video — start below</p>
                            <p className="text-white/65 leading-relaxed">
                                Every asset is live and downloadable right now. Open the Capability Statement template first.
                            </p>
                        </div>
                    </div>
                </section>

                {/* Asset sections */}
                {STARTUP_PACK_SECTIONS.map((section) => (
                    <SectionBlock key={section.category} section={section} />
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

function SectionBlock({ section }: { section: AssetSection }) {
    const Icon = ICON_MAP[section.icon] || FileText;
    const assets = STARTUP_PACK_ASSETS.filter(a => a.category === section.category);
    if (assets.length === 0) return null;

    return (
        <section>
            <div className="flex items-start gap-3 mb-4 px-1">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-5 h-5" />
                </div>
                <div>
                    <h2 className="font-bold text-lg text-stone-900">{section.label}</h2>
                    <p className="text-sm text-stone-500 leading-snug">{section.description}</p>
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {assets.map(asset => <AssetCard key={asset.id} asset={asset} />)}
            </div>
        </section>
    );
}

function AssetCard({ asset }: { asset: StartupPackAsset }) {
    const { previewUrl, downloadUrl } = resolveDriveLinks(asset);
    const available = !!previewUrl;

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
                            Open in {asset.format === "Calendly" ? "Calendly" : "Drive"}
                        </a>
                        {downloadUrl && (
                            <a
                                href={downloadUrl}
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
