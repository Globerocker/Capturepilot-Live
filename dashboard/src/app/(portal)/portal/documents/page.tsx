"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { FileText, Upload, Loader2, Download, File, Trash2, CheckCircle2, AlertCircle } from "lucide-react";
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
    review_status: string | null;
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
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [uploadSuccess, setUploadSuccess] = useState(false);
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

        setUploadError(null);
        setUploadSuccess(false);
        setUploading(true);

        // Validate file size (max 25MB)
        if (file.size > 25 * 1024 * 1024) {
            setUploadError("File too large. Maximum size is 25 MB.");
            setUploading(false);
            return;
        }

        const ext = file.name.split(".").pop();
        const path = `documents/${profileId}/${Date.now()}.${ext}`;

        const { error: uploadError } = await supabase.storage.from("client-docs").upload(path, file);
        if (uploadError) {
            console.error("Upload error:", uploadError);
            setUploadError(`Upload failed: ${uploadError.message}. Please try again or contact support.`);
            setUploading(false);
            e.target.value = "";
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

        const { data: inserted, error: insertError } = await supabase.from("client_documents").insert(newDoc).select("*").single();
        if (insertError) {
            setUploadError(`File uploaded but failed to save record: ${insertError.message}`);
            setUploading(false);
            e.target.value = "";
            return;
        }
        if (inserted) {
            setDocs(prev => [inserted as Doc, ...prev]);
            setUploadSuccess(true);
            setTimeout(() => setUploadSuccess(false), 4000);
        }
        setUploading(false);
        e.target.value = "";
    };

    const formatSize = (bytes: number) => {
        if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
        if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(0)} KB`;
        return `${bytes} B`;
    };

    const reviewStatusBadge = (status: string | null) => {
        if (status === "reviewed") return (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded border bg-emerald-100 text-emerald-700 border-emerald-200 inline-flex items-center gap-0.5">
                <CheckCircle2 className="w-3 h-3" /> Reviewed
            </span>
        );
        if (status === "action_needed") return (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded border bg-amber-100 text-amber-700 border-amber-200 inline-flex items-center gap-0.5">
                <AlertCircle className="w-3 h-3" /> Action Needed
            </span>
        );
        return (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded border bg-stone-50 text-stone-400 border-stone-200">
                Pending Review
            </span>
        );
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
            <div className={clsx(
                "border-2 border-dashed rounded-2xl p-6 text-center transition-colors",
                uploadError ? "bg-red-50 border-red-300" :
                uploadSuccess ? "bg-emerald-50 border-emerald-300" :
                "bg-white border-stone-300 hover:border-stone-400"
            )}>
                <Upload className={clsx("w-8 h-8 mx-auto mb-3", uploadError ? "text-red-400" : uploadSuccess ? "text-emerald-400" : "text-stone-400")} />

                {uploadError && (
                    <div className="mb-3">
                        <p className="text-sm text-red-600 font-medium">{uploadError}</p>
                    </div>
                )}
                {uploadSuccess && (
                    <div className="mb-3">
                        <p className="text-sm text-emerald-600 font-medium">Document uploaded successfully!</p>
                    </div>
                )}
                {!uploadError && !uploadSuccess && (
                    <p className="text-sm text-stone-600 mb-3">Drop a file here or click to upload (max 25 MB)</p>
                )}

                <div className="flex items-center justify-center gap-3">
                    <select value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)} className="border border-stone-300 rounded-xl px-3 py-2 text-sm">
                        {Object.entries(CATEGORIES).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                        ))}
                    </select>
                    <label className={clsx(
                        "px-4 py-2 rounded-xl text-sm font-bold cursor-pointer transition-colors inline-flex items-center gap-1.5",
                        uploading ? "bg-stone-400 text-white cursor-not-allowed" : "bg-black text-white hover:bg-stone-800"
                    )}>
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
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                <span className={clsx("text-[10px] font-bold px-2 py-0.5 rounded border uppercase", "bg-stone-100 text-stone-500 border-stone-200")}>
                                    {CATEGORIES[doc.category] || doc.category}
                                </span>
                                {reviewStatusBadge(doc.review_status)}
                                <span className="text-xs text-stone-400">{formatSize(doc.file_size)}</span>
                                <span className="text-xs text-stone-400">{new Date(doc.created_at).toLocaleDateString()}</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                            <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-blue-600 hover:text-blue-800 inline-flex items-center gap-1">
                                <Download className="w-3.5 h-3.5" /> Download
                            </a>
                            <button type="button" title="Delete" onClick={async () => {
                                if (!confirm("Delete this document?")) return;
                                await supabase.from("client_documents").delete().eq("id", doc.id);
                                setDocs(prev => prev.filter(d => d.id !== doc.id));
                            }} className="text-xs text-stone-400 hover:text-red-600 p-1 rounded transition-colors">
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
