import { createClient } from "@supabase/supabase-js";
import { ArrowLeft, Building, Target, Link as LinkIcon, MapPin, Phone, Mail, Award, ShieldCheck, DollarSign } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = 'force-dynamic';

export default async function ContractorDetailPage({ params }: { params: { id: string } }) {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!
    );

    const { data: contractor, error } = await supabase
        .from("contractors")
        .select("*")
        .eq("id", params.id)
        .single();

    if (error || !contractor) {
        notFound();
    }

    return (
        <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500 pb-12">
            <header className="mb-6">
                <Link href="/contractors" className="inline-flex items-center text-sm font-typewriter text-stone-500 hover:text-black mb-6 transition-colors">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Contractors
                </Link>
                <div className="flex flex-wrap items-center gap-3 mb-4">
                    {contractor.sam_registered ? (
                        <span className="bg-emerald-100 text-emerald-900 font-typewriter text-xs px-3 py-1.5 rounded-md border border-emerald-200 uppercase tracking-wider">
                            SAM.gov Verified
                        </span>
                    ) : (
                        <span className="bg-stone-100 text-stone-600 font-typewriter text-xs px-3 py-1.5 rounded-md border border-stone-200 uppercase tracking-wider">
                            External Record
                        </span>
                    )}
                    <span className="font-mono text-stone-500 text-sm">UEI: {contractor.uei || "N/A"}</span>
                </div>
                <h1 className="text-3xl md:text-4xl font-bold font-typewriter tracking-tighter text-black leading-tight">
                    {contractor.company_name}
                </h1>
                {contractor.dba_name && (
                    <p className="text-stone-500 font-medium mt-2">DBA: {contractor.dba_name}</p>
                )}
            </header>

            <div className="bg-white rounded-[40px] border border-stone-200 shadow-sm overflow-hidden">
                <div className="p-8 border-b border-stone-100 flex flex-wrap gap-4 items-center justify-between">
                    <div className="flex items-center space-x-4">
                        <div className="w-12 h-12 rounded-full bg-stone-100 flex items-center justify-center">
                            <Building className="w-6 h-6 text-stone-600" />
                        </div>
                        <div>
                            <p className="text-xs font-typewriter text-stone-400 uppercase tracking-widest mb-1">CAGE Code</p>
                            <h2 className="text-xl font-bold font-mono">{contractor.cage_code || "N/A"}</h2>
                        </div>
                    </div>
                    {contractor.business_url && (
                        <a
                            href={contractor.business_url.startsWith('http') ? contractor.business_url : `https://${contractor.business_url}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center space-x-2 text-sm font-bold font-typewriter bg-stone-100 px-4 py-2 rounded-full hover:bg-stone-200 transition-colors"
                        >
                            <LinkIcon className="w-4 h-4" />
                            <span>Visit Website</span>
                        </a>
                    )}
                </div>

                <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8 bg-stone-50/50">
                    <div className="space-y-6">
                        <div>
                            <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-3 flex items-center">
                                <MapPin className="w-3 h-3 mr-1" /> General Information
                            </p>
                            <div className="space-y-3">
                                <div className="flex justify-between items-center bg-white border border-stone-200 p-3 rounded-xl">
                                    <span className="text-sm text-stone-500">Location</span>
                                    <span className="font-medium text-sm">
                                        {[contractor.city, contractor.state].filter(Boolean).join(", ") || "Unknown"}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center bg-white border border-stone-200 p-3 rounded-xl">
                                    <span className="text-sm text-stone-500">Employees</span>
                                    <span className="font-medium text-sm">{contractor.employee_count?.toLocaleString() || "Not Disclosed"}</span>
                                </div>
                                <div className="flex justify-between items-center bg-white border border-stone-200 p-3 rounded-xl">
                                    <span className="text-sm text-stone-500">Est. Revenue</span>
                                    <span className="font-medium text-sm text-emerald-700">
                                        {contractor.revenue ? `$${(contractor.revenue / 1000000).toFixed(1)}M` : "Not Disclosed"}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div>
                            <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-3 flex items-center">
                                <Target className="w-3 h-3 mr-1" /> Primary Capabilities
                            </p>
                            <div className="bg-white border border-stone-200 p-4 rounded-2xl">
                                <div className="flex flex-wrap gap-2">
                                    {(contractor.naics_codes || []).length > 0 ? (
                                        contractor.naics_codes.map((n: string) => (
                                            <span key={n} className="bg-stone-100 text-stone-600 border border-stone-200 px-2 py-1 rounded font-mono text-xs">
                                                {n}
                                            </span>
                                        ))
                                    ) : (
                                        <p className="text-sm text-stone-400 italic">No NAICS codes detected.</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div>
                            <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-3 flex items-center">
                                <Award className="w-3 h-3 mr-1" /> Govt Profile
                            </p>
                            <div className="space-y-3">
                                <div className="flex justify-between items-center bg-white border border-stone-200 p-3 rounded-xl">
                                    <span className="text-sm text-stone-500">Federal Awards</span>
                                    <span className="font-medium text-sm font-mono">{contractor.federal_awards_count || 0}</span>
                                </div>
                                <div className="flex justify-between items-center bg-white border border-stone-200 p-3 rounded-xl">
                                    <span className="text-sm text-stone-500">Last Award</span>
                                    <span className="font-medium text-sm font-mono">{contractor.last_award_date || "Never"}</span>
                                </div>
                            </div>
                        </div>

                        <div>
                            <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-3 flex items-center">
                                <ShieldCheck className="w-3 h-3 mr-1" /> Certifications
                            </p>
                            <div className="bg-white border border-stone-200 p-4 rounded-2xl">
                                <div className="flex flex-wrap gap-2">
                                    {((contractor.sba_certifications || []).concat(contractor.certifications || [])).length > 0 ? (
                                        [...new Set([...(contractor.sba_certifications || []), ...(contractor.certifications || [])])].map((c) => (
                                            <span key={c as string} className="bg-black text-white px-2 py-1 rounded font-typewriter tracking-widest text-[10px] uppercase">
                                                {c as string}
                                            </span>
                                        ))
                                    ) : (
                                        <p className="text-sm text-stone-400 italic">No certifications registered.</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-8 border-t border-stone-100">
                    <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-4 flex items-center">
                        <Phone className="w-3 h-3 mr-1" /> Points of Contact
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-stone-50 border border-stone-200 rounded-2xl p-4 flex flex-col justify-between">
                            <p className="font-bold text-stone-700">{contractor.primary_poc_name || "Primary POC Unlisted"}</p>
                            <div className="mt-4 flex gap-2">
                                {contractor.phone ? (
                                    <a href={`tel:${contractor.phone}`} className="flex-1 bg-white border border-stone-200 hover:border-black text-stone-600 hover:text-black py-2 rounded-xl text-xs font-bold font-typewriter transition-colors flex items-center justify-center">
                                        <Phone className="w-3 h-3 mr-2" /> Call Target
                                    </a>
                                ) : (
                                    <button disabled className="flex-1 bg-stone-100 border border-stone-200 text-stone-400 py-2 rounded-xl text-xs font-bold font-typewriter cursor-not-allowed flex items-center justify-center">
                                        <Phone className="w-3 h-3 mr-2" /> No Phone
                                    </button>
                                )}
                                {contractor.email ? (
                                    <a href={`mailto:${contractor.email}`} className="flex-1 bg-white border border-stone-200 hover:border-black text-stone-600 hover:text-black py-2 rounded-xl text-xs font-bold font-typewriter transition-colors flex items-center justify-center">
                                        <Mail className="w-3 h-3 mr-2" /> Send Email
                                    </a>
                                ) : (
                                    <button disabled className="flex-1 bg-stone-100 border border-stone-200 text-stone-400 py-2 rounded-xl text-xs font-bold font-typewriter cursor-not-allowed flex items-center justify-center">
                                        <Mail className="w-3 h-3 mr-2" /> No Email
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
