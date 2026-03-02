import { createClient } from "@supabase/supabase-js";
import { ArrowLeft, Building, Target, FileText, Calendar, Link as LinkIcon, BrainCircuit, CheckCircle2, AlertTriangle } from "lucide-react";
import clsx from "clsx";
import Link from "next/link";
import { notFound } from "next/navigation";

// Force dynamic rendering
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

    return (
        <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500 pb-12">
            <header className="mb-6">
                <Link href="/opportunities" className="inline-flex items-center text-sm font-typewriter text-stone-500 hover:text-black mb-6 transition-colors">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Opportunities
                </Link>
                <div className="flex flex-wrap items-center gap-3 mb-4">
                    <span className="bg-stone-100 text-stone-600 font-typewriter text-xs px-3 py-1.5 rounded-md border border-stone-200 uppercase tracking-wider">
                        {opp.opportunity_types?.name || "UNKNOWN"}
                    </span>
                    <span className="font-mono text-stone-500 text-sm">{opp.notice_id}</span>
                </div>
                <h1 className="text-3xl md:text-4xl font-bold font-typewriter tracking-tighter text-black leading-tight">
                    {opp.title}
                </h1>
            </header>

            <div className="bg-white rounded-[40px] border border-stone-200 shadow-sm overflow-hidden">
                <div className="p-8 border-b border-stone-100">
                    <div className="flex items-center space-x-4 mb-6">
                        <div className="w-12 h-12 rounded-full bg-stone-100 flex items-center justify-center">
                            <Building className="w-6 h-6 text-stone-600" />
                        </div>
                        <div>
                            <p className="text-xs font-typewriter text-stone-400 uppercase tracking-widest mb-1">Soliciting Agency</p>
                            <h2 className="text-xl font-bold">{opp.agencies?.sub_tier || opp.agencies?.department || "Agency Not Specified"}</h2>
                        </div>
                    </div>
                    {opp.link_url && (
                        <a
                            href={opp.link_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center space-x-2 text-sm font-bold font-typewriter bg-stone-100 px-4 py-2 rounded-full hover:bg-stone-200 transition-colors"
                        >
                            <LinkIcon className="w-4 h-4" />
                            <span>View Source on SAM.gov</span>
                        </a>
                    )}
                </div>

                <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-6 flex-1">
                        <div>
                            <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-2 flex items-center">
                                <Target className="w-3 h-3 mr-1" /> Classification
                            </p>
                            <div className="space-y-4">
                                <div className="bg-stone-50 border border-stone-200 p-4 rounded-2xl">
                                    <p className="text-xs text-stone-500 mb-1">Primary NAICS</p>
                                    <p className="font-mono font-bold text-lg">{opp.naics_code || "---"}</p>
                                </div>
                                <div className="bg-stone-50 border border-stone-200 p-4 rounded-2xl flex justify-between items-center">
                                    <p className="text-xs text-stone-500">Set-Aside Status</p>
                                    <span className="font-typewriter text-[10px] font-bold bg-black text-white px-2 py-1 rounded uppercase tracking-wider">
                                        {opp.set_asides?.code || "NONE / UNRESTRICTED"}
                                    </span>
                                </div>
                                <div className="bg-stone-50 border border-stone-200 p-4 rounded-2xl flex justify-between items-center">
                                    <p className="text-xs text-stone-500">Product Service Code (PSC)</p>
                                    <span className="font-mono font-bold">
                                        {opp.classification_code || "---"}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-6 flex-1">
                        <div>
                            <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-2 flex items-center">
                                <Calendar className="w-3 h-3 mr-1" /> Timeline
                            </p>
                            <div className="space-y-4">
                                <div className="bg-stone-50 border border-stone-200 p-4 rounded-2xl flex justify-between items-center">
                                    <p className="text-xs text-stone-500">Creation Date</p>
                                    <p className="font-sans font-bold">
                                        {opp.posted_date ? new Date(opp.posted_date).toLocaleDateString() : "---"}
                                    </p>
                                </div>
                                <div className="bg-stone-50 border border-stone-200 p-4 rounded-2xl flex justify-between items-center border-l-4 border-l-stone-800">
                                    <p className="text-xs text-stone-500">Response Deadline</p>
                                    <p className="font-sans font-bold text-lg">
                                        {opp.response_deadline ? new Date(opp.response_deadline).toLocaleDateString() : "TBD"}
                                    </p>
                                </div>
                            </div>
                        </div>

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
                                    <p className="text-sm text-stone-600 leading-relaxed font-sans">
                                        No downloadable assets were found in the SAM.gov registry for this opportunity.
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* AI Document Analysis */}
            {opp.ai_analysis && !opp.ai_analysis.error && !opp.ai_analysis.status && (
                <div className="bg-stone-900 rounded-[32px] p-8 mt-8 text-white relative flex flex-col shadow-xl overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-stone-700/30 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>

                    <h3 className="font-typewriter font-bold text-xl mb-6 flex items-center text-stone-100 relative z-10">
                        <BrainCircuit className="w-6 h-6 mr-3 text-stone-400" /> AI Document Extraction & Analysis
                    </h3>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 relative z-10">
                        <div className="lg:col-span-2 space-y-6">
                            <div className="bg-black/40 border border-stone-700 p-6 rounded-2xl">
                                <p className="text-[10px] font-typewriter text-stone-500 uppercase tracking-widest mb-3">Executive Summary</p>
                                <p className="text-stone-300 leading-relaxed font-sans text-sm">
                                    {opp.ai_analysis.summary}
                                </p>
                            </div>

                            <div className="bg-black/40 border border-stone-700 p-6 rounded-2xl">
                                <p className="text-[10px] font-typewriter text-stone-500 uppercase tracking-widest mb-3">Compliance Requirements</p>
                                <ul className="space-y-2">
                                    {opp.ai_analysis.compliance_requirements?.map((req: string, idx: number) => (
                                        <li key={idx} className="flex items-start text-stone-300 text-sm">
                                            <CheckCircle2 className="w-4 h-4 mr-2 text-green-500 shrink-0 mt-0.5" />
                                            <span>{req}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>

                        <div className="space-y-6">
                            <div className="bg-black/40 border border-stone-700 p-5 rounded-2xl">
                                <p className="text-[10px] font-typewriter text-stone-500 uppercase tracking-widest mb-2">Estimated Risk Level</p>
                                <div className="flex items-center space-x-2">
                                    <AlertTriangle className={clsx("w-5 h-5", opp.ai_analysis.estimated_risk_level === "HIGH" ? "text-red-500" : opp.ai_analysis.estimated_risk_level === "MEDIUM" ? "text-yellow-500" : "text-green-500")} />
                                    <span className="font-bold font-mono text-lg">{opp.ai_analysis.estimated_risk_level || "UNKNOWN"}</span>
                                </div>
                            </div>

                            <div className="bg-black/40 border border-stone-700 p-5 rounded-2xl">
                                <p className="text-[10px] font-typewriter text-stone-500 uppercase tracking-widest mb-2">Action Recommendation</p>
                                <span className="bg-stone-100 text-black px-3 py-1.5 rounded-md font-typewriter text-sm font-bold uppercase tracking-wider inline-block">
                                    {opp.ai_analysis.action_recommendation || "Needs Review"}
                                </span>
                            </div>

                            <div className="bg-black/40 border border-stone-700 p-5 rounded-2xl">
                                <p className="text-[10px] font-typewriter text-stone-500 uppercase tracking-widest mb-2">Incumbent Mentioned</p>
                                <span className="font-bold font-mono text-lg">
                                    {opp.ai_analysis.incumbent_mentioned ? "Yes" : "No"}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {opp.ai_analysis?.status === "extraction_failed" && (
                <div className="bg-red-50 border border-red-200 text-red-600 rounded-2xl p-4 mt-8 flex items-center">
                    <AlertTriangle className="w-5 h-5 mr-3" />
                    <div>
                        <p className="font-bold text-sm">Document Parsing Failed</p>
                        <p className="text-xs mt-1">{opp.ai_analysis.reason}</p>
                    </div>
                </div>
            )}
        </div>
    );
}
