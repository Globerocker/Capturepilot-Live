"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
    Mail, Send, Eye, Loader2, CheckCircle2, AlertTriangle,
    ChevronRight, Smartphone, Monitor, Clock, Zap, CreditCard,
    UserPlus, Bell, Shield, Gift, BookOpen, Users, Building2, UserCheck,
    ToggleLeft, ToggleRight, Edit3,
} from "lucide-react";
import clsx from "clsx";

type Audience = "self_service" | "consulting" | "lead" | "all_users";
type Category = "transactional" | "marketing";

interface EmailTemplate {
    id: string;
    name: string;
    subject: string;
    trigger: string;
    group: "onboarding" | "transactional" | "lifecycle" | "marketing" | "educational" | "nurture";
    category: Category;
    audience: Audience[];
    enabled: boolean;
    icon: typeof Mail;
    description: string;
}

const TEMPLATES: EmailTemplate[] = [
    // Onboarding
    { id: "welcome", name: "Welcome (Self-Service)", subject: "Welcome to CapturePilot, {company}", trigger: "User signs up", group: "onboarding", category: "transactional", audience: ["self_service"], enabled: true, icon: UserPlus, description: "Sent when a new self-service user completes signup." },
    { id: "consulting_welcome", name: "Welcome (Consulting)", subject: "Your CapturePilot Portal is Ready", trigger: "Admin creates consulting client", group: "onboarding", category: "transactional", audience: ["consulting"], enabled: true, icon: UserPlus, description: "Sent when admin onboards a consulting client." },

    // Transactional
    { id: "task_notification", name: "Task Assignment", subject: "Action Required: {task title}", trigger: "Admin creates task with notify: true", group: "transactional", category: "transactional", audience: ["consulting"], enabled: true, icon: Bell, description: "Sent when a task is assigned to a consulting client." },
    { id: "opportunity_alert", name: "Opportunity Alert", subject: "{count} New Matching Opportunities", trigger: "Daily cron (10:00 UTC)", group: "transactional", category: "transactional", audience: ["all_users"], enabled: true, icon: Zap, description: "Daily email with top matching opportunities. Max 1 per user per 24h." },

    // Lifecycle
    { id: "quick_checker", name: "Quick Checker Results", subject: "{company} — Federal Readiness Score: {score}/100", trigger: "Lead provides email on results page", group: "lifecycle", category: "marketing", audience: ["lead"], enabled: true, icon: Shield, description: "Sent immediately when a Quick Checker lead provides their email." },
    { id: "trial_expiring_3d", name: "Trial Expiring (3 days)", subject: "Your trial expires in 3 days", trigger: "Daily cron (13:00 UTC)", group: "lifecycle", category: "transactional", audience: ["self_service"], enabled: true, icon: Clock, description: "Sent 3 days before trial ends." },
    { id: "trial_expiring_1d", name: "Trial Expiring (Last day)", subject: "Your trial expires today", trigger: "Daily cron (13:00 UTC)", group: "lifecycle", category: "transactional", audience: ["self_service"], enabled: true, icon: AlertTriangle, description: "Final warning on last day of trial." },
    { id: "payment_failed", name: "Payment Failed", subject: "Payment failed — update your card", trigger: "Stripe webhook: invoice.payment_failed", group: "lifecycle", category: "transactional", audience: ["self_service"], enabled: true, icon: CreditCard, description: "Sent when Stripe payment fails." },
    { id: "subscription_canceled", name: "Subscription Canceled", subject: "Your subscription has been canceled", trigger: "Stripe webhook: customer.subscription.deleted", group: "lifecycle", category: "transactional", audience: ["self_service"], enabled: true, icon: CreditCard, description: "Sent when subscription is canceled." },

    // Marketing
    { id: "beta_deadline_8d", name: "Beta Deadline (8 days)", subject: "Lock in 25% off before beta ends", trigger: "Cron: May 1 (12:00 UTC)", group: "marketing", category: "marketing", audience: ["self_service"], enabled: true, icon: Gift, description: "First beta deadline reminder. Introduces BETA25 promo code." },
    { id: "beta_deadline_1d", name: "Beta Deadline (Last day)", subject: "Last chance: 25% off ends tomorrow", trigger: "Cron: May 8 (12:00 UTC)", group: "marketing", category: "marketing", audience: ["self_service"], enabled: true, icon: Gift, description: "Final beta deadline reminder. Urgent tone." },

    // Educational (Learning Series)
    { id: "edu_contracting_101", name: "Federal Contracting 101", subject: "Federal Contracting 101 — your quick-start guide", trigger: "Manual / drip (planned)", group: "educational", category: "marketing", audience: ["consulting"], enabled: true, icon: BookOpen, description: "Intro guide to federal contracting. Based on blog post." },
    { id: "edu_naics_codes", name: "NAICS Codes Explained", subject: "NAICS codes, decoded", trigger: "Manual / drip (planned)", group: "educational", category: "marketing", audience: ["self_service"], enabled: true, icon: BookOpen, description: "How to pick the right NAICS codes." },
    { id: "edu_set_asides", name: "Set-Aside Programs", subject: "Set-asides: the small business advantage", trigger: "Manual / drip (planned)", group: "educational", category: "marketing", audience: ["all_users"], enabled: true, icon: BookOpen, description: "Deep dive into 8(a), SDVOSB, WOSB, HUBZone." },
    { id: "edu_capability_statement", name: "Capability Statement Guide", subject: "Your capability statement, upgraded", trigger: "Manual / drip (planned)", group: "educational", category: "marketing", audience: ["consulting"], enabled: true, icon: BookOpen, description: "6 essential sections of a winning capability statement." },

    // ─────────── 90-day Facebook-lead nurture sequence ───────────
    { id: "nurture_01_welcome",             name: "Nurture 01 · Welcome",                    subject: "Your Federal Field Manual + a question",                trigger: "Day 0 — FB lead form submission",  group: "nurture", category: "marketing", audience: ["lead"], enabled: true, icon: Mail, description: "Confirms PDF delivery, asks for the one biggest confusion to shape future emails." },
    { id: "nurture_02_opp_anatomy",         name: "Nurture 02 · Opp anatomy",                subject: "How to read a SAM opportunity in 90 seconds",            trigger: "Day 3 after signup",               group: "nurture", category: "marketing", audience: ["lead"], enabled: true, icon: BookOpen, description: "Teaches the 5 fields that matter on a SAM.gov opp." },
    { id: "nurture_03_naics_misses",        name: "Nurture 03 · NAICS misses",               subject: "5 NAICS codes most contractors miss",                    trigger: "Day 8 after signup",               group: "nurture", category: "marketing", audience: ["lead"], enabled: true, icon: BookOpen, description: "5 high-spend NAICS most small biz skip + reply hook." },
    { id: "nurture_04_past_perf_bootstrap", name: "Nurture 04 · Past-perf bootstrap",        subject: "How to look good before you've won anything",            trigger: "Day 15 after signup",              group: "nurture", category: "marketing", audience: ["lead"], enabled: true, icon: BookOpen, description: "How to build past performance from $0 in federal awards." },
    { id: "nurture_05_audit_call",          name: "Nurture 05 · Audit call CTA",             subject: "30 min on the calendar → 3 live opportunities tomorrow", trigger: "Day 22 after signup",              group: "nurture", category: "marketing", audience: ["lead"], enabled: true, icon: Zap, description: "Free B2G Audit. First conversion push." },
    { id: "nurture_06_sources_sought",      name: "Nurture 06 · Sources Sought",             subject: "The procurement step 80% of contractors skip",            trigger: "Day 30 after signup",              group: "nurture", category: "marketing", audience: ["lead"], enabled: true, icon: BookOpen, description: "Sources Sought = 6-18 months early. Most skip them." },
    { id: "nurture_07_cap_statement",       name: "Nurture 07 · Cap statement teardown",     subject: "Capability statement teardown (and an offer)",            trigger: "Day 38 after signup",              group: "nurture", category: "marketing", audience: ["lead"], enabled: true, icon: BookOpen, description: "Hybrid: value content + offer to roast their cap statement." },
    { id: "nurture_08_kit",                 name: "Nurture 08 · $70 Kit",                    subject: "The $70 Capture Kit (no upsell, just deliverables)",     trigger: "Day 45 after signup",              group: "nurture", category: "marketing", audience: ["lead"], enabled: true, icon: Gift, description: "Second conversion push at lower price point." },
    { id: "nurture_09_fiscal_cliff",        name: "Nurture 09 · Year-end fiscal cliff",      subject: "What to chase in Aug-Sep (year-end fiscal cliff)",       trigger: "Day 55 after signup",              group: "nurture", category: "marketing", audience: ["lead"], enabled: true, icon: BookOpen, description: "30% of federal spend hits in Aug-Sep. Prep guide." },
    { id: "nurture_10_why_bids_lose",       name: "Nurture 10 · Why bids lose",              subject: "Why your last bid lost (without seeing it)",             trigger: "Day 65 after signup",              group: "nurture", category: "marketing", audience: ["lead"], enabled: true, icon: BookOpen, description: "5 reasons account for 90% of small-biz losses." },
    { id: "nurture_11_pilot",               name: "Nurture 11 · Pilot Program",              subject: "Pilot Program — 3 spots open this quarter",              trigger: "Day 75 after signup",              group: "nurture", category: "marketing", audience: ["lead"], enabled: true, icon: Zap, description: "Third + highest conversion push. Done-for-you 90-day program." },
    { id: "nurture_12_goodbye",             name: "Nurture 12 · Three doors",                subject: "Three doors — or none",                                  trigger: "Day 90 after signup",              group: "nurture", category: "marketing", audience: ["lead"], enabled: true, icon: Mail, description: "Final sunset: book, buy, apply, or graceful unsubscribe." },
];

const GROUPS = [
    { key: "all", label: "All Templates" },
    { key: "onboarding", label: "Onboarding" },
    { key: "transactional", label: "Transactional" },
    { key: "lifecycle", label: "Lifecycle" },
    { key: "marketing", label: "Marketing" },
    { key: "educational", label: "Learning Series" },
    { key: "nurture", label: "Lead Nurture (90-day)" },
];

const AUDIENCE_LABELS: Record<Audience, { label: string; color: string; icon: typeof Users }> = {
    self_service: { label: "Self-Service", color: "bg-blue-50 text-blue-700 border-blue-200", icon: Users },
    consulting: { label: "Consulting", color: "bg-purple-50 text-purple-700 border-purple-200", icon: Building2 },
    lead: { label: "Lead", color: "bg-amber-50 text-amber-700 border-amber-200", icon: UserCheck },
    all_users: { label: "All Users", color: "bg-stone-100 text-stone-700 border-stone-200", icon: Users },
};

function AudienceBadge({ audience }: { audience: Audience }) {
    const info = AUDIENCE_LABELS[audience];
    const Icon = info.icon;
    return (
        <span className={clsx("inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded border", info.color)}>
            <Icon className="w-3 h-3" />
            {info.label}
        </span>
    );
}

const ALL_AUDIENCES: Audience[] = ["self_service", "consulting", "lead", "all_users"];

export default function AdminEmails() {
    const [selectedId, setSelectedId] = useState<string>("welcome");
    const [group, setGroup] = useState("all");
    const [viewMode, setViewMode] = useState<"desktop" | "mobile">("desktop");
    const [testEmail, setTestEmail] = useState("");
    const [sending, setSending] = useState(false);
    const [sendResult, setSendResult] = useState<{ success: boolean; message: string } | null>(null);
    const [loaded, setLoaded] = useState(false);
    const [saving, setSaving] = useState<string | null>(null);

    // Live settings from DB (override static TEMPLATES metadata for enabled + audience)
    const [settings, setSettings] = useState<Record<string, { enabled: boolean; audience: Audience[] }>>(() =>
        Object.fromEntries(TEMPLATES.map(t => [t.id, { enabled: t.enabled, audience: t.audience }]))
    );

    // Fetch persisted settings on mount
    useEffect(() => {
        (async () => {
            try {
                const res = await fetch("/api/admin/email-settings");
                if (!res.ok) return;
                const data = await res.json();
                if (data.settings) {
                    const map: typeof settings = {};
                    for (const s of data.settings as Array<{ key: string; enabled: boolean; audience: Audience[] }>) {
                        map[s.key] = { enabled: s.enabled, audience: s.audience };
                    }
                    setSettings(prev => ({ ...prev, ...map }));
                }
            } finally {
                setLoaded(true);
            }
        })();
    }, []);

    const filtered = group === "all" ? TEMPLATES : TEMPLATES.filter(t => t.group === group);
    const selected = TEMPLATES.find(t => t.id === selectedId) || TEMPLATES[0];
    const selectedSettings = settings[selected.id] || { enabled: true, audience: selected.audience };
    const isEnabled = selectedSettings.enabled;

    const persist = async (key: string, patch: { enabled?: boolean; audience?: Audience[] }) => {
        setSaving(key);
        // Optimistic update
        setSettings(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }));
        try {
            const res = await fetch("/api/admin/email-settings", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ key, ...patch }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                console.error("Failed to save setting:", data.error);
            }
        } catch (e) {
            console.error("Network error saving setting:", e);
        } finally {
            setSaving(null);
        }
    };

    const toggleEnabled = (key: string) => {
        const current = settings[key]?.enabled ?? true;
        persist(key, { enabled: !current });
    };

    const toggleAudience = (key: string, aud: Audience) => {
        const current = settings[key]?.audience ?? [];
        const next = current.includes(aud) ? current.filter(a => a !== aud) : [...current, aud];
        persist(key, { audience: next });
    };

    const handleSendTest = async () => {
        if (!testEmail.trim()) return;
        setSending(true);
        setSendResult(null);
        try {
            const res = await fetch("/api/admin/send-test-email", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ type: selectedId, to: testEmail.trim() }),
            });
            const data = await res.json();
            setSendResult({
                success: data.success,
                message: data.success ? `Test sent to ${testEmail}` : `Error: ${data.error}`,
            });
        } catch {
            setSendResult({ success: false, message: "Network error" });
        }
        setSending(false);
    };

    return (
        <div className="w-full space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-xl font-bold flex items-center gap-2">
                    <Mail className="w-5 h-5" /> Email Templates
                </h1>
                <span className="text-xs text-stone-400">{TEMPLATES.length} templates</span>
            </div>

            {/* Group filter */}
            <div className="flex gap-1.5 flex-wrap">
                {GROUPS.map(c => (
                    <button
                        key={c.key}
                        type="button"
                        onClick={() => setGroup(c.key)}
                        className={clsx(
                            "text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors",
                            group === c.key
                                ? "bg-stone-900 text-white border-stone-900"
                                : "bg-white text-stone-500 border-stone-200 hover:bg-stone-50"
                        )}
                    >
                        {c.label}
                    </button>
                ))}
            </div>

            <div className="flex gap-6">
                {/* Template list */}
                <div className="w-80 flex-shrink-0 space-y-1">
                    {filtered.map(t => {
                        const s = settings[t.id] || { enabled: true, audience: t.audience };
                        return (
                        <button
                            key={t.id}
                            type="button"
                            onClick={() => { setSelectedId(t.id); setSendResult(null); }}
                            className={clsx(
                                "w-full text-left px-4 py-3 rounded-xl border transition-all",
                                selectedId === t.id
                                    ? "bg-white border-stone-300 shadow-sm"
                                    : "bg-white/50 border-transparent hover:bg-white hover:border-stone-200"
                            )}
                        >
                            <div className="flex items-center gap-2">
                                <t.icon className={clsx("w-4 h-4 flex-shrink-0", selectedId === t.id ? "text-emerald-600" : "text-stone-400")} />
                                <div className="flex-1 min-w-0">
                                    <p className={clsx(
                                        "text-sm font-bold truncate",
                                        s.enabled ? "text-stone-800" : "text-stone-400 line-through"
                                    )}>{t.name}</p>
                                    <p className="text-[10px] text-stone-400 truncate">{t.trigger}</p>
                                </div>
                                {!s.enabled && <span className="text-[9px] font-bold text-stone-400 bg-stone-100 px-1.5 py-0.5 rounded">OFF</span>}
                                {selectedId === t.id && <ChevronRight className="w-3.5 h-3.5 text-stone-400" />}
                            </div>
                            <div className="flex gap-1 mt-2 pl-6 flex-wrap">
                                {s.audience.map(a => <AudienceBadge key={a} audience={a} />)}
                            </div>
                        </button>
                        );
                    })}
                </div>

                {/* Preview panel */}
                <div className="flex-1 space-y-4">
                    {/* Header card */}
                    <div className="bg-white border border-stone-200 rounded-xl p-5">
                        <div className="flex items-start justify-between">
                            <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                    <h2 className="font-bold text-lg text-stone-900">{selected.name}</h2>
                                    <span className={clsx(
                                        "text-[10px] font-bold px-2 py-0.5 rounded uppercase",
                                        selected.category === "transactional"
                                            ? "bg-stone-100 text-stone-600"
                                            : "bg-emerald-50 text-emerald-700"
                                    )}>{selected.category}</span>
                                </div>
                                <p className="text-sm text-stone-500 mt-1">{selected.description}</p>
                            </div>
                            {/* Enable toggle — persists to DB */}
                            <button
                                type="button"
                                onClick={() => toggleEnabled(selected.id)}
                                disabled={!loaded || saving === selected.id}
                                className={clsx(
                                    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-bold text-xs transition-colors disabled:opacity-60",
                                    isEnabled
                                        ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                                        : "bg-stone-100 text-stone-500 border-stone-200 hover:bg-stone-200"
                                )}
                            >
                                {saving === selected.id ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : isEnabled ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                                {isEnabled ? "Enabled" : "Disabled"}
                            </button>
                        </div>

                        {/* Metadata row */}
                        <div className="flex items-center gap-6 mt-4 pt-4 border-t border-stone-100 flex-wrap">
                            <div>
                                <p className="text-[10px] text-stone-400 uppercase tracking-wider font-bold">Subject</p>
                                <p className="text-sm text-stone-700 font-mono">{selected.subject}</p>
                            </div>
                            <div>
                                <p className="text-[10px] text-stone-400 uppercase tracking-wider font-bold">Trigger</p>
                                <p className="text-sm text-stone-700">{selected.trigger}</p>
                            </div>
                            <div>
                                <p className="text-[10px] text-stone-400 uppercase tracking-wider font-bold mb-1">Audience <span className="normal-case text-stone-300">(click to toggle)</span></p>
                                <div className="flex gap-1 flex-wrap">
                                    {ALL_AUDIENCES.map(a => {
                                        const active = selectedSettings.audience.includes(a);
                                        const info = AUDIENCE_LABELS[a];
                                        const Icon = info.icon;
                                        return (
                                            <button
                                                key={a}
                                                type="button"
                                                onClick={() => toggleAudience(selected.id, a)}
                                                disabled={!loaded || saving === selected.id}
                                                className={clsx(
                                                    "inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded border transition-all disabled:opacity-60",
                                                    active ? info.color : "bg-white text-stone-400 border-stone-200 hover:bg-stone-50 opacity-50"
                                                )}
                                            >
                                                <Icon className="w-3 h-3" />
                                                {info.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        {/* Test send + Edit Design */}
                        <div className="mt-4 pt-4 border-t border-stone-100">
                            <div className="flex items-center gap-2">
                                <input
                                    type="email"
                                    value={testEmail}
                                    onChange={e => setTestEmail(e.target.value)}
                                    placeholder="your@email.com"
                                    className="flex-1 border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400"
                                    onKeyDown={e => e.key === "Enter" && handleSendTest()}
                                />
                                <button
                                    type="button"
                                    onClick={handleSendTest}
                                    disabled={sending || !testEmail.trim()}
                                    className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-bold inline-flex items-center gap-1.5 hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                                >
                                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                    {sending ? "Sending..." : "Send Test"}
                                </button>
                                <Link
                                    href={`/admin/emails/${selected.id}/edit`}
                                    className="bg-stone-900 text-white px-4 py-2 rounded-lg text-sm font-bold inline-flex items-center gap-1.5 hover:bg-stone-800 transition-colors"
                                >
                                    <Edit3 className="w-4 h-4" />
                                    Edit Design
                                </Link>
                            </div>
                            {sendResult && (
                                <div className={clsx("flex items-center gap-1.5 mt-2 text-xs font-medium", sendResult.success ? "text-emerald-600" : "text-red-600")}>
                                    {sendResult.success ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                                    {sendResult.message}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Viewport controls */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                            <Eye className="w-4 h-4 text-stone-400" />
                            <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">Preview</span>
                        </div>
                        <div className="flex gap-1 bg-stone-100 p-0.5 rounded-lg">
                            <button
                                type="button"
                                onClick={() => setViewMode("desktop")}
                                className={clsx("p-1.5 rounded-md transition-colors", viewMode === "desktop" ? "bg-white shadow-sm text-stone-700" : "text-stone-400 hover:text-stone-600")}
                                title="Desktop view"
                            >
                                <Monitor className="w-4 h-4" />
                            </button>
                            <button
                                type="button"
                                onClick={() => setViewMode("mobile")}
                                className={clsx("p-1.5 rounded-md transition-colors", viewMode === "mobile" ? "bg-white shadow-sm text-stone-700" : "text-stone-400 hover:text-stone-600")}
                                title="Mobile view"
                            >
                                <Smartphone className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {/* Preview iframe */}
                    <div className={clsx("bg-stone-200 rounded-xl p-4 flex justify-center transition-all", viewMode === "mobile" ? "max-w-sm mx-auto" : "")}>
                        <div className={clsx("bg-white rounded-lg shadow-lg overflow-hidden w-full", viewMode === "mobile" ? "max-w-[375px]" : "")}>
                            <div className="bg-stone-50 border-b border-stone-200 px-4 py-2.5">
                                <div className="flex items-center gap-2">
                                    <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center">
                                        <span className="text-[10px] font-bold text-emerald-700">CP</span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-bold text-stone-700 truncate">CapturePilot &lt;noreply@capturepilot.com&gt;</p>
                                        <p className="text-[10px] text-stone-400 truncate">{selected.subject}</p>
                                    </div>
                                </div>
                            </div>
                            <iframe
                                src={`/api/admin/email-preview?type=${selectedId}`}
                                title={`Preview: ${selected.name}`}
                                className="w-full border-0"
                                style={{ height: "820px" }}
                                sandbox="allow-same-origin"
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
