"use client";

import { useEffect, useRef, useState, use } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
    ArrowLeft, Save, Send, Loader2, CheckCircle2, AlertTriangle,
    RotateCcw, Upload, Power,
} from "lucide-react";
import clsx from "clsx";
import { MERGE_TAGS, NON_EDITABLE_TEMPLATES } from "@/lib/email-custom-template";
import { DEFAULT_EMAIL_SETTINGS } from "@/lib/email-settings";

// Unlayer editor — client-only. Using `any` for the editor ref because
// the package's generic types are over-constrained for a dynamic import.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const EmailEditor = dynamic(() => import("react-email-editor"), { ssr: false }) as any;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EditorRef = any;

interface LoadedTemplate {
    exists: boolean;
    design_json?: object | null;
    html?: string | null;
    subject?: string | null;
    published?: boolean;
    updated_at?: string | null;
}

export default function EmailTemplateEditor({ params }: { params: Promise<{ key: string }> }) {
    const { key } = use(params);
    const editorRef = useRef<EditorRef>(null);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [publishing, setPublishing] = useState(false);
    const [resetting, setResetting] = useState(false);
    const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

    const [loaded, setLoaded] = useState<LoadedTemplate | null>(null);
    const [subject, setSubject] = useState("");
    const [isPublished, setIsPublished] = useState(false);

    const templateInfo = DEFAULT_EMAIL_SETTINGS[key];
    const mergeTags = MERGE_TAGS[key] || [];
    const nonEditable = NON_EDITABLE_TEMPLATES.has(key);

    // Fetch existing template
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
                setIsPublished(!!data.published);
            } finally {
                setLoading(false);
            }
        })();
    }, [key]);

    // Configure editor once it's ready
    const onEditorReady = () => {
        const editor = editorRef.current?.editor;
        if (!editor) return;

        // Push merge tags into the editor so users can insert them
        if (editor.setMergeTags && mergeTags.length > 0) {
            const tagMap: Record<string, { name: string; value: string; sample: string }> = {};
            for (const t of mergeTags) {
                tagMap[t.value] = { name: t.name, value: `{{${t.value}}}`, sample: t.sample };
            }
            editor.setMergeTags(tagMap);
        }

        // Load existing design if we have one
        if (loaded?.design_json) {
            editor.loadDesign(loaded.design_json);
        }
    };

    const handleSave = async (publish = false) => {
        const editor = editorRef.current?.editor;
        if (!editor) return;

        if (publish) setPublishing(true); else setSaving(true);
        setStatus(null);

        editor.exportHtml(async ({ design, html }: { design: object; html: string }) => {
            try {
                const res = await fetch(`/api/admin/email-templates/${key}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        design_json: design,
                        html,
                        subject,
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
        });
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
        if (!confirm("Delete the custom template? Live sends will fall back to the default code template.")) return;
        setResetting(true);
        try {
            const res = await fetch(`/api/admin/email-templates/${key}`, { method: "DELETE" });
            if (res.ok) {
                setStatus({ type: "success", message: "Custom template deleted. Refreshing..." });
                setTimeout(() => window.location.reload(), 1000);
            }
        } finally {
            setResetting(false);
        }
    };

    if (!templateInfo) {
        return <div className="p-8 text-center text-stone-500">Unknown template: {key}</div>;
    }

    if (nonEditable) {
        return (
            <div className="w-full space-y-4">
                <Link href="/admin/emails" className="text-sm text-stone-500 hover:text-stone-700 inline-flex items-center gap-1">
                    <ArrowLeft className="w-4 h-4" /> Back to Email Templates
                </Link>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
                    <h1 className="text-lg font-bold text-amber-900 mb-2">{templateInfo.label}</h1>
                    <p className="text-sm text-amber-800 leading-relaxed">
                        This template renders dynamic data tables or charts (opportunity lists, score circles) that don&apos;t translate cleanly to a visual editor.
                        It stays as code — edit it in <code className="bg-amber-100 px-1.5 py-0.5 rounded font-mono text-xs">src/lib/email.ts</code>.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <Link href="/admin/emails" className="text-xs text-stone-500 hover:text-stone-700 inline-flex items-center gap-1 mb-2">
                        <ArrowLeft className="w-3.5 h-3.5" /> Back to Email Templates
                    </Link>
                    <h1 className="text-xl font-bold flex items-center gap-2">
                        {templateInfo.label}
                        {isPublished && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 uppercase">Published</span>
                        )}
                    </h1>
                    <p className="text-xs text-stone-500 mt-0.5">{templateInfo.description}</p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={handleReset}
                        disabled={resetting || !loaded?.exists}
                        className="text-xs font-bold px-3 py-2 rounded-lg border border-stone-200 text-stone-500 hover:bg-stone-50 inline-flex items-center gap-1.5 disabled:opacity-50"
                    >
                        {resetting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                        Reset to Default
                    </button>
                    {isPublished && (
                        <button
                            type="button"
                            onClick={handleUnpublish}
                            disabled={publishing}
                            className="text-xs font-bold px-3 py-2 rounded-lg border border-stone-200 text-stone-500 hover:bg-stone-50 inline-flex items-center gap-1.5 disabled:opacity-50"
                        >
                            {publishing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Power className="w-3.5 h-3.5" />}
                            Unpublish
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => handleSave(false)}
                        disabled={saving || publishing || loading}
                        className="text-xs font-bold px-4 py-2 rounded-lg border border-stone-300 bg-white text-stone-700 hover:bg-stone-50 inline-flex items-center gap-1.5 disabled:opacity-50"
                    >
                        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                        Save Draft
                    </button>
                    <button
                        type="button"
                        onClick={() => handleSave(true)}
                        disabled={saving || publishing || loading}
                        className="text-xs font-bold px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 inline-flex items-center gap-1.5 disabled:opacity-50"
                    >
                        {publishing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                        Publish
                    </button>
                </div>
            </div>

            {/* Status */}
            {status && (
                <div className={clsx(
                    "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium",
                    status.type === "success" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"
                )}>
                    {status.type === "success" ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                    {status.message}
                </div>
            )}

            {/* Subject */}
            <div className="bg-white border border-stone-200 rounded-xl p-4">
                <label className="block text-[10px] font-bold text-stone-500 uppercase tracking-wider mb-1.5">Subject Line <span className="normal-case text-stone-300">(merge tags supported)</span></label>
                <input
                    type="text"
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                    placeholder="e.g. Welcome to CapturePilot, {{companyName}}"
                    className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-200"
                />
            </div>

            {/* Merge tags reference */}
            {mergeTags.length > 0 && (
                <div className="bg-stone-50 border border-stone-200 rounded-xl p-4">
                    <p className="text-[10px] font-bold text-stone-500 uppercase tracking-wider mb-2">
                        Merge Tags Available
                        <span className="normal-case text-stone-400 font-normal ml-2">Click to copy, then paste into the editor or subject line</span>
                    </p>
                    <div className="flex gap-2 flex-wrap">
                        {mergeTags.map(tag => (
                            <button
                                key={tag.value}
                                type="button"
                                onClick={() => {
                                    navigator.clipboard.writeText(`{{${tag.value}}}`);
                                    setStatus({ type: "success", message: `Copied {{${tag.value}}}` });
                                    setTimeout(() => setStatus(null), 1500);
                                }}
                                className="text-xs font-mono bg-white border border-stone-200 px-2.5 py-1 rounded hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-700 transition-colors"
                                title={`${tag.name} — e.g. "${tag.sample}"`}
                            >
                                {`{{${tag.value}}}`}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Editor */}
            <div className="bg-white border border-stone-200 rounded-xl overflow-hidden" style={{ height: "780px" }}>
                {loading ? (
                    <div className="h-full flex items-center justify-center text-stone-400">
                        <Loader2 className="w-6 h-6 animate-spin" />
                    </div>
                ) : (
                    <EmailEditor
                        ref={editorRef}
                        onReady={onEditorReady}
                        minHeight="780px"
                        options={{
                            displayMode: "email",
                            features: {
                                preview: true,
                                undoRedo: true,
                            },
                            appearance: {
                                theme: "modern_light",
                                panels: { tools: { dock: "left" } },
                            },
                        }}
                    />
                )}
            </div>

            <p className="text-xs text-stone-400 text-center">
                Saved drafts are private. <strong>Publish</strong> to make this version go live — the next send using this template will use the custom HTML instead of the code default.
            </p>
        </div>
    );
}
