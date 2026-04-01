"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { FileText, Upload, Loader2, Download, File } from "lucide-react";
import clsx from "clsx";

const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Doc {
    id: string;
    filename: string;
    file_url: string;
    file_size: number;
    mime_type: string;
    category: string;
    description: string | null;
    created_at: string;
}

const CATEGORIES: Record<string, string> = {
    capability_statement: "Capability Statement",
    past_performance: "Past Performance",
    certification: "Certification",
    proposal: "Proposal",
    contract: "Contract",
    financial: "Financial",
    legal: "Legal",
    sam_registration: "SAM.gov",
    website_assets: "Website Assets",
    logo: "Logo",
    general: "General",
};

export default function PortalDocuments() {
    const [docs, setDocs] = useState<Doc[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [profileId, setProfileId] = useState<string>("");
    const [selectedCategory, setSelectedCategory] = useState("general");

    useEffect(() => {
        (async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data: prof } = await supabase
                .from("user_profiles")
                .select("id")
                .eq("auth_user_id", user.id)
                .single();
            if (!prof) return;
            setProfileId(prof.id);

            const { data } = await supabase
                .from("client_documents")
                .select("*")
                .eq("user_profile_id", prof.id)
                .order("created_at", { ascending: false });

            setDocs((data || []) as Doc[]);
            setLoading(false);
        })();
    }, []);

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !profileId) return;

        setUploading(true);
        const ext = file.name.split(".").pop();
        const path = `documents/${profileId}/${Date.now()}.${ext}`;

        const { error: uploadError } = await supabase.storage.from("client-docs").upload(path, file);
        if (uploadError) {
            console.error("Upload error:", uploadError);
            setUploading(false);
            return;
        }

        const { data: urlData } = supabase.storage.from("client-docs").getPublicUrl(path);

        const newDoc = {
            user_profile_id: profileId,
            filename: file.name,
            file_url: urlData.publicUrl,
            file_size: file.size,
            mime_type: file.type,
            category: selectedCategory,
        };

        const { data: inserted } = await supabase.from("client_documents").insert(newDoc).select("*").single();
        if (inserted) setDocs(prev => [inserted as Doc, ...prev]);
        setUploading(false);
        e.target.value = "";
    };

    const formatSize = (bytes: number) => {
        if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
        if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(0)} KB`;
        return `${bytes} B`;
    };

    if (loading) {
        return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 text-stone-400 animate-spin" /></div>;
    }

    return (
        <div className="max-w-4xl space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-black font-typewriter flex items-center gap-2">
                        <FileText className="w-6 h-6" /> Documents
                    </h1>
                    <p className="text-sm text-stone-500 mt-1">Upload and manage your B2G documents.</p>
                </div>
            </div>

            {/* Upload area */}
            <div className="bg-white border-2 border-dashed border-stone-300 rounded-2xl p-6 text-center hover:border-stone-400 transition-colors">
                <Upload className="w-8 h-8 text-stone-400 mx-auto mb-3" />
                <p className="text-sm text-stone-600 mb-3">Drop a file here or click to upload</p>
                <div className="flex items-center justify-center gap-3">
                    <select value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)} className="border border-stone-300 rounded-xl px-3 py-2 text-sm">
                        {Object.entries(CATEGORIES).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                        ))}
                    </select>
                    <label className="bg-black text-white px-4 py-2 rounded-xl text-sm font-bold cursor-pointer hover:bg-stone-800 transition-colors inline-flex items-center gap-1.5">
                        <Upload className="w-4 h-4" />
                        {uploading ? "Uploading..." : "Choose File"}
                        <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
                    </label>
                </div>
            </div>

            {/* Document list */}
            {docs.length === 0 && (
                <div className="bg-white border border-stone-200 rounded-2xl p-8 text-center">
                    <p className="text-stone-500 text-sm">No documents uploaded yet.</p>
                </div>
            )}

            <div className="space-y-2">
                {docs.map(doc => (
                    <div key={doc.id} className="bg-white border border-stone-200 rounded-xl p-4 flex items-center gap-3">
                        <File className="w-8 h-8 text-stone-400 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-black truncate">{doc.filename}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                                <span className={clsx("text-[10px] font-bold px-2 py-0.5 rounded border uppercase", "bg-stone-100 text-stone-500 border-stone-200")}>
                                    {CATEGORIES[doc.category] || doc.category}
                                </span>
                                <span className="text-xs text-stone-400">{formatSize(doc.file_size)}</span>
                                <span className="text-xs text-stone-400">{new Date(doc.created_at).toLocaleDateString()}</span>
                            </div>
                        </div>
                        <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-blue-600 hover:text-blue-800 inline-flex items-center gap-1">
                            <Download className="w-3.5 h-3.5" /> Download
                        </a>
                    </div>
                ))}
            </div>
        </div>
    );
}
