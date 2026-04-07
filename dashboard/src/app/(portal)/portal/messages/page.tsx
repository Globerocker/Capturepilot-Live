"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { createBrowserClient } from "@supabase/ssr";
import {
    MessageSquare, Send, Loader2, CheckCheck, Check,
    Clock, Sparkles, HelpCircle, RefreshCw, ArrowDown,
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
                                                {msg.message}
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
                <div className="flex items-end gap-3">
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
                        {sending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Send className="w-4 h-4" />
                        )}
                    </button>
                </div>
                <p className="text-[10px] text-stone-400 mt-2 text-center">
                    Press Enter to send, Shift+Enter for new line
                </p>
            </div>
        </div>
    );
}
