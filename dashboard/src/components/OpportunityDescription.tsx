"use client";

import { useState, useEffect } from "react";
import { Loader2, FileText, AlertCircle } from "lucide-react";

interface Props {
    noticeId: string;
    currentDescription?: string;
}

export default function OpportunityDescription({ noticeId, currentDescription }: Props) {
    const [description, setDescription] = useState<string>("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [fetched, setFetched] = useState(false);

    // Check if the current description is just a SAM.gov API URL
    const isUrl = currentDescription?.startsWith("https://api.sam.gov/") || currentDescription?.startsWith("http");
    const needsFetch = !currentDescription || isUrl;

    useEffect(() => {
        if (!needsFetch && currentDescription) {
            setDescription(currentDescription);
            setFetched(true);
            return;
        }

        if (!noticeId || fetched) return;

        const fetchDescription = async () => {
            setLoading(true);
            try {
                const res = await fetch(`/api/sam/description?noticeId=${encodeURIComponent(noticeId)}`);
                const data = await res.json();

                if (!res.ok) {
                    setError(data.error || "Failed to load description");
                    setLoading(false);
                    return;
                }

                if (data.description) {
                    setDescription(data.description);
                }
            } catch {
                setError("Failed to connect to SAM.gov");
            }
            setLoading(false);
            setFetched(true);
        };

        fetchDescription();
    }, [noticeId, needsFetch, currentDescription, fetched]);

    if (loading) {
        return (
            <div className="bg-white rounded-2xl sm:rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
                <div className="bg-stone-50 border-b border-stone-100 px-4 sm:px-8 py-4 sm:py-5">
                    <h2 className="font-typewriter text-base sm:text-lg font-bold flex items-center text-stone-800">
                        <FileText className="w-5 h-5 mr-2 sm:mr-3 text-stone-400" /> Description
                    </h2>
                </div>
                <div className="p-8 flex items-center justify-center">
                    <Loader2 className="w-5 h-5 animate-spin text-stone-400 mr-3" />
                    <span className="text-sm text-stone-500">Loading description from SAM.gov...</span>
                </div>
            </div>
        );
    }

    if (error && !description) {
        return (
            <div className="bg-white rounded-2xl sm:rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
                <div className="bg-stone-50 border-b border-stone-100 px-4 sm:px-8 py-4 sm:py-5">
                    <h2 className="font-typewriter text-base sm:text-lg font-bold flex items-center text-stone-800">
                        <FileText className="w-5 h-5 mr-2 sm:mr-3 text-stone-400" /> Description
                    </h2>
                </div>
                <div className="p-4 sm:p-6">
                    <div className="flex items-start text-amber-700 bg-amber-50 rounded-xl border border-amber-200 p-4">
                        <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0 mt-0.5" />
                        <div className="text-sm">
                            <p className="mb-2">{error}</p>
                            <a
                                href={`https://sam.gov/opp/${noticeId}/view`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:text-blue-800 underline font-medium"
                            >
                                View full notice on SAM.gov
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (!description) return null;

    return (
        <div className="bg-white rounded-2xl sm:rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
            <div className="bg-stone-50 border-b border-stone-100 px-4 sm:px-8 py-4 sm:py-5">
                <h2 className="font-typewriter text-base sm:text-lg font-bold flex items-center text-stone-800">
                    <FileText className="w-5 h-5 mr-2 sm:mr-3 text-stone-400" /> Description
                </h2>
            </div>
            <div className="p-4 sm:p-8">
                {/* If content is HTML, render it; otherwise show as text */}
                {description.includes("<") && description.includes(">") ? (
                    <div
                        className="prose prose-sm prose-stone max-w-none text-stone-700 leading-relaxed
                            [&_table]:border-collapse [&_table]:w-full [&_td]:border [&_td]:border-stone-200 [&_td]:p-2 [&_td]:text-sm
                            [&_th]:border [&_th]:border-stone-200 [&_th]:p-2 [&_th]:text-sm [&_th]:bg-stone-50 [&_th]:font-bold
                            [&_a]:text-blue-600 [&_a]:underline [&_ul]:list-disc [&_ol]:list-decimal [&_p]:mb-3"
                        dangerouslySetInnerHTML={{ __html: description }}
                    />
                ) : (
                    <p className="text-sm text-stone-700 leading-relaxed whitespace-pre-wrap">{description}</p>
                )}
            </div>
        </div>
    );
}
