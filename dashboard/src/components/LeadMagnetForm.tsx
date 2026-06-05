"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { Mail, MapPin, CheckCircle2, Loader2, Pencil, Search, Plus, Phone, Users, DollarSign, Calendar, Sparkles, User, Linkedin } from "lucide-react";
import clsx from "clsx";
import { NAICS_CODES } from "@/lib/naics-codes";
import { createSupabaseClient } from "@/lib/supabase/client";

/**
 * LinkedIn OAuth prefill payload — populated by the parent /check page when
 * the user returns from the LinkedIn OAuth round-trip (?linkedin=1). Wins
 * over manual form state and auto-submits once present.
 */
export interface LinkedInPrefill {
    first_name?: string;
    last_name?: string;
    email?: string;
    /** Full https://www.linkedin.com/in/<handle> URL when available */
    linkedin_url?: string;
    linkedin_headline?: string;
    linkedin_picture_url?: string;
    linkedin_locale?: string;
    linkedin_email_verified?: boolean;
}

const US_STATES = [
    "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
    "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
    "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
    "VA","WA","WV","WI","WY","DC","PR","GU","VI",
];

const SBA_CERTS = [
    { key: "8(a)", label: "8(a)" },
    { key: "HUBZone", label: "HUBZone" },
    { key: "SDVOSB", label: "SDVOSB" },
    { key: "WOSB", label: "WOSB" },
    { key: "EDWOSB", label: "EDWOSB" },
    { key: "VOSB", label: "VOSB" },
    { key: "SDB", label: "SDB" },
];

const REVENUE_BANDS: { key: string; label: string }[] = [
    { key: "under_1m", label: "Under $1M" },
    { key: "1m_5m", label: "$1M – $5M" },
    { key: "5m_25m", label: "$5M – $25M" },
    { key: "25m_plus", label: "$25M+" },
    { key: "prefer_not_to_say", label: "Prefer not to say" },
];

interface LeadMagnetFormProps {
    analysisId: string;
    inferredProfile: Record<string, unknown>;
    inferredNaics: { code: string; label: string; confidence: number }[];
    crawlerConfidence?: number;
    onUpdate?: (data: {
        updated_matches: unknown[];
        cert_recommendations: unknown[];
        easy_wins: unknown[];
        total_matches: number;
    }) => void;
    /** When true, treat email + phone as required and re-label CTA as "Send My Full Report". */
    requireContact?: boolean;
    /**
     * Verified identity payload sourced from LinkedIn OAuth. When supplied,
     * the form auto-submits on first render — phone validation is relaxed
     * because LinkedIn doesn't expose phone numbers and we want to honor
     * the "verified-data shortcut" promise. Manual entry still works when
     * this is undefined.
     */
    linkedinPrefill?: LinkedInPrefill | null;
}

export function LeadMagnetForm({ analysisId, inferredProfile, inferredNaics, crawlerConfidence, onUpdate, requireContact = true, linkedinPrefill = null }: LeadMagnetFormProps) {
    // Never auto-collapse when contact info is required — we need the user to actively submit.
    const autoConfirmed = !requireContact && (crawlerConfidence ?? 0) >= 0.6 && inferredNaics.length > 0;
    const [collapsed, setCollapsed] = useState(autoConfirmed);
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [error, setError] = useState("");
    const [naicsSearch, setNaicsSearch] = useState("");
    const [showNaicsPicker, setShowNaicsPicker] = useState(inferredNaics.length === 0);

    // Pre-fill from inferred profile
    const contactPerson = (inferredProfile.contact_person || {}) as Record<string, unknown>;
    const initialPhone = (contactPerson.mobile_phone as string)
        || (contactPerson.direct_phone as string)
        || (contactPerson.phone as string)
        || (inferredProfile.phone as string)
        || "";
    const initialName = (contactPerson.name as string) || "";
    // Split inferred name into first/last for the gated contact block.
    const nameParts = initialName.trim().split(/\s+/).filter(Boolean);
    const initialFirstName = nameParts.length > 0 ? nameParts[0] : "";
    const initialLastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "";
    const initialEmployees = (inferredProfile.employee_count as number) || null;
    const initialYears = (inferredProfile.years_in_business as number) || null;

    const [companyName, setCompanyName] = useState(
        (inferredProfile.company_name as string) || ""
    );
    const [state, setState] = useState(
        (inferredProfile.state as string) || ""
    );
    const [email, setEmail] = useState(
        linkedinPrefill?.email || (contactPerson.email as string) || (inferredProfile.email as string) || ""
    );
    const [phone, setPhone] = useState(initialPhone);
    const [firstName, setFirstName] = useState(linkedinPrefill?.first_name || initialFirstName);
    const [lastName, setLastName] = useState(linkedinPrefill?.last_name || initialLastName);
    const [linkedinLoading, setLinkedinLoading] = useState(false);
    const [employeeCount, setEmployeeCount] = useState<string>(initialEmployees ? String(initialEmployees) : "");
    const [yearsInBusiness, setYearsInBusiness] = useState<string>(initialYears ? String(initialYears) : "");
    const [revenueBand, setRevenueBand] = useState<string>("");
    const [selectedNaics, setSelectedNaics] = useState<string[]>(
        (inferredProfile.naics_codes as string[]) || inferredNaics.map(n => n.code)
    );
    const [selectedCerts, setSelectedCerts] = useState<string[]>(
        (inferredProfile.sba_certifications as string[]) || []
    );

    // Build the full list of NAICS options: inferred first, then browsable catalog
    const inferredCodes = new Set(inferredNaics.map(n => n.code));

    // Filtered NAICS for the picker (search or popular)
    const filteredNaics = useMemo(() => {
        const q = naicsSearch.trim().toLowerCase();
        if (!q) {
            // Show popular codes not already in inferred list
            return NAICS_CODES.filter(n => n.popular && !inferredCodes.has(n.code) && !selectedNaics.includes(n.code));
        }
        return NAICS_CODES.filter(n =>
            !inferredCodes.has(n.code) &&
            !selectedNaics.includes(n.code) &&
            (n.code.includes(q) || n.label.toLowerCase().includes(q))
        );
    }, [naicsSearch, inferredCodes, selectedNaics]);

    function toggleNaics(code: string) {
        setSelectedNaics(prev =>
            prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
        );
    }

    function addNaics(code: string) {
        setSelectedNaics(prev => prev.includes(code) ? prev : [...prev, code]);
        setNaicsSearch("");
    }

    function toggleCert(key: string) {
        setSelectedCerts(prev =>
            prev.includes(key) ? prev.filter(c => c !== key) : [...prev, key]
        );
    }

    async function handleLinkedInLogin() {
        setLinkedinLoading(true);
        setError("");
        try {
            const sb = createSupabaseClient();
            // We round-trip through /auth/callback so PKCE code exchange
            // happens server-side, then bounce back to the check page with
            // ?linkedin=1 so the parent can pick the verified payload off
            // the supabase session.
            const redirectTo = `${window.location.origin}/auth/callback?intent=lead_prefill&analysis_id=${encodeURIComponent(analysisId)}`;
            const { error: oauthError } = await sb.auth.signInWithOAuth({
                provider: "linkedin_oidc",
                options: {
                    redirectTo,
                    scopes: "openid profile email",
                },
            });
            if (oauthError) {
                setError(oauthError.message || "LinkedIn sign-in failed");
                setLinkedinLoading(false);
            }
            // On success the browser navigates away; no further state to set.
        } catch (e) {
            setError((e as Error).message || "LinkedIn sign-in failed");
            setLinkedinLoading(false);
        }
    }

    async function handleSubmit(overrides?: { linkedin?: LinkedInPrefill | null }) {
        // When the LinkedIn auto-submit fires immediately after the OAuth
        // round-trip, React state may not have flushed yet (setFirstName
        // setEmail etc. were queued in the parent's effect). Use the
        // explicit overrides payload as the source of truth in that case.
        const li = overrides?.linkedin || null;
        const effectiveFirstName = (li?.first_name || firstName).trim();
        const effectiveLastName = (li?.last_name || lastName).trim();
        const effectiveEmail = (li?.email || email).trim();
        const effectivePhone = phone.trim();

        // Inline validation so the LinkedIn auto-submit doesn't get blocked
        // by stale form-state in the regular validate() helper.
        if (selectedNaics.length === 0) { setError("Select at least one NAICS code"); return; }
        if (!companyName.trim()) { setError("Enter your company name"); return; }
        if (requireContact) {
            if (!effectiveFirstName) { setError("Enter your first name"); return; }
            if (!effectiveLastName) { setError("Enter your last name"); return; }
            if (!effectiveEmail) { setError("Enter your email — we'll send your full report there"); return; }
            if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(effectiveEmail)) { setError("That email doesn't look right"); return; }
            if (effectiveEmail.length > 100) { setError("That email is too long — please double-check"); return; }
            if ((effectiveEmail.match(/@/g) || []).length !== 1) { setError("That email doesn't look right"); return; }
            // Phone required only when there's no LinkedIn-verified identity.
            if (!li && !linkedinPrefill) {
                if (!effectivePhone) { setError("Enter a phone number so we can verify your report"); return; }
                const cleanPhone = effectivePhone.replace(/\D/g, "");
                if (cleanPhone.length < 7) { setError("That phone number looks too short — include area code"); return; }
            }
        }

        setSubmitting(true);
        setError("");

        const linkedinPayload = li || linkedinPrefill;

        try {
            const res = await fetch("/api/lead-magnet/confirm", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    analysis_id: analysisId,
                    email: effectiveEmail || undefined,
                    phone: effectivePhone || undefined,
                    first_name: effectiveFirstName || undefined,
                    last_name: effectiveLastName || undefined,
                    contact_name: [effectiveFirstName, effectiveLastName].filter(Boolean).join(" ") || undefined,
                    company_name: companyName.trim(),
                    state,
                    naics_codes: selectedNaics,
                    sba_certifications: selectedCerts,
                    employee_count: employeeCount ? Number(employeeCount) : undefined,
                    years_in_business: yearsInBusiness ? Number(yearsInBusiness) : undefined,
                    annual_revenue_band: revenueBand || undefined,
                    // LinkedIn-verified identity fields (optional)
                    linkedin_url: linkedinPayload?.linkedin_url || undefined,
                    linkedin_headline: linkedinPayload?.linkedin_headline || undefined,
                    linkedin_picture_url: linkedinPayload?.linkedin_picture_url || undefined,
                    linkedin_locale: linkedinPayload?.linkedin_locale || undefined,
                    linkedin_email_verified: linkedinPayload?.linkedin_email_verified ?? undefined,
                    linkedin_verified: linkedinPayload ? true : undefined,
                }),
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || "Failed to update");
            }

            const data = await res.json();
            setSubmitted(true);
            onUpdate?.(data);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setSubmitting(false);
        }
    }

    // Auto-submit once when LinkedIn prefill arrives. We guard with a ref so
    // a state-driven re-render (e.g. submitting flag flipping) doesn't kick
    // off a second POST.
    const autoSubmittedRef = useRef(false);
    useEffect(() => {
        if (!linkedinPrefill) return;
        if (autoSubmittedRef.current) return;
        if (submitted || submitting) return;
        // Must have at least an email (LinkedIn always returns it when the
        // user grants the email scope) and a company name picked up by the
        // crawler / form prefill. Without company_name the API rejects the
        // payload, so fall back to letting the user click submit themselves.
        if (!linkedinPrefill.email) return;
        if (!companyName.trim()) return;
        autoSubmittedRef.current = true;
        void handleSubmit({ linkedin: linkedinPrefill });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [linkedinPrefill, companyName]);

    // Get label for a NAICS code
    function naicsLabel(code: string): string {
        const inferred = inferredNaics.find(n => n.code === code);
        if (inferred) return inferred.label;
        const fromList = NAICS_CODES.find(n => n.code === code);
        return fromList?.label || code;
    }

    if (submitted) {
        return (
            <div className="bg-emerald-50 border border-emerald-200 rounded-[28px] p-5 sm:p-6 flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6 text-emerald-500 flex-shrink-0" />
                <div>
                    <p className="font-bold text-sm text-emerald-800">Matches Refreshed</p>
                    <p className="text-xs text-emerald-600">Results updated with your confirmed profile.</p>
                </div>
            </div>
        );
    }

    // Collapsed state: show summary of what was detected + edit button
    if (collapsed) {
        return (
            <div className="bg-emerald-50 border border-emerald-200 rounded-[28px] overflow-hidden">
                <div className="px-5 sm:px-8 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <h2 className="font-bold text-sm text-emerald-800">
                            Profile Auto-Detected
                        </h2>
                    </div>
                    <button
                        type="button"
                        onClick={() => setCollapsed(false)}
                        className="text-xs font-bold text-emerald-700 hover:text-emerald-900 flex items-center gap-1 bg-emerald-100 px-3 py-1.5 rounded-lg border border-emerald-200 hover:bg-emerald-200 transition-colors"
                    >
                        <Pencil className="w-3 h-3" /> Edit & Re-Match
                    </button>
                </div>
                <div className="px-5 sm:px-8 pb-4">
                    <div className="flex flex-wrap gap-2 text-xs">
                        {companyName && (
                            <span className="bg-white border border-emerald-200 px-2.5 py-1 rounded-lg text-emerald-700 font-medium">{companyName}</span>
                        )}
                        {state && (
                            <span className="bg-white border border-emerald-200 px-2.5 py-1 rounded-lg text-emerald-700 font-medium">
                                <MapPin className="w-3 h-3 inline mr-0.5" />{state}
                            </span>
                        )}
                        {selectedNaics.map(code => (
                            <span key={code} className="bg-white border border-emerald-200 px-2.5 py-1 rounded-lg text-emerald-700 font-mono font-bold">{code}</span>
                        ))}
                        {selectedCerts.map(cert => (
                            <span key={cert} className="bg-white border border-emerald-200 px-2.5 py-1 rounded-lg text-emerald-700 font-bold">{cert}</span>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-[28px] border-2 border-emerald-200 shadow-lg overflow-hidden">
            <div className="bg-gradient-to-br from-emerald-50 via-blue-50 to-emerald-50 border-b border-emerald-100 px-5 sm:px-8 py-5">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="font-bold text-base sm:text-lg flex items-center text-emerald-900">
                            <Sparkles className="w-4 h-4 mr-2 text-emerald-500" />
                            {requireContact ? "Get Your Full Report" : "Review & Refine"}
                        </h2>
                        <p className="text-xs text-emerald-800/80 mt-0.5">
                            {requireContact
                                ? "Confirm what we detected and we'll email your full readiness report, all matches and a $70 Federal Launch Kit offer."
                                : "Correct NAICS codes and state for better matches."}
                        </p>
                    </div>
                    {autoConfirmed && (
                        <button
                            type="button"
                            onClick={() => setCollapsed(true)}
                            className="text-xs text-emerald-700 hover:text-emerald-900 flex items-center gap-1"
                        >
                            Collapse
                        </button>
                    )}
                </div>
            </div>

            <div className="p-5 sm:p-8 space-y-4">
                {/* Row 1: Company Name + State side by side */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                        <label className="block text-xs font-bold text-stone-500 uppercase tracking-widest mb-1.5">
                            Company Name
                        </label>
                        <input
                            type="text"
                            value={companyName}
                            onChange={(e) => setCompanyName(e.target.value)}
                            placeholder="Acme Corp"
                            className="w-full px-4 py-2.5 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-stone-400"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-stone-500 uppercase tracking-widest mb-1.5">
                            <MapPin className="w-3 h-3 inline mr-1" /> State
                        </label>
                        <select
                            value={state}
                            onChange={(e) => setState(e.target.value)}
                            aria-label="State"
                            className="w-full px-4 py-2.5 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-stone-400 bg-white"
                        >
                            <option value="">Select...</option>
                            {US_STATES.map(s => (
                                <option key={s} value={s}>{s}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* NAICS Codes — the key field */}
                <div>
                    <label className="block text-xs font-bold text-stone-500 uppercase tracking-widest mb-1.5">
                        Industry Codes (NAICS) — select all that apply
                    </label>

                    {/* Selected NAICS chips (always visible) */}
                    {selectedNaics.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-3">
                            {selectedNaics.map(code => {
                                const inf = inferredNaics.find(n => n.code === code);
                                return (
                                    <button
                                        key={code}
                                        type="button"
                                        onClick={() => toggleNaics(code)}
                                        className="flex items-center gap-1.5 bg-blue-50 text-blue-800 border border-blue-200 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors group"
                                        title={`Click to remove ${code}`}
                                    >
                                        <span className="font-mono">{code}</span>
                                        <span className="text-blue-600 group-hover:text-red-500">{naicsLabel(code)}</span>
                                        {inf && (
                                            <span className={clsx(
                                                "text-[10px] px-1 py-0.5 rounded ml-0.5",
                                                inf.confidence >= 0.7 ? "text-emerald-600 bg-emerald-50" :
                                                inf.confidence >= 0.4 ? "text-amber-600 bg-amber-50" :
                                                "text-stone-400 bg-stone-50"
                                            )}>
                                                {Math.round(inf.confidence * 100)}%
                                            </span>
                                        )}
                                        <span className="text-stone-300 group-hover:text-red-400 text-[10px]">✕</span>
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {/* Inferred NAICS checkboxes (only for unselected inferred codes) */}
                    {inferredNaics.filter(n => !selectedNaics.includes(n.code)).length > 0 && (
                        <div className="space-y-1.5 mb-3">
                            <p className="text-[10px] text-stone-400 uppercase tracking-wider font-bold">Detected from website</p>
                            {inferredNaics.filter(n => !selectedNaics.includes(n.code)).map(n => (
                                <button
                                    key={n.code}
                                    type="button"
                                    onClick={() => addNaics(n.code)}
                                    className="flex items-center gap-2.5 p-2.5 rounded-lg cursor-pointer border border-stone-100 hover:bg-blue-50 hover:border-blue-200 transition-colors w-full text-left"
                                >
                                    <Plus className="w-3.5 h-3.5 text-stone-400" />
                                    <span className="font-mono text-xs font-bold text-stone-500">{n.code}</span>
                                    <span className="text-sm text-stone-700 flex-1">{n.label}</span>
                                    <span className={clsx(
                                        "text-[10px] font-bold px-1.5 py-0.5 rounded",
                                        n.confidence >= 0.7 ? "text-emerald-600 bg-emerald-50" :
                                        n.confidence >= 0.4 ? "text-amber-600 bg-amber-50" :
                                        "text-stone-400 bg-stone-50"
                                    )}>
                                        {Math.round(n.confidence * 100)}%
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Add more NAICS — search picker */}
                    {!showNaicsPicker && (
                        <button
                            type="button"
                            onClick={() => setShowNaicsPicker(true)}
                            className="text-xs text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1"
                        >
                            <Plus className="w-3 h-3" /> Add more industry codes
                        </button>
                    )}

                    {showNaicsPicker && (
                        <div className="border border-stone-200 rounded-xl overflow-hidden">
                            <div className="relative">
                                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                                <input
                                    type="text"
                                    value={naicsSearch}
                                    onChange={(e) => setNaicsSearch(e.target.value)}
                                    placeholder="Search by code or industry name..."
                                    className="w-full pl-9 pr-4 py-2.5 text-sm border-b border-stone-200 focus:outline-none focus:ring-2 focus:ring-blue-100"
                                />
                            </div>
                            <div className="max-h-48 overflow-y-auto">
                                {filteredNaics.length === 0 ? (
                                    <p className="text-xs text-stone-400 p-3 text-center">
                                        {naicsSearch ? "No matching codes found" : "All popular codes already selected"}
                                    </p>
                                ) : (
                                    filteredNaics.slice(0, 15).map(n => (
                                        <button
                                            key={n.code}
                                            type="button"
                                            onClick={() => addNaics(n.code)}
                                            className="flex items-center gap-2.5 px-3 py-2 hover:bg-blue-50 transition-colors w-full text-left border-b border-stone-50 last:border-0"
                                        >
                                            <Plus className="w-3.5 h-3.5 text-blue-500" />
                                            <span className="font-mono text-xs font-bold text-stone-500">{n.code}</span>
                                            <span className="text-sm text-stone-700">{n.label}</span>
                                        </button>
                                    ))
                                )}
                            </div>
                        </div>
                    )}

                    {selectedNaics.length === 0 && (
                        <p className="text-xs text-amber-600 mt-2">Select at least one NAICS code to find matching opportunities.</p>
                    )}
                </div>

                {/* SBA Certifications — compact inline chips */}
                <div>
                    <label className="block text-xs font-bold text-stone-500 uppercase tracking-widest mb-1.5">
                        SBA Certifications
                    </label>
                    <div className="flex flex-wrap gap-2">
                        {SBA_CERTS.map(cert => (
                            <button
                                key={cert.key}
                                type="button"
                                onClick={() => toggleCert(cert.key)}
                                className={clsx(
                                    "text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors",
                                    selectedCerts.includes(cert.key)
                                        ? "bg-blue-50 text-blue-700 border-blue-300"
                                        : "bg-white text-stone-500 border-stone-200 hover:bg-stone-50"
                                )}
                            >
                                {cert.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Company size signals — pre-filled where we could detect, editable */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
                    <div>
                        <label className="block text-xs font-bold text-stone-500 uppercase tracking-widest mb-1.5">
                            <Users className="w-3 h-3 inline mr-1" /> Employees
                        </label>
                        <input
                            type="number"
                            min={1}
                            inputMode="numeric"
                            value={employeeCount}
                            onChange={(e) => setEmployeeCount(e.target.value.replace(/\D/g, ""))}
                            placeholder="12"
                            className="w-full px-3 py-2.5 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-stone-500 uppercase tracking-widest mb-1.5">
                            <Calendar className="w-3 h-3 inline mr-1" /> Years in business
                        </label>
                        <input
                            type="number"
                            min={0}
                            inputMode="numeric"
                            value={yearsInBusiness}
                            onChange={(e) => setYearsInBusiness(e.target.value.replace(/\D/g, ""))}
                            placeholder="5"
                            className="w-full px-3 py-2.5 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400"
                        />
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                        <label className="block text-xs font-bold text-stone-500 uppercase tracking-widest mb-1.5">
                            <DollarSign className="w-3 h-3 inline mr-1" /> Revenue
                        </label>
                        <select
                            value={revenueBand}
                            onChange={(e) => setRevenueBand(e.target.value)}
                            aria-label="Annual revenue band"
                            className="w-full px-3 py-2.5 rounded-xl border border-stone-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400"
                        >
                            <option value="">Select...</option>
                            {REVENUE_BANDS.map(b => (
                                <option key={b.key} value={b.key}>{b.label}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Contact block — required when requireContact */}
                <div className="bg-stone-50 border border-stone-200 rounded-2xl p-4 sm:p-5 space-y-3">
                    <p className="text-[10px] font-bold text-stone-500 uppercase tracking-widest">
                        {requireContact ? "Last step — who should we send the report to?" : "Contact details (optional)"}
                    </p>

                    {/* LinkedIn auth shortcut — pulls verified first/last/email
                        straight from the OAuth payload. We don't get phone from
                        LinkedIn so phone validation is skipped when this path
                        is used. Only shown when contact info is gated; the
                        "Review & Refine" mode skips identity capture entirely. */}
                    {requireContact && !linkedinPrefill && (
                        <>
                            <button
                                type="button"
                                onClick={() => { void handleLinkedInLogin(); }}
                                disabled={linkedinLoading || submitting}
                                className="w-full bg-white border-2 border-[#0A66C2] text-[#0A66C2] rounded-xl py-3 px-4 font-bold text-sm flex items-center justify-center gap-2 hover:bg-[#0A66C2]/5 transition-colors disabled:opacity-50"
                            >
                                {linkedinLoading ? (
                                    <><Loader2 className="w-4 h-4 animate-spin" /> Redirecting to LinkedIn…</>
                                ) : (
                                    <><Linkedin className="w-4 h-4" /> Continue with LinkedIn — auto-fill verified info</>
                                )}
                            </button>
                            <div className="flex items-center gap-3 py-1">
                                <div className="flex-1 h-px bg-stone-200" />
                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">— OR —</span>
                                <div className="flex-1 h-px bg-stone-200" />
                            </div>
                        </>
                    )}

                    {/* If LinkedIn auth already succeeded, surface a confirmation
                        chip so the user understands why their fields are filled. */}
                    {linkedinPrefill && (
                        <div className="flex items-center gap-2 bg-[#0A66C2]/10 border border-[#0A66C2]/30 rounded-xl px-3 py-2 text-xs text-[#0A66C2] font-bold">
                            <Linkedin className="w-4 h-4" />
                            Verified via LinkedIn — {linkedinPrefill.first_name} {linkedinPrefill.last_name}
                        </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-bold text-stone-500 mb-1.5">
                                <User className="w-3 h-3 inline mr-1" /> First name{requireContact && <span className="text-emerald-600 ml-1">*</span>}
                            </label>
                            <input
                                type="text"
                                autoComplete="given-name"
                                value={firstName}
                                onChange={(e) => setFirstName(e.target.value)}
                                required={requireContact}
                                className="w-full px-4 py-2.5 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400"
                                placeholder="Jane"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-stone-500 mb-1.5">
                                <User className="w-3 h-3 inline mr-1" /> Last name{requireContact && <span className="text-emerald-600 ml-1">*</span>}
                            </label>
                            <input
                                type="text"
                                autoComplete="family-name"
                                value={lastName}
                                onChange={(e) => setLastName(e.target.value)}
                                required={requireContact}
                                className="w-full px-4 py-2.5 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400"
                                placeholder="Doe"
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-bold text-stone-500 mb-1.5">
                                <Mail className="w-3 h-3 inline mr-1" /> Work email{requireContact && <span className="text-emerald-600 ml-1">*</span>}
                            </label>
                            <input
                                type="email"
                                autoComplete="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required={requireContact}
                                className="w-full px-4 py-2.5 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400"
                                placeholder="jane@company.com"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-stone-500 mb-1.5">
                                <Phone className="w-3 h-3 inline mr-1" /> Direct phone{requireContact && <span className="text-emerald-600 ml-1">*</span>}
                            </label>
                            <input
                                type="tel"
                                autoComplete="tel"
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                required={requireContact}
                                className="w-full px-4 py-2.5 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400"
                                placeholder="+1 (555) 555-5555"
                            />
                        </div>
                    </div>
                </div>

                {error && (
                    <div className="bg-red-50 text-red-600 text-xs p-3 rounded-xl border border-red-200">
                        {error}
                    </div>
                )}

                <button
                    type="button"
                    onClick={() => { void handleSubmit(); }}
                    disabled={submitting}
                    className="w-full bg-gradient-to-r from-emerald-600 to-blue-600 text-white py-3.5 rounded-2xl font-bold text-sm hover:opacity-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-md"
                >
                    {submitting ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Sending your report…</>
                    ) : requireContact ? (
                        <><Mail className="w-4 h-4" /> Send My Full Report</>
                    ) : (
                        <><CheckCircle2 className="w-4 h-4" /> Re-match with these settings</>
                    )}
                </button>
                {requireContact && (
                    <p className="text-[10px] text-stone-400 text-center -mt-1">
                        No spam. We email your federal readiness report + 7 matching opportunities. Unsubscribe anytime.
                    </p>
                )}
            </div>
        </div>
    );
}
