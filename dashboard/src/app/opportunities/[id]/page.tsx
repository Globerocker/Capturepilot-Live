import { createClient } from "@supabase/supabase-js";
import { ArrowLeft, Building, Target, FileText, Link as LinkIcon, ShieldAlert, Award, Briefcase, Zap, MapPin, Calendar, CheckSquare, Sparkles } from "lucide-react";
import clsx from "clsx";
import Link from "next/link";
import { notFound } from "next/navigation";
import EnrichButton from "@/components/EnrichButton";
import EnrichedContractorsList from "@/components/EnrichedContractorsList";

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

    const locationString = [
        opp.place_of_performance_city,
        opp.place_of_performance_state,
        opp.place_of_performance_zip,
        opp.place_of_performance_country
    ].filter(Boolean).join(", ");

    return (
        <div className="max-w-6xl mx-auto space-y-10 animate-in fade-in duration-500 pb-16">
            {/* Header section */}
            <header className="mb-4">
                <Link href="/opportunities" className="inline-flex items-center text-sm font-typewriter text-stone-500 hover:text-black mb-6 transition-colors">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Opportunities
                </Link>
                <div className="flex flex-wrap items-center gap-3 mb-4">
                    <span className="bg-stone-100 text-stone-800 font-bold font-typewriter text-xs px-3 py-1.5 rounded-md border border-stone-200 uppercase tracking-wider shadow-sm">
                        {opp.notice_id}
                    </span>
                    <span className="bg-blue-50 text-blue-700 font-bold font-typewriter text-xs px-3 py-1.5 rounded-md border border-blue-200 tracking-wider shadow-sm">
                        {opp.opportunity_types?.name || "UNKNOWN TYPE"}
                    </span>
                    {opp.is_archived && (
                        <span className="bg-stone-800 text-stone-100 font-bold font-typewriter text-xs px-3 py-1.5 rounded-md shadow-sm tracking-wider">
                            ARCHIVED
                        </span>
                    )}
                </div>
                <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-stone-900 leading-tight mb-6">
                    {opp.title}
                </h1>
            </header>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                {/* Left Column: Data & Requirements */}
                <div className="xl:col-span-2 space-y-8">

                    {/* 1. BASIC CONTRACT DATA */}
                    <div className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
                        <div className="bg-stone-50 border-b border-stone-100 px-8 py-5 flex items-center justify-between">
                            <h2 className="font-typewriter text-lg font-bold flex items-center text-stone-800">
                                <Target className="w-5 h-5 mr-3 text-stone-400" /> Basic Contract Data
                            </h2>
                            <span className="text-2xl font-bold text-emerald-600 tracking-tight">{formattedValue}</span>
                        </div>

                        <div className="p-8">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-6">
                                    <div>
                                        <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-1.5">Agency / Department</p>
                                        <div className="flex items-start">
                                            <Building className="w-5 h-5 text-stone-400 mr-2 shrink-0 mt-0.5" />
                                            <div>
                                                <p className="font-bold text-stone-800">{opp.agency || opp.agencies?.sub_tier || "Agency Not Specified"}</p>
                                                <p className="text-sm text-stone-500">{opp.department || opp.agencies?.department || ""}</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div>
                                        <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-1.5">NAICS Codes</p>
                                        <div className="flex flex-wrap gap-2">
                                            {Array.isArray(opp.naics_code) ? opp.naics_code.map((n: string, i: number) => (
                                                <span key={i} className="bg-stone-100 text-stone-700 font-mono text-sm px-2.5 py-1 rounded border border-stone-200">
                                                    {n}
                                                </span>
                                            )) : (
                                                <span className="bg-stone-100 text-stone-700 font-mono text-sm px-2.5 py-1 rounded border border-stone-200">
                                                    {opp.naics_code || "---"}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <div>
                                        <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-1.5">Place of Performance</p>
                                        <div className="flex items-start">
                                            <MapPin className="w-5 h-5 text-stone-400 mr-2 shrink-0 mt-0.5" />
                                            <p className="font-medium text-stone-800">{locationString || "Location TBD"}</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-6">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-1.5">Posted Date</p>
                                            <div className="flex items-center text-stone-800 font-medium">
                                                <Calendar className="w-4 h-4 text-stone-400 mr-2" />
                                                {opp.posted_date ? new Date(opp.posted_date).toLocaleDateString() : "---"}
                                            </div>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-1.5">Response Deadline</p>
                                            <div className="flex items-center text-red-600 font-bold">
                                                <Calendar className="w-4 h-4 text-red-400 mr-2" />
                                                {opp.response_deadline ? new Date(opp.response_deadline).toLocaleDateString() : "TBD"}
                                            </div>
                                        </div>
                                    </div>

                                    <div>
                                        <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-2.5">Set-Aside Target</p>
                                        <div className="bg-stone-50 rounded-xl p-4 border border-stone-100">
                                            <p className="font-bold text-stone-800 mb-3 text-sm pb-2 border-b border-stone-200">
                                                Raw: {opp.set_asides?.code || opp.set_aside_code || "UNRESTRICTED"}
                                            </p>
                                            <div className="grid grid-cols-2 gap-y-2 gap-x-4">
                                                <div className="flex items-center space-x-2 text-sm">
                                                    <CheckSquare className={clsx("w-4 h-4", setAsides.total_small_business ? "text-emerald-500" : "text-stone-300")} />
                                                    <span className={clsx(setAsides.total_small_business ? "text-stone-900 font-medium" : "text-stone-400")}>Total SB</span>
                                                </div>
                                                <div className="flex items-center space-x-2 text-sm">
                                                    <CheckSquare className={clsx("w-4 h-4", setAsides.partial_small_business ? "text-emerald-500" : "text-stone-300")} />
                                                    <span className={clsx(setAsides.partial_small_business ? "text-stone-900 font-medium" : "text-stone-400")}>Partial SB</span>
                                                </div>
                                                <div className="flex items-center space-x-2 text-sm">
                                                    <CheckSquare className={clsx("w-4 h-4", setAsides["8a"] ? "text-emerald-500" : "text-stone-300")} />
                                                    <span className={clsx(setAsides["8a"] ? "text-stone-900 font-medium" : "text-stone-400")}>8(a)</span>
                                                </div>
                                                <div className="flex items-center space-x-2 text-sm">
                                                    <CheckSquare className={clsx("w-4 h-4", setAsides.sdvosb ? "text-emerald-500" : "text-stone-300")} />
                                                    <span className={clsx(setAsides.sdvosb ? "text-stone-900 font-medium" : "text-stone-400")}>SDVOSB</span>
                                                </div>
                                                <div className="flex items-center space-x-2 text-sm">
                                                    <CheckSquare className={clsx("w-4 h-4", setAsides.hubzone ? "text-emerald-500" : "text-stone-300")} />
                                                    <span className={clsx(setAsides.hubzone ? "text-stone-900 font-medium" : "text-stone-400")}>HUBZone</span>
                                                </div>
                                                <div className="flex items-center space-x-2 text-sm">
                                                    <CheckSquare className={clsx("w-4 h-4", setAsides.full_and_open ? "text-emerald-500" : "text-stone-300")} />
                                                    <span className={clsx(setAsides.full_and_open ? "text-stone-900 font-medium" : "text-stone-400")}>Full & Open</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 2. STRUCTURED REQUIREMENTS (AI Extracted) */}
                    <div className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
                        <div className="bg-stone-50 border-b border-stone-100 px-8 py-5">
                            <h2 className="font-typewriter text-lg font-bold flex items-center text-stone-800">
                                <Briefcase className="w-5 h-5 mr-3 text-stone-400" /> Structured Requirements
                            </h2>
                        </div>

                        <div className="p-8">
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-6 mb-8">
                                <div className="bg-stone-50 p-4 rounded-2xl border border-stone-100">
                                    <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-1.5">Min Workforce</p>
                                    <p className="font-bold text-stone-800 text-lg">{reqs.min_workforce ? `${reqs.min_workforce}+` : "Not Spec."}</p>
                                </div>
                                <div className="bg-stone-50 p-4 rounded-2xl border border-stone-100">
                                    <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-1.5">Years Experience</p>
                                    <p className="font-bold text-stone-800 text-lg">{reqs.years_experience ? `${reqs.years_experience} Years` : "Not Spec."}</p>
                                </div>
                                <div className="bg-stone-50 p-4 rounded-2xl border border-stone-100">
                                    <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-1.5">Bonding</p>
                                    <p className="font-bold text-stone-800 text-lg">{reqs.bonding_req || "Not Spec."}</p>
                                </div>
                                <div className="bg-stone-50 p-4 rounded-2xl border border-stone-100">
                                    <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-1.5">Performance Period</p>
                                    <p className="font-bold text-stone-800">{reqs.performance_period || "Not Spec."}</p>
                                </div>
                                <div className="bg-stone-50 p-4 rounded-2xl border border-stone-100 md:col-span-2">
                                    <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-1.5">Equipment Required</p>
                                    <p className="font-medium text-stone-800 text-sm line-clamp-2">{reqs.equipment_req || "None explicitly requested."}</p>
                                </div>
                            </div>

                            <div className="space-y-6">
                                <div>
                                    <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-2">Required Certifications</p>
                                    <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100 text-blue-900 text-sm">
                                        {reqs.certifications || "None explicitly requested in summary."}
                                    </div>
                                </div>
                                <div>
                                    <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-2">Evaluation Criteria Summary</p>
                                    <div className="prose prose-sm prose-stone max-w-none text-stone-700">
                                        {reqs.eval_criteria_summary ? (
                                            <p>{reqs.eval_criteria_summary}</p>
                                        ) : (
                                            <p className="italic text-stone-500">Evaluation criteria has not yet been extracted from attachments.</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Resources */}
                    <div className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden p-8">
                        <h2 className="font-typewriter text-lg font-bold mb-6 flex items-center text-stone-800">
                            <FileText className="w-5 h-5 mr-3 text-stone-400" /> Source Attachments & Links
                        </h2>
                        <div className="bg-stone-50 border border-stone-200 p-5 rounded-2xl">
                            {opp.resource_links && opp.resource_links.length > 0 ? (
                                <ul className="space-y-3">
                                    {opp.resource_links.map((link: string, idx: number) => {
                                        // Attempt to extract filename from URL
                                        let fileName = `Attachment ${idx + 1}`;
                                        try {
                                            const urlObj = new URL(link);
                                            const pathname = urlObj.pathname;
                                            const lastPart = pathname.split('/').pop();
                                            if (lastPart && lastPart.length > 0) {
                                                fileName = decodeURIComponent(lastPart);
                                            }
                                        } catch (e) {
                                            // Ignore if URL is invalid
                                        }

                                        return (
                                            <li key={idx} className="flex items-start">
                                                <LinkIcon className="w-4 h-4 mr-3 mt-0.5 text-blue-500 shrink-0" />
                                                <a href={link} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 hover:underline font-medium break-all">
                                                    {fileName}
                                                </a>
                                            </li>
                                        )
                                    })}
                                </ul>
                            ) : (
                                <div className="text-center py-6">
                                    <FileText className="w-8 h-8 text-stone-300 mx-auto mb-3" />
                                    <p className="text-sm font-medium text-stone-500">No attachments found on SAM.gov</p>
                                </div>
                            )}
                        </div>
                    </div>

                </div>

                {/* Right Column: Strategic AI Win Info */}
                <div className="space-y-8">

                    {/* 3. STRATEGIC SCORING */}
                    <div className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
                        <div className="bg-stone-50 border-b border-stone-100 px-6 py-4">
                            <h2 className="font-typewriter text-[15px] font-bold flex items-center text-stone-800">
                                <Award className="w-4 h-4 mr-2 text-stone-400" /> Strategic Scoring
                            </h2>
                        </div>

                        <div className="p-6 space-y-4">
                            <div className="flex justify-between items-center border-b border-stone-100 pb-3">
                                <span className="text-xs font-typewriter text-stone-500 uppercase tracking-widest">Est. Competition</span>
                                <span className={clsx("text-xs font-bold px-3 py-1 rounded-full border", statusColor(strat.est_competition_level))}>
                                    {strat.est_competition_level || "UNKNOWN"}
                                </span>
                            </div>
                            <div className="flex justify-between items-center border-b border-stone-100 pb-3">
                                <span className="text-xs font-typewriter text-stone-500 uppercase tracking-widest">Complexity Level</span>
                                <span className={clsx("text-xs font-bold px-3 py-1 rounded-full border", statusColor(strat.complexity_level))}>
                                    {strat.complexity_level || "UNKNOWN"}
                                </span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-xs font-typewriter text-stone-500 uppercase tracking-widest">Win Prob Tier</span>
                                <span className={clsx("text-xs font-bold px-3 py-1 rounded-full border shadow-sm", statusColor(strat.win_prob_tier))}>
                                    {strat.win_prob_tier || "UNKNOWN"}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* 4. AI WIN STRATEGY */}
                    <div className="bg-stone-900 rounded-3xl text-white relative overflow-hidden shadow-xl border border-stone-800">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>

                        <div className="px-6 py-5 border-b border-stone-800/50 flex items-center justify-between relative z-10">
                            <h2 className="font-typewriter text-[15px] font-bold flex items-center text-white">
                                <Zap className="w-4 h-4 mr-2 text-emerald-400" /> AI Win Strategy
                            </h2>
                        </div>

                        <div className="p-6 space-y-6 relative z-10">
                            <div>
                                <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-2">Executive Summary</p>
                                <p className="text-sm text-stone-300 leading-relaxed">
                                    {aiStrat.summary || "No AI strategy generated yet. Execute Phase 4 document analysis tools to populate."}
                                </p>
                            </div>

                            {aiStrat.sales_angle && (
                                <div className="bg-stone-950/50 rounded-2xl p-4 border border-emerald-900/30">
                                    <p className="text-[10px] font-typewriter text-emerald-400 uppercase tracking-widest mb-2">Recommended Sales Angle</p>
                                    <p className="text-sm text-white font-medium italic">"{aiStrat.sales_angle}"</p>
                                </div>
                            )}

                            {aiStrat.recommended_profile && (
                                <div className="bg-stone-950/50 rounded-2xl p-4 border border-stone-800">
                                    <p className="text-[10px] font-typewriter text-blue-400 uppercase tracking-widest mb-2">Target Profile Match</p>
                                    <p className="text-sm text-stone-300 font-medium">{aiStrat.recommended_profile}</p>
                                </div>
                            )}

                            {aiStrat.key_risks && aiStrat.key_risks.length > 0 && (
                                <div>
                                    <p className="text-[10px] font-typewriter text-rose-400 uppercase tracking-widest mb-3 flex items-center">
                                        <ShieldAlert className="w-3 h-3 mr-1.5" /> Key Risks Identified
                                    </p>
                                    <ul className="space-y-2">
                                        {aiStrat.key_risks.map((risk: string, i: number) => (
                                            <li key={i} className="text-xs text-stone-300 flex items-start bg-rose-950/20 p-2.5 rounded-lg border border-rose-900/30">
                                                <span className="mr-2.5 text-rose-500 font-bold shrink-0 mt-0.5">•</span>
                                                <span className="leading-snug">{risk}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* 5. CONTRACTOR DISCOVERY & ENRICHMENT */}
            <div className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
                <div className="bg-stone-50 border-b border-stone-100 px-8 py-5 flex items-center justify-between">
                    <h2 className="font-typewriter text-lg font-bold flex items-center text-stone-800">
                        <Sparkles className="w-5 h-5 mr-3 text-stone-400" /> Contractor Discovery
                        {opp.enrichment_status === "completed" && (
                            <span className="ml-3 text-sm font-sans font-medium bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full border border-emerald-200">
                                Enriched
                            </span>
                        )}
                    </h2>
                    <EnrichButton opportunityId={opp.id} currentStatus={opp.enrichment_status} />
                </div>
                <div className="p-8">
                    <EnrichedContractorsList opportunityId={opp.id} />
                </div>
            </div>

            {/* 6. FIND CANDIDATE MATCHES (Bottom Section) */}
            <div className="mt-16 bg-white border border-stone-200 rounded-3xl p-10 text-center shadow-sm relative overflow-hidden">
                <div className="absolute left-0 top-0 bottom-0 w-2 bg-gradient-to-b from-blue-400 to-emerald-400"></div>
                <h2 className="text-2xl font-bold font-typewriter text-stone-900 mb-4">Ready to build your capture pipeline?</h2>
                <p className="text-stone-500 max-w-2xl mx-auto mb-8">
                    Our 100-point matching engine evaluates NAICS fit, geographic proximity, verified capacity signals, and federal inactivity to find the highest-probability targets.
                </p>
                <Link href={`/matches/${opp.id}`}
                    className="inline-flex items-center justify-center bg-black text-white font-typewriter font-bold px-10 py-5 rounded-full hover:bg-stone-800 transition-all hover:scale-105 active:scale-95 shadow-lg group">
                    <Target className="w-5 h-5 mr-3 text-emerald-400 group-hover:animate-pulse" />
                    <span className="text-lg">View Top 15 Matched Contractors</span>
                </Link>
            </div>
        </div>
    );
}
