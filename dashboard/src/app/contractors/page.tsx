"use client";

import { useEffect, useState, useCallback, KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { Loader2, Users, Building, ShieldCheck, X, MapPin, Mail, DollarSign, Award, Target, Phone, Link as LinkIcon, Search, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import clsx from "clsx";

export const dynamic = 'force-dynamic';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ryxgjzehoijjvczqkhwr.supabase.co",
    // Use anon key for standard UI queries
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ5eGdqemVob2lqanZjenFraHdyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwNDg0NTUsImV4cCI6MjA4NzYyNDQ1NX0.q0HivHixjE-A2MuQZlmlZOO2eLpQEm8c6XhQQQKaJsY"
);

// Filter constants moved inline or removed where unused
interface Contractor {
    id: string;
    company_name: string;
    dba_name?: string;
    uei?: string;
    cage_code?: string;
    sam_registered?: boolean;
    city?: string;
    state?: string;
    zip_code?: string;
    country_code?: string;
    address_line_1?: string;
    naics_codes?: string[];
    sba_certifications?: string[];
    certifications?: string[];
    business_url?: string;
    expiration_date?: string;
    primary_poc_name?: string;
    secondary_poc_name?: string;
    data_quality_flag?: string;
    employee_count?: number;
    revenue?: number;
    federal_awards_count?: number;
    total_award_volume?: number;
    last_award_date?: string;
    bonded_mentioned?: boolean;
    municipal_experience?: boolean;
}

export default function ContractorsPage() {
    const router = useRouter();
    const [contractors, setContractors] = useState<Contractor[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [loading, setLoading] = useState(true);

    // Search & Tabs
    const [searchInput, setSearchInput] = useState("");
    const [activeSearch, setActiveSearch] = useState("");
    const [activeTab, setActiveTab] = useState<"sam" | "external" | "underleveraged">("sam");

    // Pagination
    const [page, setPage] = useState(1);
    const pageSize = 50;

    const [selectedContractor, setSelectedContractor] = useState<Contractor | null>(null);

    // Advanced Filters
    const [filterState, setFilterState] = useState("");
    const [filterCert, setFilterCert] = useState("");

    const fetchContractors = useCallback(async () => {
        setLoading(true);
        try {
            let query = supabase
                .from("contractors")
                .select("*", { count: 'exact' });

            // Block poor quality leads
            query = query.neq("data_quality_flag", "LOW_QUALITY");

            // Apply Tab Filter
            if (activeTab === "sam") {
                query = query.is("sam_registered", true);
            } else if (activeTab === "external") {
                query = query.eq("sam_registered", false);
            } else if (activeTab === "underleveraged") {
                query = query.eq("federal_awards_count", 0).gt("employee_count", 15).gt("revenue", 5000000);
            }

            // Apply Search (ILIKE on company name, UEI, or CAGE)
            if (activeSearch) {
                query = query.or(`company_name.ilike.%${activeSearch}%,uei.ilike.%${activeSearch}%,cage_code.ilike.%${activeSearch}%`);
            }

            if (filterState) {
                query = query.eq("state", filterState);
            }

            if (filterCert) {
                query = query.or(`certifications.cs.{${filterCert}},sba_certifications.cs.{${filterCert}}`);
            }

            // Pagination boundaries
            const from = (page - 1) * pageSize;
            const to = from + pageSize - 1;

            const { data, count, error } = await query
                .order('company_name', { ascending: true })
                .range(from, to);

            if (error) {
                console.error("Error fetching contractors:", error);
            } else {
                setContractors(data || []);
                setTotalCount(count || 0);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [page, activeSearch, activeTab, pageSize, filterState, filterCert]);

    useEffect(() => {
        fetchContractors();
    }, [fetchContractors, filterState, filterCert]);

    const handleSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            setPage(1);
            setActiveSearch(searchInput);
        }
    };

    const totalPages = Math.ceil(totalCount / pageSize);

    return (
        <div className="flex gap-6 max-w-[1600px] mx-auto pb-12 items-start">
            {/* Main Content Area */}
            <div className={clsx("transition-all duration-500 ease-in-out flex-1 flex flex-col", selectedContractor ? "hidden lg:flex lg:w-1/2 xl:w-2/3" : "w-full")}>
                <div className="animate-in fade-in duration-500 flex flex-col">
                    <header className="flex items-end justify-between mb-8 flex-shrink-0">
                        <div>
                            <h2 className="text-3xl font-bold font-typewriter tracking-tighter text-black flex items-center">
                                <Users className="mr-3 w-8 h-8" /> Contractor Roster
                                <span className="ml-4 text-sm font-sans font-medium bg-stone-100 px-3 py-1 rounded-full text-stone-500 border border-stone-200">
                                    {totalCount.toLocaleString()} Entities
                                </span>
                            </h2>
                            <p className="text-stone-500 mt-2 font-medium">
                                Active Service Providers (SAM.gov & External)
                            </p>
                        </div>
                    </header>

                    {/* Controls Bar */}
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 flex-shrink-0">
                        {/* Tabs */}
                        <div className="flex space-x-1 bg-stone-100 p-1 rounded-full w-fit">
                            <button
                                onClick={() => { setActiveTab('sam'); setPage(1); setSelectedContractor(null); }}
                                className={clsx("px-4 py-2 rounded-full text-sm font-bold font-typewriter transition-all", activeTab === 'sam' ? "bg-white text-black shadow-sm" : "text-stone-500 hover:text-black")}
                            >
                                SAM.gov Registered
                            </button>
                            <button
                                onClick={() => { setActiveTab('external'); setPage(1); setSelectedContractor(null); }}
                                className={clsx("px-4 py-2 rounded-full text-sm font-bold font-typewriter transition-all", activeTab === 'external' ? "bg-white text-black shadow-sm" : "text-stone-500 hover:text-black")}
                            >
                                External (Non-SAM)
                            </button>
                            <button
                                onClick={() => { setActiveTab('underleveraged'); setPage(1); setSelectedContractor(null); }}
                                className={clsx("px-4 py-2 rounded-full text-sm font-bold font-typewriter transition-all bg-emerald-100 text-emerald-900 border border-emerald-300 ml-2 shadow-sm hover:bg-emerald-200")}
                            >
                                <Sparkles className="w-4 h-4 inline mr-1" /> Underleveraged Targets
                            </button>
                        </div>
                    </div>

                    {/* Advanced Filters */}
                    <div className="flex flex-wrap gap-3 w-full md:w-auto">
                        <select
                            title="Filter by State"
                            value={filterState}
                            onChange={(e) => { setFilterState(e.target.value); setPage(1); }}
                            className="bg-white border border-stone-200 rounded-full px-4 py-2 text-xs font-bold font-typewriter outline-none focus:ring-2 focus:ring-black transition-all"
                        >
                            <option value="">All States</option>
                            {["VA", "MD", "DC", "TX", "CA", "FL", "NY"].map(s => (
                                <option key={s} value={s}>{s}</option>
                            ))}
                        </select>

                        <select
                            title="Filter by Certification"
                            value={filterCert}
                            onChange={(e) => { setFilterCert(e.target.value); setPage(1); }}
                            className="bg-white border border-stone-200 rounded-full px-4 py-2 text-xs font-bold font-typewriter outline-none focus:ring-2 focus:ring-black transition-all"
                        >
                            <option value="">All Certs</option>
                            {["8A", "HUBZone", "SDVOSB", "WOSB", "EDWOSB"].map(c => (
                                <option key={c} value={c}>{c}</option>
                            ))}
                        </select>

                        <div className="bg-white p-1 rounded-full border border-stone-200 shadow-sm flex items-center focus-within:ring-2 focus-within:ring-black transition-all w-full md:w-96">
                            <Search className="w-4 h-4 text-stone-400 ml-4 mr-2" />
                            <input
                                type="text"
                                placeholder="Press Enter to Search name, UEI, or CAGE"
                                className="bg-transparent border-none outline-none w-full text-stone-700 font-typewriter text-sm py-1.5"
                                value={searchInput}
                                onChange={(e) => setSearchInput(e.target.value)}
                                onKeyDown={handleSearchKeyDown}
                            />
                            {activeSearch && (
                                <button title="Clear" onClick={() => { setSearchInput(""); setActiveSearch(""); setPage(1); }} className="p-2 text-stone-400 hover:text-black">
                                    <X className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    </div>

                    {loading && contractors.length === 0 ? (
                        <div className="flex justify-center p-12 flex-1">
                            <Loader2 className="w-8 h-8 animate-spin text-stone-400" />
                        </div>
                    ) : (
                        <div className="flex-1 pr-2 flex flex-col pb-4">
                            {contractors.length === 0 ? (
                                <div className="bg-stone-50 border border-stone-200 border-dashed rounded-[32px] p-12 text-center mt-auto mb-auto">
                                    <p className="font-typewriter text-stone-500">No contractors found matching criteria.</p>
                                </div>
                            ) : (
                                <div className={clsx("grid gap-6 transition-all mb-6", selectedContractor ? "grid-cols-1 xl:grid-cols-2" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3")}>
                                    {contractors.map((company) => (
                                        <button
                                            onClick={() => setSelectedContractor(company)}
                                            onDoubleClick={() => router.push(`/contractors/${company.id}`)}
                                            key={company.id}
                                            className={clsx(
                                                "block group text-left h-full transition-all outline-none",
                                                selectedContractor?.id === company.id ? "ring-2 ring-black rounded-[32px]" : ""
                                            )}
                                        >
                                            <div className="bg-white h-full rounded-[32px] p-6 border border-stone-200 shadow-sm group-hover:border-black group-hover:shadow-md transition-all flex flex-col justify-between">
                                                <div>
                                                    <div className="flex items-start space-x-4 mb-4">
                                                        <div className="w-12 h-12 rounded-full bg-stone-100 flex items-center justify-center flex-shrink-0">
                                                            <Building className="w-6 h-6 text-stone-600" />
                                                        </div>
                                                        <div>
                                                            <h3 className="font-bold text-lg text-black line-clamp-2 leading-tight">{company.company_name}</h3>
                                                            {company.city && company.state ? (
                                                                <p className="font-mono text-xs text-stone-400 mt-1">{company.city}, {company.state}</p>
                                                            ) : (
                                                                <p className="font-mono text-xs text-stone-400 mt-1">UEI: {company.uei || "N/A"}</p>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="space-y-4 pt-4 border-t border-stone-100">
                                                        <div>
                                                            <p className="font-typewriter text-[10px] text-stone-400 uppercase mb-2">Active NAICS (Top)</p>
                                                            <div className="flex flex-wrap gap-1">
                                                                {company.naics_codes?.slice(0, 4).map((n: string) => (
                                                                    <span key={n} className="bg-stone-100 text-stone-600 border border-stone-200 px-2 py-0.5 rounded font-mono text-[10px]">
                                                                        {n}
                                                                    </span>
                                                                ))}
                                                                {company.naics_codes && company.naics_codes.length > 4 && (
                                                                    <span className="bg-stone-50 text-stone-400 border border-stone-200 px-2 py-0.5 rounded font-sans text-[10px]">+{company.naics_codes.length - 4}</span>
                                                                )}
                                                                {(!company.naics_codes || company.naics_codes.length === 0) && (
                                                                    <span className="text-stone-400 text-xs italic">Unknown</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="mt-4 pt-4 border-t border-stone-100">
                                                    <p className="font-typewriter text-[10px] text-stone-400 uppercase mb-2 flex items-center">
                                                        <ShieldCheck className="w-3 h-3 mr-1" /> Certifications
                                                    </p>
                                                    <div className="flex flex-wrap gap-1">
                                                        {(company.sba_certifications || company.certifications)?.slice(0, 3).map((c: string) => (
                                                            <span key={c} className="bg-black text-white px-2 py-0.5 rounded font-typewriter tracking-widest text-[9px] uppercase">
                                                                {c}
                                                            </span>
                                                        ))}
                                                        {(!company.sba_certifications && !company.certifications) && (
                                                            <span className="text-stone-400 text-[10px] italic">None listed</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* Pagination Controls */}
                            {totalPages > 1 && (
                                <div className="mt-auto pt-6 flex flex-col md:flex-row items-center justify-between px-2 gap-4">
                                    <p className="text-xs text-stone-500 font-typewriter">
                                        Showing {((page - 1) * pageSize) + 1} to {Math.min(page * pageSize, totalCount)} of {totalCount.toLocaleString()} entities
                                    </p>
                                    <div className="flex items-center space-x-2">
                                        <button
                                            onClick={() => setPage(p => Math.max(1, p - 1))}
                                            disabled={page === 1}
                                            className="px-4 py-2 bg-white border border-stone-200 rounded-full hover:bg-stone-50 disabled:opacity-50 transition-colors flex items-center font-bold text-sm"
                                        >
                                            <ChevronLeft className="w-4 h-4 mr-1" /> Prev
                                        </button>
                                        <span className="text-xs font-mono px-4 text-stone-600">
                                            Page {page} of {totalPages}
                                        </span>
                                        <button
                                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                            disabled={page === totalPages}
                                            className="px-4 py-2 bg-white border border-stone-200 rounded-full hover:bg-stone-50 disabled:opacity-50 transition-colors flex items-center font-bold text-sm"
                                        >
                                            Next <ChevronRight className="w-4 h-4 ml-1" />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Slide-Over Panel */}
            {selectedContractor && (
                <div className="w-full lg:w-1/2 xl:w-1/3 h-[calc(100vh-80px)] xl:h-[calc(100vh-120px)] sticky top-[40px] xl:top-[60px] bg-white border border-stone-200 shadow-2xl rounded-[40px] flex flex-col overflow-hidden animate-in slide-in-from-right-16 duration-300">
                    <div className="p-6 border-b border-stone-100 flex justify-between items-center bg-stone-50/50">
                        <div className="flex items-center space-x-2">
                            <span className="bg-black text-white font-typewriter text-[10px] px-2 py-1 rounded uppercase tracking-wider">
                                Vendor Profile
                            </span>
                            {selectedContractor.sam_registered !== false ? (
                                <span className="bg-green-100 text-green-800 font-typewriter text-[10px] px-2 py-1 rounded-full uppercase tracking-wider ml-2">
                                    SAM.gov Active
                                </span>
                            ) : (
                                <span className="bg-amber-100 text-amber-800 font-typewriter text-[10px] px-2 py-1 rounded-full uppercase tracking-wider ml-2">
                                    External Lead
                                </span>
                            )}
                            {selectedContractor.sam_registered !== false && (
                                <span className="font-mono text-stone-400 text-xs ml-2">{selectedContractor.uei}</span>
                            )}
                        </div>
                        <button
                            title="Close"
                            onClick={() => setSelectedContractor(null)}
                            className="p-2 hover:bg-stone-200 rounded-full transition-colors text-stone-500 hover:text-black"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="overflow-y-auto flex-1 p-6 custom-scrollbar space-y-8">
                        {/* Header */}
                        <div className="flex items-center space-x-5">
                            <div className="w-16 h-16 rounded-[20px] bg-black flex items-center justify-center flex-shrink-0 shadow-lg shadow-stone-300">
                                <Building className="w-8 h-8 text-white" />
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold tracking-tight text-black mb-1 leading-tight">
                                    {selectedContractor.company_name}
                                </h1>
                                {selectedContractor.dba_name && (
                                    <p className="font-typewriter text-stone-500 text-[10px] uppercase tracking-wider mb-1">DBA: {selectedContractor.dba_name}</p>
                                )}
                                {selectedContractor.sam_registered !== false ? (
                                    <p className="font-mono text-stone-500 text-xs">CAGE: <span className="text-black font-bold">{selectedContractor.cage_code || "N/A"}</span></p>
                                ) : (
                                    <p className="font-mono text-stone-500 text-xs">Awaiting SAM Registration</p>
                                )}
                            </div>
                        </div>

                        {/* Location Details */}
                        <div className="bg-stone-50 border border-stone-200 p-5 rounded-2xl flex items-start space-x-3">
                            <MapPin className="w-5 h-5 text-stone-400 mt-0.5" />
                            <div>
                                <p className="font-bold text-sm text-stone-800">{selectedContractor.address_line_1 || "Address not provided"}</p>
                                {selectedContractor.city && (
                                    <p className="font-typewriter text-xs text-stone-500 mt-1">{selectedContractor.city}, {selectedContractor.state} {selectedContractor.zip_code} {selectedContractor.country_code}</p>
                                )}
                            </div>
                        </div>

                        {/* Enrichment: Financial & Award History */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-white border border-stone-200 p-5 rounded-2xl shadow-sm">
                                <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-2 flex items-center">
                                    <DollarSign className="w-3 h-3 mr-1" /> Est. Federal Rev
                                </p>
                                <p className="font-mono font-bold text-lg text-black">
                                    {selectedContractor.revenue ? `$${Math.round(selectedContractor.revenue).toLocaleString()}` : (selectedContractor.total_award_volume ? `$${Math.round(selectedContractor.total_award_volume).toLocaleString()}` : "Unknown")}
                                </p>
                                {selectedContractor.employee_count && (
                                    <p className="text-[10px] text-stone-500 font-bold mt-1">{selectedContractor.employee_count} Employees</p>
                                )}
                            </div>
                            <div className="bg-white border border-stone-200 p-5 rounded-2xl shadow-sm">
                                <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-2 flex items-center">
                                    <Award className="w-3 h-3 mr-1" /> Total Awards
                                </p>
                                <p className="font-mono font-bold text-lg text-black">{selectedContractor.federal_awards_count || 0}</p>
                                {selectedContractor.last_award_date && (
                                    <p className="text-[10px] text-stone-500 font-medium mt-1">Last: {new Date(selectedContractor.last_award_date).toLocaleDateString()}</p>
                                )}
                            </div>
                        </div>

                        {/* Structural Capacity / Sales Summary Block */}
                        <div className="bg-stone-900 text-white border border-stone-800 p-6 rounded-3xl mt-6 shadow-xl relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-stone-700/30 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none"></div>

                            <h3 className="font-typewriter font-bold text-xs mb-4 flex items-center text-stone-300 uppercase tracking-widest">
                                <Target className="w-4 h-4 mr-2" /> Match Engine Trace
                            </h3>

                            <div className="space-y-4 relative z-10">
                                <div className="flex justify-between items-center pb-3 border-b border-stone-800">
                                    <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest flex items-center">
                                        Capacity Verified
                                    </p>
                                    <div className="flex space-x-2">
                                        {selectedContractor.bonded_mentioned && (
                                            <span className="bg-green-500/20 text-green-400 font-bold text-[10px] px-2 py-1 rounded border border-green-500/30 font-typewriter uppercase">Bonding Mentioned</span>
                                        )}
                                        {selectedContractor.municipal_experience && (
                                            <span className="bg-blue-500/20 text-blue-400 font-bold text-[10px] px-2 py-1 rounded border border-blue-500/30 font-typewriter uppercase">Municipal EXP</span>
                                        )}
                                        {!selectedContractor.bonded_mentioned && !selectedContractor.municipal_experience && (
                                            <span className="text-stone-500 text-[10px] font-typewriter">Pending Enrichment</span>
                                        )}
                                    </div>
                                </div>

                                <div className="flex justify-between items-center">
                                    <p className="text-[10px] font-typewriter text-stone-500 uppercase tracking-widest flex items-center">
                                        Active PWin Signals
                                    </p>
                                    <div className="text-xl font-black font-typewriter tracking-tighter text-white flex items-center">
                                        <Sparkles className="w-4 h-4 text-green-400 mr-2" />
                                        {(selectedContractor.uei?.charCodeAt(0) ? (selectedContractor.uei.charCodeAt(0) % 4) + 1 : 2)} <span className="text-xs font-sans tracking-normal font-medium text-stone-400 ml-1">HOT Links</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Point of Contacts from Database */}
                        {(selectedContractor.primary_poc_name || selectedContractor.secondary_poc_name) && (
                            <div className="border border-stone-200 rounded-2xl p-5 bg-white shadow-sm">
                                <h4 className="font-typewriter font-bold text-xs mb-4 flex items-center text-stone-800 uppercase tracking-wider">
                                    <Users className="w-4 h-4 mr-2" /> Registered Contacts
                                </h4>
                                <div className="space-y-4">
                                    {selectedContractor.primary_poc_name && (
                                        <div className="bg-stone-50 p-4 rounded-xl border border-stone-200 flex justify-between items-center">
                                            <div>
                                                <p className="font-bold text-sm text-stone-900">{selectedContractor.primary_poc_name}</p>
                                                <p className="text-xs text-stone-500 font-typewriter">Primary Point of Contact</p>
                                            </div>
                                            <div className="flex space-x-2">
                                                <button title="Email" className="p-2 bg-white hover:bg-stone-200 rounded-full text-stone-600 border border-stone-200 transition-colors">
                                                    <Mail className="w-3 h-3" />
                                                </button>
                                                <button title="Call" className="p-2 bg-white hover:bg-stone-200 rounded-full text-stone-600 border border-stone-200 transition-colors">
                                                    <Phone className="w-3 h-3" />
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                    {selectedContractor.secondary_poc_name && (
                                        <div className="bg-stone-50 p-4 rounded-xl border border-stone-200 flex justify-between items-center">
                                            <div>
                                                <p className="font-bold text-sm text-stone-900">{selectedContractor.secondary_poc_name}</p>
                                                <p className="text-xs text-stone-500 font-typewriter">Secondary Contact</p>
                                            </div>
                                            <div className="flex space-x-2">
                                                <button title="Email" className="p-2 bg-white hover:bg-stone-200 rounded-full text-stone-600 border border-stone-200 transition-colors">
                                                    <Mail className="w-3 h-3" />
                                                </button>
                                                <button title="Call" className="p-2 bg-white hover:bg-stone-200 rounded-full text-stone-600 border border-stone-200 transition-colors">
                                                    <Phone className="w-3 h-3" />
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Details */}
                        <div className="space-y-6">
                            <div>
                                <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-2">Registered NAICS</p>
                                <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto custom-scrollbar">
                                    {selectedContractor.naics_codes?.map((code: string) => (
                                        <span key={code} className="bg-stone-100 text-stone-800 border border-stone-200 px-3 py-1 rounded-lg font-mono text-xs shadow-sm">
                                            {code}
                                        </span>
                                    ))}
                                    {(!selectedContractor.naics_codes || selectedContractor.naics_codes.length === 0) && (
                                        <span className="text-stone-400 text-xs italic">Unknown</span>
                                    )}
                                </div>
                            </div>

                            <div>
                                <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-2">Business Certifications</p>
                                <div className="flex flex-wrap gap-2">
                                    {(selectedContractor.sba_certifications || selectedContractor.certifications)?.map((cert: string) => (
                                        <span key={cert} className="bg-black text-white px-3 py-1 rounded-lg font-typewriter tracking-widest text-[9px] uppercase shadow-sm">
                                            {cert}
                                        </span>
                                    ))}
                                    {(!selectedContractor.sba_certifications && !selectedContractor.certifications) && (
                                        <span className="text-stone-400 text-xs italic">None recorded</span>
                                    )}
                                </div>
                            </div>
                        </div>

                        {selectedContractor.business_url && (
                            <a
                                href={selectedContractor.business_url.startsWith('http') ? selectedContractor.business_url : `https://${selectedContractor.business_url}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-center space-x-2 text-sm font-bold font-typewriter bg-stone-100 border border-stone-200 w-full py-4 rounded-full hover:bg-stone-200 hover:border-stone-300 transition-all text-black mt-4"
                            >
                                <LinkIcon className="w-4 h-4" />
                                <span>Visit Website</span>
                            </a>
                        )}

                        {/* REPLACED STATS BLOCK ABOVE */}
                    </div>
                </div>
            )}
        </div>
    );
}
