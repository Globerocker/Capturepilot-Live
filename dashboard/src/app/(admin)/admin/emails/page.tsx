"use client";

import { useState } from "react";
import {
    Mail, Send, Eye, Loader2, CheckCircle2, AlertTriangle,
    ChevronRight, Smartphone, Monitor, Clock, Zap, CreditCard,
    UserPlus, Bell, Shield, Gift,
} from "lucide-react";
import clsx from "clsx";

interface EmailTemplate {
    id: string;
    name: string;
    subject: string;
    trigger: string;
    category: "onboarding" | "transactional" | "lifecycle" | "marketing";
    icon: typeof Mail;
    description: string;
}

const TEMPLATES: EmailTemplate[] = [
    // Onboarding
    {
        id: "welcome",
        name: "Welcome (Self-Service)",
        subject: "Welcome to CapturePilot, {company}!",
        trigger: "User signs up",
        category: "onboarding",
        icon: UserPlus,
        description: "Sent when a new self-service user completes signup. Introduces the platform and links to dashboard.",
    },
    {
        id: "consulting_welcome",
        name: "Welcome (Consulting)",
        subject: "Your CapturePilot Portal is Ready",
        trigger: "Admin creates consulting client",
        category: "onboarding",
        icon: UserPlus,
        description: "Sent when admin onboards a consulting client. Includes login credentials and portal features.",
    },
    // Transactional
    {
        id: "task_notification",
        name: "Task Assignment",
        subject: "Action Required: {task title}",
        trigger: "Admin creates task with notify: true",
        category: "transactional",
        icon: Bell,
        description: "Sent when a task is assigned to a consulting client. Shows task details and due date.",
    },
    {
        id: "opportunity_alert",
        name: "Opportunity Alert",
        subject: "{count} New Matching Opportunities Found",
        trigger: "Daily cron (10:00 UTC)",
        category: "transactional",
        icon: Zap,
        description: "Daily email with top matching opportunities. Max 1 per user per 24h, threshold >= 45%.",
    },
    // Lifecycle
    {
        id: "quick_checker",
        name: "Quick Checker Results",
        subject: "{company} — Federal Readiness Score: {score}/100",
        trigger: "Lead provides email on results page",
        category: "lifecycle",
        icon: Shield,
        description: "Sent immediately when a Quick Checker lead provides their email. Shows readiness score, top 3 matches, and signup CTA.",
    },
    {
        id: "trial_expiring_3d",
        name: "Trial Expiring (3 days)",
        subject: "Your CapturePilot trial expires in 3 days",
        trigger: "Daily cron (13:00 UTC)",
        category: "lifecycle",
        icon: Clock,
        description: "Sent 3 days before trial ends. Encourages subscription with feature list.",
    },
    {
        id: "trial_expiring_1d",
        name: "Trial Expiring (Last day)",
        subject: "Your CapturePilot trial expires today",
        trigger: "Daily cron (13:00 UTC)",
        category: "lifecycle",
        icon: AlertTriangle,
        description: "Final warning on last day of trial. More urgent tone.",
    },
    {
        id: "payment_failed",
        name: "Payment Failed",
        subject: "Payment failed — update your card",
        trigger: "Stripe webhook: invoice.payment_failed",
        category: "lifecycle",
        icon: CreditCard,
        description: "Sent when Stripe payment fails. Links to billing settings to update card.",
    },
    {
        id: "subscription_canceled",
        name: "Subscription Canceled",
        subject: "Your subscription has been canceled",
        trigger: "Stripe webhook: customer.subscription.deleted",
        category: "lifecycle",
        icon: CreditCard,
        description: "Sent when subscription is canceled. Soft win-back with resubscribe CTA.",
    },
    // Marketing
    {
        id: "beta_deadline_8d",
        name: "Beta Deadline (8 days)",
        subject: "Lock in 25% off CapturePilot before beta ends",
        trigger: "Cron: May 1 (12:00 UTC)",
        category: "marketing",
        icon: Gift,
        description: "First beta deadline reminder. Introduces BETA25 promo code for 25% off forever.",
    },
    {
        id: "beta_deadline_1d",
        name: "Beta Deadline (Last day)",
        subject: "Last chance: 25% off ends tomorrow",
        trigger: "Cron: May 8 (12:00 UTC)",
        category: "marketing",
        icon: Gift,
        description: "Final beta deadline reminder. Urgent tone with red warning box.",
    },
];

const CATEGORIES = [
    { key: "all", label: "All Templates" },
    { key: "onboarding", label: "Onboarding" },
    { key: "transactional", label: "Transactional" },
    { key: "lifecycle", label: "Lifecycle" },
    { key: "marketing", label: "Marketing" },
];

export default function AdminEmails() {
    const [selectedId, setSelectedId] = useState<string>("welcome");
    const [category, setCategory] = useState("all");
    const [viewMode, setViewMode] = useState<"desktop" | "mobile">("desktop");
    const [testEmail, setTestEmail] = useState("");
    const [sending, setSending] = useState(false);
    const [sendResult, setSendResult] = useState<{ success: boolean; message: string } | null>(null);

    const filtered = category === "all"
        ? TEMPLATES
        : TEMPLATES.filter(t => t.category === category);

    const selected = TEMPLATES.find(t => t.id === selectedId) || TEMPLATES[0];

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

            {/* Category filter */}
            <div className="flex gap-1.5">
                {CATEGORIES.map(c => (
                    <button
                        key={c.key}
                        type="button"
                        onClick={() => setCategory(c.key)}
                        className={clsx(
                            "text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors",
                            category === c.key
                                ? "bg-stone-900 text-white border-stone-900"
                                : "bg-white text-stone-500 border-stone-200 hover:bg-stone-50"
                        )}
                    >
                        {c.label}
                    </button>
                ))}
            </div>

            <div className="flex gap-6">
                {/* Template list — left sidebar */}
                <div className="w-72 flex-shrink-0 space-y-1">
                    {filtered.map(t => (
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
                                    <p className="text-sm font-bold text-stone-800 truncate">{t.name}</p>
                                    <p className="text-[10px] text-stone-400 truncate">{t.trigger}</p>
                                </div>
                                {selectedId === t.id && <ChevronRight className="w-3.5 h-3.5 text-stone-400" />}
                            </div>
                        </button>
                    ))}
                </div>

                {/* Preview panel — main area */}
                <div className="flex-1 space-y-4">
                    {/* Template info header */}
                    <div className="bg-white border border-stone-200 rounded-xl p-5">
                        <div className="flex items-start justify-between">
                            <div>
                                <h2 className="font-bold text-lg text-stone-900">{selected.name}</h2>
                                <p className="text-sm text-stone-500 mt-1">{selected.description}</p>
                                <div className="flex items-center gap-4 mt-3">
                                    <div>
                                        <p className="text-[10px] text-stone-400 uppercase tracking-wider font-bold">Subject</p>
                                        <p className="text-sm text-stone-700 font-mono">{selected.subject}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-stone-400 uppercase tracking-wider font-bold">Trigger</p>
                                        <p className="text-sm text-stone-700">{selected.trigger}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-stone-400 uppercase tracking-wider font-bold">Category</p>
                                        <span className={clsx(
                                            "text-xs font-bold px-2 py-0.5 rounded",
                                            selected.category === "onboarding" ? "bg-blue-50 text-blue-700" :
                                            selected.category === "transactional" ? "bg-stone-100 text-stone-600" :
                                            selected.category === "lifecycle" ? "bg-amber-50 text-amber-700" :
                                            "bg-emerald-50 text-emerald-700"
                                        )}>{selected.category}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Test send */}
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
                            </div>
                            {sendResult && (
                                <div className={clsx("flex items-center gap-1.5 mt-2 text-xs font-medium", sendResult.success ? "text-emerald-600" : "text-red-600")}>
                                    {sendResult.success ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                                    {sendResult.message}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Preview viewport controls */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                            <Eye className="w-4 h-4 text-stone-400" />
                            <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">Preview</span>
                        </div>
                        <div className="flex gap-1 bg-stone-100 p-0.5 rounded-lg">
                            <button
                                type="button"
                                onClick={() => setViewMode("desktop")}
                                className={clsx(
                                    "p-1.5 rounded-md transition-colors",
                                    viewMode === "desktop" ? "bg-white shadow-sm text-stone-700" : "text-stone-400 hover:text-stone-600"
                                )}
                                title="Desktop view"
                            >
                                <Monitor className="w-4 h-4" />
                            </button>
                            <button
                                type="button"
                                onClick={() => setViewMode("mobile")}
                                className={clsx(
                                    "p-1.5 rounded-md transition-colors",
                                    viewMode === "mobile" ? "bg-white shadow-sm text-stone-700" : "text-stone-400 hover:text-stone-600"
                                )}
                                title="Mobile view"
                            >
                                <Smartphone className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {/* Email preview iframe */}
                    <div className={clsx(
                        "bg-stone-200 rounded-xl p-4 flex justify-center transition-all",
                        viewMode === "mobile" ? "max-w-sm mx-auto" : ""
                    )}>
                        <div className={clsx(
                            "bg-white rounded-lg shadow-lg overflow-hidden w-full",
                            viewMode === "mobile" ? "max-w-[375px]" : ""
                        )}>
                            {/* Mock inbox bar */}
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
                                style={{ height: "700px" }}
                                sandbox="allow-same-origin"
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
