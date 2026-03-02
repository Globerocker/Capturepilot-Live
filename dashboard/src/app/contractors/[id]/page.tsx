import { createClient } from "@supabase/supabase-js";
import { ArrowLeft, Building, Target, Link as LinkIcon, MapPin, Phone, Award, ShieldCheck, DollarSign, Users, Truck, Briefcase, Activity, ExternalLink } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import clsx from "clsx";

export const dynamic = 'force-dynamic';

export default async function ContractorDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!
    );

    const { data: contractor, error } = await supabase
        .from("contractors")
        .select("*")
        .eq("id", (await params).id)
        .single();

    if (error || !contractor) {
        notFound();
    }

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
            <header className="mb-8">
                <Link href="/contractors" className="inline-flex items-center text-sm font-typewriter text-stone-500 hover:text-black mb-6 transition-colors">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Contractors
                </Link>
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
                </div>
                <h1 className="text-3xl md:text-5xl font-bold font-typewriter tracking-tighter text-black leading-tight">
                    {contractor.company_name}
                </h1>
                {contractor.dba_name && (
                    <p className="text-stone-500 font-medium mt-2">Doing Business As: {contractor.dba_name}</p>
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
                            {contractor.website && (
                                <a href={contractor.website.startsWith('http') ? contractor.website : `https://${contractor.website}`} target="_blank" rel="noopener noreferrer" className="text-stone-500 hover:text-black flex items-center text-xs font-bold font-typewriter transition-colors">
                                    <LinkIcon className="w-3 h-3 mr-1" /> Visit Site
                                </a>
                            )}
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="bg-stone-50 border border-stone-100 p-4 rounded-2xl">
                                <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-1 flex items-center"><MapPin className="w-3 h-3 mr-1" /> HQ Details</p>
                                <p className="font-bold text-sm">{[contractor.city, contractor.state].filter(Boolean).join(", ") || "Unknown"}</p>
                                <p className="text-xs text-stone-500 mt-1">{contractor.hq_address}</p>
                            </div>
                            <div className="bg-stone-50 border border-stone-100 p-4 rounded-2xl">
                                <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-1 flex items-center"><Users className="w-3 h-3 mr-1" /> Workforce</p>
                                <p className="font-bold text-sm">{contractor.employee_count?.toLocaleString() || "Not Disclosed"}</p>
                            </div>
                            <div className="bg-stone-50 border border-stone-100 p-4 rounded-2xl">
                                <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-1 flex items-center"><DollarSign className="w-3 h-3 mr-1" /> Revenue</p>
                                <p className="font-bold text-sm text-emerald-700">{formattedRevenue}</p>
                            </div>
                            <div className="bg-stone-50 border border-stone-100 p-4 rounded-2xl">
                                <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-1 flex items-center"><Briefcase className="w-3 h-3 mr-1" /> Age</p>
                                <p className="font-bold text-sm">{contractor.years_in_business ? `${contractor.years_in_business} Years` : "Unknown"}</p>
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
                                <span className="font-bold text-sm">{contractor.service_radius_miles || 50} Miles</span>
                            </div>
                        </div>

                        {capacity.equipment && (
                            <div className="mt-4 bg-stone-50 p-4 rounded-xl border border-stone-100">
                                <span className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest block mb-1">Equipment Assets</span>
                                <p className="text-sm font-bold text-stone-700">{capacity.equipment}</p>
                            </div>
                        )}
                        {capacity.usp_differentiator && (
                            <div className="mt-4 bg-emerald-50 p-4 rounded-xl border border-emerald-100">
                                <span className="text-[10px] font-typewriter text-emerald-600 uppercase tracking-widest block mb-1">Key Differentiator</span>
                                <p className="text-sm font-bold text-emerald-900">{capacity.usp_differentiator}</p>
                            </div>
                        )}
                    </div>

                    {/* Federal Profile */}
                    <div className="bg-stone-900 text-white rounded-[32px] p-8 shadow-xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-stone-700/30 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>

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
                                <p className="font-bold text-lg">{owner.owner_name || contractor.primary_poc_name || "Unknown Execute"}</p>
                                <p className="text-sm text-stone-500">{owner.owner_title || "Principal"}</p>

                                {owner.owner_linkedin && (
                                    <a href={owner.owner_linkedin} target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-xs text-blue-600 font-bold mt-2 hover:underline">
                                        <ExternalLink className="w-3 h-3 mr-1" /> View LinkedIn Profile
                                    </a>
                                )}
                            </div>

                            <div className="border-t border-stone-100 pt-6 space-y-4">
                                <div>
                                    <p className="text-[10px] text-stone-400 font-typewriter uppercase tracking-widest mb-1">Direct Phone</p>
                                    <p className="font-bold font-mono text-sm">{contractor.direct_phone || contractor.phone || "---"}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] text-stone-400 font-typewriter uppercase tracking-widest mb-1">Main Line</p>
                                    <p className="font-bold font-mono text-sm">{contractor.main_phone || "---"}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] text-stone-400 font-typewriter uppercase tracking-widest mb-1">Email</p>
                                    <a href={`mailto:${contractor.email}`} className="font-bold text-sm text-stone-700 hover:text-black">
                                        {contractor.email || "---"}
                                    </a>
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

                </div>
            </div>

        </div>
    );
}
