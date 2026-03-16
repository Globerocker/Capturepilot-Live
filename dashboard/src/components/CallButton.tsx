"use client";

import { useState, useRef, useEffect } from "react";
import { Phone, Mic, MicOff, Save, Loader2, Clock, FileText } from "lucide-react";
import clsx from "clsx";
import { createSupabaseClient } from "@/lib/supabase/client";

const supabase = createSupabaseClient();

interface CallButtonProps {
    opportunityId: string;
    contactPhone?: string;
    contactName?: string;
}

export default function CallButton({ opportunityId, contactPhone, contactName }: CallButtonProps) {
    const [isRecording, setIsRecording] = useState(false);
    const [transcription, setTranscription] = useState("");
    const [notes, setNotes] = useState("");
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [seconds, setSeconds] = useState(0);
    const [showPanel, setShowPanel] = useState(false);
    const [speechSupported, setSpeechSupported] = useState(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognitionRef = useRef<any>(null);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        const SR = (window as unknown as Record<string, unknown>).SpeechRecognition || (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
        setSpeechSupported(!!SR);
    }, []);

    const startRecording = () => {
        const SR = (window as unknown as Record<string, unknown>).SpeechRecognition || (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
        if (!SR) return;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const recognition = new (SR as any)();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = "en-US";

        let finalTranscript = transcription;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        recognition.onresult = (event: any) => {
            let interim = "";
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    finalTranscript += transcript + " ";
                } else {
                    interim = transcript;
                }
            }
            setTranscription(finalTranscript + (interim ? `[...${interim}]` : ""));
        };

        recognition.onerror = () => {
            setIsRecording(false);
            if (timerRef.current) clearInterval(timerRef.current);
        };

        recognition.onend = () => {
            setTranscription(finalTranscript);
            setIsRecording(false);
            if (timerRef.current) clearInterval(timerRef.current);
        };

        recognition.start();
        recognitionRef.current = recognition;
        setIsRecording(true);
        setShowPanel(true);

        // Start timer
        setSeconds(0);
        timerRef.current = setInterval(() => {
            setSeconds(s => s + 1);
        }, 1000);
    };

    const stopRecording = () => {
        recognitionRef.current?.stop();
        setIsRecording(false);
        if (timerRef.current) clearInterval(timerRef.current);
    };

    const saveCallLog = async () => {
        setSaving(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setSaving(false); return; }

        const { data: profile } = await supabase
            .from("user_profiles")
            .select("id")
            .eq("auth_user_id", user.id)
            .single();

        if (!profile) { setSaving(false); return; }

        await supabase.from("call_logs").insert({
            user_profile_id: (profile as Record<string, unknown>).id,
            opportunity_id: opportunityId,
            contact_name: contactName || null,
            contact_phone: contactPhone || null,
            transcription: transcription || null,
            notes: notes || null,
            duration_seconds: seconds,
        });

        setSaving(false);
        setSaved(true);
    };

    const formatTime = (s: number) => {
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return `${m}:${sec.toString().padStart(2, "0")}`;
    };

    return (
        <div className="bg-gradient-to-br from-emerald-50 to-white rounded-2xl sm:rounded-3xl border border-emerald-200 overflow-hidden">
            <div className="p-4 sm:p-6">
                <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
                        <Phone className="w-4 h-4 text-emerald-600" />
                    </div>
                    <div className="flex-1">
                        <p className="font-typewriter font-bold text-sm text-stone-900 mb-1">
                            Call & Transcribe
                        </p>
                        <p className="text-xs text-emerald-700 leading-relaxed mb-3">
                            {contactName ? `Call ${contactName}` : "Call the contracting officer"} and record notes with live transcription.
                        </p>

                        <div className="flex flex-wrap gap-2">
                            {contactPhone && (
                                <a
                                    href={`tel:${contactPhone}`}
                                    className="inline-flex items-center bg-emerald-600 text-white font-typewriter font-bold px-4 py-2 rounded-full text-xs hover:bg-emerald-700 transition-all"
                                >
                                    <Phone className="w-3 h-3 mr-1.5" />
                                    Call {contactPhone}
                                </a>
                            )}

                            {speechSupported && !isRecording && (
                                <button
                                    type="button"
                                    onClick={startRecording}
                                    className="inline-flex items-center bg-black text-white font-typewriter font-bold px-4 py-2 rounded-full text-xs hover:bg-stone-800 transition-all"
                                >
                                    <Mic className="w-3 h-3 mr-1.5" />
                                    Start Transcription
                                </button>
                            )}

                            {isRecording && (
                                <button
                                    type="button"
                                    onClick={stopRecording}
                                    className="inline-flex items-center bg-red-600 text-white font-typewriter font-bold px-4 py-2 rounded-full text-xs hover:bg-red-700 transition-all animate-pulse"
                                >
                                    <MicOff className="w-3 h-3 mr-1.5" />
                                    Stop ({formatTime(seconds)})
                                </button>
                            )}

                            {!speechSupported && (
                                <button
                                    type="button"
                                    onClick={() => setShowPanel(!showPanel)}
                                    className="inline-flex items-center bg-stone-100 text-stone-700 font-typewriter font-bold px-4 py-2 rounded-full text-xs hover:bg-stone-200 transition-all border border-stone-200"
                                >
                                    <FileText className="w-3 h-3 mr-1.5" />
                                    Add Notes
                                </button>
                            )}
                        </div>

                        {!speechSupported && (
                            <p className="text-[10px] text-stone-400 mt-2">Transcription available in Chrome/Edge.</p>
                        )}
                    </div>
                </div>
            </div>

            {/* Transcription + Notes Panel */}
            {showPanel && (
                <div className="border-t border-emerald-100 p-4 sm:p-6 space-y-3 bg-white">
                    {isRecording && (
                        <div className="flex items-center gap-2 text-xs text-red-600 font-typewriter font-bold">
                            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                            Recording... <Clock className="w-3 h-3 ml-1" /> {formatTime(seconds)}
                        </div>
                    )}

                    {transcription && (
                        <div>
                            <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-1">Transcription</p>
                            <div className="text-sm text-stone-700 bg-stone-50 rounded-xl p-3 border border-stone-100 max-h-32 overflow-y-auto whitespace-pre-wrap">
                                {transcription}
                            </div>
                        </div>
                    )}

                    <div>
                        <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-1">Notes</p>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Add your call notes here..."
                            className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black resize-none h-20"
                        />
                    </div>

                    {!saved ? (
                        <button
                            type="button"
                            onClick={saveCallLog}
                            disabled={saving || (!transcription && !notes)}
                            className="inline-flex items-center bg-black text-white font-typewriter font-bold px-4 py-2 rounded-full text-xs hover:bg-stone-800 transition-all disabled:opacity-50"
                        >
                            {saving ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <Save className="w-3 h-3 mr-1.5" />}
                            {saving ? "Saving..." : "Save Call Log"}
                        </button>
                    ) : (
                        <p className="text-xs font-typewriter text-emerald-600 font-bold">Call log saved successfully.</p>
                    )}
                </div>
            )}
        </div>
    );
}
