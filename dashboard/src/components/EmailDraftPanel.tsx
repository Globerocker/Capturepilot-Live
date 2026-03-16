"use client";

import { useState } from "react";
import { Mail, Loader2, Copy, ExternalLink, Check, ChevronRight } from "lucide-react";
import clsx from "clsx";

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
    const [drafts, setDrafts] = useState<Draft[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [activeTab, setActiveTab] = useState(0);
    const [copied, setCopied] = useState(false);

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

    if (drafts.length === 0) {
        return (
            <div className="bg-gradient-to-br from-purple-50 to-white rounded-2xl sm:rounded-3xl border border-purple-200 p-4 sm:p-6">
                <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
                        <Mail className="w-4 h-4 text-purple-600" />
                    </div>
                    <div className="flex-1">
                        <p className="font-typewriter font-bold text-sm text-stone-900 mb-1">
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
                            className="inline-flex items-center bg-black text-white font-typewriter font-bold px-4 py-2 rounded-full text-xs hover:bg-stone-800 transition-all disabled:opacity-50"
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
                <h3 className="font-typewriter text-[15px] font-bold flex items-center text-stone-800">
                    <Mail className="w-4 h-4 mr-2 text-purple-500" /> Email Drafts
                </h3>
                <button type="button" onClick={generate} disabled={loading} className="text-[10px] font-typewriter text-purple-600 hover:text-purple-800 font-bold">
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
                            "flex-1 text-[10px] font-typewriter font-bold uppercase tracking-widest px-2 py-2.5 transition-all border-b-2",
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
                    <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-1">Subject</p>
                    <p className="text-sm font-bold text-stone-900">{current.subject}</p>
                </div>
                <div>
                    <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-1">Body</p>
                    <div className="text-sm text-stone-700 leading-relaxed whitespace-pre-wrap bg-stone-50 rounded-xl p-3 border border-stone-100 max-h-48 overflow-y-auto">
                        {current.body}
                    </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-1">
                    <button type="button" onClick={copyToClipboard} className="flex-1 inline-flex items-center justify-center text-xs font-bold font-typewriter bg-stone-100 border border-stone-200 py-2 rounded-full hover:bg-stone-200 transition-all">
                        {copied ? <Check className="w-3 h-3 mr-1.5 text-emerald-600" /> : <Copy className="w-3 h-3 mr-1.5" />}
                        {copied ? "Copied!" : "Copy"}
                    </button>
                    <button type="button" onClick={openInEmail} className="flex-1 inline-flex items-center justify-center text-xs font-bold font-typewriter bg-black text-white py-2 rounded-full hover:bg-stone-800 transition-all">
                        <ExternalLink className="w-3 h-3 mr-1.5" />
                        Open in Email
                    </button>
                </div>
            </div>
        </div>
    );
}
