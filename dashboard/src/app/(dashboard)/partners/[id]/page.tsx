"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Globe, Hash, Users, MapPin, Briefcase, Save, Loader2, Trash2, CheckCircle2, Handshake } from "lucide-react";
import clsx from "clsx";
import { NAICS_CODES } from "@/lib/naics-codes";

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
            </div>

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
