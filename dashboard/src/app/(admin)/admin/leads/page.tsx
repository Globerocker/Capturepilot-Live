"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
    Globe, MapPin, Users, ExternalLink, Save, Search,
    Loader2, ChevronDown, Hash, Building2, Mail, Phone, User,
    Linkedin, Calendar, Briefcase, Target, FileDown, Send, MessageSquare, Database
} from "lucide-react";
import Image from "next/image";
import clsx from "clsx";

interface Prospect {
    id: string;
    company_name: string;
    website: string;
    uei: string | null;
    status: string;
    company_summary: string | null;
    sam_data: Record<string, unknown> | null;
    inferred_naics: { code: string; label: string; confidence: number }[];
    preview_matches: { title?: string; agency?: string; score: number; classification: string; award_amount?: number; notice_id?: string }[];
    inferred_profile: Record<string, unknown>;
    crawl_data: Record<string, unknown>;
    is_saved: boolean;
    lead_email: string | null;
    created_at: string;
    readiness_score?: number;
    readiness_breakdown?: Record<string, number>;
}

export default function AdminProspectsPage() {
    const [prospects, setProspects] = useState<Prospect[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<"all" | "saved">("all");
    const [searchTerm, setSearchTerm] = useState("");
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [loadingStatus, setLoadingStatus] = useState<Record<string, string>>({});

    useEffect(() => {
        setLoading(true);
        fetch(`/api/prospects/list${filter === "saved" ? "?saved=true" : ""}`)
            .then(res => res.json())
            .then(data => setProspects(data.prospects || []))
            .catch(() => setProspects([]))
            .finally(() => setLoading(false));
    }, [filter]);

    const filtered = prospects.filter(p => {
        if (!searchTerm) return true;
        const term = searchTerm.toLowerCase();
        return (
            p.company_name.toLowerCase().includes(term) ||
            (p.website || "").toLowerCase().includes(term) ||
            (p.uei || "").toLowerCase().includes(term)
        );
    });

    const toggleSave = async (id: string, currentlySaved: boolean) => {
        const newSaved = !currentlySaved;
        setProspects(prev => prev.map(p => p.id === id ? { ...p, is_saved: newSaved } : p));
        await fetch("/api/prospects/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ analysis_id: id }),
        });
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
    };

    const getBestScore = (p: Prospect) => {
        if (!p.preview_matches?.length) return 0;
        return Math.max(...p.preview_matches.map(m => m.score));
    };

    return (
        <div className="min-h-screen bg-stone-50">
            {/* Header */}
            <header className="bg-white border-b border-stone-200 px-4 sm:px-6 py-4">
                <div className="max-w-7xl mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Link href="/check" className="flex items-center gap-2">
                            <Image src="/logo.png" alt="CP" width={20} height={20} className="rounded" />
                            <span className="font-bold text-base">CapturePilot</span>
                        </Link>
                        <span className="text-[9px] bg-black text-white px-2 py-0.5 rounded-full uppercase">Admin</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-stone-500">
                        <Briefcase className="w-4 h-4" />
                        {prospects.length} prospects
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-4">
                {/* Filters */}
                <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => setFilter("all")}
                            className={clsx(
                                "text-xs font-bold px-4 py-2 rounded-xl border transition-all",
                                filter === "all" ? "bg-black text-white border-black" : "bg-white text-stone-600 border-stone-200 hover:border-stone-300"
                            )}
                        >
                            All Prospects
                        </button>
                        <button
                            type="button"
                            onClick={() => setFilter("saved")}
                            className={clsx(
                                "text-xs font-bold px-4 py-2 rounded-xl border transition-all inline-flex items-center gap-1",
                                filter === "saved" ? "bg-black text-white border-black" : "bg-white text-stone-600 border-stone-200 hover:border-stone-300"
                            )}
                        >
                            <Save className="w-3 h-3" /> Saved Only
                        </button>
                    </div>
                    <div className="relative w-full sm:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                        <input
                            type="text"
                            placeholder="Search company or UEI..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 rounded-xl border border-stone-200 text-sm focus:outline-none focus:border-stone-400"
                        />
                    </div>
                </div>

                {/* Prospects List */}
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="w-8 h-8 text-stone-400 animate-spin" />
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-stone-200 border-dashed p-12 text-center">
                        <Briefcase className="w-10 h-10 text-stone-300 mx-auto mb-3" />
                        <p className="text-stone-500">No prospects found</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {filtered.map(prospect => {
                            const sam = prospect.sam_data as Record<string, unknown> | null;
                            const profile = prospect.inferred_profile as Record<string, unknown>;
                            const crawl = prospect.crawl_data as Record<string, unknown>;
                            const uei = (sam?.uei || profile?.uei || prospect.uei || "") as string;
                            const cage = (sam?.cage_code || profile?.cage_code || "") as string;
                            const state = (sam?.state || profile?.state || "") as string;
                            const contact = profile?.contact_person as { name: string; title: string; email?: string; phone?: string } | null;
                            const social = (crawl?.social_links || {}) as Record<string, string>;
                            const topMatch = prospect.preview_matches?.[0];
                            const bestScore = getBestScore(prospect);
                            const isExpanded = expandedId === prospect.id;

                            return (
                                <div key={prospect.id} className="bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden">
                                    {/* Row header */}
                                    <button
                                        type="button"
                                        onClick={() => setExpandedId(isExpanded ? null : prospect.id)}
                                        className="w-full text-left px-4 sm:px-6 py-4 flex items-center gap-4 hover:bg-stone-50/50 transition-colors"
                                    >
                                        {/* Score */}
                                        <div className={clsx(
                                            "w-10 h-10 rounded-xl border-2 font-black text-sm flex items-center justify-center flex-shrink-0",
                                            bestScore >= 0.70 ? "text-emerald-600 bg-emerald-50 border-emerald-200" :
                                            bestScore >= 0.50 ? "text-amber-600 bg-amber-50 border-amber-200" :
                                            bestScore > 0 ? "text-blue-600 bg-blue-50 border-blue-200" :
                                            "text-stone-400 bg-stone-50 border-stone-200"
                                        )}>
                                            {bestScore > 0 ? Math.round(bestScore * 100) : "—"}
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                                <p className="font-bold text-sm text-black truncate">{prospect.company_name}</p>
                                                {prospect.is_saved && (
                                                    <span className="text-[9px] font-bold bg-blue-50 text-blue-600 border border-blue-200 px-1.5 py-0.5 rounded">SAVED</span>
                                                )}
                                                {(prospect.inferred_profile as any)?.synced_to_hubspot && (
                                                    <span className="text-[9px] font-bold bg-orange-50 text-orange-600 border border-orange-200 px-1.5 py-0.5 rounded">HUBSPOT</span>
                                                )}
                                                {sam && (
                                                    <span className="text-[9px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-200 px-1.5 py-0.5 rounded">SAM</span>
                                                )}
                                                {prospect.status === "error" && (
                                                    <span className="text-[9px] font-bold bg-red-50 text-red-600 border border-red-200 px-1.5 py-0.5 rounded">ERROR</span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-3 text-xs text-stone-500">
                                                <span className="inline-flex items-center gap-1">
                                                    <Globe className="w-3 h-3" /> {prospect.website.replace(/^https?:\/\//, "")}
                                                </span>
                                                {state && (
                                                    <span className="inline-flex items-center gap-1">
                                                        <MapPin className="w-3 h-3" /> {state}
                                                    </span>
                                                )}
                                                {prospect.preview_matches?.length > 0 && (
                                                    <span className="inline-flex items-center gap-1">
                                                        <Target className="w-3 h-3" /> {prospect.preview_matches.length} matches
                                                    </span>
                                                )}
                                                <span className="inline-flex items-center gap-1">
                                                    <Calendar className="w-3 h-3" /> {formatDate(prospect.created_at)}
                                                </span>
                                            </div>
                                        </div>

                                        <ChevronDown className={clsx(
                                            "w-4 h-4 text-stone-400 flex-shrink-0 transition-transform",
                                            isExpanded && "rotate-180"
                                        )} />
                                    </button>

                                    {/* Expanded detail */}
                                    {isExpanded && (
                                        <div className="border-t border-stone-100 bg-stone-50/50 px-4 sm:px-6 py-5 space-y-4">
                                            <div className="flex gap-2 mb-3">
                                                <button
                                                    type="button"
                                                    onClick={() => toggleSave(prospect.id, prospect.is_saved)}
                                                    className={clsx(
                                                        "text-[10px] font-bold px-3 py-1.5 rounded-lg border inline-flex items-center gap-1 transition-all",
                                                        prospect.is_saved
                                                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                                            : "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
                                                    )}
                                                >
                                                    <Save className="w-3 h-3" /> {prospect.is_saved ? "Saved" : "Save"}
                                                </button>
                                                <Link
                                                    href={`/check/${prospect.id}`}
                                                    className="text-[10px] font-bold px-3 py-1.5 rounded-lg border bg-black text-white border-black inline-flex items-center gap-1 hover:bg-stone-800 transition-all"
                                                >
                                                    <ExternalLink className="w-3 h-3" /> Full Report
                                                </Link>
                                                <button
                                                    type="button"
                                                    onClick={async () => {
                                                        const email = prospect.lead_email || prompt("Client email address:");
                                                        if (!email) return;
                                                        const profile = prospect.inferred_profile || {};
                                                        const res = await fetch("/api/admin/clients", {
                                                            method: "POST",
                                                            headers: { "Content-Type": "application/json" },
                                                            body: JSON.stringify({
                                                                email,
                                                                company_name: prospect.company_name,
                                                                contact_name: (profile.contact_person as Record<string,string>)?.name || "",
                                                                contact_phone: (profile.contact_person as Record<string,string>)?.phone || "",
                                                                website: prospect.website,
                                                                uei: prospect.uei || (profile.uei as string) || "",
                                                                naics_codes: prospect.inferred_naics?.map(n => n.code) || [],
                                                                state: (profile.state as string) || "",
                                                                notes: `Converted from Quick Check analysis ${prospect.id}`,
                                                            }),
                                                        });
                                                        const data = await res.json();
                                                        if (data.success) {
                                                            alert(`Client created! Temp password: ${data.temp_password}`);
                                                        } else {
                                                            alert(`Error: ${data.error}`);
                                                        }
                                                    }}
                                                    className="text-[10px] font-bold px-3 py-1.5 rounded-lg border bg-emerald-600 text-white border-emerald-700 inline-flex items-center gap-1 hover:bg-emerald-700 transition-all"
                                                >
                                                    <Users className="w-3 h-3" /> Convert to Client
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={async () => {
                                                        const email = prospect.lead_email || prompt("Prospect email for outreach:");
                                                        if (!email) return;
                                                        const res = await fetch("/api/drafts/generate", {
                                                            method: "POST",
                                                            headers: { "Content-Type": "application/json" },
                                                            body: JSON.stringify({
                                                                company_name: prospect.company_name,
                                                                email,
                                                                naics_codes: prospect.inferred_naics?.map((n: { code: string }) => n.code) || [],
                                                                matches: prospect.preview_matches?.slice(0, 3) || [],
                                                                context: "prospect_outreach",
                                                            }),
                                                        });
                                                        if (res.ok) {
                                                            alert("AI outreach email drafted! Check the email drafts section.");
                                                        } else {
                                                            alert("Draft generation requires a user profile. Convert to client first.");
                                                        }
                                                    }}
                                                    className="text-[10px] font-bold px-3 py-1.5 rounded-lg border bg-blue-600 text-white border-blue-700 inline-flex items-center gap-1 hover:bg-blue-700 transition-all"
                                                >
                                                    <Send className="w-3 h-3" /> AI Outreach Email
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={loadingStatus[prospect.id] === "apollo"}
                                                    onClick={async () => {
                                                        setLoadingStatus(prev => ({ ...prev, [prospect.id]: "apollo" }));
                                                        const res = await fetch("/api/admin/leads/apollo", {
                                                            method: "POST",
                                                            body: JSON.stringify({ id: prospect.id })
                                                        });
                                                        const data = await res.json();
                                                        setLoadingStatus(prev => ({ ...prev, [prospect.id]: "" }));
                                                        if (data.success && data.phone) {
                                                            setProspects(prev => prev.map(p => p.id === prospect.id ? { ...p, inferred_profile: { ...p.inferred_profile, contact_person: { ...(p.inferred_profile as Record<string, unknown>)?.contact_person as any, phone: data.phone } } } : p));
                                                            alert(`Enriched! Found mobile: ${data.phone}`);
                                                        } else {
                                                            alert(data.error || "No phone found");
                                                        }
                                                    }}
                                                    className="text-[10px] font-bold px-3 py-1.5 rounded-lg border bg-violet-600 text-white border-violet-700 inline-flex items-center gap-1 hover:bg-violet-700 transition-all disabled:opacity-50"
                                                >
                                                    {loadingStatus[prospect.id] === "apollo" ? <Loader2 className="w-3 h-3 animate-spin"/> : <Search className="w-3 h-3" />} Enrich via Apollo
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={loadingStatus[prospect.id] === "hubspot" || !!(prospect.inferred_profile as any)?.synced_to_hubspot || !prospect.lead_email}
                                                    onClick={async () => {
                                                        setLoadingStatus(prev => ({ ...prev, [prospect.id]: "hubspot" }));
                                                        const res = await fetch("/api/admin/leads/hubspot", {
                                                            method: "POST",
                                                            body: JSON.stringify({ id: prospect.id })
                                                        });
                                                        const data = await res.json();
                                                        setLoadingStatus(prev => ({ ...prev, [prospect.id]: "" }));
                                                        if (data.success) {
                                                            setProspects(prev => prev.map(p => p.id === prospect.id ? { ...p, inferred_profile: { ...(p.inferred_profile as Record<string, unknown>), synced_to_hubspot: true } } : p));
                                                        } else {
                                                            alert(`Error: ${data.error}`);
                                                        }
                                                    }}
                                                    className={clsx("text-[10px] font-bold px-3 py-1.5 rounded-lg border inline-flex items-center gap-1 transition-all disabled:opacity-50", (prospect.inferred_profile as any)?.synced_to_hubspot ? "bg-stone-100 text-stone-400 border-stone-200" : "bg-orange-500 text-white border-orange-600 hover:bg-orange-600")}
                                                >
                                                    {loadingStatus[prospect.id] === "hubspot" ? <Loader2 className="w-3 h-3 animate-spin"/> : <Database className="w-3 h-3" />} {(prospect.inferred_profile as any)?.synced_to_hubspot ? "Synced to HubSpot" : "Send to HubSpot"}
                                                </button>
                                            </div>

                                            {/* Pipeline Status */}
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className="text-[10px] text-stone-400 uppercase">Status:</span>
                                                {["New", "Contacted", "Interested", "Meeting Scheduled", "Proposal Sent", "Won", "Lost"].map(status => (
                                                    <button
                                                        key={status}
                                                        type="button"
                                                        onClick={async () => {
                                                            // Store pipeline status in inferred_profile
                                                            await fetch("/api/prospects/save", {
                                                                method: "POST",
                                                                headers: { "Content-Type": "application/json" },
                                                                body: JSON.stringify({ analysis_id: prospect.id, pipeline_status: status }),
                                                            });
                                                            // Update local state
                                                            setProspects(prev => prev.map(p =>
                                                                p.id === prospect.id
                                                                    ? { ...p, inferred_profile: { ...p.inferred_profile, pipeline_status: status } }
                                                                    : p
                                                            ));
                                                        }}
                                                        className={clsx(
                                                            "text-[9px] font-bold px-2 py-0.5 rounded border transition-colors",
                                                            (prospect.inferred_profile as Record<string, unknown>)?.pipeline_status === status
                                                                ? "bg-black text-white border-black"
                                                                : "bg-white text-stone-500 border-stone-200 hover:border-stone-400"
                                                        )}
                                                    >
                                                        {status}
                                                    </button>
                                                ))}
                                            </div>

                                            {/* Summary */}
                                            {prospect.company_summary && (
                                                <p className="text-sm text-stone-600 leading-relaxed">{prospect.company_summary}</p>
                                            )}

                                            {/* Key info grid */}
                                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                                {prospect.readiness_score !== undefined && (
                                                    <div className="text-xs">
                                                        <p className="text-[10px] text-stone-400 uppercase">Readiness</p>
                                                        <p className="font-bold text-stone-700">{prospect.readiness_score}/10</p>
                                                    </div>
                                                )}
                                                {uei && (
                                                    <div className="text-xs">
                                                        <p className="text-[10px] text-stone-400 uppercase">UEI</p>
                                                        <p className="font-mono font-bold text-stone-700">{uei}</p>
                                                    </div>
                                                )}
                                                {cage && (
                                                    <div className="text-xs">
                                                        <p className="text-[10px] text-stone-400 uppercase">CAGE</p>
                                                        <p className="font-mono font-bold text-stone-700">{cage}</p>
                                                    </div>
                                                )}
                                                {state && (
                                                    <div className="text-xs">
                                                        <p className="text-[10px] text-stone-400 uppercase">State</p>
                                                        <p className="font-bold text-stone-700">{state}</p>
                                                    </div>
                                                )}
                                                {prospect.lead_email && (
                                                    <div className="text-xs">
                                                        <p className="text-[10px] text-stone-400 uppercase">Email</p>
                                                        <p className="font-bold text-stone-700">{prospect.lead_email}</p>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Contact person */}
                                            {contact && (
                                                <div className="flex items-center gap-3 bg-white border border-stone-200 rounded-xl p-3">
                                                    <div className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center font-bold text-xs flex-shrink-0">
                                                        {contact.name.charAt(0)}
                                                    </div>
                                                    <div className="text-xs min-w-0">
                                                        <p className="font-bold text-stone-700">{contact.name} <span className="font-normal text-stone-500">— {contact.title}</span></p>
                                                        <div className="flex gap-3 mt-0.5">
                                                            {contact.email && <span className="text-blue-600 inline-flex items-center gap-1"><Mail className="w-3 h-3" />{contact.email}</span>}
                                                            {contact.phone && <span className="text-blue-600 inline-flex items-center gap-1"><Phone className="w-3 h-3" />{contact.phone}</span>}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Social links */}
                                            {(social.linkedin || social.facebook || social.twitter) && (
                                                <div className="flex gap-2">
                                                    {social.linkedin && (
                                                        <a href={social.linkedin} target="_blank" rel="noopener noreferrer" className="text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1.5 rounded-lg inline-flex items-center gap-1">
                                                            <Linkedin className="w-3 h-3" /> LinkedIn
                                                        </a>
                                                    )}
                                                </div>
                                            )}

                                            {/* NAICS */}
                                            {prospect.inferred_naics?.length > 0 && (
                                                <div>
                                                    <p className="text-[10px] text-stone-400 uppercase mb-1">NAICS Codes</p>
                                                    <div className="flex gap-1.5 flex-wrap">
                                                        {prospect.inferred_naics.slice(0, 5).map(n => (
                                                            <span key={n.code} className="text-[10px] font-mono bg-stone-100 text-stone-600 border border-stone-200 px-2 py-0.5 rounded">
                                                                {n.code} ({Math.round(n.confidence * 100)}%)
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Top matches */}
                                            {prospect.preview_matches?.length > 0 && (
                                                <div>
                                                    <p className="text-[10px] text-stone-400 uppercase mb-1">Top Matches</p>
                                                    <div className="space-y-1.5">
                                                        {prospect.preview_matches.slice(0, 3).map((m, i) => (
                                                            <div key={i} className="flex items-center gap-2 text-xs bg-white border border-stone-200 rounded-lg px-3 py-2">
                                                                <span className={clsx(
                                                                    "font-bold font-mono w-8 text-center",
                                                                    m.score >= 0.7 ? "text-emerald-600" : m.score >= 0.5 ? "text-amber-600" : "text-blue-600"
                                                                )}>
                                                                    {Math.round(m.score * 100)}
                                                                </span>
                                                                <span className="text-stone-700 truncate flex-1">{m.title || "Untitled"}</span>
                                                                <span className="text-stone-400 text-[10px] flex-shrink-0">{m.agency}</span>
                                                                {m.notice_id && (
                                                                    <a href={`https://sam.gov/opp/${m.notice_id}/view`} target="_blank" rel="noopener noreferrer" className="text-blue-600">
                                                                        <ExternalLink className="w-3 h-3" />
                                                                    </a>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </main>
        </div>
    );
}
