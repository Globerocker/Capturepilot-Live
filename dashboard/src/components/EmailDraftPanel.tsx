"use client";

import { useState } from "react";
import { Mail, Loader2, Copy, ExternalLink, Check, Edit3, Send, Eye } from "lucide-react";
import clsx from "clsx";
import dynamic from "next/dynamic";

const RichTextEditor = dynamic(() => import("@/components/RichTextEditor"), { ssr: false });

interface Draft {
    strategy: string;
    subject: string;
    body: string;
}

const STRATEGY_LABELS: Record<string, string> = {
    standard_alert: "Standard Alert",
    certification_leverage: "Cert Leverage",
    early_engagement: "Early Engagement",
};

export default function EmailDraftPanel({ opportunityId, opportunityTitle }: { opportunityId: string; opportunityTitle: string }) {
    void opportunityTitle;
    const [drafts, setDrafts] = useState<Draft[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [activeTab, setActiveTab] = useState(0);
    const [copied, setCopied] = useState(false);
    const [editMode, setEditMode] = useState(false);
    const [editedBody, setEditedBody] = useState("");

    // Gmail-send state
    const [sendOpen, setSendOpen] = useState(false);
    const [recipient, setRecipient] = useState("");
    const [sending, setSending] = useState(false);
    const [sendResult, setSendResult] = useState<{ ok: boolean; msg: string } | null>(null);

    const generate = async () => {
        setLoading(true);
        setError("");
        try {
            const res = await fetch("/api/drafts/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ opportunityId }),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error || "Failed to generate");
                return;
            }
            setDrafts(data.drafts);
            setActiveTab(0);
        } catch {
            setError("Network error");
        } finally {
            setLoading(false);
        }
    };

    const copyToClipboard = async () => {
        if (!drafts[activeTab]) return;
        const d = drafts[activeTab];
        await navigator.clipboard.writeText(`Subject: ${d.subject}\n\n${d.body}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const openInEmail = () => {
        if (!drafts[activeTab]) return;
        const d = drafts[activeTab];
        const mailto = `mailto:?subject=${encodeURIComponent(d.subject)}&body=${encodeURIComponent(d.body)}`;
        window.open(mailto);
    };

    // Strip HTML to plain text for the Gmail send (the body shown in the
    // editor is HTML when in edit mode; Gmail accepts plain).
    const htmlToPlain = (html: string): string => {
        const div = document.createElement("div");
        div.innerHTML = html;
        return (div.textContent || div.innerText || "").trim();
    };

    const sendViaGmail = async () => {
        if (!drafts[activeTab] || !recipient.trim()) return;
        const d = drafts[activeTab];
        const finalBody = editMode ? htmlToPlain(editedBody) : d.body;
        setSending(true);
        setSendResult(null);
        try {
            const res = await fetch("/api/email/send-gmail", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    to: recipient.trim(),
                    subject: d.subject,
                    body: finalBody,
                    opportunityId,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                setSendResult({ ok: false, msg: data.error || `HTTP ${res.status}` });
            } else {
                setSendResult({ ok: true, msg: `Sent — message id ${(data.message_id || "").slice(0, 12)}…` });
                setSendOpen(false);
                setRecipient("");
            }
        } catch (e) {
            setSendResult({ ok: false, msg: (e as Error).message });
        } finally {
            setSending(false);
        }
    };

    if (drafts.length === 0) {
        return (
            <div className="bg-gradient-to-br from-purple-50 to-white rounded-2xl sm:rounded-3xl border border-purple-200 p-4 sm:p-6">
                <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
                        <Mail className="w-4 h-4 text-purple-600" />
                    </div>
                    <div className="flex-1">
                        <p className="font-bold text-sm text-stone-900 mb-1">
                            AI Email Drafts
                        </p>
                        <p className="text-xs text-purple-700 leading-relaxed mb-3">
                            Generate 3 professional outreach emails tailored to this opportunity and your company profile.
                        </p>
                        {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
                        <button
                            type="button"
                            onClick={generate}
                            disabled={loading}
                            className="inline-flex items-center bg-black text-white font-bold px-4 py-2 rounded-full text-xs hover:bg-stone-800 transition-all disabled:opacity-50"
                        >
                            {loading ? <Loader2 className="w-3 h-3 mr-2 animate-spin" /> : <Mail className="w-3 h-3 mr-2" />}
                            {loading ? "Generating..." : "Generate Drafts"}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    const current = drafts[activeTab];

    return (
        <div className="bg-white rounded-2xl sm:rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
            <div className="bg-purple-50 border-b border-purple-100 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
                <h3 className="text-[15px] font-bold flex items-center text-stone-800">
                    <Mail className="w-4 h-4 mr-2 text-purple-500" /> Email Drafts
                </h3>
                <button type="button" onClick={generate} disabled={loading} className="text-[10px] text-purple-600 hover:text-purple-800 font-bold">
                    {loading ? "Regenerating..." : "Regenerate"}
                </button>
            </div>

            {/* Strategy Tabs */}
            <div className="flex border-b border-stone-100">
                {drafts.map((d, i) => (
                    <button
                        type="button"
                        key={d.strategy}
                        onClick={() => setActiveTab(i)}
                        className={clsx(
                            "flex-1 text-[10px] font-bold uppercase tracking-widest px-2 py-2.5 transition-all border-b-2",
                            activeTab === i
                                ? "text-black border-black bg-stone-50"
                                : "text-stone-400 border-transparent hover:text-stone-600"
                        )}
                    >
                        {STRATEGY_LABELS[d.strategy] || d.strategy}
                    </button>
                ))}
            </div>

            {/* Draft Content */}
            <div className="p-4 sm:p-6 space-y-3">
                <div>
                    <p className="text-[10px] text-stone-400 uppercase tracking-widest mb-1">Subject</p>
                    <p className="text-sm font-bold text-stone-900">{current.subject}</p>
                </div>
                <div>
                    <div className="flex items-center justify-between mb-1">
                        <p className="text-[10px] text-stone-400 uppercase tracking-widest">Body</p>
                        <button
                            type="button"
                            onClick={() => {
                                if (!editMode) {
                                    const htmlContent = current.body
                                        .split("\n\n")
                                        .map(p => `<p>${p.replace(/\n/g, "<br>")}</p>`)
                                        .join("");
                                    setEditedBody(htmlContent);
                                }
                                setEditMode(!editMode);
                            }}
                            className={clsx(
                                "text-[10px] font-bold flex items-center gap-1",
                                editMode ? "text-emerald-600" : "text-stone-500 hover:text-black"
                            )}
                        >
                            <Edit3 className="w-3 h-3" />
                            {editMode ? "Done" : "Edit"}
                        </button>
                    </div>
                    {editMode ? (
                        <RichTextEditor
                            content={editedBody}
                            onChange={(html) => setEditedBody(html)}
                        />
                    ) : (
                        <div className="text-sm text-stone-700 leading-relaxed whitespace-pre-wrap bg-stone-50 rounded-xl p-3 border border-stone-100 max-h-48 overflow-y-auto">
                            {current.body}
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-1 flex-wrap">
                    <button type="button" onClick={copyToClipboard} className="flex-1 min-w-[100px] inline-flex items-center justify-center text-xs font-bold bg-stone-100 border border-stone-200 py-2 rounded-full hover:bg-stone-200 transition-all">
                        {copied ? <Check className="w-3 h-3 mr-1.5 text-emerald-600" /> : <Copy className="w-3 h-3 mr-1.5" />}
                        {copied ? "Copied!" : "Copy"}
                    </button>
                    <button type="button" onClick={openInEmail} className="flex-1 min-w-[100px] inline-flex items-center justify-center text-xs font-bold bg-stone-100 border border-stone-200 py-2 rounded-full hover:bg-stone-200 transition-all">
                        <ExternalLink className="w-3 h-3 mr-1.5" />
                        Mail App
                    </button>
                    <button
                        type="button"
                        onClick={() => setSendOpen(o => !o)}
                        className="flex-1 min-w-[100px] inline-flex items-center justify-center text-xs font-bold bg-black text-white py-2 rounded-full hover:bg-stone-800 transition-all"
                    >
                        <Send className="w-3 h-3 mr-1.5" />
                        Send via Gmail
                    </button>
                </div>

                {/* Inline send form — appears when "Send via Gmail" is clicked */}
                {sendOpen && (
                    <div className="mt-3 border border-purple-200 rounded-xl p-3 bg-purple-50/40 space-y-2 animate-in slide-in-from-top-1 duration-200">
                        <p className="text-[10px] uppercase tracking-widest text-purple-700 font-bold flex items-center gap-1.5">
                            <Send className="w-3 h-3" /> Send from your Gmail
                        </p>
                        <input
                            type="email"
                            placeholder="recipient@agency.gov"
                            value={recipient}
                            onChange={e => setRecipient(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-stone-200 text-sm focus:ring-2 focus:ring-purple-300 focus:border-purple-400 outline-none"
                        />
                        {/* Live preview block — exactly what Gmail will see */}
                        <details className="group">
                            <summary className="text-[10px] text-purple-700 font-bold flex items-center gap-1 cursor-pointer hover:text-purple-900">
                                <Eye className="w-3 h-3" /> Preview message
                            </summary>
                            <div className="mt-2 p-3 bg-white rounded-lg border border-stone-100 text-xs">
                                <p className="text-stone-500 mb-1"><span className="text-stone-400">To:</span> {recipient.trim() || <em className="text-stone-300">recipient@agency.gov</em>}</p>
                                <p className="text-stone-500 mb-1"><span className="text-stone-400">Subject:</span> {current.subject}</p>
                                <hr className="my-2 border-stone-100" />
                                <pre className="whitespace-pre-wrap font-sans text-stone-700 leading-relaxed">{editMode ? htmlToPlain(editedBody) : current.body}</pre>
                            </div>
                        </details>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={sendViaGmail}
                                disabled={sending || !recipient.trim()}
                                className="inline-flex items-center bg-purple-600 text-white text-xs font-bold px-4 py-2 rounded-full hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {sending ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <Send className="w-3 h-3 mr-1.5" />}
                                {sending ? "Sending…" : "Send"}
                            </button>
                            <button type="button" onClick={() => { setSendOpen(false); setSendResult(null); }} className="text-xs text-stone-500 hover:text-stone-800 ml-auto">
                                Cancel
                            </button>
                        </div>
                        {sendResult && (
                            <p className={clsx(
                                "text-[11px] font-medium",
                                sendResult.ok ? "text-emerald-700" : "text-rose-700",
                            )}>
                                {sendResult.msg}
                            </p>
                        )}
                    </div>
                )}
                {!sendOpen && sendResult && (
                    <p className={clsx(
                        "mt-2 text-[11px] font-medium",
                        sendResult.ok ? "text-emerald-700" : "text-rose-700",
                    )}>
                        {sendResult.msg}
                    </p>
                )}
            </div>
        </div>
    );
}
