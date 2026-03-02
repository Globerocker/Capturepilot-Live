"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useParams } from "next/navigation";
import { Loader2, ArrowLeft, ArrowRight, Send, Sparkles, Building, Briefcase, FileText } from "lucide-react";
import Link from "next/link";
import clsx from "clsx";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ5eGdqemVob2lqanZjenFraHdyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjA0ODQ1NSwiZXhwIjoyMDg3NjI0NDU1fQ.nemDcqmJMsp0DOlAjZyJyBtmWkZSAzn_Q44_a6Y3dVM"
);

export default function MatchDetailPage() {
    const { id } = useParams();
    const [match, setMatch] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    // AI Email UI State
    const [drafting, setDrafting] = useState(false);
    const [drafts, setDrafts] = useState<string[]>([]);

    useEffect(() => {
        async function fetchData() {
            const { data } = await supabase
                .from("matches")
                .select(`
          id, score, classification, score_breakdown, opportunity_id, contractor_id,
          opportunities (title, agency, notice_id, response_deadline, naics_code, set_aside_code, notice_type),
          contractors (company_name, uei, naics_codes, certifications)
        `)
                .eq("id", id)
                .single();

            setMatch(data);
            setLoading(false);
        }
        if (id) fetchData();
    }, [id]);

    const handleGenerateDrafts = async () => {
        setDrafting(true);
        // Simulate Gemini API call duration
        await new Promise(r => setTimeout(r, 2000));

        // Simulate the exact B.L.A.S.T Prompt constraints: 180 words max, mention NAICS, deadline, and why matched.
        const opp = match.opportunities;
        const con = match.contractors;
        const deadline = opp.response_deadline ? new Date(opp.response_deadline).toLocaleDateString() : 'TBD';

        setDrafts([
            `Subject: Strategic Alignment: ${opp.title}\n\nHi Team at ${con.company_name},\n\nWe identified a strong deterministic match with your profile. The Defense Logistics Agency released "${opp.title}" under NAICS ${opp.naics_code}, directly overlapping your active codes. \n\nYour match score is exceptionally high due to a perfect NAICS alignment and your ${con.certifications?.[0] || 'Small Business'} certification matching the Set-Aside requirements. \n\nPlease review your capabilities against this Sources Sought. Response deadline is firmly set for ${deadline}. Let us know if you need capture support.\n\nBest,\nCapture OS Intelligence`,

            `Subject: Leveraging your Certifications for ${opp.notice_id}\n\nHello ${con.company_name},\n\nYour ${con.certifications?.join(", ")} status gives you a significant advantage in the newly posted ${opp.notice_type} by ${opp.agency}.\n\nUnder NAICS ${opp.naics_code}, the competition will be restricted. Our algorithm matched you because your certifications and exact NAICS code mathematically align with the agency's requirements. \n\nThe deadline is ${deadline}. I strongly recommend we prepare a capabilities brief focusing heavily on your past performance in this specific socio-economic category.\n\nRegards,\nCapture OS Intelligence`
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

    if (!match) return <div>Match not found.</div>;

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
                        <span className="font-typewriter text-stone-400 text-sm">Score: {match.score.toFixed(3)}</span>
                    </div>
                    <h2 className="text-3xl font-bold font-typewriter tracking-tighter text-black flex items-center">
                        {match.contractors.company_name} <ArrowRight className="mx-3 text-stone-300 w-6 h-6" /> {match.opportunities.notice_id}
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
                                <Link href={`/contractors/${match.contractor_id}`} className="font-bold hover:underline">
                                    {match.contractors.company_name} (UEI: {match.contractors.uei})
                                </Link>
                            </div>
                            <div>
                                <p className="text-stone-500 font-typewriter text-xs uppercase mb-1">NAICS Codes</p>
                                <p className="font-mono bg-stone-100 p-2 rounded-lg text-xs break-all leading-relaxed border border-stone-200">{match.contractors.naics_codes?.join(", ")}</p>
                            </div>
                            <div>
                                <p className="text-stone-500 font-typewriter text-xs uppercase mb-1">Certifications</p>
                                <div className="flex flex-wrap gap-2">
                                    {match.contractors.certifications?.map((c: string) => (
                                        <span key={c} className="bg-stone-800 text-stone-200 px-2 py-1 rounded font-typewriter text-[10px] uppercase tracking-wider">{c}</span>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white p-8 rounded-[32px] border border-stone-200 shadow-sm">
                        <h3 className="font-typewriter font-bold text-lg mb-6 flex items-center"><Briefcase className="w-5 h-5 mr-3 text-stone-400" /> Opportunity Details</h3>
                        <div className="space-y-4 text-sm">
                            <div>
                                <p className="text-stone-500 font-typewriter text-xs uppercase mb-1">Agency & Title</p>
                                <Link href={`/opportunities/${match.opportunity_id}`} className="block hover:opacity-70 transition-opacity">
                                    <p className="font-bold">{match.opportunities.agency}</p>
                                    <p className="text-stone-600 italic mt-1">{match.opportunities.title}</p>
                                </Link>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-stone-500 font-typewriter text-xs uppercase mb-1">NAICS</p>
                                    <p className="font-mono font-bold text-black">{match.opportunities.naics_code}</p>
                                </div>
                                <div>
                                    <p className="text-stone-500 font-typewriter text-xs uppercase mb-1">Deadline</p>
                                    <p className="font-sans font-bold text-red-600">
                                        {match.opportunities.response_deadline ? new Date(match.opportunities.response_deadline).toLocaleDateString() : "TBD"}
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
                        <p className="font-typewriter text-xs text-stone-500 uppercase mb-3 text-center">Deterministic Match Math</p>
                        <div className="flex justify-between items-center text-sm font-mono text-stone-300 px-4">
                            <span>NAICS: {match.score_breakdown?.naics_match}</span>
                            <span>Set-Aside: {match.score_breakdown?.setaside_match}</span>
                            <span>Geo: {match.score_breakdown?.geo_match}</span>
                        </div>
                    </div>

                    {drafts.length > 0 ? (
                        <div className="space-y-4 overflow-y-auto flex-1 pr-2 custom-scrollbar">
                            {drafts.map((draft, i) => (
                                <div key={i} className="bg-white text-black p-5 rounded-2xl shadow-inner relative group">
                                    <p className="font-mono text-xs whitespace-pre-wrap">{draft}</p>
                                    <button className="absolute top-4 right-4 bg-stone-100 p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-stone-200">
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
        </div>
    );
}
