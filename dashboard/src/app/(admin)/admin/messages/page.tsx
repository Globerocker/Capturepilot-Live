"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { createBrowserClient } from "@supabase/ssr";
import {
    MessageSquare, Send, Loader2, CheckCheck, Check,
    Inbox, Search, Users, Clock, ArrowDown,
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

interface ClientThread {
    profileId: string;
    companyName: string;
    fullName: string;
    lastMessage: string;
    lastMessageAt: string;
    unreadCount: number;
}

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

export default function AdminMessagesPage() {
    const [threads, setThreads] = useState<ClientThread[]>([]);
    const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMessages, setLoadingMessages] = useState(false);
    const [sending, setSending] = useState(false);
    const [draft, setDraft] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [showScrollBtn, setShowScrollBtn] = useState(false);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const totalUnread = threads.reduce((sum, t) => sum + t.unreadCount, 0);

    const scrollToBottom = useCallback((smooth = true) => {
        messagesEndRef.current?.scrollIntoView({
            behavior: smooth ? "smooth" : "instant",
        });
    }, []);

    const fetchThreads = useCallback(async () => {
        // Get all messages grouped by user_profile_id
        const { data: allMessages } = await supabase
            .from("client_messages")
            .select("*, user_profiles:user_profile_id(id, full_name, company_name)")
            .order("created_at", { ascending: false });

        if (!allMessages) return;

        const threadMap = new Map<string, ClientThread>();

        for (const msg of allMessages as any[]) {
            const pid = msg.user_profile_id;
            if (!threadMap.has(pid)) {
                const prof = msg.user_profiles || {};
                threadMap.set(pid, {
                    profileId: pid,
                    companyName: prof.company_name || "Unknown Company",
                    fullName: prof.full_name || "Unknown",
                    lastMessage: msg.message,
                    lastMessageAt: msg.created_at,
                    unreadCount: 0,
                });
            }
            if (msg.sender_type === "client" && !msg.read_at) {
                const thread = threadMap.get(pid)!;
                thread.unreadCount += 1;
            }
        }

        const sorted = Array.from(threadMap.values()).sort(
            (a, b) =>
                new Date(b.lastMessageAt).getTime() -
                new Date(a.lastMessageAt).getTime()
        );

        setThreads(sorted);
    }, []);

    const fetchConversation = useCallback(async (profileId: string) => {
        setLoadingMessages(true);
        const { data } = await supabase
            .from("client_messages")
            .select("*")
            .eq("user_profile_id", profileId)
            .order("created_at", { ascending: true });

        if (data) {
            setMessages(data as Message[]);
        }
        setLoadingMessages(false);
    }, []);

    const markClientMessagesRead = useCallback(async (profileId: string) => {
        await supabase
            .from("client_messages")
            .update({ read_at: new Date().toISOString() })
            .eq("user_profile_id", profileId)
            .eq("sender_type", "client")
            .is("read_at", null);
    }, []);

    const selectThread = useCallback(
        async (profileId: string) => {
            setSelectedProfileId(profileId);
            setDraft("");
            await fetchConversation(profileId);
            await markClientMessagesRead(profileId);
            // Update thread unread count locally
            setThreads((prev) =>
                prev.map((t) =>
                    t.profileId === profileId ? { ...t, unreadCount: 0 } : t
                )
            );
        },
        [fetchConversation, markClientMessagesRead]
    );

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
            await fetchThreads();
            setLoading(false);
        })();
    }, [fetchThreads]);

    // Scroll to bottom when messages load or change
    useEffect(() => {
        if (!loadingMessages && messages.length > 0) {
            scrollToBottom(false);
        }
    }, [loadingMessages, messages.length, scrollToBottom]);

    // Poll every 5 seconds
    useEffect(() => {
        pollRef.current = setInterval(async () => {
            await fetchThreads();
            if (selectedProfileId) {
                await fetchConversation(selectedProfileId);
                await markClientMessagesRead(selectedProfileId);
            }
        }, 5000);

        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
        };
    }, [selectedProfileId, fetchThreads, fetchConversation, markClientMessagesRead]);

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
    }, [selectedProfileId]);

    // Auto-resize textarea
    useEffect(() => {
        const ta = textareaRef.current;
        if (ta) {
            ta.style.height = "auto";
            ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
        }
    }, [draft]);

    const handleSend = async () => {
        const msg = draft.trim();
        if (!msg || !selectedProfileId || sending) return;

        setSending(true);
        setDraft("");

        const { error } = await supabase.from("client_messages").insert({
            user_profile_id: selectedProfileId,
            sender_type: "admin",
            sender_name: "CapturePilot Team",
            message: msg,
        });

        if (!error) {
            await fetchConversation(selectedProfileId);
            await fetchThreads();
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

    const filteredThreads = searchQuery
        ? threads.filter(
              (t) =>
                  t.companyName
                      .toLowerCase()
                      .includes(searchQuery.toLowerCase()) ||
                  t.fullName
                      .toLowerCase()
                      .includes(searchQuery.toLowerCase())
          )
        : threads;

    const selectedThread = threads.find(
        (t) => t.profileId === selectedProfileId
    );

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <Loader2 className="w-8 h-8 text-stone-300 animate-spin" />
            </div>
        );
    }

    return (
        <div className="h-[calc(100vh-4rem)]">
            {/* Page Header */}
            <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-stone-800 rounded-xl flex items-center justify-center">
                    <MessageSquare className="w-5 h-5 text-white" />
                </div>
                <div>
                    <h1 className="text-xl font-bold text-stone-900 tracking-tight">
                        Messages
                    </h1>
                    <p className="text-sm text-stone-500">
                        {totalUnread > 0
                            ? `${totalUnread} unread message${totalUnread > 1 ? "s" : ""}`
                            : "All caught up"}
                    </p>
                </div>
            </div>

            {/* Main Split Layout */}
            <div className="flex bg-white border border-stone-200 rounded-2xl overflow-hidden h-[calc(100%-4.5rem)] shadow-sm">
                {/* Left: Client List */}
                <div className="w-80 border-r border-stone-200 flex flex-col flex-shrink-0">
                    {/* Search */}
                    <div className="p-3 border-b border-stone-100">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                            <input
                                type="text"
                                placeholder="Search clients..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-9 pr-3 py-2 text-sm bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-300/50 focus:border-stone-300 placeholder:text-stone-400"
                            />
                        </div>
                    </div>

                    {/* Thread List */}
                    <div className="flex-1 overflow-y-auto">
                        {filteredThreads.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-center px-4">
                                <Inbox className="w-8 h-8 text-stone-200 mb-2" />
                                <p className="text-sm text-stone-400">
                                    {searchQuery
                                        ? "No matching clients"
                                        : "No conversations yet"}
                                </p>
                            </div>
                        ) : (
                            filteredThreads.map((thread) => (
                                <button
                                    key={thread.profileId}
                                    type="button"
                                    onClick={() => selectThread(thread.profileId)}
                                    className={clsx(
                                        "w-full text-left px-4 py-3 border-b border-stone-50 transition-colors hover:bg-stone-50",
                                        selectedProfileId === thread.profileId &&
                                            "bg-stone-100 hover:bg-stone-100"
                                    )}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                                <p
                                                    className={clsx(
                                                        "text-sm truncate",
                                                        thread.unreadCount > 0
                                                            ? "font-bold text-stone-900"
                                                            : "font-medium text-stone-700"
                                                    )}
                                                >
                                                    {thread.companyName}
                                                </p>
                                            </div>
                                            <p className="text-xs text-stone-500 truncate mt-0.5">
                                                {thread.fullName}
                                            </p>
                                            <p
                                                className={clsx(
                                                    "text-xs truncate mt-1",
                                                    thread.unreadCount > 0
                                                        ? "text-stone-700 font-medium"
                                                        : "text-stone-400"
                                                )}
                                            >
                                                {thread.lastMessage}
                                            </p>
                                        </div>
                                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                            <span className="text-[10px] text-stone-400 whitespace-nowrap">
                                                {formatTimestamp(thread.lastMessageAt)}
                                            </span>
                                            {thread.unreadCount > 0 && (
                                                <span className="bg-emerald-500 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                                                    {thread.unreadCount}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </button>
                            ))
                        )}
                    </div>

                    {/* Thread Count */}
                    <div className="p-3 border-t border-stone-100 bg-stone-50">
                        <p className="text-[11px] text-stone-400 text-center">
                            <Users className="w-3 h-3 inline mr-1" />
                            {threads.length} client{threads.length !== 1 ? "s" : ""}
                        </p>
                    </div>
                </div>

                {/* Right: Conversation */}
                <div className="flex-1 flex flex-col min-w-0">
                    {!selectedProfileId ? (
                        /* No thread selected */
                        <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
                            <div className="w-16 h-16 bg-stone-100 rounded-2xl flex items-center justify-center mb-4">
                                <MessageSquare className="w-8 h-8 text-stone-300" />
                            </div>
                            <h2 className="text-lg font-semibold text-stone-700 mb-1">
                                Select a conversation
                            </h2>
                            <p className="text-sm text-stone-400 max-w-sm">
                                Choose a client from the left to view and reply to their
                                messages.
                            </p>
                        </div>
                    ) : (
                        <>
                            {/* Conversation Header */}
                            <div className="flex items-center gap-3 px-5 py-3 border-b border-stone-200 bg-stone-50/50 flex-shrink-0">
                                <div className="w-9 h-9 bg-stone-200 rounded-full flex items-center justify-center">
                                    <span className="text-sm font-bold text-stone-600">
                                        {selectedThread?.companyName?.charAt(0) || "?"}
                                    </span>
                                </div>
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold text-stone-900 truncate">
                                        {selectedThread?.companyName}
                                    </p>
                                    <p className="text-xs text-stone-500 truncate">
                                        {selectedThread?.fullName}
                                    </p>
                                </div>
                            </div>

                            {/* Messages */}
                            <div
                                ref={scrollContainerRef}
                                className="flex-1 overflow-y-auto px-5 py-4 space-y-1 relative"
                            >
                                {loadingMessages ? (
                                    <div className="flex items-center justify-center h-full">
                                        <Loader2 className="w-6 h-6 text-stone-300 animate-spin" />
                                    </div>
                                ) : messages.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-full text-center">
                                        <p className="text-sm text-stone-400">
                                            No messages yet. Send the first message.
                                        </p>
                                    </div>
                                ) : (
                                    <>
                                        {messages.map((msg, idx) => {
                                            const isAdmin =
                                                msg.sender_type === "admin";
                                            const showDate =
                                                shouldShowDateSeparator(
                                                    messages,
                                                    idx
                                                );

                                            return (
                                                <div key={msg.id}>
                                                    {showDate && (
                                                        <div className="flex items-center justify-center my-4">
                                                            <div className="bg-stone-100 text-stone-500 text-xs font-medium px-3 py-1 rounded-full">
                                                                {formatDateSeparator(
                                                                    msg.created_at
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}

                                                    <div
                                                        className={clsx(
                                                            "flex mb-3",
                                                            isAdmin
                                                                ? "justify-end"
                                                                : "justify-start"
                                                        )}
                                                    >
                                                        <div className="max-w-[70%]">
                                                            {/* Sender */}
                                                            <p
                                                                className={clsx(
                                                                    "text-[11px] font-medium mb-1 px-1",
                                                                    isAdmin
                                                                        ? "text-right text-stone-400"
                                                                        : "text-left text-stone-500"
                                                                )}
                                                            >
                                                                {isAdmin
                                                                    ? "You (Admin)"
                                                                    : msg.sender_name ||
                                                                      "Client"}
                                                            </p>

                                                            {/* Bubble */}
                                                            <div
                                                                className={clsx(
                                                                    "px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words",
                                                                    isAdmin
                                                                        ? "bg-stone-900 text-white rounded-br-md"
                                                                        : "bg-white border border-stone-200 text-stone-800 rounded-bl-md shadow-sm"
                                                                )}
                                                            >
                                                                {msg.message}
                                                            </div>

                                                            {/* Timestamp + read */}
                                                            <div
                                                                className={clsx(
                                                                    "flex items-center gap-1.5 mt-1 px-1",
                                                                    isAdmin
                                                                        ? "justify-end"
                                                                        : "justify-start"
                                                                )}
                                                            >
                                                                <span className="text-[10px] text-stone-400">
                                                                    {formatTimestamp(
                                                                        msg.created_at
                                                                    )}
                                                                </span>
                                                                {isAdmin &&
                                                                    (msg.read_at ? (
                                                                        <CheckCheck className="w-3 h-3 text-emerald-500" />
                                                                    ) : (
                                                                        <Check className="w-3 h-3 text-stone-300" />
                                                                    ))}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                        <div ref={messagesEndRef} />
                                    </>
                                )}

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

                            {/* Reply Input */}
                            <div className="border-t border-stone-200 p-4 flex-shrink-0">
                                <div className="flex items-end gap-3">
                                    <div className="flex-1 relative">
                                        <textarea
                                            ref={textareaRef}
                                            value={draft}
                                            onChange={(e) =>
                                                setDraft(e.target.value)
                                            }
                                            onKeyDown={handleKeyDown}
                                            placeholder="Reply as CapturePilot Team..."
                                            rows={1}
                                            className="w-full resize-none rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-400/20 focus:border-stone-400 transition-all"
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleSend}
                                        disabled={!draft.trim() || sending}
                                        className={clsx(
                                            "flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center transition-all",
                                            draft.trim() && !sending
                                                ? "bg-stone-900 text-white hover:bg-stone-800 shadow-sm"
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
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
