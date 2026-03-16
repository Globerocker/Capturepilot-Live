"use client";

import { useEffect, useState } from "react";
import { createSupabaseClient } from "@/lib/supabase/client";
import { useParams } from "next/navigation";
import { Loader2, ArrowLeft, ArrowRight, Send, Sparkles, Building, Briefcase, FileText, MapPin, Globe, Phone, Users, ExternalLink, Target, Mail, Star } from "lucide-react";
import Link from "next/link";
import clsx from "clsx";

const supabase = createSupabaseClient();

export default function MatchDetailPage() {
    const { id } = useParams();
    const [match, setMatch] = useState<any>(null);
    const [opportunity, setOpportunity] = useState<any>(null);
    const [contractor, setContractor] = useState<any>(null);
    const [alternatives, setAlternatives] = useState<any[]>([]);
    const [contacts, setContacts] = useState<{ id: string; full_name: string | null; title: string | null; email: string | null; phone: string | null; linkedin_url: string | null; source: string; confidence: string }[]>([]);
    const [loading, setLoading] = useState(true);

    // AI Email UI State
    const [drafting, setDrafting] = useState(false);
    const [drafts, setDrafts] = useState<string[]>([]);

    useEffect(() => {
        async function fetchData() {
            // Flat query - no FK joins to avoid PGRST200
            const { data: matchData } = await supabase
                .from("matches")
                .select("id, score, classification, score_breakdown, opportunity_id, contractor_id")
                .eq("id", id)
                .single();

            if (!matchData) { setLoading(false); return; }
            setMatch(matchData);

            // Fetch opportunity and contractor separately (flat queries)
            const [oppRes, conRes] = await Promise.all([
                supabase.from("opportunities").select("*").eq("id", matchData.opportunity_id).single(),
                supabase.from("contractors").select("*").eq("id", matchData.contractor_id).single(),
            ]);
            setOpportunity(oppRes.data);
            setContractor(conRes.data);

            // Fetch alternatives (flat query with separate contractor fetch)
            const { data: altMatchData } = await supabase
                .from("matches")
                .select("id, score, contractor_id")
                .eq("opportunity_id", matchData.opportunity_id)
                .neq("contractor_id", matchData.contractor_id)
                .order("score", { ascending: false })
                .limit(10);

            if (altMatchData && altMatchData.length > 0) {
                const altConIds = [...new Set(altMatchData.map((m: any) => m.contractor_id))];
                const { data: altConData } = await supabase
                    .from("contractors")
                    .select("id, company_name, uei, city, state, data_quality_flag")
                    .in("id", altConIds);
                const conMap = new Map((altConData || []).map((c: any) => [c.id, c]));
                setAlternatives(altMatchData.map((m: any) => ({
                    ...m,
                    contractors: conMap.get(m.contractor_id) || {},
                })));
            }

            // Fetch contacts
            const { data: contactData } = await supabase
                .from("contractor_contacts")
                .select("*")
                .eq("contractor_id", matchData.contractor_id)
                .order("confidence", { ascending: true });
            if (contactData) setContacts(contactData as typeof contacts);

            setLoading(false);
        }
        if (id) fetchData();
    }, [id]);

    const handleGenerateDrafts = async () => {
        setDrafting(true);
        // Simulate Gemini API call duration
        await new Promise(r => setTimeout(r, 2000));

        // Simulate the exact B.L.A.S.T Prompt constraints: 180 words max, mention NAICS, deadline, and why matched.
        if (!opportunity || !contractor) return;
        const deadline = opportunity.response_deadline ? new Date(opportunity.response_deadline).toLocaleDateString() : 'TBD';

        setDrafts([
            `Subject: Strategic Alignment: ${opportunity.title}\n\nHi Team at ${contractor.company_name},\n\nWe identified a strong deterministic match with your profile. The agency released "${opportunity.title}" under NAICS ${opportunity.naics_code}, directly overlapping your active codes. \n\nYour match score is exceptionally high due to a perfect NAICS alignment and your ${contractor.sba_certifications?.[0] || 'Small Business'} certification matching the Set-Aside requirements. \n\nPlease review your capabilities against this ${opportunity.notice_type || 'solicitation'}. Response deadline is firmly set for ${deadline}. Let us know if you need capture support.\n\nBest,\nCapture OS Intelligence`,

            `Subject: Leveraging your Certifications for ${opportunity.notice_id}\n\nHello ${contractor.company_name},\n\nYour ${contractor.sba_certifications?.join(", ") || 'Small Business'} status gives you a significant advantage in the newly posted ${opportunity.notice_type || 'solicitation'} by ${opportunity.agency || 'the agency'}.\n\nUnder NAICS ${opportunity.naics_code}, the competition will be restricted. Our algorithm matched you because your certifications and exact NAICS code mathematically align with the agency's requirements. \n\nThe deadline is ${deadline}. I strongly recommend we prepare a capabilities brief focusing heavily on your past performance in this specific socio-economic category.\n\nRegards,\nCapture OS Intelligence`
        ]);
        setDrafting(false);
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center h-full min-h-[500px]">
                <Loader2 className="w-10 h-10 animate-spin text-stone-400" />
            </div>
        );
    }

    if (!match) return (
        <div className="max-w-3xl mx-auto py-20 text-center space-y-4">
            <h2 className="text-2xl font-bold font-typewriter">Match Link Expired</h2>
            <p className="text-stone-500">Match IDs refresh during each scoring run. This link is no longer valid.</p>
            <Link href="/matches" className="inline-flex items-center text-sm font-bold font-typewriter bg-black text-white px-6 py-3 rounded-full hover:bg-stone-800 transition-colors">
                <ArrowLeft className="w-4 h-4 mr-2" /> Browse All Matches
            </Link>
        </div>
    );

    return (
        <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-500 pb-12">
            <Link href="/matches" className="inline-flex items-center text-stone-500 hover:text-black font-typewriter text-sm font-bold mb-4">
                <ArrowLeft className="w-4 h-4 mr-2" /> Back to Matrix
            </Link>

            <header className="flex items-end justify-between mb-8 pb-8 border-b border-stone-200">
                <div>
                    <div className="flex items-center space-x-3 mb-3">
                        <span className={clsx(
                            "font-typewriter text-xs px-3 py-1 rounded-full font-bold border",
                            match.classification === "HOT" ? "bg-black text-white border-black" : "bg-stone-100 text-stone-600 border-stone-200"
                        )}>
                            {match.classification} MATCH
                        </span>
                        <span className="font-typewriter text-stone-400 text-sm">Score: {match.score}/100</span>
                    </div>
                    <h2 className="text-3xl font-bold font-typewriter tracking-tighter text-black flex items-center">
                        {contractor?.company_name} <ArrowRight className="mx-3 text-stone-300 w-6 h-6" /> {opportunity?.notice_id}
                    </h2>
                </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

                {/* Left Column: Details */}
                <div className="space-y-6">
                    <div className="bg-white p-8 rounded-[32px] border border-stone-200 shadow-sm">
                        <h3 className="font-typewriter font-bold text-lg mb-6 flex items-center"><Building className="w-5 h-5 mr-3 text-stone-400" /> Contractor Profile</h3>
                        <div className="space-y-4 text-sm">
                            <div>
                                <p className="text-stone-500 font-typewriter text-xs uppercase mb-1">Company</p>
                                <Link href={`/contractors/${match.contractor_id}`} className="font-bold hover:underline flex items-center">
                                    {contractor?.company_name} <ExternalLink className="w-3 h-3 ml-1 text-stone-400" />
                                </Link>
                                <p className="text-stone-400 text-xs mt-0.5">UEI: {contractor?.uei}</p>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-stone-500 font-typewriter text-xs uppercase mb-1 flex items-center"><MapPin className="w-3 h-3 mr-1" /> Location</p>
                                    <p className="font-medium text-stone-800">{contractor?.city || 'Unknown'}, {contractor?.state || 'N/A'}</p>
                                </div>
                                <div>
                                    <p className="text-stone-500 font-typewriter text-xs uppercase mb-1 flex items-center"><Globe className="w-3 h-3 mr-1" /> Website</p>
                                    <p className="font-medium text-stone-800">
                                        {(contractor?.website || contractor?.business_url) ? (
                                            <a href={(contractor.website || contractor.business_url)!.startsWith('http') ? (contractor.website || contractor.business_url) : `https://${contractor.website || contractor.business_url}`} target="_blank" rel="noopener noreferrer" className="hover:underline text-blue-600 block truncate" title={contractor.website || contractor.business_url}>{(contractor.website || contractor.business_url || '').replace(/^https?:\/\//, '')}</a>
                                        ) : "N/A"}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-stone-500 font-typewriter text-xs uppercase mb-1 flex items-center"><Phone className="w-3 h-3 mr-1" /> Phone</p>
                                    <p className="font-medium text-stone-800">{contractor?.phone || contractor?.primary_poc_phone || 'N/A'}</p>
                                </div>
                                <div>
                                    <p className="text-stone-500 font-typewriter text-xs uppercase mb-1 flex items-center"><Users className="w-3 h-3 mr-1" /> Size Bracket</p>
                                    <p className="font-medium text-stone-800">{contractor?.employee_count ? `${contractor.employee_count} employees` : 'Unknown'}</p>
                                </div>
                            </div>
                            <div>
                                <p className="text-stone-500 font-typewriter text-xs uppercase mb-1 mt-2">NAICS Codes</p>
                                <p className="font-mono bg-stone-100 p-2 rounded-lg text-xs break-all leading-relaxed border border-stone-200">{contractor?.naics_codes?.join(", ") || "---"}</p>
                            </div>
                            <div>
                                <p className="text-stone-500 font-typewriter text-xs uppercase mb-1">Certifications</p>
                                <div className="flex flex-wrap gap-2">
                                    {(contractor?.sba_certifications || contractor?.certifications || [])?.map((c: string) => (
                                        <span key={c} className="bg-stone-800 text-stone-200 px-2 py-1 rounded font-typewriter text-[10px] uppercase tracking-wider">{c}</span>
                                    ))}
                                </div>
                            </div>

                            {/* Decision Makers from Enrichment or SAM POC fallback */}
                            <div className="mt-2 pt-4 border-t border-stone-200">
                                <p className="text-stone-500 font-typewriter text-xs uppercase mb-3 flex items-center">
                                    <Star className="w-3 h-3 mr-1 text-amber-400 fill-amber-400" /> Decision Makers
                                </p>
                                {contacts.length > 0 ? (
                                    <div className="space-y-2">
                                        {contacts.map((contact) => (
                                            <div key={contact.id} className="bg-stone-50 p-3 rounded-xl border border-stone-100 flex justify-between items-start">
                                                <div>
                                                    {contact.full_name && <p className="font-bold text-sm">{contact.full_name}</p>}
                                                    {contact.title && <p className="text-xs text-stone-500">{contact.title}</p>}
                                                    {contact.email && <p className="text-xs text-blue-600 mt-0.5">{contact.email}</p>}
                                                    {contact.phone && <p className="text-xs text-stone-600 mt-0.5">{contact.phone}</p>}
                                                </div>
                                                <div className="flex gap-1">
                                                    {contact.email && (
                                                        <a href={`mailto:${contact.email}`} title="Email" className="p-1.5 bg-white hover:bg-stone-200 rounded-full text-stone-600 border border-stone-200 transition-colors">
                                                            <Mail className="w-3 h-3" />
                                                        </a>
                                                    )}
                                                    {contact.linkedin_url && (
                                                        <a href={contact.linkedin_url} title="LinkedIn" target="_blank" rel="noopener noreferrer" className="p-1.5 bg-white hover:bg-stone-200 rounded-full text-stone-600 border border-stone-200 transition-colors">
                                                            <ExternalLink className="w-3 h-3" />
                                                        </a>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : contractor?.primary_poc_name ? (
                                    <div className="bg-stone-50 p-3 rounded-xl border border-stone-100 flex justify-between items-start">
                                        <div>
                                            <p className="font-bold text-sm">{contractor.primary_poc_name}</p>
                                            {contractor.primary_poc_title && <p className="text-xs text-stone-500">{contractor.primary_poc_title}</p>}
                                            {contractor.primary_poc_email && <p className="text-xs text-blue-600 mt-0.5">{contractor.primary_poc_email}</p>}
                                            {contractor.primary_poc_phone && <p className="text-xs text-stone-600 mt-0.5">{contractor.primary_poc_phone}</p>}
                                            <p className="text-[9px] text-stone-400 mt-1 font-typewriter">Source: SAM.gov Registration</p>
                                        </div>
                                        <div className="flex gap-1">
                                            {contractor.primary_poc_email && (
                                                <a href={`mailto:${contractor.primary_poc_email}`} title="Email" className="p-1.5 bg-white hover:bg-stone-200 rounded-full text-stone-600 border border-stone-200 transition-colors">
                                                    <Mail className="w-3 h-3" />
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-xs text-stone-400 italic">No decision maker data yet. Run enrichment to discover contacts.</p>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="bg-white p-8 rounded-[32px] border border-stone-200 shadow-sm">
                        <h3 className="font-typewriter font-bold text-lg mb-6 flex items-center"><Briefcase className="w-5 h-5 mr-3 text-stone-400" /> Opportunity Details</h3>
                        <div className="space-y-4 text-sm">
                            <div>
                                <p className="text-stone-500 font-typewriter text-xs uppercase mb-1">Agency & Title</p>
                                <Link href={`/opportunities/${match.opportunity_id}`} className="block hover:opacity-70 transition-opacity">
                                    <p className="font-bold">{opportunity?.agency || "No Agency Info"}</p>
                                    <p className="text-stone-600 italic mt-1">{opportunity?.title}</p>
                                </Link>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-stone-500 font-typewriter text-xs uppercase mb-1">NAICS</p>
                                    <p className="font-mono font-bold text-black">{opportunity?.naics_code}</p>
                                </div>
                                <div>
                                    <p className="text-stone-500 font-typewriter text-xs uppercase mb-1">Deadline</p>
                                    <p className="font-sans font-bold text-red-600">
                                        {opportunity?.response_deadline ? new Date(opportunity.response_deadline).toLocaleDateString() : "TBD"}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Column: AI Drafting Engine */}
                <div className="bg-stone-900 rounded-[32px] p-8 text-white relative flex flex-col shadow-xl">
                    <div className="absolute top-0 right-0 w-48 h-48 bg-stone-700/30 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>

                    <h3 className="font-typewriter font-bold text-xl mb-4 flex items-center text-stone-100">
                        <Sparkles className="w-5 h-5 mr-3 text-stone-400" /> Capture OS Communications
                    </h3>
                    <p className="text-stone-400 font-sans text-sm mb-6 leading-relaxed">
                        Generate strategic, sub-180 word outreach drafts specifically formatted for this contractor-opportunity pair using the B.L.A.S.T ruleset.
                    </p>

                    <div className="bg-black/50 border border-stone-700 p-5 rounded-2xl mb-8">
                        <p className="font-typewriter text-xs text-stone-500 uppercase mb-3 text-center">Enhanced Match Intelligence</p>
                        <div className="grid grid-cols-2 gap-4 text-sm font-mono text-stone-300 px-4">
                            <span className="flex justify-between"><span>NAICS:</span> <span>{match.score_breakdown?.naics ?? match.score_breakdown?.naics_fit ?? 0}/30</span></span>
                            <span className="flex justify-between"><span>Geo:</span> <span>{match.score_breakdown?.geo ?? match.score_breakdown?.geo_fit ?? 0}/15</span></span>
                            <span className="flex justify-between"><span>Capacity:</span> <span>{match.score_breakdown?.capacity ?? 0}/20</span></span>
                            <span className="flex justify-between"><span>Inactivity:</span> <span>{match.score_breakdown?.inactivity ?? match.score_breakdown?.federal_inactivity ?? 0}/20</span></span>
                            <span className="flex justify-between"><span>Density:</span> <span>{match.score_breakdown?.density ?? match.score_breakdown?.competition_adjustment ?? 0}/15</span></span>
                            <span className="flex justify-between"><span>Base:</span> <span className="text-stone-400">{match.score_breakdown?.base ?? match.score_breakdown?.total_score ?? 0}/100</span></span>
                        </div>
                        {(match.score_breakdown?.notice_type > 0 || match.score_breakdown?.past_performance > 0 || match.score_breakdown?.incumbent_risk !== 0) && (
                            <div className="mt-3 pt-3 border-t border-stone-700">
                                <p className="font-typewriter text-xs text-stone-500 uppercase mb-2 text-center">Intelligence Bonus</p>
                                <div className="grid grid-cols-2 gap-4 text-sm font-mono text-stone-300 px-4">
                                    {match.score_breakdown?.notice_type > 0 && (
                                        <span className="flex justify-between"><span>Notice Type:</span> <span className="text-emerald-400">+{match.score_breakdown.notice_type}</span></span>
                                    )}
                                    {match.score_breakdown?.past_performance > 0 && (
                                        <span className="flex justify-between"><span>Past Perf:</span> <span className="text-emerald-400">+{match.score_breakdown.past_performance}</span></span>
                                    )}
                                    {match.score_breakdown?.incumbent_risk < 0 && (
                                        <span className="flex justify-between"><span>Incumbent:</span> <span className="text-amber-400">{match.score_breakdown.incumbent_risk}</span></span>
                                    )}
                                    <span className="flex justify-between col-span-2 border-t border-stone-700 pt-2 mt-1">
                                        <span>Final:</span> <span className="text-white font-bold">{match.score_breakdown?.total ?? 0}/140</span>
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>

                    {drafts.length > 0 ? (
                        <div className="space-y-4 overflow-y-auto flex-1 pr-2 custom-scrollbar">
                            {drafts.map((draft, i) => (
                                <div key={i} className="bg-white text-black p-5 rounded-2xl shadow-inner relative group">
                                    <p className="font-mono text-xs whitespace-pre-wrap">{draft}</p>
                                    <button aria-label="Send Draft" title="Send Draft" className="absolute top-4 right-4 bg-stone-100 p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-stone-200">
                                        <Send className="w-4 h-4 text-stone-600" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col justify-center items-center opacity-50 space-y-4">
                            <FileText className="w-12 h-12 text-stone-600" />
                            <p className="font-typewriter text-stone-500 text-sm">No drafts generated.</p>
                        </div>
                    )}

                    <button
                        onClick={handleGenerateDrafts}
                        disabled={drafting}
                        className="w-full mt-6 py-4 rounded-full bg-white text-black font-typewriter text-sm font-bold hover:bg-stone-200 transition-all shadow-[0_0_20px_rgba(255,255,255,0.1)] flex items-center justify-center"
                    >
                        {drafting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processing...</> : "Generate Gemini Strategy Drafts"}
                    </button>
                </div>

            </div>

            {/* Alternative Contractors Section */}
            {alternatives.length > 0 && (
                <div className="mt-12 bg-white rounded-[32px] border border-stone-200 shadow-sm p-8">
                    <h3 className="font-typewriter font-bold text-xl mb-6 flex items-center text-black">
                        <Target className="w-6 h-6 mr-3 text-stone-400" /> Top {alternatives.length} Alternative Contractors
                        <span className="ml-3 text-sm font-normal text-stone-500">Also matched to this opportunity</span>
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {alternatives.map((alt) => (
                            <Link key={alt.id} href={`/matches/${alt.id}`} className="block border border-stone-100 rounded-2xl p-5 hover:border-black hover:shadow-md transition-all group bg-stone-50 hover:bg-white">
                                <div className="flex justify-between items-start mb-2">
                                    <h4 className="font-bold text-stone-800 group-hover:text-black line-clamp-1 pr-4">{alt.contractors.company_name}</h4>
                                    <span className="font-typewriter text-xs font-bold text-stone-500 whitespace-nowrap">Score: {alt.score}/100</span>
                                </div>
                                <div className="flex items-center text-xs text-stone-500 font-mono space-x-4">
                                    <span>UEI: {alt.contractors.uei}</span>
                                    {(alt.contractors.city || alt.contractors.state) && (
                                        <span className="flex items-center"><MapPin className="w-3 h-3 mr-1" /> {alt.contractors.city}, {alt.contractors.state}</span>
                                    )}
                                </div>
                            </Link>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
