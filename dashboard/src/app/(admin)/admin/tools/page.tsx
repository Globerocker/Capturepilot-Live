"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Wrench, Search, RefreshCw, Mail, Loader2, CheckCircle2, AlertCircle, Activity, Sparkles, Download, ExternalLink } from "lucide-react";
import clsx from "clsx";

interface CronSummary {
    route: string;
    runs_7d: number;
    ok: number;
    error: number;
    partial: number;
    last_run: string | null;
    last_status: string | null;
}

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

    // Dedicated state for AI Document Analysis
    const [aiAnalyzing, setAiAnalyzing] = useState(false);
    const [aiAnalyzeResult, setAiAnalyzeResult] = useState<string>("");

    // Dedicated state for AI Proposal Generator
    const [proposalGenerating, setProposalGenerating] = useState(false);
    const [proposalResult, setProposalResult] = useState<string>("");

    // Dedicated state for SBIR search
    const [sbirSearching, setSbirSearching] = useState(false);
    const [sbirResult, setSbirResult] = useState<string>("");

    // Dedicated state for AI Full Proposal Writer
    const [proposalWriting, setProposalWriting] = useState(false);
    const [proposalWriteResult, setProposalWriteResult] = useState<string>("");

    // Dedicated state for Teaming Partner Search
    const [partnerSearching, setPartnerSearching] = useState(false);
    const [partnerResult, setPartnerResult] = useState<string>("");

    // Dedicated state for IDIQ search
    const [idiqSearching, setIdiqSearching] = useState(false);
    const [idiqResult, setIdiqResult] = useState<string>("");

    // Bulk contractor-enrichment runner (Apollo)
    const [bulkEnrichRunning, setBulkEnrichRunning] = useState(false);
    const [bulkEnrichPasses, setBulkEnrichPasses] = useState("4");
    const [bulkEnrichResult, setBulkEnrichResult] = useState<string>("");

    // Lapsed-award audience: website-crawler enrichment for re-engagement campaigns
    const [campaignSilent, setCampaignSilent] = useState("12");
    const [campaignLimit, setCampaignLimit] = useState("20");
    const [campaignAudience, setCampaignAudience] = useState<{ total_audience: number; missing_email: number; crawlable_now: number; ready_to_email: number } | null>(null);
    const [campaignRunning, setCampaignRunning] = useState(false);
    const [campaignPreviewing, setCampaignPreviewing] = useState(false);
    const [campaignResult, setCampaignResult] = useState<string>("");
    const [campaignSample, setCampaignSample] = useState<Array<{ company: string; email?: string; name?: string; title?: string }>>([]);

    // Live cron telemetry — replaces the old hardcoded "9 jobs" list which
    // had drifted (we run 34 today, not 9). Backed by /api/admin/cron-runs.
    const [cronSummary, setCronSummary] = useState<CronSummary[] | null>(null);
    const [cronError, setCronError] = useState<string | null>(null);

    // Controlled inputs for the tool widgets below. Replaces the previous
    // document.getElementById pattern which fought React on every keystroke.
    const [aiNoticeId, setAiNoticeId] = useState("");
    const [propNoticeId, setPropNoticeId] = useState("");
    const [propProfileId, setPropProfileId] = useState("");
    const [sbirKeywords, setSbirKeywords] = useState("");
    const [sbirAgency, setSbirAgency] = useState("");
    const [fwNotice, setFwNotice] = useState("");
    const [fwProfile, setFwProfile] = useState("");
    const [tpNaics, setTpNaics] = useState("");
    const [tpState, setTpState] = useState("");
    const [tpCert, setTpCert] = useState("");
    const [idiqNaics, setIdiqNaics] = useState("");
    const [idiqKeyword, setIdiqKeyword] = useState("");

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch("/api/admin/cron-runs", { cache: "no-store" });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                if (!cancelled) setCronSummary(data.summary || []);
            } catch (e) {
                if (!cancelled) setCronError((e as Error).message);
            }
        })();
        return () => { cancelled = true; };
    }, []);

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

    const handleEnrich = async () => {
        if (!enrichProfileId) return;
        setEnriching(true);
        setEnrichResult("");
        try {
            const res = await fetch("/api/admin/enrich-profile", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ user_profile_id: enrichProfileId }),
            });
            const data = await res.json();
            setEnrichResult(data.success ? `Enriched: ${(data.sources || []).join(", ")}. Updated ${(data.fields_updated || []).length} fields.` : `Error: ${data.error}`);
        } catch (err: unknown) {
            setEnrichResult(`Error: ${err instanceof Error ? err.message : "Network request failed"}`);
        }
        setEnriching(false);
    };

    const handleEmail = async () => {
        if (!emailProfileId) return;
        setSending(true);
        setEmailResult("");
        try {
            const res = await fetch("/api/admin/send-update", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ user_profile_id: emailProfileId, type: emailType }),
            });
            const data = await res.json();
            setEmailResult(data.success ? `Sent to ${data.sent_to}` : `Error: ${data.error}`);
        } catch (err: unknown) {
            setEmailResult(`Error: ${err instanceof Error ? err.message : "Network request failed"}`);
        }
        setSending(false);
    };

    return (
        <div className="w-full space-y-6">
            <h1 className="text-xl font-bold flex items-center gap-2">
                <Wrench className="w-5 h-5" /> Admin Tools
            </h1>

            {/* Quick Links */}
            <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                <div className="bg-stone-50 border-b border-stone-100 px-5 py-3">
                    <h2 className="font-bold text-sm">Quick Links</h2>
                </div>
                <div className="p-5">
                    <Link href="/admin/lead-check" className="inline-flex items-center gap-2 text-sm font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg px-4 py-2.5 transition-colors">
                        <Search className="w-4 h-4" />
                        Lead Check — Quick company analysis with Apollo enrichment
                        <ExternalLink className="w-3.5 h-3.5" />
                    </Link>
                </div>
            </div>

            {/* Bulk contractor enrichment runner */}
            <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                <div className="bg-stone-50 border-b border-stone-100 px-5 py-3 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-stone-400" />
                    <h2 className="font-bold text-sm">Bulk Contractor Enrichment (Apollo)</h2>
                </div>
                <div className="p-5 space-y-3">
                    <p className="text-xs text-stone-500">
                        Runs the contractor-enrichment cron on demand. Targets only contractors with federal awards. Each pass = 50 contractors. Pulls company data + tries to fill primary POC email/phone/title via Apollo people-match.
                    </p>
                    <div className="flex gap-2">
                        <select
                            value={bulkEnrichPasses}
                            onChange={e => setBulkEnrichPasses(e.target.value)}
                            title="How many cron passes to run back-to-back"
                            className="border border-stone-300 rounded-lg px-3 py-2 text-sm"
                        >
                            <option value="1">1 pass — 50 contractors</option>
                            <option value="2">2 passes — 100 contractors</option>
                            <option value="4">4 passes — 200 contractors</option>
                            <option value="6">6 passes — 300 contractors (max)</option>
                        </select>
                        <button
                            type="button"
                            onClick={async () => {
                                setBulkEnrichRunning(true);
                                setBulkEnrichResult("");
                                try {
                                    const res = await fetch(`/api/admin/enrich-contractors?passes=${bulkEnrichPasses}`, { method: "POST" });
                                    const data = await res.json();
                                    if (!res.ok) {
                                        setBulkEnrichResult(`Error: ${data.error || res.statusText}`);
                                    } else {
                                        const t = data.totals || {};
                                        const blocked = data.person_endpoint_blocked ? " (Apollo people-match blocked on this plan)" : "";
                                        setBulkEnrichResult(`Done in ${data.passes_run} pass(es). Company-matched: ${t.company_matched ?? 0} · Person-matched: ${t.person_matched ?? 0} · Misses: ${t.not_found ?? 0} · Failed: ${t.failed ?? 0}${blocked}`);
                                    }
                                } catch (err: unknown) {
                                    setBulkEnrichResult(`Error: ${err instanceof Error ? err.message : "Network request failed"}`);
                                }
                                setBulkEnrichRunning(false);
                            }}
                            disabled={bulkEnrichRunning}
                            className="bg-stone-900 text-white px-4 py-2 rounded-lg text-sm font-bold inline-flex items-center gap-1.5 disabled:opacity-50"
                        >
                            {bulkEnrichRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                            {bulkEnrichRunning ? "Running…" : "Run now"}
                        </button>
                    </div>
                    {bulkEnrichResult && (
                        <p className={clsx(
                            "text-xs font-medium",
                            bulkEnrichResult.startsWith("Error") ? "text-red-600" : "text-emerald-700"
                        )}>
                            {bulkEnrichResult}
                        </p>
                    )}
                </div>
            </div>

            {/* Re-engagement campaign audience: lapsed-award winners */}
            <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                <div className="bg-stone-50 border-b border-stone-100 px-5 py-3 flex items-center gap-2">
                    <Search className="w-4 h-4 text-stone-400" />
                    <h2 className="font-bold text-sm">Re-engagement Audience — Website Crawl</h2>
                </div>
                <div className="p-5 space-y-3">
                    <p className="text-xs text-stone-500">
                        Targets contractors who won at least one federal award (USAspending) but have been silent for N+ months. Crawls each company website to extract CEO/owner name, title, email, phone, and LinkedIn — useful when Apollo can&apos;t reveal the email. Designed for personalized outreach campaigns.
                    </p>

                    <div className="flex flex-wrap items-end gap-2">
                        <div>
                            <label htmlFor="silent-months" className="block text-[10px] uppercase tracking-wider text-stone-500 mb-1">Silent months</label>
                            <select
                                id="silent-months"
                                title="How long since last award counts as silent"
                                value={campaignSilent}
                                onChange={e => { setCampaignSilent(e.target.value); setCampaignAudience(null); }}
                                className="border border-stone-300 rounded-lg px-3 py-2 text-sm"
                            >
                                <option value="6">6 months</option>
                                <option value="12">12 months</option>
                                <option value="18">18 months</option>
                                <option value="24">24 months</option>
                            </select>
                        </div>
                        <div>
                            <label htmlFor="campaign-limit" className="block text-[10px] uppercase tracking-wider text-stone-500 mb-1">Batch size</label>
                            <select
                                id="campaign-limit"
                                title="Contractors per run"
                                value={campaignLimit}
                                onChange={e => setCampaignLimit(e.target.value)}
                                className="border border-stone-300 rounded-lg px-3 py-2 text-sm"
                            >
                                <option value="10">10 (fast)</option>
                                <option value="20">20</option>
                                <option value="30">30 (slow)</option>
                            </select>
                        </div>
                        <button
                            type="button"
                            onClick={async () => {
                                setCampaignPreviewing(true);
                                setCampaignAudience(null);
                                try {
                                    const res = await fetch(`/api/admin/enrich-campaign-audience?silent_months=${campaignSilent}`);
                                    const data = await res.json();
                                    if (res.ok) setCampaignAudience(data);
                                    else setCampaignResult(`Error: ${data.error || res.statusText}`);
                                } catch (err: unknown) {
                                    setCampaignResult(`Error: ${err instanceof Error ? err.message : "Network request failed"}`);
                                }
                                setCampaignPreviewing(false);
                            }}
                            disabled={campaignPreviewing || campaignRunning}
                            className="bg-white border border-stone-200 hover:border-stone-300 text-stone-700 px-4 py-2 rounded-lg text-sm font-bold inline-flex items-center gap-1.5 disabled:opacity-50"
                        >
                            {campaignPreviewing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                            Preview audience
                        </button>
                        <button
                            type="button"
                            onClick={async () => {
                                setCampaignRunning(true);
                                setCampaignResult("");
                                setCampaignSample([]);
                                try {
                                    const res = await fetch(`/api/admin/enrich-campaign-audience?silent_months=${campaignSilent}&limit=${campaignLimit}`, { method: "POST" });
                                    const data = await res.json();
                                    if (!res.ok) {
                                        setCampaignResult(`Error: ${data.error || res.statusText}`);
                                    } else {
                                        setCampaignResult(`Crawled ${data.processed} sites — found ${data.emails_found} emails, ${data.executive_found} executives. ${data.crawl_failed} crawls failed, ${data.skipped_no_website} skipped.`);
                                        setCampaignSample(data.sample || []);
                                    }
                                } catch (err: unknown) {
                                    setCampaignResult(`Error: ${err instanceof Error ? err.message : "Network request failed"}`);
                                }
                                setCampaignRunning(false);
                            }}
                            disabled={campaignRunning || campaignPreviewing}
                            className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-bold inline-flex items-center gap-1.5 hover:bg-emerald-700 disabled:opacity-50"
                        >
                            {campaignRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                            {campaignRunning ? "Crawling…" : "Crawl batch"}
                        </button>
                    </div>

                    {campaignAudience && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs bg-stone-50 border border-stone-100 rounded-lg p-3">
                            <div><p className="text-stone-400 uppercase text-[9px]">Total audience</p><p className="text-lg font-bold text-stone-900">{campaignAudience.total_audience.toLocaleString()}</p></div>
                            <div><p className="text-stone-400 uppercase text-[9px]">Already have email</p><p className="text-lg font-bold text-emerald-700">{campaignAudience.ready_to_email.toLocaleString()}</p></div>
                            <div><p className="text-stone-400 uppercase text-[9px]">Missing email</p><p className="text-lg font-bold text-amber-700">{campaignAudience.missing_email.toLocaleString()}</p></div>
                            <div><p className="text-stone-400 uppercase text-[9px]">Crawlable now</p><p className="text-lg font-bold text-blue-700">{campaignAudience.crawlable_now.toLocaleString()}</p></div>
                        </div>
                    )}

                    {campaignResult && (
                        <p className={clsx(
                            "text-xs font-medium",
                            campaignResult.startsWith("Error") ? "text-red-600" : "text-emerald-700"
                        )}>
                            {campaignResult}
                        </p>
                    )}

                    {campaignSample.length > 0 && (
                        <div className="border border-stone-100 rounded-lg overflow-hidden">
                            <div className="bg-stone-50 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-stone-500">Sample of new contacts</div>
                            <ul className="divide-y divide-stone-100">
                                {campaignSample.map((s, i) => (
                                    <li key={i} className="px-3 py-2 text-xs flex flex-wrap items-center gap-2">
                                        <span className="font-bold text-stone-900">{s.company}</span>
                                        {s.name && <span className="text-stone-600">{s.name}</span>}
                                        {s.title && <span className="text-stone-400 italic">{s.title}</span>}
                                        {s.email && <span className="ml-auto font-mono text-emerald-700">{s.email}</span>}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            </div>

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

            {/* Profile Enrichment */}
            <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                <div className="bg-stone-50 border-b border-stone-100 px-5 py-3 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-stone-400" />
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
                        <select value={emailType} onChange={e => setEmailType(e.target.value)} title="Email type"
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

            {/* AI Document Analysis */}
            <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                <div className="bg-stone-50 border-b border-stone-100 px-5 py-3 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-stone-400" />
                    <h2 className="font-bold text-sm">AI Document Analysis</h2>
                </div>
                <div className="p-5 space-y-3">
                    <p className="text-xs text-stone-500">Analyze an opportunity using AI — extracts requirements, evaluation criteria, risks, and recommended actions.</p>
                    <div className="flex gap-2">
                        <input
                            value={aiNoticeId}
                            onChange={e => setAiNoticeId(e.target.value)}
                            placeholder="Notice ID (from opportunity)"
                            className="flex-1 border border-stone-300 rounded-lg px-3 py-2 text-sm font-mono"
                        />
                        <button type="button" onClick={async () => {
                            if (!aiNoticeId.trim()) return;
                            setAiAnalyzeResult("");
                            setAiAnalyzing(true);
                            try {
                                const res = await fetch("/api/ai/summarize-document", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ notice_id: aiNoticeId.trim() }),
                                });
                                const data = await res.json();
                                setAiAnalyzeResult(data.success ? `Analysis complete: ${data.analysis?.executive_summary?.substring(0, 200)}` : `Error: ${data.error}`);
                            } catch (err: unknown) {
                                setAiAnalyzeResult(`Error: ${err instanceof Error ? err.message : "Network request failed"}`);
                            }
                            setAiAnalyzing(false);
                        }} disabled={aiAnalyzing}
                        className="bg-stone-900 text-white px-4 py-2 rounded-lg text-sm font-bold inline-flex items-center gap-1.5 disabled:opacity-50">
                            {aiAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                            {aiAnalyzing ? "Analyzing..." : "AI Analyze"}
                        </button>
                    </div>
                    {aiAnalyzeResult && <p className={clsx("text-xs font-medium", aiAnalyzeResult.startsWith("Error") ? "text-red-600" : "text-emerald-600")}>{aiAnalyzeResult}</p>}
                </div>
            </div>

            {/* AI Proposal Generator */}
            <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                <div className="bg-stone-50 border-b border-stone-100 px-5 py-3 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-stone-400" />
                    <h2 className="font-bold text-sm">AI Proposal Outline Generator</h2>
                </div>
                <div className="p-5 space-y-3">
                    <p className="text-xs text-stone-500">Generate a tailored proposal outline for a specific opportunity + client profile.</p>
                    <div className="flex gap-2">
                        <input
                            value={propNoticeId}
                            onChange={e => setPropNoticeId(e.target.value)}
                            placeholder="Notice ID"
                            className="flex-1 border border-stone-300 rounded-lg px-3 py-2 text-sm font-mono"
                        />
                        <input
                            value={propProfileId}
                            onChange={e => setPropProfileId(e.target.value)}
                            placeholder="Client Profile ID (optional)"
                            className="flex-1 border border-stone-300 rounded-lg px-3 py-2 text-sm font-mono"
                        />
                        <button type="button" onClick={async () => {
                            if (!propNoticeId.trim()) return;
                            setProposalResult("");
                            setProposalGenerating(true);
                            try {
                                const res = await fetch("/api/ai/generate-proposal", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ notice_id: propNoticeId.trim(), user_profile_id: propProfileId.trim() || undefined }),
                                });
                                const data = await res.json();
                                setProposalResult(data.success ? `Proposal outline generated: ${data.proposal?.proposal_title} (${data.proposal?.sections?.length} sections)` : `Error: ${data.error}`);
                            } catch (err: unknown) {
                                setProposalResult(`Error: ${err instanceof Error ? err.message : "Network request failed"}`);
                            }
                            setProposalGenerating(false);
                        }} disabled={proposalGenerating}
                        className="bg-stone-900 text-white px-4 py-2 rounded-lg text-sm font-bold inline-flex items-center gap-1.5 disabled:opacity-50">
                            {proposalGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                            {proposalGenerating ? "Generating..." : "Generate Proposal"}
                        </button>
                    </div>
                    {proposalResult && <p className={clsx("text-xs font-medium", proposalResult.startsWith("Error") ? "text-red-600" : "text-emerald-600")}>{proposalResult}</p>}
                </div>
            </div>

            {/* SBIR/STTR Grant Search */}
            <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                <div className="bg-stone-50 border-b border-stone-100 px-5 py-3 flex items-center gap-2">
                    <Search className="w-4 h-4 text-stone-400" />
                    <h2 className="font-bold text-sm">SBIR/STTR Grant Search</h2>
                </div>
                <div className="p-5 space-y-3">
                    <p className="text-xs text-stone-500">Search SBIR.gov for Small Business Innovation Research and Technology Transfer grants.</p>
                    <div className="flex gap-2">
                        <input
                            value={sbirKeywords}
                            onChange={e => setSbirKeywords(e.target.value)}
                            placeholder="Keywords (e.g. pipeline, cybersecurity)"
                            className="flex-1 border border-stone-300 rounded-lg px-3 py-2 text-sm"
                        />
                        <select
                            value={sbirAgency}
                            onChange={e => setSbirAgency(e.target.value)}
                            title="Agency"
                            className="border border-stone-300 rounded-lg px-3 py-2 text-sm"
                        >
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
                        <button type="button" onClick={async () => {
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
                        }} disabled={sbirSearching}
                        className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold inline-flex items-center gap-1.5 disabled:opacity-50">
                            {sbirSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                            {sbirSearching ? "Searching..." : "Search SBIR"}
                        </button>
                    </div>
                    {sbirResult && <p className={clsx("text-xs font-medium", sbirResult.startsWith("Error") ? "text-red-600" : "text-emerald-600")}>{sbirResult}</p>}
                </div>
            </div>

            {/* AI Full Proposal Writer */}
            <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                <div className="bg-stone-50 border-b border-stone-100 px-5 py-3 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-stone-400" />
                    <h2 className="font-bold text-sm">AI Full Proposal Writer</h2>
                </div>
                <div className="p-5 space-y-3">
                    <p className="text-xs text-stone-500">Generate a complete multi-section proposal (Cover Letter, Executive Summary, Technical Approach, Past Performance, etc.)</p>
                    <div className="flex gap-2">
                        <input
                            value={fwNotice}
                            onChange={e => setFwNotice(e.target.value)}
                            placeholder="Notice ID"
                            className="flex-1 border border-stone-300 rounded-lg px-3 py-2 text-sm font-mono"
                        />
                        <input
                            value={fwProfile}
                            onChange={e => setFwProfile(e.target.value)}
                            placeholder="Client Profile ID (optional)"
                            className="flex-1 border border-stone-300 rounded-lg px-3 py-2 text-sm font-mono"
                        />
                        <button type="button" onClick={async () => {
                            const nid = fwNotice.trim();
                            if (!nid) return;
                            const pid = fwProfile.trim();
                            setProposalWriteResult(""); setProposalWriting(true);
                            try {
                                const res = await fetch("/api/ai/write-proposal", {
                                    method: "POST", headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ notice_id: nid, user_profile_id: pid || undefined }),
                                });
                                const data = await res.json();
                                setProposalWriteResult(data.success ? `Proposal generated: ${data.sections?.length} sections, ${data.total_word_count} words (~${data.estimated_pages} pages)` : `Error: ${data.error}`);
                            } catch (err: unknown) {
                                setProposalWriteResult(`Error: ${err instanceof Error ? err.message : "Network request failed"}`);
                            }
                            setProposalWriting(false);
                        }} disabled={proposalWriting}
                        className="bg-stone-900 text-white px-4 py-2 rounded-lg text-sm font-bold inline-flex items-center gap-1.5 disabled:opacity-50">
                            {proposalWriting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                            {proposalWriting ? "Writing..." : "Write Proposal"}
                        </button>
                    </div>
                    {proposalWriteResult && <p className={clsx("text-xs font-medium", proposalWriteResult.startsWith("Error") ? "text-red-600" : "text-emerald-600")}>{proposalWriteResult}</p>}
                </div>
            </div>

            {/* Teaming Partner Search */}
            <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                <div className="bg-stone-50 border-b border-stone-100 px-5 py-3 flex items-center gap-2">
                    <Search className="w-4 h-4 text-stone-400" />
                    <h2 className="font-bold text-sm">Teaming Partner Search</h2>
                </div>
                <div className="p-5 space-y-3">
                    <p className="text-xs text-stone-500">Find SAM-registered companies for teaming partnerships.</p>
                    <div className="flex gap-2">
                        <input
                            value={tpNaics}
                            onChange={e => setTpNaics(e.target.value)}
                            placeholder="NAICS code"
                            className="w-28 border border-stone-300 rounded-lg px-3 py-2 text-sm"
                        />
                        <input
                            value={tpState}
                            onChange={e => setTpState(e.target.value)}
                            placeholder="State (e.g. TX)"
                            className="w-20 border border-stone-300 rounded-lg px-3 py-2 text-sm"
                        />
                        <select
                            value={tpCert}
                            onChange={e => setTpCert(e.target.value)}
                            title="Certification"
                            className="border border-stone-300 rounded-lg px-3 py-2 text-sm"
                        >
                            <option value="">Any Cert</option>
                            <option value="8A">8(a)</option>
                            <option value="SDVOSB">SDVOSB</option>
                            <option value="WOSB">WOSB</option>
                            <option value="HUBZONE">HUBZone</option>
                            <option value="VOSB">VOSB</option>
                        </select>
                        <button type="button" onClick={async () => {
                            const naics = tpNaics.trim();
                            if (!naics) return;
                            setPartnerResult(""); setPartnerSearching(true);
                            try {
                                const res = await fetch(`/api/partners/search?naics=${encodeURIComponent(naics)}&state=${encodeURIComponent(tpState)}&set_aside=${encodeURIComponent(tpCert)}`);
                                const data = await res.json();
                                setPartnerResult(data.success ? `Found ${data.total} potential partners` : `Error: ${data.error}`);
                            } catch (err: unknown) {
                                setPartnerResult(`Error: ${err instanceof Error ? err.message : "Network request failed"}`);
                            }
                            setPartnerSearching(false);
                        }} disabled={partnerSearching}
                        className="bg-stone-900 text-white px-4 py-2 rounded-lg text-sm font-bold inline-flex items-center gap-1.5 disabled:opacity-50">
                            {partnerSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                            {partnerSearching ? "Searching..." : "Find Partners"}
                        </button>
                    </div>
                    {partnerResult && <p className={clsx("text-xs font-medium", partnerResult.startsWith("Error") ? "text-red-600" : "text-emerald-600")}>{partnerResult}</p>}
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
                        <input
                            value={idiqNaics}
                            onChange={e => setIdiqNaics(e.target.value)}
                            placeholder="NAICS code"
                            className="w-28 border border-stone-300 rounded-lg px-3 py-2 text-sm"
                        />
                        <input
                            value={idiqKeyword}
                            onChange={e => setIdiqKeyword(e.target.value)}
                            placeholder="Keyword (optional)"
                            className="flex-1 border border-stone-300 rounded-lg px-3 py-2 text-sm"
                        />
                        <button type="button" onClick={async () => {
                            const naics = idiqNaics.trim();
                            const kw = idiqKeyword.trim();
                            if (!naics && !kw) return;
                            setIdiqResult(""); setIdiqSearching(true);
                            try {
                                const res = await fetch(`/api/idiq?naics=${encodeURIComponent(naics)}&keyword=${encodeURIComponent(kw)}`);
                                const data = await res.json();
                                setIdiqResult(data.success ? `Found ${data.total} IDIQ contracts worth ${data.total_value ? "$" + (data.total_value / 1e6).toFixed(0) + "M" : "N/A"}` : `Error: ${data.error}`);
                            } catch (err: unknown) {
                                setIdiqResult(`Error: ${err instanceof Error ? err.message : "Network request failed"}`);
                            }
                            setIdiqSearching(false);
                        }} disabled={idiqSearching}
                        className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold inline-flex items-center gap-1.5 disabled:opacity-50">
                            {idiqSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                            {idiqSearching ? "Searching..." : "Search IDIQs"}
                        </button>
                    </div>
                    {idiqResult && <p className={clsx("text-xs font-medium", idiqResult.startsWith("Error") ? "text-red-600" : "text-emerald-600")}>{idiqResult}</p>}
                </div>
            </div>

            {/* Cron Status — live from /api/admin/cron-runs (last 7d) */}
            <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                <div className="bg-stone-50 border-b border-stone-100 px-5 py-3 flex items-center justify-between">
                    <h2 className="font-bold text-sm flex items-center gap-2">
                        <Activity className="w-4 h-4 text-stone-400" />
                        Automated Crons
                        {cronSummary && (
                            <span className="text-[10px] font-normal text-stone-400">
                                ({cronSummary.length} active in last 7d)
                            </span>
                        )}
                    </h2>
                    <Link
                        href="/admin/crons"
                        className="text-xs font-bold text-blue-600 hover:text-blue-800 inline-flex items-center gap-1"
                    >
                        Full telemetry <ExternalLink className="w-3 h-3" />
                    </Link>
                </div>
                <div className="p-5">
                    {cronError && (
                        <p className="text-xs text-red-600 mb-2">Failed to load cron status: {cronError}</p>
                    )}
                    {!cronSummary && !cronError && (
                        <div className="flex items-center gap-2 text-xs text-stone-500">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading cron status…
                        </div>
                    )}
                    {cronSummary && cronSummary.length === 0 && (
                        <p className="text-xs text-stone-500">
                            No cron runs in the last 7 days. Trigger one from{" "}
                            <Link href="/admin/crons" className="text-blue-600 hover:underline">/admin/crons</Link>.
                        </p>
                    )}
                    {cronSummary && cronSummary.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                            {cronSummary.map(c => {
                                const isOk = c.last_status === "ok";
                                const isErr = c.last_status === "error";
                                const Icon = isOk ? CheckCircle2 : isErr ? AlertCircle : Activity;
                                const iconCls = isOk ? "text-emerald-500" : isErr ? "text-rose-500" : "text-stone-400";
                                const name = c.route.replace("/api/cron/", "");
                                return (
                                    <div key={c.route} className="flex items-center gap-2 bg-stone-50 rounded-lg px-3 py-2">
                                        <Icon className={clsx("w-3.5 h-3.5 flex-shrink-0", iconCls)} />
                                        <div className="min-w-0 flex-1">
                                            <p className="font-medium text-stone-700 truncate">{name}</p>
                                            <p className="text-stone-400 truncate">
                                                {c.runs_7d} run{c.runs_7d === 1 ? "" : "s"} · {c.ok} ok · {c.error} err
                                            </p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
