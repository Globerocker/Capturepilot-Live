"use client";

import { useState, useEffect, useCallback } from "react";
import {
    Settings, User, Bell, Building, MapPin, Shield, Loader2, CheckCircle2,
    Phone, Calendar, UserCheck, Search, AlertCircle, Briefcase, Truck,
    ShieldCheck, CreditCard, Receipt, ExternalLink, Download, Eye,
    Lock, AlertTriangle, Trash2, X, ChevronDown, ChevronUp,
} from "lucide-react";
import ServiceCTA from "@/components/ui/ServiceCTA";
import FeatureRequestForm from "@/components/FeatureRequestForm";
import ConsultingCTA from "@/components/ConsultingCTA";
import { createSupabaseClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import Link from "next/link";
import { NAICS_CODES } from "@/lib/naics-codes";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import { TeamMembersSection } from "@/components/TeamMembersSection";
import { PSC_CODES } from "@/lib/psc-codes";
import { FEDERAL_AGENCIES } from "@/lib/federal-agencies";
import KeywordPicker from "@/components/KeywordPicker";
import TeamManagement from "@/components/TeamManagement";
import { CollapsibleSection } from "@/components/ui/CollapsibleSection";

const supabase = createSupabaseClient();

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

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
    account_type: string;
    created_at: string;
    contact_name: string | null;
    primary_keywords: string[];
    secondary_keywords: string[];
}

interface SubscriptionData {
    id: string;
    status: string;
    plan_name: string;
    interval: string;
    interval_count: number;
    unit_amount: number;
    currency: string;
    current_period_start: number;
    current_period_end: number;
    cancel_at_period_end: boolean;
    cancel_at: number | null;
    canceled_at: number | null;
    trial_start: number | null;
    trial_end: number | null;
    payment_method: {
        brand: string | null;
        last4: string | null;
        exp_month: number | null;
        exp_year: number | null;
    } | null;
    created: number;
}

interface Invoice {
    id: string;
    number: string | null;
    status: string | null;
    amount: number;
    currency: string;
    created: number;
    period_start: number;
    period_end: number;
    pdf_url: string | null;
    hosted_url: string | null;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function formatDate(ts: number): string {
    return new Date(ts * 1000).toLocaleDateString("en-US", {
        month: "short", day: "numeric", year: "numeric",
    });
}

function formatDateLong(ts: number): string {
    return new Date(ts * 1000).toLocaleDateString("en-US", {
        month: "long", day: "numeric", year: "numeric",
    });
}

function formatCurrency(amount: number, currency = "usd"): string {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: currency.toUpperCase(),
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    }).format(amount);
}

function capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                    */
/* ------------------------------------------------------------------ */

function SubscriptionStatusBadge({ status }: { status: string }) {
    const map: Record<string, { bg: string; text: string; label: string }> = {
        active:   { bg: "bg-emerald-100", text: "text-emerald-700", label: "Active" },
        trialing: { bg: "bg-blue-100",    text: "text-blue-700",    label: "Trial" },
        past_due: { bg: "bg-amber-100",   text: "text-amber-700",   label: "Past Due" },
        canceled: { bg: "bg-red-100",     text: "text-red-700",     label: "Canceled" },
        free:     { bg: "bg-stone-100",   text: "text-stone-600",   label: "Free" },
        incomplete:       { bg: "bg-amber-100",   text: "text-amber-700",   label: "Incomplete" },
        incomplete_expired: { bg: "bg-red-100", text: "text-red-700", label: "Expired" },
        unpaid:   { bg: "bg-red-100",     text: "text-red-700",     label: "Unpaid" },
    };
    const s = map[status] || map.free;
    return (
        <span className={clsx(s.bg, s.text, "px-3 py-1 rounded-full text-xs font-bold uppercase")}>
            {s.label}
        </span>
    );
}

function InvoiceStatusBadge({ status }: { status: string | null }) {
    const map: Record<string, { bg: string; text: string; label: string }> = {
        paid:       { bg: "bg-emerald-50 border-emerald-200", text: "text-emerald-700", label: "Paid" },
        open:       { bg: "bg-amber-50 border-amber-200",     text: "text-amber-700",   label: "Open" },
        draft:      { bg: "bg-stone-50 border-stone-200",     text: "text-stone-500",   label: "Draft" },
        void:       { bg: "bg-red-50 border-red-200",         text: "text-red-600",     label: "Void" },
        uncollectible: { bg: "bg-red-50 border-red-200",      text: "text-red-600",     label: "Uncollectible" },
    };
    const s = map[status || "draft"] || map.draft;
    return (
        <span className={clsx(s.bg, s.text, "border px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase")}>
            {s.label}
        </span>
    );
}

function SkeletonBlock({ className }: { className?: string }) {
    return <div className={clsx("animate-pulse bg-stone-100 rounded-lg", className)} />;
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                    */
/* ------------------------------------------------------------------ */

export default function SettingsPage() {
    const router = useRouter();

    // Core profile state
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [userEmail, setUserEmail] = useState("");
    const [profile, setProfile] = useState<Profile | null>(null);
    const [naicsSearch, setNaicsSearch] = useState("");

    // Active-section tracker for the sticky nav — IntersectionObserver-driven
    // so the highlighted tab follows the user as they scroll. Falls back to
    // anchor-only behavior if IO isn't available (very old browsers).
    const [activeSection, setActiveSection] = useState<string>("account");
    useEffect(() => {
        if (typeof window === "undefined" || !("IntersectionObserver" in window)) return;
        const sectionIds = ["account", "profile", "subscription", "invoices", "password", "danger-zone"];
        const els = sectionIds
            .map(id => document.getElementById(id))
            .filter((e): e is HTMLElement => !!e);
        if (els.length === 0) return;
        const io = new IntersectionObserver(
            (entries) => {
                const hit = entries
                    .filter(e => e.isIntersecting)
                    .sort((a, b) => (a.boundingClientRect.top - b.boundingClientRect.top))[0];
                if (hit?.target.id) setActiveSection(hit.target.id);
            },
            { rootMargin: "-30% 0px -55% 0px", threshold: 0 },
        );
        els.forEach(el => io.observe(el));
        return () => io.disconnect();
    }, [loading]);
    const [pscSearch, setPscSearch] = useState("");
    const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

    // Subscription & billing state
    const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
    const [subLoading, setSubLoading] = useState(true);
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [invoicesLoading, setInvoicesLoading] = useState(true);
    const [portalLoading, setPortalLoading] = useState(false);

    // Password state
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [passwordSaving, setPasswordSaving] = useState(false);
    const [passwordMsg, setPasswordMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

    // Delete account state
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleteConfirmText, setDeleteConfirmText] = useState("");
    const [deleting, setDeleting] = useState(false);

    // Section collapse state
    const [invoicesExpanded, setInvoicesExpanded] = useState(true);

    /* ---- Load profile ---- */
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

    /* ---- Load subscription details ---- */
    useEffect(() => {
        async function loadSubscription() {
            try {
                const res = await fetch("/api/stripe/subscription");
                if (res.ok) {
                    const data = await res.json();
                    setSubscription(data.subscription || null);
                }
            } catch {
                // Silently fail — subscription section will show fallback
            } finally {
                setSubLoading(false);
            }
        }
        loadSubscription();
    }, []);

    /* ---- Load invoices ---- */
    useEffect(() => {
        async function loadInvoices() {
            try {
                const res = await fetch("/api/stripe/invoices");
                if (res.ok) {
                    const data = await res.json();
                    setInvoices(data.invoices || []);
                }
            } catch {
                // Silently fail
            } finally {
                setInvoicesLoading(false);
            }
        }
        loadInvoices();
    }, []);

    /* ---- Scroll to hash ---- */
    useEffect(() => {
        if (loading || !profile) return;
        const hash = window.location.hash?.replace("#", "");
        if (!hash) return;
        const timeout = setTimeout(() => {
            const el = document.getElementById(hash);
            if (el) {
                el.scrollIntoView({ behavior: "smooth", block: "center" });
                el.classList.add("pulse-highlight");
                setTimeout(() => el.classList.remove("pulse-highlight"), 2500);
            }
        }, 300);
        return () => clearTimeout(timeout);
    }, [loading, profile]);

    /* ---- Profile helpers ---- */
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
                email: profile.email,
                contact_name: profile.contact_name,
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
                primary_keywords: profile.primary_keywords || [],
                secondary_keywords: profile.secondary_keywords || [],
            })
            .eq("auth_user_id", user.id);

        if (error) {
            alert("Failed to save: " + error.message);
        } else {
            setSaved(true);
            // Kick off a fresh match refresh in the background. Profile fields
            // like NAICS / keywords / certifications directly affect scoring —
            // waiting for the 03:00 UTC cron to re-score would make settings
            // feel unresponsive. We intentionally don't await it.
            fetch("/api/matches/refresh", { method: "POST" }).catch(() => {
                // non-fatal: user can still hit the manual refresh button on /matches
            });
        }
        setSaving(false);
    };

    /* ---- Stripe portal ---- */
    const openStripePortal = useCallback(async () => {
        setPortalLoading(true);
        try {
            const res = await fetch("/api/stripe/portal", { method: "POST" });
            const data = await res.json();
            if (data.url) {
                window.location.href = data.url;
            } else {
                setPortalLoading(false);
            }
        } catch {
            setPortalLoading(false);
        }
    }, []);

    /* ---- Password update ---- */
    const handlePasswordUpdate = async () => {
        setPasswordMsg(null);
        if (newPassword.length < 8) {
            setPasswordMsg({ type: "error", text: "Password must be at least 8 characters." });
            return;
        }
        if (newPassword !== confirmPassword) {
            setPasswordMsg({ type: "error", text: "Passwords do not match." });
            return;
        }
        setPasswordSaving(true);
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (error) {
            setPasswordMsg({ type: "error", text: error.message });
        } else {
            setPasswordMsg({ type: "success", text: "Password updated successfully." });
            setNewPassword("");
            setConfirmPassword("");
        }
        setPasswordSaving(false);
    };

    /* ---- Delete account — GDPR-style 7-day deletion request.
       Submitting creates a row in account_deletion_requests; the weekly
       db_cleanup cron does the actual auth.users.deleteUser() once the
       grace window expires. User can cancel until then via DELETE on
       the same endpoint. */
    const handleDeleteAccount = async () => {
        if (deleteConfirmText !== "DELETE") return;
        setDeleting(true);
        try {
            const res = await fetch("/api/account/delete-request", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
            });
            const body = await res.json().catch(() => ({}));
            if (res.ok) {
                alert(
                    "Deletion scheduled. Your account will be permanently removed in 7 days. " +
                    "You can cancel any time before then from this same Settings page.",
                );
                setShowDeleteModal(false);
                setDeleteConfirmText("");
            } else {
                alert(body.error || "Failed to schedule deletion. Please contact support.");
            }
        } catch {
            alert("Failed to schedule deletion. Please contact support.");
        } finally {
            setDeleting(false);
        }
    };

    /* ---- Derived values ---- */
    const accountTypeBadge = () => {
        if (!profile) return { label: "Free", bg: "bg-stone-100", text: "text-stone-600" };
        const tier = profile.plan_tier || "free";
        const accountType = profile.account_type || "self_service";
        if (accountType === "consulting") return { label: "Consulting", bg: "bg-emerald-100", text: "text-emerald-700" };
        if (tier === "pro" || subscription?.status === "active" || subscription?.status === "trialing") return { label: "Pro", bg: "bg-emerald-100", text: "text-emerald-700" };
        if (tier === "free_beta") return { label: "Free Beta", bg: "bg-blue-100", text: "text-blue-700" };
        return { label: "Free", bg: "bg-stone-100", text: "text-stone-600" };
    };

    const badge = accountTypeBadge();

    const memberSince = profile?.created_at
        ? new Date(profile.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" })
        : null;

    // Trial days remaining
    const trialDaysLeft = subscription?.trial_end
        ? Math.max(0, Math.ceil((subscription.trial_end * 1000 - Date.now()) / (1000 * 60 * 60 * 24)))
        : null;

    const trialTotalDays = subscription?.trial_start && subscription?.trial_end
        ? Math.max(1, Math.ceil((subscription.trial_end - subscription.trial_start) / (60 * 60 * 24)))
        : null;

    const trialProgress = trialDaysLeft !== null && trialTotalDays !== null
        ? Math.max(0, Math.min(100, ((trialTotalDays - trialDaysLeft) / trialTotalDays) * 100))
        : null;

    /* ---- Loading state ---- */
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

    /* ================================================================ */
    /*  RENDER                                                          */
    /* ================================================================ */

    return (
        <div className="w-full 2xl:max-w-[1600px] mx-auto space-y-6 animate-in fade-in duration-500 pb-16 px-1">
            {/* ---- Header (full width) ---- */}
            <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
                <div>
                    <h2 className="text-2xl sm:text-3xl font-bold tracking-tighter text-black flex items-center">
                        <Settings className="mr-3 w-6 h-6 sm:w-8 sm:h-8" /> Settings
                    </h2>
                    <p className="text-stone-500 mt-1 font-medium text-sm">
                        Manage your account, subscription, and business profile
                    </p>
                </div>
                <button
                    type="button"
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

            {/* ---- Sticky section nav (active state follows scroll) ---- */}
            <nav
                className="sticky top-0 z-20 -mx-1 px-1 py-2 bg-stone-50/95 backdrop-blur border-b border-stone-200 flex gap-1 overflow-x-auto"
                aria-label="Settings sections"
            >
                {[
                    { id: "account", label: "Account" },
                    { id: "profile", label: "Profile" },
                    { id: "subscription", label: "Subscription" },
                    { id: "invoices", label: "Invoices" },
                    { id: "password", label: "Password" },
                    { id: "danger-zone", label: "Danger Zone" },
                ].map(({ id, label }) => {
                    const isActive = activeSection === id;
                    return (
                        <a
                            key={id}
                            href={`#${id}`}
                            onClick={() => setActiveSection(id)}
                            className={clsx(
                                "shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition",
                                isActive
                                    ? id === "danger-zone"
                                        ? "bg-red-600 text-white shadow-sm"
                                        : "bg-black text-white shadow-sm"
                                    : "text-stone-600 hover:bg-stone-100 hover:text-black",
                            )}
                            aria-current={isActive ? "true" : undefined}
                        >
                            {label}
                        </a>
                    );
                })}
            </nav>

            {/* ================================================================ */}
            {/*  Two-column grid on lg+ (single column on smaller screens)       */}
            {/*  Uses grid-auto-flow:dense + col-start utilities per section so  */}
            {/*  sections don't need to be re-ordered in source.                 */}
            {/* ================================================================ */}
            
            {/* ================================================================ */}
            {/*  Two flex columns for independent height flow                  */}
            {/* ================================================================ */}
            <div className="flex flex-col lg:flex-row gap-6 items-start w-full">

                {/* LEFT COLUMN */}
                <div className="w-full lg:w-1/2 flex flex-col gap-6">
                    <section id="account" className="bg-white rounded-2xl border border-stone-200 shadow-sm p-5 sm:p-7 scroll-mt-20">

                <p className="text-stone-400 text-xs uppercase tracking-widest font-bold mb-4">Account Overview</p>
                <div className="space-y-0">
                    {/* Email */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 py-3.5 border-b border-stone-100">
                        <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-stone-400" />
                            <div>
                                <p className="font-medium text-sm">Email</p>
                                <p className="text-[11px] text-stone-400">Your login email address</p>
                            </div>
                        </div>
                        <p className="text-sm font-mono text-stone-600">{userEmail}</p>
                    </div>

                    {/* Company Name */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 py-3.5 border-b border-stone-100">
                        <div className="flex items-center gap-2">
                            <Building className="w-4 h-4 text-stone-400" />
                            <div>
                                <p className="font-medium text-sm">Company</p>
                                <p className="text-[11px] text-stone-400">Your business entity name</p>
                            </div>
                        </div>
                        <p className="text-sm font-medium text-stone-700">{profile.company_name || "Not set"}</p>
                    </div>

                    {/* Account Type */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 py-3.5 border-b border-stone-100">
                        <div className="flex items-center gap-2">
                            <CreditCard className="w-4 h-4 text-stone-400" />
                            <div>
                                <p className="font-medium text-sm">Plan</p>
                                <p className="text-[11px] text-stone-400">Your current subscription tier</p>
                            </div>
                        </div>
                        <span className={clsx(badge.bg, badge.text, "px-3 py-1 rounded-full text-xs font-bold uppercase")}>
                            {badge.label}
                        </span>
                    </div>

                    {/* Member Since */}
                    {memberSince && (
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 py-3.5">
                            <div className="flex items-center gap-2">
                                <Calendar className="w-4 h-4 text-stone-400" />
                                <div>
                                    <p className="font-medium text-sm">Member Since</p>
                                    <p className="text-[11px] text-stone-400">When you joined CapturePilot</p>
                                </div>
                            </div>
                            <p className="text-sm text-stone-600">{memberSince}</p>
                        </div>
                    )}
                </div>
            </section>

            {/* ================================================================ */}
            {/*  SECTION 2: Subscription Management                              */}
            {/* ================================================================ */}
            

                    <section id="profile" className="bg-white rounded-2xl border border-stone-200 shadow-sm p-5 sm:p-7 scroll-mt-20">

                <p className="text-stone-400 text-xs uppercase tracking-widest font-bold mb-4">Profile Settings</p>
                <div className="space-y-4">
                    <div>
                        <label className="text-xs text-stone-500 uppercase tracking-widest block mb-1.5">Company Name</label>
                        <input id="company-name" type="text" placeholder="Legal Business Name" value={profile.company_name || ""} onChange={(e) => updateProfile("company_name", e.target.value)}
                            className="w-full px-4 py-3 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm" />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs text-stone-500 uppercase tracking-widest block mb-1.5">Contact Name</label>
                            <input type="text" placeholder="Full Name" value={profile.contact_name || ""} onChange={(e) => updateProfile("contact_name", e.target.value)}
                                className="w-full px-4 py-3 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm" />
                        </div>
                        <div>
                            <label className="text-xs text-stone-500 uppercase tracking-widest block mb-1.5">Contact Email</label>
                            <input type="email" placeholder="contact@company.com" value={profile.email || ""} onChange={(e) => updateProfile("email", e.target.value)}
                                className="w-full px-4 py-3 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm" />
                        </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs text-stone-500 uppercase tracking-widest block mb-1.5">Phone</label>
                            <input id="phone" type="tel" placeholder="(555) 123-4567" value={profile.phone || ""} onChange={(e) => updateProfile("phone", e.target.value)}
                                className="w-full px-4 py-3 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm" />
                        </div>
                        <div>
                            <label className="text-xs text-stone-500 uppercase tracking-widest block mb-1.5">Website</label>
                            <input id="website" type="text" placeholder="www.example.com" value={profile.website || ""} onChange={(e) => updateProfile("website", e.target.value)}
                                className="w-full px-4 py-3 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm" />
                        </div>
                    </div>

                    {/* DBA + Registration */}
                    <div>
                        <label className="text-xs text-stone-500 uppercase tracking-widest block mb-1.5">DBA Name <span className="text-stone-400 normal-case">(optional)</span></label>
                        <input type="text" placeholder="Doing Business As" value={profile.dba_name || ""} onChange={(e) => updateProfile("dba_name", e.target.value)}
                            className="w-full px-4 py-3 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm" />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs text-stone-500 uppercase tracking-widest block mb-1.5">UEI <span className="text-stone-400 normal-case">(12 alphanumeric)</span> <InfoTooltip text="Unique Entity Identifier -- your 12-character code assigned when you register on SAM.gov. Required for all federal contracts." /></label>
                            <input id="uei" type="text" placeholder="e.g. ABC123DEF456" maxLength={12} value={profile.uei || ""}
                                onChange={(e) => { updateProfile("uei", e.target.value.replace(/[^A-Za-z0-9]/g, "")); setValidationErrors(prev => ({ ...prev, uei: "" })); }}
                                className={clsx("w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm font-mono uppercase",
                                    validationErrors.uei ? "border-red-400" : "border-stone-200")} />
                            {validationErrors.uei && <p className="text-xs text-red-500 mt-1 flex items-center"><AlertCircle className="w-3 h-3 mr-1" />{validationErrors.uei}</p>}
                        </div>
                        <div>
                            <label className="text-xs text-stone-500 uppercase tracking-widest block mb-1.5">CAGE Code <span className="text-stone-400 normal-case">(5 alphanumeric)</span> <InfoTooltip text="Commercial and Government Entity Code -- a 5-character ID assigned by the Department of Defense during SAM.gov registration." /></label>
                            <input id="cage-code" type="text" placeholder="e.g. 7ABC1" maxLength={5} value={profile.cage_code || ""}
                                onChange={(e) => { updateProfile("cage_code", e.target.value.replace(/[^A-Za-z0-9]/g, "")); setValidationErrors(prev => ({ ...prev, cage_code: "" })); }}
                                className={clsx("w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm font-mono uppercase",
                                    validationErrors.cage_code ? "border-red-400" : "border-stone-200")} />
                            {validationErrors.cage_code && <p className="text-xs text-red-500 mt-1 flex items-center"><AlertCircle className="w-3 h-3 mr-1" />{validationErrors.cage_code}</p>}
                        </div>
                    </div>

                    {/* Address */}
                    <div>
                        <label className="text-xs text-stone-500 uppercase tracking-widest block mb-1.5">Street Address</label>
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
                            <label className="text-xs text-stone-500 uppercase tracking-widest block mb-1.5">City</label>
                            <input type="text" placeholder="City" value={profile.city || ""} onChange={(e) => updateProfile("city", e.target.value)}
                                className="w-full px-4 py-3 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm" />
                        </div>
                        <div>
                            <label className="text-xs text-stone-500 uppercase tracking-widest block mb-1.5">State</label>
                            <select id="state" title="State" value={profile.state || ""} onChange={(e) => updateProfile("state", e.target.value)}
                                className="w-full px-3 py-3 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm bg-white">
                                <option value="">--</option>
                                {STATE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-xs text-stone-500 uppercase tracking-widest block mb-1.5">ZIP</label>
                            <input type="text" placeholder="ZIP" value={profile.zip_code || ""} onChange={(e) => updateProfile("zip_code", e.target.value)}
                                className="w-full px-4 py-3 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm font-mono" />
                        </div>
                    </div>

                    {/* Save Profile Button */}
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={saving}
                        className={clsx(
                            "flex items-center px-6 py-2.5 rounded-full font-bold text-sm transition-all shadow-sm mt-2",
                            saved ? "bg-emerald-600 text-white" : "bg-black text-white hover:bg-stone-800 active:bg-stone-700"
                        )}
                    >
                        {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</> :
                         saved ? <><CheckCircle2 className="w-4 h-4 mr-2" /> Saved</> :
                         "Save Profile"}
                    </button>
                </div>
            </section>

            

                    {/* ---- Advanced Settings Toggle ---- */}

            <button type="button" onClick={() => setShowAdvanced(!showAdvanced)}
                className="w-full bg-stone-50 border border-stone-200 rounded-2xl p-4 text-left hover:bg-stone-100 transition-colors flex items-center justify-between">
                <span className="text-sm font-bold text-stone-600">
                    {showAdvanced ? "Hide Advanced Settings" : "Show Advanced Settings"}
                </span>
                <span className="text-xs text-stone-400">
                    Capacity, PSC Codes, Clearances, Agency Preferences
                </span>
            </button>

            
                    {showAdvanced && (<>
                        {/* Capacity & Experience */}
                        <CollapsibleSection title="Capacity & Experience" icon={Briefcase} storageKey="capacity" defaultOpen>
                <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs text-stone-500 uppercase tracking-widest block mb-1.5">Employee Count</label>
                            <select id="employee-count" title="Employee Count" value={profile.employee_count || ""} onChange={(e) => updateProfile("employee_count", e.target.value ? parseInt(e.target.value) : null)}
                                className="w-full px-4 py-3 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm bg-white">
                                <option value="">Select range...</option>
                                <option value="5">1-5</option>
                                <option value="15">6-20</option>
                                <option value="35">21-50</option>
                                <option value="75">51-100</option>
                                <option value="150">101-250</option>
                                <option value="500">250+</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-xs text-stone-500 uppercase tracking-widest block mb-1.5">Annual Revenue</label>
                            <select title="Annual Revenue" value={profile.revenue || ""} onChange={(e) => updateProfile("revenue", e.target.value ? parseInt(e.target.value) : null)}
                                className="w-full px-4 py-3 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm bg-white">
                                <option value="">Select range...</option>
                                <option value="100000">Under $100K</option>
                                <option value="500000">$100K - $500K</option>
                                <option value="1000000">$500K - $1M</option>
                                <option value="5000000">$1M - $5M</option>
                                <option value="10000000">$5M - $10M</option>
                                <option value="25000000">$10M - $25M</option>
                                <option value="50000000">$25M+</option>
                            </select>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs text-stone-500 uppercase tracking-widest block mb-1.5">Years in Business</label>
                            <input id="years-in-business" type="number" min={0} max={200} placeholder="e.g. 5" value={profile.years_in_business && profile.years_in_business > 200 ? "" : (profile.years_in_business ?? "")} onChange={(e) => { const v = e.target.value ? Math.min(parseInt(e.target.value), 200) : null; updateProfile("years_in_business", v); }}
                                className="w-full px-4 py-3 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm" />
                        </div>
                        <div>
                            <label className="text-xs text-stone-500 uppercase tracking-widest block mb-1.5">Past Federal Awards</label>
                            <input id="past-federal-awards" type="number" min={0} placeholder="Number of past federal contracts (0 if none)" value={profile.federal_awards_count ?? ""} onChange={(e) => updateProfile("federal_awards_count", e.target.value ? parseInt(e.target.value) : 0)}
                                className="w-full px-4 py-3 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm" />
                        </div>
                    </div>
                    <div>
                        <label className="text-xs text-stone-500 uppercase tracking-widest block mb-1.5">Service Radius</label>
                        <div className="relative">
                            <input type="number" min={0} placeholder="miles" value={profile.service_radius_miles ?? ""} onChange={(e) => updateProfile("service_radius_miles", e.target.value ? parseInt(e.target.value) : null)}
                                className="w-full px-4 py-3 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm pr-16" />
                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-stone-400">miles</span>
                        </div>
                    </div>
                    <div>
                        <label className="text-xs text-stone-500 uppercase tracking-widest block mb-2">Operational Capabilities</label>
                        <div className="flex flex-wrap gap-2">
                            <button type="button" onClick={() => updateProfile("has_bonding", !profile.has_bonding)}
                                className={clsx(
                                    "flex items-center px-4 py-2.5 rounded-xl border text-xs font-bold transition-all",
                                    profile.has_bonding
                                        ? "bg-black text-white border-black"
                                        : "bg-white text-stone-600 border-stone-200 hover:border-stone-400 active:bg-stone-100"
                                )}>
                                <ShieldCheck className="w-4 h-4 mr-1.5" /> Bonded / Insured
                            </button>
                            <button type="button" onClick={() => updateProfile("has_fleet", !profile.has_fleet)}
                                className={clsx(
                                    "flex items-center px-4 py-2.5 rounded-xl border text-xs font-bold transition-all",
                                    profile.has_fleet
                                        ? "bg-black text-white border-black"
                                        : "bg-white text-stone-600 border-stone-200 hover:border-stone-400 active:bg-stone-100"
                                )}>
                                <Truck className="w-4 h-4 mr-1.5" /> Fleet / Vehicles
                            </button>
                            <button type="button" onClick={() => updateProfile("has_municipal_exp", !profile.has_municipal_exp)}
                                className={clsx(
                                    "flex items-center px-4 py-2.5 rounded-xl border text-xs font-bold transition-all",
                                    profile.has_municipal_exp
                                        ? "bg-black text-white border-black"
                                        : "bg-white text-stone-600 border-stone-200 hover:border-stone-400 active:bg-stone-100"
                                )}>
                                <Building className="w-4 h-4 mr-1.5" /> Gov Experience
                            </button>
                        </div>
                    </div>
                </div>
            </CollapsibleSection>


                        {/* Industry */}
                        <CollapsibleSection title="Industry & Certifications" icon={Shield} storageKey="industry" defaultOpen>
                <div className="space-y-4">
                    <div>
                        <label className="text-xs text-stone-500 uppercase tracking-widest block mb-2">NAICS Codes <InfoTooltip text="North American Industry Classification System -- codes that describe your industry. The government uses these to categorize opportunities by service/product type." /></label>
                        <div className="relative mb-2">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                            <input id="naics-codes" type="text" placeholder="Search by code or name..." value={naicsSearch} onChange={(e) => setNaicsSearch(e.target.value)}
                                className="w-full pl-9 pr-4 py-2.5 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm" />
                        </div>
                        {(profile.naics_codes || []).length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mb-2">
                                {(profile.naics_codes || []).map(code => {
                                    return (
                                        <button type="button" key={code} onClick={() => toggleArray("naics_codes", code)}
                                            className="flex items-center bg-black text-white px-2.5 py-1 rounded-full text-xs gap-1">
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
                        <label className="text-xs text-stone-500 uppercase tracking-widest block mb-2">SBA Certifications <InfoTooltip text="Small Business Administration certifications that qualify you for set-aside contracts reserved for specific business categories (8(a), HUBZone, SDVOSB, WOSB, etc.)." /></label>
                        <div id="sba-certifications" className="flex flex-wrap gap-2">
                            {CERT_OPTIONS.map(c => (
                                <button type="button" key={c.value} onClick={() => toggleArray("sba_certifications", c.value)}
                                    className={clsx(
                                        "px-3 py-2 rounded-full border text-xs font-bold uppercase transition-all",
                                        (profile.sba_certifications || []).includes(c.value)
                                            ? "bg-black text-white border-black"
                                            : "bg-white text-stone-600 border-stone-200 hover:border-stone-400 active:bg-stone-100"
                                    )}>
                                    {c.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div id="capability-keywords">
                        <label className="text-xs text-stone-500 uppercase tracking-widest block mb-2">
                            Capability Keywords
                            <InfoTooltip text="Up to 3 primary + 5 secondary keywords that describe what you do. When an opportunity's NAICS doesn't match yours, we match against these in the title, description, and attachment text — so niche capabilities (e.g. body armor, GIS, PPE) still get found. Primary hits count fully; secondary hits refine." />
                        </label>
                        <KeywordPicker
                            primary={profile.primary_keywords || []}
                            secondary={profile.secondary_keywords || []}
                            onChange={(p, s) => {
                                setProfile({ ...profile, primary_keywords: p, secondary_keywords: s });
                                setSaved(false);
                            }}
                        />
                    </div>
                </div>
            </CollapsibleSection>


                        {/* PSC Codes & Clearances */}
                        <CollapsibleSection title="Service Codes & Clearances" icon={Shield} storageKey="psc-clearances">
                <div className="space-y-4">
                    <div>
                        <label className="text-xs text-stone-500 uppercase tracking-widest block mb-2">Product/Service Codes (PSC) <InfoTooltip text="PSC codes describe the specific products or services you provide to the government. These help match you to opportunities beyond NAICS." /></label>
                        <div className="relative mb-2">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                            <input type="text" placeholder="Search PSC codes..." value={pscSearch} onChange={(e) => setPscSearch(e.target.value)}
                                className="w-full pl-9 pr-4 py-2.5 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm" />
                        </div>
                        {(profile.target_psc_codes || []).length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mb-2">
                                {(profile.target_psc_codes || []).map(code => (
                                    <button type="button" key={code} title={`Remove ${code}`} onClick={() => toggleArray("target_psc_codes", code)}
                                        className="flex items-center bg-black text-white px-2.5 py-1 rounded-full text-xs gap-1">
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
                        <label className="text-xs text-stone-500 uppercase tracking-widest block mb-2">Security Clearances</label>
                        <div className="flex flex-wrap gap-2">
                            {["Confidential", "Secret", "Top Secret", "TS/SCI"].map(c => (
                                <button type="button" key={c} onClick={() => toggleArray("security_clearances", c)}
                                    className={clsx(
                                        "px-3 py-2 rounded-full border text-xs font-bold uppercase transition-all",
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
            </CollapsibleSection>


                        {/* Preferred Agencies & Contract Preferences */}
                        <CollapsibleSection title="Targeting Preferences" icon={Building} storageKey="targeting">
                <div className="space-y-4">
                    <div>
                        <label className="text-xs text-stone-500 uppercase tracking-widest block mb-2">Preferred Agencies</label>
                        <div className="flex flex-wrap gap-1.5">
                            {FEDERAL_AGENCIES.filter(a => a.popular).map(a => (
                                <button type="button" key={a.code} onClick={() => toggleArray("preferred_agencies", a.code)}
                                    className={clsx(
                                        "px-3 py-2 rounded-lg border text-xs font-bold transition-all",
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
                            <label className="text-xs text-stone-500 uppercase tracking-widest block mb-1.5">Min Contract Value</label>
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
                            <label className="text-xs text-stone-500 uppercase tracking-widest block mb-1.5">Max Contract Value</label>
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
                        <label className="text-xs text-stone-500 uppercase tracking-widest block mb-2">Role Preference</label>
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
            </CollapsibleSection>

                    </>)}

                    {/* Target States */}
                    <CollapsibleSection title="Target States" icon={MapPin} storageKey="target-states" defaultOpen>
                <button type="button" onClick={() => {
                    if ((profile.target_states || []).includes("NATIONWIDE")) {
                        setProfile({ ...profile, target_states: [] });
                    } else {
                        setProfile({ ...profile, target_states: ["NATIONWIDE"] });
                    }
                    setSaved(false);
                }} className={clsx(
                    "w-full px-4 py-3 rounded-xl border-2 text-sm font-bold transition-all mb-3",
                    (profile.target_states || []).includes("NATIONWIDE")
                        ? "bg-emerald-50 text-emerald-700 border-emerald-400"
                        : "bg-white text-stone-600 border-stone-200 hover:border-stone-400"
                )}>
                    {(profile.target_states || []).includes("NATIONWIDE") ? "Nationwide -- All 50 States" : "Select Nationwide (All States)"}
                </button>

                {!(profile.target_states || []).includes("NATIONWIDE") && (
                    <div id="target-states" className="flex flex-wrap gap-1.5 max-h-[150px] overflow-y-auto pr-1">
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
                )}
                {(profile.target_states || []).length > 0 && !(profile.target_states || []).includes("NATIONWIDE") && (
                    <p className="text-xs text-emerald-600 font-bold mt-2">{profile.target_states.length} states selected</p>
                )}
            </CollapsibleSection>

            
                </div>

                {/* RIGHT COLUMN */}
                <div className="w-full lg:w-1/2 flex flex-col gap-6">
                    {/* Team — invite teammates, manage roles, see seat usage */}
                    <TeamManagement />

                    <section id="subscription" className="bg-white rounded-2xl border border-stone-200 shadow-sm p-5 sm:p-7 scroll-mt-20">

                <p className="text-stone-400 text-xs uppercase tracking-widest font-bold mb-4">Subscription</p>

                {subLoading ? (
                    <div className="space-y-4">
                        <SkeletonBlock className="h-6 w-48" />
                        <SkeletonBlock className="h-4 w-72" />
                        <SkeletonBlock className="h-4 w-56" />
                        <SkeletonBlock className="h-10 w-40 mt-2" />
                    </div>
                ) : subscription ? (
                    <div className="space-y-4">
                        {/* Plan name + status */}
                        <div className="flex items-start justify-between">
                            <div>
                                <h3 className="text-xl font-bold text-stone-900">{subscription.plan_name}</h3>
                                <p className="text-xs text-stone-500 mt-0.5">
                                    {subscription.interval === "year"
                                        ? `${formatCurrency(subscription.unit_amount)}/yr`
                                        : `${formatCurrency(subscription.unit_amount)}/mo`}
                                    {subscription.interval === "year" && (
                                        <span className="ml-2 text-emerald-600 font-bold">Save 20%</span>
                                    )}
                                </p>
                            </div>
                            <SubscriptionStatusBadge status={subscription.status} />
                        </div>

                        {/* Trial countdown */}
                        {subscription.status === "trialing" && trialDaysLeft !== null && (
                            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                                <div className="flex items-center justify-between mb-2">
                                    <p className="text-sm text-blue-800 font-medium">
                                        {trialDaysLeft} day{trialDaysLeft !== 1 ? "s" : ""} remaining in trial
                                    </p>
                                    <span className="text-xs text-blue-600 font-bold">
                                        {trialDaysLeft}/{trialTotalDays}
                                    </span>
                                </div>
                                {trialProgress !== null && (
                                    <div className="w-full bg-blue-200 rounded-full h-2">
                                        <div
                                            className="bg-blue-500 rounded-full h-2 transition-all duration-500"
                                            style={{ width: `${trialProgress}%` }}
                                        />
                                    </div>
                                )}
                                <p className="text-xs text-blue-600 mt-2">
                                    Trial ends {subscription.trial_end ? formatDateLong(subscription.trial_end) : ""}.
                                    Full Pro features are unlocked.
                                </p>
                            </div>
                        )}

                        {/* Past due warning */}
                        {subscription.status === "past_due" && (
                            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                                <div className="flex items-center gap-2 mb-1">
                                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                                    <span className="text-sm font-bold text-amber-800">Payment failed</span>
                                </div>
                                <p className="text-xs text-amber-700">
                                    Please update your payment method to avoid losing access.
                                </p>
                            </div>
                        )}

                        {/* Cancellation notice */}
                        {subscription.cancel_at_period_end && (
                            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                                <div className="flex items-center gap-2 mb-1">
                                    <AlertTriangle className="w-4 h-4 text-red-500" />
                                    <span className="text-sm font-bold text-red-800">Cancellation scheduled</span>
                                </div>
                                <p className="text-xs text-red-700">
                                    Your subscription will end on {formatDateLong(subscription.current_period_end)}.
                                    You can reactivate anytime before then.
                                </p>
                            </div>
                        )}

                        {/* Period & payment info */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="bg-stone-50 rounded-xl p-3.5">
                                <p className="text-[10px] text-stone-400 uppercase tracking-widest mb-1">Current Period</p>
                                <p className="text-sm font-medium text-stone-700">
                                    {formatDate(subscription.current_period_start)} &mdash; {formatDate(subscription.current_period_end)}
                                </p>
                            </div>
                            <div className="bg-stone-50 rounded-xl p-3.5">
                                <p className="text-[10px] text-stone-400 uppercase tracking-widest mb-1">Next Billing Date</p>
                                <p className="text-sm font-medium text-stone-700">
                                    {subscription.cancel_at_period_end
                                        ? "N/A (canceling)"
                                        : formatDateLong(subscription.current_period_end)}
                                </p>
                            </div>
                        </div>

                        {/* Payment method */}
                        {subscription.payment_method && (
                            <div className="bg-stone-50 rounded-xl p-3.5">
                                <p className="text-[10px] text-stone-400 uppercase tracking-widest mb-1">Payment Method</p>
                                <div className="flex items-center gap-2">
                                    <CreditCard className="w-4 h-4 text-stone-500" />
                                    <p className="text-sm font-medium text-stone-700">
                                        {capitalize(subscription.payment_method.brand || "Card")} ending in {subscription.payment_method.last4}
                                    </p>
                                    {subscription.payment_method.exp_month && subscription.payment_method.exp_year && (
                                        <span className="text-xs text-stone-400 ml-1">
                                            Exp {String(subscription.payment_method.exp_month).padStart(2, "0")}/{subscription.payment_method.exp_year}
                                        </span>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Action buttons */}
                        <div className="flex flex-wrap gap-2 pt-1">
                            <button
                                type="button"
                                onClick={openStripePortal}
                                disabled={portalLoading}
                                className="inline-flex items-center bg-black text-white font-bold px-5 py-2.5 rounded-full text-xs hover:bg-stone-800 transition-all disabled:opacity-50"
                            >
                                {portalLoading ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5 mr-2" />}
                                Change Plan
                            </button>
                            <button
                                type="button"
                                onClick={openStripePortal}
                                disabled={portalLoading}
                                className="inline-flex items-center bg-white text-stone-700 font-bold px-5 py-2.5 rounded-full text-xs border border-stone-200 hover:bg-stone-50 transition-all disabled:opacity-50"
                            >
                                {portalLoading ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <CreditCard className="w-3.5 h-3.5 mr-2" />}
                                Update Payment Method
                            </button>
                            <button
                                type="button"
                                onClick={openStripePortal}
                                disabled={portalLoading}
                                className="inline-flex items-center bg-white text-red-600 font-bold px-5 py-2.5 rounded-full text-xs border border-red-200 hover:bg-red-50 transition-all disabled:opacity-50"
                            >
                                {portalLoading ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <X className="w-3.5 h-3.5 mr-2" />}
                                Cancel Subscription
                            </button>
                        </div>
                    </div>
                ) : (
                    /* No active subscription */
                    <div className="space-y-4">
                        <div className="flex items-start justify-between">
                            <div>
                                <h3 className="text-xl font-bold text-stone-900">
                                    {profile.plan_tier === "free_beta" ? "Free Beta" : "Free Plan"}
                                </h3>
                                <p className="text-xs text-stone-500 mt-0.5">
                                    {profile.plan_tier === "free_beta"
                                        ? "Full Pro features during public beta"
                                        : "Basic features included"}
                                </p>
                            </div>
                            <SubscriptionStatusBadge status="free" />
                        </div>
                        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                            <p className="text-sm text-emerald-800 font-medium">Upgrade to Pro</p>
                            <p className="text-xs text-emerald-700 mt-1">
                                Get unlimited matches, AI proposals, pipeline tools, and more.
                                Starting at $199/mo with a 30-day free trial.
                            </p>
                        </div>
                        <Link
                            href="/billing"
                            className="inline-flex items-center bg-emerald-600 text-white font-bold px-5 py-2.5 rounded-full text-xs hover:bg-emerald-700 transition-all"
                        >
                            <CreditCard className="w-3.5 h-3.5 mr-2" />
                            View Plans & Upgrade
                        </Link>
                    </div>
                )}
            </section>

           

                    {/* Invoices */}
                    <section id="invoices" className="bg-white rounded-2xl border border-stone-200 shadow-sm p-5 sm:p-7 scroll-mt-20">

                <button
                    type="button"
                    onClick={() => setInvoicesExpanded(!invoicesExpanded)}
                    className="w-full flex items-center justify-between"
                >
                    <p className="text-stone-400 text-xs uppercase tracking-widest font-bold">
                        Invoices & Billing History
                    </p>
                    {invoicesExpanded
                        ? <ChevronUp className="w-4 h-4 text-stone-400" />
                        : <ChevronDown className="w-4 h-4 text-stone-400" />
                    }
                </button>

                {invoicesExpanded && (
                    <div className="mt-4">
                        {invoicesLoading ? (
                            <div className="space-y-3">
                                {[...Array(4)].map((_, i) => (
                                    <SkeletonBlock key={i} className="h-12 w-full" />
                                ))}
                            </div>
                        ) : invoices.length === 0 ? (
                            <div className="text-center py-8">
                                <Receipt className="w-8 h-8 text-stone-300 mx-auto mb-2" />
                                <p className="text-sm text-stone-500">No invoices yet</p>
                                <p className="text-xs text-stone-400 mt-1">
                                    Invoices will appear here once you subscribe to a paid plan.
                                </p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto -mx-2 sm:mx-0">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-stone-200">
                                            <th className="text-left text-[10px] text-stone-400 uppercase tracking-widest font-bold py-2 px-2">Date</th>
                                            <th className="text-left text-[10px] text-stone-400 uppercase tracking-widest font-bold py-2 px-2">Invoice #</th>
                                            <th className="text-right text-[10px] text-stone-400 uppercase tracking-widest font-bold py-2 px-2">Amount</th>
                                            <th className="text-center text-[10px] text-stone-400 uppercase tracking-widest font-bold py-2 px-2">Status</th>
                                            <th className="text-right text-[10px] text-stone-400 uppercase tracking-widest font-bold py-2 px-2">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {invoices.map((inv, idx) => (
                                            <tr
                                                key={inv.id}
                                                className={clsx(
                                                    "border-b border-stone-100 last:border-0 hover:bg-stone-50 transition-colors",
                                                    idx % 2 === 1 && "bg-stone-50/50"
                                                )}
                                            >
                                                <td className="py-3 px-2 text-stone-700 whitespace-nowrap">
                                                    {formatDate(inv.created)}
                                                </td>
                                                <td className="py-3 px-2 text-stone-600 font-mono text-xs">
                                                    {inv.number || "---"}
                                                </td>
                                                <td className="py-3 px-2 text-right text-stone-800 font-medium tabular-nums">
                                                    {formatCurrency(inv.amount, inv.currency)}
                                                </td>
                                                <td className="py-3 px-2 text-center">
                                                    <InvoiceStatusBadge status={inv.status} />
                                                </td>
                                                <td className="py-3 px-2 text-right">
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        {inv.pdf_url && (
                                                            <a
                                                                href={inv.pdf_url}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                title="Download PDF"
                                                                className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-stone-500 hover:text-stone-700 hover:bg-stone-100 transition-all"
                                                            >
                                                                <Download className="w-3.5 h-3.5" />
                                                            </a>
                                                        )}
                                                        {inv.hosted_url && (
                                                            <a
                                                                href={inv.hosted_url}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                title="View invoice"
                                                                className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-stone-500 hover:text-stone-700 hover:bg-stone-100 transition-all"
                                                            >
                                                                <Eye className="w-3.5 h-3.5" />
                                                            </a>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
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
                    <section className="bg-white rounded-2xl border border-stone-200 shadow-sm p-5 sm:p-7 scroll-mt-20">

                        <div className="flex items-center justify-between mb-3">
                            <h3 className="font-bold text-base sm:text-lg flex items-center">
                                <UserCheck className="w-5 h-5 mr-2 text-stone-400" /> Profile Strength
                            </h3>
                            <span className={clsx("text-lg font-black",
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
                                    <span key={m} className="text-[10px] bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded">
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

            

                    {/* Notifications */}
                    <CollapsibleSection title="Notifications" icon={Bell} storageKey="notifications">
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
            </CollapsibleSection>



                    {/* Password */}
                    <section id="password" className="bg-white rounded-2xl border border-stone-200 shadow-sm p-5 sm:p-7 scroll-mt-20">

                <p className="text-stone-400 text-xs uppercase tracking-widest font-bold mb-4">Password</p>
                <div className="space-y-4">
                    <p className="text-xs text-stone-500">
                        Set or update your account password. If you signed up with Google, you can add a password for email-based login.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs text-stone-500 uppercase tracking-widest block mb-1.5">New Password</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                                <input
                                    type="password"
                                    placeholder="Min. 8 characters"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    className="w-full pl-9 pr-4 py-3 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="text-xs text-stone-500 uppercase tracking-widest block mb-1.5">Confirm Password</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                                <input
                                    type="password"
                                    placeholder="Repeat password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="w-full pl-9 pr-4 py-3 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm"
                                />
                            </div>
                        </div>
                    </div>
                    {passwordMsg && (
                        <div className={clsx(
                            "flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl",
                            passwordMsg.type === "success" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"
                        )}>
                            {passwordMsg.type === "success"
                                ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                                : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
                            {passwordMsg.text}
                        </div>
                    )}
                    <button
                        type="button"
                        onClick={handlePasswordUpdate}
                        disabled={passwordSaving || !newPassword}
                        className="inline-flex items-center bg-black text-white font-bold px-5 py-2.5 rounded-full text-xs hover:bg-stone-800 transition-all disabled:opacity-50"
                    >
                        {passwordSaving
                            ? <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> Updating...</>
                            : <><Lock className="w-3.5 h-3.5 mr-2" /> Update Password</>}
                    </button>
                </div>
            </section>

           

                    {/* Google Login */}
                    <CollapsibleSection title="Quick Login" storageKey="quick-login" description="Link your Google account for one-click login next time.">
                <button
                    type="button"
                    onClick={async () => {
                        const sb = createSupabaseClient();
                        await sb.auth.linkIdentity({ provider: "google", options: { redirectTo: window.location.origin + "/settings" } });
                    }}
                    className="inline-flex items-center gap-2.5 bg-white border-2 border-stone-200 hover:border-stone-400 px-5 py-3 rounded-xl text-sm font-bold transition-colors"
                >
                    <svg className="w-5 h-5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                    Connect Google Account
                </button>
            </CollapsibleSection>



                    {/* Team — owner can invite collaborators / viewers (plan-gated).
                        Foundation lib lives at @/lib/team-accounts; per-row scoping
                        of writes against the team_members table is enforced API-side. */}
                    <TeamMembersSection />

                    {/* Help & Feedback — drop a feature request straight into
                        HubSpot (48hr SLA on non-trivial items). Also surfaces
                        the consulting upsell for users who want hands-on help. */}
                    <section id="help" className="bg-white rounded-2xl border border-stone-200 shadow-sm p-5 sm:p-7 scroll-mt-20">
                        <p className="text-stone-500 text-xs uppercase tracking-widest font-bold mb-4">Help &amp; Feedback</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            <div className="bg-stone-50 border border-stone-200 rounded-xl p-4">
                                <h3 className="font-bold text-stone-900 mb-1.5 text-sm">Suggest a feature or report a bug</h3>
                                <p className="text-xs text-stone-500 mb-3 leading-relaxed">
                                    Goes straight into our HubSpot pipeline. Important and blocking items get a 48-hour response.
                                </p>
                                <FeatureRequestForm trigger="button" />
                            </div>
                            <div>
                                <ConsultingCTA variant="sidebar" placement="settings_help" />
                            </div>
                        </div>
                    </section>

                    {/* Privacy & Data — GDPR-aligned: export everything, or
                        request deletion with a 7-day grace window. Deletion
                        runs via the weekly db_cleanup cron so users can cancel
                        before it actually goes through. */}
                    <section id="privacy-data" className="bg-white rounded-2xl border border-stone-200 shadow-sm p-5 sm:p-7 scroll-mt-20">
                        <p className="text-stone-500 text-xs uppercase tracking-widest font-bold mb-4">Your Data</p>
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3 pb-3 border-b border-stone-100">
                            <div>
                                <p className="font-medium text-sm text-stone-800">Export your data</p>
                                <p className="text-xs text-stone-500 mt-0.5">
                                    Download every row tied to your account as a single JSON file. GDPR Article 20.
                                </p>
                            </div>
                            <a
                                href="/api/account/data-export"
                                download
                                className="inline-flex items-center bg-white text-stone-700 font-bold px-5 py-2.5 rounded-full text-xs border border-stone-200 hover:bg-stone-50 transition-all self-start sm:self-auto"
                            >
                                Download JSON
                            </a>
                        </div>
                    </section>

                    {/* Danger Zone */}
                    <section id="danger-zone" className="bg-white rounded-2xl border border-red-200 shadow-sm p-5 sm:p-7 scroll-mt-20">

                <p className="text-red-500 text-xs uppercase tracking-widest font-bold mb-4">Danger Zone</p>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                        <p className="font-medium text-sm text-stone-800">Delete Account</p>
                        <p className="text-xs text-stone-500 mt-0.5">
                            Schedule permanent deletion. We honor a 7-day grace window — you can cancel any time before then. After 7 days, every row tied to your account is removed.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => setShowDeleteModal(true)}
                        className="inline-flex items-center bg-white text-red-600 font-bold px-5 py-2.5 rounded-full text-xs border border-red-200 hover:bg-red-50 transition-all self-start sm:self-auto"
                    >
                        <Trash2 className="w-3.5 h-3.5 mr-2" />
                        Delete Account
                    </button>
                </div>
            </section>


                </div>
            </div>
            {/* ---- /Two-column grid ---- */}

            {/* Service CTA (full width, outside grid) */}
            <ServiceCTA
                title="Need help with your GovCon profile?"
                description="Our team can optimize your SAM.gov registration, identify the best NAICS codes for your business, and match you with the right certifications."
                variant="default"
            />

            {/* ---- Delete Account Modal ---- */}
            {showDeleteModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <div
                        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                        onClick={() => { setShowDeleteModal(false); setDeleteConfirmText(""); }}
                    />
                    {/* Modal */}
                    <div className="relative bg-white rounded-2xl shadow-2xl border border-red-200 max-w-md w-full p-6 animate-in zoom-in-95 duration-200">
                        <button
                            type="button"
                            title="Close"
                            onClick={() => { setShowDeleteModal(false); setDeleteConfirmText(""); }}
                            className="absolute top-4 right-4 text-stone-400 hover:text-stone-600"
                        >
                            <X className="w-5 h-5" />
                        </button>
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                                <AlertTriangle className="w-5 h-5 text-red-600" />
                            </div>
                            <div>
                                <h3 className="font-bold text-lg text-stone-900">Delete Account</h3>
                                <p className="text-xs text-stone-500">This action is permanent and irreversible.</p>
                            </div>
                        </div>
                        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
                            <p className="text-sm text-red-800">
                                Deleting your account will permanently remove:
                            </p>
                            <ul className="text-xs text-red-700 mt-2 space-y-1 list-disc list-inside">
                                <li>Your profile and all business information</li>
                                <li>All opportunity matches and pipeline data</li>
                                <li>Saved documents and proposals</li>
                                <li>Your subscription (if active)</li>
                            </ul>
                        </div>
                        <div className="mb-4">
                            <label className="text-xs text-stone-500 uppercase tracking-widest block mb-1.5">
                                Type DELETE to confirm
                            </label>
                            <input
                                type="text"
                                value={deleteConfirmText}
                                onChange={(e) => setDeleteConfirmText(e.target.value)}
                                placeholder="DELETE"
                                className="w-full px-4 py-3 border border-stone-200 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none text-sm font-mono uppercase"
                            />
                        </div>
                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={() => { setShowDeleteModal(false); setDeleteConfirmText(""); }}
                                className="flex-1 px-4 py-2.5 rounded-full text-sm font-bold bg-stone-100 text-stone-700 hover:bg-stone-200 transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleDeleteAccount}
                                disabled={deleteConfirmText !== "DELETE" || deleting}
                                className="flex-1 px-4 py-2.5 rounded-full text-sm font-bold bg-red-600 text-white hover:bg-red-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center"
                            >
                                {deleting
                                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Deleting...</>
                                    : <><Trash2 className="w-4 h-4 mr-2" /> Delete Permanently</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Save Button (Mobile sticky) */}
            <div className="sm:hidden fixed bottom-0 left-0 right-0 p-4 bg-white/95 backdrop-blur-md border-t border-stone-200 z-40">
                <button
                    type="button"
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
