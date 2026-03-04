"use client";

import { useState } from "react";
import { createClient } from "@supabase/supabase-js";
import {
    Building, MapPin, Target, ShieldCheck, DollarSign, Users as UsersIcon,
    Briefcase, Truck, Globe, Phone, Mail, ArrowRight, ArrowLeft,
    CheckCircle2, Loader2, ChevronDown
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ryxgjzehoijjvczqkhwr.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ5eGdqemVob2lqanZjenFraHdyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwNDg0NTUsImV4cCI6MjA4NzYyNDQ1NX0.q0HivHixjE-A2MuQZlmlZOO2eLpQEm8c6XhQQQKaJsY"
);

const NAICS_OPTIONS = [
    { code: "561720", label: "Janitorial Services" },
    { code: "561210", label: "Facilities Support Services" },
    { code: "561730", label: "Landscaping Services" },
    { code: "561710", label: "Exterminating & Pest Control" },
    { code: "236220", label: "Commercial Building Construction" },
    { code: "238210", label: "Electrical Contractors" },
    { code: "238220", label: "Plumbing & HVAC Contractors" },
    { code: "238320", label: "Painting & Wall Covering" },
    { code: "238910", label: "Site Preparation Contractors" },
    { code: "541330", label: "Engineering Services" },
    { code: "541512", label: "Computer Systems Design" },
    { code: "541611", label: "Admin Management Consulting" },
    { code: "541690", label: "Other Scientific/Technical Consulting" },
    { code: "561320", label: "Temporary Staffing Services" },
    { code: "561612", label: "Security Guards & Patrol Services" },
    { code: "562111", label: "Solid Waste Collection" },
    { code: "562910", label: "Remediation Services" },
    { code: "488190", label: "Other Support Activities for Air Transportation" },
    { code: "811310", label: "Commercial Machinery Repair & Maintenance" },
];

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
    { value: "sap", label: "Simplified Acquisition ($10K-$250K)" },
    { value: "sole_source", label: "8(a) Sole Source (up to $4.5M)" },
    { value: "full_open", label: "Full & Open Competition" },
    { value: "idiq", label: "IDIQ / GWAC Vehicles" },
];

export default function OnboardPage() {
    const router = useRouter();
    const [step, setStep] = useState(1);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [savedId, setSavedId] = useState("");

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
        email: "",
        poc_name: "",
        poc_title: "",
        poc_phone: "",
        poc_email: "",
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
        notes: "",
    });

    const updateForm = (key: string, value: unknown) => setForm(prev => ({ ...prev, [key]: value }));

    const toggleArray = (key: "naics_codes" | "sba_certifications" | "target_contract_types" | "target_states", value: string) => {
        setForm(prev => {
            const arr = prev[key] as string[];
            return { ...prev, [key]: arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value] };
        });
    };

    const handleSave = async () => {
        if (!form.company_name) { alert("Company name is required."); return; }
        setSaving(true);

        const payload = {
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
            email: form.email || null,
            primary_poc_name: form.poc_name || null,
            primary_poc_title: form.poc_title || null,
            primary_poc_phone: form.poc_phone || null,
            primary_poc_email: form.poc_email || null,
            naics_codes: form.naics_codes.length > 0 ? form.naics_codes : null,
            sba_certifications: form.sba_certifications.length > 0 ? form.sba_certifications : null,
            employee_count: form.employee_count ? parseInt(form.employee_count) : null,
            revenue: form.revenue ? parseFloat(form.revenue) : null,
            years_in_business: form.years_in_business ? parseInt(form.years_in_business) : null,
            service_radius_miles: form.service_radius_miles ? parseInt(form.service_radius_miles) : 50,
            bonded_mentioned: form.has_bonding,
            municipal_experience: form.has_municipal_exp,
            federal_awards_count: form.federal_awards_count ? parseInt(form.federal_awards_count) : 0,
            sam_registered: form.uei ? true : false,
            is_manually_edited: true,
            capacity_signals: {
                bonded: form.has_bonding ? "Yes" : "No",
                fleet: form.has_fleet,
                municipal_exp: form.has_municipal_exp,
            },
            ownership: {
                owner_name: form.poc_name || null,
                owner_title: form.poc_title || null,
            },
        };

        const { data, error } = await supabase
            .from("contractors")
            .insert(payload)
            .select("id")
            .single();

        if (error) {
            console.error("Save error:", error);
            alert("Failed to save: " + (error.message || "Unknown error"));
            setSaving(false);
            return;
        }

        // Also create a contact record for the POC
        if (form.poc_name && data?.id) {
            await supabase.from("contractor_contacts").insert({
                contractor_id: data.id,
                full_name: form.poc_name,
                title: form.poc_title || "Primary Contact",
                email: form.poc_email || form.email || null,
                phone: form.poc_phone || form.phone || null,
                source: "manual",
                confidence: "high",
            });
        }

        setSavedId(data?.id || "");
        setSaved(true);
        setSaving(false);
    };

    const totalSteps = 5;

    if (saved) {
        return (
            <div className="max-w-2xl mx-auto text-center animate-in fade-in duration-500 py-16">
                <div className="bg-white rounded-[40px] border border-stone-200 shadow-sm p-12">
                    <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-6" />
                    <h2 className="text-3xl font-bold font-typewriter tracking-tighter text-black mb-4">Client Onboarded</h2>
                    <p className="text-stone-500 font-medium mb-8">
                        <span className="font-bold text-black">{form.company_name}</span> has been added to the system. Run the scoring engine to generate matched opportunities.
                    </p>
                    <div className="flex justify-center gap-4">
                        <Link href={`/portal?contractor=${savedId}`} className="inline-flex items-center bg-black text-white font-typewriter font-bold px-8 py-4 rounded-full hover:bg-stone-800 transition-all shadow-lg text-sm">
                            <ArrowRight className="w-4 h-4 mr-2" /> Open Client Portal
                        </Link>
                        <Link href={`/contractors/${savedId}`} className="inline-flex items-center bg-white text-black font-typewriter font-bold px-8 py-4 rounded-full border border-stone-200 hover:border-black transition-all text-sm">
                            View Full Profile
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto animate-in fade-in duration-500 pb-16">
            <header className="mb-8">
                <Link href="/portal" className="inline-flex items-center text-sm font-typewriter text-stone-500 hover:text-black mb-6 transition-colors">
                    <ArrowLeft className="w-4 h-4 mr-2" /> Back to Portal
                </Link>
                <h2 className="text-3xl font-bold font-typewriter tracking-tighter text-black flex items-center">
                    <Building className="mr-3 w-8 h-8" /> Client Onboarding
                </h2>
                <p className="text-stone-500 mt-2 font-medium">
                    Add a new contractor client to the intelligence engine
                </p>
            </header>

            {/* Progress Bar */}
            <div className="mb-8">
                <div className="flex justify-between items-center mb-3">
                    {[
                        { n: 1, label: "Company" },
                        { n: 2, label: "Industry" },
                        { n: 3, label: "Capacity" },
                        { n: 4, label: "Contact" },
                        { n: 5, label: "Targets" },
                    ].map(s => (
                        <button type="button" key={s.n} onClick={() => setStep(s.n)} className={clsx(
                            "flex items-center text-xs font-typewriter uppercase tracking-widest transition-colors",
                            step === s.n ? "text-black font-bold" : step > s.n ? "text-emerald-600" : "text-stone-400"
                        )}>
                            <span className={clsx(
                                "w-7 h-7 rounded-full flex items-center justify-center mr-2 text-[11px] font-bold border-2 transition-all",
                                step === s.n ? "bg-black text-white border-black" : step > s.n ? "bg-emerald-500 text-white border-emerald-500" : "bg-stone-100 text-stone-400 border-stone-200"
                            )}>
                                {step > s.n ? <CheckCircle2 className="w-4 h-4" /> : s.n}
                            </span>
                            <span className="hidden md:inline">{s.label}</span>
                        </button>
                    ))}
                </div>
                <div className="w-full bg-stone-200 rounded-full h-1.5">
                    <div className="bg-black rounded-full h-1.5 transition-all duration-500" style={{ width: `${(step / totalSteps) * 100}%` }} />
                </div>
            </div>

            <div className="bg-white rounded-[40px] border border-stone-200 shadow-sm p-8 md:p-10">
                {/* Step 1: Company Info */}
                {step === 1 && (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <div className="flex items-center mb-6">
                            <Building className="w-6 h-6 mr-3 text-stone-400" />
                            <h3 className="font-typewriter font-bold text-xl">Company Information</h3>
                        </div>

                        <div>
                            <label className="text-xs font-typewriter text-stone-500 uppercase tracking-widest block mb-2">Company Name *</label>
                            <input type="text" value={form.company_name} onChange={(e) => updateForm("company_name", e.target.value)}
                                className="w-full px-4 py-3 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm font-medium" placeholder="Legal Business Name" />
                        </div>
                        <div>
                            <label className="text-xs font-typewriter text-stone-500 uppercase tracking-widest block mb-2">DBA Name</label>
                            <input type="text" value={form.dba_name} onChange={(e) => updateForm("dba_name", e.target.value)}
                                className="w-full px-4 py-3 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm" placeholder="Doing Business As (optional)" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-typewriter text-stone-500 uppercase tracking-widest block mb-2">UEI</label>
                                <input type="text" value={form.uei} onChange={(e) => updateForm("uei", e.target.value)}
                                    className="w-full px-4 py-3 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm font-mono" placeholder="Unique Entity ID" />
                            </div>
                            <div>
                                <label className="text-xs font-typewriter text-stone-500 uppercase tracking-widest block mb-2">CAGE Code</label>
                                <input type="text" value={form.cage_code} onChange={(e) => updateForm("cage_code", e.target.value)}
                                    className="w-full px-4 py-3 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm font-mono" placeholder="e.g. 7ABC1" />
                            </div>
                        </div>
                        <div>
                            <label className="text-xs font-typewriter text-stone-500 uppercase tracking-widest block mb-2">Street Address</label>
                            <input type="text" value={form.address_line_1} onChange={(e) => updateForm("address_line_1", e.target.value)}
                                className="w-full px-4 py-3 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm" placeholder="123 Main St" />
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                            <div>
                                <label className="text-xs font-typewriter text-stone-500 uppercase tracking-widest block mb-2">City</label>
                                <input type="text" value={form.city} onChange={(e) => updateForm("city", e.target.value)}
                                    className="w-full px-4 py-3 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm" placeholder="City" />
                            </div>
                            <div>
                                <label className="text-xs font-typewriter text-stone-500 uppercase tracking-widest block mb-2">State</label>
                                <select value={form.state} onChange={(e) => updateForm("state", e.target.value)}
                                    className="w-full px-4 py-3 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm bg-white">
                                    <option value="">Select...</option>
                                    {STATE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-typewriter text-stone-500 uppercase tracking-widest block mb-2">ZIP</label>
                                <input type="text" value={form.zip_code} onChange={(e) => updateForm("zip_code", e.target.value)}
                                    className="w-full px-4 py-3 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm font-mono" placeholder="ZIP" />
                            </div>
                        </div>
                        <div>
                            <label className="text-xs font-typewriter text-stone-500 uppercase tracking-widest block mb-2">Website</label>
                            <input type="text" value={form.website} onChange={(e) => updateForm("website", e.target.value)}
                                className="w-full px-4 py-3 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm" placeholder="www.example.com" />
                        </div>
                    </div>
                )}

                {/* Step 2: Industry & Certifications */}
                {step === 2 && (
                    <div className="space-y-8 animate-in fade-in duration-300">
                        <div className="flex items-center mb-4">
                            <Target className="w-6 h-6 mr-3 text-stone-400" />
                            <h3 className="font-typewriter font-bold text-xl">Industry & Certifications</h3>
                        </div>

                        <div>
                            <label className="text-xs font-typewriter text-stone-500 uppercase tracking-widest block mb-3">NAICS Codes (select all that apply)</label>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[320px] overflow-y-auto pr-2 custom-scrollbar">
                                {NAICS_OPTIONS.map(n => (
                                    <button type="button" key={n.code} onClick={() => toggleArray("naics_codes", n.code)}
                                        className={clsx(
                                            "flex items-center text-left px-4 py-3 rounded-xl border text-sm transition-all",
                                            form.naics_codes.includes(n.code)
                                                ? "bg-black text-white border-black"
                                                : "bg-white text-stone-700 border-stone-200 hover:border-stone-400"
                                        )}>
                                        <span className="font-mono text-xs mr-2 opacity-70">{n.code}</span>
                                        <span className="font-medium">{n.label}</span>
                                    </button>
                                ))}
                            </div>
                            {form.naics_codes.length > 0 && (
                                <p className="text-xs text-stone-500 mt-2">{form.naics_codes.length} selected</p>
                            )}
                        </div>

                        <div>
                            <label className="text-xs font-typewriter text-stone-500 uppercase tracking-widest block mb-3">SBA Certifications</label>
                            <div className="flex flex-wrap gap-2">
                                {CERT_OPTIONS.map(c => (
                                    <button type="button" key={c.value} onClick={() => toggleArray("sba_certifications", c.value)}
                                        className={clsx(
                                            "px-4 py-2.5 rounded-full border text-xs font-typewriter font-bold uppercase tracking-wider transition-all",
                                            form.sba_certifications.includes(c.value)
                                                ? "bg-black text-white border-black"
                                                : "bg-white text-stone-600 border-stone-200 hover:border-stone-400"
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
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <div className="flex items-center mb-4">
                            <Briefcase className="w-6 h-6 mr-3 text-stone-400" />
                            <h3 className="font-typewriter font-bold text-xl">Capacity & Experience</h3>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-typewriter text-stone-500 uppercase tracking-widest block mb-2">Employee Count</label>
                                <select value={form.employee_count} onChange={(e) => updateForm("employee_count", e.target.value)}
                                    className="w-full px-4 py-3 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm bg-white">
                                    {EMPLOYEE_RANGES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-typewriter text-stone-500 uppercase tracking-widest block mb-2">Annual Revenue</label>
                                <select value={form.revenue} onChange={(e) => updateForm("revenue", e.target.value)}
                                    className="w-full px-4 py-3 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm bg-white">
                                    {REVENUE_RANGES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-typewriter text-stone-500 uppercase tracking-widest block mb-2">Years in Business</label>
                                <input type="number" value={form.years_in_business} onChange={(e) => updateForm("years_in_business", e.target.value)}
                                    className="w-full px-4 py-3 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm" placeholder="e.g. 12" />
                            </div>
                            <div>
                                <label className="text-xs font-typewriter text-stone-500 uppercase tracking-widest block mb-2">Service Radius (miles)</label>
                                <input type="number" value={form.service_radius_miles} onChange={(e) => updateForm("service_radius_miles", e.target.value)}
                                    className="w-full px-4 py-3 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm" placeholder="50" />
                            </div>
                        </div>

                        <div>
                            <label className="text-xs font-typewriter text-stone-500 uppercase tracking-widest block mb-2">Past Federal Awards</label>
                            <input type="number" value={form.federal_awards_count} onChange={(e) => updateForm("federal_awards_count", e.target.value)}
                                className="w-full px-4 py-3 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm" placeholder="Number of past federal contracts (0 if none)" />
                        </div>

                        <div>
                            <label className="text-xs font-typewriter text-stone-500 uppercase tracking-widest block mb-3">Operational Capabilities</label>
                            <div className="flex flex-wrap gap-3">
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
                                    <Building className="w-4 h-4 mr-2" /> Government Experience
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Step 4: Decision Maker Contact */}
                {step === 4 && (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <div className="flex items-center mb-4">
                            <Phone className="w-6 h-6 mr-3 text-stone-400" />
                            <h3 className="font-typewriter font-bold text-xl">Decision Maker</h3>
                        </div>

                        <div className="bg-stone-50 p-6 rounded-2xl border border-stone-100">
                            <p className="text-xs font-typewriter text-stone-500 uppercase tracking-widest mb-4">Primary Contact</p>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs text-stone-500 block mb-1">Full Name</label>
                                    <input type="text" value={form.poc_name} onChange={(e) => updateForm("poc_name", e.target.value)}
                                        className="w-full px-4 py-3 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm font-medium" placeholder="John Smith" />
                                </div>
                                <div>
                                    <label className="text-xs text-stone-500 block mb-1">Title</label>
                                    <input type="text" value={form.poc_title} onChange={(e) => updateForm("poc_title", e.target.value)}
                                        className="w-full px-4 py-3 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm" placeholder="CEO, Owner, VP of BD..." />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4 mt-4">
                                <div>
                                    <label className="text-xs text-stone-500 block mb-1">Phone</label>
                                    <input type="tel" value={form.poc_phone} onChange={(e) => updateForm("poc_phone", e.target.value)}
                                        className="w-full px-4 py-3 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm font-mono" placeholder="(555) 123-4567" />
                                </div>
                                <div>
                                    <label className="text-xs text-stone-500 block mb-1">Email</label>
                                    <input type="email" value={form.poc_email} onChange={(e) => updateForm("poc_email", e.target.value)}
                                        className="w-full px-4 py-3 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm" placeholder="john@company.com" />
                                </div>
                            </div>
                        </div>

                        <div className="bg-stone-50 p-6 rounded-2xl border border-stone-100">
                            <p className="text-xs font-typewriter text-stone-500 uppercase tracking-widest mb-4">Company Contact</p>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs text-stone-500 block mb-1">Main Phone</label>
                                    <input type="tel" value={form.phone} onChange={(e) => updateForm("phone", e.target.value)}
                                        className="w-full px-4 py-3 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm font-mono" placeholder="(555) 000-0000" />
                                </div>
                                <div>
                                    <label className="text-xs text-stone-500 block mb-1">General Email</label>
                                    <input type="email" value={form.email} onChange={(e) => updateForm("email", e.target.value)}
                                        className="w-full px-4 py-3 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm" placeholder="info@company.com" />
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Step 5: Target Preferences */}
                {step === 5 && (
                    <div className="space-y-8 animate-in fade-in duration-300">
                        <div className="flex items-center mb-4">
                            <DollarSign className="w-6 h-6 mr-3 text-stone-400" />
                            <h3 className="font-typewriter font-bold text-xl">Target Preferences</h3>
                        </div>

                        <div>
                            <label className="text-xs font-typewriter text-stone-500 uppercase tracking-widest block mb-3">Contract Types of Interest</label>
                            <div className="flex flex-wrap gap-2">
                                {CONTRACT_TARGETS.map(ct => (
                                    <button type="button" key={ct.value} onClick={() => toggleArray("target_contract_types", ct.value)}
                                        className={clsx(
                                            "px-4 py-2.5 rounded-full border text-xs font-typewriter font-bold transition-all",
                                            form.target_contract_types.includes(ct.value)
                                                ? "bg-black text-white border-black"
                                                : "bg-white text-stone-600 border-stone-200 hover:border-stone-400"
                                        )}>
                                        {form.target_contract_types.includes(ct.value) && <CheckCircle2 className="w-3 h-3 inline mr-1" />}
                                        {ct.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className="text-xs font-typewriter text-stone-500 uppercase tracking-widest block mb-3">Target States (select where they can perform)</label>
                            <div className="flex flex-wrap gap-1.5 max-h-[150px] overflow-y-auto pr-2 custom-scrollbar">
                                {STATE_OPTIONS.map(s => (
                                    <button type="button" key={s} onClick={() => toggleArray("target_states", s)}
                                        className={clsx(
                                            "px-3 py-1.5 rounded-lg border text-xs font-mono font-bold transition-all",
                                            form.target_states.includes(s)
                                                ? "bg-black text-white border-black"
                                                : "bg-white text-stone-600 border-stone-200 hover:border-stone-400"
                                        )}>
                                        {s}
                                    </button>
                                ))}
                            </div>
                            {form.target_states.length > 0 && (
                                <p className="text-xs text-stone-500 mt-2">{form.target_states.length} states selected</p>
                            )}
                        </div>

                        <div>
                            <label className="text-xs font-typewriter text-stone-500 uppercase tracking-widest block mb-2">Additional Notes</label>
                            <textarea value={form.notes} onChange={(e) => updateForm("notes", e.target.value)}
                                className="w-full px-4 py-3 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm h-28 resize-none"
                                placeholder="Any additional context about this client's capabilities, teaming preferences, past performance highlights..." />
                        </div>
                    </div>
                )}

                {/* Navigation Buttons */}
                <div className="flex justify-between mt-8 pt-6 border-t border-stone-100">
                    {step > 1 ? (
                        <button type="button" onClick={() => setStep(s => s - 1)}
                            className="flex items-center px-6 py-3 rounded-full border border-stone-200 text-stone-600 hover:bg-stone-50 font-bold text-sm transition-all">
                            <ArrowLeft className="w-4 h-4 mr-2" /> Previous
                        </button>
                    ) : <div />}

                    {step < totalSteps ? (
                        <button type="button" onClick={() => setStep(s => s + 1)}
                            className="flex items-center px-6 py-3 rounded-full bg-black text-white hover:bg-stone-800 font-bold text-sm transition-all shadow-sm">
                            Next <ArrowRight className="w-4 h-4 ml-2" />
                        </button>
                    ) : (
                        <button type="button" onClick={handleSave} disabled={saving || !form.company_name}
                            className="flex items-center px-8 py-3 rounded-full bg-emerald-600 text-white hover:bg-emerald-700 font-bold text-sm transition-all shadow-lg disabled:opacity-50">
                            {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</> : <><CheckCircle2 className="w-4 h-4 mr-2" /> Save & Onboard</>}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
