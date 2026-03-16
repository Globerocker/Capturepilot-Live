"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseClient } from "@/lib/supabase/client";
import {
    Loader2, Building, Target, Flame, ArrowRight, Search, X,
    ShieldCheck, MapPin, Briefcase, DollarSign, ChevronLeft, ChevronRight,
    ExternalLink, Calendar, FileText, Award, Users, Star, Zap
} from "lucide-react";
import Link from "next/link";
import clsx from "clsx";

export const dynamic = "force-dynamic";

const supabase = createSupabaseClient();

interface ClientContractor {
    id: string;
    company_name: string;
    uei: string;
    city: string;
    state: string;
    naics_codes: string[];
    certifications: string[];
    sba_certifications: string[];
    federal_awards_count: number;
    revenue: number;
    employee_count: number;
}

interface MatchedOpp {
    id: string;
    score: number;
    classification: string;
    opportunity_id: string;
    opp_title: string;
    opp_agency: string;
    opp_naics: string;
    opp_deadline: string;
    opp_notice_type: string;
    opp_state: string;
    opp_set_aside: string;
}

interface BrowseOpp {
    id: string;
    notice_id: string;
    title: string;
    agency: string;
    naics_code: string;
    notice_type: string;
    response_deadline: string;
    place_of_performance_state: string;
    set_aside_code: string;
    posted_date: string;
}

export default function PortalPageWrapper() {
    return (
        <Suspense fallback={<div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-stone-400" /></div>}>
            <PortalPage />
        </Suspense>
    );
}

function PortalPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const contractorParam = searchParams.get("contractor");

    const [loading, setLoading] = useState(true);
    const [searchInput, setSearchInput] = useState("");
    const [contractors, setContractors] = useState<ClientContractor[]>([]);
    const [selectedClient, setSelectedClient] = useState<ClientContractor | null>(null);
    const [tab, setTab] = useState<"matches" | "browse">("matches");

    // Matches for selected client
    const [matchedOpps, setMatchedOpps] = useState<MatchedOpp[]>([]);
    const [matchesLoading, setMatchesLoading] = useState(false);

    // Browse opportunities
    const [browseOpps, setBrowseOpps] = useState<BrowseOpp[]>([]);
    const [browseLoading, setBrowseLoading] = useState(false);
    const [browsePage, setBrowsePage] = useState(1);
    const [browseTotal, setBrowseTotal] = useState(0);
    const browsePageSize = 20;

    // Load contractors for selection
    useEffect(() => {
        async function loadContractors() {
            const { data } = await supabase
                .from("contractors")
                .select("id, company_name, uei, city, state, naics_codes, certifications, sba_certifications, federal_awards_count, revenue, employee_count")
                .neq("data_quality_flag", "LOW_QUALITY")
                .order("company_name", { ascending: true })
                .limit(500);
            const list = (data || []) as unknown as ClientContractor[];
            setContractors(list);

            // Auto-select if contractor param provided
            if (contractorParam) {
                const match = list.find(c => c.id === contractorParam);
                if (match) setSelectedClient(match);
            }
            setLoading(false);
        }
        loadContractors();
    }, [contractorParam]);

    // Load matches for selected client
    const loadMatches = useCallback(async (client: ClientContractor) => {
        setMatchesLoading(true);
        const { data: rawMatches } = await supabase
            .from("matches")
            .select("id, score, classification, opportunity_id, contractor_id")
            .eq("contractor_id", client.id)
            .order("score", { ascending: false })
            .limit(50);

        const rows = rawMatches || [];
        if (rows.length === 0) { setMatchedOpps([]); setMatchesLoading(false); return; }

        const oppIds = [...new Set(rows.map((m: Record<string, string>) => m.opportunity_id))];
        const { data: opps } = await supabase
            .from("opportunities")
            .select("id, title, agency, naics_code, response_deadline, notice_type, place_of_performance_state, set_aside_code")
            .in("id", oppIds);
        const oppMap = new Map((opps || []).map((o: Record<string, string>) => [o.id, o]));

        setMatchedOpps(rows.map((m: Record<string, unknown>) => {
            const opp = oppMap.get(m.opportunity_id as string) as Record<string, string> | undefined;
            return {
                id: m.id as string,
                score: m.score as number,
                classification: m.classification as string,
                opportunity_id: m.opportunity_id as string,
                opp_title: opp?.title || "Unknown",
                opp_agency: opp?.agency || "",
                opp_naics: opp?.naics_code || "",
                opp_deadline: opp?.response_deadline || "",
                opp_notice_type: opp?.notice_type || "",
                opp_state: opp?.place_of_performance_state || "",
                opp_set_aside: opp?.set_aside_code || "",
            };
        }));
        setMatchesLoading(false);
    }, []);

    // Browse opportunities by client's NAICS codes
    const loadBrowse = useCallback(async (client: ClientContractor, page: number) => {
        setBrowseLoading(true);
        let query = supabase
            .from("opportunities")
            .select("id, notice_id, title, agency, naics_code, notice_type, response_deadline, place_of_performance_state, set_aside_code, posted_date", { count: "exact" })
            .eq("is_archived", false)
            .order("posted_date", { ascending: false });

        // Filter by client's NAICS codes if they have any
        if (client.naics_codes && client.naics_codes.length > 0) {
            query = query.in("naics_code", client.naics_codes);
        }

        const from = (page - 1) * browsePageSize;
        const to = from + browsePageSize - 1;
        query = query.range(from, to);

        const { data, count } = await query;
        setBrowseOpps((data || []) as unknown as BrowseOpp[]);
        setBrowseTotal(count || 0);
        setBrowseLoading(false);
    }, []);

    useEffect(() => {
        if (selectedClient && tab === "matches") loadMatches(selectedClient);
        if (selectedClient && tab === "browse") loadBrowse(selectedClient, browsePage);
    }, [selectedClient, tab, browsePage, loadMatches, loadBrowse]);

    const handleSelectClient = (c: ClientContractor) => {
        setSelectedClient(c);
        setTab("matches");
    };

    const filteredContractors = searchInput
        ? contractors.filter(c => c.company_name?.toLowerCase().includes(searchInput.toLowerCase()) || c.uei?.toLowerCase().includes(searchInput.toLowerCase()))
        : contractors;

    const getDotColor = (cls: string) => cls === "HOT" ? "bg-red-500" : cls === "WARM" ? "bg-amber-500" : "bg-stone-400";

    const getNoticeTypeBadge = (type: string) => {
        if (type === "Sources Sought") return "bg-emerald-100 text-emerald-700 border-emerald-200";
        if (type === "Presolicitation") return "bg-blue-100 text-blue-700 border-blue-200";
        if (type === "Solicitation") return "bg-amber-100 text-amber-700 border-amber-200";
        return "bg-stone-100 text-stone-600 border-stone-200";
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center min-h-[400px]">
                <Loader2 className="w-10 h-10 animate-spin text-stone-400" />
            </div>
        );
    }

    // Client not selected — show selection screen
    if (!selectedClient) {
        return (
            <div className="max-w-5xl mx-auto animate-in fade-in duration-500">
                <header className="mb-8">
                    <h2 className="text-3xl font-bold font-typewriter tracking-tighter text-black flex items-center">
                        <Users className="mr-3 w-8 h-8" /> Client Portal
                    </h2>
                    <p className="text-stone-500 mt-2 font-medium">
                        Select a contractor to view their matched opportunities and discover new ones
                    </p>
                </header>

                <div className="bg-white p-2 rounded-full border border-stone-200 shadow-sm flex items-center mb-6 focus-within:ring-2 focus-within:ring-black focus-within:border-transparent transition-all">
                    <Search className="w-5 h-5 text-stone-400 ml-4 mr-2" />
                    <input
                        type="text"
                        placeholder="Search by company name or UEI..."
                        className="bg-transparent border-none outline-none w-full text-stone-700 font-typewriter text-sm"
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                    />
                    {searchInput && (
                        <button type="button" title="Clear" onClick={() => setSearchInput("")} className="p-2 text-stone-400 hover:text-black">
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>

                {/* Featured Demo Contractor */}
                {(() => {
                    const demo = [...filteredContractors].sort((a, b) => (b.federal_awards_count || 0) - (a.federal_awards_count || 0))[0];
                    if (!demo) return null;
                    return (
                        <div className="mb-6 bg-gradient-to-br from-stone-900 via-stone-800 to-stone-900 rounded-[32px] p-8 text-white shadow-xl border border-stone-700 relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
                            <div className="relative">
                                <div className="flex items-center gap-2 mb-4">
                                    <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                                    <span className="text-[10px] font-typewriter uppercase tracking-[0.2em] text-amber-400 font-bold">Featured Client Demo</span>
                                </div>
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                                    <div>
                                        <h3 className="text-xl font-bold font-typewriter tracking-tight">{demo.company_name}</h3>
                                        <div className="flex items-center gap-3 mt-2 text-stone-400 text-sm">
                                            <span className="flex items-center"><MapPin className="w-3 h-3 mr-1" />{[demo.city, demo.state].filter(Boolean).join(", ") || "---"}</span>
                                            <span className="font-mono text-xs">UEI: {demo.uei}</span>
                                        </div>
                                        <div className="flex gap-4 mt-4">
                                            <div className="bg-white/10 rounded-xl px-4 py-2 text-center">
                                                <p className="text-[9px] font-typewriter uppercase tracking-widest text-stone-400">Awards</p>
                                                <p className="font-bold text-lg">{demo.federal_awards_count || 0}</p>
                                            </div>
                                            <div className="bg-white/10 rounded-xl px-4 py-2 text-center">
                                                <p className="text-[9px] font-typewriter uppercase tracking-widest text-stone-400">NAICS</p>
                                                <p className="font-bold text-lg">{(demo.naics_codes || []).length}</p>
                                            </div>
                                            <div className="bg-white/10 rounded-xl px-4 py-2 text-center">
                                                <p className="text-[9px] font-typewriter uppercase tracking-widest text-stone-400">Employees</p>
                                                <p className="font-bold text-lg">{demo.employee_count || "---"}</p>
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handleSelectClient(demo)}
                                        className="inline-flex items-center bg-white text-black font-typewriter font-bold px-8 py-4 rounded-full hover:bg-stone-100 transition-all shadow-lg text-sm self-start md:self-center"
                                    >
                                        <Zap className="w-4 h-4 mr-2" /> View Portal
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })()}

                <div className="bg-white rounded-[32px] border border-stone-200 shadow-sm overflow-hidden">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-stone-200 bg-stone-50 text-stone-500 text-xs font-typewriter uppercase tracking-wider">
                                <th className="p-5 font-medium">Company</th>
                                <th className="p-5 font-medium">Location</th>
                                <th className="p-5 font-medium hidden md:table-cell">NAICS</th>
                                <th className="p-5 font-medium hidden lg:table-cell">Awards</th>
                                <th className="p-5 font-medium"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-100 text-sm">
                            {filteredContractors.length === 0 && (
                                <tr><td colSpan={5} className="p-12 text-center text-stone-400 font-typewriter">No contractors found.</td></tr>
                            )}
                            {filteredContractors.slice(0, 50).map((c) => (
                                <tr key={c.id} onClick={() => handleSelectClient(c)} className="hover:bg-stone-50 cursor-pointer transition-colors group">
                                    <td className="p-5">
                                        <p className="font-bold text-stone-900">{c.company_name}</p>
                                        <p className="text-xs text-stone-400 font-mono mt-0.5">{c.uei}</p>
                                    </td>
                                    <td className="p-5 text-stone-600">{[c.city, c.state].filter(Boolean).join(", ") || "---"}</td>
                                    <td className="p-5 hidden md:table-cell">
                                        <div className="flex flex-wrap gap-1">
                                            {(c.naics_codes || []).slice(0, 3).map(n => (
                                                <span key={n} className="font-mono text-[10px] bg-stone-100 border border-stone-200 px-1.5 py-0.5 rounded">{n}</span>
                                            ))}
                                            {(c.naics_codes || []).length > 3 && <span className="text-[10px] text-stone-400">+{c.naics_codes.length - 3}</span>}
                                        </div>
                                    </td>
                                    <td className="p-5 hidden lg:table-cell font-mono font-bold">{c.federal_awards_count || 0}</td>
                                    <td className="p-5 text-right">
                                        <span className="inline-flex items-center space-x-1 border px-3 py-1.5 rounded-full text-xs font-bold font-typewriter bg-white border-stone-200 text-stone-700 group-hover:bg-black group-hover:text-white group-hover:border-black transition-all">
                                            <span>Open</span>
                                            <ArrowRight className="w-3 h-3" />
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="mt-8 text-center">
                    <Link href="/onboard" className="inline-flex items-center bg-black text-white font-typewriter font-bold px-8 py-4 rounded-full hover:bg-stone-800 transition-all shadow-lg text-sm">
                        <Building className="w-4 h-4 mr-2" /> Onboard New Client
                    </Link>
                </div>
            </div>
        );
    }

    // Client selected — show portal dashboard
    const allCerts = [...new Set([...(selectedClient.sba_certifications || []), ...(selectedClient.certifications || [])])];

    return (
        <div className="max-w-7xl mx-auto animate-in fade-in duration-500">
            {/* Client Header */}
            <header className="mb-8">
                <button type="button" onClick={() => setSelectedClient(null)} className="inline-flex items-center text-sm font-typewriter text-stone-500 hover:text-black mb-4 transition-colors">
                    <ChevronLeft className="w-4 h-4 mr-1" /> Back to Client List
                </button>

                <div className="bg-white rounded-[32px] border border-stone-200 shadow-sm p-8">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div>
                            <div className="flex items-center gap-3 mb-2">
                                <h2 className="text-2xl font-bold font-typewriter tracking-tighter text-black">{selectedClient.company_name}</h2>
                                <span className="bg-emerald-100 text-emerald-700 font-typewriter text-[10px] px-2.5 py-1 rounded-full border border-emerald-200 uppercase tracking-wider font-bold">Client</span>
                            </div>
                            <div className="flex items-center gap-4 text-sm text-stone-500">
                                <span className="flex items-center"><MapPin className="w-3 h-3 mr-1" />{[selectedClient.city, selectedClient.state].filter(Boolean).join(", ") || "---"}</span>
                                <span className="font-mono">UEI: {selectedClient.uei}</span>
                            </div>
                        </div>
                        <div className="flex gap-4">
                            <div className="text-center bg-stone-50 px-5 py-3 rounded-2xl border border-stone-100">
                                <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest">NAICS</p>
                                <p className="font-bold text-lg">{(selectedClient.naics_codes || []).length}</p>
                            </div>
                            <div className="text-center bg-stone-50 px-5 py-3 rounded-2xl border border-stone-100">
                                <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest">Awards</p>
                                <p className="font-bold text-lg">{selectedClient.federal_awards_count || 0}</p>
                            </div>
                            <div className="text-center bg-stone-50 px-5 py-3 rounded-2xl border border-stone-100">
                                <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest">Certs</p>
                                <p className="font-bold text-lg">{allCerts.length}</p>
                            </div>
                        </div>
                    </div>

                    {/* Certifications */}
                    {allCerts.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-stone-100 flex flex-wrap gap-2">
                            {allCerts.map(c => (
                                <span key={c} className="bg-black text-white px-2 py-0.5 rounded font-typewriter tracking-widest text-[9px] uppercase">{c}</span>
                            ))}
                        </div>
                    )}

                    {/* Quick Actions */}
                    <div className="mt-4 pt-4 border-t border-stone-100 flex gap-3">
                        <Link href={`/contractors/${selectedClient.id}`} className="text-xs font-typewriter font-bold bg-stone-100 border border-stone-200 px-4 py-2 rounded-full hover:bg-stone-200 transition-colors flex items-center">
                            <Building className="w-3 h-3 mr-1.5" /> Full Profile
                        </Link>
                        <Link href={`/matches?search=${encodeURIComponent(selectedClient.company_name)}`} className="text-xs font-typewriter font-bold bg-stone-100 border border-stone-200 px-4 py-2 rounded-full hover:bg-stone-200 transition-colors flex items-center">
                            <Target className="w-3 h-3 mr-1.5" /> All Matches
                        </Link>
                    </div>
                </div>
            </header>

            {/* Tabs */}
            <div className="flex items-center space-x-2 mb-6">
                <button type="button" onClick={() => setTab("matches")} className={clsx(
                    "text-xs font-bold font-typewriter uppercase tracking-widest px-5 py-2.5 rounded-full transition-all shadow-sm border flex items-center",
                    tab === "matches" ? "bg-black text-white border-black" : "bg-white text-stone-600 border-stone-200 hover:bg-stone-100"
                )}>
                    <Flame className="w-3 h-3 mr-1.5" /> Matched Opportunities
                    <span className="ml-2 text-[10px] opacity-70">({matchedOpps.length})</span>
                </button>
                <button type="button" onClick={() => { setTab("browse"); setBrowsePage(1); }} className={clsx(
                    "text-xs font-bold font-typewriter uppercase tracking-widest px-5 py-2.5 rounded-full transition-all shadow-sm border flex items-center",
                    tab === "browse" ? "bg-black text-white border-black" : "bg-white text-stone-600 border-stone-200 hover:bg-stone-100"
                )}>
                    <Search className="w-3 h-3 mr-1.5" /> Browse by NAICS
                    <span className="ml-2 text-[10px] opacity-70">({browseTotal})</span>
                </button>
            </div>

            {/* Matched Opportunities Tab */}
            {tab === "matches" && (
                <div className="bg-white rounded-[32px] border border-stone-200 shadow-sm overflow-hidden">
                    {matchesLoading ? (
                        <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-stone-400" /></div>
                    ) : matchedOpps.length === 0 ? (
                        <div className="p-12 text-center">
                            <Target className="w-12 h-12 text-stone-300 mx-auto mb-4" />
                            <h3 className="font-bold text-lg mb-2 text-stone-800">No Matches Yet</h3>
                            <p className="text-stone-500 font-typewriter max-w-md mx-auto mb-6">
                                Run the scoring engine to generate opportunity matches for this contractor based on their NAICS codes, certifications, and location.
                            </p>
                        </div>
                    ) : (
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-stone-200 bg-stone-50 text-stone-500 text-xs font-typewriter uppercase tracking-wider">
                                    <th className="p-5 font-medium">Score</th>
                                    <th className="p-5 font-medium">Opportunity</th>
                                    <th className="p-5 font-medium hidden md:table-cell">Type</th>
                                    <th className="p-5 font-medium hidden lg:table-cell">NAICS</th>
                                    <th className="p-5 font-medium hidden lg:table-cell">State</th>
                                    <th className="p-5 font-medium">Deadline</th>
                                    <th className="p-5 font-medium"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-stone-100 text-sm">
                                {matchedOpps.map((m) => (
                                    <tr key={m.id} className="hover:bg-stone-50 cursor-pointer transition-colors group" onClick={() => router.push(`/matches/${m.opportunity_id}/${selectedClient.id}`)}>
                                        <td className="p-5">
                                            <div className="flex items-center space-x-2">
                                                <div className={clsx("w-2.5 h-2.5 rounded-full flex-shrink-0", getDotColor(m.classification))} />
                                                <div>
                                                    <div className="font-bold text-lg font-mono leading-none">{Math.round(m.score * 100)}</div>
                                                    <div className="text-[9px] font-typewriter text-stone-400 uppercase tracking-widest mt-0.5">{m.classification}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-5 max-w-[300px]">
                                            <p className="font-bold text-stone-900 line-clamp-1">{m.opp_title}</p>
                                            <p className="text-xs text-stone-500 line-clamp-1 mt-0.5">{m.opp_agency}</p>
                                        </td>
                                        <td className="p-5 hidden md:table-cell">
                                            <span className={clsx("font-typewriter text-[10px] px-2 py-1 rounded border uppercase", getNoticeTypeBadge(m.opp_notice_type))}>
                                                {m.opp_notice_type || "N/A"}
                                            </span>
                                        </td>
                                        <td className="p-5 hidden lg:table-cell">
                                            <span className="font-mono text-xs bg-stone-100 px-2 py-1 rounded border border-stone-200">{m.opp_naics || "---"}</span>
                                        </td>
                                        <td className="p-5 hidden lg:table-cell text-stone-600">{m.opp_state || "---"}</td>
                                        <td className="p-5">
                                            <span className="font-bold text-xs text-stone-700">
                                                {m.opp_deadline ? new Date(m.opp_deadline).toLocaleDateString() : "TBD"}
                                            </span>
                                        </td>
                                        <td className="p-5 text-right">
                                            <span className="inline-flex items-center space-x-1 border px-3 py-1.5 rounded-full text-xs font-bold font-typewriter bg-white border-stone-200 text-stone-700 group-hover:bg-black group-hover:text-white group-hover:border-black transition-all">
                                                <span>View</span><ArrowRight className="w-3 h-3" />
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {/* Browse by NAICS Tab */}
            {tab === "browse" && (
                <div>
                    {(selectedClient.naics_codes || []).length > 0 && (
                        <div className="mb-4 flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-typewriter text-stone-500 uppercase tracking-widest">Filtering by NAICS:</span>
                            {selectedClient.naics_codes.map(n => (
                                <span key={n} className="font-mono text-xs bg-black text-white px-2.5 py-1 rounded-full">{n}</span>
                            ))}
                        </div>
                    )}

                    <div className="bg-white rounded-[32px] border border-stone-200 shadow-sm overflow-hidden">
                        {browseLoading ? (
                            <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-stone-400" /></div>
                        ) : browseOpps.length === 0 ? (
                            <div className="p-12 text-center">
                                <FileText className="w-12 h-12 text-stone-300 mx-auto mb-4" />
                                <h3 className="font-bold text-lg mb-2 text-stone-800">No Opportunities Found</h3>
                                <p className="text-stone-500 font-typewriter max-w-md mx-auto">
                                    No active opportunities match this contractor&apos;s NAICS codes. Try running the SAM.gov ingestion to pull fresh data.
                                </p>
                            </div>
                        ) : (
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-stone-200 bg-stone-50 text-stone-500 text-xs font-typewriter uppercase tracking-wider">
                                        <th className="p-5 font-medium">Posted</th>
                                        <th className="p-5 font-medium">Opportunity</th>
                                        <th className="p-5 font-medium hidden md:table-cell">Type</th>
                                        <th className="p-5 font-medium hidden lg:table-cell">NAICS</th>
                                        <th className="p-5 font-medium hidden lg:table-cell">Set-Aside</th>
                                        <th className="p-5 font-medium">Deadline</th>
                                        <th className="p-5 font-medium"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-stone-100 text-sm">
                                    {browseOpps.map((o) => (
                                        <tr key={o.id} className="hover:bg-stone-50 cursor-pointer transition-colors group" onClick={() => router.push(`/opportunities/${o.id}`)}>
                                            <td className="p-5 text-xs text-stone-500">{o.posted_date ? new Date(o.posted_date).toLocaleDateString() : "---"}</td>
                                            <td className="p-5 max-w-[300px]">
                                                <p className="font-bold text-stone-900 line-clamp-1">{o.title}</p>
                                                <p className="text-xs text-stone-500 line-clamp-1 mt-0.5">{o.agency}</p>
                                            </td>
                                            <td className="p-5 hidden md:table-cell">
                                                <span className={clsx("font-typewriter text-[10px] px-2 py-1 rounded border uppercase", getNoticeTypeBadge(o.notice_type))}>
                                                    {o.notice_type || "N/A"}
                                                </span>
                                            </td>
                                            <td className="p-5 hidden lg:table-cell">
                                                <span className="font-mono text-xs bg-stone-100 px-2 py-1 rounded border border-stone-200">{o.naics_code || "---"}</span>
                                            </td>
                                            <td className="p-5 hidden lg:table-cell text-stone-600 text-xs">{o.set_aside_code || "Open"}</td>
                                            <td className="p-5">
                                                <span className={clsx("font-bold text-xs",
                                                    o.response_deadline && new Date(o.response_deadline) < new Date() ? "text-stone-400 line-through" : "text-red-600"
                                                )}>
                                                    {o.response_deadline ? new Date(o.response_deadline).toLocaleDateString() : "TBD"}
                                                </span>
                                            </td>
                                            <td className="p-5 text-right">
                                                <span className="inline-flex items-center space-x-1 border px-3 py-1.5 rounded-full text-xs font-bold font-typewriter bg-white border-stone-200 text-stone-700 group-hover:bg-black group-hover:text-white group-hover:border-black transition-all">
                                                    <span>Details</span><ExternalLink className="w-3 h-3" />
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>

                    {/* Pagination */}
                    {Math.ceil(browseTotal / browsePageSize) > 1 && (
                        <div className="mt-6 flex items-center justify-between px-2">
                            <p className="text-xs text-stone-500 font-typewriter">
                                Showing {((browsePage - 1) * browsePageSize) + 1} to {Math.min(browsePage * browsePageSize, browseTotal)} of {browseTotal}
                            </p>
                            <div className="flex items-center space-x-2">
                                <button type="button" onClick={() => setBrowsePage(p => Math.max(1, p - 1))} disabled={browsePage === 1}
                                    className="px-4 py-2 bg-white border border-stone-200 rounded-full hover:bg-stone-50 disabled:opacity-50 transition-colors flex items-center font-bold text-sm">
                                    <ChevronLeft className="w-4 h-4 mr-1" /> Prev
                                </button>
                                <span className="text-xs font-mono px-4 text-stone-600">Page {browsePage} of {Math.ceil(browseTotal / browsePageSize)}</span>
                                <button type="button" onClick={() => setBrowsePage(p => p + 1)} disabled={browsePage >= Math.ceil(browseTotal / browsePageSize)}
                                    className="px-4 py-2 bg-white border border-stone-200 rounded-full hover:bg-stone-50 disabled:opacity-50 transition-colors flex items-center font-bold text-sm">
                                    Next <ChevronRight className="w-4 h-4 ml-1" />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
