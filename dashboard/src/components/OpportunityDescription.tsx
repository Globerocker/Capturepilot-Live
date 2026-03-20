"use client";

import { useState, useEffect } from "react";
import { Loader2, FileText, AlertCircle, ChevronDown } from "lucide-react";
import clsx from "clsx";
import { cleanDescription } from "@/utils/cleanDescription";

interface Props {
    noticeId: string;
    currentDescription?: string;
    defaultCollapsed?: boolean;
}

function cleanSamHtml(html: string): string {
    let clean = html;
    // Strip inline style attributes (SAM.gov often has Word/Outlook styles)
    clean = clean.replace(/\s*style="[^"]*"/gi, "");
    // Strip class attributes (MsoNormal, etc.)
    clean = clean.replace(/\s*class="[^"]*"/gi, "");
    // Remove <font> tags but keep content
    clean = clean.replace(/<\/?font[^>]*>/gi, "");
    // Remove <o:p> tags (Word XML namespace)
    clean = clean.replace(/<\/?o:p[^>]*>/gi, "");
    // Remove empty paragraphs with only whitespace/nbsp
    clean = clean.replace(/<p[^>]*>\s*(&nbsp;\s*)*<\/p>/gi, "");
    // Remove excessive <br> tags (more than 2 in a row)
    clean = clean.replace(/(<br\s*\/?\s*>){3,}/gi, "<br><br>");
    // Remove Word-specific XML tags
    clean = clean.replace(/<\/?[a-z]+:[a-z]+[^>]*>/gi, "");
    // Remove empty spans
    clean = clean.replace(/<span[^>]*>\s*<\/span>/gi, "");
    // Clean up extra whitespace between tags
    clean = clean.replace(/>\s+</g, "> <");
    return clean.trim();
}

export default function OpportunityDescription({ noticeId, currentDescription, defaultCollapsed = false }: Props) {
    const [description, setDescription] = useState<string>("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [fetched, setFetched] = useState(false);
    const [collapsed, setCollapsed] = useState(defaultCollapsed);

    // Check if the current description is just a SAM.gov API URL
    const isUrl = currentDescription?.startsWith("https://api.sam.gov/") || currentDescription?.startsWith("http");
    const needsFetch = !currentDescription || isUrl;

    useEffect(() => {
        if (!needsFetch && currentDescription) {
            setDescription(cleanDescription(currentDescription));
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
                    setDescription(cleanDescription(data.description));
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
            <button
                type="button"
                onClick={() => setCollapsed(!collapsed)}
                className="w-full bg-stone-50 border-b border-stone-100 px-4 sm:px-8 py-4 sm:py-5 flex items-center justify-between hover:bg-stone-100 transition-colors"
            >
                <h2 className="font-typewriter text-base sm:text-lg font-bold flex items-center text-stone-800">
                    <FileText className="w-5 h-5 mr-2 sm:mr-3 text-stone-400" /> Description
                </h2>
                <ChevronDown className={clsx("w-5 h-5 text-stone-400 transition-transform duration-200", !collapsed && "rotate-180")} />
            </button>
            {!collapsed && (
                <div className="p-4 sm:p-8 max-h-[600px] overflow-y-auto">
                    {/* If content is HTML, clean and render it; otherwise show as text */}
                    {description.includes("<") && description.includes(">") ? (
                        <div
                            className="prose prose-sm prose-stone max-w-none text-stone-700 leading-relaxed
                                [&_table]:border-collapse [&_table]:w-full [&_table]:text-sm
                                [&_td]:border [&_td]:border-stone-200 [&_td]:p-2 [&_td]:text-sm [&_td]:align-top
                                [&_th]:border [&_th]:border-stone-200 [&_th]:p-2 [&_th]:text-sm [&_th]:bg-stone-50 [&_th]:font-bold [&_th]:align-top
                                [&_a]:text-blue-600 [&_a]:underline [&_a]:break-all
                                [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5
                                [&_p]:mb-2 [&_p]:text-sm [&_p]:leading-relaxed
                                [&_h1]:text-lg [&_h1]:font-bold [&_h1]:mt-4 [&_h1]:mb-2
                                [&_h2]:text-base [&_h2]:font-bold [&_h2]:mt-3 [&_h2]:mb-2
                                [&_h3]:text-sm [&_h3]:font-bold [&_h3]:mt-3 [&_h3]:mb-1
                                [&_li]:text-sm [&_li]:mb-1
                                [&_br]:leading-relaxed
                                [&_span]:!text-inherit [&_span]:!font-inherit [&_span]:!text-sm
                                [&_div]:text-sm [&_div]:leading-relaxed"
                            dangerouslySetInnerHTML={{ __html: cleanSamHtml(description) }}
                        />
                    ) : (
                        <p className="text-sm text-stone-700 leading-relaxed whitespace-pre-wrap">{description}</p>
                    )}
                </div>
            )}
        </div>
    );
}
