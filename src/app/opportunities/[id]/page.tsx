import { createClient } from "@supabase/supabase-js";
import { ArrowLeft, Building, Target, FileText, Calendar, Link as LinkIcon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

// Force dynamic rendering
export const dynamic = 'force-dynamic';

export default async function OpportunityDetailPage({ params }: { params: { id: string } }) {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!
    );

    const { data: opp, error } = await supabase
        .from("opportunities")
        .select("*")
        .eq("id", params.id)
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
                        {opp.notice_type || "UNKNOWN"}
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
                            <h2 className="text-xl font-bold">{opp.agency || "Agency Not Specified"}</h2>
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
                                        {opp.set_aside_code || "NONE / UNRESTRICTED"}
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
                                    <p className="text-xs text-stone-500">Posted Date</p>
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
                                <FileText className="w-3 h-3 mr-1" /> Brief Context
                            </p>
                            <div className="bg-stone-50 border border-stone-200 p-5 rounded-2xl">
                                <p className="text-sm text-stone-600 leading-relaxed font-sans">
                                    This opportunity was automatically ingested from SAM.gov via the Capture.OS Intelligence Stream.
                                    Metadata extraction limits extensive description fields to reduce payload overhead. Follow the source link to view absolute procurement documents.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
