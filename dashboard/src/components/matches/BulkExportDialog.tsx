"use client";

import { useState } from "react";
import { Download, Loader2, X, FileSpreadsheet } from "lucide-react";

export function BulkExportDialog({
    open,
    matchIds,
    onClose,
}: {
    open: boolean;
    matchIds: string[];
    onClose: () => void;
}) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!open) return null;

    const handleDownload = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/matches/export", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ match_ids: matchIds }),
            });
            if (!res.ok) {
                const j = await res.json().catch(() => ({ error: res.statusText }));
                throw new Error(j.error || "Export failed");
            }
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            const stamp = new Date().toISOString().slice(0, 10);
            a.download = `capturepilot-opportunities-${stamp}.xlsx`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            onClose();
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
            <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 animate-in zoom-in-95 duration-200">
                <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center">
                            <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                        </div>
                        <div>
                            <h3 className="font-bold text-black text-lg">Export to Excel</h3>
                            <p className="text-xs text-stone-500">{matchIds.length} opportunit{matchIds.length === 1 ? "y" : "ies"} selected</p>
                        </div>
                    </div>
                    <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-stone-400 hover:bg-stone-100 hover:text-black">
                        <X className="w-4 h-4" />
                    </button>
                </div>
                <div className="bg-stone-50 border border-stone-200 rounded-xl p-3 mb-4">
                    <p className="text-xs font-bold text-stone-700 mb-2">Included columns</p>
                    <p className="text-[11px] text-stone-500">
                        Score, Title, Agency, NAICS, Notice Type, Set-Aside, State, Value, Deadline, SAM.gov URL, Match Score, Classification, Status
                    </p>
                </div>
                {error && (
                    <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2 mb-3">{error}</p>
                )}
                <div className="flex items-center gap-2 justify-end">
                    <button type="button" onClick={onClose} className="px-4 py-2 text-xs font-bold text-stone-600 hover:bg-stone-100 rounded-full">
                        Cancel
                    </button>
                    <button type="button" onClick={handleDownload} disabled={loading}
                        className="bg-black text-white px-4 py-2 rounded-full text-xs font-bold inline-flex items-center gap-2 disabled:opacity-60 hover:bg-stone-800">
                        {loading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating…</> : <><Download className="w-3.5 h-3.5" /> Download .xlsx</>}
                    </button>
                </div>
            </div>
        </div>
    );
}
