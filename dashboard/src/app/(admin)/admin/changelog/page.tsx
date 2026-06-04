"use client";

/**
 * Admin changelog editor — list + create + edit + publish/unpublish + delete.
 * Server-side enforcement via /api/admin/changelog* routes (assertAdmin gated).
 *
 * UX is intentionally bare: a list on the left, form on the right.
 * Markdown source is edited as text (no WYSIWYG — keep dependencies thin).
 */

import { useEffect, useState } from "react";
import { Loader2, Plus, Eye, EyeOff, Save, Trash2, AlertTriangle, CheckCircle2, ExternalLink } from "lucide-react";
import clsx from "clsx";
import Link from "next/link";

interface Entry {
    id: string;
    slug: string;
    title: string;
    body_md: string;
    category: "feature" | "fix" | "improvement" | "breaking";
    released_at: string;
    published: boolean;
    cover_image_url: string | null;
    author_email: string | null;
    created_at: string;
    updated_at: string;
}

const CATEGORIES: Entry["category"][] = ["feature", "improvement", "fix", "breaking"];

export default function AdminChangelogPage() {
    const [entries, setEntries] = useState<Entry[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [draft, setDraft] = useState<Partial<Entry>>({});
    const [saving, setSaving] = useState(false);
    const [status, setStatus] = useState<{ type: "ok" | "err"; msg: string } | null>(null);

    useEffect(() => {
        load();
    }, []);

    async function load() {
        setLoading(true);
        try {
            const res = await fetch("/api/admin/changelog");
            const data = await res.json();
            if (Array.isArray(data.entries)) {
                setEntries(data.entries);
            }
        } finally {
            setLoading(false);
        }
    }

    function startNew() {
        setSelectedId(null);
        setDraft({
            slug: "",
            title: "",
            body_md: "## What's new\n\n— what changed\n\n## Why\n\n— reasoning",
            category: "feature",
            released_at: new Date().toISOString(),
            published: false,
        });
        setStatus(null);
    }

    function select(e: Entry) {
        setSelectedId(e.id);
        setDraft(e);
        setStatus(null);
    }

    async function save() {
        setSaving(true);
        setStatus(null);
        try {
            const isNew = !selectedId;
            const method = isNew ? "POST" : "PATCH";
            const url = isNew ? "/api/admin/changelog" : `/api/admin/changelog/${selectedId}`;
            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(draft),
            });
            const data = await res.json();
            if (!res.ok) {
                setStatus({ type: "err", msg: data.error || "Save failed" });
            } else {
                setStatus({ type: "ok", msg: isNew ? "Created" : "Saved" });
                await load();
                if (isNew && data.id) {
                    setSelectedId(data.id);
                }
            }
        } catch {
            setStatus({ type: "err", msg: "Network error" });
        } finally {
            setSaving(false);
        }
    }

    async function togglePublish() {
        if (!selectedId) return;
        const next = !draft.published;
        const res = await fetch(`/api/admin/changelog/${selectedId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ published: next }),
        });
        if (res.ok) {
            setDraft({ ...draft, published: next });
            await load();
        }
    }

    async function deleteEntry() {
        if (!selectedId) return;
        if (!confirm("Delete this entry? This can't be undone.")) return;
        const res = await fetch(`/api/admin/changelog/${selectedId}`, { method: "DELETE" });
        if (res.ok) {
            setSelectedId(null);
            setDraft({});
            await load();
        }
    }

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-bold text-stone-900">Changelog</h1>
                <div className="flex items-center gap-2">
                    <Link href="/changelog" target="_blank" className="text-xs font-bold text-stone-600 hover:text-stone-900 border border-stone-300 hover:border-stone-400 px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5">
                        <ExternalLink className="w-3 h-3" /> Public page
                    </Link>
                    <button
                        onClick={startNew}
                        className="bg-stone-900 hover:bg-stone-800 text-white text-sm font-bold px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5"
                    >
                        <Plus className="w-3.5 h-3.5" /> New entry
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-12 gap-5">
                {/* LIST */}
                <aside className="col-span-12 lg:col-span-4 bg-white border border-stone-200 rounded-xl overflow-hidden">
                    <div className="p-3 border-b border-stone-200 text-xs font-bold uppercase tracking-wide text-stone-500">
                        {loading ? "Loading…" : `${entries.length} entries`}
                    </div>
                    <ul className="divide-y divide-stone-200 max-h-[600px] overflow-y-auto">
                        {entries.map(e => (
                            <li key={e.id}>
                                <button
                                    onClick={() => select(e)}
                                    className={clsx(
                                        "w-full text-left p-3 hover:bg-stone-50 transition-colors",
                                        selectedId === e.id ? "bg-emerald-50 border-l-4 border-emerald-500" : ""
                                    )}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="font-bold text-sm text-stone-900 leading-tight flex-1 min-w-0">{e.title}</div>
                                        {e.published
                                            ? <Eye className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0 mt-0.5" />
                                            : <EyeOff className="w-3.5 h-3.5 text-stone-400 flex-shrink-0 mt-0.5" />}
                                    </div>
                                    <div className="text-xs text-stone-500 mt-1 flex items-center gap-2">
                                        <span className="capitalize">{e.category}</span>
                                        <span>·</span>
                                        <span>{new Date(e.released_at).toLocaleDateString()}</span>
                                    </div>
                                </button>
                            </li>
                        ))}
                        {entries.length === 0 && !loading && (
                            <li className="p-6 text-center text-sm text-stone-500">
                                No entries yet. Click "New entry" to write the first one.
                            </li>
                        )}
                    </ul>
                </aside>

                {/* EDITOR */}
                <section className="col-span-12 lg:col-span-8 bg-white border border-stone-200 rounded-xl p-5">
                    {!draft.title && !selectedId && Object.keys(draft).length === 0 ? (
                        <div className="text-center py-16 text-stone-400 text-sm">
                            Select an entry on the left or click "New entry" to start.
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wide text-stone-600 mb-1">Slug</label>
                                    <input
                                        type="text"
                                        value={draft.slug || ""}
                                        onChange={e => setDraft({ ...draft, slug: e.target.value })}
                                        placeholder="e.g. ai-proposal-writer-v2"
                                        disabled={!!selectedId}
                                        className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none disabled:bg-stone-50 disabled:text-stone-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wide text-stone-600 mb-1">Category</label>
                                    <select
                                        value={draft.category || "feature"}
                                        onChange={e => setDraft({ ...draft, category: e.target.value as Entry["category"] })}
                                        className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none bg-white"
                                    >
                                        {CATEGORIES.map(c => <option key={c} value={c} className="capitalize">{c}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wide text-stone-600 mb-1">Title</label>
                                <input
                                    type="text"
                                    value={draft.title || ""}
                                    onChange={e => setDraft({ ...draft, title: e.target.value })}
                                    placeholder="e.g. AI Proposal Writer v2 — now 3x faster"
                                    className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wide text-stone-600 mb-1">Released at</label>
                                    <input
                                        type="datetime-local"
                                        value={draft.released_at ? new Date(draft.released_at).toISOString().slice(0, 16) : ""}
                                        onChange={e => setDraft({ ...draft, released_at: new Date(e.target.value).toISOString() })}
                                        className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wide text-stone-600 mb-1">Cover image URL (optional)</label>
                                    <input
                                        type="text"
                                        value={draft.cover_image_url || ""}
                                        onChange={e => setDraft({ ...draft, cover_image_url: e.target.value })}
                                        placeholder="https://…"
                                        className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wide text-stone-600 mb-1">Body (Markdown)</label>
                                <textarea
                                    value={draft.body_md || ""}
                                    onChange={e => setDraft({ ...draft, body_md: e.target.value })}
                                    rows={14}
                                    spellCheck={false}
                                    className="w-full border border-stone-300 rounded-lg p-3 text-xs font-mono leading-relaxed focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none resize-y"
                                />
                                <p className="text-xs text-stone-500 mt-1">
                                    Markdown supported: <code>## headings</code>, <code>**bold**</code>, <code>[links](url)</code>, <code>- bullets</code>, <code>`code`</code>
                                </p>
                            </div>

                            {status && (
                                <div className={clsx(
                                    "rounded-lg p-3 text-sm inline-flex items-start gap-2",
                                    status.type === "ok"
                                        ? "bg-emerald-50 border border-emerald-200 text-emerald-900"
                                        : "bg-red-50 border border-red-200 text-red-900"
                                )}>
                                    {status.type === "ok" ? <CheckCircle2 className="w-4 h-4 mt-0.5" /> : <AlertTriangle className="w-4 h-4 mt-0.5" />}
                                    {status.msg}
                                </div>
                            )}

                            <div className="flex items-center justify-between gap-3 pt-3 border-t border-stone-200">
                                {selectedId && (
                                    <button
                                        onClick={deleteEntry}
                                        className="text-sm text-red-600 hover:text-red-800 font-bold inline-flex items-center gap-1.5"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" /> Delete
                                    </button>
                                )}
                                <div className="flex items-center gap-2 ml-auto">
                                    {selectedId && (
                                        <button
                                            onClick={togglePublish}
                                            className={clsx(
                                                "text-sm font-bold px-3 py-2 rounded-lg inline-flex items-center gap-1.5 border",
                                                draft.published
                                                    ? "border-amber-300 text-amber-700 hover:bg-amber-50"
                                                    : "border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                                            )}
                                        >
                                            {draft.published ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                            {draft.published ? "Unpublish" : "Publish"}
                                        </button>
                                    )}
                                    <button
                                        onClick={save}
                                        disabled={saving || !draft.title || !draft.body_md}
                                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold px-4 py-2 rounded-lg inline-flex items-center gap-1.5 disabled:opacity-50"
                                    >
                                        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                        {saving ? "Saving…" : selectedId ? "Save" : "Create"}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}
