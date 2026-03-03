"use client";

import { RefreshCw, Zap, Play, Sparkles } from "lucide-react";
import { useState } from "react";

export default function DashboardActions() {
    const [loading, setLoading] = useState<string | null>(null);

    const handleAction = async (endpoint: string, name: string) => {
        setLoading(name);
        try {
            // Intentionally not awaiting the full response if it's a long-running background job
            fetch(endpoint, { method: "POST" }).catch(() => { });
            alert(`${name} background job triggered successfully. Data will populate shortly.`);
        } catch (err) {
            alert(`Error triggering ${name}.`);
        } finally {
            setTimeout(() => setLoading(null), 1000);
        }
    };

    return (
        <div className="flex space-x-3">
            <button
                onClick={() => handleAction("/api/cron/ingest_sam", "Backfill 90D")}
                disabled={loading === "Backfill 90D"}
                className="flex items-center space-x-2 bg-white text-stone-700 px-4 py-2.5 rounded-full border border-stone-200 hover:border-black hover:text-black hover:shadow-md transition-all text-sm font-medium disabled:opacity-50"
            >
                <RefreshCw className={`w-4 h-4 ${loading === "Backfill 90D" ? "animate-spin" : ""}`} />
                <span className="font-typewriter">Backfill 90D</span>
            </button>

            <button
                onClick={() => handleAction("/api/engine/score", "Score Matches")}
                disabled={loading === "Score Matches"}
                className="flex items-center space-x-2 bg-stone-100 text-black px-4 py-2.5 rounded-full border border-stone-300 hover:bg-stone-200 transition-all text-sm font-bold disabled:opacity-50"
            >
                <Zap className="w-4 h-4" />
                <span className="font-typewriter">Score Matches</span>
            </button>

            <button
                onClick={() => handleAction("/api/cron/generate_drafts", "Run Gen AI Engine")}
                disabled={loading === "Run Gen AI Engine"}
                className="flex items-center space-x-2 bg-black text-white px-5 py-2.5 rounded-full shadow-lg shadow-stone-300 hover:bg-stone-800 transition-all text-sm font-bold disabled:opacity-50"
            >
                <Play className="w-4 h-4" />
                <span className="font-typewriter">Run Gen AI Engine</span>
            </button>

            <button
                onClick={() => handleAction("/api/engine/orchestrate", "Run Enrichment")}
                disabled={loading === "Run Enrichment"}
                className="flex items-center space-x-2 bg-emerald-600 text-white px-5 py-2.5 rounded-full shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition-all text-sm font-bold disabled:opacity-50"
            >
                <Sparkles className={`w-4 h-4 ${loading === "Run Enrichment" ? "animate-spin" : ""}`} />
                <span className="font-typewriter">Run Enrichment</span>
            </button>
        </div>
    );
}
