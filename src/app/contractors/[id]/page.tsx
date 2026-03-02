import { createClient } from "@supabase/supabase-js";
import { ArrowLeft, Building, ShieldCheck, Mail, MapPin, Briefcase } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

// Force dynamic rendering
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
                    Back to Roster
                </Link>
                <div className="flex items-center space-x-6 mb-4">
                    <div className="w-20 h-20 rounded-[24px] bg-black flex items-center justify-center flex-shrink-0 shadow-lg shadow-stone-300">
                        <Building className="w-10 h-10 text-white" />
                    </div>
                    <div>
                        <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-black mb-2">
                            {contractor.company_name}
                        </h1>
                        <div className="flex space-x-4">
                            <span className="font-mono text-stone-500 text-sm">UEI: <span className="text-black font-bold">{contractor.uei}</span></span>
                            <span className="font-mono text-stone-500 text-sm">CAGE: <span className="text-black font-bold">{contractor.cage_code}</span></span>
                        </div>
                    </div>
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

                {/* Capabilities Narrative */}
                <div className="md:col-span-2 bg-white rounded-[40px] border border-stone-200 shadow-sm p-8">
                    <h3 className="font-typewriter font-bold text-lg mb-6 flex items-center">
                        <Briefcase className="w-5 h-5 mr-3" /> Core Capabilities
                    </h3>
                    <div className="prose prose-stone text-sm max-w-none leading-relaxed">
                        <p>{contractor.capabilities_narrative || "No specific capabilities narrative provided."}</p>
                    </div>

                    <h3 className="font-typewriter font-bold text-lg mt-10 mb-6 flex items-center">
                        <ShieldCheck className="w-5 h-5 mr-3" /> Certifications & Codes
                    </h3>
                    <div className="space-y-6">
                        <div>
                            <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-3">Registered NAICS</p>
                            <div className="flex flex-wrap gap-2">
                                {contractor.naics_codes?.map((code: string) => (
                                    <span key={code} className="bg-stone-100 text-stone-800 border border-stone-200 px-3 py-1 rounded-lg font-mono text-sm shadow-sm">
                                        {code}
                                    </span>
                                ))}
                            </div>
                        </div>
                        <div>
                            <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-3">Business Certifications</p>
                            <div className="flex flex-wrap gap-2">
                                {contractor.certifications?.map((cert: string) => (
                                    <span key={cert} className="bg-black text-white px-3 py-1 rounded-lg font-typewriter tracking-widest text-[10px] uppercase shadow-sm">
                                        {cert}
                                    </span>
                                ))}
                                {(!contractor.certifications || contractor.certifications.length === 0) && (
                                    <span className="text-stone-400 text-sm italic">None recorded</span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Sidebar Info */}
                <div className="space-y-6">
                    <div className="bg-white rounded-[40px] border border-stone-200 shadow-sm p-8">
                        <h3 className="font-typewriter font-bold text-lg mb-6 flex items-center">
                            <Building className="w-5 h-5 mr-3" /> Profile Stats
                        </h3>
                        <div className="space-y-4">
                            <div className="pb-4 border-b border-stone-100">
                                <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-1">Company Size</p>
                                <p className="font-bold text-black">Small Business</p>
                            </div>
                            <div className="pb-4 border-b border-stone-100">
                                <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-1 flex items-center">
                                    <MapPin className="w-3 h-3 mr-1" /> HQ Location
                                </p>
                                <p className="font-bold text-black">United States</p>
                            </div>
                            <div>
                                <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-1 flex items-center">
                                    <Mail className="w-3 h-3 mr-1" /> Match Activity
                                </p>
                                <div className="text-4xl font-black font-typewriter tracking-tighter mt-2">
                                    {(contractor.uei?.charCodeAt(0) % 4) + 1 || 2} <span className="text-sm font-sans tracking-normal font-medium text-stone-400">HOT Links</span>
                                </div>
                            </div>
                        </div>
                        <button className="w-full mt-8 py-3 rounded-full bg-black text-white font-typewriter font-bold text-sm shadow-lg hover:bg-stone-800 transition-colors">
                            Update SAM Profile
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
}
