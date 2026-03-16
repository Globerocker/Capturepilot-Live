"use client";

import { useState, useEffect } from "react";
import { createSupabaseClient } from "@/lib/supabase/client";
import { ArrowLeft, Building, Target, Link as LinkIcon, MapPin, Phone, Award, ShieldCheck, DollarSign, Users, Truck, Briefcase, Activity, ExternalLink, Edit2, Save, X, Loader2, Flame, Globe, Star, Mail } from "lucide-react";
import Link from "next/link";
import clsx from "clsx";
import { useRouter } from "next/navigation";

const supabase = createSupabaseClient();

interface MatchRecord {
    id: string;
    opportunity_id: string;
    contractor_id: string;
    score: number;
    classification: string;
    opportunities: { title?: string; agency?: string; naics_code?: string; notice_type?: string; response_deadline?: string } | null;
}

function MatchHistoryPanel({ contractorId }: { contractorId: string }) {
    const [matches, setMatches] = useState<MatchRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        async function fetchMatches() {
            setLoading(true);
            // Flat query to avoid PGRST200 FK error
            const { data: rawMatches } = await supabase
                .from("matches")
                .select("id, opportunity_id, contractor_id, score, classification")
                .eq("contractor_id", contractorId)
                .order("score", { ascending: false })
                .limit(10);

            const rows = rawMatches || [];
            if (rows.length === 0) { setMatches([]); setLoading(false); return; }

            const oppIds = [...new Set(rows.map((m: Record<string, string>) => m.opportunity_id))];
            const { data: opps } = await supabase
                .from("opportunities")
                .select("id, title, agency, naics_code, notice_type, response_deadline")
                .in("id", oppIds);
            const oppMap = new Map((opps || []).map((o: Record<string, string>) => [o.id, o]));

            setMatches(rows.map((m: Record<string, unknown>) => ({
                ...m,
                opportunities: oppMap.get(m.opportunity_id as string) || null,
            })) as unknown as MatchRecord[]);
            setLoading(false);
        }
        fetchMatches();
    }, [contractorId]);

    if (loading) return (
        <div className="bg-white rounded-[32px] border border-stone-200 shadow-sm p-8">
            <h2 className="font-typewriter text-lg font-bold mb-4 flex items-center">
                <Flame className="w-5 h-5 mr-3 text-stone-400" /> Match History
            </h2>
            <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 animate-spin text-stone-400" /></div>
        </div>
    );

    return (
        <div className="bg-white rounded-[32px] border border-stone-200 shadow-sm p-8">
            <h2 className="font-typewriter text-lg font-bold mb-6 flex items-center">
                <Flame className="w-5 h-5 mr-3 text-stone-400" /> Match History
                {matches.length > 0 && (
                    <span className="ml-3 text-xs font-sans font-medium bg-stone-100 px-2.5 py-0.5 rounded-full text-stone-500 border border-stone-200">{matches.length}</span>
                )}
            </h2>
            {matches.length === 0 ? (
                <p className="text-stone-400 text-sm font-typewriter">No matches found. Run the Scoring Engine to generate matches.</p>
            ) : (
                <div className="space-y-3">
                    {matches.map((m) => {
                        const opp = m.opportunities || {};
                        return (
                            <div
                                key={m.id}
                                className="bg-stone-50 p-4 rounded-xl border border-stone-100 hover:border-stone-300 transition-colors cursor-pointer flex justify-between items-start"
                                onClick={() => router.push(`/matches/${m.opportunity_id}/${m.contractor_id}`)}
                            >
                                <div className="flex-1 min-w-0 mr-3">
                                    <p className="font-bold text-sm text-stone-900 line-clamp-1">{opp.title || "Unknown Opportunity"}</p>
                                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                                        <span className="text-xs text-stone-500">{opp.agency || "---"}</span>
                                        {opp.naics_code && <span className="font-mono text-[10px] bg-stone-100 border border-stone-200 px-1.5 py-0.5 rounded">{opp.naics_code}</span>}
                                        {opp.notice_type && (
                                            <span className={clsx(
                                                "font-typewriter text-[9px] px-1.5 py-0.5 rounded border uppercase",
                                                opp.notice_type === "Sources Sought" ? "bg-emerald-100 text-emerald-700 border-emerald-200" :
                                                opp.notice_type === "Presolicitation" ? "bg-blue-100 text-blue-700 border-blue-200" :
                                                "bg-stone-100 text-stone-600 border-stone-200"
                                            )}>{opp.notice_type}</span>
                                        )}
                                    </div>
                                    {opp.response_deadline && (
                                        <p className="text-[10px] text-stone-400 mt-1">Deadline: {new Date(opp.response_deadline).toLocaleDateString()}</p>
                                    )}
                                </div>
                                <div className="flex items-center space-x-2 flex-shrink-0">
                                    <span className={clsx("w-2 h-2 rounded-full", m.classification === "HOT" ? "bg-red-500" : m.classification === "WARM" ? "bg-amber-500" : "bg-stone-300")} />
                                    <span className="font-mono font-bold text-sm">{Math.round(m.score * 100)}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

interface ContactRecord {
    id: string;
    full_name: string;
    title: string;
    email: string;
    phone: string;
    linkedin_url: string;
    source: string;
    confidence: string;
}

function DecisionMakersPanel({ contractorId }: { contractorId: string }) {
    const [contacts, setContacts] = useState<ContactRecord[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchContacts() {
            const { data } = await supabase
                .from("contractor_contacts")
                .select("id, full_name, title, email, phone, linkedin_url, source, confidence")
                .eq("contractor_id", contractorId)
                .order("confidence", { ascending: false })
                .limit(10);
            setContacts((data || []) as unknown as ContactRecord[]);
            setLoading(false);
        }
        fetchContacts();
    }, [contractorId]);

    if (loading) return (
        <div className="bg-white rounded-[32px] border border-stone-200 shadow-sm p-8">
            <h2 className="font-typewriter text-lg font-bold mb-4 flex items-center">
                <Mail className="w-5 h-5 mr-3 text-stone-400" /> Decision Makers
            </h2>
            <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 animate-spin text-stone-400" /></div>
        </div>
    );

    if (contacts.length === 0) return null;

    const sourceLabel = (s: string) => {
        if (s === "apollo") return "Apollo";
        if (s === "sam_poc") return "SAM.gov";
        if (s === "website_scrape") return "Website";
        if (s === "google_business") return "Google";
        return s || "Manual";
    };

    return (
        <div className="bg-white rounded-[32px] border border-stone-200 shadow-sm p-8">
            <h2 className="font-typewriter text-lg font-bold mb-6 flex items-center">
                <Mail className="w-5 h-5 mr-3 text-stone-400" /> Decision Makers
                <span className="ml-3 text-xs font-sans font-medium bg-stone-100 px-2.5 py-0.5 rounded-full text-stone-500 border border-stone-200">{contacts.length}</span>
            </h2>
            <div className="space-y-4">
                {contacts.map((c) => (
                    <div key={c.id} className="bg-stone-50 p-4 rounded-xl border border-stone-100 flex justify-between items-start">
                        <div className="flex-1 min-w-0 mr-3">
                            <p className="font-bold text-sm text-stone-900">{c.full_name}</p>
                            <p className="text-xs text-stone-500 mt-0.5">{c.title || "Contact"}</p>
                            <div className="flex items-center gap-3 mt-2 flex-wrap">
                                {c.email && (
                                    <a href={`mailto:${c.email}`} className="text-xs text-blue-600 hover:underline flex items-center">
                                        <Mail className="w-3 h-3 mr-1" /> {c.email}
                                    </a>
                                )}
                                {c.phone && (
                                    <a href={`tel:${c.phone}`} className="text-xs text-stone-600 hover:text-black flex items-center">
                                        <Phone className="w-3 h-3 mr-1" /> {c.phone}
                                    </a>
                                )}
                                {c.linkedin_url && (
                                    <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline flex items-center">
                                        <ExternalLink className="w-3 h-3 mr-1" /> LinkedIn
                                    </a>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                            <span className={clsx("font-typewriter text-[9px] px-2 py-0.5 rounded border uppercase",
                                c.confidence === "high" ? "bg-emerald-100 text-emerald-700 border-emerald-200" :
                                c.confidence === "medium" ? "bg-amber-100 text-amber-700 border-amber-200" :
                                "bg-stone-100 text-stone-600 border-stone-200"
                            )}>{c.confidence || "low"}</span>
                            <span className="font-typewriter text-[9px] px-2 py-0.5 rounded border bg-stone-100 text-stone-600 border-stone-200 uppercase">
                                {sourceLabel(c.source)}
                            </span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default function ContractorDetailClient({ initialData }: { initialData: any }) {
    const router = useRouter();
    const [contractor, setContractor] = useState(initialData);
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Editable fields state
    const [editForm, setEditForm] = useState({
        company_name: contractor.company_name || "",
        dba_name: contractor.dba_name || "",
        website: contractor.website || "",
        city: contractor.city || "",
        state: contractor.state || "",
        hq_address: contractor.hq_address || "",
        employee_count: contractor.employee_count || "",
        revenue: contractor.revenue || "",
        years_in_business: contractor.years_in_business || "",
        service_radius_miles: contractor.service_radius_miles || "",

        primary_poc_name: contractor.primary_poc_name || "",
        direct_phone: contractor.direct_phone || "",
        main_phone: contractor.main_phone || "",
        email: contractor.email || "",

        owner_name: contractor.ownership?.owner_name || "",
        owner_title: contractor.ownership?.owner_title || "",
        owner_linkedin: contractor.ownership?.owner_linkedin || "",
    });

    const handleSave = async () => {
        setIsSaving(true);

        // Prepare capacity updates
        const updatedOwnership = {
            ...contractor.ownership,
            owner_name: editForm.owner_name,
            owner_title: editForm.owner_title,
            owner_linkedin: editForm.owner_linkedin,
        };

        const updates = {
            company_name: editForm.company_name,
            dba_name: editForm.dba_name,
            website: editForm.website,
            city: editForm.city,
            state: editForm.state,
            hq_address: editForm.hq_address,
            employee_count: editForm.employee_count ? parseInt(editForm.employee_count) : null,
            revenue: editForm.revenue ? parseFloat(editForm.revenue) : null,
            years_in_business: editForm.years_in_business ? parseInt(editForm.years_in_business) : null,
            service_radius_miles: editForm.service_radius_miles ? parseInt(editForm.service_radius_miles) : null,
            primary_poc_name: editForm.primary_poc_name,
            direct_phone: editForm.direct_phone,
            main_phone: editForm.main_phone,
            email: editForm.email,
            ownership: updatedOwnership,
            is_manually_edited: true // Flag to protect from overwrites
        };

        const { error } = await supabase
            .from("contractors")
            .update(updates)
            .eq("id", contractor.id);

        if (!error) {
            setContractor({ ...contractor, ...updates });
            setIsEditing(false);
            router.refresh();
        } else {
            console.error("Failed to save changes", error);
            alert("Failed to save updates.");
        }
        setIsSaving(false);
    };

    const capacity = contractor.capacity_signals || {};
    const owner = contractor.ownership || {};

    const formattedRevenue = contractor.revenue
        ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumSignificantDigits: 3 }).format(contractor.revenue)
        : "Not Disclosed";

    const formattedVolume = contractor.total_award_volume
        ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumSignificantDigits: 3 }).format(contractor.total_award_volume)
        : "$0";

    return (
        <div className="max-w-5xl mx-auto space-y-10 animate-in fade-in duration-500 pb-16">
            {/* Header section */}
            <header className="mb-8 relative">
                <Link href="/contractors" className="inline-flex items-center text-sm font-typewriter text-stone-500 hover:text-black mb-6 transition-colors">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Contractors
                </Link>

                <div className="absolute top-0 right-0 flex space-x-2">
                    {isEditing ? (
                        <>
                            <button disabled={isSaving} onClick={() => setIsEditing(false)} className="flex items-center space-x-2 px-4 py-2 rounded-full border border-stone-200 text-stone-600 bg-white hover:bg-stone-50 font-bold text-sm transition-all disabled:opacity-50">
                                <X className="w-4 h-4" /> <span>Cancel</span>
                            </button>
                            <button disabled={isSaving} onClick={handleSave} className="flex items-center space-x-2 px-6 py-2 rounded-full bg-black text-white hover:bg-stone-800 font-bold text-sm transition-all shadow-sm disabled:opacity-50">
                                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                <span>Save Changes</span>
                            </button>
                        </>
                    ) : (
                        <button onClick={() => setIsEditing(true)} className="flex items-center space-x-2 px-6 py-2 rounded-full bg-white border border-stone-200 text-black hover:border-black font-bold text-sm transition-all shadow-sm">
                            <Edit2 className="w-4 h-4" /> <span>Edit Profile</span>
                        </button>
                    )}
                </div>

                <div className="flex flex-wrap items-center gap-3 mb-4">
                    {contractor.sam_registered === "Yes" || contractor.sam_registered === true ? (
                        <span className="bg-emerald-100 text-emerald-900 font-typewriter text-xs px-3 py-1.5 rounded-md border border-emerald-200 uppercase tracking-wider flex items-center">
                            <ShieldCheck className="w-3 h-3 mr-1" /> SAM.gov Verified
                        </span>
                    ) : (
                        <span className="bg-stone-100 text-stone-600 font-typewriter text-xs px-3 py-1.5 rounded-md border border-stone-200 uppercase tracking-wider">
                            Non-SAM Entity
                        </span>
                    )}
                    <span className="font-mono text-stone-500 text-sm">UEI: {contractor.uei || "N/A"}</span>
                    <span className="font-mono text-stone-500 text-sm">CAGE: {contractor.cage_code || "N/A"}</span>
                    {contractor.is_manually_edited && (
                        <span className="bg-amber-100 text-amber-900 font-typewriter text-xs px-3 py-1.5 rounded-md border border-amber-200 uppercase tracking-wider">
                            Profile Patched manually
                        </span>
                    )}
                </div>

                {isEditing ? (
                    <div className="space-y-4 max-w-2xl mt-4">
                        <input
                            type="text"
                            value={editForm.company_name}
                            onChange={(e) => setEditForm({ ...editForm, company_name: e.target.value })}
                            className="text-3xl md:text-5xl font-bold font-typewriter tracking-tighter text-black leading-tight w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2"
                            placeholder="Company Name"
                        />
                        <input
                            type="text"
                            value={editForm.dba_name}
                            onChange={(e) => setEditForm({ ...editForm, dba_name: e.target.value })}
                            className="text-stone-500 font-medium w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2"
                            placeholder="Doing Business As (DBA)"
                        />
                        <div className="flex space-x-2">
                            <input
                                type="text"
                                value={editForm.website}
                                onChange={(e) => setEditForm({ ...editForm, website: e.target.value })}
                                className="text-stone-500 text-sm w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2"
                                placeholder="Website URL (e.g., www.example.com)"
                            />
                        </div>
                    </div>
                ) : (
                    <>
                        <h1 className="text-3xl md:text-5xl font-bold font-typewriter tracking-tighter text-black leading-tight">
                            {contractor.company_name}
                        </h1>
                        {contractor.dba_name && (
                            <p className="text-stone-500 font-medium mt-2">Doing Business As: {contractor.dba_name}</p>
                        )}
                        {contractor.website && (
                            <a href={contractor.website.startsWith('http') ? contractor.website : `https://${contractor.website}`} target="_blank" rel="noopener noreferrer" className="text-stone-500 hover:text-black flex items-center text-xs font-bold font-typewriter transition-colors mt-2">
                                <LinkIcon className="w-3 h-3 mr-1" /> Visit Site
                            </a>
                        )}
                    </>
                )}
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column */}
                <div className="lg:col-span-2 space-y-8">
                    {/* General Company Overview */}
                    <div className="bg-white rounded-[32px] border border-stone-200 shadow-sm p-8">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="font-typewriter text-lg font-bold flex items-center">
                                <Building className="w-5 h-5 mr-3 text-stone-400" /> Company Overview
                            </h2>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="bg-stone-50 border border-stone-100 p-4 rounded-2xl">
                                <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-1 flex items-center"><MapPin className="w-3 h-3 mr-1" /> HQ Details</p>
                                {isEditing ? (
                                    <div className="space-y-2 mt-2">
                                        <input type="text" value={editForm.city} onChange={(e) => setEditForm({ ...editForm, city: e.target.value })} className="w-full text-xs p-1 border rounded" placeholder="City" />
                                        <input type="text" value={editForm.state} onChange={(e) => setEditForm({ ...editForm, state: e.target.value })} className="w-full text-xs p-1 border rounded" placeholder="State" />
                                        <input type="text" value={editForm.hq_address} onChange={(e) => setEditForm({ ...editForm, hq_address: e.target.value })} className="w-full text-xs p-1 border rounded" placeholder="Address" />
                                    </div>
                                ) : (
                                    <>
                                        <p className="font-bold text-sm">{[contractor.city, contractor.state].filter(Boolean).join(", ") || "Unknown"}</p>
                                        <p className="text-xs text-stone-500 mt-1">{contractor.hq_address}</p>
                                    </>
                                )}
                            </div>
                            <div className="bg-stone-50 border border-stone-100 p-4 rounded-2xl">
                                <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-1 flex items-center"><Users className="w-3 h-3 mr-1" /> Workforce</p>
                                {isEditing ? (
                                    <input type="number" value={editForm.employee_count} onChange={(e) => setEditForm({ ...editForm, employee_count: e.target.value })} className="w-full text-sm p-1 border rounded mt-2 font-bold" placeholder="Employees" />
                                ) : (
                                    <p className="font-bold text-sm">{contractor.employee_count?.toLocaleString() || "Not Disclosed"}</p>
                                )}
                            </div>
                            <div className="bg-stone-50 border border-stone-100 p-4 rounded-2xl">
                                <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-1 flex items-center"><DollarSign className="w-3 h-3 mr-1" /> Revenue</p>
                                {isEditing ? (
                                    <input type="number" value={editForm.revenue} onChange={(e) => setEditForm({ ...editForm, revenue: e.target.value })} className="w-full text-sm p-1 border rounded mt-2 font-bold" placeholder="Annual Revenue" />
                                ) : (
                                    <p className="font-bold text-sm text-emerald-700">{formattedRevenue}</p>
                                )}
                            </div>
                            <div className="bg-stone-50 border border-stone-100 p-4 rounded-2xl">
                                <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-1 flex items-center"><Briefcase className="w-3 h-3 mr-1" /> Age (Years)</p>
                                {isEditing ? (
                                    <input type="number" value={editForm.years_in_business} onChange={(e) => setEditForm({ ...editForm, years_in_business: e.target.value })} className="w-full text-sm p-1 border rounded mt-2 font-bold" placeholder="Years in Business" />
                                ) : (
                                    <p className="font-bold text-sm">{contractor.years_in_business ? `${contractor.years_in_business} Years` : "Unknown"}</p>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Capacity Signals */}
                    <div className="bg-white rounded-[32px] border border-stone-200 shadow-sm p-8">
                        <h2 className="font-typewriter text-lg font-bold mb-6 flex items-center">
                            <Activity className="w-5 h-5 mr-3 text-stone-400" /> Operational Capacity
                        </h2>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="flex justify-between items-center border-b border-stone-100 pb-3">
                                <span className="text-xs font-typewriter text-stone-500 uppercase tracking-widest">Bonding Stated</span>
                                <span className="font-bold text-sm">{capacity.bonded || "Unknown"}</span>
                            </div>
                            <div className="flex justify-between items-center border-b border-stone-100 pb-3">
                                <span className="text-xs font-typewriter text-stone-500 uppercase tracking-widest">Municipal Exp</span>
                                <span className="font-bold text-sm">{capacity.municipal_exp ? "Yes" : "Unknown"}</span>
                            </div>
                            <div className="flex justify-between items-center border-b border-stone-100 pb-3">
                                <span className="text-xs font-typewriter text-stone-500 uppercase tracking-widest">Active Fleet</span>
                                <span className="font-bold text-sm flex items-center">
                                    {capacity.fleet ? <><Truck className="w-4 h-4 mr-1" /> Yes</> : "Unknown"}
                                </span>
                            </div>
                            <div className="flex justify-between items-center border-b border-stone-100 pb-3">
                                <span className="text-xs font-typewriter text-stone-500 uppercase tracking-widest">Service Radius</span>
                                {isEditing ? (
                                    <input type="number" value={editForm.service_radius_miles} onChange={(e) => setEditForm({ ...editForm, service_radius_miles: e.target.value })} className="w-20 text-sm p-1 border rounded font-bold text-right" placeholder="Miles" />
                                ) : (
                                    <span className="font-bold text-sm">{contractor.service_radius_miles || 50} Miles</span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Federal Profile */}
                    <div className="bg-gradient-to-br from-stone-900 via-stone-900 to-black text-white rounded-[32px] p-8 shadow-xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-stone-600/20 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>
                        <div className="absolute bottom-0 left-0 w-48 h-48 bg-stone-700/10 rounded-full blur-3xl -ml-12 -mb-12 pointer-events-none"></div>

                        <h2 className="font-typewriter text-lg font-bold mb-6 flex items-center relative z-10">
                            <Award className="w-5 h-5 mr-3 text-stone-400" /> Federal Profile & Health
                        </h2>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative z-10">
                            <div className="bg-black/40 border border-stone-700 p-5 rounded-2xl">
                                <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-1">Total Federal Awards</p>
                                <p className="font-mono text-3xl font-bold">{contractor.total_federal_awards || 0}</p>
                            </div>
                            <div className="bg-black/40 border border-stone-700 p-5 rounded-2xl">
                                <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-1">Total Award Volume</p>
                                <p className="font-bold text-emerald-400 text-xl tracking-tight mt-1">{formattedVolume}</p>
                            </div>
                            <div className="bg-black/40 border border-stone-700 p-5 rounded-2xl">
                                <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-1">Last Award Date</p>
                                <p className="font-bold text-sm mt-2">{contractor.last_award_date ? new Date(contractor.last_award_date).toLocaleDateString() : "Never"}</p>
                            </div>
                        </div>

                        <div className="mt-6 flex items-center justify-between border-t border-stone-700 pt-6 relative z-10">
                            <div>
                                <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-1">Federal Activity Status</p>
                                <span className={clsx(
                                    "font-bold font-typewriter text-sm px-3 py-1 rounded-full uppercase tracking-widest inline-block border",
                                    contractor.federal_activity_status === "Never Awarded" ? "text-amber-400 border-amber-400/30 bg-amber-400/10" :
                                        contractor.federal_activity_status?.includes("Inactive") ? "text-stone-300 border-stone-500/30 bg-stone-500/10" :
                                            "text-emerald-400 border-emerald-400/30 bg-emerald-400/10"
                                )}>
                                    {contractor.federal_activity_status || "Unknown Status"}
                                </span>
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-1">Registered Since</p>
                                <p className="font-bold text-sm tracking-widest">
                                    {contractor.sam_registration_date ? new Date(contractor.sam_registration_date).toLocaleDateString() : "---"}
                                </p>
                            </div>
                        </div>

                    </div>

                    {/* Decision Makers */}
                    <DecisionMakersPanel contractorId={contractor.id} />

                    {/* Match History */}
                    <MatchHistoryPanel contractorId={contractor.id} />
                </div>

                {/* Right Column */}
                <div className="space-y-8">
                    {/* Ownership & POC */}
                    <div className="bg-white rounded-[32px] border border-stone-200 shadow-sm p-8">
                        <p className="font-typewriter text-lg font-bold mb-6 flex items-center">
                            <Phone className="w-5 h-5 mr-3 text-stone-400" /> Sales Contact Data
                        </p>

                        <div className="space-y-6">
                            <div>
                                <p className="text-xs text-stone-500 font-typewriter uppercase tracking-widest mb-2">Key Executive</p>
                                {isEditing ? (
                                    <div className="space-y-2 mb-4">
                                        <input type="text" value={editForm.owner_name} onChange={(e) => setEditForm({ ...editForm, owner_name: e.target.value })} className="w-full text-sm p-2 border rounded font-bold" placeholder="Executive Name" />
                                        <input type="text" value={editForm.owner_title} onChange={(e) => setEditForm({ ...editForm, owner_title: e.target.value })} className="w-full text-xs p-2 border rounded" placeholder="Title (e.g. Principal)" />
                                        <input type="text" value={editForm.owner_linkedin} onChange={(e) => setEditForm({ ...editForm, owner_linkedin: e.target.value })} className="w-full text-xs p-2 border rounded" placeholder="LinkedIn URL" />
                                    </div>
                                ) : (
                                    <>
                                        <p className="font-bold text-lg">{owner.owner_name || contractor.primary_poc_name || "Unknown Executive"}</p>
                                        <p className="text-sm text-stone-500">{owner.owner_title || "Principal"}</p>

                                        {owner.owner_linkedin && (
                                            <a href={owner.owner_linkedin} target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-xs text-blue-600 font-bold mt-2 hover:underline">
                                                <ExternalLink className="w-3 h-3 mr-1" /> View LinkedIn Profile
                                            </a>
                                        )}
                                    </>
                                )}
                            </div>

                            <div className="border-t border-stone-100 pt-6 space-y-4">
                                <div>
                                    <p className="text-[10px] text-stone-400 font-typewriter uppercase tracking-widest mb-1">Direct Phone</p>
                                    {isEditing ? (
                                        <input type="text" value={editForm.direct_phone} onChange={(e) => setEditForm({ ...editForm, direct_phone: e.target.value })} className="w-full text-sm font-mono p-1 border rounded" placeholder="Direct Phone" />
                                    ) : (contractor.direct_phone || contractor.phone) ? (
                                        <a href={`tel:${contractor.direct_phone || contractor.phone}`} className="font-bold font-mono text-sm text-black hover:text-blue-600 transition-colors">
                                            {contractor.direct_phone || contractor.phone}
                                        </a>
                                    ) : (
                                        <p className="font-bold font-mono text-sm text-stone-300">---</p>
                                    )}
                                </div>
                                <div>
                                    <p className="text-[10px] text-stone-400 font-typewriter uppercase tracking-widest mb-1">Main Line</p>
                                    {isEditing ? (
                                        <input type="text" value={editForm.main_phone} onChange={(e) => setEditForm({ ...editForm, main_phone: e.target.value })} className="w-full text-sm font-mono p-1 border rounded" placeholder="Main Line Phone" />
                                    ) : contractor.main_phone ? (
                                        <a href={`tel:${contractor.main_phone}`} className="font-bold font-mono text-sm text-black hover:text-blue-600 transition-colors">
                                            {contractor.main_phone}
                                        </a>
                                    ) : (
                                        <p className="font-bold font-mono text-sm text-stone-300">---</p>
                                    )}
                                </div>
                                <div>
                                    <p className="text-[10px] text-stone-400 font-typewriter uppercase tracking-widest mb-1">Email</p>
                                    {isEditing ? (
                                        <input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} className="w-full text-sm p-1 border rounded" placeholder="Email Address" />
                                    ) : (
                                        <a href={`mailto:${contractor.email}`} className="font-bold text-sm text-stone-700 hover:text-black">
                                            {contractor.email || "---"}
                                        </a>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* NAICS & Certs */}
                    <div className="bg-white rounded-[32px] border border-stone-200 shadow-sm p-8">
                        <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-4 flex items-center">
                            <Target className="w-3 h-3 mr-1" /> NAICS Capabilities
                        </p>
                        <div className="flex flex-wrap gap-2 mb-8">
                            {(contractor.naics_codes || []).length > 0 ? (
                                contractor.naics_codes.map((n: string) => (
                                    <span key={n} className="bg-stone-50 text-stone-600 border border-stone-200 px-2 py-1 rounded font-mono text-xs shadow-sm">
                                        {n}
                                    </span>
                                ))
                            ) : (
                                <p className="text-sm text-stone-400 italic">No NAICS codes detected.</p>
                            )}
                        </div>

                        <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-4 flex items-center">
                            <ShieldCheck className="w-3 h-3 mr-1" /> Certifications
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {((contractor.sba_certifications || []).concat(contractor.certifications || [])).length > 0 ? (
                                [...new Set([...(contractor.sba_certifications || []), ...(contractor.certifications || [])])].map((c) => (
                                    <span key={c as string} className="bg-black text-white px-2 py-1 rounded font-typewriter tracking-widest text-[10px] uppercase shadow-md">
                                        {c as string}
                                    </span>
                                ))
                            ) : (
                                <p className="text-sm text-stone-400 italic">No set-aside certs registered.</p>
                            )}
                        </div>
                    </div>

                    {/* Digital Presence & Signals */}
                    <div className="bg-white rounded-[32px] border border-stone-200 shadow-sm p-8">
                        <p className="font-typewriter text-lg font-bold mb-6 flex items-center">
                            <Globe className="w-5 h-5 mr-3 text-stone-400" /> Digital Presence
                        </p>
                        <div className="space-y-4">
                            {contractor.business_url && (
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-typewriter text-stone-500 uppercase tracking-widest">Website</span>
                                    <a href={contractor.business_url.startsWith('http') ? contractor.business_url : `https://${contractor.business_url}`} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline flex items-center">
                                        <Globe className="w-3 h-3 mr-1" /> Visit
                                    </a>
                                </div>
                            )}
                            {(contractor.google_rating !== null && contractor.google_rating !== undefined) && (
                                <div className="flex items-center justify-between border-t border-stone-100 pt-3">
                                    <span className="text-xs font-typewriter text-stone-500 uppercase tracking-widest">Google Rating</span>
                                    <div className="flex items-center">
                                        <Star className="w-4 h-4 text-amber-500 mr-1" />
                                        <span className="font-bold text-sm">{contractor.google_rating}</span>
                                        {contractor.google_reviews_count > 0 && (
                                            <span className="text-xs text-stone-400 ml-1">({contractor.google_reviews_count} reviews)</span>
                                        )}
                                    </div>
                                </div>
                            )}
                            {contractor.social_linkedin && (
                                <div className="flex items-center justify-between border-t border-stone-100 pt-3">
                                    <span className="text-xs font-typewriter text-stone-500 uppercase tracking-widest">LinkedIn</span>
                                    <a href={contractor.social_linkedin} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline flex items-center">
                                        <ExternalLink className="w-3 h-3 mr-1" /> View
                                    </a>
                                </div>
                            )}
                            {contractor.social_facebook && (
                                <div className="flex items-center justify-between border-t border-stone-100 pt-3">
                                    <span className="text-xs font-typewriter text-stone-500 uppercase tracking-widest">Facebook</span>
                                    <a href={contractor.social_facebook} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline flex items-center">
                                        <ExternalLink className="w-3 h-3 mr-1" /> View
                                    </a>
                                </div>
                            )}
                            <div className="border-t border-stone-100 pt-4 mt-2">
                                <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-3">Website Signals</p>
                                <div className="flex flex-wrap gap-2">
                                    <span className={clsx("text-[10px] font-typewriter px-2.5 py-1 rounded-full border uppercase tracking-wider",
                                        contractor.bonded_mentioned ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-stone-100 text-stone-400 border-stone-200"
                                    )}>{contractor.bonded_mentioned ? "Bonded" : "No Bonding"}</span>
                                    <span className={clsx("text-[10px] font-typewriter px-2.5 py-1 rounded-full border uppercase tracking-wider",
                                        contractor.municipal_experience ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-stone-100 text-stone-400 border-stone-200"
                                    )}>{contractor.municipal_experience ? "Gov Experience" : "No Gov Exp"}</span>
                                </div>
                            </div>
                            {!contractor.business_url && !contractor.social_linkedin && !contractor.google_rating && (
                                <p className="text-sm text-stone-400 italic text-center py-4">No digital presence data enriched yet.</p>
                            )}
                        </div>
                    </div>

                    {/* SAM Registration Timeline */}
                    <div className="bg-white rounded-[32px] border border-stone-200 shadow-sm p-8">
                        <p className="font-typewriter text-lg font-bold mb-6 flex items-center">
                            <ShieldCheck className="w-5 h-5 mr-3 text-stone-400" /> Registration
                        </p>
                        <div className="space-y-3">
                            <div className="flex justify-between items-center">
                                <span className="text-xs font-typewriter text-stone-500 uppercase tracking-widest">Registered</span>
                                <span className="font-bold text-sm">{contractor.sam_registration_date ? new Date(contractor.sam_registration_date).toLocaleDateString() : "---"}</span>
                            </div>
                            <div className="flex justify-between items-center border-t border-stone-100 pt-3">
                                <span className="text-xs font-typewriter text-stone-500 uppercase tracking-widest">Activated</span>
                                <span className="font-bold text-sm">{contractor.activation_date ? new Date(contractor.activation_date).toLocaleDateString() : "---"}</span>
                            </div>
                            <div className="flex justify-between items-center border-t border-stone-100 pt-3">
                                <span className="text-xs font-typewriter text-stone-500 uppercase tracking-widest">Expires</span>
                                <span className={clsx("font-bold text-sm",
                                    contractor.expiration_date && new Date(contractor.expiration_date) < new Date() ? "text-red-600" : ""
                                )}>{contractor.expiration_date ? new Date(contractor.expiration_date).toLocaleDateString() : "---"}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
