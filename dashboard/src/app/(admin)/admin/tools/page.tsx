"use client";

import { useState } from "react";
import { Wrench, Search, RefreshCw, Mail, Loader2, CheckCircle2, Zap, Download } from "lucide-react";
import clsx from "clsx";

export default function AdminTools() {
    const [naicsCodes, setNaicsCodes] = useState("");
    const [crawlDays, setCrawlDays] = useState("90");
    const [crawling, setCrawling] = useState(false);
    const [crawlResult, setCrawlResult] = useState<string>("");

    const [enrichProfileId, setEnrichProfileId] = useState("");
    const [enriching, setEnriching] = useState(false);
    const [enrichResult, setEnrichResult] = useState<string>("");

    const [emailProfileId, setEmailProfileId] = useState("");
    const [emailType, setEmailType] = useState("opportunities");
    const [sending, setSending] = useState(false);
    const [emailResult, setEmailResult] = useState<string>("");

    const handleCrawl = async () => {
        const codes = naicsCodes.split(",").map(s => s.trim()).filter(Boolean);
        if (codes.length === 0) return;
        setCrawling(true);
        setCrawlResult("");
        const res = await fetch("/api/admin/crawl-opportunities", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ naics_codes: codes, days_back: parseInt(crawlDays) }),
        });
        const data = await res.json();
        setCrawlResult(data.success ? `Crawled ${data.total_inserted} opportunities` : `Error: ${data.error}`);
        setCrawling(false);
    };

    const handleEnrich = async () => {
        if (!enrichProfileId) return;
        setEnriching(true);
        setEnrichResult("");
        const res = await fetch("/api/admin/enrich-profile", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_profile_id: enrichProfileId }),
        });
        const data = await res.json();
        setEnrichResult(data.success ? `Enriched: ${(data.sources || []).join(", ")}. Updated ${(data.fields_updated || []).length} fields.` : `Error: ${data.error}`);
        setEnriching(false);
    };

    const handleEmail = async () => {
        if (!emailProfileId) return;
        setSending(true);
        setEmailResult("");
        const res = await fetch("/api/admin/send-update", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_profile_id: emailProfileId, type: emailType }),
        });
        const data = await res.json();
        setEmailResult(data.success ? `Sent to ${data.sent_to}` : `Error: ${data.error}`);
        setSending(false);
    };

    return (
        <div className="w-full space-y-6">
            <h1 className="text-xl font-bold font-typewriter flex items-center gap-2">
                <Wrench className="w-5 h-5" /> Admin Tools
            </h1>

            {/* NAICS Crawler */}
            <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                <div className="bg-stone-50 border-b border-stone-100 px-5 py-3 flex items-center gap-2">
                    <Search className="w-4 h-4 text-stone-400" />
                    <h2 className="font-bold text-sm">NAICS Opportunity Crawler</h2>
                </div>
                <div className="p-5 space-y-3">
                    <p className="text-xs text-stone-500">Crawl SAM.gov for opportunities by NAICS codes. Results are stored in the database.</p>
                    <div className="flex gap-2">
                        <input value={naicsCodes} onChange={e => setNaicsCodes(e.target.value)}
                            placeholder="NAICS codes (comma separated, e.g. 237120, 541330)"
                            className="flex-1 border border-stone-300 rounded-lg px-3 py-2 text-sm" />
                        <select value={crawlDays} onChange={e => setCrawlDays(e.target.value)}
                            className="border border-stone-300 rounded-lg px-3 py-2 text-sm">
                            <option value="30">30 days</option>
                            <option value="90">90 days</option>
                            <option value="180">180 days</option>
                        </select>
                        <button type="button" onClick={handleCrawl} disabled={crawling || !naicsCodes.trim()}
                            className="bg-black text-white px-4 py-2 rounded-lg text-sm font-bold inline-flex items-center gap-1.5 disabled:opacity-50">
                            {crawling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                            {crawling ? "Crawling..." : "Crawl"}
                        </button>
                    </div>
                    {crawlResult && <p className={clsx("text-xs font-medium", crawlResult.startsWith("Error") ? "text-red-600" : "text-emerald-600")}>{crawlResult}</p>}
                </div>
            </div>

            {/* Profile Enrichment */}
            <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                <div className="bg-stone-50 border-b border-stone-100 px-5 py-3 flex items-center gap-2">
                    <Zap className="w-4 h-4 text-stone-400" />
                    <h2 className="font-bold text-sm">Profile Enrichment</h2>
                </div>
                <div className="p-5 space-y-3">
                    <p className="text-xs text-stone-500">Run full enrichment pipeline (website crawl + SAM + USASpending + Apollo) for a client profile.</p>
                    <div className="flex gap-2">
                        <input value={enrichProfileId} onChange={e => setEnrichProfileId(e.target.value)}
                            placeholder="User Profile ID (UUID)"
                            className="flex-1 border border-stone-300 rounded-lg px-3 py-2 text-sm font-mono" />
                        <button type="button" onClick={handleEnrich} disabled={enriching || !enrichProfileId}
                            className="bg-black text-white px-4 py-2 rounded-lg text-sm font-bold inline-flex items-center gap-1.5 disabled:opacity-50">
                            {enriching ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                            {enriching ? "Enriching..." : "Enrich"}
                        </button>
                    </div>
                    {enrichResult && <p className={clsx("text-xs font-medium", enrichResult.startsWith("Error") ? "text-red-600" : "text-emerald-600")}>{enrichResult}</p>}
                </div>
            </div>

            {/* Send Email */}
            <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                <div className="bg-stone-50 border-b border-stone-100 px-5 py-3 flex items-center gap-2">
                    <Mail className="w-4 h-4 text-stone-400" />
                    <h2 className="font-bold text-sm">Send Email Update</h2>
                </div>
                <div className="p-5 space-y-3">
                    <p className="text-xs text-stone-500">Send opportunity alert or custom email to a client.</p>
                    <div className="flex gap-2">
                        <input value={emailProfileId} onChange={e => setEmailProfileId(e.target.value)}
                            placeholder="User Profile ID (UUID)"
                            className="flex-1 border border-stone-300 rounded-lg px-3 py-2 text-sm font-mono" />
                        <select value={emailType} onChange={e => setEmailType(e.target.value)}
                            className="border border-stone-300 rounded-lg px-3 py-2 text-sm">
                            <option value="opportunities">Opportunity Alert</option>
                            <option value="custom">Custom Email</option>
                        </select>
                        <button type="button" onClick={handleEmail} disabled={sending || !emailProfileId}
                            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold inline-flex items-center gap-1.5 disabled:opacity-50">
                            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                            {sending ? "Sending..." : "Send"}
                        </button>
                    </div>
                    {emailResult && <p className={clsx("text-xs font-medium", emailResult.startsWith("Error") ? "text-red-600" : "text-emerald-600")}>{emailResult}</p>}
                </div>
            </div>

            {/* Cron Status */}
            <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                <div className="bg-stone-50 border-b border-stone-100 px-5 py-3">
                    <h2 className="font-bold text-sm">Automated Crons (9 jobs)</h2>
                </div>
                <div className="p-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        {[
                            { time: "2:00 AM", name: "ingest_sam", desc: "Fetch new opportunities" },
                            { time: "3:00 AM", name: "score_matches", desc: "Score all users" },
                            { time: "4:00 AM Sun", name: "db_cleanup", desc: "Lifecycle management" },
                            { time: "5:00 AM", name: "enrich", desc: "Contractor enrichment" },
                            { time: "6:00 AM", name: "backfill_requirements", desc: "Extract from raw_json" },
                            { time: "7:00 AM Sun", name: "competitor_monitor", desc: "Crawl competitor websites" },
                            { time: "8:00 AM", name: "deep_enrich", desc: "Descriptions + PDFs + requirements" },
                            { time: "10:00 AM", name: "notify_matches", desc: "Email opportunity alerts" },
                            { time: "1st monthly", name: "monthly_awards", desc: "Award + forecast notices" },
                        ].map(c => (
                            <div key={c.name} className="flex items-center gap-2 bg-stone-50 rounded-lg px-3 py-2">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                                <div>
                                    <p className="font-medium text-stone-700">{c.name}</p>
                                    <p className="text-stone-400">{c.time} — {c.desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
