"use client";

import { useState, useEffect, Suspense } from "react";
import { createSupabaseClient } from "@/lib/supabase/client";
import {
    Building, MapPin, Target, ShieldCheck, Briefcase,
    ArrowRight, ArrowLeft, CheckCircle2, Loader2, Search, X, Sparkles, Globe, Phone, User,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import clsx from "clsx";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { NAICS_CODES, searchNaics } from "@/lib/naics-codes";
import KeywordPicker from "@/components/KeywordPicker";

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

const COMPANY_SIZE_OPTIONS = [
    { value: "micro", label: "Micro", sublabel: "1-9 employees" },
    { value: "small", label: "Small", sublabel: "10-49 employees" },
    { value: "mid", label: "Mid", sublabel: "50-249 employees" },
    { value: "large", label: "Large", sublabel: "250+ employees" },
] as const;

const REVENUE_RANGE_OPTIONS = [
    { value: "<1M", label: "Under $1M" },
    { value: "1-5M", label: "$1M - $5M" },
    { value: "5-25M", label: "$5M - $25M" },
    { value: "25-100M", label: "$25M - $100M" },
    { value: "100M+", label: "$100M+" },
];

// Keeps the numeric revenue column populated (midpoint) so existing scoring / filters don't break.
const REVENUE_RANGE_TO_NUMERIC: Record<string, number> = {
    "<1M":      500_000,
    "1-5M":   3_000_000,
    "5-25M": 15_000_000,
    "25-100M": 60_000_000,
    "100M+": 150_000_000,
};

function validateUEI(uei: string): { valid: boolean; error?: string } {
    if (!uei) return { valid: true };
    const cleaned = uei.trim().toUpperCase();
    if (cleaned.length !== 12) return { valid: false, error: "UEI must be exactly 12 characters" };
    if (!/^[A-Z0-9]{12}$/.test(cleaned)) return { valid: false, error: "UEI can only contain letters and numbers" };
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

interface BrandKit {
    logo_url?: string;
    favicon_url?: string;
    colors?: { primary?: string; secondary?: string; accent?: string };
    all_colors?: string[];
    company_name?: string;
    // Optionally filled by /api/brand when OpenAI is available:
    company_description?: string;
    services?: string[];
    differentiators?: string[];
}

type TaskStatus = "pending" | "running" | "done" | "error" | "skipped";
interface PrefillTask {
    key: "brand" | "sam";
    label: string;
    status: TaskStatus;
    detail?: string;
}

// Field provenance badges
type FieldSource = "sam" | "website" | "manual" | null;

function OnboardPageContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const analysisId = searchParams.get("analysis_id");
    const [analysisLoaded, setAnalysisLoaded] = useState(false);

    // New 3-step flow (1 = identity+website, 2 = prefill review, 3 = firmographics)
    const [step, setStep] = useState<1 | 2 | 3>(1);

    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [matchCount, setMatchCount] = useState(0);
    const [scoringMatches, setScoringMatches] = useState(false);
    const [oppCount, setOppCount] = useState(0);

    // Prefill pipeline state
    const [prefillRunning, setPrefillRunning] = useState(false);
    const [prefillTasks, setPrefillTasks] = useState<PrefillTask[]>([
        { key: "brand", label: "Reading your website", status: "pending" },
        { key: "sam",   label: "Looking up SAM.gov registration", status: "pending" },
    ]);
    const [brandKit, setBrandKit] = useState<BrandKit | null>(null);

    const [naicsSearch, setNaicsSearch] = useState("");

    // Per-field provenance so we can show "auto-filled from website / SAM.gov" badges
    const [fieldSources, setFieldSources] = useState<Record<string, FieldSource>>({});

    // Form state — only the fields this flow cares about. Other downstream fields
    // stay at the schema defaults and can be edited from Settings later.
    const [form, setForm] = useState({
        // Step 1
        contact_name: "",
        job_title: "",
        contact_phone: "",
        company_name: "",
        company_website: "",
        uei: "",

        // Step 2 (prefilled from crawl, editable)
        naics_codes: [] as string[],
        target_states: [] as string[],
        sba_certifications: [] as string[],
        company_description: "",
        services: [] as string[],
        differentiators: [] as string[],

        // Step 3 (human-only)
        company_size: "" as "" | "micro" | "small" | "mid" | "large",
        employee_count: "",
        annual_revenue_range: "",
        years_in_business: "",
        has_federal_experience: null as null | boolean,
        federal_experience_notes: "",

        // Keywords — max 3 primary, 5 secondary. Canonical strings matching gov_keywords.keyword.
        primary_keywords: [] as string[],
        secondary_keywords: [] as string[],
    });

    // AI-suggested keywords from the website crawl, shown as quick-adds in the picker.
    const [keywordSuggestions, setKeywordSuggestions] = useState<string[]>([]);

    const updateForm = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
        setForm(prev => ({ ...prev, [key]: value }));

    const markSource = (field: string, source: FieldSource) =>
        setFieldSources(prev => ({ ...prev, [field]: source }));

    const toggleArray = (key: "naics_codes" | "sba_certifications" | "target_states" | "services" | "differentiators", value: string) => {
        setForm(prev => {
            const arr = prev[key] as string[];
            const next = arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value];
            return { ...prev, [key]: next };
        });
        markSource(key, "manual");
    };

    // Optional: pre-fill from an inbound lead magnet analysis id
    useEffect(() => {
        if (!analysisId || analysisLoaded) return;
        fetch(`/api/analyze-company/status/${analysisId}`)
            .then(res => res.ok ? res.json() : null)
            .then(data => {
                if (!data?.inferred_profile) return;
                const p = data.inferred_profile as Record<string, unknown>;
                setForm(prev => ({
                    ...prev,
                    company_name: (p.company_name as string) || prev.company_name,
                    company_website: (p.website as string) || prev.company_website,
                    uei: (p.uei as string) || prev.uei,
                    naics_codes: (p.naics_codes as string[])?.length ? (p.naics_codes as string[]) : prev.naics_codes,
                    sba_certifications: (p.sba_certifications as string[])?.length ? (p.sba_certifications as string[]) : prev.sba_certifications,
                    target_states: (p.target_states as string[])?.length ? (p.target_states as string[]) : prev.target_states,
                }));
                setAnalysisLoaded(true);
            })
            .catch(() => { /* ignore */ });
    }, [analysisId, analysisLoaded]);

    // ─── Prefill pipeline ─────────────────────────────────────────────────────
    const updateTask = (key: PrefillTask["key"], patch: Partial<PrefillTask>) =>
        setPrefillTasks(prev => prev.map(t => t.key === key ? { ...t, ...patch } : t));

    const runBrandPrefill = async (): Promise<void> => {
        if (!form.company_website.trim()) { updateTask("brand", { status: "skipped", detail: "No website" }); return; }
        updateTask("brand", { status: "running" });
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 30_000);
            const res = await fetch("/api/brand", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ website: form.company_website.trim() }),
                signal: controller.signal,
            });
            clearTimeout(timer);
            if (!res.ok) throw new Error(`brand ${res.status}`);
            const { brand } = await res.json() as { brand: BrandKit };
            setBrandKit(brand || null);

            setForm(prev => ({
                ...prev,
                company_name: prev.company_name || brand?.company_name || prev.company_name,
                company_description: prev.company_description || brand?.company_description || "",
                services: prev.services.length ? prev.services : (brand?.services || []),
                differentiators: prev.differentiators.length ? prev.differentiators : (brand?.differentiators || []),
            }));
            if (brand?.company_description) markSource("company_description", "website");
            if (brand?.services?.length) markSource("services", "website");
            if (brand?.differentiators?.length) markSource("differentiators", "website");

            // Fire-and-forget keyword suggestion. Seeds primary + secondary picks into the
            // KeywordPicker suggestions strip shown in Step 3. Failures are silent —
            // the picker still works via manual typeahead.
            fetch("/api/keywords/suggest", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    company_name: brand?.company_name || form.company_name,
                    company_description: brand?.company_description || "",
                    services: brand?.services || [],
                    differentiators: brand?.differentiators || [],
                }),
            })
                .then(r => r.ok ? r.json() : null)
                .then((kw: { primary?: string[]; secondary?: string[] } | null) => {
                    if (!kw) return;
                    const suggested = [...(kw.primary || []), ...(kw.secondary || [])];
                    if (suggested.length > 0) setKeywordSuggestions(suggested);
                    // Auto-fill primary/secondary ONLY if user hasn't touched them yet.
                    setForm(prev => {
                        if (prev.primary_keywords.length > 0 || prev.secondary_keywords.length > 0) return prev;
                        return {
                            ...prev,
                            primary_keywords: (kw.primary || []).slice(0, 3),
                            secondary_keywords: (kw.secondary || []).slice(0, 5),
                        };
                    });
                })
                .catch(() => { /* non-fatal — user can still pick keywords manually */ });

            const detail = [
                brand?.logo_url ? "logo" : null,
                brand?.all_colors?.length ? `${brand.all_colors.length} colors` : null,
                brand?.company_description ? "description" : null,
                brand?.services?.length ? `${brand.services.length} services` : null,
            ].filter(Boolean).join(" · ");
            updateTask("brand", { status: "done", detail: detail || "no rich data" });
        } catch (e) {
            updateTask("brand", { status: "error", detail: (e as Error).name === "AbortError" ? "Timed out" : "Crawl failed" });
        }
    };

    const runSamPrefill = async (): Promise<void> => {
        const uei = form.uei.trim().toUpperCase();
        const name = form.company_name.trim();
        if (!uei && !name) { updateTask("sam", { status: "skipped", detail: "No UEI or name" }); return; }
        if (uei) {
            const v = validateUEI(uei);
            if (!v.valid) { updateTask("sam", { status: "error", detail: v.error || "Invalid UEI" }); return; }
        }
        updateTask("sam", { status: "running" });
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 30_000);
            const param = uei ? `uei=${encodeURIComponent(uei)}` : `name=${encodeURIComponent(name)}`;
            const res = await fetch(`/api/sam/entity?${param}`, { signal: controller.signal });
            clearTimeout(timer);
            if (!res.ok) throw new Error(`sam ${res.status}`);
            const data = await res.json() as { entities?: SamEntity[] };
            const entities = data.entities || [];
            // Only auto-populate when we have exactly one match (UEI is unique) OR when search was by UEI.
            const picked = uei ? entities[0] : (entities.length === 1 ? entities[0] : null);
            if (!picked) {
                updateTask("sam", {
                    status: entities.length > 1 ? "skipped" : "skipped",
                    detail: entities.length > 1 ? `${entities.length} matches — skipped` : "Not on SAM.gov yet",
                });
                return;
            }

            setForm(prev => ({
                ...prev,
                company_name: prev.company_name || picked.company_name,
                uei: prev.uei || picked.uei,
                naics_codes: prev.naics_codes.length ? prev.naics_codes : (picked.naics_codes || []),
                sba_certifications: prev.sba_certifications.length
                    ? prev.sba_certifications
                    : (picked.sba_certifications || []),
                target_states: prev.target_states.length
                    ? prev.target_states
                    : (picked.address?.state ? [picked.address.state] : []),
            }));
            if (picked.naics_codes?.length) markSource("naics_codes", "sam");
            if (picked.sba_certifications?.length) markSource("sba_certifications", "sam");
            if (picked.address?.state) markSource("target_states", "sam");

            updateTask("sam", { status: "done", detail: `${picked.company_name} · ${picked.naics_codes?.length || 0} NAICS` });
        } catch (e) {
            updateTask("sam", { status: "error", detail: (e as Error).name === "AbortError" ? "Timed out" : "SAM lookup failed" });
        }
    };

    const startPrefill = async () => {
        setPrefillRunning(true);
        // Reset tasks
        setPrefillTasks([
            { key: "brand", label: "Reading your website", status: "pending" },
            { key: "sam",   label: "Looking up SAM.gov registration", status: "pending" },
        ]);
        setStep(2);
        // Fire in parallel; each has its own 30s timeout.
        await Promise.allSettled([runBrandPrefill(), runSamPrefill()]);
        setPrefillRunning(false);
    };

    const skipPrefill = () => {
        setPrefillTasks(prev => prev.map(t => ({ ...t, status: "skipped" as TaskStatus, detail: "Skipped" })));
        setStep(2);
    };

    // ─── Save ─────────────────────────────────────────────────────────────────
    const handleSave = async () => {
        const missing: string[] = [];
        if (!form.contact_name.trim()) missing.push("Contact name");
        if (!form.job_title.trim()) missing.push("Job title");
        if (!form.contact_phone.trim()) missing.push("Contact phone");
        if (!form.company_name.trim()) missing.push("Company name");
        if (!form.company_website.trim()) missing.push("Website");
        if (!form.company_size) missing.push("Company size");
        if (!form.employee_count) missing.push("Employee count");
        if (!form.annual_revenue_range) missing.push("Annual revenue");
        if (!form.years_in_business) missing.push("Years in business");
        if (form.has_federal_experience === null) missing.push("Federal experience");
        if (missing.length) { alert(`Required: ${missing.join(", ")}`); return; }

        setSaving(true);

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            alert("Not authenticated. Please log in again.");
            setSaving(false);
            router.push("/login");
            return;
        }

        const employeeCountNum = form.employee_count ? parseInt(form.employee_count, 10) : null;
        const yearsNum = form.years_in_business ? Math.min(parseInt(form.years_in_business, 10), 200) : null;

        const payload = {
            auth_user_id: user.id,
            email: user.email || null,

            // Step 1
            company_name: form.company_name,
            contact_name: form.contact_name,
            job_title: form.job_title,
            contact_phone: form.contact_phone,
            website: form.company_website || null,
            uei: form.uei ? form.uei.trim().toUpperCase() : null,

            // Step 2
            naics_codes: form.naics_codes,
            target_states: form.target_states,
            sba_certifications: form.sba_certifications,
            company_description: form.company_description || null,

            // Step 3
            company_size: form.company_size || null,
            employee_count: employeeCountNum,
            annual_revenue_range: form.annual_revenue_range || null,
            // Keep numeric revenue column in sync for existing scoring/filters
            revenue: form.annual_revenue_range
                ? REVENUE_RANGE_TO_NUMERIC[form.annual_revenue_range] || null
                : null,
            years_in_business: yearsNum,
            has_federal_experience: form.has_federal_experience,
            federal_experience_notes: form.federal_experience_notes || null,

            // Keywords (gov_keywords library)
            primary_keywords: form.primary_keywords,
            secondary_keywords: form.secondary_keywords,

            onboarding_complete: true,
            trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
            subscription_status: "trialing",
        };

        // Stash services/differentiators into notes JSON since they're not top-level columns.
        // We read-modify-write notes so we don't clobber other keys.
        const { data: existingNotesRow } = await supabase
            .from("user_profiles")
            .select("notes")
            .eq("auth_user_id", user.id)
            .maybeSingle();
        const prevNotes = (existingNotesRow?.notes as Record<string, unknown> | null) || {};
        const mergedNotes = {
            ...prevNotes,
            services: form.services,
            differentiators: form.differentiators,
            brand_kit: brandKit || (prevNotes as { brand_kit?: unknown }).brand_kit || null,
        };

        const { error } = await supabase
            .from("user_profiles")
            .upsert({ ...payload, notes: mergedNotes }, { onConflict: "auth_user_id" });

        if (error) {
            console.error("Save error:", error);
            alert("Failed to save: " + (error.message || "Unknown error"));
            setSaving(false);
            return;
        }

        // Link lead magnet analysis if we came from one
        if (analysisId) {
            await supabase.from("user_profiles").update({
                analysis_id: analysisId,
                onboarding_source: "lead_magnet",
            }).eq("auth_user_id", user.id);

            await supabase.from("company_analyses").update({
                converted_user_id: user.id,
                converted_at: new Date().toISOString(),
            }).eq("id", analysisId);
        }

        // Get raw opportunity count for progress display
        if (form.naics_codes.length > 0) {
            const { count } = await supabase
                .from("opportunities")
                .select("*", { count: "exact", head: true })
                .eq("is_archived", false)
                .in("naics_code", form.naics_codes);
            setOppCount(count || 0);
        }

        setSaved(true);
        setSaving(false);

        // Fire-and-forget: welcome email. Route now reads the session email
        // server-side and ignores body-supplied addresses — see audit fix #14.
        if (user.email) {
            fetch("/api/email/welcome", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ company_name: form.company_name }),
            }).catch(() => {});
        }

        // Fire-and-forget: HubSpot sync with full firmographics
        if (user.email) {
            fetch("/api/hubspot/sync-contact", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email: user.email,
                    contact_name: form.contact_name,
                    job_title: form.job_title,
                    phone: form.contact_phone,
                    company: form.company_name,
                    source: "onboarding_complete",
                    user_id: user.id,
                    account_type: "self_service",
                    company_size: form.company_size || undefined,
                    employee_count: employeeCountNum ?? undefined,
                    annual_revenue_range: form.annual_revenue_range || undefined,
                    years_in_business: yearsNum ?? undefined,
                    has_federal_experience: form.has_federal_experience ?? undefined,
                    naics_codes: form.naics_codes,
                    business_state: form.target_states[0] || undefined,
                    uei: form.uei || undefined,
                }),
            }).catch((err) => console.error("[HubSpot sync failed]", err));
        }

        // Trigger match scoring in background
        setScoringMatches(true);
        try {
            const res = await fetch("/api/matches/refresh", { method: "POST" });
            if (res.ok) {
                const data = await res.json();
                setMatchCount(data.written || 0);
            }
        } catch {
            /* user can retry from dashboard */
        }
        setScoringMatches(false);
    };

    // ─── Validation ───────────────────────────────────────────────────────────
    const ueiValidation = validateUEI(form.uei);
    const step1Valid = !!(
        form.contact_name.trim() &&
        form.job_title.trim() &&
        form.contact_phone.trim() &&
        form.company_name.trim() &&
        form.company_website.trim() &&
        (form.uei ? ueiValidation.valid : true)
    );
    const step2Valid = form.naics_codes.length > 0 && form.target_states.length > 0;
    const step3Valid = !!(
        form.company_size &&
        form.employee_count &&
        form.annual_revenue_range &&
        form.years_in_business &&
        form.has_federal_experience !== null
    );

    const filteredNaics = naicsSearch ? searchNaics(naicsSearch) : NAICS_CODES.filter(n => n.popular);

    // ─── UI helpers ───────────────────────────────────────────────────────────
    const SourceBadge = ({ field }: { field: string }) => {
        const src = fieldSources[field];
        if (!src || src === "manual") return null;
        const label = src === "sam" ? "from SAM.gov" : "from website";
        return (
            <span className="ml-2 inline-flex items-center text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded">
                <Sparkles className="w-2.5 h-2.5 mr-1" /> {label}
            </span>
        );
    };

    const TaskRow = ({ task }: { task: PrefillTask }) => {
        const icon = task.status === "running"
            ? <Loader2 className="w-4 h-4 animate-spin text-stone-500" />
            : task.status === "done"
                ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                : task.status === "error"
                    ? <X className="w-4 h-4 text-red-500" />
                    : task.status === "skipped"
                        ? <span className="w-4 h-4 inline-block rounded-full bg-stone-200" />
                        : <span className="w-4 h-4 inline-block rounded-full border-2 border-stone-200" />;
        return (
            <div className="flex items-center gap-3 py-2">
                {icon}
                <span className={clsx(
                    "text-sm font-medium",
                    task.status === "done" ? "text-stone-900" : "text-stone-600",
                )}>
                    {task.label}
                </span>
                {task.detail && (
                    <span className="text-xs text-stone-400 ml-auto">{task.detail}</span>
                )}
            </div>
        );
    };

    // ─── Saved confirmation ───────────────────────────────────────────────────
    if (saved) {
        return (
            <div className="text-center animate-in fade-in duration-500 py-4 sm:py-8">
                <div className="bg-white rounded-[32px] sm:rounded-[40px] border border-stone-200 shadow-sm p-8 sm:p-12">
                    <CheckCircle2 className="w-14 h-14 sm:w-16 sm:h-16 text-emerald-500 mx-auto mb-6" />
                    <h2 className="text-2xl sm:text-3xl font-bold tracking-tighter text-black mb-3">You&apos;re All Set!</h2>
                    <p className="text-stone-500 font-medium mb-2">
                        <span className="font-bold text-black">{form.company_name}</span> is now in the system.
                    </p>
                    {scoringMatches ? (
                        <div className="mb-6">
                            <div className="flex items-center justify-center gap-2 text-stone-500 mb-2">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <p className="font-medium text-sm">
                                    Scanning {oppCount > 0 ? `${oppCount.toLocaleString()} ` : ""}opportunities for your best matches...
                                </p>
                            </div>
                        </div>
                    ) : matchCount > 0 ? (
                        <p className="text-emerald-600 font-bold text-lg mb-6">
                            We matched {matchCount.toLocaleString()} opportunities to your profile!
                        </p>
                    ) : (
                        <p className="text-stone-400 text-sm mb-6">
                            Your matches are ready. Head to your dashboard to explore them.
                        </p>
                    )}
                    <button
                        type="button"
                        onClick={() => router.push("/dashboard")}
                        className="inline-flex items-center bg-black text-white font-bold px-8 py-4 rounded-full hover:bg-stone-800 transition-all shadow-lg text-sm"
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
                        <Image src="/logo.png" alt="CP" width={20} height={20} className="rounded" />
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-bold tracking-tighter text-black">
                        Tell Us About Your Business
                    </h2>
                </div>
                <p className="text-stone-500 mt-1 font-medium text-sm sm:text-base">
                    Three short steps. We&apos;ll use your website and SAM.gov record to do most of the typing for you.
                </p>
                <button
                    type="button"
                    onClick={async () => {
                        const sb = createSupabaseClient();
                        await sb.auth.signOut();
                        window.location.href = "/login";
                    }}
                    className="absolute top-4 right-4 text-xs text-stone-400 hover:text-stone-700"
                >
                    Sign Out
                </button>
            </header>

            {/* Progress */}
            <div className="mb-6 sm:mb-8">
                <div className="flex justify-between items-center mb-3">
                    {[
                        { n: 1 as const, label: "You & Company" },
                        { n: 2 as const, label: "Review Prefill" },
                        { n: 3 as const, label: "Business Profile" },
                    ].map(s => (
                        <button type="button" key={s.n} onClick={() => { if (s.n <= step) setStep(s.n); }} className={clsx(
                            "flex items-center text-xs uppercase tracking-widest transition-colors",
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
                    <div className="bg-black rounded-full h-1.5 transition-all duration-500" style={{ width: `${((step - 1) / 2) * 100}%` }} />
                </div>
            </div>

            <div className="bg-white rounded-[24px] sm:rounded-[40px] border border-stone-200 shadow-sm p-5 sm:p-8 md:p-10">

                {/* ─── Step 1: Identity + Website + UEI ───────────────────── */}
                {step === 1 && (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <div className="flex items-center mb-2">
                            <User className="w-5 h-5 sm:w-6 sm:h-6 mr-3 text-stone-400" />
                            <h3 className="font-bold text-lg sm:text-xl">About You & Your Company</h3>
                        </div>

                        <div className="bg-stone-50 border border-stone-200 rounded-2xl p-4 space-y-4">
                            <div className="flex items-center gap-2">
                                <Briefcase className="w-4 h-4 text-stone-400" />
                                <h4 className="text-sm font-bold text-stone-700">Primary Contact</h4>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs text-stone-500 uppercase tracking-widest block mb-2">Contact Name *</label>
                                    <input type="text" required value={form.contact_name}
                                        onChange={(e) => updateForm("contact_name", e.target.value)}
                                        className="w-full px-4 py-3.5 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm"
                                        placeholder="Jane Doe" />
                                </div>
                                <div>
                                    <label className="text-xs text-stone-500 uppercase tracking-widest block mb-2">
                                        Position / Title *
                                        <InfoTooltip text="Your role at the company (e.g. Owner, CEO, BD Director). Used on outreach to contracting officers." />
                                    </label>
                                    <input type="text" required value={form.job_title}
                                        onChange={(e) => updateForm("job_title", e.target.value)}
                                        className="w-full px-4 py-3.5 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm"
                                        placeholder="e.g. Owner, CEO, VP" />
                                </div>
                            </div>
                            <div>
                                <label className="text-xs text-stone-500 uppercase tracking-widest block mb-2">Personal Phone *</label>
                                <div className="relative">
                                    <Phone className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                    <input type="tel" required value={form.contact_phone}
                                        onChange={(e) => updateForm("contact_phone", e.target.value)}
                                        className="w-full pl-9 pr-4 py-3.5 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm"
                                        placeholder="(555) 123-4567" />
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className="text-xs text-stone-500 uppercase tracking-widest block mb-2">Company Name *</label>
                            <input type="text" value={form.company_name}
                                onChange={(e) => updateForm("company_name", e.target.value)}
                                className="w-full px-4 py-3.5 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm font-medium"
                                placeholder="Legal Business Name" />
                        </div>

                        <div>
                            <label className="text-xs text-stone-500 uppercase tracking-widest block mb-2">
                                Company Website *
                                <InfoTooltip text="We'll crawl your site to pre-fill services, differentiators, logo, and brand colors — so you don't have to retype them." />
                            </label>
                            <div className="relative">
                                <Globe className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                <input type="text" value={form.company_website}
                                    onChange={(e) => updateForm("company_website", e.target.value)}
                                    className="w-full pl-9 pr-4 py-3.5 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm"
                                    placeholder="www.yourcompany.com" />
                            </div>
                        </div>

                        <div>
                            <label className="text-xs text-stone-500 uppercase tracking-widest block mb-2">
                                UEI (optional)
                                <InfoTooltip text="Your 12-character SAM.gov Unique Entity Identifier. Optional — if you have one, we'll auto-pull your NAICS codes and certifications." />
                            </label>
                            <input type="text" value={form.uei}
                                onChange={(e) => updateForm("uei", e.target.value.toUpperCase())}
                                maxLength={12}
                                className={clsx(
                                    "w-full px-4 py-3.5 border rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm font-mono uppercase",
                                    form.uei && !ueiValidation.valid ? "border-red-300 bg-red-50" : "border-stone-200",
                                )}
                                placeholder="12-character ID (leave blank if none)" />
                            {form.uei && !ueiValidation.valid && (
                                <p className="text-red-600 text-xs mt-1">{ueiValidation.error}</p>
                            )}
                            <p className="text-[11px] text-stone-400 mt-1.5">
                                Don&apos;t have one yet? That&apos;s fine — you can add it later from Settings.
                            </p>
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-2">
                            <button type="button" onClick={startPrefill} disabled={!step1Valid}
                                className="flex-1 flex items-center justify-center px-5 sm:px-6 py-3.5 rounded-full bg-black text-white hover:bg-stone-800 font-bold text-sm transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
                                <Sparkles className="w-4 h-4 mr-2" /> Prefill from website {form.uei ? "+ SAM.gov" : ""}
                            </button>
                            <button type="button" onClick={skipPrefill} disabled={!step1Valid}
                                className="text-sm text-stone-500 hover:text-black underline underline-offset-2 transition-colors disabled:opacity-50">
                                Skip prefill, fill manually
                            </button>
                        </div>
                    </div>
                )}

                {/* ─── Step 2: Review prefilled ───────────────────────────── */}
                {step === 2 && (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <div className="flex items-center mb-2">
                            <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 mr-3 text-stone-400" />
                            <h3 className="font-bold text-lg sm:text-xl">Review Prefilled Info</h3>
                        </div>

                        {/* Task status card */}
                        <div className="bg-stone-50 border border-stone-200 rounded-2xl p-4">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs text-stone-500 uppercase tracking-widest font-bold">
                                    {prefillRunning ? "Working…" : "Prefill Complete"}
                                </span>
                                {!prefillRunning && (
                                    <button type="button" onClick={startPrefill}
                                        className="text-xs text-stone-500 hover:text-black underline underline-offset-2">
                                        Re-run prefill
                                    </button>
                                )}
                            </div>
                            <div className="divide-y divide-stone-200">
                                {prefillTasks.map(t => <TaskRow key={t.key} task={t} />)}
                            </div>
                        </div>

                        {/* Logo preview (if brand kit found one) */}
                        {brandKit?.logo_url && (
                            <div className="flex items-center gap-4 bg-white border border-stone-200 rounded-2xl p-4">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={brandKit.logo_url} alt="Company logo"
                                    className="w-16 h-16 object-contain rounded-lg bg-stone-50 border border-stone-200" />
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold text-black truncate">{brandKit.company_name || form.company_name}</p>
                                    <p className="text-xs text-stone-400 truncate">Logo & brand colors detected</p>
                                    {brandKit.all_colors && brandKit.all_colors.length > 0 && (
                                        <div className="flex gap-1 mt-1.5">
                                            {brandKit.all_colors.slice(0, 5).map(c => (
                                                <span key={c} className="w-5 h-5 rounded border border-stone-200"
                                                    style={{ backgroundColor: c }} title={c} />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* NAICS */}
                        <div>
                            <label className="text-xs text-stone-500 uppercase tracking-widest block mb-2">
                                NAICS Codes *
                                <SourceBadge field="naics_codes" />
                            </label>
                            <div className="relative mb-3">
                                <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                <input type="text" value={naicsSearch} onChange={(e) => setNaicsSearch(e.target.value)}
                                    className="w-full pl-9 pr-8 py-3 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm"
                                    placeholder="Search by code or keyword..." />
                                {naicsSearch && (
                                    <button type="button" title="Clear search" aria-label="Clear search" onClick={() => setNaicsSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600">
                                        <X className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                            {form.naics_codes.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 mb-3">
                                    {form.naics_codes.map(code => (
                                        <span key={code} className="inline-flex items-center bg-black text-white text-xs font-mono px-2.5 py-1 rounded-lg">
                                            {code}
                                            <button type="button" title={`Remove ${code}`} aria-label={`Remove ${code}`} onClick={() => toggleArray("naics_codes", code)} className="ml-1.5 hover:text-red-300">
                                                <X className="w-3 h-3" />
                                            </button>
                                        </span>
                                    ))}
                                    <span className="text-xs text-emerald-600 font-bold self-center ml-1">{form.naics_codes.length} selected</span>
                                </div>
                            )}
                            <div className="grid grid-cols-1 gap-1.5 max-h-[200px] overflow-y-auto pr-1">
                                {filteredNaics.map(n => (
                                    <button type="button" key={n.code} onClick={() => toggleArray("naics_codes", n.code)}
                                        className={clsx(
                                            "flex items-center text-left px-4 py-2.5 rounded-xl border text-sm transition-all",
                                            form.naics_codes.includes(n.code)
                                                ? "bg-black text-white border-black"
                                                : "bg-white text-stone-700 border-stone-200 hover:border-stone-400",
                                        )}>
                                        <span className="font-mono text-xs mr-2 opacity-70">{n.code}</span>
                                        <span className="font-medium">{n.label}</span>
                                    </button>
                                ))}
                                {filteredNaics.length === 0 && (
                                    <p className="text-stone-400 text-sm text-center py-4">No matching NAICS codes found.</p>
                                )}
                            </div>
                        </div>

                        {/* Target states */}
                        <div>
                            <div className="flex items-center justify-between mb-3">
                                <label className="text-xs text-stone-500 uppercase tracking-widest">
                                    Target States *
                                    <SourceBadge field="target_states" />
                                </label>
                                <button type="button"
                                    onClick={() => setForm(prev => ({ ...prev, target_states: prev.target_states.length === STATE_OPTIONS.length ? [] : [...STATE_OPTIONS] }))}
                                    className="text-[11px] font-bold uppercase tracking-wider text-stone-500 hover:text-black underline underline-offset-2">
                                    {form.target_states.length === STATE_OPTIONS.length ? "Clear all" : "Nationwide"}
                                </button>
                            </div>
                            <div className="flex flex-wrap gap-1.5 max-h-[180px] overflow-y-auto pr-1">
                                {STATE_OPTIONS.map(s => (
                                    <button type="button" key={s} onClick={() => toggleArray("target_states", s)}
                                        className={clsx(
                                            "px-3 py-2 rounded-lg border text-xs font-mono font-bold transition-all min-w-[48px]",
                                            form.target_states.includes(s)
                                                ? "bg-black text-white border-black"
                                                : "bg-white text-stone-600 border-stone-200 hover:border-stone-400",
                                        )}>
                                        {s}
                                    </button>
                                ))}
                            </div>
                            {form.target_states.length > 0 && (
                                <p className="text-xs text-emerald-600 font-bold mt-2">{form.target_states.length} states selected</p>
                            )}
                        </div>

                        {/* Set-asides */}
                        <div>
                            <label className="text-xs text-stone-500 uppercase tracking-widest block mb-3">
                                SBA Certifications / Set-Asides
                                <SourceBadge field="sba_certifications" />
                            </label>
                            <div className="flex flex-wrap gap-2">
                                {CERT_OPTIONS.map(c => (
                                    <button type="button" key={c.value} onClick={() => toggleArray("sba_certifications", c.value)}
                                        className={clsx(
                                            "px-3 sm:px-4 py-2.5 rounded-full border text-xs font-bold uppercase tracking-wider transition-all",
                                            form.sba_certifications.includes(c.value)
                                                ? "bg-black text-white border-black"
                                                : "bg-white text-stone-600 border-stone-200 hover:border-stone-400",
                                        )}>
                                        {form.sba_certifications.includes(c.value) && <CheckCircle2 className="w-3 h-3 inline mr-1" />}
                                        {c.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Company description */}
                        <div>
                            <label className="text-xs text-stone-500 uppercase tracking-widest block mb-2">
                                Company Description
                                <SourceBadge field="company_description" />
                            </label>
                            <textarea value={form.company_description}
                                onChange={(e) => { updateForm("company_description", e.target.value); markSource("company_description", "manual"); }}
                                rows={3}
                                className="w-full px-4 py-3 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm resize-none"
                                placeholder="What does your company do? (Used in proposals and capability statements.)" />
                        </div>

                        {/* Services / Differentiators as editable chip lists */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <EditableChipList
                                label="Services"
                                field="services"
                                items={form.services}
                                onAdd={(v) => setForm(p => ({ ...p, services: [...p.services, v] }))}
                                onRemove={(v) => setForm(p => ({ ...p, services: p.services.filter(s => s !== v) }))}
                                sourceBadge={<SourceBadge field="services" />}
                            />
                            <EditableChipList
                                label="Differentiators"
                                field="differentiators"
                                items={form.differentiators}
                                onAdd={(v) => setForm(p => ({ ...p, differentiators: [...p.differentiators, v] }))}
                                onRemove={(v) => setForm(p => ({ ...p, differentiators: p.differentiators.filter(s => s !== v) }))}
                                sourceBadge={<SourceBadge field="differentiators" />}
                            />
                        </div>
                    </div>
                )}

                {/* ─── Step 3: Firmographics the crawler can't know ────── */}
                {step === 3 && (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <div className="flex items-center mb-2">
                            <Building className="w-5 h-5 sm:w-6 sm:h-6 mr-3 text-stone-400" />
                            <h3 className="font-bold text-lg sm:text-xl">Business Profile</h3>
                        </div>
                        <p className="text-sm text-stone-500">
                            A few things our crawler can&apos;t see. All required — they drive scoring thresholds and set-aside eligibility.
                        </p>

                        {/* Company size */}
                        <div>
                            <label className="text-xs text-stone-500 uppercase tracking-widest block mb-3">Company Size *</label>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                {COMPANY_SIZE_OPTIONS.map(opt => (
                                    <button type="button" key={opt.value}
                                        onClick={() => updateForm("company_size", opt.value)}
                                        className={clsx(
                                            "text-left px-4 py-3 rounded-xl border transition-all",
                                            form.company_size === opt.value
                                                ? "bg-black text-white border-black"
                                                : "bg-white text-stone-700 border-stone-200 hover:border-stone-400",
                                        )}>
                                        <span className="block text-sm font-bold">{opt.label}</span>
                                        <span className={clsx(
                                            "block text-[11px]",
                                            form.company_size === opt.value ? "text-white/70" : "text-stone-400",
                                        )}>{opt.sublabel}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Employee count + Revenue */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs text-stone-500 uppercase tracking-widest block mb-2">Employee Count *</label>
                                <input type="number" min={1} max={1_000_000}
                                    value={form.employee_count}
                                    onChange={(e) => updateForm("employee_count", e.target.value)}
                                    className="w-full px-4 py-3.5 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm"
                                    placeholder="e.g. 24" />
                            </div>
                            <div>
                                <label className="text-xs text-stone-500 uppercase tracking-widest block mb-2">Annual Revenue *</label>
                                <select title="Annual Revenue"
                                    value={form.annual_revenue_range}
                                    onChange={(e) => updateForm("annual_revenue_range", e.target.value)}
                                    className="w-full px-4 py-3.5 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm bg-white">
                                    <option value="">Select range...</option>
                                    {REVENUE_RANGE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                                </select>
                            </div>
                        </div>

                        {/* Years in business */}
                        <div>
                            <label className="text-xs text-stone-500 uppercase tracking-widest block mb-2">Years in Business *</label>
                            <input type="number" min={0} max={200}
                                value={form.years_in_business}
                                onChange={(e) => {
                                    const v = e.target.value ? String(Math.min(parseInt(e.target.value, 10), 200)) : "";
                                    updateForm("years_in_business", v);
                                }}
                                className="w-full px-4 py-3.5 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm"
                                placeholder="e.g. 12" />
                        </div>

                        {/* Federal experience */}
                        <div>
                            <label className="text-xs text-stone-500 uppercase tracking-widest block mb-3">
                                Federal Contract Experience *
                                <InfoTooltip text="Have you ever held a prime federal contract? Subcontracts count if you were named on an award." />
                            </label>
                            <div className="flex gap-2">
                                {[
                                    { value: true, label: "Yes", icon: ShieldCheck },
                                    { value: false, label: "No, we're new to federal", icon: Target },
                                ].map(opt => {
                                    const Icon = opt.icon;
                                    return (
                                        <button type="button" key={String(opt.value)}
                                            onClick={() => updateForm("has_federal_experience", opt.value)}
                                            className={clsx(
                                                "flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border text-sm font-bold transition-all",
                                                form.has_federal_experience === opt.value
                                                    ? "bg-black text-white border-black"
                                                    : "bg-white text-stone-600 border-stone-200 hover:border-stone-400",
                                            )}>
                                            <Icon className="w-4 h-4" />
                                            {opt.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {form.has_federal_experience && (
                            <div>
                                <label className="text-xs text-stone-500 uppercase tracking-widest block mb-2">
                                    Federal Experience Notes
                                    <InfoTooltip text="Briefly: agencies, contract vehicles (GSA, SEWP, 8(a) STARS), notable awards. Optional but helps scoring." />
                                </label>
                                <textarea value={form.federal_experience_notes}
                                    onChange={(e) => updateForm("federal_experience_notes", e.target.value)}
                                    rows={3}
                                    className="w-full px-4 py-3 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm resize-none"
                                    placeholder="e.g. Prime on GSA Schedule 70 since 2021; 3 DoD task orders under $500K; active TS facility clearance." />
                            </div>
                        )}

                        {/* Keywords — boosts matches on niches NAICS can't express */}
                        <div className="pt-4 border-t border-stone-100">
                            <label className="text-xs text-stone-500 uppercase tracking-widest block mb-1">
                                Capability Keywords
                                <InfoTooltip text="Pick up to 3 primary + 5 secondary keywords that describe what you do. When an opportunity's NAICS doesn't match yours, we'll match against these in the title, description, and attachments — so niche capabilities (e.g. body armor, GIS, PPE) still get found." />
                            </label>
                            <p className="text-xs text-stone-500 mb-3">
                                Helps us surface opportunities even when NAICS doesn&apos;t line up.
                            </p>
                            <KeywordPicker
                                primary={form.primary_keywords}
                                secondary={form.secondary_keywords}
                                suggestions={keywordSuggestions}
                                onChange={(p, s) => setForm(prev => ({
                                    ...prev,
                                    primary_keywords: p,
                                    secondary_keywords: s,
                                }))}
                            />
                        </div>
                    </div>
                )}

                {/* Navigation */}
                <div className="flex justify-between mt-6 sm:mt-8 pt-5 sm:pt-6 border-t border-stone-100">
                    {step > 1 ? (
                        <button type="button" onClick={() => setStep(s => (s - 1) as 1 | 2 | 3)}
                            className="flex items-center px-5 sm:px-6 py-3 rounded-full border border-stone-200 text-stone-600 hover:bg-stone-50 font-bold text-sm transition-all">
                            <ArrowLeft className="w-4 h-4 mr-2" /> Back
                        </button>
                    ) : <div />}

                    {step === 1 ? null /* Step 1 uses Prefill button above */ : step === 2 ? (
                        <div className="flex items-center gap-3">
                            {!step2Valid && (
                                <span className="text-xs text-stone-400 font-medium hidden sm:inline">Pick at least one NAICS + state</span>
                            )}
                            <button type="button" onClick={() => setStep(3)}
                                disabled={!step2Valid}
                                className="flex items-center px-5 sm:px-6 py-3 rounded-full bg-black text-white hover:bg-stone-800 font-bold text-sm transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
                                Next <ArrowRight className="w-4 h-4 ml-2" />
                            </button>
                        </div>
                    ) : (
                        <button type="button" onClick={handleSave}
                            disabled={saving || !step3Valid || !step1Valid || !step2Valid}
                            className="flex items-center px-6 sm:px-8 py-3 rounded-full bg-emerald-600 text-white hover:bg-emerald-700 font-bold text-sm transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed">
                            {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</> : <><CheckCircle2 className="w-4 h-4 mr-2" /> Complete Setup</>}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Editable chip list used for services + differentiators ─────────────────
function EditableChipList({
    label, field, items, onAdd, onRemove, sourceBadge,
}: {
    label: string;
    field: string;
    items: string[];
    onAdd: (value: string) => void;
    onRemove: (value: string) => void;
    sourceBadge?: React.ReactNode;
}) {
    const [draft, setDraft] = useState("");
    return (
        <div>
            <label className="text-xs text-stone-500 uppercase tracking-widest block mb-2">
                {label}
                {sourceBadge}
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2 min-h-[32px]">
                {items.map(v => (
                    <span key={`${field}-${v}`}
                        className="inline-flex items-center bg-stone-900 text-white text-xs font-medium px-2.5 py-1 rounded-lg">
                        {v}
                        <button type="button" onClick={() => onRemove(v)} className="ml-1.5 hover:text-red-300" title={`Remove ${v}`}>
                            <X className="w-3 h-3" />
                        </button>
                    </span>
                ))}
                {items.length === 0 && (
                    <span className="text-xs text-stone-400 italic self-center">None yet — add below.</span>
                )}
            </div>
            <div className="flex gap-2">
                <input type="text" value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && draft.trim()) {
                            e.preventDefault();
                            onAdd(draft.trim());
                            setDraft("");
                        }
                    }}
                    className="flex-1 px-3 py-2 border border-stone-200 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm"
                    placeholder={`Add a ${label.toLowerCase().replace(/s$/, "")}...`} />
                <button type="button"
                    onClick={() => { if (draft.trim()) { onAdd(draft.trim()); setDraft(""); } }}
                    className="px-3 py-2 bg-stone-100 text-stone-700 rounded-lg font-bold text-xs hover:bg-stone-200 transition-all">
                    Add
                </button>
            </div>
        </div>
    );
}

export default function OnboardPage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-stone-50"><Loader2 className="w-8 h-8 animate-spin text-stone-400" /></div>}>
            <OnboardPageContent />
        </Suspense>
    );
}
