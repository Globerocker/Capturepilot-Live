"use client";

import { useEffect, useState, KeyboardEvent } from "react";
import { createBrowserClient } from "@supabase/ssr";
import {
    Settings, Save, Loader2, CheckCircle2, Key, Mail, Building2,
    X, Plus, ChevronDown, ChevronRight, Shield, MapPin,
    DollarSign, Truck, Wrench, User, Lock, BadgeCheck, Globe,
    Phone, Hash, Award, Briefcase, AlertCircle
} from "lucide-react";

const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const US_STATES = [
    "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
    "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
    "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
    "VA","WA","WV","WI","WY","DC","PR","GU","VI","AS"
];

const CERT_OPTIONS = [
    { value: "SDVOSB", label: "SDVOSB (Service-Disabled Veteran-Owned)" },
    { value: "VOSB", label: "VOSB (Veteran-Owned)" },
    { value: "WOSB", label: "WOSB (Women-Owned)" },
    { value: "EDWOSB", label: "EDWOSB (Economically Disadvantaged WOSB)" },
    { value: "8(a)", label: "8(a) Business Development" },
    { value: "HUBZone", label: "HUBZone Certified" },
    { value: "SDB", label: "SDB (Small Disadvantaged Business)" },
    { value: "Small Business", label: "Small Business" },
];

const CONTRACT_TYPE_OPTIONS = [
    { value: "FFP", label: "Firm Fixed Price (FFP)" },
    { value: "T&M", label: "Time & Materials (T&M)" },
    { value: "IDIQ", label: "Indefinite Delivery / Indefinite Quantity (IDIQ)" },
    { value: "GWAC", label: "Government-Wide Acquisition Contract (GWAC)" },
    { value: "BPA", label: "Blanket Purchase Agreement (BPA)" },
];

// --- Reusable Components ---

function SectionCard({ icon: Icon, title, defaultOpen = true, children }: {
    icon: React.ElementType; title: string; defaultOpen?: boolean; children: React.ReactNode;
}) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
            <button type="button" onClick={() => setOpen(!open)}
                className="w-full bg-stone-50 border-b border-stone-100 px-5 py-3.5 flex items-center gap-2.5 hover:bg-stone-100/70 transition-colors">
                <Icon className="w-4 h-4 text-stone-400" />
                <h2 className="font-bold text-sm text-stone-800 flex-1 text-left">{title}</h2>
                {open ? <ChevronDown className="w-4 h-4 text-stone-400" /> : <ChevronRight className="w-4 h-4 text-stone-400" />}
            </button>
            {open && <div className="p-5 space-y-4">{children}</div>}
        </div>
    );
}

function Field({ label, children, span2 = false }: { label: string; children: React.ReactNode; span2?: boolean }) {
    return (
        <div className={span2 ? "sm:col-span-2" : ""}>
            <label className="text-[10px] font-bold text-stone-400 uppercase tracking-wide block mb-1.5">{label}</label>
            {children}
        </div>
    );
}

function BadgeList({ items, onRemove, color = "bg-stone-100 text-stone-700 border border-stone-200" }: {
    items: string[]; onRemove: (item: string) => void; color?: string;
}) {
    if (!items.length) return <p className="text-xs text-stone-400 italic py-1">None added yet</p>;
    return (
        <div className="flex flex-wrap gap-1.5">
            {items.map(item => (
                <span key={item} className={`${color} text-xs font-mono font-bold px-2.5 py-1 rounded-lg inline-flex items-center gap-1.5`}>
                    {item}
                    <button type="button" onClick={() => onRemove(item)}
                        title={`Remove ${item}`}
                        className="hover:text-red-600 transition-colors">
                        <X className="w-3 h-3" />
                    </button>
                </span>
            ))}
        </div>
    );
}

function BadgeInput({ items, setItems, placeholder, validate }: {
    items: string[]; setItems: (items: string[]) => void; placeholder: string;
    validate?: (val: string) => string | null;
}) {
    const [input, setInput] = useState("");

    const addItem = () => {
        const trimmed = input.trim().toUpperCase();
        if (!trimmed) return;
        if (validate) {
            const cleaned = validate(trimmed);
            if (!cleaned) return;
            if (!items.includes(cleaned)) setItems([...items, cleaned]);
        } else {
            if (!items.includes(trimmed)) setItems([...items, trimmed]);
        }
        setInput("");
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") { e.preventDefault(); addItem(); }
    };

    return (
        <div className="flex gap-2">
            <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown}
                placeholder={placeholder}
                className="flex-1 border border-stone-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-black transition-colors" />
            <button type="button" onClick={addItem}
                title="Add"
                className="border border-stone-300 hover:bg-stone-50 rounded-xl px-3 py-2.5 text-sm font-medium inline-flex items-center gap-1 transition-colors text-stone-600">
                <Plus className="w-4 h-4" /> Add
            </button>
        </div>
    );
}

const inputClass = "w-full border border-stone-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-black transition-colors";
const readOnlyClass = "w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm bg-stone-50 text-stone-500 cursor-not-allowed";

function formatDollars(val: number | null): string {
    if (val === null || val === undefined) return "";
    if (val === 0) return "0";
    return val.toLocaleString("en-US");
}

function parseDollars(str: string): number | null {
    const cleaned = str.replace(/[^0-9]/g, "");
    if (!cleaned) return null;
    return parseInt(cleaned, 10);
}

// --- Main Page ---

export default function PortalSettings() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [authEmail, setAuthEmail] = useState("");
    const [accountType, setAccountType] = useState("consulting");
    const [changingPassword, setChangingPassword] = useState(false);
    const [pwSuccess, setPwSuccess] = useState(false);
    const [pwError, setPwError] = useState("");
    const [newPassword, setNewPassword] = useState("");

    // Text/number fields
    const [form, setForm] = useState({
        company_name: "",
        dba_name: "",
        website: "",
        contact_name: "",
        contact_phone: "",
        email: "",
        address_line_1: "",
        city: "",
        state: "",
        zip_code: "",
        employee_count: "" as string,
        years_in_business: "" as string,
        revenue: null as number | null,
        company_description: "",
        contract_value_min: null as number | null,
        contract_value_max: null as number | null,
        prime_or_sub: "both",
        security_clearances: "",
        service_radius_miles: "" as string,
        has_bonding: false,
        has_fleet: false,
        has_municipal_exp: false,
    });

    // Array fields (managed separately for badge UI)
    const [naicsCodes, setNaicsCodes] = useState<string[]>([]);
    const [targetStates, setTargetStates] = useState<string[]>([]);
    const [certifications, setCertifications] = useState<string[]>([]);
    const [contractTypes, setContractTypes] = useState<string[]>([]);
    const [preferredAgencies, setPreferredAgencies] = useState<string[]>([]);

    const set = (key: string, value: any) => setForm(f => ({ ...f, [key]: value }));

    useEffect(() => {
        (async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            setAuthEmail(user.email || "");

            const { data } = await supabase
                .from("user_profiles")
                .select("*")
                .eq("auth_user_id", user.id)
                .single();

            if (data) {
                setForm({
                    company_name: data.company_name || "",
                    dba_name: data.dba_name || "",
                    website: data.website || "",
                    contact_name: data.contact_name || "",
                    contact_phone: data.contact_phone || data.phone || "",
                    email: data.email || user.email || "",
                    address_line_1: data.address_line_1 || "",
                    city: data.city || "",
                    state: data.state || "",
                    zip_code: data.zip_code || "",
                    employee_count: data.employee_count ? String(data.employee_count) : "",
                    years_in_business: data.years_in_business ? String(data.years_in_business) : "",
                    revenue: data.revenue ?? null,
                    company_description: data.company_description || "",
                    contract_value_min: data.contract_value_min ?? null,
                    contract_value_max: data.contract_value_max ?? null,
                    prime_or_sub: data.prime_or_sub || "both",
                    security_clearances: data.security_clearances || "",
                    service_radius_miles: data.service_radius_miles ? String(data.service_radius_miles) : "",
                    has_bonding: data.has_bonding ?? false,
                    has_fleet: data.has_fleet ?? false,
                    has_municipal_exp: data.has_municipal_exp ?? false,
                });
                setNaicsCodes((data.naics_codes || []) as string[]);
                setTargetStates((data.target_states || []) as string[]);
                setCertifications((data.sba_certifications || []) as string[]);
                setContractTypes((data.target_contract_types || []) as string[]);
                setPreferredAgencies((data.preferred_agencies || []) as string[]);
                setAccountType(data.account_type || "consulting");
            }
            setLoading(false);
        })();
    }, []);

    const handleSave = async () => {
        setSaving(true);
        setSaved(false);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const payload = {
            company_name: form.company_name,
            dba_name: form.dba_name,
            website: form.website,
            contact_name: form.contact_name,
            contact_phone: form.contact_phone,
            email: form.email,
            address_line_1: form.address_line_1,
            city: form.city,
            state: form.state,
            zip_code: form.zip_code,
            employee_count: form.employee_count ? parseInt(form.employee_count) : null,
            years_in_business: form.years_in_business ? parseInt(form.years_in_business) : null,
            revenue: form.revenue,
            company_description: form.company_description,
            contract_value_min: form.contract_value_min,
            contract_value_max: form.contract_value_max,
            prime_or_sub: form.prime_or_sub,
            security_clearances: form.security_clearances,
            service_radius_miles: form.service_radius_miles ? parseInt(form.service_radius_miles) : null,
            has_bonding: form.has_bonding,
            has_fleet: form.has_fleet,
            has_municipal_exp: form.has_municipal_exp,
            naics_codes: naicsCodes,
            target_states: targetStates,
            sba_certifications: certifications,
            target_contract_types: contractTypes,
            preferred_agencies: preferredAgencies,
        };

        await supabase.from("user_profiles").update(payload).eq("auth_user_id", user.id);

        setSaving(false);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
    };

    const handlePasswordChange = async () => {
        if (newPassword.length < 8) { setPwError("Password must be at least 8 characters"); return; }
        setChangingPassword(true);
        setPwError("");
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (error) { setPwError(error.message); }
        else { setPwSuccess(true); setNewPassword(""); setTimeout(() => setPwSuccess(false), 3000); }
        setChangingPassword(false);
    };

    const toggleCert = (value: string) => {
        if (certifications.includes(value)) setCertifications(c => c.filter(v => v !== value));
        else setCertifications(c => [...c, value]);
    };

    const toggleContractType = (value: string) => {
        if (contractTypes.includes(value)) setContractTypes(c => c.filter(v => v !== value));
        else setContractTypes(c => [...c, value]);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-6 h-6 text-stone-400 animate-spin" />
            </div>
        );
    }

    return (
        <div className="max-w-3xl space-y-5 pb-12">
            {/* Header + Top Save */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <h1 className="text-2xl font-bold text-black flex items-center gap-2">
                    <Settings className="w-6 h-6" /> Account Settings
                </h1>
                <button type="button" onClick={handleSave} disabled={saving}
                    className="bg-black text-white px-5 py-2.5 rounded-xl text-sm font-bold inline-flex items-center gap-2 disabled:opacity-50 hover:bg-stone-800 transition-colors shadow-sm">
                    {saved ? <><CheckCircle2 className="w-4 h-4 text-emerald-400" /> Saved!</>
                        : saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
                        : <><Save className="w-4 h-4" /> Save Changes</>}
                </button>
            </div>

            {/* ===== Section 1: Company Information ===== */}
            <SectionCard icon={Building2} title="Company Information">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Company Name">
                        <input value={form.company_name} onChange={e => set("company_name", e.target.value)}
                            className={inputClass} placeholder="Legal company name" />
                    </Field>
                    <Field label="DBA Name">
                        <input value={form.dba_name} onChange={e => set("dba_name", e.target.value)}
                            className={inputClass} placeholder="Doing Business As (if different)" />
                    </Field>
                    <Field label="Website">
                        <div className="relative">
                            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                            <input value={form.website} onChange={e => set("website", e.target.value)}
                                className={`${inputClass} pl-9`} placeholder="https://example.com" />
                        </div>
                    </Field>
                    <Field label="Contact Name">
                        <input value={form.contact_name} onChange={e => set("contact_name", e.target.value)}
                            className={inputClass} placeholder="Primary contact" />
                    </Field>
                    <Field label="Contact Phone">
                        <div className="relative">
                            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                            <input value={form.contact_phone} onChange={e => set("contact_phone", e.target.value)}
                                className={`${inputClass} pl-9`} placeholder="(555) 123-4567" />
                        </div>
                    </Field>
                    <Field label="Contact Email">
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                            <input value={form.email} onChange={e => set("email", e.target.value)}
                                className={`${inputClass} pl-9`} placeholder="contact@company.com" />
                        </div>
                    </Field>
                    <Field label="Street Address" span2>
                        <input value={form.address_line_1} onChange={e => set("address_line_1", e.target.value)}
                            className={inputClass} placeholder="123 Main Street, Suite 100" />
                    </Field>
                    <Field label="City">
                        <input value={form.city} onChange={e => set("city", e.target.value)} className={inputClass} placeholder="City" />
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="State">
                            <select value={form.state} onChange={e => set("state", e.target.value)}
                                aria-label="State" className={inputClass}>
                                <option value="">--</option>
                                {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </Field>
                        <Field label="Zip Code">
                            <input value={form.zip_code} onChange={e => set("zip_code", e.target.value)}
                                className={inputClass} maxLength={10} placeholder="12345" />
                        </Field>
                    </div>
                    <Field label="Employee Count">
                        <input type="number" value={form.employee_count}
                            onChange={e => set("employee_count", e.target.value)}
                            className={inputClass} min={0} placeholder="e.g. 25" />
                    </Field>
                    <Field label="Years in Business">
                        <input type="number" value={form.years_in_business}
                            onChange={e => set("years_in_business", e.target.value)}
                            className={inputClass} min={0} placeholder="e.g. 10" />
                    </Field>
                    <Field label="Annual Revenue ($)" span2>
                        <div className="relative max-w-sm">
                            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                            <input value={formatDollars(form.revenue)}
                                onChange={e => set("revenue", parseDollars(e.target.value))}
                                className={`${inputClass} pl-9`} placeholder="e.g. 2,500,000" />
                        </div>
                    </Field>
                    <Field label="Company Description" span2>
                        <textarea value={form.company_description} onChange={e => set("company_description", e.target.value)}
                            rows={4} className={`${inputClass} resize-none`}
                            placeholder="Brief description of your company, core capabilities, and differentiators. Used for matching and capability statements..." />
                    </Field>
                </div>
            </SectionCard>

            {/* ===== Section 2: NAICS Codes ===== */}
            <SectionCard icon={Hash} title="NAICS Codes">
                <p className="text-xs text-stone-500 -mt-1">
                    Your NAICS codes determine which federal opportunities match your profile. Add all codes you can compete under.
                    Changes take effect at the next match refresh.
                </p>
                <BadgeList items={naicsCodes}
                    onRemove={code => setNaicsCodes(prev => prev.filter(c => c !== code))}
                    color="bg-blue-50 text-blue-700 border border-blue-200" />
                <BadgeInput items={naicsCodes} setItems={setNaicsCodes}
                    placeholder="Type NAICS code (e.g. 561720) and press Enter"
                    validate={val => /^\d{2,6}$/.test(val) ? val : null} />
                {naicsCodes.length === 0 && (
                    <p className="text-xs text-amber-600 flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                        No NAICS codes set &mdash; you will not receive targeted opportunity matches.
                    </p>
                )}
            </SectionCard>

            {/* ===== Section 3: Target States ===== */}
            <SectionCard icon={MapPin} title="Target States">
                <p className="text-xs text-stone-500 -mt-1">
                    States where you want to find and compete for federal opportunities. Leave empty to match nationwide.
                </p>
                <BadgeList items={targetStates}
                    onRemove={st => setTargetStates(prev => prev.filter(s => s !== st))}
                    color="bg-emerald-50 text-emerald-700 border border-emerald-200" />
                <select
                    value=""
                    aria-label="Add target state"
                    onChange={e => {
                        const val = e.target.value;
                        if (val && !targetStates.includes(val)) setTargetStates(prev => [...prev, val]);
                    }}
                    className={inputClass}>
                    <option value="" disabled>Select a state to add...</option>
                    {US_STATES.filter(s => !targetStates.includes(s)).map(s => (
                        <option key={s} value={s}>{s}</option>
                    ))}
                </select>
            </SectionCard>

            {/* ===== Section 4: Certifications & Set-Asides ===== */}
            <SectionCard icon={Award} title="Certifications & Set-Asides">
                <p className="text-xs text-stone-500 -mt-1">
                    Check all certifications your company currently holds. These affect opportunity matching, scoring, and which set-aside contracts you are eligible for.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {CERT_OPTIONS.map(cert => (
                        <label key={cert.value}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-all ${
                                certifications.includes(cert.value)
                                    ? "bg-amber-50 border-amber-300 text-amber-900 shadow-sm"
                                    : "bg-white border-stone-200 hover:bg-stone-50 text-stone-700"
                            }`}>
                            <input type="checkbox" checked={certifications.includes(cert.value)}
                                onChange={() => toggleCert(cert.value)}
                                className="rounded accent-black w-4 h-4 flex-shrink-0" />
                            <span className="text-sm font-medium">{cert.label}</span>
                        </label>
                    ))}
                </div>
            </SectionCard>

            {/* ===== Section 5: Contract Preferences ===== */}
            <SectionCard icon={Briefcase} title="Contract Preferences">
                <div className="space-y-5">
                    {/* Target Contract Types */}
                    <div>
                        <label className="text-[10px] font-bold text-stone-400 uppercase tracking-wide block mb-2">Target Contract Types</label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {CONTRACT_TYPE_OPTIONS.map(ct => (
                                <label key={ct.value}
                                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-all ${
                                        contractTypes.includes(ct.value)
                                            ? "bg-violet-50 border-violet-300 text-violet-900 shadow-sm"
                                            : "bg-white border-stone-200 hover:bg-stone-50 text-stone-700"
                                    }`}>
                                    <input type="checkbox" checked={contractTypes.includes(ct.value)}
                                        onChange={() => toggleContractType(ct.value)}
                                        className="rounded accent-black w-4 h-4 flex-shrink-0" />
                                    <span className="text-sm font-medium">{ct.label}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* Contract Value Range */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Field label="Min Contract Value ($)">
                            <div className="relative">
                                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                                <input value={formatDollars(form.contract_value_min)}
                                    onChange={e => set("contract_value_min", parseDollars(e.target.value))}
                                    className={`${inputClass} pl-9`} placeholder="e.g. 50,000" />
                            </div>
                        </Field>
                        <Field label="Max Contract Value ($)">
                            <div className="relative">
                                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                                <input value={formatDollars(form.contract_value_max)}
                                    onChange={e => set("contract_value_max", parseDollars(e.target.value))}
                                    className={`${inputClass} pl-9`} placeholder="e.g. 5,000,000" />
                            </div>
                        </Field>
                    </div>

                    {/* Preferred Agencies */}
                    <div>
                        <label className="text-[10px] font-bold text-stone-400 uppercase tracking-wide block mb-2">Preferred Agencies</label>
                        <BadgeList items={preferredAgencies}
                            onRemove={a => setPreferredAgencies(prev => prev.filter(ag => ag !== a))}
                            color="bg-stone-100 text-stone-700 border border-stone-200" />
                        <div className="mt-2">
                            <BadgeInput items={preferredAgencies} setItems={setPreferredAgencies}
                                placeholder="Type agency abbreviation (e.g. VA, DOD, GSA) and press Enter" />
                        </div>
                    </div>

                    {/* Prime or Sub */}
                    <div>
                        <label className="text-[10px] font-bold text-stone-400 uppercase tracking-wide block mb-2">Prime or Subcontractor</label>
                        <div className="flex gap-2 flex-wrap">
                            {[
                                { value: "prime", label: "Prime Only" },
                                { value: "sub", label: "Sub Only" },
                                { value: "both", label: "Both" },
                            ].map(opt => (
                                <label key={opt.value}
                                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border cursor-pointer transition-all text-sm font-medium ${
                                        form.prime_or_sub === opt.value
                                            ? "bg-black text-white border-black shadow-sm"
                                            : "bg-white border-stone-200 hover:bg-stone-50 text-stone-700"
                                    }`}>
                                    <input type="radio" name="prime_or_sub" value={opt.value}
                                        checked={form.prime_or_sub === opt.value}
                                        onChange={() => set("prime_or_sub", opt.value)}
                                        className="sr-only" />
                                    {opt.label}
                                </label>
                            ))}
                        </div>
                    </div>
                </div>
            </SectionCard>

            {/* ===== Section 6: Bonding & Capabilities ===== */}
            <SectionCard icon={Wrench} title="Bonding & Capabilities" defaultOpen={false}>
                <div className="space-y-5">
                    {/* Toggle switches */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {([
                            { key: "has_bonding" as const, label: "Has Bonding", icon: Shield },
                            { key: "has_fleet" as const, label: "Has Fleet", icon: Truck },
                            { key: "has_municipal_exp" as const, label: "Municipal Experience", icon: Building2 },
                        ]).map(toggle => (
                            <button key={toggle.key} type="button"
                                onClick={() => set(toggle.key, !form[toggle.key])}
                                className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left ${
                                    form[toggle.key]
                                        ? "bg-emerald-50 border-emerald-300 text-emerald-800 shadow-sm"
                                        : "bg-white border-stone-200 hover:bg-stone-50 text-stone-500"
                                }`}>
                                <div className={`w-9 h-5 rounded-full relative transition-colors flex-shrink-0 ${
                                    form[toggle.key] ? "bg-emerald-500" : "bg-stone-300"
                                }`}>
                                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                                        form[toggle.key] ? "left-[18px]" : "left-0.5"
                                    }`} />
                                </div>
                                <span className="text-sm font-medium">{toggle.label}</span>
                            </button>
                        ))}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Field label="Security Clearances">
                            <input value={form.security_clearances}
                                onChange={e => set("security_clearances", e.target.value)}
                                className={inputClass} placeholder="e.g. Secret, Top Secret, Public Trust" />
                        </Field>
                        <Field label="Service Radius (miles)">
                            <input type="number" value={form.service_radius_miles}
                                onChange={e => set("service_radius_miles", e.target.value)}
                                className={inputClass} min={0} placeholder="e.g. 250" />
                        </Field>
                    </div>
                </div>
            </SectionCard>

            {/* ===== Section 7: Account ===== */}
            <SectionCard icon={User} title="Account">
                <div className="space-y-5">
                    {/* Read-only account info */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Field label="Login Email">
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-300" />
                                <input value={authEmail} readOnly className={`${readOnlyClass} pl-9`} />
                            </div>
                        </Field>
                        <Field label="Account Type">
                            <div className="flex items-center gap-2 h-[42px]">
                                <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold ${
                                    accountType === "admin" ? "bg-red-100 text-red-800 border border-red-200"
                                    : accountType === "consulting" ? "bg-blue-100 text-blue-800 border border-blue-200"
                                    : accountType === "self_service" ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                                    : "bg-stone-100 text-stone-700 border border-stone-200"
                                }`}>
                                    <BadgeCheck className="w-3.5 h-3.5" />
                                    {accountType === "self_service" ? "Pro"
                                        : accountType === "consulting" ? "Consulting"
                                        : accountType === "admin" ? "Admin"
                                        : accountType.charAt(0).toUpperCase() + accountType.slice(1)}
                                </span>
                            </div>
                        </Field>
                    </div>

                    {/* Google Login */}
                    <div className="border-t border-stone-100 pt-4">
                        <label className="text-[10px] font-bold text-stone-400 uppercase tracking-wide block mb-2">Quick Login</label>
                        <p className="text-xs text-stone-500 mb-3">Link your Google account for one-click login. You can still use your email and password.</p>
                        <button type="button"
                            onClick={async () => {
                                await supabase.auth.linkIdentity({ provider: "google", options: { redirectTo: window.location.origin + "/portal/settings" } });
                            }}
                            className="inline-flex items-center gap-2 bg-white border-2 border-stone-200 hover:border-stone-300 px-4 py-2.5 rounded-xl text-sm font-bold transition-colors">
                            <svg className="w-4 h-4" viewBox="0 0 24 24">
                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                            </svg>
                            Connect Google Account
                        </button>
                    </div>

                    {/* Password Change */}
                    <div className="border-t border-stone-100 pt-4">
                        <label className="text-[10px] font-bold text-stone-400 uppercase tracking-wide block mb-2">Change Password</label>
                        <div className="flex gap-2 max-w-md">
                            <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                                placeholder="New password (min 8 characters)"
                                className={`${inputClass} flex-1`} />
                            <button type="button" onClick={handlePasswordChange}
                                disabled={changingPassword || !newPassword}
                                className="bg-stone-800 text-white px-4 py-2.5 rounded-xl text-sm font-bold inline-flex items-center gap-1.5 disabled:opacity-50 hover:bg-black transition-colors whitespace-nowrap">
                                {changingPassword
                                    ? <Loader2 className="w-4 h-4 animate-spin" />
                                    : <Key className="w-3.5 h-3.5" />}
                                Update
                            </button>
                        </div>
                        {pwError && <p className="text-xs text-red-600 mt-2">{pwError}</p>}
                        {pwSuccess && (
                            <p className="text-xs text-emerald-600 mt-2 flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Password updated successfully!
                            </p>
                        )}
                    </div>

                    {/* Email Notifications */}
                    <div className="border-t border-stone-100 pt-4">
                        <label className="text-[10px] font-bold text-stone-400 uppercase tracking-wide block mb-3">Email Notifications</label>
                        <div className="space-y-2.5">
                            {[
                                "Email me when new tasks are assigned",
                                "Email me when new opportunities match my profile",
                                "Weekly opportunity summary email",
                                "Email me when a deadline is approaching (7 days)",
                            ].map(label => (
                                <label key={label} className="flex items-center gap-3 text-sm cursor-pointer py-0.5">
                                    <input type="checkbox" defaultChecked className="rounded accent-black w-4 h-4" />
                                    <span className="text-stone-700">{label}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                </div>
            </SectionCard>

            {/* Bottom Sticky Save Bar */}
            <div className="sticky bottom-4 flex justify-end pt-2">
                <button type="button" onClick={handleSave} disabled={saving}
                    className="bg-black text-white px-6 py-3 rounded-2xl text-sm font-bold inline-flex items-center gap-2 disabled:opacity-50 hover:bg-stone-800 transition-colors shadow-lg shadow-black/20">
                    {saved ? <><CheckCircle2 className="w-4 h-4 text-emerald-400" /> All Changes Saved</>
                        : saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
                        : <><Save className="w-4 h-4" /> Save All Changes</>}
                </button>
            </div>
        </div>
    );
}
