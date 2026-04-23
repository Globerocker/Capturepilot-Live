"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Volume2, Loader2, Square, Play } from "lucide-react";
import clsx from "clsx";
import LiveJobProgress, { type Job } from "@/components/jobs/LiveJobProgress";

interface VoiceBriefButtonProps {
    noticeId: string;
    title?: string | null;
}

type LocalStatus = "idle" | "recording" | "uploading" | "error";

export default function VoiceBriefButton({ noticeId, title }: VoiceBriefButtonProps) {
    const [local, setLocal] = useState<LocalStatus>("idle");
    const [jobId, setJobId] = useState<string | null>(null);
    const [finishedJob, setFinishedJob] = useState<Job | null>(null);
    const [err, setErr] = useState<string | null>(null);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    async function startRecording() {
        setErr(null);
        setJobId(null);
        setFinishedJob(null);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
            const rec = new MediaRecorder(stream, { mimeType: mime });
            chunksRef.current = [];
            rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
            rec.onstop = async () => {
                stream.getTracks().forEach((t) => t.stop());
                const blob = new Blob(chunksRef.current, { type: mime });
                await upload(blob);
            };
            rec.start();
            mediaRecorderRef.current = rec;
            setLocal("recording");
        } catch (e) {
            setErr((e as Error).message);
            setLocal("error");
        }
    }

    function stopRecording() {
        const rec = mediaRecorderRef.current;
        if (rec && rec.state !== "inactive") rec.stop();
    }

    async function upload(blob: Blob) {
        setLocal("uploading");
        try {
            const form = new FormData();
            form.append("audio", blob, "speech.webm");
            form.append("hint_notice_id", noticeId);
            const res = await fetch("/api/ai/voice-brief", { method: "POST", body: form });
            const data = await res.json();
            if (!res.ok || !data.jobId) throw new Error(data.error || `HTTP ${res.status}`);
            setJobId(data.jobId);
            setLocal("idle");
        } catch (e) {
            setErr((e as Error).message);
            setLocal("error");
        }
    }

    async function textFallback() {
        setErr(null);
        setJobId(null);
        setFinishedJob(null);
        setLocal("uploading");
        try {
            const q = title ? `Brief me on "${title}".` : "Brief me on this opportunity.";
            const res = await fetch("/api/ai/voice-brief", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: q, hint_notice_id: noticeId }),
            });
            const data = await res.json();
            if (!res.ok || !data.jobId) throw new Error(data.error || `HTTP ${res.status}`);
            setJobId(data.jobId);
            setLocal("idle");
        } catch (e) {
            setErr((e as Error).message);
            setLocal("error");
        }
    }

    const handleComplete = (job: Job) => {
        setFinishedJob(job);
    };

    const result = finishedJob?.result as {
        transcript?: string;
        narration?: string;
        audio_url?: string;
        pwin?: number | null;
    } | null;

    useEffect(() => {
        // Auto-play when audio URL lands
        if (result?.audio_url && audioRef.current) {
            audioRef.current.src = result.audio_url;
            audioRef.current.play().catch(() => { /* autoplay blocked */ });
        }
    }, [result?.audio_url]);

    const isBusy = local === "uploading" || local === "recording" || (!!jobId && !finishedJob);

    return (
        <div className="bg-white border border-stone-200 rounded-2xl p-5">
            <div className="flex items-start gap-3 mb-3">
                <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Mic className="w-5 h-5 text-emerald-600" />
                </div>
                <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-stone-900">Voice Brief</h3>
                    <p className="text-xs text-stone-500 leading-relaxed mt-0.5">
                        Hold the mic, say what you want to know, release. Transcribes, generates a capture brief,
                        reads back a ~150-word summary. Runs in the background — switch tabs if you want.
                    </p>
                </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
                {local !== "recording" ? (
                    <button
                        type="button"
                        onMouseDown={startRecording}
                        onTouchStart={startRecording}
                        onMouseUp={stopRecording}
                        onTouchEnd={stopRecording}
                        disabled={isBusy}
                        className={clsx(
                            "inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold transition-all",
                            isBusy
                                ? "bg-stone-200 text-stone-500 cursor-not-allowed"
                                : "bg-emerald-600 text-white hover:bg-emerald-700 active:scale-95",
                        )}
                    >
                        {local === "uploading" ? (
                            <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading…</>
                        ) : (
                            <><Mic className="w-3.5 h-3.5" /> Hold to record</>
                        )}
                    </button>
                ) : (
                    <button
                        type="button"
                        onMouseUp={stopRecording}
                        onTouchEnd={stopRecording}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-red-500 text-white rounded-full text-xs font-bold animate-pulse"
                    >
                        <Square className="w-3.5 h-3.5 fill-white" /> Release to send
                    </button>
                )}

                <button
                    type="button"
                    onClick={textFallback}
                    disabled={isBusy}
                    className="text-xs text-stone-500 underline underline-offset-2 hover:text-stone-700 disabled:opacity-50"
                >
                    or just brief me
                </button>

                {result?.audio_url && (
                    <button
                        type="button"
                        onClick={() => audioRef.current?.play()}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-stone-100 text-stone-700 rounded-full text-xs font-bold hover:bg-stone-200"
                    >
                        <Play className="w-3 h-3" /> Replay
                    </button>
                )}
            </div>

            {jobId && !finishedJob && (
                <LiveJobProgress
                    jobId={jobId}
                    onComplete={handleComplete}
                    onFail={(j) => { setErr(j.error || "Voice brief failed"); setJobId(null); }}
                    className="mt-4"
                />
            )}

            {result?.audio_url && (
                <audio ref={audioRef} controls className="w-full mt-4 h-10" />
            )}

            {result && (result.transcript || result.narration) && (
                <div className="mt-4 grid sm:grid-cols-2 gap-3">
                    {result.transcript && (
                        <Transcript label="You said" content={result.transcript} icon={<MicOff className="w-3 h-3" />} />
                    )}
                    {result.narration && (
                        <Transcript label="CapturePilot" content={result.narration} icon={<Volume2 className="w-3 h-3" />} />
                    )}
                </div>
            )}

            {err && (
                <p className="mt-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    {err}
                </p>
            )}
        </div>
    );
}

function Transcript({ label, content, icon }: { label: string; content: string; icon: React.ReactNode }) {
    return (
        <div className="bg-stone-50 border border-stone-200 rounded-xl p-3">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-stone-500 font-bold mb-1.5">
                {icon}
                {label}
            </div>
            <p className="text-xs text-stone-800 leading-relaxed whitespace-pre-wrap">{content}</p>
        </div>
    );
}
