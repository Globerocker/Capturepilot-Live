// @ts-nocheck
"use client";

import DrafterTabs from "@/components/layout/DrafterTabs";

import { useEffect, useRef, useState } from "react";
import { createSupabaseClient } from "@/lib/supabase/client";
import {
    Mic, MicOff, Loader2, FileText, Palette, Download, Sparkles,
    CheckCircle2, Globe, Circle, HardDrive, Upload,
} from "lucide-react";
import clsx from "clsx";
import CapabilityEditor from "@/components/capability/CapabilityEditor";
import { buildCapabilityPdf, type CapSection, type CapMetadata } from "@/components/capability/pdfBuilder";

const supabase = createSupabaseClient();

type SectionState = CapSection & {
    status: "pending" | "running" | "done" | "error";
    word_count?: number;
};

type BrandData = {
    logo_url?: string;
    favicon_url?: string;
    colors?: { primary?: string };
    all_colors?: string[];
    company_name?: string;
    description?: string;
    services?: string[];
    past_clients?: string[];
    past_customers?: string[];
    project_portfolio?: string[];
    detected_uei?: string | null;
    detected_cage_code?: string | null;
};

const JOB_STORAGE_KEY = "cap_statement_job";

export default function CapabilityStatementPage() {
    const [profileId, setProfileId] = useState("");
    const [website, setWebsite] = useState("");
    const [loading, setLoading] = useState(true);

    // Voice
    const [isRecording, setIsRecording] = useState(false);
    const [transcript, setTranscript] = useState("");
    const [recognition, setRecognition] = useState<any>(null);

    // Inputs
    const [pastProjects, setPastProjects] = useState("");
    const [differentiators, setDifferentiators] = useState("");

    // Brand
    const [brandLoading, setBrandLoading] = useState(false);
    const [brand, setBrand] = useState<BrandData | null>(null);
    const [primaryColor, setPrimaryColor] = useState("#0a3d62");

    // Generation state
    const [generating, setGenerating] = useState(false);
    const [sections, setSections] = useState<SectionState[]>([]);
    const [metadata, setMetadata] = useState<CapMetadata | null>(null);
    const [startedAt, setStartedAt] = useState<number | null>(null);
    const [elapsed, setElapsed] = useState(0);

    // UI
    const [collapseInputs, setCollapseInputs] = useState(false);
    const [savingToDrive, setSavingToDrive] = useState(false);
    const [downloadingPdf, setDownloadingPdf] = useState(false);
    const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

    // Auto-dismiss the toast after 4s.
    useEffect(() => {
        if (!toast) return;
        const t = setTimeout(() => setToast(null), 4000);
        return () => clearTimeout(t);
    }, [toast]);

    // Restore in-flight job from sessionStorage on mount
    useEffect(() => {
        try {
            const saved = sessionStorage.getItem(JOB_STORAGE_KEY);
            if (saved) {
                const job = JSON.parse(saved);
                if (job?.sections) setSections(job.sections);
                if (job?.metadata) setMetadata(job.metadata);
                if (job?.primary_color) setPrimaryColor(job.primary_color);
                if (job?.brand) setBrand(job.brand);
                if (job?.sections?.every((s: SectionState) => s.status === "done")) {
                    setCollapseInputs(true);
                }
            }
        } catch { /* ignore */ }
    }, []);

    // Persist job state
    useEffect(() => {
        if (sections.length > 0) {
            try {
                sessionStorage.setItem(JOB_STORAGE_KEY, JSON.stringify({
                    sections, metadata, primary_color: primaryColor, brand,
                }));
            } catch { /* ignore */ }
        }
    }, [sections, metadata, primaryColor, brand]);

    // Timer for elapsed time while generating
    useEffect(() => {
        if (!generating || !startedAt) return;
        const t = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 500);
        return () => clearInterval(t);
    }, [generating, startedAt]);

    useEffect(() => {
        (async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            const { data } = await supabase.from("user_profiles").select("id, website").eq("auth_user_id", user.id).single();
            if (data) {
                setProfileId(data.id);
                setWebsite(data.website || "");
            }
            setLoading(false);
        })();

        if (typeof window !== "undefined") {
            const w = window as any;
            const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
            if (SR) {
                const rec = new SR();
                rec.continuous = true;
                rec.interimResults = true;
                rec.lang = "en-US";
                rec.onresult = (e: any) => {
                    let text = "";
                    for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
                    setTranscript(text);
                };
                rec.onerror = () => setIsRecording(false);
                rec.onend = () => setIsRecording(false);
                setRecognition(rec);
            }
        }
    }, []);

    const toggleRecording = () => {
        if (!recognition) return;
        if (isRecording) { recognition.stop(); setIsRecording(false); }
        else { setTranscript(""); recognition.start(); setIsRecording(true); }
    };

    const extractBrand = async () => {
        if (!website) return;
        setBrandLoading(true);
        try {
            const res = await fetch("/api/brand", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ website, user_profile_id: profileId }),
            });
            const data = await res.json();
            if (data.success) {
                const b = data.brand as BrandData;
                setBrand(b);
                setPrimaryColor(b.colors?.primary || b.all_colors?.[0] || "#0a3d62");
                // Auto-prefill any empty fields from crawl data
                if (b.project_portfolio?.length && !pastProjects) {
                    setPastProjects(b.project_portfolio.slice(0, 5).join("\n\n"));
                }
                if (!transcript && b.description) {
                    setTranscript(b.description);
                }
                if (b.services?.length && !differentiators) {
                    // Leave differentiators free for user input; services go into context server-side
                }
            } else {
                alert("Brand extraction failed: " + (data.error || "unknown error"));
            }
        } catch (e) {
            alert("Brand extraction failed: " + (e as Error).message);
        } finally {
            setBrandLoading(false);
        }
    };

    const generateStatement = async () => {
        if (!profileId) return;
        setGenerating(true);
        setStartedAt(Date.now());
        setElapsed(0);
        setSections([]);
        setMetadata(null);
        setCollapseInputs(false);

        try {
            const res = await fetch("/api/ai/capability-statement", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    user_profile_id: profileId,
                    voice_transcript: transcript || undefined,
                    past_projects: pastProjects || undefined,
                    differentiators: differentiators || undefined,
                    brand: brand ? {
                        primary_color: primaryColor,
                        logo_url: brand.logo_url,
                        company_name: brand.company_name,
                        description: brand.description,
                        services: brand.services,
                        past_clients: brand.past_clients,
                        project_portfolio: brand.project_portfolio,
                    } : { primary_color: primaryColor },
                }),
            });

            if (!res.ok || !res.body) {
                alert("Generation failed: " + res.statusText);
                setGenerating(false);
                return;
            }

            // Parse SSE stream
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });

                let idx: number;
                while ((idx = buffer.indexOf("\n\n")) !== -1) {
                    const raw = buffer.slice(0, idx);
                    buffer = buffer.slice(idx + 2);
                    const lines = raw.split("\n");
                    let event = "message";
                    let data = "";
                    for (const line of lines) {
                        if (line.startsWith("event:")) event = line.slice(6).trim();
                        else if (line.startsWith("data:")) data += line.slice(5).trim();
                    }
                    if (!data) continue;
                    let payload: any;
                    try { payload = JSON.parse(data); } catch { continue; }

                    if (event === "meta") {
                        setMetadata(payload.metadata);
                        const initial: SectionState[] = Array.from({ length: payload.sections_total }).map((_, i) => ({
                            title: "", content: "", status: i === 0 ? "running" : "pending",
                        }));
                        setSections(initial);
                    } else if (event === "section_start") {
                        setSections(prev => {
                            const next = [...prev];
                            next[payload.index] = { ...(next[payload.index] || {}), title: payload.title, content: "", status: "running", key: payload.key };
                            return next;
                        });
                    } else if (event === "section_done") {
                        setSections(prev => {
                            const next = [...prev];
                            next[payload.index] = {
                                title: payload.title,
                                content: payload.content,
                                status: "done",
                                key: payload.key,
                                word_count: payload.word_count,
                            };
                            return next;
                        });
                    } else if (event === "done") {
                        setCollapseInputs(true);
                    } else if (event === "error") {
                        alert("Generation error: " + payload.message);
                    }
                }
            }
        } catch (e) {
            alert("Generation failed: " + (e as Error).message);
        } finally {
            setGenerating(false);
            setStartedAt(null);
        }
    };

    const downloadPdf = async () => {
        if (!metadata || sections.length === 0) return;
        setDownloadingPdf(true);
        try {
            const meta: CapMetadata = { ...metadata, primary_color: primaryColor, logo_url: brand?.logo_url || metadata.logo_url };
            const cleanSections: CapSection[] = sections
                .filter(s => s.status === "done" && s.content)
                .map(s => ({ title: s.title, content: htmlToText(s.content), key: s.key }));
            const blob = await buildCapabilityPdf(cleanSections, meta);
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${(metadata.company_name || "capability-statement").replace(/[^a-z0-9]+/gi, "-")}-capability-statement.pdf`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (e) {
            alert("PDF build failed: " + (e as Error).message);
        } finally {
            setDownloadingPdf(false);
        }
    };

    const saveToDrive = async () => {
        setSavingToDrive(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const providerToken = (session as any)?.provider_token;
            if (!providerToken) {
                alert(
                    "Google Drive access not granted.\n\n" +
                    "To save to Drive, you need to re-authenticate with Drive permission.\n" +
                    "Admins: enable the 'https://www.googleapis.com/auth/drive.file' scope in your Supabase Google OAuth provider " +
                    "and have the user sign in again.\n\n" +
                    "For now, use Download PDF."
                );
                return;
            }
            // Build PDF
            const meta: CapMetadata = { ...(metadata || {}), primary_color: primaryColor, logo_url: brand?.logo_url || metadata?.logo_url };
            const cleanSections: CapSection[] = sections
                .filter(s => s.status === "done" && s.content)
                .map(s => ({ title: s.title, content: htmlToText(s.content), key: s.key }));
            const blob = await buildCapabilityPdf(cleanSections, meta);

            const name = `${(metadata?.company_name || "capability-statement").replace(/[^a-z0-9]+/gi, "-")}-capability-statement.pdf`;
            const metadataPart = JSON.stringify({ name, mimeType: "application/pdf" });
            const boundary = "----capturepilot" + Math.random().toString(36).slice(2);
            const bodyParts = [
                `--${boundary}`,
                "Content-Type: application/json; charset=UTF-8",
                "",
                metadataPart,
                `--${boundary}`,
                "Content-Type: application/pdf",
                "Content-Transfer-Encoding: base64",
                "",
                await blobToBase64(blob),
                `--${boundary}--`,
                "",
            ].join("\r\n");

            const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${providerToken}`,
                    "Content-Type": `multipart/related; boundary=${boundary}`,
                },
                body: bodyParts,
            });
            if (!res.ok) {
                const err = await res.text();
                throw new Error(`Drive upload failed: ${res.status} ${err.slice(0, 300)}`);
            }
            const data = await res.json();
            setToast({ type: "success", msg: `Saved to Google Drive (file ${String(data.id).slice(0, 8)}…)` });
            void data;
        } catch (e) {
            setToast({ type: "error", msg: "Google Drive save failed: " + (e as Error).message.slice(0, 120) });
        } finally {
            setSavingToDrive(false);
        }
    };

    if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-stone-400" /></div>;

    const doneCount = sections.filter(s => s.status === "done").length;
    const totalCount = sections.length;
    const progressPct = totalCount > 0 ? (doneCount / totalCount) * 100 : 0;
    const estTotal = 45; // ~ seconds expected per full run
    const remaining = generating ? Math.max(0, Math.floor(estTotal * (1 - progressPct / 100))) : 0;

    const hasResult = sections.length > 0 && sections.some(s => s.status === "done");

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            {toast && (
                <div
                    role="status"
                    className={clsx(
                        "fixed top-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2 animate-in slide-in-from-top-2 duration-300",
                        toast.type === "success" ? "bg-emerald-600 text-white" : "bg-rose-600 text-white",
                    )}
                >
                    {toast.msg}
                </div>
            )}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <FileText className="w-6 h-6" /> Capability Statement Builder
                    </h1>
                    <p className="text-sm text-stone-500 mt-1">
                        Build a federal-grade Capability Statement with your brand colors and logo.
                    </p>
                </div>
                {collapseInputs && (
                    <button type="button" onClick={() => setCollapseInputs(false)}
                        className="text-xs px-3 py-1.5 rounded-lg border border-stone-200 hover:bg-stone-50">
                        Edit inputs
                    </button>
                )}
            </div>

            <div className={clsx("grid gap-6", collapseInputs ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-5")}>
                {/* LEFT COLUMN — INPUTS */}
                {!collapseInputs && (
                    <div className="lg:col-span-2 space-y-5">
                        {/* Step 1: Brand Kit */}
                        <div className="bg-white border border-stone-200 rounded-2xl p-5">
                            <h2 className="font-bold text-sm flex items-center gap-2 mb-3">
                                <Palette className="w-4 h-4 text-stone-400" /> Step 1: Brand & Website Data
                            </h2>
                            <div className="flex gap-3 items-end">
                                <div className="flex-1">
                                    <label className="text-[10px] text-stone-400 uppercase block mb-1">Website</label>
                                    <input value={website} onChange={e => setWebsite(e.target.value)} placeholder="yourcompany.com"
                                        className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm" />
                                </div>
                                <button type="button" onClick={extractBrand} disabled={brandLoading || !website}
                                    className="bg-black text-white px-4 py-2 rounded-xl text-sm font-bold inline-flex items-center gap-1.5 disabled:opacity-50 h-[38px]">
                                    {brandLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
                                    {brandLoading ? "Crawling..." : "Extract"}
                                </button>
                            </div>
                            <p className="text-[11px] text-stone-400 mt-2">
                                Uses the Quick Checker crawler — pulls logo, palette, description, services, past clients, and project portfolio.
                            </p>

                            {brand && (
                                <div className="mt-4 space-y-3">
                                    <div className="flex items-center gap-4 flex-wrap">
                                        {brand.logo_url && (
                                            <img src={brand.logo_url} alt="Logo" className="h-12 w-auto rounded border border-stone-200 bg-white p-1" />
                                        )}
                                        <div className="flex gap-2 flex-wrap">
                                            {(brand.all_colors || []).slice(0, 6).map((c, i) => (
                                                <button key={i} type="button" onClick={() => setPrimaryColor(c)}
                                                    className={clsx("w-8 h-8 rounded-lg border-2 transition-all",
                                                        primaryColor === c ? "border-black scale-110" : "border-stone-200"
                                                    )} style={{ backgroundColor: c }} title={c} />
                                            ))}
                                            <input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} title="Custom"
                                                className="w-8 h-8 rounded-lg border border-stone-200 cursor-pointer" />
                                        </div>
                                        <span className="text-xs font-mono text-stone-400">{primaryColor}</span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 text-[11px] text-stone-600">
                                        {brand.company_name && <p><span className="text-stone-400">Name:</span> {brand.company_name}</p>}
                                        {brand.services && brand.services.length > 0 && <p><span className="text-stone-400">Services:</span> {brand.services.length} detected</p>}
                                        {brand.past_clients && brand.past_clients.length > 0 && <p><span className="text-stone-400">Past clients:</span> {brand.past_clients.length}</p>}
                                        {brand.project_portfolio && brand.project_portfolio.length > 0 && <p><span className="text-stone-400">Projects:</span> {brand.project_portfolio.length}</p>}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Step 2: Voice / transcript */}
                        <div className="bg-white border border-stone-200 rounded-2xl p-5 space-y-4">
                            <h2 className="font-bold text-sm flex items-center gap-2">
                                <Mic className="w-4 h-4 text-stone-400" /> Step 2: Tell Us About Your Business
                            </h2>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <button type="button" onClick={toggleRecording} disabled={!recognition}
                                    className={clsx("py-3 rounded-xl text-sm font-bold inline-flex flex-col items-center justify-center gap-1 transition-all border",
                                        isRecording ? "bg-red-500 text-white border-red-500 animate-pulse" : "bg-stone-50 text-stone-700 hover:bg-stone-100 border-stone-200"
                                    )}>
                                    {isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                                    <span className="text-xs">{isRecording ? "Stop" : "Record"}</span>
                                </button>
                                <button type="button" onClick={() => {
                                    const text = prompt("Paste your transcript or notes here:");
                                    if (text) setTranscript(prev => (prev ? prev + "\n\n" : "") + text);
                                }} className="py-3 rounded-xl text-sm font-bold inline-flex flex-col items-center justify-center gap-1 bg-stone-50 text-stone-700 hover:bg-stone-100 border border-stone-200">
                                    <FileText className="w-5 h-5" />
                                    <span className="text-xs">Paste</span>
                                </button>
                                <label className="py-3 rounded-xl text-sm font-bold inline-flex flex-col items-center justify-center gap-1 bg-stone-50 text-stone-700 hover:bg-stone-100 border border-stone-200 cursor-pointer">
                                    <Upload className="w-5 h-5" />
                                    <span className="text-xs">Upload Audio</span>
                                    <input type="file" accept="audio/*" className="hidden" onChange={async (e) => {
                                        const file = e.target.files?.[0];
                                        if (!file) return;
                                        alert("Audio transcription requires server config. Please paste the transcript text instead.");
                                    }} />
                                </label>
                            </div>
                            <textarea value={transcript} onChange={e => setTranscript(e.target.value)}
                                placeholder="Your company description, capabilities, past projects, and differentiators. Website crawl fills this automatically — feel free to add more."
                                className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm h-32 resize-none" />
                        </div>

                        {/* Step 3: Extras */}
                        <div className="bg-white border border-stone-200 rounded-2xl p-5 space-y-3">
                            <h2 className="font-bold text-sm flex items-center gap-2">
                                <FileText className="w-4 h-4 text-stone-400" /> Step 3: Additional Details
                            </h2>
                            <div>
                                <label className="text-[10px] text-stone-400 uppercase block mb-1">Past Projects</label>
                                <textarea value={pastProjects} onChange={e => setPastProjects(e.target.value)}
                                    placeholder="2-3 relevant projects: client, scope, value, results..."
                                    className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm h-24 resize-none" />
                            </div>
                            <div>
                                <label className="text-[10px] text-stone-400 uppercase block mb-1">Differentiators</label>
                                <textarea value={differentiators} onChange={e => setDifferentiators(e.target.value)}
                                    placeholder="Special equipment, certifications, response time, safety record..."
                                    className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm h-20 resize-none" />
                            </div>
                        </div>

                        {/* Generate button */}
                        <button type="button" onClick={generateStatement} disabled={generating || !profileId}
                            className="w-full bg-black text-white py-4 rounded-2xl text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-stone-800 transition-colors">
                            {generating
                                ? <><Loader2 className="w-5 h-5 animate-spin" /> Drafting… {doneCount}/{totalCount}</>
                                : <><Sparkles className="w-5 h-5" /> Generate Capability Statement</>}
                        </button>
                    </div>
                )}

                {/* RIGHT COLUMN — LIVE PREVIEW */}
                <div className={clsx(collapseInputs ? "" : "lg:col-span-3", "space-y-4")}>
                    {/* Progress tracker */}
                    {(generating || sections.length > 0) && (
                        <div className="bg-white border border-stone-200 rounded-2xl p-5">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-sm font-bold">Drafting progress</h3>
                                <div className="text-[11px] text-stone-500">
                                    {generating ? (
                                        <>~{remaining}s remaining · {elapsed}s elapsed</>
                                    ) : (
                                        <>{doneCount}/{totalCount} sections complete</>
                                    )}
                                </div>
                            </div>
                            <div className="w-full h-2 bg-stone-100 rounded-full overflow-hidden">
                                <div className="h-full transition-all duration-300"
                                    style={{ width: `${progressPct}%`, backgroundColor: primaryColor }} />
                            </div>
                            <ul className="mt-3 space-y-1.5 text-xs">
                                {sections.map((s, i) => (
                                    <li key={i} className="flex items-center gap-2">
                                        {s.status === "done" && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                                        {s.status === "running" && <Loader2 className="w-3.5 h-3.5 animate-spin text-stone-400" />}
                                        {s.status === "pending" && <Circle className="w-3.5 h-3.5 text-stone-300" />}
                                        {s.status === "error" && <span className="text-red-500">✕</span>}
                                        <span className={clsx(
                                            s.status === "done" ? "text-stone-700" : "text-stone-400",
                                            s.status === "running" && "font-semibold text-stone-900"
                                        )}>
                                            {s.title || `Section ${i + 1}`}
                                        </span>
                                        {s.word_count ? <span className="text-stone-300 ml-auto">{s.word_count} words</span> : null}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Live preview / editor */}
                    {hasResult && metadata && (
                        <>
                            <div className="flex items-center justify-between gap-3 flex-wrap">
                                <h2 className="font-bold text-lg">Preview</h2>
                                <div className="flex items-center gap-2">
                                    <button type="button" onClick={downloadPdf} disabled={downloadingPdf}
                                        className="bg-black text-white px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50">
                                        {downloadingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                                        Download PDF
                                    </button>
                                    <button type="button" onClick={saveToDrive} disabled={savingToDrive}
                                        className="border border-stone-200 px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 hover:bg-stone-50 disabled:opacity-50">
                                        {savingToDrive ? <Loader2 className="w-4 h-4 animate-spin" /> : <HardDrive className="w-4 h-4" />}
                                        Save to Drive
                                    </button>
                                </div>
                            </div>

                            {/* Preview card with brand colors */}
                            <div className="bg-white border-2 rounded-2xl overflow-hidden shadow-sm" style={{ borderColor: primaryColor }}>
                                <div className="px-6 py-5 text-white flex items-center gap-3" style={{ backgroundColor: primaryColor }}>
                                    {brand?.logo_url && (
                                        <img src={brand.logo_url} alt="Logo" className="h-10 w-auto rounded bg-white/20 p-1" />
                                    )}
                                    <div>
                                        <h3 className="font-bold text-lg leading-tight">{metadata.company_name || ""}</h3>
                                        <p className="text-xs opacity-80 uppercase tracking-wider">Capability Statement</p>
                                    </div>
                                </div>

                                <div className="p-6 space-y-5">
                                    {sections.filter(s => s.status === "done").map((sec, i) => (
                                        <div key={i}>
                                            <h4 className="font-bold text-xs uppercase tracking-wide mb-2" style={{ color: primaryColor }}>
                                                {sec.title}
                                            </h4>
                                            <CapabilityEditor
                                                content={toHtmlFromText(sec.content)}
                                                onChange={(html) => {
                                                    setSections(prev => {
                                                        const next = [...prev];
                                                        const idx = prev.findIndex(p => p === sec);
                                                        if (idx >= 0) next[idx] = { ...next[idx], content: html };
                                                        return next;
                                                    });
                                                }}
                                                sectionTitle={sec.title}
                                            />
                                        </div>
                                    ))}

                                    <div className="border-t pt-4 mt-4 grid grid-cols-2 gap-2 text-xs text-stone-600">
                                        {metadata.contact && <p><span className="text-stone-400">Contact:</span> {metadata.contact}</p>}
                                        {metadata.phone && <p><span className="text-stone-400">Phone:</span> {metadata.phone}</p>}
                                        {metadata.email && <p><span className="text-stone-400">Email:</span> {metadata.email}</p>}
                                        {metadata.website && <p><span className="text-stone-400">Web:</span> {metadata.website}</p>}
                                        {metadata.uei && <p><span className="text-stone-400">UEI:</span> {metadata.uei}</p>}
                                        {metadata.cage_code && <p><span className="text-stone-400">CAGE:</span> {metadata.cage_code}</p>}
                                    </div>
                                </div>
                            </div>
                        </>
                    )}

                    {!hasResult && !generating && (
                        <div className="bg-stone-50 border border-dashed border-stone-200 rounded-2xl p-10 text-center text-sm text-stone-400">
                            Your Capability Statement preview will appear here once you click Generate.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── helpers ──────────────────────────────────────────────────────────
function htmlToText(html: string): string {
    if (!html) return "";
    // Convert <li> items to "- " bullets, preserve paragraph breaks
    const div = document.createElement("div");
    div.innerHTML = html;

    const walk = (node: Node): string => {
        let out = "";
        node.childNodes.forEach(child => {
            if (child.nodeType === Node.TEXT_NODE) {
                out += child.textContent || "";
            } else if (child.nodeType === Node.ELEMENT_NODE) {
                const el = child as HTMLElement;
                const tag = el.tagName.toLowerCase();
                if (tag === "li") {
                    out += "- " + walk(el).trim() + "\n";
                } else if (tag === "p" || tag === "div") {
                    out += walk(el).trim() + "\n\n";
                } else if (tag === "br") {
                    out += "\n";
                } else if (tag === "h1" || tag === "h2" || tag === "h3") {
                    out += walk(el).trim() + "\n";
                } else {
                    out += walk(el);
                }
            }
        });
        return out;
    };

    return walk(div).replace(/\n{3,}/g, "\n\n").trim();
}

function toHtmlFromText(text: string): string {
    if (!text) return "";
    // Already HTML? Detect <p> or <ul>.
    if (/<[a-z][\s\S]*>/i.test(text)) return text;

    const paragraphs = text.split(/\n\s*\n/);
    return paragraphs.map(p => {
        const trimmed = p.trim();
        if (!trimmed) return "";
        const lines = trimmed.split(/\r?\n/);
        const bulletLines = lines.every(l => /^\s*[-•*]\s/.test(l));
        if (bulletLines) {
            const items = lines.map(l => `<li>${escapeHtml(l.replace(/^\s*[-•*]\s+/, ""))}</li>`).join("");
            return `<ul>${items}</ul>`;
        }
        return `<p>${escapeHtml(trimmed).replace(/\n/g, "<br/>")}</p>`;
    }).join("");
}

function escapeHtml(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function blobToBase64(blob: Blob): Promise<string> {
    const buf = await blob.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
}
