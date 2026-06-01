"use client";

/**
 * Preview + raw-HTML editor for code-defined email templates (e.g. the
 * 12-email nurture sequence). Used instead of the Unlayer visual editor
 * for templates that ship with built-in HTML but no Unlayer design_json.
 *
 * Layout: subject input on top, iframe preview on the left, textarea on
 * the right. Save / Publish / Reset buttons mirror the Unlayer editor's
 * actions so the admin flow is consistent.
 *
 * Once an admin clicks "Save", a row is written to email_templates with
 * the edited HTML. The render fallback in the API stops returning the
 * code-default and serves the saved row instead.
 */

import { useEffect, useState, use } from "react";
import Link from "next/link";
import {
    ArrowLeft, Save, Loader2, CheckCircle2, AlertTriangle,
    RotateCcw, Power, Eye, Code2, Smartphone, Monitor,
} from "lucide-react";
import clsx from "clsx";
import { DEFAULT_EMAIL_SETTINGS } from "@/lib/email-settings";

interface LoadedTemplate {
    exists: boolean;
    html?: string | null;
    subject?: string | null;
    published?: boolean;
    updated_at?: string | null;
    is_default?: boolean;
}

export default function NurtureEmailPreview({ params }: { params: Promise<{ key: string }> }) {
    const { key } = use(params);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [publishing, setPublishing] = useState(false);
    const [resetting, setResetting] = useState(false);
    const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

    const [loaded, setLoaded] = useState<LoadedTemplate | null>(null);
    const [subject, setSubject] = useState("");
    const [html, setHtml] = useState("");
    const [isPublished, setIsPublished] = useState(false);
    const [mode, setMode] = useState<"preview" | "code">("preview");
    const [device, setDevice] = useState<"desktop" | "mobile">("desktop");

    const templateInfo = DEFAULT_EMAIL_SETTINGS[key];

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch(`/api/admin/email-templates/${key}`);
                if (!res.ok) {
                    setStatus({ type: "error", message: "Failed to load template" });
                    return;
                }
                const data: LoadedTemplate = await res.json();
                setLoaded(data);
                setSubject(data.subject || "");
                setHtml(data.html || "");
                setIsPublished(!!data.published);
            } finally {
                setLoading(false);
            }
        })();
    }, [key]);

    const handleSave = async (publish = false) => {
        if (publish) setPublishing(true); else setSaving(true);
        setStatus(null);
        try {
            const res = await fetch(`/api/admin/email-templates/${key}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    html,
                    subject,
                    design_json: null,
                    published: publish ? true : isPublished,
                }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                setStatus({ type: "error", message: data.error || "Save failed" });
                return;
            }
            if (publish) setIsPublished(true);
            setStatus({
                type: "success",
                message: publish ? "Published — live sends will use this version" : "Draft saved",
            });
        } catch {
            setStatus({ type: "error", message: "Network error" });
        } finally {
            setSaving(false);
            setPublishing(false);
        }
    };

    const handleUnpublish = async () => {
        setPublishing(true);
        try {
            const res = await fetch(`/api/admin/email-templates/${key}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ published: false }),
            });
            if (res.ok) {
                setIsPublished(false);
                setStatus({ type: "success", message: "Unpublished — live sends will use the default code template" });
            }
        } finally {
            setPublishing(false);
        }
    };

    const handleReset = async () => {
        if (!confirm("Reset to the built-in default? You'll lose any edits you've made.")) return;
        setResetting(true);
        try {
            const res = await fetch(`/api/admin/email-templates/${key}`, { method: "DELETE" });
            if (res.ok) {
                setStatus({ type: "success", message: "Reset to default. Refreshing..." });
                setTimeout(() => window.location.reload(), 1000);
            }
        } finally {
            setResetting(false);
        }
    };

    if (!templateInfo) {
        return <div className="p-8 text-center text-stone-500">Unknown template: {key}</div>;
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px] text-stone-500">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading template...
            </div>
        );
    }

    return (
        <div className="w-full space-y-4 pb-12">
            <Link href="/admin/emails" className="text-sm text-stone-500 hover:text-stone-700 inline-flex items-center gap-1">
                <ArrowLeft className="w-4 h-4" /> Back to Email Templates
            </Link>

            <div className="bg-white rounded-xl border border-stone-200 p-5">
                <div className="flex items-start justify-between gap-4 mb-4">
                    <div>
                        <h1 className="text-xl font-bold text-stone-900">{templateInfo.label}</h1>
                        <p className="text-sm text-stone-500 mt-1">{templateInfo.description}</p>
                        {loaded?.is_default && (
                            <div className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded">
                                <AlertTriangle className="w-3 h-3" /> Built-in default — never edited
                            </div>
                        )}
                        {isPublished && (
                            <div className="mt-2 ml-2 inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded">
                                <CheckCircle2 className="w-3 h-3" /> Published — live sends use this
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                        <button onClick={handleReset} disabled={resetting} className="text-xs font-bold text-stone-600 border border-stone-200 hover:bg-stone-50 px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 disabled:opacity-50">
                            {resetting ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />} Reset
                        </button>
                        {isPublished ? (
                            <button onClick={handleUnpublish} disabled={publishing} className="text-xs font-bold text-amber-700 border border-amber-200 hover:bg-amber-50 px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 disabled:opacity-50">
                                <Power className="w-3 h-3" /> Unpublish
                            </button>
                        ) : null}
                        <button onClick={() => handleSave(false)} disabled={saving || publishing} className="text-xs font-bold text-stone-700 bg-white border border-stone-200 hover:bg-stone-50 px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 disabled:opacity-50">
                            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save draft
                        </button>
                        <button onClick={() => handleSave(true)} disabled={saving || publishing} className="text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 disabled:opacity-50">
                            {publishing ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />} {isPublished ? "Update live" : "Publish"}
                        </button>
                    </div>
                </div>

                {status && (
                    <div className={clsx("text-sm rounded-lg px-3 py-2 mb-3 inline-flex items-center gap-2", status.type === "success" ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-red-50 text-red-800 border border-red-200")}>
                        {status.type === "success" ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                        {status.message}
                    </div>
                )}

                <label className="block text-xs font-bold text-stone-600 uppercase tracking-wide mb-1">Subject line</label>
                <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none"
                    placeholder="Subject line..."
                />
            </div>

            <div className="flex items-center justify-between bg-white rounded-xl border border-stone-200 p-3">
                <div className="flex items-center gap-1 bg-stone-100 p-1 rounded-lg">
                    <button onClick={() => setMode("preview")} className={clsx("text-xs font-bold px-3 py-1.5 rounded inline-flex items-center gap-1.5", mode === "preview" ? "bg-white text-stone-900 shadow-sm" : "text-stone-600")}>
                        <Eye className="w-3.5 h-3.5" /> Preview
                    </button>
                    <button onClick={() => setMode("code")} className={clsx("text-xs font-bold px-3 py-1.5 rounded inline-flex items-center gap-1.5", mode === "code" ? "bg-white text-stone-900 shadow-sm" : "text-stone-600")}>
                        <Code2 className="w-3.5 h-3.5" /> HTML
                    </button>
                </div>
                {mode === "preview" && (
                    <div className="flex items-center gap-1 bg-stone-100 p-1 rounded-lg">
                        <button onClick={() => setDevice("desktop")} className={clsx("text-xs font-bold px-3 py-1.5 rounded inline-flex items-center gap-1.5", device === "desktop" ? "bg-white text-stone-900 shadow-sm" : "text-stone-600")}>
                            <Monitor className="w-3.5 h-3.5" /> Desktop
                        </button>
                        <button onClick={() => setDevice("mobile")} className={clsx("text-xs font-bold px-3 py-1.5 rounded inline-flex items-center gap-1.5", device === "mobile" ? "bg-white text-stone-900 shadow-sm" : "text-stone-600")}>
                            <Smartphone className="w-3.5 h-3.5" /> Mobile
                        </button>
                    </div>
                )}
            </div>

            {mode === "preview" ? (
                <div className="bg-stone-100 rounded-xl border border-stone-200 p-4 flex justify-center">
                    <iframe
                        title="Email preview"
                        srcDoc={html}
                        sandbox=""
                        className={clsx(
                            "bg-white border border-stone-200 rounded-lg",
                            device === "desktop" ? "w-full max-w-[680px]" : "w-[375px]",
                        )}
                        style={{ minHeight: "800px" }}
                    />
                </div>
            ) : (
                <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
                    <textarea
                        value={html}
                        onChange={(e) => setHtml(e.target.value)}
                        spellCheck={false}
                        className="w-full p-4 font-mono text-xs leading-relaxed bg-stone-50 text-stone-900 border-none outline-none resize-none"
                        style={{ minHeight: "800px" }}
                    />
                </div>
            )}
        </div>
    );
}
