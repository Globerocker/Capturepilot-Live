"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Globe, Hash, Users, MapPin, Briefcase, Save, Loader2, Trash2, CheckCircle2, Handshake, RefreshCw, Sparkles } from "lucide-react";
import clsx from "clsx";
import { NAICS_CODES } from "@/lib/naics-codes";
import { PastAwardsPanel } from "@/components/PastAwardsPanel";
import { SubawardsPanel } from "@/components/SubawardsPanel";
import { ContractorDetailView } from "@/components/ContractorDetailView";

interface Partner {
    id: string;
    company_name: string;
    website: string | null;
    uei: string | null;
    naics_codes: string[];
    state: string | null;
    certifications: string[];
    status: "active" | "potential" | "archived";
    description: string | null;
    notes: string | null;
    last_analyzed_at: string | null;
    crawl_data: Record<string, unknown> | null;
}

function lookupNaicsLabel(code: string): string {
    return NAICS_CODES.find(n => n.code === code)?.label || "";
}

export default function PartnerDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const [partner, setPartner] = useState<Partner | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [savedFlash, setSavedFlash] = useState(false);
    const [notes, setNotes] = useState("");

    useEffect(() => {
        (async () => {
            const res = await fetch(`/api/partners/${id}`);
            if (res.status === 401) { router.push("/login"); return; }
            if (!res.ok) { router.push("/partners"); return; }
            const body = await res.json() as { partner: Partner };
            setPartner(body.partner);
            setNotes(body.partner.notes || "");
            setLoading(false);
        })();
    }, [id, router]);

    const updateStatus = async (status: "active" | "potential" | "archived") => {
        if (!partner) return;
        setSaving(true);
        const res = await fetch(`/api/partners/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status }),
        });
        if (res.ok) {
            const body = await res.json() as { partner: Partner };
            setPartner(body.partner);
            setSavedFlash(true);
            setTimeout(() => setSavedFlash(false), 1500);
        }
        setSaving(false);
    };

    const saveNotes = async () => {
        if (!partner) return;
        setSaving(true);
        const res = await fetch(`/api/partners/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ notes }),
        });
        if (res.ok) {
            setSavedFlash(true);
            setTimeout(() => setSavedFlash(false), 1500);
        }
        setSaving(false);
    };

    const remove = async () => {
        if (!confirm("Remove this partner from your list?")) return;
        const res = await fetch(`/api/partners/${id}`, { method: "DELETE" });
        if (res.ok) router.push("/partners");
    };

    const [refreshing, setRefreshing] = useState(false);
    const [refreshMsg, setRefreshMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

    const refreshCrawl = async () => {
        if (!partner?.website) {
            setRefreshMsg({ type: "error", text: "Partner has no website to crawl." });
            return;
        }
        setRefreshing(true);
        setRefreshMsg(null);
        try {
            const res = await fetch(`/api/partners/${id}/refresh`, { method: "POST" });
            const body = await res.json() as { success?: boolean; pages_crawled?: number; error?: string };
            if (res.ok && body.success) {
                setRefreshMsg({ type: "success", text: `Crawled ${body.pages_crawled ?? 0} pages. Keywords + description refreshed.` });
                // Reload partner so UI reflects new data.
                const r = await fetch(`/api/partners/${id}`);
                if (r.ok) {
                    const b = await r.json() as { partner: Partner };
                    setPartner(b.partner);
                }
            } else {
                setRefreshMsg({ type: "error", text: body.error || "Refresh failed." });
            }
        } catch (e) {
            setRefreshMsg({ type: "error", text: (e as Error).message });
        }
        setRefreshing(false);
        setTimeout(() => setRefreshMsg(null), 5000);
    };

    if (loading) {
        return <div className="flex justify-center items-center min-h-[400px]"><Loader2 className="w-8 h-8 animate-spin text-stone-400" /></div>;
    }
    if (!partner) return null;

    const statusStyle = partner.status === "active"
        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
        : partner.status === "potential"
            ? "bg-blue-50 text-blue-700 border-blue-200"
            : "bg-stone-100 text-stone-500 border-stone-200";

    return (
        <div className="max-w-5xl mx-auto pb-12 space-y-6">
            <Link href="/partners" className="inline-flex items-center gap-1.5 text-xs text-stone-500 hover:text-black transition-colors">
                <ArrowLeft className="w-3.5 h-3.5" /> Back to partners
            </Link>

            <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-3 flex-wrap mb-2">
                            <h1 className="text-xl sm:text-2xl font-bold text-black">{partner.company_name}</h1>
                            <span className={clsx("text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border", statusStyle)}>
                                {partner.status}
                            </span>
                        </div>
                        {partner.description && <p className="text-sm text-stone-600 leading-relaxed">{partner.description}</p>}
                        <div className="flex flex-wrap items-center gap-2 mt-3">
                            {partner.website && (
                                <a href={partner.website} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-stone-700 bg-white border border-stone-200 px-3 py-1.5 rounded-full inline-flex items-center gap-1 hover:bg-stone-50">
                                    <Globe className="w-3.5 h-3.5" /> Website
                                </a>
                            )}
                            {partner.uei && (
                                <span className="text-[10px] font-mono bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1 rounded-full inline-flex items-center gap-1">
                                    <Hash className="w-3 h-3" /> UEI: {partner.uei}
                                </span>
                            )}
                            {partner.state && (
                                <span className="text-[10px] bg-stone-100 text-stone-700 border border-stone-200 px-2.5 py-1 rounded-full inline-flex items-center gap-1">
                                    <MapPin className="w-3 h-3" /> {partner.state}
                                </span>
                            )}
                            {partner.certifications.map((c, i) => (
                                <span key={i} className="text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-full uppercase">
                                    {c}
                                </span>
                            ))}
                        </div>
                    </div>
                    <div className="flex flex-col gap-1.5 flex-shrink-0">
                        <button
                            type="button"
                            disabled={saving}
                            onClick={() => updateStatus(partner.status === "active" ? "potential" : "active")}
                            className={clsx(
                                "text-[10px] font-bold px-3 py-1.5 rounded-lg border inline-flex items-center gap-1 disabled:opacity-50",
                                partner.status === "active" ? "bg-white text-stone-700 border-stone-200 hover:bg-stone-50" : "bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700",
                            )}
                        >
                            <Handshake className="w-3.5 h-3.5" />
                            {partner.status === "active" ? "Mark Potential" : "Mark Active"}
                        </button>
                        {partner.website && (
                            <button
                                type="button"
                                disabled={refreshing}
                                onClick={refreshCrawl}
                                className="text-[10px] font-bold px-3 py-1.5 rounded-lg border bg-white text-stone-700 border-stone-200 hover:bg-stone-50 inline-flex items-center gap-1 disabled:opacity-50"
                                title="Re-crawl the partner's website and refresh description + keywords"
                            >
                                {refreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                                {refreshing ? "Crawling…" : "Refresh Crawl"}
                            </button>
                        )}
                        <button
                            type="button"
                            disabled={saving}
                            onClick={remove}
                            className="text-[10px] font-bold px-3 py-1.5 rounded-lg border bg-white text-rose-600 border-stone-200 hover:bg-rose-50 inline-flex items-center gap-1 disabled:opacity-50"
                        >
                            <Trash2 className="w-3.5 h-3.5" /> Remove
                        </button>
                    </div>
                </div>
                {refreshMsg && (
                    <div className={clsx(
                        "mt-3 text-xs px-3 py-2 rounded-lg border",
                        refreshMsg.type === "success" ? "bg-emerald-50 text-emerald-800 border-emerald-200" : "bg-rose-50 text-rose-700 border-rose-200",
                    )}>
                        {refreshMsg.text}
                    </div>
                )}
            </div>

            {/* Unified rich detail view — strengths/weaknesses (Ollama),
                POC enrichment, agency/NAICS breakdowns, active opps where
                this partner is the incumbent. Only renders when we have
                a UEI (the basis for cross-referencing the contractors table). */}
            {partner.uei && (
                <ContractorDetailView uei={partner.uei} fallbackName={partner.company_name} />
            )}

            {/* Federal award history — live from USASpending.gov */}
            {!partner.uei && (
                <PastAwardsPanel name={partner.company_name} uei={partner.uei} />
            )}

            {/* Teaming graph — primes they sub for, subs they hire. Great for partner fit. */}
            <SubawardsPanel name={partner.company_name} uei={partner.uei} />

            {/* Auto-extracted capability keywords from the latest crawl. */}
            {(() => {
                const crawl = (partner.crawl_data || {}) as Record<string, unknown>;
                const primary = Array.isArray(crawl.primary_keywords) ? (crawl.primary_keywords as string[]) : [];
                const secondary = Array.isArray(crawl.secondary_keywords) ? (crawl.secondary_keywords as string[]) : [];
                if (primary.length === 0 && secondary.length === 0) return null;
                return (
                    <div className="bg-white border border-stone-200 rounded-2xl p-6">
                        <h2 className="font-bold text-sm uppercase tracking-widest text-stone-700 mb-3 flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-stone-400" /> Capability Keywords
                            <span className="text-[10px] text-stone-400 normal-case tracking-normal font-normal ml-auto">Auto-extracted from website</span>
                        </h2>
                        {primary.length > 0 && (
                            <div className="mb-3">
                                <p className="text-[10px] uppercase tracking-widest text-emerald-700 mb-1.5 font-bold">Primary</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {primary.map((kw, i) => (
                                        <span key={i} className="text-xs bg-emerald-50 text-emerald-900 border border-emerald-200 px-2.5 py-1 rounded-full font-medium">{kw}</span>
                                    ))}
                                </div>
                            </div>
                        )}
                        {secondary.length > 0 && (
                            <div>
                                <p className="text-[10px] uppercase tracking-widest text-stone-500 mb-1.5 font-bold">Secondary</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {secondary.map((kw, i) => (
                                        <span key={i} className="text-xs bg-stone-50 text-stone-700 border border-stone-200 px-2.5 py-1 rounded-full">{kw}</span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                );
            })()}

            {partner.naics_codes.length > 0 && (
                <div className="bg-white border border-stone-200 rounded-2xl p-6">
                    <h2 className="font-bold text-sm uppercase tracking-widest text-stone-700 mb-3 flex items-center gap-2">
                        <Briefcase className="w-4 h-4 text-stone-400" /> NAICS Codes
                    </h2>
                    <div className="space-y-1.5">
                        {partner.naics_codes.map((code, i) => (
                            <div key={i} className="flex items-center gap-3 py-1.5 border-b border-stone-50 last:border-0">
                                <span className="font-mono text-xs bg-stone-100 text-stone-700 px-2 py-0.5 rounded font-bold">{code}</span>
                                <span className="text-xs text-stone-600">{lookupNaicsLabel(code) || "—"}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="bg-white border border-stone-200 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-3">
                    <h2 className="font-bold text-sm uppercase tracking-widest text-stone-700 flex items-center gap-2">
                        <Users className="w-4 h-4 text-stone-400" /> Notes
                    </h2>
                    {savedFlash && <span className="text-[10px] text-emerald-600 font-bold inline-flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Saved</span>}
                </div>
                <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    rows={5}
                    placeholder="Track touchpoints, past teaming history, or why this partner is shortlisted."
                    className="w-full px-3 py-2 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm resize-none"
                />
                <button
                    type="button"
                    onClick={saveNotes}
                    disabled={saving}
                    className="mt-2 bg-black text-white px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                    {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save Notes
                </button>
            </div>
        </div>
    );
}
