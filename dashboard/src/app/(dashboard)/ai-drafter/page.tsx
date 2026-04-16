"use client";

import DrafterTabs from "@/components/layout/DrafterTabs";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createSupabaseClient } from "@/lib/supabase/client";
import {
    Pencil, FileText, Mail, ShieldCheck, Loader2, Copy, Check,
    Sparkles, Save, ArrowRight,
} from "lucide-react";
import clsx from "clsx";

const supabase = createSupabaseClient();

type Tab = "proposal" | "email" | "template";

const TONE_OPTIONS = [
    { key: "cold-intro",          label: "Cold Intro" },
    { key: "follow-up",           label: "Follow-Up" },
    { key: "post-sources-sought", label: "Post Sources Sought" },
    { key: "pre-bid-question",    label: "Pre-Bid Question" },
] as const;

const TEMPLATE_OPTIONS = [
    { key: "past_performance",     label: "Past Performance Blurb" },
    { key: "differentiators",      label: "Differentiators Paragraph" },
    { key: "management_approach",  label: "Management Approach" },
    { key: "technical_approach",   label: "Technical Approach Skeleton" },
    { key: "corporate_overview",   label: "Corporate Overview" },
    { key: "custom",               label: "Custom…" },
] as const;

export default function AiDrafterPage() {
    return (
        <Suspense fallback={<div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 text-stone-400 animate-spin" /></div>}>
            <AiDrafterInner />
        </Suspense>
    );
}

function AiDrafterInner() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const initialTab = (searchParams?.get("tab") as Tab) || "email";
    const [tab, setTab] = useState<Tab>(
        initialTab === "email" || initialTab === "template" ? initialTab : "email"
    );
    const [profileId, setProfileId] = useState<string | null>(null);

    const [authError, setAuthError] = useState<string | null>(null);
    useEffect(() => {
        let cancelled = false;
        const timeout = setTimeout(() => {
            if (cancelled) return;
            setAuthError("Taking too long to verify your session. Please refresh the page or sign in again.");
        }, 8000);
        (async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (cancelled) return;
                if (!user) { router.push("/login"); return; }
                const { data: profile } = await supabase
                    .from("user_profiles").select("id").eq("auth_user_id", user.id).single();
                if (cancelled) return;
                if (!profile) { router.push("/onboard"); return; }
                clearTimeout(timeout);
                setProfileId((profile as { id: string }).id);
            } catch (e) {
                if (!cancelled) setAuthError((e as Error).message || "Session check failed.");
            }
        })();
        return () => { cancelled = true; clearTimeout(timeout); };
    }, [router]);

    if (authError) {
        return (
            <div className="max-w-lg mx-auto mt-12 bg-white border border-amber-200 rounded-2xl p-6 text-sm">
                <p className="font-bold text-amber-900 mb-2">Session check failed</p>
                <p className="text-stone-600 mb-4">{authError}</p>
                <button type="button" onClick={() => window.location.reload()} className="bg-black text-white px-4 py-2 rounded-xl text-xs font-bold">Reload</button>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto pb-12 animate-in fade-in duration-500 px-1">
            <DrafterTabs />
            {/* Sub-Tabs for Emails & Templates */}
            <div className="flex items-center gap-2 mb-6 mt-6">
                <button type="button" onClick={() => setTab("email")} className={`px-4 py-1.5 rounded-full text-xs font-bold transition-colors ${tab === "email" ? "bg-black text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200"}`}>Email Drafter</button>
                <button type="button" onClick={() => setTab("template")} className={`px-4 py-1.5 rounded-full text-xs font-bold transition-colors ${tab === "template" ? "bg-black text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200"}`}>Template Drafter</button>
            </div>

            
            {tab === "email"    && profileId && <EmailTab profileId={profileId} />}
            {tab === "template" && profileId && <TemplateTab profileId={profileId} />}
        </div>
    );
}

function TabButton({ active, onClick, icon: Icon, label }: {
    active: boolean; onClick: () => void;
    icon: React.ComponentType<{ className?: string }>; label: string;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={clsx(
                "flex items-center gap-2 px-4 py-2.5 text-sm font-bold border-b-2 transition-colors -mb-px",
                active ? "border-black text-black" : "border-transparent text-stone-400 hover:text-stone-700"
            )}
        >
            <Icon className="w-4 h-4" /> {label}
        </button>
    );
}

function ProposalTab() {
    return (
        <div className="bg-gradient-to-br from-stone-900 to-black text-white rounded-[24px] p-8">
            <FileText className="w-8 h-8 text-emerald-400 mb-4" />
            <h3 className="text-xl font-bold mb-2">Full Proposal Generation</h3>
            <p className="text-stone-300 text-sm mb-6 max-w-2xl">
                Generate a complete, multi-section federal proposal tied to a specific opportunity. Runs as a background job so you can keep working.
            </p>
            <Link
                href="/ai-drafter/proposals"
                className="inline-flex items-center gap-2 bg-white text-black px-5 py-2.5 rounded-full text-sm font-bold hover:bg-stone-200 transition-colors"
            >
                Go to Proposal Writer <ArrowRight className="w-4 h-4" />
            </Link>
        </div>
    );
}

function EmailTab({ profileId }: { profileId: string }) {
    const [tone, setTone] = useState<typeof TONE_OPTIONS[number]["key"]>("cold-intro");
    const [noticeId, setNoticeId] = useState("");
    const [pocName, setPocName] = useState("");
    const [pocTitle, setPocTitle] = useState("");
    const [customContext, setCustomContext] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<{ subject: string; body: string } | null>(null);
    const [copiedField, setCopiedField] = useState<string | null>(null);

    const generate = async () => {
        setError(null);
        setResult(null);
        setLoading(true);
        try {
            const res = await fetch("/api/ai/draft-email", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    user_profile_id: profileId,
                    notice_id: noticeId || undefined,
                    poc_name: pocName || undefined,
                    poc_title: pocTitle || undefined,
                    tone,
                    custom_context: customContext || undefined,
                }),
            });
            const j = await res.json();
            if (!res.ok) { setError(j.error || "Generation failed"); setLoading(false); return; }
            setResult({ subject: j.subject, body: j.body });
        } catch (e) {
            setError((e as Error).message);
        }
        setLoading(false);
    };

    const copy = async (field: "subject" | "body", text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedField(field);
            setTimeout(() => setCopiedField(null), 1500);
        } catch { /* ignore */ }
    };

    return (
        <div className="space-y-6">
            <div className="bg-white border border-stone-200 rounded-2xl p-5 space-y-4">
                <div>
                    <label className="text-[11px] font-bold text-stone-500 uppercase tracking-widest">Tone</label>
                    <div className="flex flex-wrap gap-2 mt-2">
                        {TONE_OPTIONS.map(t => (
                            <button
                                type="button"
                                key={t.key}
                                onClick={() => setTone(t.key)}
                                className={clsx(
                                    "text-xs font-bold px-3 py-1.5 rounded-full border transition-all",
                                    tone === t.key ? "bg-black text-white border-black" : "bg-white text-stone-600 border-stone-200 hover:bg-stone-50"
                                )}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="text-[11px] font-bold text-stone-500 uppercase tracking-widest">SAM Notice ID (optional)</label>
                        <input
                            type="text" value={noticeId} onChange={e => setNoticeId(e.target.value)}
                            placeholder="e.g. 123abc456..."
                            className="mt-1 w-full border border-stone-200 rounded-xl px-3 py-2 text-sm bg-stone-50 focus:bg-white focus:ring-2 focus:ring-black outline-none"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="text-[11px] font-bold text-stone-500 uppercase tracking-widest">POC Name</label>
                            <input
                                type="text" value={pocName} onChange={e => setPocName(e.target.value)}
                                placeholder="Jane Smith"
                                className="mt-1 w-full border border-stone-200 rounded-xl px-3 py-2 text-sm bg-stone-50 focus:bg-white focus:ring-2 focus:ring-black outline-none"
                            />
                        </div>
                        <div>
                            <label className="text-[11px] font-bold text-stone-500 uppercase tracking-widest">POC Title</label>
                            <input
                                type="text" value={pocTitle} onChange={e => setPocTitle(e.target.value)}
                                placeholder="Contracting Officer"
                                className="mt-1 w-full border border-stone-200 rounded-xl px-3 py-2 text-sm bg-stone-50 focus:bg-white focus:ring-2 focus:ring-black outline-none"
                            />
                        </div>
                    </div>
                </div>

                <div>
                    <label className="text-[11px] font-bold text-stone-500 uppercase tracking-widest">Extra context (optional)</label>
                    <textarea
                        value={customContext} onChange={e => setCustomContext(e.target.value)}
                        rows={3}
                        placeholder="e.g. I met the POC at a DoD industry day in March…"
                        className="mt-1 w-full border border-stone-200 rounded-xl px-3 py-2 text-sm bg-stone-50 focus:bg-white focus:ring-2 focus:ring-black outline-none resize-none"
                    />
                </div>

                <button
                    type="button"
                    onClick={generate}
                    disabled={loading}
                    className="bg-black text-white px-5 py-2.5 rounded-full text-sm font-bold inline-flex items-center gap-2 disabled:opacity-60"
                >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    {loading ? "Drafting…" : "Draft Email"}
                </button>

                {error && <p className="text-red-600 text-sm font-medium">{error}</p>}
            </div>

            {result && (
                <div className="bg-white border border-stone-200 rounded-2xl p-5 space-y-4">
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <label className="text-[11px] font-bold text-stone-500 uppercase tracking-widest">Subject</label>
                            <button type="button" onClick={() => copy("subject", result.subject)} className="text-xs font-bold text-stone-500 hover:text-black inline-flex items-center gap-1">
                                {copiedField === "subject" ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />} Copy
                            </button>
                        </div>
                        <input readOnly title="Drafted subject line" value={result.subject} className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm bg-stone-50 font-medium" />
                    </div>
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <label className="text-[11px] font-bold text-stone-500 uppercase tracking-widest">Body</label>
                            <button type="button" onClick={() => copy("body", result.body)} className="text-xs font-bold text-stone-500 hover:text-black inline-flex items-center gap-1">
                                {copiedField === "body" ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />} Copy
                            </button>
                        </div>
                        <textarea readOnly title="Drafted email body" value={result.body} rows={14} className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm bg-stone-50 font-mono" />
                    </div>
                </div>
            )}
        </div>
    );
}

function TemplateTab({ profileId }: { profileId: string }) {
    const [templateType, setTemplateType] = useState<typeof TEMPLATE_OPTIONS[number]["key"]>("past_performance");
    const [customTitle, setCustomTitle] = useState("");
    const [prompt, setPrompt] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<{ title: string; content: string; saved_document_id?: string } | null>(null);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    const generate = async (saveNow = false) => {
        setError(null);
        setSaved(false);
        if (saveNow) setSaving(true); else setLoading(true);
        try {
            const res = await fetch("/api/ai/draft-template", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    user_profile_id: profileId,
                    template_type: templateType,
                    title: templateType === "custom" ? customTitle : undefined,
                    prompt: prompt || undefined,
                    save: saveNow,
                }),
            });
            const j = await res.json();
            if (!res.ok) { setError(j.error || "Generation failed"); return; }
            setResult({ title: j.title, content: j.content, saved_document_id: j.saved_document_id });
            if (j.saved_document_id) setSaved(true);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setLoading(false);
            setSaving(false);
        }
    };

    const saveExisting = async () => {
        if (!result) return;
        setSaving(true);
        try {
            const res = await fetch("/api/documents", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: result.title,
                    category: "template",
                    content: result.content,
                    tags: [templateType],
                }),
            });
            if (res.ok) setSaved(true);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="bg-white border border-stone-200 rounded-2xl p-5 space-y-4">
                <div>
                    <label className="text-[11px] font-bold text-stone-500 uppercase tracking-widest">Template Type</label>
                    <div className="flex flex-wrap gap-2 mt-2">
                        {TEMPLATE_OPTIONS.map(t => (
                            <button
                                type="button"
                                key={t.key}
                                onClick={() => setTemplateType(t.key)}
                                className={clsx(
                                    "text-xs font-bold px-3 py-1.5 rounded-full border transition-all",
                                    templateType === t.key ? "bg-black text-white border-black" : "bg-white text-stone-600 border-stone-200 hover:bg-stone-50"
                                )}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>
                </div>

                {templateType === "custom" && (
                    <div>
                        <label className="text-[11px] font-bold text-stone-500 uppercase tracking-widest">Title</label>
                        <input
                            type="text" value={customTitle} onChange={e => setCustomTitle(e.target.value)}
                            placeholder="e.g. Transition-In Plan"
                            className="mt-1 w-full border border-stone-200 rounded-xl px-3 py-2 text-sm bg-stone-50 focus:bg-white focus:ring-2 focus:ring-black outline-none"
                        />
                    </div>
                )}

                <div>
                    <label className="text-[11px] font-bold text-stone-500 uppercase tracking-widest">Extra guidance (optional)</label>
                    <textarea
                        value={prompt} onChange={e => setPrompt(e.target.value)}
                        rows={3}
                        placeholder="Tone, length, must-mention points…"
                        className="mt-1 w-full border border-stone-200 rounded-xl px-3 py-2 text-sm bg-stone-50 focus:bg-white focus:ring-2 focus:ring-black outline-none resize-none"
                    />
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                    <button
                        type="button"
                        onClick={() => generate(false)}
                        disabled={loading || saving || (templateType === "custom" && !customTitle.trim())}
                        className="bg-black text-white px-5 py-2.5 rounded-full text-sm font-bold inline-flex items-center gap-2 disabled:opacity-60"
                    >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                        {loading ? "Drafting…" : "Draft Template"}
                    </button>
                    <button
                        type="button"
                        onClick={() => generate(true)}
                        disabled={loading || saving || (templateType === "custom" && !customTitle.trim())}
                        className="bg-emerald-600 text-white px-5 py-2.5 rounded-full text-sm font-bold inline-flex items-center gap-2 disabled:opacity-60 hover:bg-emerald-700"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Draft &amp; Save
                    </button>
                </div>

                {error && <p className="text-red-600 text-sm font-medium">{error}</p>}
            </div>

            {result && (
                <div className="bg-white border border-stone-200 rounded-2xl p-5 space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                        <h3 className="font-bold text-lg">{result.title}</h3>
                        <div className="flex items-center gap-2">
                            {saved ? (
                                <span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-bold bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-200">
                                    <Check className="w-3.5 h-3.5" /> Saved to Documents
                                </span>
                            ) : (
                                <button type="button" onClick={saveExisting} disabled={saving} className="bg-emerald-600 text-white px-3 py-1.5 rounded-full text-xs font-bold inline-flex items-center gap-1 disabled:opacity-60 hover:bg-emerald-700">
                                    {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                                    Save to Documents
                                </button>
                            )}
                            {saved && (
                                <Link href="/documents" className="text-xs font-bold text-stone-500 hover:text-black inline-flex items-center gap-1">
                                    View <ArrowRight className="w-3 h-3" />
                                </Link>
                            )}
                        </div>
                    </div>
                    <pre className="whitespace-pre-wrap text-sm text-stone-700 font-sans bg-stone-50 border border-stone-200 rounded-xl p-4">
{result.content}
                    </pre>
                </div>
            )}
        </div>
    );
}
