import { createClient } from "@supabase/supabase-js";
import { ArrowLeft, Building, Target, FileText, Link as LinkIcon, BrainCircuit, ShieldAlert, Award, Briefcase, Zap, MapPin, DollarSign } from "lucide-react";
import clsx from "clsx";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = 'force-dynamic';

export default async function OpportunityDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!
    );

    const { data: opp, error } = await supabase
        .from("opportunities")
        .select("*, agencies(department, sub_tier), opportunity_types(name), set_asides(code)")
        .eq("id", (await params).id)
        .single();

    if (error || !opp) {
        notFound();
    }

    // Parse complex JSONB fields cleanly
    const reqs = opp.structured_requirements || {};
    const strat = opp.strategic_scoring || {};
    const aiStrat = opp.ai_win_strategy || {};
    const setAsides = opp.set_aside_types || {};

    // Helper formatting
    const formattedValue = opp.estimated_value ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(opp.estimated_value) : "TBD";
    const statusColor = (val: string) => {
        if (!val) return "text-stone-500 bg-stone-100";
        const v = val.toUpperCase();
        if (v === "HIGH") return "text-red-700 bg-red-100 border-red-200";
        if (v === "MEDIUM") return "text-yellow-700 bg-yellow-100 border-yellow-200";
        if (v === "LOW") return "text-green-700 bg-green-100 border-green-200";
        return "text-stone-700 bg-stone-100 border-stone-200";
    };

    return (
        <div className="max-w-5xl mx-auto space-y-10 animate-in fade-in duration-500 pb-16">
            {/* Header section */}
            <header className="mb-8">
                <Link href="/opportunities" className="inline-flex items-center text-sm font-typewriter text-stone-500 hover:text-black mb-6 transition-colors">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Opportunities
                </Link>
                <div className="flex flex-wrap items-center gap-3 mb-4">
                    <span className="bg-stone-100 text-stone-600 font-typewriter text-xs px-3 py-1.5 rounded-md border border-stone-200 uppercase tracking-wider">
                        {opp.opportunity_types?.name || "UNKNOWN TYPE"}
                    </span>
                    <span className="font-mono text-stone-500 text-sm">{opp.notice_id}</span>
                </div>
                <h1 className="text-3xl md:text-5xl font-bold font-typewriter tracking-tighter text-black leading-tight mb-4">
                    {opp.title}
                </h1>

                <div className="flex flex-wrap gap-4 mt-6">
                    <div className="flex items-center space-x-2 text-sm font-typewriter text-stone-500">
                        <Building className="w-4 h-4" />
                        <span>{opp.agencies?.sub_tier || opp.agencies?.department || "Agency Not Specified"}</span>
                    </div>
                    <div className="flex items-center space-x-2 text-sm font-typewriter text-stone-500">
                        <MapPin className="w-4 h-4" />
                        <span>{[opp.place_of_performance_city, opp.place_of_performance_state].filter(Boolean).join(", ") || "Location TBD"}</span>
                    </div>
                    <div className="flex items-center space-x-2 text-sm font-typewriter text-emerald-600 font-bold">
                        <DollarSign className="w-4 h-4" />
                        <span>{formattedValue}</span>
                    </div>
                </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column: Heavy Data */}
                <div className="lg:col-span-2 space-y-8">

                    {/* Block 1: Basic Contract Data */}
                    <div className="bg-white rounded-[32px] border border-stone-200 shadow-sm p-8">
                        <h2 className="font-typewriter text-lg font-bold mb-6 flex items-center">
                            <Target className="w-5 h-5 mr-3 text-stone-400" /> Basic Contract Data
                        </h2>

                        <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-1">
                                <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest">Primary NAICS</p>
                                <p className="font-mono font-bold text-lg">{Array.isArray(opp.naics_code) ? opp.naics_code.join(", ") : (opp.naics_code || "---")}</p>
                            </div>
                            <div className="space-y-1">
                                <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest">Set-Aside Status</p>
                                <p className="font-mono font-bold text-lg">{opp.set_asides?.code || "UNRESTRICTED"}</p>
                            </div>
                            <div className="space-y-1">
                                <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest">Creation Date</p>
                                <p className="font-sans font-bold">{opp.posted_date ? new Date(opp.posted_date).toLocaleDateString() : "---"}</p>
                            </div>
                            <div className="space-y-1">
                                <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest">Response Deadline</p>
                                <p className="font-sans font-bold text-red-600">{opp.response_deadline ? new Date(opp.response_deadline).toLocaleDateString() : "TBD"}</p>
                            </div>
                        </div>
                    </div>

                    {/* Block 2: Structured Requirements */}
                    <div className="bg-white rounded-[32px] border border-stone-200 shadow-sm p-8">
                        <h2 className="font-typewriter text-lg font-bold mb-6 flex items-center">
                            <Briefcase className="w-5 h-5 mr-3 text-stone-400" /> Structured Requirements
                        </h2>

                        <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                            <div className="bg-stone-50 p-4 rounded-2xl border border-stone-100">
                                <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-1">Min Workforce</p>
                                <p className="font-bold">{reqs.min_workforce ? `${reqs.min_workforce}+ Employees` : "Not Specified"}</p>
                            </div>
                            <div className="bg-stone-50 p-4 rounded-2xl border border-stone-100">
                                <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-1">Bonding Req.</p>
                                <p className="font-bold">{reqs.bonding_req || "Not Specified"}</p>
                            </div>
                            <div className="bg-stone-50 p-4 rounded-2xl border border-stone-100">
                                <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-1">Years Required</p>
                                <p className="font-bold">{reqs.years_experience ? `${reqs.years_experience} Years` : "Not Specified"}</p>
                            </div>
                            <div className="bg-stone-50 p-4 rounded-2xl border border-stone-100 md:col-span-3">
                                <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-1">Certifications Needed</p>
                                <p className="font-bold text-sm">{reqs.certifications || "None explicitly requested in summary."}</p>
                            </div>
                        </div>
                    </div>

                    {/* Block 3: AI Document Analysis (Legacy fallback if phase 3 ai is present but not phase 4) */}
                    {opp.ai_analysis && !opp.ai_analysis.error && !opp.ai_analysis.status && !aiStrat.summary && (
                        <div className="bg-white rounded-[32px] border border-stone-200 shadow-sm p-8">
                            <h3 className="font-typewriter font-bold text-lg mb-6 flex items-center text-black">
                                <BrainCircuit className="w-5 h-5 mr-3 text-stone-400" /> Legacy Document Extraction
                            </h3>
                            <div className="space-y-4">
                                <p className="text-sm text-stone-600">{opp.ai_analysis.summary}</p>
                            </div>
                        </div>
                    )}

                </div>

                {/* Right Column: Strategic AI Win Info */}
                <div className="space-y-8">

                    {/* Strategic Scoring */}
                    <div className="bg-white rounded-[32px] border border-stone-200 shadow-sm p-8">
                        <h2 className="font-typewriter text-lg font-bold mb-6 flex items-center">
                            <Award className="w-5 h-5 mr-3 text-stone-400" /> Strategic Limits
                        </h2>

                        <div className="space-y-4">
                            <div className="flex justify-between items-center border-b border-stone-100 pb-3">
                                <span className="text-xs font-typewriter text-stone-500 uppercase tracking-widest">Win Prob Tier</span>
                                <span className={clsx("text-xs font-bold px-3 py-1 rounded-full border", statusColor(strat.win_prob_tier))}>
                                    {strat.win_prob_tier || "UNKNOWN"}
                                </span>
                            </div>
                            <div className="flex justify-between items-center border-b border-stone-100 pb-3">
                                <span className="text-xs font-typewriter text-stone-500 uppercase tracking-widest">Competition</span>
                                <span className={clsx("text-xs font-bold px-3 py-1 rounded-full border", statusColor(strat.est_competition_level))}>
                                    {strat.est_competition_level || "UNKNOWN"}
                                </span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-xs font-typewriter text-stone-500 uppercase tracking-widest">Complexity</span>
                                <span className={clsx("text-xs font-bold px-3 py-1 rounded-full border", statusColor(strat.complexity_level))}>
                                    {strat.complexity_level || "UNKNOWN"}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* AI Win Strategy (Phase 4 Premium UI) */}
                    <div className="bg-stone-900 rounded-[32px] text-white p-8 relative overflow-hidden shadow-xl">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-stone-700/30 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>

                        <h2 className="font-typewriter text-lg font-bold mb-6 flex items-center relative z-10">
                            <Zap className="w-5 h-5 mr-3 text-emerald-400" /> AI Win Strategy
                        </h2>

                        <div className="space-y-6 relative z-10">
                            <div>
                                <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-2">Deal Summary</p>
                                <p className="text-sm text-stone-300 leading-relaxed">
                                    {aiStrat.summary || "No AI strategy generated yet. Please run the evaluation tool."}
                                </p>
                            </div>

                            {aiStrat.sales_angle && (
                                <div className="bg-black/40 rounded-2xl p-4 border border-stone-700">
                                    <p className="text-[10px] font-typewriter text-emerald-400 uppercase tracking-widest mb-2">Primary Sales Angle</p>
                                    <p className="text-sm text-white font-bold">{aiStrat.sales_angle}</p>
                                </div>
                            )}

                            {aiStrat.key_risks && aiStrat.key_risks.length > 0 && (
                                <div>
                                    <p className="text-[10px] font-typewriter text-rose-400 uppercase tracking-widest mb-2 flex items-center">
                                        <ShieldAlert className="w-3 h-3 mr-1" /> Key Risks
                                    </p>
                                    <ul className="space-y-2">
                                        {aiStrat.key_risks.map((risk: string, i: number) => (
                                            <li key={i} className="text-xs text-stone-400 flex items-start">
                                                <span className="mr-2 text-rose-500">•</span>
                                                {risk}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Resources */}
                    <div className="mt-8">
                        <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-2 flex items-center">
                            <FileText className="w-3 h-3 mr-1" /> Downloadable Assets
                        </p>
                        <div className="bg-stone-50 border border-stone-200 p-5 rounded-2xl">
                            {opp.resource_links && opp.resource_links.length > 0 ? (
                                <ul className="space-y-2">
                                    {opp.resource_links.map((link: string, idx: number) => (
                                        <li key={idx}>
                                            <a href={link} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-sm font-sans flex items-center">
                                                <LinkIcon className="w-3 h-3 mr-1" /> Attachment {idx + 1}
                                            </a>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="text-[10px] text-stone-500 leading-relaxed font-sans uppercase tracking-widest">
                                    No attachments found on SAM.gov
                                </p>
                            )}
                        </div>
                    </div>

                </div>
            </div>

            {/* Find Candidate Matches Breakout Section */}
            <div className="mt-12 text-center border-t border-stone-200 pt-12">
                <Link href={`/matches/${opp.id}`} className="inline-flex items-center justify-center bg-black text-white font-typewriter font-bold px-10 py-4 rounded-full hover:bg-stone-800 transition-transform active:scale-95 shadow-lg">
                    <Target className="w-5 h-5 mr-3" />
                    View Top 15 Matched Contractors
                </Link>
            </div>
        </div>
    );
}
