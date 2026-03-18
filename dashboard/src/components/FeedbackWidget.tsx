"use client";

import { useState } from "react";
import { MessageCircle, X, Send, Loader2, Bug, Lightbulb, MessageSquare, CheckCircle2 } from "lucide-react";
import clsx from "clsx";
import { createSupabaseClient } from "@/lib/supabase/client";

const supabase = createSupabaseClient();

const feedbackTypes = [
    { value: "bug", label: "Bug Report", icon: Bug, color: "text-red-600 bg-red-50 border-red-200" },
    { value: "feature", label: "Feature Request", icon: Lightbulb, color: "text-amber-600 bg-amber-50 border-amber-200" },
    { value: "feedback", label: "General Feedback", icon: MessageSquare, color: "text-blue-600 bg-blue-50 border-blue-200" },
] as const;

export default function FeedbackWidget() {
    const [open, setOpen] = useState(false);
    const [type, setType] = useState<"bug" | "feature" | "feedback">("feedback");
    const [message, setMessage] = useState("");
    const [sending, setSending] = useState(false);
    const [sent, setSent] = useState(false);

    const handleSubmit = async () => {
        if (!message.trim()) return;
        setSending(true);

        try {
            const { data: { user } } = await supabase.auth.getUser();
            let profileId = null;
            let email = user?.email || null;

            if (user) {
                const { data: profile } = await supabase
                    .from("user_profiles")
                    .select("id")
                    .eq("auth_user_id", user.id)
                    .single();
                profileId = profile ? (profile as Record<string, unknown>).id : null;
            }

            await supabase.from("feedback").insert({
                user_profile_id: profileId,
                type,
                message: message.trim(),
                page_url: window.location.href,
                user_email: email,
            });

            setSent(true);
            setTimeout(() => {
                setOpen(false);
                setSent(false);
                setMessage("");
                setType("feedback");
            }, 2000);
        } catch {
            // Silently fail - don't interrupt user
        }
        setSending(false);
    };

    return (
        <>
            {/* Floating Button */}
            <button
                type="button"
                onClick={() => setOpen(!open)}
                className={clsx(
                    "fixed bottom-5 right-5 z-50 w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-all duration-300 hover:scale-110",
                    open ? "bg-stone-800 text-white rotate-90" : "bg-black text-white"
                )}
            >
                {open ? <X className="w-5 h-5" /> : <MessageCircle className="w-5 h-5" />}
            </button>

            {/* Feedback Panel */}
            {open && (
                <div className="fixed bottom-20 right-5 z-50 w-80 bg-white rounded-2xl border border-stone-200 shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
                    <div className="bg-stone-50 border-b border-stone-100 px-5 py-4">
                        <h3 className="font-typewriter font-bold text-sm text-stone-900">Send Feedback</h3>
                        <p className="text-[11px] text-stone-500 mt-0.5">Help us improve CapturePilot</p>
                    </div>

                    {sent ? (
                        <div className="p-8 text-center">
                            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
                            <p className="font-typewriter font-bold text-sm text-stone-900">Thank you!</p>
                            <p className="text-xs text-stone-500 mt-1">Your feedback has been received.</p>
                        </div>
                    ) : (
                        <div className="p-4 space-y-3">
                            {/* Type selector */}
                            <div className="flex gap-2">
                                {feedbackTypes.map((ft) => {
                                    const Icon = ft.icon;
                                    return (
                                        <button
                                            key={ft.value}
                                            type="button"
                                            onClick={() => setType(ft.value)}
                                            className={clsx(
                                                "flex-1 flex flex-col items-center gap-1 py-2 px-2 rounded-xl border text-[10px] font-typewriter font-bold transition-all",
                                                type === ft.value
                                                    ? ft.color + " ring-2 ring-black/10"
                                                    : "text-stone-400 bg-white border-stone-200 hover:border-stone-300"
                                            )}
                                        >
                                            <Icon className="w-4 h-4" />
                                            {ft.label}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Message */}
                            <textarea
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                placeholder={
                                    type === "bug"
                                        ? "Describe the bug you found..."
                                        : type === "feature"
                                        ? "What feature would you like to see?"
                                        : "Share your thoughts..."
                                }
                                className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-black/10 resize-none h-24"
                            />

                            {/* Submit */}
                            <button
                                type="button"
                                onClick={handleSubmit}
                                disabled={sending || !message.trim()}
                                className="w-full bg-black text-white py-2.5 rounded-xl font-typewriter font-bold text-xs hover:bg-stone-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {sending ? (
                                    <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Sending...</>
                                ) : (
                                    <><Send className="w-3.5 h-3.5" /> Send Feedback</>
                                )}
                            </button>
                        </div>
                    )}
                </div>
            )}
        </>
    );
}
