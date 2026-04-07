"use client";

import { useState } from "react";
import Link from "next/link";
import { Wrench, Search, RefreshCw, Mail, Loader2, CheckCircle2, Zap, Download, ExternalLink } from "lucide-react";
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
            <h1 className="text-xl font-bold font-typewriter flex items-center gap-2">
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

            {/* AI Document Analysis */}
            <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                <div className="bg-stone-50 border-b border-stone-100 px-5 py-3 flex items-center gap-2">
                    <Zap className="w-4 h-4 text-stone-400" />
                    <h2 className="font-bold text-sm">AI Document Analysis</h2>
                </div>
                <div className="p-5 space-y-3">
                    <p className="text-xs text-stone-500">Analyze an opportunity using AI — extracts requirements, evaluation criteria, risks, and recommended actions.</p>
                    <div className="flex gap-2">
                        <input id="ai-notice-id" placeholder="Notice ID (from opportunity)" className="flex-1 border border-stone-300 rounded-lg px-3 py-2 text-sm font-mono" />
                        <button type="button" onClick={async () => {
                            const input = document.getElementById("ai-notice-id") as HTMLInputElement;
                            if (!input?.value) return;
                            setAiAnalyzeResult("");
                            setAiAnalyzing(true);
                            try {
                                const res = await fetch("/api/ai/summarize-document", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ notice_id: input.value }),
                                });
                                const data = await res.json();
                                setAiAnalyzeResult(data.success ? `Analysis complete: ${data.analysis?.executive_summary?.substring(0, 200)}` : `Error: ${data.error}`);
                            } catch (err: unknown) {
                                setAiAnalyzeResult(`Error: ${err instanceof Error ? err.message : "Network request failed"}`);
                            }
                            setAiAnalyzing(false);
                        }} disabled={aiAnalyzing}
                        className="bg-stone-900 text-white px-4 py-2 rounded-lg text-sm font-bold inline-flex items-center gap-1.5 disabled:opacity-50">
                            {aiAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                            {aiAnalyzing ? "Analyzing..." : "AI Analyze"}
                        </button>
                    </div>
                    {aiAnalyzeResult && <p className={clsx("text-xs font-medium", aiAnalyzeResult.startsWith("Error") ? "text-red-600" : "text-emerald-600")}>{aiAnalyzeResult}</p>}
                </div>
            </div>

            {/* AI Proposal Generator */}
            <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                <div className="bg-stone-50 border-b border-stone-100 px-5 py-3 flex items-center gap-2">
                    <Zap className="w-4 h-4 text-stone-400" />
                    <h2 className="font-bold text-sm">AI Proposal Outline Generator</h2>
                </div>
                <div className="p-5 space-y-3">
                    <p className="text-xs text-stone-500">Generate a tailored proposal outline for a specific opportunity + client profile.</p>
                    <div className="flex gap-2">
                        <input id="prop-notice-id" placeholder="Notice ID" className="flex-1 border border-stone-300 rounded-lg px-3 py-2 text-sm font-mono" />
                        <input id="prop-profile-id" placeholder="Client Profile ID (optional)" className="flex-1 border border-stone-300 rounded-lg px-3 py-2 text-sm font-mono" />
                        <button type="button" onClick={async () => {
                            const noticeInput = document.getElementById("prop-notice-id") as HTMLInputElement;
                            const profileInput = document.getElementById("prop-profile-id") as HTMLInputElement;
                            if (!noticeInput?.value) return;
                            setProposalResult("");
                            setProposalGenerating(true);
                            try {
                                const res = await fetch("/api/ai/generate-proposal", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ notice_id: noticeInput.value, user_profile_id: profileInput?.value || undefined }),
                                });
                                const data = await res.json();
                                setProposalResult(data.success ? `Proposal outline generated: ${data.proposal?.proposal_title} (${data.proposal?.sections?.length} sections)` : `Error: ${data.error}`);
                            } catch (err: unknown) {
                                setProposalResult(`Error: ${err instanceof Error ? err.message : "Network request failed"}`);
                            }
                            setProposalGenerating(false);
                        }} disabled={proposalGenerating}
                        className="bg-stone-900 text-white px-4 py-2 rounded-lg text-sm font-bold inline-flex items-center gap-1.5 disabled:opacity-50">
                            {proposalGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
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
                        <input id="sbir-keywords" placeholder="Keywords (e.g. pipeline, cybersecurity)" className="flex-1 border border-stone-300 rounded-lg px-3 py-2 text-sm" />
                        <select id="sbir-agency" title="Agency" className="border border-stone-300 rounded-lg px-3 py-2 text-sm">
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
                            const kw = (document.getElementById("sbir-keywords") as HTMLInputElement)?.value;
                            const ag = (document.getElementById("sbir-agency") as HTMLSelectElement)?.value;
                            if (!kw) return;
                            setSbirResult("");
                            setSbirSearching(true);
                            try {
                                const res = await fetch(`/api/grants/sbir?keywords=${encodeURIComponent(kw)}&agency=${ag}&open=true`);
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
                    <Zap className="w-4 h-4 text-stone-400" />
                    <h2 className="font-bold text-sm">AI Full Proposal Writer</h2>
                </div>
                <div className="p-5 space-y-3">
                    <p className="text-xs text-stone-500">Generate a complete multi-section proposal (Cover Letter, Executive Summary, Technical Approach, Past Performance, etc.)</p>
                    <div className="flex gap-2">
                        <input id="fw-notice" placeholder="Notice ID" className="flex-1 border border-stone-300 rounded-lg px-3 py-2 text-sm font-mono" />
                        <input id="fw-profile" placeholder="Client Profile ID (optional)" className="flex-1 border border-stone-300 rounded-lg px-3 py-2 text-sm font-mono" />
                        <button type="button" onClick={async () => {
                            const nid = (document.getElementById("fw-notice") as HTMLInputElement)?.value;
                            if (!nid) return;
                            const pid = (document.getElementById("fw-profile") as HTMLInputElement)?.value;
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
                            {proposalWriting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
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
                        <input id="tp-naics" placeholder="NAICS code" className="w-28 border border-stone-300 rounded-lg px-3 py-2 text-sm" />
                        <input id="tp-state" placeholder="State (e.g. TX)" className="w-20 border border-stone-300 rounded-lg px-3 py-2 text-sm" />
                        <select id="tp-cert" title="Certification" className="border border-stone-300 rounded-lg px-3 py-2 text-sm">
                            <option value="">Any Cert</option>
                            <option value="8A">8(a)</option>
                            <option value="SDVOSB">SDVOSB</option>
                            <option value="WOSB">WOSB</option>
                            <option value="HUBZONE">HUBZone</option>
                            <option value="VOSB">VOSB</option>
                        </select>
                        <button type="button" onClick={async () => {
                            const naics = (document.getElementById("tp-naics") as HTMLInputElement)?.value;
                            const state = (document.getElementById("tp-state") as HTMLInputElement)?.value;
                            const cert = (document.getElementById("tp-cert") as HTMLSelectElement)?.value;
                            if (!naics) return;
                            setPartnerResult(""); setPartnerSearching(true);
                            try {
                                const res = await fetch(`/api/partners/search?naics=${naics}&state=${state}&set_aside=${cert}`);
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
                        <input id="idiq-naics" placeholder="NAICS code" className="w-28 border border-stone-300 rounded-lg px-3 py-2 text-sm" />
                        <input id="idiq-keyword" placeholder="Keyword (optional)" className="flex-1 border border-stone-300 rounded-lg px-3 py-2 text-sm" />
                        <button type="button" onClick={async () => {
                            const naics = (document.getElementById("idiq-naics") as HTMLInputElement)?.value;
                            const kw = (document.getElementById("idiq-keyword") as HTMLInputElement)?.value;
                            if (!naics && !kw) return;
                            setIdiqResult(""); setIdiqSearching(true);
                            try {
                                const res = await fetch(`/api/idiq?naics=${naics}&keyword=${encodeURIComponent(kw || "")}`);
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
