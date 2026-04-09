// @ts-nocheck
"use client";

import { useEffect, useState } from "react";
import { createSupabaseClient } from "@/lib/supabase/client";
import {
    Mic, MicOff, Loader2, FileText, Palette, Download, Sparkles,
    CheckCircle2, Globe, ChevronDown,
} from "lucide-react";
import clsx from "clsx";

const supabase = createSupabaseClient();

export default function CapabilityStatementPage() {
    const [profileId, setProfileId] = useState("");
    const [website, setWebsite] = useState("");
    const [loading, setLoading] = useState(true);

    // Voice
    const [isRecording, setIsRecording] = useState(false);
    const [transcript, setTranscript] = useState("");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [recognition, setRecognition] = useState<any>(null);

    // Inputs
    const [pastProjects, setPastProjects] = useState("");
    const [differentiators, setDifferentiators] = useState("");

    // Brand
    const [brandLoading, setBrandLoading] = useState(false);
    const [brand, setBrand] = useState<Record<string, unknown> | null>(null);
    const [primaryColor, setPrimaryColor] = useState("#000000");

    // Result
    const [generating, setGenerating] = useState(false);
    const [result, setResult] = useState<Record<string, unknown> | null>(null);

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

        // Init Speech Recognition
        if (typeof window !== "undefined") {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const w = window as any;
            const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
            if (SR) {
                const rec = new SR();
                rec.continuous = true;
                rec.interimResults = true;
                rec.lang = "en-US";
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                rec.onresult = (e: any) => {
                    let text = "";
                    for (let i = 0; i < e.results.length; i++) {
                        text += e.results[i][0].transcript;
                    }
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
        if (isRecording) {
            recognition.stop();
            setIsRecording(false);
        } else {
            setTranscript("");
            recognition.start();
            setIsRecording(true);
        }
    };

    const extractBrand = async () => {
        if (!website) return;
        setBrandLoading(true);
        const res = await fetch("/api/brand", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ website, user_profile_id: profileId }),
        });
        const data = await res.json();
        if (data.success) {
            setBrand(data.brand);
            setPrimaryColor(String((data.brand.colors as Record<string, string>)?.primary || "#000000"));
        }
        setBrandLoading(false);
    };

    const generateStatement = async () => {
        if (!profileId) return;
        setGenerating(true);
        const res = await fetch("/api/ai/capability-statement", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                user_profile_id: profileId,
                voice_transcript: transcript || undefined,
                past_projects: pastProjects || undefined,
                differentiators: differentiators || undefined,
                brand: brand ? { primary_color: primaryColor, logo_url: (brand as Record<string, unknown>).logo_url, company_name: (brand as Record<string, unknown>).company_name } : undefined,
            }),
        });
        const data = await res.json();
        if (data.success) setResult(data);
        setGenerating(false);
    };

    if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-stone-400" /></div>;

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    <FileText className="w-6 h-6" /> Capability Statement Builder
                </h1>
                <p className="text-sm text-stone-500 mt-1">
                    Create a professional capability statement for government contracting officers.
                    Use voice or text to describe your business.
                </p>
            </div>

            {/* Step 1: Brand Kit */}
            <div className="bg-white border border-stone-200 rounded-2xl p-5">
                <h2 className="font-bold text-sm flex items-center gap-2 mb-3">
                    <Palette className="w-4 h-4 text-stone-400" /> Step 1: Brand Colors & Logo
                </h2>
                <div className="flex gap-3 items-end">
                    <div className="flex-1">
                        <label className="text-[10px] text-stone-400 uppercase block mb-1">Website</label>
                        <input value={website} onChange={e => setWebsite(e.target.value)} placeholder="yourcompany.com"
                            className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm" />
                    </div>
                    <button type="button" onClick={extractBrand} disabled={brandLoading || !website}
                        className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-bold inline-flex items-center gap-1.5 disabled:opacity-50 hover:bg-emerald-700 transition-all duration-200 h-[38px]">
                        {brandLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
                        {brandLoading ? "Extracting..." : "Extract Brand"}
                    </button>
                </div>

                {brand && (
                    <div className="mt-4 flex items-center gap-4">
                        {(brand as Record<string, unknown>).logo_url && (
                            <img src={String((brand as Record<string, unknown>).logo_url)} alt="Logo" className="h-12 w-auto rounded border border-stone-200" />
                        )}
                        <div className="flex gap-2">
                            {((brand as Record<string, unknown>).all_colors as string[] || []).slice(0, 5).map((c, i) => (
                                <button key={i} type="button" onClick={() => setPrimaryColor(c)}
                                    className={clsx("w-8 h-8 rounded-lg border-2 transition-all",
                                        primaryColor === c ? "border-black scale-110" : "border-stone-200"
                                    )} style={{ backgroundColor: c }} title={c} />
                            ))}
                            <input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} title="Custom color"
                                className="w-8 h-8 rounded-lg border border-stone-200 cursor-pointer" />
                        </div>
                        <span className="text-xs font-mono text-stone-400">{primaryColor}</span>
                    </div>
                )}
            </div>

            {/* Step 2: Company Information Input */}
            <div className="bg-white border border-stone-200 rounded-2xl p-5 space-y-4">
                <h2 className="font-bold text-sm flex items-center gap-2">
                    <Mic className="w-4 h-4 text-stone-400" /> Step 2: Tell Us About Your Business
                </h2>
                <p className="text-xs text-stone-500">
                    Choose how to provide information: record yourself talking, paste a transcript from a discovery call, or upload an MP3 recording.
                </p>

                {/* Three input methods */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* Option A: Voice Record */}
                    <button type="button" onClick={toggleRecording} disabled={!recognition}
                        className={clsx("py-4 rounded-xl text-sm font-bold inline-flex flex-col items-center justify-center gap-2 transition-all border",
                            isRecording ? "bg-red-500 text-white border-red-500 animate-pulse" : "bg-stone-50 text-stone-700 hover:bg-stone-100 border-stone-200"
                        )}>
                        {isRecording ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                        {isRecording ? "Stop Recording" : "Record Now"}
                        <span className="text-[10px] font-normal opacity-70">Talk about your company</span>
                    </button>

                    {/* Option B: Paste Transcript */}
                    <button type="button" onClick={() => {
                        const text = prompt("Paste your call transcript or notes here:");
                        if (text) setTranscript(prev => (prev ? prev + "\n\n" : "") + text);
                    }}
                        className="py-4 rounded-xl text-sm font-bold inline-flex flex-col items-center justify-center gap-2 bg-stone-50 text-stone-700 hover:bg-stone-100 border border-stone-200 transition-all">
                        <FileText className="w-6 h-6" />
                        Paste Transcript
                        <span className="text-[10px] font-normal opacity-70">From a discovery call</span>
                    </button>

                    {/* Option C: Upload MP3 */}
                    <label className="py-4 rounded-xl text-sm font-bold inline-flex flex-col items-center justify-center gap-2 bg-stone-50 text-stone-700 hover:bg-stone-100 border border-stone-200 transition-all cursor-pointer">
                        <Download className="w-6 h-6" />
                        Upload Audio
                        <span className="text-[10px] font-normal opacity-70">MP3, WAV, M4A</span>
                        <input type="file" accept="audio/*,.mp3,.wav,.m4a" className="hidden" onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            // Use OpenAI Whisper for transcription
                            const formData = new FormData();
                            formData.append("file", file);
                            formData.append("model", "whisper-1");
                            formData.append("language", "en");
                            try {
                                const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
                                    method: "POST",
                                    headers: { "Authorization": `Bearer ${process.env.NEXT_PUBLIC_OPENAI_API_KEY || ""}` },
                                    body: formData,
                                });
                                if (res.ok) {
                                    const data = await res.json();
                                    setTranscript(prev => (prev ? prev + "\n\n" : "") + data.text);
                                } else {
                                    // Fallback: if no client-side key, send to our API
                                    alert("Audio uploaded. For transcription, paste the transcript text instead or use the record button.");
                                }
                            } catch {
                                alert("Audio transcription requires OpenAI API. Please paste the transcript as text instead.");
                            }
                        }} />
                    </label>
                </div>

                {/* Transcript display */}
                <div>
                    <label className="text-[10px] text-stone-400 uppercase block mb-1">
                        Transcript / Notes {transcript ? `(${transcript.split(/\s+/).length} words)` : ""}
                    </label>
                    <textarea value={transcript} onChange={e => setTranscript(e.target.value)}
                        placeholder="Your company description, capabilities, past projects, and differentiators will appear here. You can also type or paste directly..."
                        className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm h-40 resize-none" />
                </div>
            </div>

            {/* Step 3: Additional Details */}
            <div className="bg-white border border-stone-200 rounded-2xl p-5 space-y-3">
                <h2 className="font-bold text-sm flex items-center gap-2 mb-1">
                    <FileText className="w-4 h-4 text-stone-400" /> Step 3: Additional Details (Optional)
                </h2>
                <div>
                    <label className="text-[10px] text-stone-400 uppercase block mb-1">Past Projects & Performance</label>
                    <textarea value={pastProjects} onChange={e => setPastProjects(e.target.value)}
                        placeholder="Describe 2-3 relevant projects you've completed. Include: client, scope, value, results..."
                        className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm h-24 resize-none" />
                </div>
                <div>
                    <label className="text-[10px] text-stone-400 uppercase block mb-1">What Makes You Different?</label>
                    <textarea value={differentiators} onChange={e => setDifferentiators(e.target.value)}
                        placeholder="What sets you apart? Special equipment, certifications, response time, quality, safety record..."
                        className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm h-20 resize-none" />
                </div>
            </div>

            {/* Generate Button */}
            <button type="button" onClick={generateStatement} disabled={generating || !profileId}
                className="w-full bg-emerald-600 text-white py-4 rounded-2xl text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-emerald-700 transition-all duration-200">
                {generating ? <><Loader2 className="w-5 h-5 animate-spin" /> Generating Your Capability Statement...</> : <><Sparkles className="w-5 h-5" /> Generate Capability Statement</>}
            </button>

            {/* Result */}
            {result && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="font-bold text-lg">Your Capability Statement</h2>
                        <span className="text-xs text-stone-400">{result.total_words} words</span>
                    </div>

                    {/* Preview with brand color accent */}
                    <div className="bg-white border-2 rounded-2xl overflow-hidden" style={{ borderColor: primaryColor }}>
                        {/* Header bar */}
                        <div className="px-6 py-4 text-white" style={{ backgroundColor: primaryColor }}>
                            <div className="flex items-center gap-3">
                                {brand && (brand as Record<string, unknown>).logo_url && (
                                    <img src={String((brand as Record<string, unknown>).logo_url)} alt="Logo" className="h-10 w-auto rounded bg-white/20 p-1" />
                                )}
                                <div>
                                    <h3 className="font-bold text-lg">{String((result.metadata as Record<string, unknown>)?.company_name || "")}</h3>
                                    <p className="text-xs opacity-80">Capability Statement</p>
                                </div>
                            </div>
                        </div>

                        {/* Sections */}
                        <div className="p-6 space-y-5">
                            {(result.sections as Array<{ title: string; content: string }>)?.map((sec, i) => (
                                <div key={i}>
                                    <h4 className="font-bold text-sm uppercase tracking-wide mb-2" style={{ color: primaryColor }}>{sec.title}</h4>
                                    <div className="text-sm text-stone-700 leading-relaxed whitespace-pre-wrap">{sec.content}</div>
                                </div>
                            ))}

                            {/* Contact Footer */}
                            <div className="border-t pt-4 mt-4 grid grid-cols-2 gap-2 text-xs text-stone-600">
                                {(result.metadata as Record<string, unknown>)?.contact && <p>Contact: {String((result.metadata as Record<string, unknown>).contact)}</p>}
                                {(result.metadata as Record<string, unknown>)?.phone && <p>Phone: {String((result.metadata as Record<string, unknown>).phone)}</p>}
                                {(result.metadata as Record<string, unknown>)?.email && <p>Email: {String((result.metadata as Record<string, unknown>).email)}</p>}
                                {(result.metadata as Record<string, unknown>)?.website && <p>Web: {String((result.metadata as Record<string, unknown>).website)}</p>}
                                {(result.metadata as Record<string, unknown>)?.uei && <p>UEI: {String((result.metadata as Record<string, unknown>).uei)}</p>}
                                {(result.metadata as Record<string, unknown>)?.cage_code && <p>CAGE: {String((result.metadata as Record<string, unknown>).cage_code)}</p>}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
