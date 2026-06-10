"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { createBrowserClient } from "@supabase/ssr";
import {
    MessageSquare, Send, Loader2, CheckCheck, Check,
    Clock, Sparkles, HelpCircle, RefreshCw, ArrowDown,
    Mic, MicOff, Paperclip,
} from "lucide-react";
import clsx from "clsx";

const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Message {
    id: string;
    user_profile_id: string;
    sender_type: "client" | "admin";
    sender_name: string | null;
    message: string;
    read_at: string | null;
    opportunity_id: string | null;
    created_at: string;
}

interface UserProfile {
    id: string;
    contact_name: string | null;
    company_name: string | null;
}

const QUICK_MESSAGES = [
    { icon: HelpCircle, text: "I have a question about an opportunity" },
    { icon: RefreshCw, text: "Can you update my pipeline?" },
    { icon: Sparkles, text: "I need help with a proposal" },
];

function formatTimestamp(iso: string): string {
    const date = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    });
}

function formatDateSeparator(iso: string): string {
    const date = new Date(iso);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();

    if (isToday) return "Today";
    if (isYesterday) return "Yesterday";
    return date.toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
    });
}

function shouldShowDateSeparator(messages: Message[], index: number): boolean {
    if (index === 0) return true;
    const prev = new Date(messages[index - 1].created_at).toDateString();
    const curr = new Date(messages[index].created_at).toDateString();
    return prev !== curr;
}

export default function PortalMessagesPage() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [draft, setDraft] = useState("");
    const [showScrollBtn, setShowScrollBtn] = useState(false);
    const [recording, setRecording] = useState(false);
    const [uploading, setUploading] = useState(false);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Voice-to-text via Web Speech API
    const toggleRecording = () => {
        if (recording) {
            setRecording(false);
            if ((window as unknown as Record<string, unknown>)._recognition) {
                ((window as unknown as Record<string, unknown>)._recognition as { stop: () => void }).stop();
            }
            return;
        }
        const SpeechRecognition = (window as unknown as Record<string, unknown>).SpeechRecognition || (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
        if (!SpeechRecognition) {
            alert("Speech recognition is not supported in this browser. Try Chrome.");
            return;
        }
        const recognition = new (SpeechRecognition as new () => {
            continuous: boolean; interimResults: boolean; lang: string;
            onresult: (e: { results: { transcript: string }[][] }) => void;
            onerror: () => void; onend: () => void; start: () => void; stop: () => void;
        })();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = "en-US";
        recognition.onresult = (e) => {
            const transcript = Array.from(e.results).map((r) => r[0].transcript).join("");
            setDraft(transcript);
        };
        recognition.onerror = () => setRecording(false);
        recognition.onend = () => setRecording(false);
        (window as unknown as Record<string, unknown>)._recognition = recognition;
        recognition.start();
        setRecording(true);
    };

    // File upload — attaches a Supabase Storage path token to the message.
    // The bucket is private, so we embed a `storage://` reference and resolve
    // it to a short-lived signed URL when the user clicks the link.
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !profile) return;
        setUploading(true);
        const ext = file.name.split(".").pop();
        const path = `messages/${profile.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("client-docs").upload(path, file);
        if (upErr) {
            alert("Upload failed: " + upErr.message);
            setUploading(false);
            e.target.value = "";
            return;
        }
        const msg = `📎 [${file.name}](storage://${path})`;
        await handleSend(msg);
        setUploading(false);
        e.target.value = "";
    };

    // Resolve `storage://<path>` references inside a message to short-lived
    // signed URLs and open in a new tab.
    const openStorageRef = useCallback(async (storagePath: string) => {
        try {
            const res = await fetch(`/api/documents/signed-url?path=${encodeURIComponent(storagePath)}`);
            if (!res.ok) {
                alert("Could not open attachment. Please try again.");
                return;
            }
            const { url } = await res.json();
            if (url) window.open(url, "_blank", "noopener,noreferrer");
        } catch {
            alert("Could not open attachment. Please try again.");
        }
    }, []);

    // Render a message body that may contain markdown-style attachment links
    // like `📎 [name.pdf](storage://path/to/file.pdf)` — turn each into a
    // click handler that mints a signed URL on demand.
    const renderMessageBody = (text: string) => {
        const parts: React.ReactNode[] = [];
        const re = /\[([^\]]+)\]\(storage:\/\/([^)]+)\)/g;
        let lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = re.exec(text))) {
            if (m.index > lastIndex) parts.push(text.slice(lastIndex, m.index));
            const label = m[1];
            const path = m[2];
            parts.push(
                <button
                    key={`${m.index}-${path}`}
                    type="button"
                    onClick={() => openStorageRef(path)}
                    className="underline hover:no-underline font-medium"
                >
                    {label}
                </button>
            );
            lastIndex = re.lastIndex;
        }
        if (lastIndex < text.length) parts.push(text.slice(lastIndex));
        return parts.length > 0 ? parts : text;
    };

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const unreadCount = messages.filter(
        (m) => m.sender_type === "admin" && !m.read_at
    ).length;

    const scrollToBottom = useCallback((smooth = true) => {
        messagesEndRef.current?.scrollIntoView({
            behavior: smooth ? "smooth" : "instant",
        });
    }, []);

    const fetchMessages = useCallback(async (profileId: string) => {
        const { data } = await supabase
            .from("client_messages")
            .select("*")
            .eq("user_profile_id", profileId)
            .order("created_at", { ascending: true });

        if (data) {
            setMessages(data as Message[]);
        }
    }, []);

    const markAdminMessagesRead = useCallback(async (profileId: string) => {
        await supabase
            .from("client_messages")
            .update({ read_at: new Date().toISOString() })
            .eq("user_profile_id", profileId)
            .eq("sender_type", "admin")
            .is("read_at", null);
    }, []);

    // Initial load
    useEffect(() => {
        (async () => {
            const {
                data: { user },
            } = await supabase.auth.getUser();
            if (!user) {
                window.location.href = "/login";
                return;
            }

            const { data: prof } = await supabase
                .from("user_profiles")
                .select("id, contact_name, company_name")
                .eq("auth_user_id", user.id)
                .single();

            if (prof) {
                setProfile(prof as UserProfile);
                await fetchMessages(prof.id);
                await markAdminMessagesRead(prof.id);
            }

            setLoading(false);
        })();
    }, [fetchMessages, markAdminMessagesRead]);

    // Scroll to bottom on initial load & new messages
    useEffect(() => {
        if (!loading && messages.length > 0) {
            scrollToBottom(false);
        }
    }, [loading, messages.length, scrollToBottom]);

    // Poll every 5 seconds
    useEffect(() => {
        if (!profile) return;

        pollRef.current = setInterval(async () => {
            await fetchMessages(profile.id);
            await markAdminMessagesRead(profile.id);
        }, 5000);

        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
        };
    }, [profile, fetchMessages, markAdminMessagesRead]);

    // Scroll visibility
    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container) return;

        const handleScroll = () => {
            const { scrollTop, scrollHeight, clientHeight } = container;
            setShowScrollBtn(scrollHeight - scrollTop - clientHeight > 100);
        };

        container.addEventListener("scroll", handleScroll);
        return () => container.removeEventListener("scroll", handleScroll);
    }, []);

    // Auto-resize textarea
    useEffect(() => {
        const ta = textareaRef.current;
        if (ta) {
            ta.style.height = "auto";
            ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
        }
    }, [draft]);

    const handleSend = async (text?: string) => {
        const msg = (text || draft).trim();
        if (!msg || !profile || sending) return;

        setSending(true);
        setDraft("");

        const newMsg: Partial<Message> = {
            user_profile_id: profile.id,
            sender_type: "client",
            sender_name: profile.contact_name || profile.company_name || "Client",
            message: msg,
        };

        const { error } = await supabase
            .from("client_messages")
            .insert(newMsg);

        if (!error) {
            await fetchMessages(profile.id);
            scrollToBottom(true);
        }

        setSending(false);
        textareaRef.current?.focus();
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <Loader2 className="w-8 h-8 text-stone-300 animate-spin" />
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto flex flex-col h-[calc(100vh-4rem)]">
            {/* Header */}
            <div className="flex-shrink-0 pb-4 border-b border-stone-200 mb-0">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
                            <MessageSquare className="w-5 h-5 text-emerald-600" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-stone-900 tracking-tight">
                                Messages
                            </h1>
                            <p className="text-sm text-stone-500">
                                Chat with your CapturePilot team
                            </p>
                        </div>
                    </div>
                    {unreadCount > 0 && (
                        <span className="bg-emerald-500 text-white text-xs font-bold px-2.5 py-1 rounded-full">
                            {unreadCount} new
                        </span>
                    )}
                </div>
            </div>

            {/* Messages Area */}
            <div
                ref={scrollContainerRef}
                className="flex-1 overflow-y-auto py-6 space-y-1 relative scroll-smooth"
            >
                {messages.length === 0 ? (
                    /* Empty State */
                    <div className="flex flex-col items-center justify-center h-full text-center px-4">
                        <div className="w-16 h-16 bg-stone-100 rounded-2xl flex items-center justify-center mb-4">
                            <MessageSquare className="w-8 h-8 text-stone-300" />
                        </div>
                        <h2 className="text-lg font-semibold text-stone-700 mb-1">
                            Start a conversation
                        </h2>
                        <p className="text-sm text-stone-400 mb-8 max-w-sm">
                            Send a message to your capture team. We typically respond
                            within a few hours during business days.
                        </p>

                        <div className="grid gap-3 w-full max-w-md">
                            {QUICK_MESSAGES.map((qm) => (
                                <button
                                    key={qm.text}
                                    type="button"
                                    onClick={() => { setDraft(qm.text); textareaRef.current?.focus(); }}
                                    className="flex items-center gap-3 px-4 py-3 bg-white border border-stone-200 rounded-xl text-sm text-stone-600 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 transition-all text-left group"
                                >
                                    <qm.icon className="w-4 h-4 text-stone-400 group-hover:text-emerald-500 transition-colors flex-shrink-0" />
                                    {qm.text}
                                </button>
                            ))}
                        </div>
                    </div>
                ) : (
                    /* Message List */
                    <>
                        {messages.map((msg, idx) => {
                            const isClient = msg.sender_type === "client";
                            const showDate = shouldShowDateSeparator(messages, idx);

                            return (
                                <div key={msg.id}>
                                    {showDate && (
                                        <div className="flex items-center justify-center my-4">
                                            <div className="bg-stone-100 text-stone-500 text-xs font-medium px-3 py-1 rounded-full">
                                                {formatDateSeparator(msg.created_at)}
                                            </div>
                                        </div>
                                    )}

                                    <div
                                        className={clsx(
                                            "flex mb-3",
                                            isClient ? "justify-end" : "justify-start"
                                        )}
                                    >
                                        <div
                                            className={clsx(
                                                "max-w-[75%] group"
                                            )}
                                        >
                                            {/* Sender name */}
                                            <p
                                                className={clsx(
                                                    "text-[11px] font-medium mb-1 px-1",
                                                    isClient
                                                        ? "text-right text-stone-400"
                                                        : "text-left text-stone-500"
                                                )}
                                            >
                                                {isClient
                                                    ? "You"
                                                    : msg.sender_name || "CapturePilot Team"}
                                            </p>

                                            {/* Bubble */}
                                            <div
                                                className={clsx(
                                                    "px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words",
                                                    isClient
                                                        ? "bg-emerald-600 text-white rounded-br-md"
                                                        : "bg-white border border-stone-200 text-stone-800 rounded-bl-md shadow-sm"
                                                )}
                                            >
                                                {renderMessageBody(msg.message)}
                                            </div>

                                            {/* Timestamp + read status */}
                                            <div
                                                className={clsx(
                                                    "flex items-center gap-1.5 mt-1 px-1",
                                                    isClient ? "justify-end" : "justify-start"
                                                )}
                                            >
                                                <span className="text-[10px] text-stone-400">
                                                    {formatTimestamp(msg.created_at)}
                                                </span>
                                                {isClient && (
                                                    msg.read_at ? (
                                                        <CheckCheck className="w-3 h-3 text-emerald-500" />
                                                    ) : (
                                                        <Check className="w-3 h-3 text-stone-300" />
                                                    )
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                        <div ref={messagesEndRef} />
                    </>
                )}

                {/* Scroll to bottom FAB */}
                {showScrollBtn && (
                    <button
                        type="button"
                        onClick={() => scrollToBottom(true)}
                        className="sticky bottom-2 left-1/2 -translate-x-1/2 bg-white border border-stone-200 shadow-lg rounded-full p-2 hover:bg-stone-50 transition-colors z-10"
                    >
                        <ArrowDown className="w-4 h-4 text-stone-500" />
                    </button>
                )}
            </div>

            {/* Input Area */}
            <div className="flex-shrink-0 border-t border-stone-200 bg-white rounded-b-2xl pt-4 pb-2">
                {recording && (
                    <div className="flex items-center gap-2 px-3 py-2 mb-2 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600">
                        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                        Recording... speak now. Click mic again to stop.
                    </div>
                )}
                <div className="flex items-end gap-2">
                    {/* Attachment */}
                    <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.txt,.csv" aria-label="Attach file" title="Attach file" />
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-stone-400 hover:text-stone-600 hover:bg-stone-100 transition-colors"
                        title="Attach file"
                    >
                        {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
                    </button>
                    {/* Mic */}
                    <button
                        type="button"
                        onClick={toggleRecording}
                        className={clsx(
                            "flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-colors",
                            recording
                                ? "bg-red-100 text-red-600 hover:bg-red-200"
                                : "text-stone-400 hover:text-stone-600 hover:bg-stone-100"
                        )}
                        title={recording ? "Stop recording" : "Voice input"}
                    >
                        {recording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                    </button>
                    {/* Text input */}
                    <div className="flex-1 relative">
                        <textarea
                            ref={textareaRef}
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Type a message..."
                            rows={1}
                            className="w-full resize-none rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-all"
                        />
                    </div>
                    {/* Send */}
                    <button
                        type="button"
                        onClick={() => handleSend()}
                        disabled={!draft.trim() || sending}
                        className={clsx(
                            "flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center transition-all",
                            draft.trim() && !sending
                                ? "bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm"
                                : "bg-stone-100 text-stone-300 cursor-not-allowed"
                        )}
                    >
                        {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </button>
                </div>
                <p className="text-[10px] text-stone-400 mt-2 text-center">
                    Enter to send · Shift+Enter for new line · 🎤 Voice · 📎 Attach
                </p>
            </div>
        </div>
    );
}
