"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseClient } from "@/lib/supabase/client";
import { PenTool, Loader2, Printer, Copy, ExternalLink, Check, Sparkles, Edit3 } from "lucide-react";
import clsx from "clsx";
import dynamic from "next/dynamic";

const RichTextEditor = dynamic(() => import("@/components/RichTextEditor"), { ssr: false });

const supabase = createSupabaseClient();

const LETTER_TYPES = [
    { value: "capability_cover", label: "Capability Statement Cover Letter", description: "Accompanies your capability statement to a contracting officer" },
    { value: "intro_co", label: "Introduction to Contracting Officer", description: "First-touch outreach to build a relationship before a solicitation" },
    { value: "teaming_inquiry", label: "Teaming Inquiry", description: "Explore a teaming or subcontracting arrangement" },
    { value: "intent_to_bid", label: "Intent to Bid", description: "Formal notice of intent to submit a proposal" },
    { value: "past_perf_request", label: "Past Performance Reference Request", description: "Ask a previous client to be a reference" },
    { value: "follow_up", label: "Thank You / Follow-Up", description: "Post-meeting or post-submission follow-up" },
];

export default function LettersPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [error, setError] = useState("");
    const [copied, setCopied] = useState(false);
    const letterRef = useRef<HTMLDivElement>(null);

    // Form state
    const [letterType, setLetterType] = useState("capability_cover");
    const [recipientName, setRecipientName] = useState("");
    const [recipientTitle, setRecipientTitle] = useState("");
    const [recipientOrg, setRecipientOrg] = useState("");
    const [opportunityTitle, setOpportunityTitle] = useState("");
    const [additionalContext, setAdditionalContext] = useState("");

    // Generated letter
    const [letterBody, setLetterBody] = useState("");
    const [editMode, setEditMode] = useState(false);
    const [editedHtml, setEditedHtml] = useState("");

    useEffect(() => {
        async function checkAuth() {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) { router.push("/login"); return; }

            const { data: profile } = await supabase
                .from("user_profiles")
                .select("id")
                .eq("auth_user_id", user.id)
                .single();

            if (!profile) { router.push("/onboard"); return; }
            setLoading(false);
        }
        checkAuth();
    }, [router]);

    const generate = async () => {
        if (!recipientName.trim() || !recipientOrg.trim()) {
            setError("Recipient name and organization are required.");
            return;
        }

        setGenerating(true);
        setError("");
        setLetterBody("");

        try {
            const res = await fetch("/api/letters/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    letterType,
                    recipientName: recipientName.trim(),
                    recipientTitle: recipientTitle.trim(),
                    recipientOrg: recipientOrg.trim(),
                    opportunityTitle: opportunityTitle.trim() || undefined,
                    additionalContext: additionalContext.trim() || undefined,
                }),
            });

            const data = await res.json();
            if (!res.ok) {
                setError(data.error || "Failed to generate letter");
                return;
            }

            setLetterBody(data.letter.body);
            // Convert plain text to HTML paragraphs for the editor
            const htmlContent = data.letter.body
                .split("\n\n")
                .map((p: string) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
                .join("");
            setEditedHtml(htmlContent);
            setEditMode(false);
        } catch {
            setError("Network error. Please try again.");
        } finally {
            setGenerating(false);
        }
    };

    // Get the content to use for actions (edited HTML or original text)
    const getPlainText = () => {
        if (editedHtml && editMode) {
            // Strip HTML to get plain text
            const tmp = document.createElement("div");
            tmp.innerHTML = editedHtml;
            return tmp.textContent || tmp.innerText || letterBody;
        }
        return letterBody;
    };

    const handlePrint = () => {
        const printWindow = window.open("", "_blank");
        if (!printWindow) return;

        const content = editedHtml || letterBody;
        const isHtml = editedHtml && content.includes("<");

        printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
<title>Letter</title>
<style>
    body {
        font-family: Georgia, "Times New Roman", serif;
        font-size: 12pt;
        line-height: 1.6;
        color: #000;
        max-width: 7in;
        margin: 1in auto;
        padding: 0;
    }
    p { margin-bottom: 12px; }
    h2 { font-size: 16pt; margin: 16px 0 8px; }
    h3 { font-size: 14pt; margin: 12px 0 6px; }
    ul, ol { padding-left: 24px; margin: 8px 0; }
    @media print {
        body { margin: 0; max-width: none; }
    }
</style>
</head>
<body>
${isHtml ? content : `<pre style="white-space: pre-wrap; font-family: Georgia, 'Times New Roman', serif; font-size: 12pt; line-height: 1.6;">${letterBody.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>`}
</body>
</html>`);
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();
    };

    const handleCopy = async () => {
        await navigator.clipboard.writeText(getPlainText());
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleEmail = () => {
        const text = getPlainText();
        const firstLine = text.split("\n").find(l => l.trim()) || "Letter";
        const mailto = `mailto:?subject=${encodeURIComponent(`Letter - ${firstLine.substring(0, 60)}`)}&body=${encodeURIComponent(text)}`;
        window.open(mailto);
    };

    const selectedType = LETTER_TYPES.find(t => t.value === letterType);

    if (loading) {
        return (
            <div className="flex justify-center items-center min-h-[400px]">
                <Loader2 className="w-10 h-10 animate-spin text-stone-400" />
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto pb-12 animate-in fade-in duration-500 px-1">
            <header className="mb-6">
                <h2 className="text-2xl sm:text-3xl font-bold font-typewriter tracking-tighter text-black flex items-center">
                    <PenTool className="mr-2 sm:mr-3 w-6 h-6 sm:w-8 sm:h-8" /> Letter Writer
                </h2>
                <p className="text-stone-500 mt-1 font-medium text-sm">
                    AI-powered professional letters for government contracting
                </p>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left: Form */}
                <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-5 sm:p-6">
                    <h3 className="font-typewriter font-bold text-sm uppercase tracking-widest text-stone-500 mb-4">
                        Compose
                    </h3>

                    <div className="space-y-4">
                        {/* Letter Type */}
                        <div>
                            <label className="text-xs font-typewriter text-stone-500 uppercase tracking-widest block mb-2">
                                Letter Type
                            </label>
                            <select
                                title="Letter Type"
                                value={letterType}
                                onChange={(e) => setLetterType(e.target.value)}
                                className="w-full px-4 py-3 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm bg-white"
                            >
                                {LETTER_TYPES.map(t => (
                                    <option key={t.value} value={t.value}>{t.label}</option>
                                ))}
                            </select>
                            {selectedType && (
                                <p className="text-[10px] text-stone-400 mt-1.5">{selectedType.description}</p>
                            )}
                        </div>

                        {/* Recipient Name */}
                        <div>
                            <label className="text-xs font-typewriter text-stone-500 uppercase tracking-widest block mb-2">
                                Recipient Name *
                            </label>
                            <input
                                type="text"
                                value={recipientName}
                                onChange={(e) => setRecipientName(e.target.value)}
                                className="w-full px-4 py-3 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm"
                                placeholder="e.g. John Smith"
                            />
                        </div>

                        {/* Recipient Title */}
                        <div>
                            <label className="text-xs font-typewriter text-stone-500 uppercase tracking-widest block mb-2">
                                Recipient Title
                            </label>
                            <input
                                type="text"
                                value={recipientTitle}
                                onChange={(e) => setRecipientTitle(e.target.value)}
                                className="w-full px-4 py-3 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm"
                                placeholder="e.g. Contracting Officer"
                            />
                        </div>

                        {/* Recipient Organization */}
                        <div>
                            <label className="text-xs font-typewriter text-stone-500 uppercase tracking-widest block mb-2">
                                Recipient Organization *
                            </label>
                            <input
                                type="text"
                                value={recipientOrg}
                                onChange={(e) => setRecipientOrg(e.target.value)}
                                className="w-full px-4 py-3 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm"
                                placeholder="e.g. U.S. Army Corps of Engineers"
                            />
                        </div>

                        {/* Opportunity Reference */}
                        <div>
                            <label className="text-xs font-typewriter text-stone-500 uppercase tracking-widest block mb-2">
                                Opportunity Reference <span className="text-stone-300">(optional)</span>
                            </label>
                            <input
                                type="text"
                                value={opportunityTitle}
                                onChange={(e) => setOpportunityTitle(e.target.value)}
                                className="w-full px-4 py-3 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm"
                                placeholder="e.g. Janitorial Services - Fort Bragg"
                            />
                        </div>

                        {/* Additional Context */}
                        <div>
                            <label className="text-xs font-typewriter text-stone-500 uppercase tracking-widest block mb-2">
                                Additional Context <span className="text-stone-300">(optional)</span>
                            </label>
                            <textarea
                                value={additionalContext}
                                onChange={(e) => setAdditionalContext(e.target.value)}
                                className="w-full px-4 py-3 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm resize-none h-20"
                                placeholder="Any specific points you want the letter to mention..."
                            />
                        </div>

                        {error && (
                            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl p-3">{error}</p>
                        )}

                        {/* Generate Button */}
                        <button
                            type="button"
                            onClick={generate}
                            disabled={generating || !recipientName.trim() || !recipientOrg.trim()}
                            className="w-full inline-flex items-center justify-center bg-black text-white font-typewriter font-bold px-6 py-3 rounded-full text-sm hover:bg-stone-800 transition-all disabled:opacity-50"
                        >
                            {generating ? (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                                <Sparkles className="w-4 h-4 mr-2" />
                            )}
                            {generating ? "Generating..." : "Generate Letter"}
                        </button>
                    </div>
                </div>

                {/* Right: Preview */}
                <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden flex flex-col">
                    <div className="bg-stone-50 border-b border-stone-100 px-5 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
                        <h3 className="font-typewriter font-bold text-sm uppercase tracking-widest text-stone-500">
                            {editMode ? "Edit" : "Preview"}
                        </h3>
                        {letterBody && (
                            <div className="flex items-center gap-3">
                                <button
                                    type="button"
                                    onClick={() => setEditMode(!editMode)}
                                    className={clsx(
                                        "text-[10px] font-typewriter font-bold flex items-center gap-1",
                                        editMode ? "text-emerald-600 hover:text-emerald-700" : "text-stone-500 hover:text-black"
                                    )}
                                >
                                    <Edit3 className="w-3 h-3" />
                                    {editMode ? "Done Editing" : "Edit"}
                                </button>
                                <button
                                    type="button"
                                    onClick={generate}
                                    disabled={generating}
                                    className="text-[10px] font-typewriter text-stone-500 hover:text-black font-bold"
                                >
                                    {generating ? "Regenerating..." : "Regenerate"}
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="flex-1 p-5 sm:p-6" ref={letterRef}>
                        {!letterBody && !generating && (
                            <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-center">
                                <PenTool className="w-12 h-12 text-stone-200 mb-4" />
                                <p className="text-stone-400 text-sm font-medium">
                                    Fill in the form and click Generate to create your letter.
                                </p>
                            </div>
                        )}

                        {generating && !letterBody && (
                            <div className="flex flex-col items-center justify-center h-full min-h-[300px]">
                                <Loader2 className="w-8 h-8 animate-spin text-stone-300 mb-3" />
                                <p className="text-stone-400 text-sm font-typewriter">Writing your letter...</p>
                            </div>
                        )}

                        {letterBody && editMode && (
                            <RichTextEditor
                                content={editedHtml}
                                onChange={(html) => setEditedHtml(html)}
                            />
                        )}

                        {letterBody && !editMode && (
                            <div
                                className="text-sm text-stone-800 leading-relaxed whitespace-pre-wrap bg-stone-50 rounded-xl p-4 sm:p-5 border border-stone-100 max-h-[500px] overflow-y-auto"
                                style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
                            >
                                {letterBody}
                            </div>
                        )}
                    </div>

                    {/* Action Bar */}
                    {letterBody && (
                        <div className="border-t border-stone-100 px-5 sm:px-6 py-3 flex gap-2">
                            <button
                                type="button"
                                onClick={handlePrint}
                                className="flex-1 inline-flex items-center justify-center text-xs font-bold font-typewriter bg-black text-white py-2.5 rounded-full hover:bg-stone-800 transition-all"
                            >
                                <Printer className="w-3 h-3 mr-1.5" />
                                Print
                            </button>
                            <button
                                type="button"
                                onClick={handleCopy}
                                className="flex-1 inline-flex items-center justify-center text-xs font-bold font-typewriter bg-stone-100 border border-stone-200 py-2.5 rounded-full hover:bg-stone-200 transition-all"
                            >
                                {copied ? <Check className="w-3 h-3 mr-1.5 text-emerald-600" /> : <Copy className="w-3 h-3 mr-1.5" />}
                                {copied ? "Copied!" : "Copy"}
                            </button>
                            <button
                                type="button"
                                onClick={handleEmail}
                                className="flex-1 inline-flex items-center justify-center text-xs font-bold font-typewriter bg-stone-100 border border-stone-200 py-2.5 rounded-full hover:bg-stone-200 transition-all"
                            >
                                <ExternalLink className="w-3 h-3 mr-1.5" />
                                Email
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
