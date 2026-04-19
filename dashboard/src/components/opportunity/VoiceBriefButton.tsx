"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Volume2, Loader2, Square, Play } from "lucide-react";
import clsx from "clsx";

interface VoiceBriefButtonProps {
    noticeId: string;
    title?: string | null;
}

type Status = "idle" | "recording" | "uploading" | "playing" | "error";

export default function VoiceBriefButton({ noticeId, title }: VoiceBriefButtonProps) {
    const [status, setStatus] = useState<Status>("idle");
    const [transcript, setTranscript] = useState<string>("");
    const [narration, setNarration] = useState<string>("");
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // Clean up blob URLs when they rotate
    useEffect(() => {
        return () => {
            if (audioUrl) URL.revokeObjectURL(audioUrl);
        };
    }, [audioUrl]);

    async function startRecording() {
        setError(null);
        setTranscript("");
        setNarration("");
        if (audioUrl) {
            URL.revokeObjectURL(audioUrl);
            setAudioUrl(null);
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
                ? "audio/webm;codecs=opus"
                : "audio/webm";
            const recorder = new MediaRecorder(stream, { mimeType: mime });
            chunksRef.current = [];
            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunksRef.current.push(e.data);
            };
            recorder.onstop = async () => {
                stream.getTracks().forEach((t) => t.stop());
                const blob = new Blob(chunksRef.current, { type: mime });
                await uploadAudio(blob);
            };
            recorder.start();
            mediaRecorderRef.current = recorder;
            setStatus("recording");
        } catch (e) {
            const msg = e instanceof Error ? e.message : "Microphone access denied";
            setError(msg);
            setStatus("error");
        }
    }

    function stopRecording() {
        const rec = mediaRecorderRef.current;
        if (rec && rec.state !== "inactive") {
            rec.stop();
        }
    }

    async function uploadAudio(blob: Blob) {
        setStatus("uploading");
        try {
            const form = new FormData();
            form.append("audio", blob, "speech.webm");
            // Hint the server with the opportunity context so it prefers this notice_id
            // over the keyword fallback.
            form.append("hint_notice_id", noticeId);

            const res = await fetch("/api/ai/voice-brief", {
                method: "POST",
                body: form,
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error || `HTTP ${res.status}`);
            }

            const ct = res.headers.get("Content-Type") || "";
            if (ct.includes("audio")) {
                const audioBlob = await res.blob();
                const url = URL.createObjectURL(audioBlob);
                setAudioUrl(url);
                setTranscript(decodeURIComponent(res.headers.get("X-Transcript") || ""));
                setNarration(decodeURIComponent(res.headers.get("X-Narration") || ""));
                setStatus("playing");
                // auto-play
                setTimeout(() => audioRef.current?.play().catch(() => { /* ignore autoplay block */ }), 100);
            } else {
                // JSON (tts=0)
                const data = await res.json();
                setTranscript(data.transcript || "");
                setNarration(data.narration || "");
                setStatus("idle");
            }
        } catch (e) {
            const msg = e instanceof Error ? e.message : "Upload failed";
            setError(msg);
            setStatus("error");
        }
    }

    async function fallbackText() {
        const q =
            title
                ? `Brief me on "${title}".`
                : "Brief me on this opportunity.";
        setStatus("uploading");
        setError(null);
        try {
            const res = await fetch("/api/ai/voice-brief", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: q, hint_notice_id: noticeId }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error || `HTTP ${res.status}`);
            }
            const ct = res.headers.get("Content-Type") || "";
            if (ct.includes("audio")) {
                const audioBlob = await res.blob();
                const url = URL.createObjectURL(audioBlob);
                setAudioUrl(url);
                setTranscript(decodeURIComponent(res.headers.get("X-Transcript") || q));
                setNarration(decodeURIComponent(res.headers.get("X-Narration") || ""));
                setStatus("playing");
                setTimeout(() => audioRef.current?.play().catch(() => { /* ignore */ }), 100);
            } else {
                const data = await res.json();
                setTranscript(data.transcript || q);
                setNarration(data.narration || "");
                setStatus("idle");
            }
        } catch (e) {
            const msg = e instanceof Error ? e.message : "Request failed";
            setError(msg);
            setStatus("error");
        }
    }

    const isBusy = status === "uploading" || status === "recording";

    return (
        <div className="bg-white border border-stone-200 rounded-2xl p-5">
            <div className="flex items-start gap-3 mb-3">
                <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Mic className="w-5 h-5 text-emerald-600" />
                </div>
                <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-stone-900">Voice Brief</h3>
                    <p className="text-xs text-stone-500 leading-relaxed mt-0.5">
                        Hold the mic, say what you want to know, release. CapturePilot transcribes, generates a capture
                        brief, and reads back a 150-word summary. Perfect for driving between meetings.
                    </p>
                </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
                {status !== "recording" ? (
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
                        {status === "uploading" ? (
                            <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                Thinking...
                            </>
                        ) : (
                            <>
                                <Mic className="w-3.5 h-3.5" />
                                Hold to record
                            </>
                        )}
                    </button>
                ) : (
                    <button
                        type="button"
                        onMouseUp={stopRecording}
                        onTouchEnd={stopRecording}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-red-500 text-white rounded-full text-xs font-bold animate-pulse"
                    >
                        <Square className="w-3.5 h-3.5 fill-white" />
                        Release to send
                    </button>
                )}

                <button
                    type="button"
                    onClick={fallbackText}
                    disabled={isBusy}
                    className="text-xs text-stone-500 underline underline-offset-2 hover:text-stone-700 disabled:opacity-50"
                >
                    or just brief me
                </button>

                {audioUrl && (
                    <button
                        type="button"
                        onClick={() => audioRef.current?.play()}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-stone-100 text-stone-700 rounded-full text-xs font-bold hover:bg-stone-200"
                    >
                        <Play className="w-3 h-3" />
                        Replay
                    </button>
                )}
            </div>

            {audioUrl && (
                <audio
                    ref={audioRef}
                    src={audioUrl}
                    controls
                    className="w-full mt-4 h-10"
                />
            )}

            {transcript && (
                <div className="mt-4 grid sm:grid-cols-2 gap-3">
                    <Transcript label="You said" content={transcript} icon={<MicOff className="w-3 h-3" />} />
                    {narration && (
                        <Transcript label="CapturePilot" content={narration} icon={<Volume2 className="w-3 h-3" />} />
                    )}
                </div>
            )}

            {error && (
                <p className="mt-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    {error}
                </p>
            )}
        </div>
    );
}

function Transcript({
    label,
    content,
    icon,
}: {
    label: string;
    content: string;
    icon: React.ReactNode;
}) {
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
