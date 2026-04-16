"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
    Gift, Send, Mail, CheckCircle2, Clock, Copy, Loader2,
    Trash2, RotateCw, Plus, Sliders, Eye, Sparkles,
    MessageSquare, Phone, Users, Snowflake,
} from "lucide-react";
import clsx from "clsx";
import { INVITE_TEMPLATES, getTemplate, type TemplateId } from "./templates";

const TEMPLATE_ICONS: Record<TemplateId, typeof Sparkles> = {
    ai: Sparkles,
    linkedin: MessageSquare,
    call: Phone,
    in_person: Users,
    cold: Snowflake,
};

interface Invite {
    id: string;
    email: string;
    recipient_name: string | null;
    company_name: string | null;
    personal_note: string | null;
    token: string;
    sent_at: string;
    claimed_at: string | null;
    expires_at: string;
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.capturepilot.com";

export default function AdminBetaInvitesPage() {
    const [invites, setInvites] = useState<Invite[]>([]);
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [result, setResult] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);
    const [copiedToken, setCopiedToken] = useState<string | null>(null);

    const [form, setForm] = useState({
        email: "",
        recipient_name: "",
        company_name: "",
        personal_note: "",
    });

    const [showCustomize, setShowCustomize] = useState(false);
    const [overrides, setOverrides] = useState({
        subject: "",
        eyebrow: "",
        heading: "",
        ctaLabel: "",
        introLine: "",
    });

    const [templateId, setTemplateId] = useState<TemplateId>("ai");
    const [aiContext, setAiContext] = useState("");
    const [aiLoading, setAiLoading] = useState(false);
    const [aiError, setAiError] = useState<string | null>(null);

    // Apply a template's preset overrides + personal note.
    // The "[firstName]" token in headings is replaced with the recipient's first name.
    const applyTemplate = (id: TemplateId) => {
        setTemplateId(id);
        setAiError(null);
        const t = getTemplate(id);
        if (t.requiresAi) {
            return; // AI template fills in only after the user hits Generate
        }
        const firstName = (form.recipient_name || "").trim().split(" ")[0] || "there";
        const renderTokens = (s: string | undefined) =>
            (s ?? "").replace(/\[firstName\]/gi, firstName);
        setOverrides({
            subject: renderTokens(t.overrides?.subject),
            eyebrow: renderTokens(t.overrides?.eyebrow),
            heading: renderTokens(t.overrides?.heading),
            ctaLabel: renderTokens(t.overrides?.ctaLabel),
            introLine: renderTokens(t.overrides?.introLine),
        });
        if (t.personalNote !== undefined) {
            setForm(f => ({ ...f, personal_note: renderTokens(t.personalNote) }));
        }
        setShowCustomize(true);
    };

    const runAiDraft = async () => {
        if (!aiContext.trim()) {
            setAiError("Describe the context first so the AI has something to work with.");
            return;
        }
        setAiLoading(true);
        setAiError(null);
        try {
            const res = await fetch("/api/admin/beta-invites/ai-draft", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    context: aiContext,
                    recipient_name: form.recipient_name,
                    company_name: form.company_name,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                setAiError(data.error || "AI draft failed");
                return;
            }
            setOverrides({
                subject: data.subject || "",
                eyebrow: data.eyebrow || "",
                heading: data.heading || "",
                ctaLabel: data.ctaLabel || "",
                introLine: data.introLine || "",
            });
            if (data.personalNote) {
                setForm(f => ({ ...f, personal_note: data.personalNote }));
            }
            setShowCustomize(true);
        } catch (e) {
            setAiError((e as Error).message);
        } finally {
            setAiLoading(false);
        }
    };

    const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Debounced live preview — refetches HTML whenever form or overrides change
    const previewPayload = useMemo(() => ({
        recipient_name: form.recipient_name,
        company_name: form.company_name,
        personal_note: form.personal_note,
        overrides: {
            subject: overrides.subject,
            eyebrow: overrides.eyebrow,
            heading: overrides.heading,
            ctaLabel: overrides.ctaLabel,
            introLine: overrides.introLine,
        },
    }), [form.recipient_name, form.company_name, form.personal_note, overrides]);

    useEffect(() => {
        if (previewTimer.current) clearTimeout(previewTimer.current);
        previewTimer.current = setTimeout(async () => {
            setPreviewLoading(true);
            try {
                const res = await fetch("/api/admin/beta-invites/preview", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(previewPayload),
                });
                const data = await res.json();
                if (res.ok) setPreview({ subject: data.subject, html: data.html });
            } finally {
                setPreviewLoading(false);
            }
        }, 300);
        return () => {
            if (previewTimer.current) clearTimeout(previewTimer.current);
        };
    }, [previewPayload]);

    const load = async () => {
        const res = await fetch("/api/admin/beta-invites");
        const data = await res.json();
        setInvites(data.invites || []);
        setLoading(false);
    };

    useEffect(() => { load(); }, []);

    const send = async (resend = false) => {
        setSending(true);
        setResult(null);
        const res = await fetch("/api/admin/beta-invites", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                ...form,
                overrides: showCustomize ? overrides : undefined,
                resend,
            }),
        });
        const data = await res.json();
        if (data.success) {
            setResult({ kind: "ok", msg: data.message });
            setForm({ email: "", recipient_name: "", company_name: "", personal_note: "" });
            setOverrides({ subject: "", eyebrow: "", heading: "", ctaLabel: "", introLine: "" });
            load();
        } else {
            setResult({ kind: "err", msg: data.error || "Something went wrong" });
        }
        setSending(false);
    };

    const resendInvite = async (inv: Invite) => {
        setSending(true);
        setResult(null);
        const res = await fetch("/api/admin/beta-invites", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: inv.email,
                recipient_name: inv.recipient_name,
                company_name: inv.company_name,
                personal_note: inv.personal_note,
            }),
        });
        const data = await res.json();
        setResult(data.success
            ? { kind: "ok", msg: `Resent to ${inv.email}` }
            : { kind: "err", msg: data.error || "Resend failed" });
        setSending(false);
        load();
    };

    const revoke = async (id: string) => {
        if (!confirm("Revoke this invitation? The link will stop working.")) return;
        await fetch("/api/admin/beta-invites", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id }),
        });
        load();
    };

    const copyLink = async (token: string) => {
        await navigator.clipboard.writeText(`${APP_URL}/signup?invite=${token}`);
        setCopiedToken(token);
        setTimeout(() => setCopiedToken(null), 1500);
    };

    const canSend = form.email.trim().length > 3 && form.email.includes("@");

    if (loading) {
        return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-stone-400" /></div>;
    }

    const claimed = invites.filter(i => i.claimed_at).length;
    const pending = invites.length - claimed;

    return (
        <div className="w-full max-w-5xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-stone-900 flex items-center gap-2">
                        <Gift className="w-6 h-6" /> Beta Invitations
                    </h1>
                    <p className="text-sm text-stone-500 mt-1">
                        Send personal beta invites (e.g. to LinkedIn outreach contacts). Each invite gets a tokenized signup link.
                    </p>
                </div>
                <div className="flex items-center gap-3 text-xs">
                    <div className="bg-white border border-stone-200 rounded-lg px-3 py-2">
                        <span className="text-stone-500">Pending </span>
                        <span className="font-bold">{pending}</span>
                    </div>
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                        <span className="text-emerald-700">Claimed </span>
                        <span className="font-bold text-emerald-800">{claimed}</span>
                    </div>
                </div>
            </div>

            {/* Create form + live preview */}
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4">
                {/* LEFT — form */}
                <div className="bg-white border border-stone-200 rounded-2xl p-6 space-y-4">
                    <h2 className="font-bold text-sm flex items-center gap-1.5"><Plus className="w-4 h-4" /> New Invitation</h2>

                    {/* Template picker */}
                    <div className="space-y-2">
                        <p className="text-xs font-medium text-stone-500">Template</p>
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                            {INVITE_TEMPLATES.map(t => {
                                const Icon = TEMPLATE_ICONS[t.id];
                                const active = templateId === t.id;
                                return (
                                    <button
                                        key={t.id}
                                        type="button"
                                        onClick={() => applyTemplate(t.id)}
                                        title={t.hint}
                                        className={clsx(
                                            "flex flex-col items-center gap-1 px-2 py-3 rounded-xl border text-[11px] font-bold transition-colors text-center",
                                            active
                                                ? "bg-black text-white border-black"
                                                : "bg-white text-stone-600 border-stone-200 hover:border-stone-400 hover:bg-stone-50"
                                        )}
                                    >
                                        <Icon className="w-4 h-4" />
                                        <span className="leading-tight">{t.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                        <p className="text-[11px] text-stone-400">{getTemplate(templateId).hint}</p>
                    </div>

                    {/* AI context input — only when AI template is selected */}
                    {templateId === "ai" && (
                        <div className="bg-gradient-to-br from-stone-50 to-emerald-50/30 border border-emerald-100 rounded-xl p-4 space-y-3">
                            <label className="block text-xs font-bold text-stone-700 flex items-center gap-1.5">
                                <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                                Describe the context (AI writes the email)
                            </label>
                            <textarea
                                value={aiContext}
                                onChange={e => setAiContext(e.target.value)}
                                placeholder="e.g. Met Jane at GovCon Summit last Thursday. She runs a janitorial company in VA and is trying to land their first federal contract. We chatted about how their competitors are getting a 6-month head start through Sources Sought notices."
                                rows={3}
                                className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-black resize-none bg-white"
                            />
                            {aiError && (
                                <p className="text-xs text-red-600">{aiError}</p>
                            )}
                            <div className="flex items-center justify-between">
                                <p className="text-[11px] text-stone-500">
                                    The more specific, the better — referencing specific topics makes the email feel personal.
                                </p>
                                <button
                                    type="button"
                                    onClick={runAiDraft}
                                    disabled={aiLoading || !aiContext.trim()}
                                    className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                                    {aiLoading ? "Drafting…" : "Generate Email"}
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-stone-500 mb-1">Email *</label>
                            <input
                                type="email"
                                value={form.email}
                                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                                placeholder="contact@company.com"
                                className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-black"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-stone-500 mb-1">Recipient Name</label>
                            <input
                                value={form.recipient_name}
                                onChange={e => setForm(f => ({ ...f, recipient_name: e.target.value }))}
                                placeholder="Jane Doe"
                                className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-black"
                            />
                        </div>
                        <div className="sm:col-span-2">
                            <label className="block text-xs font-medium text-stone-500 mb-1">Company Name</label>
                            <input
                                value={form.company_name}
                                onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))}
                                placeholder="Acme Industries"
                                className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-black"
                            />
                        </div>
                        <div className="sm:col-span-2">
                            <label className="block text-xs font-medium text-stone-500 mb-1">
                                Personal Note <span className="text-stone-400 font-normal">(optional — appears in the email)</span>
                            </label>
                            <textarea
                                value={form.personal_note}
                                onChange={e => setForm(f => ({ ...f, personal_note: e.target.value }))}
                                placeholder="Great connecting on LinkedIn! Based on your work with federal contracts, I think CapturePilot would save you hours every week."
                                rows={3}
                                className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-black resize-none"
                            />
                        </div>
                    </div>

                    {/* Customize toggle */}
                    <button
                        type="button"
                        onClick={() => setShowCustomize(s => !s)}
                        className="flex items-center gap-1.5 text-xs font-bold text-stone-600 hover:text-black transition-colors"
                    >
                        <Sliders className="w-3.5 h-3.5" />
                        {showCustomize ? "Hide" : "Customize"} email
                    </button>

                    {showCustomize && (
                        <div className="space-y-3 pt-2 border-t border-stone-100">
                            <p className="text-[11px] text-stone-400">
                                Leave a field blank to use the default. Overrides only apply to this invitation.
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="sm:col-span-2">
                                    <label className="block text-xs font-medium text-stone-500 mb-1">Subject Line</label>
                                    <input
                                        value={overrides.subject}
                                        onChange={e => setOverrides(o => ({ ...o, subject: e.target.value }))}
                                        placeholder="You're invited to CapturePilot (beta access)"
                                        className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-black"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-stone-500 mb-1">Eyebrow</label>
                                    <input
                                        value={overrides.eyebrow}
                                        onChange={e => setOverrides(o => ({ ...o, eyebrow: e.target.value }))}
                                        placeholder="Private Beta Invitation"
                                        className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-black"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-stone-500 mb-1">CTA Button Label</label>
                                    <input
                                        value={overrides.ctaLabel}
                                        onChange={e => setOverrides(o => ({ ...o, ctaLabel: e.target.value }))}
                                        placeholder="Claim Your Beta Account"
                                        className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-black"
                                    />
                                </div>
                                <div className="sm:col-span-2">
                                    <label className="block text-xs font-medium text-stone-500 mb-1">Heading</label>
                                    <input
                                        value={overrides.heading}
                                        onChange={e => setOverrides(o => ({ ...o, heading: e.target.value }))}
                                        placeholder="Hi [name], you're invited"
                                        className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-black"
                                    />
                                </div>
                                <div className="sm:col-span-2">
                                    <label className="block text-xs font-medium text-stone-500 mb-1">
                                        Opening Line <span className="text-stone-400 font-normal">(HTML allowed)</span>
                                    </label>
                                    <textarea
                                        value={overrides.introLine}
                                        onChange={e => setOverrides(o => ({ ...o, introLine: e.target.value }))}
                                        placeholder="We've been following [Company] and think CapturePilot could be a strong fit…"
                                        rows={2}
                                        className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-black resize-none"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="flex items-center justify-between pt-2">
                        <p className="text-xs text-stone-400">
                            Link: <code className="bg-stone-100 px-1.5 py-0.5 rounded">{APP_URL}/signup?invite=…</code>
                        </p>
                        <button
                            type="button"
                            onClick={() => send(false)}
                            disabled={!canSend || sending}
                            className="bg-black text-white px-5 py-2.5 rounded-xl text-sm font-bold inline-flex items-center gap-2 hover:bg-stone-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                            {sending ? "Sending…" : "Send Invitation"}
                        </button>
                    </div>
                </div>

                {/* RIGHT — live preview */}
                <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden flex flex-col">
                    <div className="px-4 py-3 border-b border-stone-100 flex items-center justify-between bg-stone-50">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-stone-700">
                            <Eye className="w-3.5 h-3.5" /> Live Email Preview
                        </div>
                        {previewLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-stone-400" />}
                    </div>
                    {preview ? (
                        <>
                            <div className="px-4 py-2 border-b border-stone-100 text-xs">
                                <span className="text-stone-400 uppercase tracking-wider text-[10px] font-bold">Subject</span>
                                <p className="font-medium text-stone-800 truncate mt-0.5">{preview.subject}</p>
                            </div>
                            <iframe
                                title="Email preview"
                                srcDoc={preview.html}
                                sandbox=""
                                className="w-full flex-1 border-0 bg-stone-100 min-h-[620px]"
                            />
                        </>
                    ) : (
                        <div className="flex-1 flex items-center justify-center text-xs text-stone-400 p-8">
                            {previewLoading ? "Rendering preview…" : "Preview will appear here"}
                        </div>
                    )}
                </div>
            </div>

            {result && (
                <div className={clsx(
                    "p-4 rounded-xl text-sm font-medium",
                    result.kind === "ok"
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : "bg-red-50 text-red-700 border border-red-200"
                )}>
                    {result.msg}
                </div>
            )}

            {/* List */}
            <div className="space-y-2">
                <h2 className="font-bold text-sm text-stone-600 uppercase tracking-wider">Sent Invitations</h2>
                {invites.length === 0 ? (
                    <div className="bg-white border border-stone-200 rounded-2xl p-12 text-center">
                        <Mail className="w-10 h-10 text-stone-300 mx-auto mb-3" />
                        <p className="text-stone-500 text-sm">No invitations sent yet.</p>
                    </div>
                ) : invites.map(inv => {
                    const expired = new Date(inv.expires_at).getTime() < Date.now();
                    return (
                        <div key={inv.id} className="bg-white border border-stone-200 rounded-2xl p-4">
                            <div className="flex items-start gap-4">
                                <div className={clsx(
                                    "w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0",
                                    inv.claimed_at ? "bg-emerald-100" : expired ? "bg-stone-100" : "bg-amber-100",
                                )}>
                                    {inv.claimed_at
                                        ? <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                                        : <Clock className={clsx("w-4 h-4", expired ? "text-stone-400" : "text-amber-700")} />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-bold text-sm text-black">
                                            {inv.recipient_name || inv.email}
                                        </span>
                                        {inv.company_name && (
                                            <span className="text-xs text-stone-500">· {inv.company_name}</span>
                                        )}
                                        <span className={clsx(
                                            "text-[10px] font-bold px-2 py-0.5 rounded border uppercase",
                                            inv.claimed_at
                                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                                : expired
                                                    ? "bg-stone-100 text-stone-500 border-stone-200"
                                                    : "bg-amber-50 text-amber-700 border-amber-200",
                                        )}>
                                            {inv.claimed_at ? "Claimed" : expired ? "Expired" : "Pending"}
                                        </span>
                                    </div>
                                    <div className="text-xs text-stone-500 mt-1">
                                        {inv.email} · sent {new Date(inv.sent_at).toLocaleString()}
                                        {inv.claimed_at && <> · claimed {new Date(inv.claimed_at).toLocaleString()}</>}
                                    </div>
                                    {inv.personal_note && (
                                        <p className="text-xs text-stone-600 italic mt-2 border-l-2 border-stone-200 pl-2">
                                            {inv.personal_note}
                                        </p>
                                    )}
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                    <button
                                        type="button"
                                        onClick={() => copyLink(inv.token)}
                                        title="Copy signup link"
                                        className="p-2 rounded-lg hover:bg-stone-100 text-stone-500 hover:text-black transition-colors"
                                    >
                                        {copiedToken === inv.token
                                            ? <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                            : <Copy className="w-4 h-4" />}
                                    </button>
                                    {!inv.claimed_at && (
                                        <button
                                            type="button"
                                            onClick={() => resendInvite(inv)}
                                            disabled={sending}
                                            title="Resend email"
                                            className="p-2 rounded-lg hover:bg-stone-100 text-stone-500 hover:text-black transition-colors disabled:opacity-50"
                                        >
                                            <RotateCw className="w-4 h-4" />
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => revoke(inv.id)}
                                        title="Revoke invitation"
                                        className="p-2 rounded-lg hover:bg-red-50 text-stone-400 hover:text-red-600 transition-colors"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
