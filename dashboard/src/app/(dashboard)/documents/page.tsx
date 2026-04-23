"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseClient } from "@/lib/supabase/client";
import {
    FolderOpen, Upload, Loader2, Download, File as FileIcon, Trash2, Search,
    Tag, X, Plus, FileText, Award, ShieldCheck, Mail, Sparkles,
} from "lucide-react";
import clsx from "clsx";
import AutoSyncedDocs from "@/components/documents/AutoSyncedDocs";

const supabase = createSupabaseClient();

interface UserDocument {
    id: string;
    name: string;
    category: "proposal" | "capability" | "cert" | "reference" | "template" | "other";
    file_url: string | null;
    storage_path: string | null;
    file_size: number | null;
    mime_type: string | null;
    content: string | null;
    tags: string[];
    linked_pursuit_id: string | null;
    created_at: string;
}

const CATEGORY_META: Record<UserDocument["category"], { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
    proposal:   { label: "Proposals",            icon: FileText,    color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    capability: { label: "Capability Statements",icon: Sparkles,    color: "bg-blue-50 text-blue-700 border-blue-200" },
    cert:       { label: "Certifications",       icon: Award,       color: "bg-amber-50 text-amber-700 border-amber-200" },
    reference:  { label: "Reference Letters",    icon: Mail,        color: "bg-purple-50 text-purple-700 border-purple-200" },
    template:   { label: "Templates",            icon: ShieldCheck, color: "bg-indigo-50 text-indigo-700 border-indigo-200" },
    other:      { label: "Other",                icon: FileIcon,    color: "bg-stone-50 text-stone-700 border-stone-200" },
};

const CATEGORY_ORDER: UserDocument["category"][] = ["proposal", "capability", "cert", "reference", "template", "other"];

const MAX_SIZE = 25 * 1024 * 1024; // 25 MB

export default function DocumentsPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [profileId, setProfileId] = useState<string | null>(null);
    const [docs, setDocs] = useState<UserDocument[]>([]);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [selectedCategory, setSelectedCategory] = useState<UserDocument["category"]>("proposal");
    const [filterCategory, setFilterCategory] = useState<UserDocument["category"] | "all">("all");
    const [filterTag, setFilterTag] = useState<string>("");
    const [search, setSearch] = useState("");
    const [newTagInput, setNewTagInput] = useState<Record<string, string>>({});

    useEffect(() => {
        (async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) { router.push("/login"); return; }
            const { data: profile } = await supabase
                .from("user_profiles").select("id").eq("auth_user_id", user.id).single();
            if (!profile) { router.push("/onboard"); return; }
            setProfileId((profile as { id: string }).id);
        })();
    }, [router]);

    const fetchDocs = useCallback(async () => {
        if (!profileId) return;
        setLoading(true);
        const { data, error } = await supabase
            .from("user_documents")
            .select("*")
            .eq("user_profile_id", profileId)
            .order("created_at", { ascending: false });
        if (error) console.error("[documents] fetch failed:", error);
        setDocs(((data || []) as unknown) as UserDocument[]);
        setLoading(false);
    }, [profileId]);

    useEffect(() => { if (profileId) fetchDocs(); }, [profileId, fetchDocs]);

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !profileId) return;
        setUploadError(null);

        if (file.size > MAX_SIZE) {
            setUploadError("File too large. Max 25 MB.");
            e.target.value = "";
            return;
        }

        setUploading(true);
        try {
            const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
            const path = `user-documents/${profileId}/${Date.now()}-${safeName}`;
            const { error: upErr } = await supabase.storage.from("client-docs").upload(path, file);
            if (upErr) {
                setUploadError(`Upload failed: ${upErr.message}`);
                setUploading(false);
                e.target.value = "";
                return;
            }
            const { data: urlData } = supabase.storage.from("client-docs").getPublicUrl(path);

            const res = await fetch("/api/documents", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: file.name,
                    category: selectedCategory,
                    file_url: urlData.publicUrl,
                    storage_path: path,
                    file_size: file.size,
                    mime_type: file.type,
                    tags: [],
                }),
            });
            if (!res.ok) {
                const j = await res.json().catch(() => ({}));
                setUploadError(j.error || "Save failed");
                setUploading(false);
                e.target.value = "";
                return;
            }
            const { document } = await res.json();
            setDocs(prev => [document as UserDocument, ...prev]);
        } finally {
            setUploading(false);
            e.target.value = "";
        }
    };

    const deleteDoc = async (id: string) => {
        if (!confirm("Delete this document?")) return;
        const res = await fetch(`/api/documents/${id}`, { method: "DELETE" });
        if (res.ok) setDocs(prev => prev.filter(d => d.id !== id));
    };

    const addTag = async (doc: UserDocument) => {
        const newTag = (newTagInput[doc.id] || "").trim();
        if (!newTag || doc.tags.includes(newTag)) return;
        const tags = [...doc.tags, newTag];
        const res = await fetch(`/api/documents/${doc.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tags }),
        });
        if (res.ok) {
            setDocs(prev => prev.map(d => d.id === doc.id ? { ...d, tags } : d));
            setNewTagInput(prev => ({ ...prev, [doc.id]: "" }));
        }
    };

    const removeTag = async (doc: UserDocument, tag: string) => {
        const tags = doc.tags.filter(t => t !== tag);
        const res = await fetch(`/api/documents/${doc.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tags }),
        });
        if (res.ok) setDocs(prev => prev.map(d => d.id === doc.id ? { ...d, tags } : d));
    };

    const updateCategory = async (docId: string, category: UserDocument["category"]) => {
        const res = await fetch(`/api/documents/${docId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ category }),
        });
        if (res.ok) setDocs(prev => prev.map(d => d.id === docId ? { ...d, category } : d));
    };

    const allTags = useMemo(() => {
        const set = new Set<string>();
        docs.forEach(d => d.tags.forEach(t => set.add(t)));
        return Array.from(set).sort();
    }, [docs]);

    const filteredDocs = useMemo(() => {
        return docs.filter(d => {
            if (filterCategory !== "all" && d.category !== filterCategory) return false;
            if (filterTag && !d.tags.includes(filterTag)) return false;
            if (search && !d.name.toLowerCase().includes(search.toLowerCase())) return false;
            return true;
        });
    }, [docs, filterCategory, filterTag, search]);

    const formatSize = (bytes: number | null) => {
        if (!bytes) return "—";
        if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
        if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(0)} KB`;
        return `${bytes} B`;
    };

    return (
        <div className="max-w-5xl mx-auto pb-12 animate-in fade-in duration-500 px-1">
            <header className="mb-6">
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tighter text-black flex items-center">
                    <FolderOpen className="mr-2 sm:mr-3 w-6 h-6 sm:w-8 sm:h-8" /> Documents
                    <span className="ml-3 text-sm font-sans font-medium bg-stone-100 px-3 py-1 rounded-full text-stone-500 border border-stone-200">
                        {docs.length}
                    </span>
                </h2>
                <p className="text-stone-500 font-medium text-sm mt-1">
                    Every proposal, cap statement, email template, and uploaded file in one place. Search, tag, attach to pursuits.
                </p>
            </header>

            {/* Auto-synced from the rest of the account */}
            {profileId && <AutoSyncedDocs profileId={profileId} />}

            {/* Upload */}
            <section className={clsx(
                "border-2 border-dashed rounded-2xl p-6 mb-6 transition-colors",
                uploadError ? "bg-red-50 border-red-300" : "bg-white border-stone-300 hover:border-stone-400"
            )}>
                <div className="flex items-center justify-center flex-wrap gap-3">
                    <Upload className="w-8 h-8 text-stone-400" />
                    <div className="flex-1 min-w-0 text-center sm:text-left">
                        {uploadError ? (
                            <p className="text-sm text-red-600 font-medium">{uploadError}</p>
                        ) : (
                            <p className="text-sm text-stone-600">Upload a document (max 25 MB)</p>
                        )}
                    </div>
                    <select
                        title="Document category"
                        value={selectedCategory}
                        onChange={e => setSelectedCategory(e.target.value as UserDocument["category"])}
                        className="border border-stone-300 rounded-xl px-3 py-2 text-sm"
                    >
                        {CATEGORY_ORDER.map(k => (
                            <option key={k} value={k}>{CATEGORY_META[k].label}</option>
                        ))}
                    </select>
                    <label className={clsx(
                        "px-4 py-2 rounded-xl text-sm font-bold cursor-pointer transition-colors inline-flex items-center gap-1.5",
                        uploading ? "bg-stone-400 text-white cursor-not-allowed" : "bg-black text-white hover:bg-stone-800"
                    )}>
                        {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                        {uploading ? "Uploading..." : "Choose File"}
                        <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
                    </label>
                </div>
            </section>

            {/* Filters */}
            <section className="flex flex-wrap items-center gap-2 mb-4">
                <button
                    type="button"
                    onClick={() => setFilterCategory("all")}
                    className={clsx(
                        "text-xs font-bold px-3 py-1.5 rounded-full border transition-all",
                        filterCategory === "all" ? "bg-black text-white border-black" : "bg-white text-stone-600 border-stone-200 hover:bg-stone-100"
                    )}
                >
                    All ({docs.length})
                </button>
                {CATEGORY_ORDER.map(k => {
                    const count = docs.filter(d => d.category === k).length;
                    if (count === 0) return null;
                    return (
                        <button
                            type="button"
                            key={k}
                            onClick={() => setFilterCategory(k)}
                            className={clsx(
                                "text-xs font-bold px-3 py-1.5 rounded-full border transition-all inline-flex items-center gap-1.5",
                                filterCategory === k ? "bg-black text-white border-black" : "bg-white text-stone-600 border-stone-200 hover:bg-stone-100"
                            )}
                        >
                            {CATEGORY_META[k].label} ({count})
                        </button>
                    );
                })}
                {allTags.length > 0 && (
                    <select
                        title="Filter by tag"
                        value={filterTag}
                        onChange={e => setFilterTag(e.target.value)}
                        className="ml-auto text-xs border border-stone-200 rounded-full px-3 py-1.5 bg-white"
                    >
                        <option value="">All tags</option>
                        {allTags.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                )}
            </section>

            {/* Search */}
            <div className="bg-white p-2 rounded-full border border-stone-200 shadow-sm flex items-center mb-6 focus-within:ring-2 focus-within:ring-black">
                <Search className="w-5 h-5 text-stone-400 ml-3 sm:ml-4 mr-2" />
                <input
                    type="text"
                    placeholder="Search documents by name..."
                    className="bg-transparent border-none outline-none w-full text-stone-700 text-sm"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />
                {search && (
                    <button type="button" title="Clear" onClick={() => setSearch("")} className="p-2 text-stone-400 hover:text-black">
                        <X className="w-4 h-4" />
                    </button>
                )}
            </div>

            {/* Docs */}
            {loading ? (
                <div className="flex items-center justify-center h-32"><Loader2 className="w-6 h-6 text-stone-400 animate-spin" /></div>
            ) : filteredDocs.length === 0 ? (
                <div className="bg-stone-50 border border-stone-200 border-dashed rounded-[24px] p-8 sm:p-12 text-center">
                    <FolderOpen className="w-10 h-10 text-stone-300 mx-auto mb-3" />
                    {docs.length === 0 ? (
                        <>
                            <p className="text-stone-500 mb-1">No documents yet</p>
                            <p className="text-stone-400 text-sm">Upload your first document to start building your library.</p>
                        </>
                    ) : (
                        <>
                            <p className="text-stone-500 mb-1">No documents match your filters</p>
                            <button type="button" onClick={() => { setFilterCategory("all"); setFilterTag(""); setSearch(""); }} className="text-xs font-bold text-black underline mt-2">Clear filters</button>
                        </>
                    )}
                </div>
            ) : (
                <div className="space-y-5">
                    {/* Folder view — docs grouped by category. Each category is a collapsible folder.
                        This keeps the flat `category` column (no schema change) but renders a clearer
                        folder-tree mental model. */}
                    {CATEGORY_ORDER.filter(cat => filteredDocs.some(d => d.category === cat)).map(cat => {
                        const group = filteredDocs.filter(d => d.category === cat);
                        const meta = CATEGORY_META[cat];
                        const Icon = meta.icon;
                        return (
                            <section key={cat}>
                                <div className={clsx("flex items-center gap-2 mb-2 px-1")}>
                                    <div className={clsx("w-6 h-6 rounded-lg border flex items-center justify-center", meta.color)}>
                                        <Icon className="w-3.5 h-3.5" />
                                    </div>
                                    <h3 className="text-xs font-bold uppercase tracking-widest text-stone-700">{meta.label}</h3>
                                    <span className="text-[10px] font-bold bg-stone-100 text-stone-500 px-2 py-0.5 rounded-full border border-stone-200">
                                        {group.length}
                                    </span>
                                </div>
                                <div className="space-y-2 pl-2 border-l-2 border-stone-100">
                    {group.map(doc => {
                        const rowMeta = CATEGORY_META[doc.category];
                        const RowIcon = rowMeta.icon;
                        return (
                            <div key={doc.id} className="bg-white border border-stone-200 hover:border-stone-300 rounded-xl sm:rounded-2xl p-3 sm:p-4 transition-all shadow-sm">
                                <div className="flex items-start gap-3">
                                    <div className={clsx("w-10 h-10 rounded-xl border flex items-center justify-center flex-shrink-0", rowMeta.color)}>
                                        <RowIcon className="w-5 h-5" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-bold text-sm text-black truncate">{doc.name}</p>
                                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                                            <select
                                                title="Change category"
                                                value={doc.category}
                                                onChange={e => updateCategory(doc.id, e.target.value as UserDocument["category"])}
                                                className={clsx("text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-widest", rowMeta.color)}
                                            >
                                                {CATEGORY_ORDER.map(k => <option key={k} value={k}>{CATEGORY_META[k].label}</option>)}
                                            </select>
                                            <span className="text-[10px] text-stone-400">{formatSize(doc.file_size)}</span>
                                            <span className="text-[10px] text-stone-400">{new Date(doc.created_at).toLocaleDateString()}</span>
                                        </div>
                                        {/* Tags */}
                                        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                                            {doc.tags.map(t => (
                                                <span key={t} className="text-[10px] font-medium bg-stone-100 text-stone-600 border border-stone-200 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                                                    <Tag className="w-2.5 h-2.5" /> {t}
                                                    <button type="button" title="Remove tag" onClick={() => removeTag(doc, t)} className="hover:text-red-500">
                                                        <X className="w-2.5 h-2.5" />
                                                    </button>
                                                </span>
                                            ))}
                                            <div className="inline-flex items-center gap-1">
                                                <input
                                                    type="text"
                                                    placeholder="Add tag"
                                                    value={newTagInput[doc.id] || ""}
                                                    onChange={e => setNewTagInput(prev => ({ ...prev, [doc.id]: e.target.value }))}
                                                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addTag(doc); } }}
                                                    className="text-[10px] px-2 py-0.5 rounded-full border border-dashed border-stone-300 bg-white w-20 focus:outline-none focus:border-stone-500"
                                                />
                                                <button type="button" title="Add tag" onClick={() => addTag(doc)} className="p-0.5 text-stone-400 hover:text-black">
                                                    <Plus className="w-3 h-3" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                        {doc.file_url && (
                                            <a
                                                href={doc.file_url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-xs font-bold text-stone-500 hover:text-black p-1.5 rounded-lg hover:bg-stone-100 inline-flex items-center gap-1"
                                                title="Download / open"
                                            >
                                                <Download className="w-3.5 h-3.5" />
                                            </a>
                                        )}
                                        <button type="button" title="Delete" onClick={() => deleteDoc(doc.id)} className="text-stone-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50">
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>
                                {doc.content && (
                                    <div className="mt-3 pt-3 border-t border-stone-100 text-xs text-stone-600 whitespace-pre-wrap line-clamp-4">
                                        {doc.content}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                                </div>
                            </section>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
