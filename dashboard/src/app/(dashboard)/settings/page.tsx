"use client";

import { useState, useEffect } from "react";
import { Settings, User, Bell, Building, MapPin, Shield, Loader2, CheckCircle2, ArrowLeft, Phone, Calendar, UserCheck, Search, AlertCircle } from "lucide-react";
import ServiceCTA from "@/components/ui/ServiceCTA";
import { createSupabaseClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import Link from "next/link";
import { NAICS_CODES } from "@/lib/naics-codes";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import { PSC_CODES } from "@/lib/psc-codes";
import { FEDERAL_AGENCIES } from "@/lib/federal-agencies";

const supabase = createSupabaseClient();

const CERT_OPTIONS = [
    { value: "8(a)", label: "8(a)" },
    { value: "HUBZone", label: "HUBZone" },
    { value: "SDVOSB", label: "SDVOSB" },
    { value: "WOSB", label: "WOSB" },
    { value: "EDWOSB", label: "EDWOSB" },
    { value: "VOSB", label: "VOSB" },
    { value: "SDB", label: "SDB" },
];

const STATE_OPTIONS = [
    "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
    "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
    "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC","PR","GU","VI"
];

interface Profile {
    company_name: string;
    dba_name: string | null;
    uei: string | null;
    cage_code: string | null;
    address_line_1: string | null;
    city: string | null;
    state: string | null;
    zip_code: string | null;
    website: string | null;
    phone: string | null;
    email: string | null;
    naics_codes: string[];
    sba_certifications: string[];
    employee_count: number | null;
    revenue: number | null;
    years_in_business: number | null;
    service_radius_miles: number | null;
    has_bonding: boolean;
    has_fleet: boolean;
    has_municipal_exp: boolean;
    federal_awards_count: number;
    target_contract_types: string[];
    target_states: string[];
    target_psc_codes: string[];
    preferred_agencies: string[];
    contract_value_min: number | null;
    contract_value_max: number | null;
    security_clearances: string[];
    prime_or_sub: string;
    plan_tier: string;
    notification_preferences: { email: boolean; frequency: string };
}

export default function SettingsPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [userEmail, setUserEmail] = useState("");
    const [profile, setProfile] = useState<Profile | null>(null);
    const [naicsSearch, setNaicsSearch] = useState("");
    const [pscSearch, setPscSearch] = useState("");
    const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

    useEffect(() => {
        async function load() {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) { router.push("/login"); return; }
            setUserEmail(user.email || "");

            const { data } = await supabase
                .from("user_profiles")
                .select("*")
                .eq("auth_user_id", user.id)
                .single();

            if (data) {
                setProfile(data as unknown as Profile);
            }
            setLoading(false);
        }
        load();
    }, [router]);

    const updateProfile = (key: string, value: unknown) => {
        if (!profile) return;
        setProfile({ ...profile, [key]: value });
        setSaved(false);
    };

    const toggleArray = (key: "naics_codes" | "sba_certifications" | "target_states" | "target_psc_codes" | "preferred_agencies" | "security_clearances", value: string) => {
        if (!profile) return;
        const arr = (profile[key] || []) as string[];
        updateProfile(key, arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value]);
    };

    const validateFields = (): boolean => {
        const errors: Record<string, string> = {};
        if (profile?.uei && !/^[A-Za-z0-9]{12}$/.test(profile.uei)) {
            errors.uei = "UEI must be exactly 12 alphanumeric characters";
        }
        if (profile?.cage_code && !/^[A-Za-z0-9]{5}$/.test(profile.cage_code)) {
            errors.cage_code = "CAGE code must be exactly 5 alphanumeric characters";
        }
        setValidationErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleSave = async () => {
        if (!profile) return;
        if (!validateFields()) return;
        setSaving(true);

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { error } = await supabase
            .from("user_profiles")
            .update({
                company_name: profile.company_name,
                dba_name: profile.dba_name,
                uei: profile.uei ? profile.uei.toUpperCase() : null,
                cage_code: profile.cage_code ? profile.cage_code.toUpperCase() : null,
                address_line_1: profile.address_line_1,
                city: profile.city,
                state: profile.state,
                zip_code: profile.zip_code,
                website: profile.website,
                phone: profile.phone,
                naics_codes: profile.naics_codes || [],
                sba_certifications: profile.sba_certifications || [],
                employee_count: profile.employee_count,
                revenue: profile.revenue,
                years_in_business: profile.years_in_business,
                service_radius_miles: profile.service_radius_miles,
                has_bonding: profile.has_bonding,
                has_fleet: profile.has_fleet,
                has_municipal_exp: profile.has_municipal_exp,
                federal_awards_count: profile.federal_awards_count,
                target_states: profile.target_states || [],
                target_contract_types: profile.target_contract_types || [],
                target_psc_codes: profile.target_psc_codes || [],
                preferred_agencies: profile.preferred_agencies || [],
                contract_value_min: profile.contract_value_min,
                contract_value_max: profile.contract_value_max,
                security_clearances: profile.security_clearances || [],
                prime_or_sub: profile.prime_or_sub || "both",
                notification_preferences: profile.notification_preferences,
            })
            .eq("auth_user_id", user.id);

        if (error) {
            alert("Failed to save: " + error.message);
        } else {
            setSaved(true);
        }
        setSaving(false);
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center min-h-[400px]">
                <Loader2 className="w-10 h-10 animate-spin text-stone-400" />
            </div>
        );
    }

    if (!profile) {
        return (
            <div className="max-w-lg mx-auto text-center py-16">
                <p className="text-stone-500 mb-4">No profile found. Please complete onboarding first.</p>
                <Link href="/onboard" className="bg-black text-white px-6 py-3 rounded-full font-bold text-sm">
                    Go to Onboarding
                </Link>
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-500 pb-12 px-1">
            <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
                <div>
                    <h2 className="text-2xl sm:text-3xl font-bold font-typewriter tracking-tighter text-black flex items-center">
                        <Settings className="mr-3 w-6 h-6 sm:w-8 sm:h-8" /> Settings
                    </h2>
                    <p className="text-stone-500 mt-1 font-medium text-sm">
                        Manage your business profile and preferences
                    </p>
                </div>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className={clsx(
                        "flex items-center px-6 py-2.5 rounded-full font-bold text-sm transition-all shadow-sm self-start sm:self-auto",
                        saved ? "bg-emerald-600 text-white" : "bg-black text-white hover:bg-stone-800 active:bg-stone-700"
                    )}
                >
                    {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</> :
                     saved ? <><CheckCircle2 className="w-4 h-4 mr-2" /> Saved</> :
                     "Save Changes"}
                </button>
            </header>

            {/* Account */}
            <section className="bg-white rounded-[24px] sm:rounded-[32px] border border-stone-200 shadow-sm p-5 sm:p-7">
                <h3 className="font-typewriter font-bold text-base sm:text-lg flex items-center mb-4">
                    <User className="w-5 h-5 mr-2 text-stone-400" /> Account
                </h3>
                <div className="space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 py-3 border-b border-stone-100">
                        <div>
                            <p className="font-medium text-sm">Email</p>
                            <p className="text-xs text-stone-400">From your Google account</p>
                        </div>
                        <p className="text-sm font-mono text-stone-600">{userEmail}</p>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 py-3">
                        <div>
                            <p className="font-medium text-sm">Plan</p>
                            <p className="text-xs text-stone-400">Your current subscription</p>
                        </div>
                        <div className="flex items-center gap-2 self-start sm:self-auto">
                            <span className="text-xs font-typewriter font-bold bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full uppercase">
                                {profile.plan_tier === "free_beta" ? "Free Beta" : profile.plan_tier}
                            </span>
                        </div>
                    </div>
                </div>
            </section>

            {/* Profile Completeness */}
            {(() => {
                const checks: [boolean, string][] = [
                    [!!profile.company_name, "Company Name"],
                    [!!profile.uei, "UEI"],
                    [!!profile.cage_code, "CAGE Code"],
                    [(profile.naics_codes?.length || 0) > 0, "NAICS Codes"],
                    [(profile.sba_certifications?.length || 0) > 0, "SBA Certifications"],
                    [!!profile.state, "State"],
                    [(profile.target_states?.length || 0) > 0, "Target States"],
                    [!!profile.website, "Website"],
                    [!!profile.phone, "Phone"],
                    [!!profile.employee_count, "Employee Count"],
                    [!!profile.years_in_business, "Years in Business"],
                    [(profile.federal_awards_count || 0) > 0, "Past Federal Awards"],
                ];
                const completed = checks.filter(([ok]) => ok).length;
                const score = Math.round((completed / checks.length) * 100);
                const missing = checks.filter(([ok]) => !ok).map(([, label]) => label);

                return (
                    <section className="bg-white rounded-[24px] sm:rounded-[32px] border border-stone-200 shadow-sm p-5 sm:p-7">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="font-typewriter font-bold text-base sm:text-lg flex items-center">
                                <UserCheck className="w-5 h-5 mr-2 text-stone-400" /> Profile Strength
                            </h3>
                            <span className={clsx("text-lg font-black font-typewriter",
                                score >= 80 ? "text-emerald-600" : score >= 50 ? "text-amber-600" : "text-red-600"
                            )}>{score}%</span>
                        </div>
                        <div className="w-full bg-stone-200 rounded-full h-2.5 mb-3">
                            <div className={clsx("rounded-full h-2.5 transition-all duration-500",
                                score >= 80 ? "bg-emerald-500" : score >= 50 ? "bg-amber-500" : "bg-red-500"
                            )} style={{ width: `${score}%` }} />
                        </div>
                        {missing.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                                {missing.map(m => (
                                    <span key={m} className="text-[10px] font-typewriter bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded">
                                        {m}
                                    </span>
                                ))}
                            </div>
                        ) : (
                            <p className="text-xs text-emerald-600 font-bold">Your profile is complete. You are getting the best possible matches.</p>
                        )}
                    </section>
                );
            })()}

            {/* Company Info */}
            <section className="bg-white rounded-[24px] sm:rounded-[32px] border border-stone-200 shadow-sm p-5 sm:p-7">
                <h3 className="font-typewriter font-bold text-base sm:text-lg flex items-center mb-4">
                    <Building className="w-5 h-5 mr-2 text-stone-400" /> Company Info
                </h3>
                <div className="space-y-4">
                    <div>
                        <label className="text-xs font-typewriter text-stone-500 uppercase tracking-widest block mb-1.5">Company Name</label>
                        <input type="text" placeholder="Legal Business Name" value={profile.company_name || ""} onChange={(e) => updateProfile("company_name", e.target.value)}
                            className="w-full px-4 py-3 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm" />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-typewriter text-stone-500 uppercase tracking-widest block mb-1.5">UEI <span className="text-stone-400 normal-case">(12 alphanumeric)</span></label>
                            <input type="text" placeholder="e.g. ABC123DEF456" maxLength={12} value={profile.uei || ""}
                                onChange={(e) => { updateProfile("uei", e.target.value.replace(/[^A-Za-z0-9]/g, "")); setValidationErrors(prev => ({ ...prev, uei: "" })); }}
                                className={clsx("w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm font-mono uppercase",
                                    validationErrors.uei ? "border-red-400" : "border-stone-200")} />
                            {validationErrors.uei && <p className="text-xs text-red-500 mt-1 flex items-center"><AlertCircle className="w-3 h-3 mr-1" />{validationErrors.uei}</p>}
                        </div>
                        <div>
                            <label className="text-xs font-typewriter text-stone-500 uppercase tracking-widest block mb-1.5">CAGE Code <span className="text-stone-400 normal-case">(5 alphanumeric)</span></label>
                            <input type="text" placeholder="e.g. 7ABC1" maxLength={5} value={profile.cage_code || ""}
                                onChange={(e) => { updateProfile("cage_code", e.target.value.replace(/[^A-Za-z0-9]/g, "")); setValidationErrors(prev => ({ ...prev, cage_code: "" })); }}
                                className={clsx("w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm font-mono uppercase",
                                    validationErrors.cage_code ? "border-red-400" : "border-stone-200")} />
                            {validationErrors.cage_code && <p className="text-xs text-red-500 mt-1 flex items-center"><AlertCircle className="w-3 h-3 mr-1" />{validationErrors.cage_code}</p>}
                        </div>
                    </div>
                    <div>
                        <label className="text-xs font-typewriter text-stone-500 uppercase tracking-widest block mb-1.5">Street Address</label>
                        <AddressAutocomplete
                            value={profile.address_line_1 || ""}
                            onChange={(val) => updateProfile("address_line_1", val)}
                            onSelect={(addr) => {
                                updateProfile("address_line_1", addr.address_line_1);
                                updateProfile("city", addr.city);
                                updateProfile("state", addr.state);
                                updateProfile("zip_code", addr.zip_code);
                            }}
                            placeholder="Start typing your address..."
                        />
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                        <div>
                            <label className="text-xs font-typewriter text-stone-500 uppercase tracking-widest block mb-1.5">City</label>
                            <input type="text" placeholder="City" value={profile.city || ""} onChange={(e) => updateProfile("city", e.target.value)}
                                className="w-full px-4 py-3 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm" />
                        </div>
                        <div>
                            <label className="text-xs font-typewriter text-stone-500 uppercase tracking-widest block mb-1.5">State</label>
                            <select title="State" value={profile.state || ""} onChange={(e) => updateProfile("state", e.target.value)}
                                className="w-full px-3 py-3 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm bg-white">
                                <option value="">--</option>
                                {STATE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-typewriter text-stone-500 uppercase tracking-widest block mb-1.5">ZIP</label>
                            <input type="text" placeholder="ZIP" value={profile.zip_code || ""} onChange={(e) => updateProfile("zip_code", e.target.value)}
                                className="w-full px-4 py-3 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm font-mono" />
                        </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-typewriter text-stone-500 uppercase tracking-widest block mb-1.5">Website</label>
                            <input type="text" placeholder="www.example.com" value={profile.website || ""} onChange={(e) => updateProfile("website", e.target.value)}
                                className="w-full px-4 py-3 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm" />
                        </div>
                        <div>
                            <label className="text-xs font-typewriter text-stone-500 uppercase tracking-widest block mb-1.5">Phone</label>
                            <input type="tel" placeholder="(555) 123-4567" value={profile.phone || ""} onChange={(e) => updateProfile("phone", e.target.value)}
                                className="w-full px-4 py-3 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm" />
                        </div>
                    </div>
                </div>
            </section>

            {/* Industry */}
            <section className="bg-white rounded-[24px] sm:rounded-[32px] border border-stone-200 shadow-sm p-5 sm:p-7">
                <h3 className="font-typewriter font-bold text-base sm:text-lg flex items-center mb-4">
                    <Shield className="w-5 h-5 mr-2 text-stone-400" /> Industry & Certifications
                </h3>
                <div className="space-y-4">
                    <div>
                        <label className="text-xs font-typewriter text-stone-500 uppercase tracking-widest block mb-2">NAICS Codes</label>
                        <div className="relative mb-2">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                            <input type="text" placeholder="Search by code or name..." value={naicsSearch} onChange={(e) => setNaicsSearch(e.target.value)}
                                className="w-full pl-9 pr-4 py-2.5 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm" />
                        </div>
                        {(profile.naics_codes || []).length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mb-2">
                                {(profile.naics_codes || []).map(code => {
                                    const match = NAICS_CODES.find(n => n.code === code);
                                    return (
                                        <button type="button" key={code} onClick={() => toggleArray("naics_codes", code)}
                                            className="flex items-center bg-black text-white px-2.5 py-1 rounded-full text-xs font-typewriter gap-1">
                                            <span>{code}</span>
                                            <span className="opacity-60">&times;</span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                        <div className="grid grid-cols-1 gap-1.5 max-h-[240px] overflow-y-auto pr-1">
                            {(() => {
                                const search = naicsSearch.toLowerCase();
                                const filtered = search
                                    ? NAICS_CODES.filter(n => n.code.includes(search) || n.label.toLowerCase().includes(search))
                                    : NAICS_CODES.filter(n => n.popular || (profile.naics_codes || []).includes(n.code));
                                return filtered.slice(0, 50).map(n => (
                                    <button type="button" key={n.code} onClick={() => toggleArray("naics_codes", n.code)}
                                        className={clsx(
                                            "flex items-center text-left px-3 py-2.5 rounded-lg border text-sm transition-all",
                                            (profile.naics_codes || []).includes(n.code)
                                                ? "bg-black text-white border-black"
                                                : "bg-white text-stone-700 border-stone-200 hover:border-stone-400 active:bg-stone-100"
                                        )}>
                                        <span className="font-mono text-xs mr-2 opacity-70">{n.code}</span>
                                        <span className="font-medium text-xs sm:text-sm">{n.label}</span>
                                    </button>
                                ));
                            })()}
                        </div>
                        {!naicsSearch && <p className="text-[10px] text-stone-400 mt-1.5">Showing popular codes. Search to find more.</p>}
                    </div>
                    <div>
                        <label className="text-xs font-typewriter text-stone-500 uppercase tracking-widest block mb-2">SBA Certifications</label>
                        <div className="flex flex-wrap gap-2">
                            {CERT_OPTIONS.map(c => (
                                <button type="button" key={c.value} onClick={() => toggleArray("sba_certifications", c.value)}
                                    className={clsx(
                                        "px-3 py-2 rounded-full border text-xs font-typewriter font-bold uppercase transition-all",
                                        (profile.sba_certifications || []).includes(c.value)
                                            ? "bg-black text-white border-black"
                                            : "bg-white text-stone-600 border-stone-200 hover:border-stone-400 active:bg-stone-100"
                                    )}>
                                    {c.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            {/* PSC Codes & Clearances */}
            <section className="bg-white rounded-[24px] sm:rounded-[32px] border border-stone-200 shadow-sm p-5 sm:p-7">
                <h3 className="font-typewriter font-bold text-base sm:text-lg flex items-center mb-4">
                    <Shield className="w-5 h-5 mr-2 text-stone-400" /> Service Codes & Clearances
                </h3>
                <div className="space-y-4">
                    <div>
                        <label className="text-xs font-typewriter text-stone-500 uppercase tracking-widest block mb-2">Product/Service Codes (PSC)</label>
                        <div className="relative mb-2">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                            <input type="text" placeholder="Search PSC codes..." value={pscSearch} onChange={(e) => setPscSearch(e.target.value)}
                                className="w-full pl-9 pr-4 py-2.5 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm" />
                        </div>
                        {(profile.target_psc_codes || []).length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mb-2">
                                {(profile.target_psc_codes || []).map(code => (
                                    <button type="button" key={code} title={`Remove ${code}`} onClick={() => toggleArray("target_psc_codes", code)}
                                        className="flex items-center bg-black text-white px-2.5 py-1 rounded-full text-xs font-typewriter gap-1">
                                        <span>{code}</span>
                                        <span className="opacity-60">&times;</span>
                                    </button>
                                ))}
                            </div>
                        )}
                        <div className="grid grid-cols-1 gap-1.5 max-h-[200px] overflow-y-auto pr-1">
                            {(() => {
                                const search = pscSearch.toLowerCase();
                                const filtered = search
                                    ? PSC_CODES.filter(p => p.code.toLowerCase().includes(search) || p.label.toLowerCase().includes(search) || p.category.toLowerCase().includes(search))
                                    : PSC_CODES.filter(p => p.popular || (profile.target_psc_codes || []).includes(p.code));
                                return filtered.slice(0, 30).map(p => (
                                    <button type="button" key={p.code} onClick={() => toggleArray("target_psc_codes", p.code)}
                                        className={clsx(
                                            "flex items-center text-left px-3 py-2.5 rounded-lg border text-sm transition-all",
                                            (profile.target_psc_codes || []).includes(p.code)
                                                ? "bg-black text-white border-black"
                                                : "bg-white text-stone-700 border-stone-200 hover:border-stone-400 active:bg-stone-100"
                                        )}>
                                        <span className="font-mono text-xs mr-2 opacity-70">{p.code}</span>
                                        <span className="font-medium text-xs sm:text-sm">{p.label}</span>
                                    </button>
                                ));
                            })()}
                        </div>
                        {!pscSearch && <p className="text-[10px] text-stone-400 mt-1.5">Showing popular codes. Search to find more.</p>}
                    </div>
                    <div>
                        <label className="text-xs font-typewriter text-stone-500 uppercase tracking-widest block mb-2">Security Clearances</label>
                        <div className="flex flex-wrap gap-2">
                            {["Confidential", "Secret", "Top Secret", "TS/SCI"].map(c => (
                                <button type="button" key={c} onClick={() => toggleArray("security_clearances", c)}
                                    className={clsx(
                                        "px-3 py-2 rounded-full border text-xs font-typewriter font-bold uppercase transition-all",
                                        (profile.security_clearances || []).includes(c)
                                            ? "bg-black text-white border-black"
                                            : "bg-white text-stone-600 border-stone-200 hover:border-stone-400 active:bg-stone-100"
                                    )}>
                                    {c}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            {/* Preferred Agencies & Contract Preferences */}
            <section className="bg-white rounded-[24px] sm:rounded-[32px] border border-stone-200 shadow-sm p-5 sm:p-7">
                <h3 className="font-typewriter font-bold text-base sm:text-lg flex items-center mb-4">
                    <Building className="w-5 h-5 mr-2 text-stone-400" /> Targeting Preferences
                </h3>
                <div className="space-y-4">
                    <div>
                        <label className="text-xs font-typewriter text-stone-500 uppercase tracking-widest block mb-2">Preferred Agencies</label>
                        <div className="flex flex-wrap gap-1.5">
                            {FEDERAL_AGENCIES.filter(a => a.popular).map(a => (
                                <button type="button" key={a.code} onClick={() => toggleArray("preferred_agencies", a.code)}
                                    className={clsx(
                                        "px-3 py-2 rounded-lg border text-xs font-typewriter font-bold transition-all",
                                        (profile.preferred_agencies || []).includes(a.code)
                                            ? "bg-black text-white border-black"
                                            : "bg-white text-stone-600 border-stone-200 hover:border-stone-400 active:bg-stone-100"
                                    )}>
                                    {a.shortName}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-typewriter text-stone-500 uppercase tracking-widest block mb-1.5">Min Contract Value</label>
                            <select title="Min Contract Value" value={profile.contract_value_min || ""} onChange={(e) => updateProfile("contract_value_min", e.target.value ? parseFloat(e.target.value) : null)}
                                className="w-full px-4 py-3 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm bg-white">
                                <option value="">No preference</option>
                                <option value="10000">$10K</option>
                                <option value="25000">$25K</option>
                                <option value="100000">$100K</option>
                                <option value="250000">$250K</option>
                                <option value="1000000">$1M</option>
                                <option value="5000000">$5M</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-typewriter text-stone-500 uppercase tracking-widest block mb-1.5">Max Contract Value</label>
                            <select title="Max Contract Value" value={profile.contract_value_max || ""} onChange={(e) => updateProfile("contract_value_max", e.target.value ? parseFloat(e.target.value) : null)}
                                className="w-full px-4 py-3 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm bg-white">
                                <option value="">No preference</option>
                                <option value="25000">$25K</option>
                                <option value="100000">$100K</option>
                                <option value="250000">$250K</option>
                                <option value="1000000">$1M</option>
                                <option value="5000000">$5M</option>
                                <option value="10000000">$10M+</option>
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="text-xs font-typewriter text-stone-500 uppercase tracking-widest block mb-2">Role Preference</label>
                        <div className="flex gap-2">
                            {[
                                { value: "prime", label: "Prime Only" },
                                { value: "sub", label: "Sub Only" },
                                { value: "both", label: "Both" },
                            ].map(opt => (
                                <button type="button" key={opt.value} onClick={() => updateProfile("prime_or_sub", opt.value)}
                                    className={clsx(
                                        "flex-1 px-4 py-2.5 rounded-xl border text-xs font-bold transition-all text-center",
                                        (profile.prime_or_sub || "both") === opt.value
                                            ? "bg-black text-white border-black"
                                            : "bg-white text-stone-600 border-stone-200 hover:border-stone-400"
                                    )}>
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            {/* Target States */}
            <section className="bg-white rounded-[24px] sm:rounded-[32px] border border-stone-200 shadow-sm p-5 sm:p-7">
                <h3 className="font-typewriter font-bold text-base sm:text-lg flex items-center mb-4">
                    <MapPin className="w-5 h-5 mr-2 text-stone-400" /> Target States
                </h3>
                <div className="flex flex-wrap gap-1.5 max-h-[150px] overflow-y-auto pr-1">
                    {STATE_OPTIONS.map(s => (
                        <button type="button" key={s} onClick={() => toggleArray("target_states", s)}
                            className={clsx(
                                "px-3 py-2 rounded-lg border text-xs font-mono font-bold transition-all min-w-[48px]",
                                (profile.target_states || []).includes(s)
                                    ? "bg-black text-white border-black"
                                    : "bg-white text-stone-600 border-stone-200 hover:border-stone-400 active:bg-stone-100"
                            )}>
                            {s}
                        </button>
                    ))}
                </div>
                {(profile.target_states || []).length > 0 && (
                    <p className="text-xs text-emerald-600 font-bold mt-2">{profile.target_states.length} states selected</p>
                )}
            </section>

            {/* Notifications */}
            <section className="bg-white rounded-[24px] sm:rounded-[32px] border border-stone-200 shadow-sm p-5 sm:p-7">
                <h3 className="font-typewriter font-bold text-base sm:text-lg flex items-center mb-4">
                    <Bell className="w-5 h-5 mr-2 text-stone-400" /> Notifications
                </h3>
                <div className="space-y-4">
                    <div className="flex items-center justify-between py-3 border-b border-stone-100">
                        <div>
                            <p className="font-medium text-sm">Email Alerts</p>
                            <p className="text-xs text-stone-400">Get notified about new matching opportunities</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                title="Email Alerts"
                                className="sr-only peer"
                                checked={profile.notification_preferences?.email ?? true}
                                onChange={(e) => updateProfile("notification_preferences", { ...profile.notification_preferences, email: e.target.checked })}
                            />
                            <div className="w-11 h-6 bg-stone-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-black"></div>
                        </label>
                    </div>
                    <div className="flex items-center justify-between py-3">
                        <div>
                            <p className="font-medium text-sm">Alert Frequency</p>
                            <p className="text-xs text-stone-400">How often to receive email digests</p>
                        </div>
                        <select
                            title="Alert Frequency"
                            value={profile.notification_preferences?.frequency || "daily"}
                            onChange={(e) => updateProfile("notification_preferences", { ...profile.notification_preferences, frequency: e.target.value })}
                            className="bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black"
                        >
                            <option value="daily">Daily</option>
                            <option value="weekly">Weekly</option>
                            <option value="realtime">Real-time</option>
                        </select>
                    </div>
                </div>
            </section>

            {/* Service CTA */}
            <ServiceCTA
                title="Need help with your GovCon profile?"
                description="Our team can optimize your SAM.gov registration, identify the best NAICS codes for your business, and match you with the right certifications."
                variant="default"
            />

            {/* Save Button (Mobile sticky) */}
            <div className="sm:hidden fixed bottom-0 left-0 right-0 p-4 bg-white/95 backdrop-blur-md border-t border-stone-200 z-40">
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className={clsx(
                        "w-full flex items-center justify-center py-3.5 rounded-2xl font-bold text-sm transition-all shadow-sm",
                        saved ? "bg-emerald-600 text-white" : "bg-black text-white active:bg-stone-700"
                    )}
                >
                    {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</> :
                     saved ? <><CheckCircle2 className="w-4 h-4 mr-2" /> Saved</> :
                     "Save Changes"}
                </button>
            </div>
        </div>
    );
}
