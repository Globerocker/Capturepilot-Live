"use client";

import { useState } from "react";
import Link from "next/link";
import { Wrench, Search, Loader2, Sparkles, Download, ExternalLink, Activity, Mail, Users } from "lucide-react";
import clsx from "clsx";

/**
 * Admin → Tools. Trimmed from a 50 KB kitchen-sink page (which 404'd in
 * production — likely an Edge prerender size issue) down to the three
 * tools that don't have a dedicated home elsewhere:
 *
 *   - NAICS Opportunity Crawler   (on-demand SAM crawl by NAICS code)
 *   - SBIR/STTR Grant Search       (SBIR.gov API)
 *   - IDIQ / Contract Vehicle Search
 *
 * The redundant features (bulk contractor enrichment, profile enrichment,
 * send-email, cron status, AI analysis) are linked back to their primary
 * homes via the "Other tools" panel.
 */

export default function AdminTools() {
    // NAICS crawler
    const [naicsCodes, setNaicsCodes] = useState("");
    const [crawlDays, setCrawlDays] = useState("90");
    const [crawling, setCrawling] = useState(false);
    const [crawlResult, setCrawlResult] = useState<string>("");

    // SBIR search
    const [sbirKeywords, setSbirKeywords] = useState("");
    const [sbirAgency, setSbirAgency] = useState("");
    const [sbirSearching, setSbirSearching] = useState(false);
    const [sbirResult, setSbirResult] = useState<string>("");

    // IDIQ search
    const [idiqNaics, setIdiqNaics] = useState("");
    const [idiqKeyword, setIdiqKeyword] = useState("");
    const [idiqSearching, setIdiqSearching] = useState(false);
    const [idiqResult, setIdiqResult] = useState<string>("");

    const handleCrawl = async () => {
        const codes = naicsCodes.split(",").map(s => s.trim()).filter(Boolean);
        if (codes.length === 0) return;
        setCrawling(true);
        setCrawlResult("");
        try {
            const res = await fetch("/api/admin/crawl-opportunities", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ naics_codes: codes, days_back: parseInt(crawlDays) }),
            });
            const data = await res.json();
            setCrawlResult(data.success ? `Crawled ${data.total_inserted} opportunities` : `Error: ${data.error}`);
        } catch (err: unknown) {
            setCrawlResult(`Error: ${err instanceof Error ? err.message : "Network request failed"}`);
        }
        setCrawling(false);
    };

    const handleSbir = async () => {
        const kw = sbirKeywords.trim();
        if (!kw) return;
        setSbirResult("");
        setSbirSearching(true);
        try {
            const res = await fetch(`/api/grants/sbir?keywords=${encodeURIComponent(kw)}&agency=${sbirAgency}&open=true`);
            const data = await res.json();
            setSbirResult(data.total ? `Found ${data.total} SBIR/STTR grants. View: ${data.search_url}` : data.error || "No results found");
        } catch (err: unknown) {
            setSbirResult(`Error: ${err instanceof Error ? err.message : "Network request failed"}`);
        }
        setSbirSearching(false);
    };

    const handleIdiq = async () => {
        const naics = idiqNaics.trim();
        const kw = idiqKeyword.trim();
        if (!naics && !kw) return;
        setIdiqResult("");
        setIdiqSearching(true);
        try {
            const res = await fetch(`/api/idiq?naics=${encodeURIComponent(naics)}&keyword=${encodeURIComponent(kw)}`);
            const data = await res.json();
            setIdiqResult(data.success ? `Found ${data.total} IDIQ contracts worth ${data.total_value ? "$" + (data.total_value / 1e6).toFixed(0) + "M" : "N/A"}` : `Error: ${data.error}`);
        } catch (err: unknown) {
            setIdiqResult(`Error: ${err instanceof Error ? err.message : "Network request failed"}`);
        }
        setIdiqSearching(false);
    };

    return (
        <div className="w-full max-w-5xl mx-auto space-y-6">
            <div>
                <h1 className="text-xl font-bold flex items-center gap-2">
                    <Wrench className="w-5 h-5" /> Admin Tools
                </h1>
                <p className="text-sm text-stone-500 mt-0.5">
                    Niche operations that don&apos;t have a dedicated home elsewhere. Day-to-day work lives on the pages linked below.
                </p>
            </div>

            {/* Pointers to where the day-to-day work lives */}
            <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                <div className="bg-stone-50 border-b border-stone-100 px-5 py-3">
                    <h2 className="font-bold text-sm">Other tools — primary homes</h2>
                </div>
                <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                    <Link href="/admin/crons" className="inline-flex items-center gap-2 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg px-3 py-2 transition-colors">
                        <Activity className="w-4 h-4" /> Cron Telemetry &amp; Run-Now
                        <ExternalLink className="w-3 h-3 ml-auto" />
                    </Link>
                    <Link href="/admin/enrich" className="inline-flex items-center gap-2 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg px-3 py-2 transition-colors">
                        <Sparkles className="w-4 h-4" /> Bulk Contractor Enrichment
                        <ExternalLink className="w-3 h-3 ml-auto" />
                    </Link>
                    <Link href="/admin/clients" className="inline-flex items-center gap-2 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg px-3 py-2 transition-colors">
                        <Users className="w-4 h-4" /> Per-profile enrichment (open a client)
                        <ExternalLink className="w-3 h-3 ml-auto" />
                    </Link>
                    <Link href="/admin/emails" className="inline-flex items-center gap-2 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg px-3 py-2 transition-colors">
                        <Mail className="w-4 h-4" /> Email templates &amp; settings
                        <ExternalLink className="w-3 h-3 ml-auto" />
                    </Link>
                </div>
            </div>

            {/* NAICS Crawler */}
            <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                <div className="bg-stone-50 border-b border-stone-100 px-5 py-3 flex items-center gap-2">
                    <Search className="w-4 h-4 text-stone-400" />
                    <h2 className="font-bold text-sm">NAICS Opportunity Crawler</h2>
                </div>
                <div className="p-5 space-y-3">
                    <p className="text-xs text-stone-500">Crawl SAM.gov for opportunities by NAICS code. Used when onboarding a new client whose codes haven&apos;t been part of the daily ingest yet.</p>
                    <div className="flex gap-2">
                        <input value={naicsCodes} onChange={e => setNaicsCodes(e.target.value)}
                            placeholder="NAICS codes (comma separated, e.g. 237120, 541330)"
                            className="flex-1 border border-stone-300 rounded-lg px-3 py-2 text-sm" />
                        <select value={crawlDays} onChange={e => setCrawlDays(e.target.value)} title="Lookback window"
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

            {/* SBIR/STTR Grant Search */}
            <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                <div className="bg-stone-50 border-b border-stone-100 px-5 py-3 flex items-center gap-2">
                    <Search className="w-4 h-4 text-stone-400" />
                    <h2 className="font-bold text-sm">SBIR/STTR Grant Search</h2>
                </div>
                <div className="p-5 space-y-3">
                    <p className="text-xs text-stone-500">Search SBIR.gov for Small Business Innovation Research &amp; Technology Transfer grants.</p>
                    <div className="flex gap-2">
                        <input value={sbirKeywords} onChange={e => setSbirKeywords(e.target.value)}
                            placeholder="Keywords (e.g. pipeline, cybersecurity)"
                            className="flex-1 border border-stone-300 rounded-lg px-3 py-2 text-sm" />
                        <select value={sbirAgency} onChange={e => setSbirAgency(e.target.value)} title="Agency"
                            className="border border-stone-300 rounded-lg px-3 py-2 text-sm">
                            <option value="">All Agencies</option>
                            <option value="DOD">DOD</option>
                            <option value="DOE">DOE</option>
                            <option value="NASA">NASA</option>
                            <option value="NSF">NSF</option>
                            <option value="HHS">HHS</option>
                            <option value="USDA">USDA</option>
                            <option value="EPA">EPA</option>
                            <option value="DOT">DOT</option>
                        </select>
                        <button type="button" onClick={handleSbir} disabled={sbirSearching || !sbirKeywords.trim()}
                            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold inline-flex items-center gap-1.5 disabled:opacity-50">
                            {sbirSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                            {sbirSearching ? "Searching..." : "Search SBIR"}
                        </button>
                    </div>
                    {sbirResult && <p className={clsx("text-xs font-medium", sbirResult.startsWith("Error") ? "text-red-600" : "text-emerald-600")}>{sbirResult}</p>}
                </div>
            </div>

            {/* IDIQ/Task Order Search */}
            <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                <div className="bg-stone-50 border-b border-stone-100 px-5 py-3 flex items-center gap-2">
                    <Search className="w-4 h-4 text-stone-400" />
                    <h2 className="font-bold text-sm">IDIQ / Contract Vehicle Search</h2>
                </div>
                <div className="p-5 space-y-3">
                    <p className="text-xs text-stone-500">Find active IDIQ contracts and GWACs in a specific NAICS — getting on one means steady work.</p>
                    <div className="flex gap-2">
                        <input value={idiqNaics} onChange={e => setIdiqNaics(e.target.value)}
                            placeholder="NAICS code"
                            className="w-28 border border-stone-300 rounded-lg px-3 py-2 text-sm" />
                        <input value={idiqKeyword} onChange={e => setIdiqKeyword(e.target.value)}
                            placeholder="Keyword (optional)"
                            className="flex-1 border border-stone-300 rounded-lg px-3 py-2 text-sm" />
                        <button type="button" onClick={handleIdiq} disabled={idiqSearching || (!idiqNaics.trim() && !idiqKeyword.trim())}
                            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold inline-flex items-center gap-1.5 disabled:opacity-50">
                            {idiqSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                            {idiqSearching ? "Searching..." : "Search IDIQs"}
                        </button>
                    </div>
                    {idiqResult && <p className={clsx("text-xs font-medium", idiqResult.startsWith("Error") ? "text-red-600" : "text-emerald-600")}>{idiqResult}</p>}
                </div>
            </div>
        </div>
    );
}
