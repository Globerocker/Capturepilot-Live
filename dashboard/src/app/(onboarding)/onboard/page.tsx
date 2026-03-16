"use client";

import { useState } from "react";
import { createSupabaseClient } from "@/lib/supabase/client";
import {
    Building, MapPin, Target, ShieldCheck, Briefcase, Truck,
    ArrowRight, ArrowLeft, CheckCircle2, Loader2, Zap, Search, X, ExternalLink
} from "lucide-react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { NAICS_CODES, searchNaics } from "@/lib/naics-codes";

const supabase = createSupabaseClient();

const CERT_OPTIONS = [
    { value: "8(a)", label: "8(a) Business Development" },
    { value: "HUBZone", label: "HUBZone Certified" },
    { value: "SDVOSB", label: "Service-Disabled Veteran-Owned SB" },
    { value: "WOSB", label: "Women-Owned Small Business" },
    { value: "EDWOSB", label: "Economically Disadvantaged WOSB" },
    { value: "VOSB", label: "Veteran-Owned Small Business" },
    { value: "SDB", label: "Small Disadvantaged Business" },
];

const STATE_OPTIONS = [
    "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
    "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
    "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC","PR","GU","VI"
];

const REVENUE_RANGES = [
    { value: "", label: "Select range..." },
    { value: "100000", label: "Under $100K" },
    { value: "500000", label: "$100K - $500K" },
    { value: "1000000", label: "$500K - $1M" },
    { value: "5000000", label: "$1M - $5M" },
    { value: "10000000", label: "$5M - $10M" },
    { value: "25000000", label: "$10M - $25M" },
    { value: "50000000", label: "$25M+" },
];

const EMPLOYEE_RANGES = [
    { value: "", label: "Select range..." },
    { value: "5", label: "1-5" },
    { value: "15", label: "6-20" },
    { value: "35", label: "21-50" },
    { value: "75", label: "51-100" },
    { value: "150", label: "101-250" },
    { value: "500", label: "250+" },
];

const CONTRACT_TARGETS = [
    { value: "micro", label: "Micro-Purchase (<$10K)" },
    { value: "sap", label: "Simplified ($10K-$250K)" },
    { value: "sole_source", label: "8(a) Sole Source (up to $4.5M)" },
    { value: "full_open", label: "Full & Open" },
    { value: "idiq", label: "IDIQ / GWAC" },
];

// Validation helpers
function validateUEI(uei: string): { valid: boolean; error?: string } {
    if (!uei) return { valid: true };
    const cleaned = uei.trim().toUpperCase();
    if (cleaned.length !== 12) return { valid: false, error: "UEI must be exactly 12 characters" };
    if (!/^[A-Z0-9]{12}$/.test(cleaned)) return { valid: false, error: "UEI can only contain letters and numbers" };
    return { valid: true };
}

function validateCAGE(cage: string): { valid: boolean; error?: string } {
    if (!cage) return { valid: true };
    const cleaned = cage.trim().toUpperCase();
    if (cleaned.length !== 5) return { valid: false, error: "CAGE code must be exactly 5 characters" };
    if (!/^[A-Z0-9]{5}$/.test(cleaned)) return { valid: false, error: "CAGE code can only contain letters and numbers" };
    return { valid: true };
}

interface SamEntity {
    uei: string;
    cage_code: string;
    company_name: string;
    dba_name: string;
    address: { line1: string; city: string; state: string; zip: string };
    naics_codes: string[];
    sba_certifications: string[];
    website: string;
    phone: string;
}

export default function OnboardPage() {
    const router = useRouter();
    const [step, setStep] = useState(0);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [matchCount, setMatchCount] = useState(0);

    // SAM.gov lookup state
    const [samRegistered, setSamRegistered] = useState<boolean | null>(null);
    const [ueiInput, setUeiInput] = useState("");
    const [nameInput, setNameInput] = useState("");
    const [samLoading, setSamLoading] = useState(false);
    const [samError, setSamError] = useState("");
    const [samResults, setSamResults] = useState<SamEntity[]>([]);
    const [samPopulated, setSamPopulated] = useState(false);
    const [searchMode, setSearchMode] = useState<"uei" | "name">("uei");

    // NAICS search
    const [naicsSearch, setNaicsSearch] = useState("");

    // Form state
    const [form, setForm] = useState({
        company_name: "",
        dba_name: "",
        uei: "",
        cage_code: "",
        address_line_1: "",
        city: "",
        state: "",
        zip_code: "",
        website: "",
        phone: "",
        naics_codes: [] as string[],
        sba_certifications: [] as string[],
        employee_count: "",
        revenue: "",
        years_in_business: "",
        service_radius_miles: "50",
        has_bonding: false,
        has_fleet: false,
        has_municipal_exp: false,
        federal_awards_count: "",
        target_contract_types: [] as string[],
        target_states: [] as string[],
    });

    const updateForm = (key: string, value: unknown) => setForm(prev => ({ ...prev, [key]: value }));

    const toggleArray = (key: "naics_codes" | "sba_certifications" | "target_contract_types" | "target_states", value: string) => {
        setForm(prev => {
            const arr = prev[key] as string[];
            return { ...prev, [key]: arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value] };
        });
    };

    // SAM.gov entity lookup
    const lookupSam = async (type: "uei" | "name") => {
        const query = type === "uei" ? ueiInput.trim() : nameInput.trim();
        if (!query) return;

        if (type === "uei") {
            const validation = validateUEI(query);
            if (!validation.valid) { setSamError(validation.error || "Invalid UEI"); return; }
        }

        setSamLoading(true);
        setSamError("");
        setSamResults([]);

        try {
            const param = type === "uei" ? `uei=${encodeURIComponent(query.toUpperCase())}` : `name=${encodeURIComponent(query)}`;
            const res = await fetch(`/api/sam/entity?${param}`);
            const data = await res.json();

            if (!res.ok) {
                setSamError(data.error || "Failed to lookup entity");
                setSamLoading(false);
                return;
            }

            if (!data.entities || data.entities.length === 0) {
                setSamError(type === "uei" ? "No entity found for this UEI. Check the number and try again." : "No entities found. Try a different name.");
                setSamLoading(false);
                return;
            }

            if (type === "uei" && data.entities.length === 1) {
                // Direct match - auto-populate
                populateFromSam(data.entities[0]);
            } else {
                // Multiple results - show list to pick from
                setSamResults(data.entities);
            }
        } catch {
            setSamError("Network error. Please try again.");
        }
        setSamLoading(false);
    };

    const populateFromSam = (entity: SamEntity) => {
        setForm(prev => ({
            ...prev,
            company_name: entity.company_name || prev.company_name,
            dba_name: entity.dba_name || prev.dba_name,
            uei: entity.uei || prev.uei,
            cage_code: entity.cage_code || prev.cage_code,
            address_line_1: entity.address?.line1 || prev.address_line_1,
            city: entity.address?.city || prev.city,
            state: entity.address?.state || prev.state,
            zip_code: entity.address?.zip || prev.zip_code,
            website: entity.website || prev.website,
            phone: entity.phone || prev.phone,
            naics_codes: entity.naics_codes?.length > 0 ? entity.naics_codes : prev.naics_codes,
            sba_certifications: entity.sba_certifications?.length > 0 ? entity.sba_certifications : prev.sba_certifications,
        }));
        setSamPopulated(true);
        setSamResults([]);
        setStep(1);
    };

    const handleSave = async () => {
        if (!form.company_name) { alert("Company name is required."); return; }
        setSaving(true);

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            alert("Not authenticated. Please log in again.");
            setSaving(false);
            router.push("/login");
            return;
        }

        const payload = {
            auth_user_id: user.id,
            company_name: form.company_name,
            dba_name: form.dba_name || null,
            uei: form.uei || null,
            cage_code: form.cage_code || null,
            address_line_1: form.address_line_1 || null,
            city: form.city || null,
            state: form.state || null,
            zip_code: form.zip_code || null,
            website: form.website || null,
            phone: form.phone || null,
            email: user.email || null,
            naics_codes: form.naics_codes.length > 0 ? form.naics_codes : [],
            sba_certifications: form.sba_certifications.length > 0 ? form.sba_certifications : [],
            employee_count: form.employee_count ? parseInt(form.employee_count) : null,
            revenue: form.revenue ? parseFloat(form.revenue) : null,
            years_in_business: form.years_in_business ? parseInt(form.years_in_business) : null,
            service_radius_miles: form.service_radius_miles ? parseInt(form.service_radius_miles) : 50,
            has_bonding: form.has_bonding,
            has_fleet: form.has_fleet,
            has_municipal_exp: form.has_municipal_exp,
            federal_awards_count: form.federal_awards_count ? parseInt(form.federal_awards_count) : 0,
            target_contract_types: form.target_contract_types.length > 0 ? form.target_contract_types : [],
            target_states: form.target_states.length > 0 ? form.target_states : [],
            onboarding_complete: true,
        };

        const { error } = await supabase
            .from("user_profiles")
            .upsert(payload, { onConflict: "auth_user_id" });

        if (error) {
            console.error("Save error:", error);
            alert("Failed to save: " + (error.message || "Unknown error"));
            setSaving(false);
            return;
        }

        if (form.naics_codes.length > 0) {
            const { count } = await supabase
                .from("opportunities")
                .select("*", { count: "exact", head: true })
                .eq("is_archived", false)
                .in("naics_code", form.naics_codes);
            setMatchCount(count || 0);
        }

        setSaved(true);
        setSaving(false);
    };

    const totalSteps = 5; // 0-4

    // Validation for current step
    const ueiValidation = validateUEI(form.uei);
    const cageValidation = validateCAGE(form.cage_code);

    // NAICS search results
    const filteredNaics = naicsSearch ? searchNaics(naicsSearch) : NAICS_CODES.filter(n => n.popular);

    if (saved) {
        return (
            <div className="text-center animate-in fade-in duration-500 py-4 sm:py-8">
                <div className="bg-white rounded-[32px] sm:rounded-[40px] border border-stone-200 shadow-sm p-8 sm:p-12">
                    <CheckCircle2 className="w-14 h-14 sm:w-16 sm:h-16 text-emerald-500 mx-auto mb-6" />
                    <h2 className="text-2xl sm:text-3xl font-bold font-typewriter tracking-tighter text-black mb-3">You&apos;re All Set!</h2>
                    <p className="text-stone-500 font-medium mb-2">
                        <span className="font-bold text-black">{form.company_name}</span> is now in the system.
                    </p>
                    {matchCount > 0 && (
                        <p className="text-emerald-600 font-bold text-lg mb-6">
                            We found {matchCount.toLocaleString()} opportunities matching your profile!
                        </p>
                    )}
                    {matchCount === 0 && (
                        <p className="text-stone-400 text-sm mb-6">
                            We&apos;re scanning federal databases for your matches now.
                        </p>
                    )}
                    <button
                        onClick={() => router.push("/dashboard")}
                        className="inline-flex items-center bg-black text-white font-typewriter font-bold px-8 py-4 rounded-full hover:bg-stone-800 transition-all shadow-lg text-sm"
                    >
                        Go to Dashboard <ArrowRight className="w-4 h-4 ml-2" />
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="animate-in fade-in duration-500 pb-8">
            <header className="mb-6 sm:mb-8 text-center">
                <div className="flex items-center justify-center space-x-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-black flex items-center justify-center">
                        <Zap className="h-5 w-5 text-white" />
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-bold font-typewriter tracking-tighter text-black">
                        {step === 0 ? "Welcome to CapturePilot" : "Tell Us About Your Business"}
                    </h2>
                </div>
                <p className="text-stone-500 mt-1 font-medium text-sm sm:text-base">
                    {step === 0 ? "Let\u2019s connect your business to federal opportunities." : "This takes about 3 minutes. We\u2019ll use this to find your best matches."}
                </p>
            </header>

            {/* Progress Bar (steps 1-4 only) */}
            {step > 0 && (
                <div className="mb-6 sm:mb-8">
                    <div className="flex justify-between items-center mb-3">
                        {[
                            { n: 1, label: "Company" },
                            { n: 2, label: "Industry" },
                            { n: 3, label: "Capacity" },
                            { n: 4, label: "Targets" },
                        ].map(s => (
                            <button type="button" key={s.n} onClick={() => { if (s.n <= step) setStep(s.n); }} className={clsx(
                                "flex items-center text-xs font-typewriter uppercase tracking-widest transition-colors",
                                step === s.n ? "text-black font-bold" : step > s.n ? "text-emerald-600 cursor-pointer" : "text-stone-400 cursor-default"
                            )}>
                                <span className={clsx(
                                    "w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center mr-1 sm:mr-2 text-[11px] font-bold border-2 transition-all",
                                    step === s.n ? "bg-black text-white border-black" : step > s.n ? "bg-emerald-500 text-white border-emerald-500" : "bg-stone-100 text-stone-400 border-stone-200"
                                )}>
                                    {step > s.n ? <CheckCircle2 className="w-4 h-4" /> : s.n}
                                </span>
                                <span className="hidden sm:inline">{s.label}</span>
                            </button>
                        ))}
                    </div>
                    <div className="w-full bg-stone-200 rounded-full h-1.5">
                        <div className="bg-black rounded-full h-1.5 transition-all duration-500" style={{ width: `${(step / 4) * 100}%` }} />
                    </div>
                </div>
            )}

            <div className="bg-white rounded-[24px] sm:rounded-[40px] border border-stone-200 shadow-sm p-5 sm:p-8 md:p-10">

                {/* Step 0: SAM.gov Check */}
                {step === 0 && (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <div className="text-center">
                            <h3 className="font-typewriter font-bold text-lg sm:text-xl mb-2">Are you registered on SAM.gov?</h3>
                            <p className="text-stone-500 text-sm">
                                If you&apos;re registered, we can auto-fill your company information.
                            </p>
                        </div>

                        {samRegistered === null && (
                            <div className="flex flex-col sm:flex-row gap-3 justify-center">
                                <button type="button" onClick={() => setSamRegistered(true)}
                                    className="flex items-center justify-center px-8 py-4 rounded-2xl border-2 border-stone-200 hover:border-black hover:bg-stone-50 transition-all text-base font-bold">
                                    <CheckCircle2 className="w-5 h-5 mr-2 text-emerald-500" /> Yes, I&apos;m registered
                                </button>
                                <button type="button" onClick={() => { setSamRegistered(false); setStep(1); }}
                                    className="flex items-center justify-center px-8 py-4 rounded-2xl border-2 border-stone-200 hover:border-stone-400 hover:bg-stone-50 transition-all text-base font-bold text-stone-600">
                                    <X className="w-5 h-5 mr-2 text-stone-400" /> Not yet
                                </button>
                            </div>
                        )}

                        {samRegistered === true && (
                            <div className="space-y-4">
                                {/* Search mode tabs */}
                                <div className="flex gap-2 justify-center">
                                    <button type="button" onClick={() => { setSearchMode("uei"); setSamError(""); setSamResults([]); }}
                                        className={clsx("px-4 py-2 rounded-full text-xs font-typewriter font-bold uppercase tracking-wider transition-all",
                                            searchMode === "uei" ? "bg-black text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200")}>
                                        Search by UEI
                                    </button>
                                    <button type="button" onClick={() => { setSearchMode("name"); setSamError(""); setSamResults([]); }}
                                        className={clsx("px-4 py-2 rounded-full text-xs font-typewriter font-bold uppercase tracking-wider transition-all",
                                            searchMode === "name" ? "bg-black text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200")}>
                                        Search by Name
                                    </button>
                                </div>

                                {searchMode === "uei" && (
                                    <div>
                                        <label className="text-xs font-typewriter text-stone-500 uppercase tracking-widest block mb-2">
                                            Unique Entity Identifier (UEI)
                                            <InfoTooltip text="Your 12-character alphanumeric code assigned when you register on SAM.gov. Find it at SAM.gov under your entity registration." />
                                        </label>
                                        <div className="flex gap-2">
                                            <input type="text" value={ueiInput} onChange={(e) => setUeiInput(e.target.value.toUpperCase())}
                                                maxLength={12}
                                                className="flex-1 px-4 py-3.5 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm font-mono uppercase"
                                                placeholder="e.g. ABCD12345678"
                                                onKeyDown={(e) => { if (e.key === "Enter") lookupSam("uei"); }}
                                            />
                                            <button type="button" onClick={() => lookupSam("uei")} disabled={samLoading || !ueiInput.trim()}
                                                className="px-5 py-3.5 bg-black text-white rounded-xl font-bold text-sm hover:bg-stone-800 transition-all disabled:opacity-50 flex items-center">
                                                {samLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Search className="w-4 h-4 mr-1" /> Look Up</>}
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {searchMode === "name" && (
                                    <div>
                                        <label className="text-xs font-typewriter text-stone-500 uppercase tracking-widest block mb-2">Company Name</label>
                                        <div className="flex gap-2">
                                            <input type="text" value={nameInput} onChange={(e) => setNameInput(e.target.value)}
                                                className="flex-1 px-4 py-3.5 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm"
                                                placeholder="e.g. Acme Services LLC"
                                                onKeyDown={(e) => { if (e.key === "Enter") lookupSam("name"); }}
                                            />
                                            <button type="button" onClick={() => lookupSam("name")} disabled={samLoading || !nameInput.trim()}
                                                className="px-5 py-3.5 bg-black text-white rounded-xl font-bold text-sm hover:bg-stone-800 transition-all disabled:opacity-50 flex items-center">
                                                {samLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Search className="w-4 h-4 mr-1" /> Search</>}
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {samError && (
                                    <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-xl p-3">{samError}</p>
                                )}

                                {/* Search results list */}
                                {samResults.length > 0 && (
                                    <div className="space-y-2">
                                        <p className="text-xs font-typewriter text-stone-500 uppercase tracking-widest">Select your entity:</p>
                                        {samResults.map((entity, i) => (
                                            <button key={i} type="button" onClick={() => populateFromSam(entity)}
                                                className="w-full text-left bg-stone-50 hover:bg-stone-100 border border-stone-200 hover:border-stone-300 rounded-xl p-4 transition-all">
                                                <p className="font-bold text-sm">{entity.company_name}</p>
                                                {entity.dba_name && <p className="text-xs text-stone-500">DBA: {entity.dba_name}</p>}
                                                <p className="text-xs text-stone-400 font-mono mt-1">UEI: {entity.uei} {entity.cage_code && `| CAGE: ${entity.cage_code}`}</p>
                                                <p className="text-xs text-stone-400">{[entity.address?.city, entity.address?.state].filter(Boolean).join(", ")}</p>
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {/* Skip link */}
                                <div className="text-center pt-2">
                                    <button type="button" onClick={() => setStep(1)} className="text-sm text-stone-500 hover:text-black underline underline-offset-2 transition-colors">
                                        Skip and enter manually
                                    </button>
                                </div>
                            </div>
                        )}

                        {samRegistered === false && (
                            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 sm:p-6 text-center">
                                <h4 className="font-bold text-amber-800 mb-2">SAM.gov Registration Required</h4>
                                <p className="text-amber-700 text-sm mb-4">
                                    To win federal contracts, your business must be registered on SAM.gov. You can still set up your profile here and start finding opportunities while you register.
                                </p>
                                <a href="https://sam.gov/content/entity-registration" target="_blank" rel="noopener noreferrer"
                                    className="inline-flex items-center text-sm font-bold text-amber-800 hover:text-amber-900 underline underline-offset-2">
                                    Register on SAM.gov <ExternalLink className="w-3 h-3 ml-1" />
                                </a>
                            </div>
                        )}
                    </div>
                )}

                {/* Step 1: Company Info */}
                {step === 1 && (
                    <div className="space-y-5 animate-in fade-in duration-300">
                        <div className="flex items-center mb-4">
                            <Building className="w-5 h-5 sm:w-6 sm:h-6 mr-3 text-stone-400" />
                            <h3 className="font-typewriter font-bold text-lg sm:text-xl">Company Information</h3>
                        </div>

                        {samPopulated && (
                            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center text-sm text-emerald-700">
                                <CheckCircle2 className="w-4 h-4 mr-2 flex-shrink-0" />
                                Auto-populated from SAM.gov. Review and edit if needed.
                            </div>
                        )}

                        <div>
                            <label className="text-xs font-typewriter text-stone-500 uppercase tracking-widest block mb-2">Company Name *</label>
                            <input type="text" value={form.company_name} onChange={(e) => updateForm("company_name", e.target.value)}
                                className="w-full px-4 py-3.5 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm font-medium" placeholder="Legal Business Name" />
                        </div>
                        <div>
                            <label className="text-xs font-typewriter text-stone-500 uppercase tracking-widest block mb-2">
                                DBA Name
                                <InfoTooltip text="Doing Business As -- the trade name your company operates under if different from your legal business name." />
                            </label>
                            <input type="text" value={form.dba_name} onChange={(e) => updateForm("dba_name", e.target.value)}
                                className="w-full px-4 py-3.5 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm" placeholder="Trade name (optional)" />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-typewriter text-stone-500 uppercase tracking-widest block mb-2">
                                    UEI
                                    <InfoTooltip text="Your Unique Entity Identifier -- a 12-character alphanumeric code assigned when you register on SAM.gov." />
                                </label>
                                <input type="text" value={form.uei} onChange={(e) => updateForm("uei", e.target.value.toUpperCase())}
                                    maxLength={12}
                                    className={clsx("w-full px-4 py-3.5 border rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm font-mono uppercase",
                                        form.uei && !ueiValidation.valid ? "border-red-300 bg-red-50" : "border-stone-200"
                                    )} placeholder="12-character ID" />
                                {form.uei && !ueiValidation.valid && <p className="text-red-600 text-xs mt-1">{ueiValidation.error}</p>}
                            </div>
                            <div>
                                <label className="text-xs font-typewriter text-stone-500 uppercase tracking-widest block mb-2">
                                    CAGE Code
                                    <InfoTooltip text="Commercial and Government Entity Code -- a 5-character identifier assigned by the Department of Defense during SAM.gov registration." />
                                </label>
                                <input type="text" value={form.cage_code} onChange={(e) => updateForm("cage_code", e.target.value.toUpperCase())}
                                    maxLength={5}
                                    className={clsx("w-full px-4 py-3.5 border rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm font-mono uppercase",
                                        form.cage_code && !cageValidation.valid ? "border-red-300 bg-red-50" : "border-stone-200"
                                    )} placeholder="e.g. 7ABC1" />
                                {form.cage_code && !cageValidation.valid && <p className="text-red-600 text-xs mt-1">{cageValidation.error}</p>}
                            </div>
                        </div>
                        <div>
                            <label className="text-xs font-typewriter text-stone-500 uppercase tracking-widest block mb-2">Street Address</label>
                            <input type="text" value={form.address_line_1} onChange={(e) => updateForm("address_line_1", e.target.value)}
                                className="w-full px-4 py-3.5 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm" placeholder="123 Main St" />
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                            <div>
                                <label className="text-xs font-typewriter text-stone-500 uppercase tracking-widest block mb-2">City</label>
                                <input type="text" value={form.city} onChange={(e) => updateForm("city", e.target.value)}
                                    className="w-full px-4 py-3.5 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm" placeholder="City" />
                            </div>
                            <div>
                                <label className="text-xs font-typewriter text-stone-500 uppercase tracking-widest block mb-2">State</label>
                                <select title="State" value={form.state} onChange={(e) => updateForm("state", e.target.value)}
                                    className="w-full px-3 py-3.5 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm bg-white">
                                    <option value="">--</option>
                                    {STATE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-typewriter text-stone-500 uppercase tracking-widest block mb-2">ZIP</label>
                                <input type="text" value={form.zip_code} onChange={(e) => updateForm("zip_code", e.target.value)}
                                    className="w-full px-4 py-3.5 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm font-mono" placeholder="ZIP" />
                            </div>
                        </div>
                        <div>
                            <label className="text-xs font-typewriter text-stone-500 uppercase tracking-widest block mb-2">Website</label>
                            <input type="text" value={form.website} onChange={(e) => updateForm("website", e.target.value)}
                                className="w-full px-4 py-3.5 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm" placeholder="www.example.com" />
                        </div>
                        <div>
                            <label className="text-xs font-typewriter text-stone-500 uppercase tracking-widest block mb-2">Phone</label>
                            <input type="tel" value={form.phone} onChange={(e) => updateForm("phone", e.target.value)}
                                className="w-full px-4 py-3.5 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm" placeholder="(555) 123-4567" />
                        </div>
                    </div>
                )}

                {/* Step 2: Industry & Certifications */}
                {step === 2 && (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <div className="flex items-center mb-4">
                            <Target className="w-5 h-5 sm:w-6 sm:h-6 mr-3 text-stone-400" />
                            <h3 className="font-typewriter font-bold text-lg sm:text-xl">Industry & Certifications</h3>
                        </div>

                        <div>
                            <label className="text-xs font-typewriter text-stone-500 uppercase tracking-widest block mb-2">
                                NAICS Codes
                                <InfoTooltip text="North American Industry Classification System codes that describe your industry. Select all that match the services or products you offer." />
                            </label>

                            {/* NAICS Search */}
                            <div className="relative mb-3">
                                <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                <input type="text" value={naicsSearch} onChange={(e) => setNaicsSearch(e.target.value)}
                                    className="w-full pl-9 pr-8 py-3 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm"
                                    placeholder="Search by code or keyword..." />
                                {naicsSearch && (
                                    <button type="button" onClick={() => setNaicsSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600">
                                        <X className="w-4 h-4" />
                                    </button>
                                )}
                            </div>

                            {/* Selected NAICS chips */}
                            {form.naics_codes.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 mb-3">
                                    {form.naics_codes.map(code => {
                                        const naics = NAICS_CODES.find(n => n.code === code);
                                        return (
                                            <span key={code} className="inline-flex items-center bg-black text-white text-xs font-mono px-2.5 py-1 rounded-lg">
                                                {code}
                                                <button type="button" onClick={() => toggleArray("naics_codes", code)} className="ml-1.5 hover:text-red-300">
                                                    <X className="w-3 h-3" />
                                                </button>
                                            </span>
                                        );
                                    })}
                                    <span className="text-xs text-emerald-600 font-bold self-center ml-1">{form.naics_codes.length} selected</span>
                                </div>
                            )}

                            <div className="grid grid-cols-1 gap-1.5 max-h-[280px] overflow-y-auto pr-1">
                                {filteredNaics.map(n => (
                                    <button type="button" key={n.code} onClick={() => toggleArray("naics_codes", n.code)}
                                        className={clsx(
                                            "flex items-center text-left px-4 py-3 rounded-xl border text-sm transition-all",
                                            form.naics_codes.includes(n.code)
                                                ? "bg-black text-white border-black"
                                                : "bg-white text-stone-700 border-stone-200 hover:border-stone-400 active:bg-stone-100"
                                        )}>
                                        <span className="font-mono text-xs mr-2 opacity-70">{n.code}</span>
                                        <span className="font-medium">{n.label}</span>
                                        {samPopulated && form.naics_codes.includes(n.code) && (
                                            <span className="ml-auto text-[9px] bg-emerald-400/20 text-emerald-200 px-1.5 py-0.5 rounded font-typewriter">SAM</span>
                                        )}
                                    </button>
                                ))}
                                {filteredNaics.length === 0 && (
                                    <p className="text-stone-400 text-sm text-center py-4">No matching NAICS codes found.</p>
                                )}
                            </div>
                        </div>

                        <div>
                            <label className="text-xs font-typewriter text-stone-500 uppercase tracking-widest block mb-3">
                                SBA Certifications
                                <InfoTooltip text="Small Business Administration certifications that may qualify you for set-aside contracts reserved for specific business categories." />
                            </label>
                            <div className="flex flex-wrap gap-2">
                                {CERT_OPTIONS.map(c => (
                                    <button type="button" key={c.value} onClick={() => toggleArray("sba_certifications", c.value)}
                                        className={clsx(
                                            "px-3 sm:px-4 py-2.5 rounded-full border text-xs font-typewriter font-bold uppercase tracking-wider transition-all",
                                            form.sba_certifications.includes(c.value)
                                                ? "bg-black text-white border-black"
                                                : "bg-white text-stone-600 border-stone-200 hover:border-stone-400 active:bg-stone-100"
                                        )}>
                                        {form.sba_certifications.includes(c.value) && <CheckCircle2 className="w-3 h-3 inline mr-1" />}
                                        {c.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* Step 3: Capacity & Experience */}
                {step === 3 && (
                    <div className="space-y-5 animate-in fade-in duration-300">
                        <div className="flex items-center mb-4">
                            <Briefcase className="w-5 h-5 sm:w-6 sm:h-6 mr-3 text-stone-400" />
                            <h3 className="font-typewriter font-bold text-lg sm:text-xl">Capacity & Experience</h3>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-typewriter text-stone-500 uppercase tracking-widest block mb-2">Employee Count</label>
                                <select title="Employee Count" value={form.employee_count} onChange={(e) => updateForm("employee_count", e.target.value)}
                                    className="w-full px-4 py-3.5 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm bg-white">
                                    {EMPLOYEE_RANGES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-typewriter text-stone-500 uppercase tracking-widest block mb-2">Annual Revenue</label>
                                <select title="Annual Revenue" value={form.revenue} onChange={(e) => updateForm("revenue", e.target.value)}
                                    className="w-full px-4 py-3.5 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm bg-white">
                                    {REVENUE_RANGES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-typewriter text-stone-500 uppercase tracking-widest block mb-2">Years in Business</label>
                                <input type="number" value={form.years_in_business} onChange={(e) => updateForm("years_in_business", e.target.value)}
                                    className="w-full px-4 py-3.5 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm" placeholder="e.g. 12" />
                            </div>
                            <div>
                                <label className="text-xs font-typewriter text-stone-500 uppercase tracking-widest block mb-2">Service Radius (miles)</label>
                                <input type="number" value={form.service_radius_miles} onChange={(e) => updateForm("service_radius_miles", e.target.value)}
                                    className="w-full px-4 py-3.5 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm" placeholder="50" />
                            </div>
                        </div>

                        <div>
                            <label className="text-xs font-typewriter text-stone-500 uppercase tracking-widest block mb-2">Past Federal Awards</label>
                            <input type="number" value={form.federal_awards_count} onChange={(e) => updateForm("federal_awards_count", e.target.value)}
                                className="w-full px-4 py-3.5 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm" placeholder="Number of past federal contracts (0 if none)" />
                        </div>

                        <div>
                            <label className="text-xs font-typewriter text-stone-500 uppercase tracking-widest block mb-3">Operational Capabilities</label>
                            <div className="flex flex-wrap gap-2 sm:gap-3">
                                <button type="button" onClick={() => updateForm("has_bonding", !form.has_bonding)}
                                    className={clsx("flex items-center px-4 py-3 rounded-xl border text-sm transition-all",
                                        form.has_bonding ? "bg-emerald-100 text-emerald-800 border-emerald-300" : "bg-white text-stone-600 border-stone-200 hover:border-stone-400"
                                    )}>
                                    <ShieldCheck className="w-4 h-4 mr-2" /> Bonded / Insured
                                </button>
                                <button type="button" onClick={() => updateForm("has_fleet", !form.has_fleet)}
                                    className={clsx("flex items-center px-4 py-3 rounded-xl border text-sm transition-all",
                                        form.has_fleet ? "bg-emerald-100 text-emerald-800 border-emerald-300" : "bg-white text-stone-600 border-stone-200 hover:border-stone-400"
                                    )}>
                                    <Truck className="w-4 h-4 mr-2" /> Fleet / Vehicles
                                </button>
                                <button type="button" onClick={() => updateForm("has_municipal_exp", !form.has_municipal_exp)}
                                    className={clsx("flex items-center px-4 py-3 rounded-xl border text-sm transition-all",
                                        form.has_municipal_exp ? "bg-emerald-100 text-emerald-800 border-emerald-300" : "bg-white text-stone-600 border-stone-200 hover:border-stone-400"
                                    )}>
                                    <Building className="w-4 h-4 mr-2" /> Gov Experience
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Step 4: Target Preferences */}
                {step === 4 && (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <div className="flex items-center mb-4">
                            <MapPin className="w-5 h-5 sm:w-6 sm:h-6 mr-3 text-stone-400" />
                            <h3 className="font-typewriter font-bold text-lg sm:text-xl">Target Preferences</h3>
                        </div>

                        <div>
                            <label className="text-xs font-typewriter text-stone-500 uppercase tracking-widest block mb-3">Contract Types of Interest</label>
                            <div className="flex flex-wrap gap-2">
                                {CONTRACT_TARGETS.map(ct => (
                                    <button type="button" key={ct.value} onClick={() => toggleArray("target_contract_types", ct.value)}
                                        className={clsx(
                                            "px-3 sm:px-4 py-2.5 rounded-full border text-xs font-typewriter font-bold transition-all",
                                            form.target_contract_types.includes(ct.value)
                                                ? "bg-black text-white border-black"
                                                : "bg-white text-stone-600 border-stone-200 hover:border-stone-400 active:bg-stone-100"
                                        )}>
                                        {form.target_contract_types.includes(ct.value) && <CheckCircle2 className="w-3 h-3 inline mr-1" />}
                                        {ct.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className="text-xs font-typewriter text-stone-500 uppercase tracking-widest block mb-3">Target States (where you can perform work)</label>
                            <div className="flex flex-wrap gap-1.5 max-h-[180px] overflow-y-auto pr-1">
                                {STATE_OPTIONS.map(s => (
                                    <button type="button" key={s} onClick={() => toggleArray("target_states", s)}
                                        className={clsx(
                                            "px-3 py-2 rounded-lg border text-xs font-mono font-bold transition-all min-w-[48px]",
                                            form.target_states.includes(s)
                                                ? "bg-black text-white border-black"
                                                : "bg-white text-stone-600 border-stone-200 hover:border-stone-400 active:bg-stone-100"
                                        )}>
                                        {s}
                                    </button>
                                ))}
                            </div>
                            {form.target_states.length > 0 && (
                                <p className="text-xs text-emerald-600 font-bold mt-2">{form.target_states.length} states selected</p>
                            )}
                        </div>
                    </div>
                )}

                {/* Navigation Buttons */}
                {step > 0 && (
                    <div className="flex justify-between mt-6 sm:mt-8 pt-5 sm:pt-6 border-t border-stone-100">
                        <button type="button" onClick={() => setStep(s => s - 1)}
                            className="flex items-center px-5 sm:px-6 py-3 rounded-full border border-stone-200 text-stone-600 hover:bg-stone-50 active:bg-stone-100 font-bold text-sm transition-all">
                            <ArrowLeft className="w-4 h-4 mr-2" /> Back
                        </button>

                        {step < 4 ? (
                            <button type="button" onClick={() => setStep(s => s + 1)}
                                disabled={step === 1 && !form.company_name}
                                className="flex items-center px-5 sm:px-6 py-3 rounded-full bg-black text-white hover:bg-stone-800 active:bg-stone-700 font-bold text-sm transition-all shadow-sm disabled:opacity-50">
                                Next <ArrowRight className="w-4 h-4 ml-2" />
                            </button>
                        ) : (
                            <button type="button" onClick={handleSave} disabled={saving || !form.company_name}
                                className="flex items-center px-6 sm:px-8 py-3 rounded-full bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800 font-bold text-sm transition-all shadow-lg disabled:opacity-50">
                                {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</> : <><CheckCircle2 className="w-4 h-4 mr-2" /> Complete Setup</>}
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
