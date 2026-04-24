"use client";

import { useEffect, useMemo, useState } from "react";
import {
    GraduationCap, Plus, Search, Loader2, Video, BookOpen, Eye, EyeOff,
    Star, Trash2, Save, X, ExternalLink, Clock, Film, FileText, AlertCircle,
    CheckCircle2,
} from "lucide-react";
import clsx from "clsx";

type ContentType = "article" | "video";

interface Article {
    id: string;
    slug: string;
    title: string;
    excerpt: string | null;
    body_md: string | null;
    category: string;
    reading_minutes: number | null;
    featured: boolean;
    teaser_public: boolean;
    cover_image_url: string | null;
    author_name: string | null;
    published_at: string | null;
    updated_at: string;
    content_type: ContentType;
    video_url: string | null;
    video_provider: string | null;
    video_embed_id: string | null;
    duration_seconds: number | null;
    thumbnail_url: string | null;
}

const CATEGORIES = [
    { value: "playbook", label: "Playbook" },
    { value: "cert", label: "Certifications" },
    { value: "proposal", label: "Proposals" },
    { value: "pricing", label: "Pricing" },
    { value: "market_intel", label: "Market Intel" },
];

function slugify(s: string) {
    return s
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 80);
}

export default function AdminAcademyPage() {
    const [articles, setArticles] = useState<Article[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [typeFilter, setTypeFilter] = useState<"all" | ContentType>("all");
    const [statusFilter, setStatusFilter] = useState<"all" | "published" | "draft">("all");
    const [editor, setEditor] = useState<Article | "new" | null>(null);

    const load = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/admin/academy");
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to load");
            setArticles(data.articles || []);
            setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load");
        }
        setLoading(false);
    };

    useEffect(() => { load(); }, []);

    const filtered = useMemo(() => {
        return articles.filter(a => {
            if (typeFilter !== "all" && a.content_type !== typeFilter) return false;
            if (statusFilter === "published" && !a.published_at) return false;
            if (statusFilter === "draft" && a.published_at) return false;
            if (search) {
                const q = search.toLowerCase();
                if (!a.title.toLowerCase().includes(q) && !a.slug.toLowerCase().includes(q)) return false;
            }
            return true;
        });
    }, [articles, typeFilter, statusFilter, search]);

    const counts = useMemo(() => ({
        total: articles.length,
        videos: articles.filter(a => a.content_type === "video").length,
        articles: articles.filter(a => a.content_type === "article").length,
        published: articles.filter(a => !!a.published_at).length,
        drafts: articles.filter(a => !a.published_at).length,
    }), [articles]);

    return (
        <div className="w-full max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-stone-400 mb-1.5">Content</p>
                    <h1 className="text-2xl font-bold text-stone-900 flex items-center gap-2">
                        <GraduationCap className="w-6 h-6" /> Academy
                    </h1>
                    <p className="text-sm text-stone-500 mt-1">
                        Articles + videos shown to customers at <span className="font-mono text-xs bg-stone-100 px-1.5 py-0.5 rounded">/academy</span>.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => setEditor("new")}
                    className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-sm font-bold transition-colors shadow-sm"
                >
                    <Plus className="w-4 h-4" /> New content
                </button>
            </div>

            {/* Stat chips */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard label="Total" value={counts.total} icon={BookOpen} />
                <StatCard label="Videos" value={counts.videos} icon={Video} accent="indigo" />
                <StatCard label="Published" value={counts.published} icon={Eye} accent="emerald" />
                <StatCard label="Drafts" value={counts.drafts} icon={EyeOff} accent="amber" />
            </div>

            {/* Filter bar */}
            <div className="bg-white border border-stone-200 rounded-2xl p-3 flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search by title or slug…"
                        className="w-full border border-stone-200 rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400"
                    />
                </div>
                <FilterPills
                    value={typeFilter}
                    onChange={setTypeFilter}
                    options={[
                        { value: "all", label: "All" },
                        { value: "article", label: "Articles" },
                        { value: "video", label: "Videos" },
                    ]}
                />
                <FilterPills
                    value={statusFilter}
                    onChange={setStatusFilter}
                    options={[
                        { value: "all", label: "All status" },
                        { value: "published", label: "Published" },
                        { value: "draft", label: "Drafts" },
                    ]}
                />
            </div>

            {/* Error */}
            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" /> {error}
                </div>
            )}

            {/* List */}
            <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <Loader2 className="w-6 h-6 animate-spin text-stone-400" />
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                        <GraduationCap className="w-10 h-10 text-stone-300 mb-2" />
                        <p className="text-sm font-semibold text-stone-700">No content matches your filters.</p>
                        <button
                            type="button"
                            onClick={() => setEditor("new")}
                            className="mt-3 inline-flex items-center gap-1.5 text-emerald-600 hover:text-emerald-700 text-sm font-semibold"
                        >
                            <Plus className="w-4 h-4" /> Create your first piece
                        </button>
                    </div>
                ) : (
                    <ul className="divide-y divide-stone-100">
                        {filtered.map(a => (
                            <li key={a.id}>
                                <button
                                    type="button"
                                    onClick={() => setEditor(a)}
                                    className="w-full flex items-center gap-4 px-4 py-3.5 hover:bg-stone-50 text-left transition-colors"
                                >
                                    <div className={clsx(
                                        "w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0",
                                        a.content_type === "video" ? "bg-indigo-100 text-indigo-600" : "bg-stone-100 text-stone-500"
                                    )}>
                                        {a.content_type === "video" ? <Film className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <p className="font-semibold text-stone-900 truncate">{a.title}</p>
                                            {a.featured && <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />}
                                        </div>
                                        <p className="text-xs text-stone-500 truncate mt-0.5 font-mono">
                                            /academy/{a.slug}
                                        </p>
                                    </div>
                                    <span className="hidden sm:inline text-[10px] uppercase tracking-wider font-bold text-stone-400">
                                        {a.category}
                                    </span>
                                    {a.published_at ? (
                                        <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold text-emerald-700 bg-emerald-50 rounded-full px-2 py-0.5">
                                            <CheckCircle2 className="w-3 h-3" /> Live
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold text-amber-700 bg-amber-50 rounded-full px-2 py-0.5">
                                            Draft
                                        </span>
                                    )}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {/* Editor drawer */}
            {editor && (
                <AcademyEditor
                    initial={editor === "new" ? null : editor}
                    onClose={() => setEditor(null)}
                    onSaved={async () => { await load(); setEditor(null); }}
                />
            )}
        </div>
    );
}

function StatCard({ label, value, icon: Icon, accent }: {
    label: string;
    value: number;
    icon: React.ComponentType<{ className?: string }>;
    accent?: "indigo" | "emerald" | "amber";
}) {
    const palette = {
        indigo: "bg-indigo-50 text-indigo-600 border-indigo-100",
        emerald: "bg-emerald-50 text-emerald-600 border-emerald-100",
        amber: "bg-amber-50 text-amber-600 border-amber-100",
        default: "bg-stone-50 text-stone-500 border-stone-100",
    }[accent || "default"];
    return (
        <div className="bg-white border border-stone-200 rounded-2xl p-4">
            <div className="flex items-center gap-2">
                <div className={clsx("w-7 h-7 rounded-lg flex items-center justify-center border", palette)}>
                    <Icon className="w-3.5 h-3.5" />
                </div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-stone-500">{label}</p>
            </div>
            <p className="text-2xl font-bold text-stone-900 mt-2">{value}</p>
        </div>
    );
}

function FilterPills<T extends string>({ value, onChange, options }: {
    value: T;
    onChange: (v: T) => void;
    options: { value: T; label: string }[];
}) {
    return (
        <div className="inline-flex items-center bg-stone-100 rounded-xl p-1 gap-0.5">
            {options.map(o => (
                <button
                    key={o.value}
                    type="button"
                    onClick={() => onChange(o.value)}
                    className={clsx(
                        "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
                        value === o.value
                            ? "bg-white text-stone-900 shadow-sm"
                            : "text-stone-500 hover:text-stone-700"
                    )}
                >
                    {o.label}
                </button>
            ))}
        </div>
    );
}

// ----------------------------------------------------------------------------
// Editor drawer
// ----------------------------------------------------------------------------

interface EditorProps {
    initial: Article | null;
    onClose: () => void;
    onSaved: () => void;
}

function AcademyEditor({ initial, onClose, onSaved }: EditorProps) {
    const isNew = !initial;
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const [contentType, setContentType] = useState<ContentType>(initial?.content_type || "article");
    const [title, setTitle] = useState(initial?.title || "");
    const [slug, setSlug] = useState(initial?.slug || "");
    const [excerpt, setExcerpt] = useState(initial?.excerpt || "");
    const [category, setCategory] = useState(initial?.category || "playbook");
    const [readingMinutes, setReadingMinutes] = useState<string>(
        initial?.reading_minutes ? String(initial.reading_minutes) : ""
    );
    const [durationSeconds, setDurationSeconds] = useState<string>(
        initial?.duration_seconds ? String(initial.duration_seconds) : ""
    );
    const [videoUrl, setVideoUrl] = useState(initial?.video_url || "");
    const [coverImageUrl, setCoverImageUrl] = useState(initial?.cover_image_url || "");
    const [bodyMd, setBodyMd] = useState(initial?.body_md || "");
    const [featured, setFeatured] = useState(!!initial?.featured);
    const [teaserPublic, setTeaserPublic] = useState(initial ? !!initial.teaser_public : true);
    const [authorName, setAuthorName] = useState(initial?.author_name || "CapturePilot Team");
    const [autoSlug, setAutoSlug] = useState(isNew);

    // Auto-fill slug from title while in "new" mode and user hasn't touched slug
    useEffect(() => {
        if (autoSlug && isNew) setSlug(slugify(title));
    }, [title, autoSlug, isNew]);

    const submit = async (publish: boolean) => {
        setErr(null);
        setSaving(true);
        try {
            const payload = {
                slug,
                title,
                excerpt: excerpt || null,
                body_md: bodyMd || null,
                category,
                reading_minutes: readingMinutes ? parseInt(readingMinutes, 10) : null,
                featured,
                teaser_public: teaserPublic,
                cover_image_url: coverImageUrl || null,
                author_name: authorName || null,
                content_type: contentType,
                video_url: videoUrl || null,
                duration_seconds: durationSeconds ? parseInt(durationSeconds, 10) : null,
            };

            let res: Response;
            if (isNew) {
                res = await fetch("/api/admin/academy", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ...payload, publish }),
                });
            } else {
                res = await fetch("/api/admin/academy", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        ...payload,
                        slug: initial!.slug, // identify row
                        new_slug: slug !== initial!.slug ? slug : undefined,
                        // Respect the publish toggle on existing rows:
                        // - If "publish" was clicked and row is a draft → set published_at now
                        // - If "save" clicked on an already-published row → keep it published
                        // - Explicit unpublish uses the Unpublish button below
                        published_at: publish
                            ? (initial!.published_at || new Date().toISOString())
                            : initial!.published_at,
                    }),
                });
            }
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Save failed");
            onSaved();
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Save failed");
        }
        setSaving(false);
    };

    const unpublish = async () => {
        if (!initial) return;
        setSaving(true);
        try {
            const res = await fetch("/api/admin/academy", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ slug: initial.slug, published_at: null }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Unpublish failed");
            onSaved();
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Unpublish failed");
        }
        setSaving(false);
    };

    const remove = async () => {
        if (!initial) return;
        if (!confirm(`Delete "${initial.title}"? This cannot be undone.`)) return;
        setDeleting(true);
        try {
            const res = await fetch(`/api/admin/academy?slug=${encodeURIComponent(initial.slug)}`, {
                method: "DELETE",
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Delete failed");
            onSaved();
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Delete failed");
            setDeleting(false);
        }
    };

    const isPublished = !!initial?.published_at;

    return (
        <div className="fixed inset-0 z-50 flex justify-end">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white w-full max-w-3xl h-full overflow-y-auto shadow-2xl flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200 sticky top-0 bg-white z-10">
                    <div className="flex items-center gap-3">
                        <div className={clsx(
                            "w-9 h-9 rounded-lg flex items-center justify-center",
                            contentType === "video" ? "bg-indigo-100 text-indigo-600" : "bg-stone-100 text-stone-500"
                        )}>
                            {contentType === "video" ? <Film className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-stone-900">
                                {isNew ? "New content" : "Edit content"}
                            </h2>
                            {!isNew && (
                                <p className="text-xs text-stone-500">
                                    {isPublished ? "Live" : "Draft"} · updated {new Date(initial!.updated_at).toLocaleDateString()}
                                </p>
                            )}
                        </div>
                    </div>
                    <button type="button" onClick={onClose} className="p-2 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 px-6 py-5 space-y-5">
                    {/* Type toggle */}
                    <div>
                        <Label>Type</Label>
                        <div className="inline-flex items-center bg-stone-100 rounded-xl p-1 gap-0.5">
                            <button
                                type="button"
                                onClick={() => setContentType("article")}
                                className={clsx(
                                    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
                                    contentType === "article" ? "bg-white text-stone-900 shadow-sm" : "text-stone-500"
                                )}
                            >
                                <FileText className="w-3.5 h-3.5" /> Article
                            </button>
                            <button
                                type="button"
                                onClick={() => setContentType("video")}
                                className={clsx(
                                    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
                                    contentType === "video" ? "bg-white text-stone-900 shadow-sm" : "text-stone-500"
                                )}
                            >
                                <Video className="w-3.5 h-3.5" /> Video
                            </button>
                        </div>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-4">
                        <div className="sm:col-span-2">
                            <Label>Title</Label>
                            <input
                                type="text"
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                                placeholder="e.g. How to Respond to a Sources Sought in 48 Hours"
                                className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400"
                            />
                        </div>
                        <div className="sm:col-span-2">
                            <div className="flex items-center justify-between">
                                <Label>URL slug</Label>
                                {isNew && (
                                    <button
                                        type="button"
                                        onClick={() => { setAutoSlug(v => !v); if (!autoSlug) setSlug(slugify(title)); }}
                                        className="text-[10px] font-semibold text-stone-500 hover:text-emerald-600"
                                    >
                                        {autoSlug ? "Edit manually" : "Auto from title"}
                                    </button>
                                )}
                            </div>
                            <div className="flex items-center gap-1 text-sm font-mono text-stone-400">
                                <span>/academy/</span>
                                <input
                                    type="text"
                                    value={slug}
                                    onChange={e => { setAutoSlug(false); setSlug(slugify(e.target.value)); }}
                                    placeholder="my-new-article"
                                    className="flex-1 border border-stone-200 rounded-xl px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400"
                                />
                            </div>
                        </div>
                        <div>
                            <Label>Category</Label>
                            <select
                                value={category}
                                onChange={e => setCategory(e.target.value)}
                                title="Category"
                                className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400"
                            >
                                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                            </select>
                        </div>
                        <div>
                            <Label>Author</Label>
                            <input
                                type="text"
                                value={authorName}
                                onChange={e => setAuthorName(e.target.value)}
                                placeholder="CapturePilot Team"
                                className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400"
                            />
                        </div>
                    </div>

                    <div>
                        <Label>Excerpt</Label>
                        <textarea
                            value={excerpt}
                            onChange={e => setExcerpt(e.target.value)}
                            rows={2}
                            placeholder="1–2 sentences shown on cards and teaser pages."
                            className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400"
                        />
                    </div>

                    {contentType === "video" ? (
                        <>
                            <div>
                                <Label>Video URL</Label>
                                <input
                                    type="url"
                                    value={videoUrl}
                                    onChange={e => setVideoUrl(e.target.value)}
                                    placeholder="https://www.youtube.com/watch?v=… or https://vimeo.com/… or https://www.loom.com/share/…"
                                    className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400"
                                />
                                <p className="text-[11px] text-stone-500 mt-1.5">
                                    YouTube, Vimeo, and Loom URLs auto-extract an embed ID + thumbnail.
                                </p>
                            </div>
                            <div className="grid sm:grid-cols-2 gap-4">
                                <div>
                                    <Label>Duration (seconds)</Label>
                                    <input
                                        type="number"
                                        value={durationSeconds}
                                        onChange={e => setDurationSeconds(e.target.value)}
                                        placeholder="300"
                                        className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400"
                                    />
                                </div>
                                <div>
                                    <Label>Thumbnail URL (optional)</Label>
                                    <input
                                        type="url"
                                        value={coverImageUrl}
                                        onChange={e => setCoverImageUrl(e.target.value)}
                                        placeholder="Leave blank to auto-fetch from YouTube"
                                        className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400"
                                    />
                                </div>
                            </div>
                            <div>
                                <Label>Show notes (optional markdown)</Label>
                                <textarea
                                    value={bodyMd}
                                    onChange={e => setBodyMd(e.target.value)}
                                    rows={6}
                                    placeholder="Timestamps, transcript, linked resources…"
                                    className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400"
                                />
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="grid sm:grid-cols-2 gap-4">
                                <div>
                                    <Label>Reading time (minutes)</Label>
                                    <input
                                        type="number"
                                        value={readingMinutes}
                                        onChange={e => setReadingMinutes(e.target.value)}
                                        placeholder="5"
                                        className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400"
                                    />
                                </div>
                                <div>
                                    <Label>Cover image URL (optional)</Label>
                                    <input
                                        type="url"
                                        value={coverImageUrl}
                                        onChange={e => setCoverImageUrl(e.target.value)}
                                        placeholder="https://…"
                                        className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400"
                                    />
                                </div>
                            </div>
                            <div>
                                <div className="flex items-center justify-between">
                                    <Label>Body (Markdown)</Label>
                                    <span className="text-[11px] text-stone-400">
                                        <Clock className="inline w-3 h-3 mr-1" />
                                        Supports headings, lists, links, code
                                    </span>
                                </div>
                                <textarea
                                    value={bodyMd}
                                    onChange={e => setBodyMd(e.target.value)}
                                    rows={14}
                                    placeholder="# Heading&#10;&#10;Your markdown here…"
                                    className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400"
                                />
                            </div>
                        </>
                    )}

                    <div className="grid sm:grid-cols-2 gap-4 pt-2 border-t border-stone-100">
                        <Toggle
                            checked={featured}
                            onChange={setFeatured}
                            label="Featured"
                            hint="Pin to the top of the Academy list"
                        />
                        <Toggle
                            checked={teaserPublic}
                            onChange={setTeaserPublic}
                            label="Public teaser"
                            hint="Show title + excerpt on the marketing site"
                        />
                    </div>

                    {err && (
                        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 flex items-center gap-2">
                            <AlertCircle className="w-4 h-4" /> {err}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="sticky bottom-0 bg-white border-t border-stone-200 px-6 py-4 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                        {!isNew && (
                            <button
                                type="button"
                                onClick={remove}
                                disabled={saving || deleting}
                                className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
                            >
                                {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                Delete
                            </button>
                        )}
                        {!isNew && isPublished && (
                            <button
                                type="button"
                                onClick={unpublish}
                                disabled={saving || deleting}
                                className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-600 hover:text-stone-800 hover:bg-stone-100 px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
                            >
                                <EyeOff className="w-3.5 h-3.5" /> Unpublish
                            </button>
                        )}
                        {!isNew && isPublished && (
                            <a
                                href={`/academy/${slug}`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-600 hover:text-emerald-700 px-3 py-2 rounded-lg transition-colors"
                            >
                                <ExternalLink className="w-3.5 h-3.5" /> Preview
                            </a>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => submit(false)}
                            disabled={saving || !title || !slug}
                            className="inline-flex items-center gap-1.5 text-sm font-semibold text-stone-700 border border-stone-200 hover:border-stone-300 hover:bg-stone-50 px-4 py-2 rounded-xl transition-colors disabled:opacity-50"
                        >
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            Save draft
                        </button>
                        <button
                            type="button"
                            onClick={() => submit(true)}
                            disabled={saving || !title || !slug}
                            className="inline-flex items-center gap-1.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded-xl transition-colors disabled:opacity-50"
                        >
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                            {isPublished ? "Save + keep live" : "Publish"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function Label({ children }: { children: React.ReactNode }) {
    return <p className="text-[10px] font-bold uppercase tracking-widest text-stone-500 mb-1.5">{children}</p>;
}

function Toggle({ checked, onChange, label, hint }: {
    checked: boolean;
    onChange: (v: boolean) => void;
    label: string;
    hint?: string;
}) {
    return (
        <button
            type="button"
            onClick={() => onChange(!checked)}
            className="flex items-center gap-3 bg-white border border-stone-200 rounded-xl px-3 py-2.5 text-left hover:border-stone-300 transition-colors"
        >
            <div className={clsx(
                "relative w-9 h-5 rounded-full transition-colors flex-shrink-0",
                checked ? "bg-emerald-500" : "bg-stone-300"
            )}>
                <div className={clsx(
                    "absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all",
                    checked ? "left-[18px]" : "left-0.5"
                )} />
            </div>
            <div>
                <p className="text-sm font-semibold text-stone-900 leading-tight">{label}</p>
                {hint && <p className="text-[11px] text-stone-500 leading-tight mt-0.5">{hint}</p>}
            </div>
        </button>
    );
}
