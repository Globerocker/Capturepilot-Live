"use client";

import { useState, useEffect } from "react";
import { Loader2, FileText, Download, AlertCircle, Paperclip } from "lucide-react";

interface Attachment {
    name: string;
    type: string;
    postedDate: string;
    url: string;
    size: string;
}

interface Props {
    noticeId: string;
    resourceLinks?: string[];
}

export default function OpportunityAttachments({ noticeId, resourceLinks }: Props) {
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [fetched, setFetched] = useState(false);

    useEffect(() => {
        if (!noticeId || fetched) return;

        const fetchAttachments = async () => {
            setLoading(true);
            try {
                const res = await fetch(`/api/sam/attachments?noticeId=${encodeURIComponent(noticeId)}`);
                const data = await res.json();

                if (!res.ok) {
                    setError(data.error || "Failed to load attachments");
                    setLoading(false);
                    setFetched(true);
                    return;
                }

                setAttachments(data.attachments || []);
            } catch {
                setError("Failed to connect to SAM.gov");
            }
            setLoading(false);
            setFetched(true);
        };

        fetchAttachments();
    }, [noticeId, fetched]);

    // Combine fetched SAM.gov attachments with any resource_links from DB
    const allLinks = [
        ...attachments,
        ...(resourceLinks || [])
            .filter(link => !attachments.some(a => a.url === link))
            .map(link => {
                let fileName = "Attachment";
                try {
                    const urlObj = new URL(link);
                    const lastPart = urlObj.pathname.split("/").pop();
                    if (lastPart && lastPart.length > 0) {
                        fileName = decodeURIComponent(lastPart);
                    }
                } catch { /* ignore */ }
                return { name: fileName, type: "", postedDate: "", url: link, size: "" };
            }),
    ];

    const fileIcon = (name: string) => {
        const ext = name.split(".").pop()?.toLowerCase();
        if (ext === "pdf") return "text-red-500";
        if (ext === "doc" || ext === "docx") return "text-blue-500";
        if (ext === "xls" || ext === "xlsx") return "text-green-500";
        return "text-stone-400";
    };

    return (
        <div className="bg-white rounded-2xl sm:rounded-3xl border border-stone-200 shadow-sm overflow-hidden p-4 sm:p-8">
            <h2 className="font-typewriter text-base sm:text-lg font-bold mb-4 sm:mb-6 flex items-center text-stone-800">
                <Paperclip className="w-5 h-5 mr-2 sm:mr-3 text-stone-400" /> Attachments & Documents
            </h2>

            {loading && (
                <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-stone-400 mr-3" />
                    <span className="text-sm text-stone-500">Loading attachments from SAM.gov...</span>
                </div>
            )}

            {error && !loading && allLinks.length === 0 && (
                <div className="flex items-center text-amber-700 bg-amber-50 rounded-xl border border-amber-200 p-4">
                    <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0" />
                    <span className="text-sm">{error}</span>
                </div>
            )}

            {!loading && allLinks.length === 0 && !error && (
                <div className="bg-stone-50 border border-stone-200 p-5 rounded-2xl text-center py-8">
                    <FileText className="w-8 h-8 text-stone-300 mx-auto mb-3" />
                    <p className="text-sm font-medium text-stone-500">No attachments found on SAM.gov</p>
                    <p className="text-xs text-stone-400 mt-1">Attachments may be added later by the contracting office.</p>
                </div>
            )}

            {!loading && allLinks.length > 0 && (
                <div className="bg-stone-50 border border-stone-200 rounded-2xl divide-y divide-stone-200">
                    {allLinks.map((att, idx) => (
                        <a
                            key={idx}
                            href={att.url || "#"}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-between p-4 hover:bg-stone-100 transition-colors first:rounded-t-2xl last:rounded-b-2xl"
                        >
                            <div className="flex items-center min-w-0 flex-1">
                                <FileText className={`w-5 h-5 mr-3 flex-shrink-0 ${fileIcon(att.name)}`} />
                                <div className="min-w-0">
                                    <p className="font-medium text-sm text-stone-800 truncate">{att.name}</p>
                                    <div className="flex items-center gap-3 mt-0.5">
                                        {att.size && <span className="text-xs text-stone-400">{att.size}</span>}
                                        {att.type && <span className="text-xs text-stone-400">{att.type}</span>}
                                        {att.postedDate && <span className="text-xs text-stone-400">{new Date(att.postedDate).toLocaleDateString()}</span>}
                                    </div>
                                </div>
                            </div>
                            <Download className="w-4 h-4 text-blue-500 flex-shrink-0 ml-3" />
                        </a>
                    ))}
                </div>
            )}
        </div>
    );
}
