"use client";

import { useState } from "react";
import { MessageCircle, X, Send, Loader2, Bug, HelpCircle, Lightbulb } from "lucide-react";
import clsx from "clsx";
import { createSupabaseClient } from "@/lib/supabase/client";

const supabase = createSupabaseClient();

/**
 * SupportChat — in-app support/feedback widget.
 * Messages are stored in client_activity_log and forwarded to Slack.
 *
 * Three categories:
 * - Bug Report: something is broken
 * - Support: need help with something
 * - Feedback: suggestion or idea
 */
export default function SupportChat() {
    const [isOpen, setIsOpen] = useState(false);
    const [category, setCategory] = useState<"bug" | "support" | "feedback" | null>(null);
    const [message, setMessage] = useState("");
    const [sending, setSending] = useState(false);
    const [sent, setSent] = useState(false);

    const handleSend = async () => {
        if (!message.trim()) return;
        setSending(true);

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const { data: profile } = await supabase
                    .from("user_profiles")
                    .select("id, company_name, email")
                    .eq("auth_user_id", user.id)
                    .single();

                if (profile) {
                    // Store in activity log
                    await supabase.from("client_activity_log").insert({
                        user_profile_id: profile.id,
                        action: `support_${category}`,
                        description: `[${(category || "general").toUpperCase()}] ${message}`,
                        metadata: {
                            category,
                            message,
                            email: profile.email,
                            company: profile.company_name,
                            url: window.location.href,
                            user_agent: navigator.userAgent,
                            timestamp: new Date().toISOString(),
                        },
                    });

                    // Also try to send to Slack
                    try {
                        await fetch("/api/admin/send-update", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                user_profile_id: profile.id,
                                type: "custom",
                                subject: `[${(category || "").toUpperCase()}] Support Request from ${profile.company_name}`,
                                body: `Category: ${category}\nFrom: ${profile.company_name} (${profile.email})\nPage: ${window.location.href}\n\nMessage:\n${message}`,
                            }),
                        });
                    } catch { /* Slack/email is best-effort */ }
                }
            }

            setSent(true);
            setMessage("");
            setTimeout(() => { setSent(false); setCategory(null); setIsOpen(false); }, 3000);
        } catch {
            // Error sending — still close
        }
        setSending(false);
    };

    return (
        <>
            {/* Chat Button */}
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={clsx(
                    "fixed bottom-20 lg:bottom-6 right-6 z-40 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all",
                    isOpen ? "bg-stone-800 text-white rotate-0" : "bg-black text-white hover:bg-stone-800 hover:scale-105"
                )}
            >
                {isOpen ? <X className="w-6 h-6" /> : <MessageCircle className="w-6 h-6" />}
            </button>

            {/* Chat Panel */}
            {isOpen && (
                <div className="fixed bottom-36 lg:bottom-24 right-6 z-40 w-80 max-w-[calc(100vw-3rem)] bg-white border border-stone-200 rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-200">
                    {/* Header */}
                    <div className="bg-black text-white px-4 py-3">
                        <p className="font-bold text-sm">How can we help?</p>
                        <p className="text-[10px] text-stone-400">We typically respond within a few hours.</p>
                    </div>

                    {sent ? (
                        <div className="p-6 text-center">
                            <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
                                <Send className="w-6 h-6 text-emerald-600" />
                            </div>
                            <p className="font-bold text-sm">Message Sent!</p>
                            <p className="text-xs text-stone-500 mt-1">We&apos;ll get back to you soon.</p>
                        </div>
                    ) : (
                        <div className="p-4 space-y-3">
                            {/* Category Selection */}
                            {!category ? (
                                <div className="space-y-2">
                                    <button type="button" onClick={() => setCategory("bug")}
                                        className="w-full flex items-center gap-3 p-3 rounded-xl border border-stone-200 hover:border-stone-300 hover:bg-stone-50 transition-colors text-left">
                                        <Bug className="w-5 h-5 text-red-500 flex-shrink-0" />
                                        <div>
                                            <p className="text-sm font-bold">Report a Bug</p>
                                            <p className="text-[10px] text-stone-400">Something isn&apos;t working right</p>
                                        </div>
                                    </button>
                                    <button type="button" onClick={() => setCategory("support")}
                                        className="w-full flex items-center gap-3 p-3 rounded-xl border border-stone-200 hover:border-stone-300 hover:bg-stone-50 transition-colors text-left">
                                        <HelpCircle className="w-5 h-5 text-blue-500 flex-shrink-0" />
                                        <div>
                                            <p className="text-sm font-bold">Get Help</p>
                                            <p className="text-[10px] text-stone-400">I need help with something</p>
                                        </div>
                                    </button>
                                    <button type="button" onClick={() => setCategory("feedback")}
                                        className="w-full flex items-center gap-3 p-3 rounded-xl border border-stone-200 hover:border-stone-300 hover:bg-stone-50 transition-colors text-left">
                                        <Lightbulb className="w-5 h-5 text-amber-500 flex-shrink-0" />
                                        <div>
                                            <p className="text-sm font-bold">Give Feedback</p>
                                            <p className="text-[10px] text-stone-400">Share an idea or suggestion</p>
                                        </div>
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <div className="flex items-center gap-2">
                                        <button type="button" onClick={() => setCategory(null)} className="text-xs text-stone-400 hover:text-stone-600">← Back</button>
                                        <span className={clsx("text-[10px] font-bold px-2 py-0.5 rounded-lg uppercase",
                                            category === "bug" ? "bg-red-100 text-red-700" :
                                            category === "support" ? "bg-blue-100 text-blue-700" :
                                            "bg-amber-100 text-amber-700"
                                        )}>{category}</span>
                                    </div>
                                    <textarea
                                        value={message}
                                        onChange={e => setMessage(e.target.value)}
                                        placeholder={
                                            category === "bug" ? "Describe what happened and what you expected..." :
                                            category === "support" ? "What do you need help with?" :
                                            "What would you like to see improved?"
                                        }
                                        className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm h-24 resize-none focus:border-black focus:ring-1 focus:ring-black outline-none"
                                        autoFocus
                                    />
                                    <button type="button" onClick={handleSend} disabled={sending || !message.trim()}
                                        className="w-full bg-black text-white py-2.5 rounded-xl text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-stone-800">
                                        {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                        {sending ? "Sending..." : "Send Message"}
                                    </button>
                                </>
                            )}
                        </div>
                    )}
                </div>
            )}
        </>
    );
}
