"use client";

import { useState } from "react";
import { MessageCircle, X, Send, Loader2, Bug, Lightbulb, MessageSquare, CheckCircle2, Star } from "lucide-react";
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
    const [mode, setMode] = useState<"menu" | "quick" | "beta">("menu");
    const [type, setType] = useState<"bug" | "feature" | "feedback">("feedback");
    const [message, setMessage] = useState("");
    const [sending, setSending] = useState(false);
    const [sent, setSent] = useState(false);

    // Beta survey state
    const [rating, setRating] = useState(0);
    const [hoverRating, setHoverRating] = useState(0);
    const [likes, setLikes] = useState("");
    const [improvements, setImprovements] = useState("");
    const [wouldRecommend, setWouldRecommend] = useState<boolean | null>(null);

    const resetAll = () => {
        setMode("menu");
        setType("feedback");
        setMessage("");
        setRating(0);
        setHoverRating(0);
        setLikes("");
        setImprovements("");
        setWouldRecommend(null);
        setSent(false);
    };

    const handleQuickSubmit = async () => {
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
                resetAll();
            }, 2000);
        } catch {
            // Silently fail - don't interrupt user
        }
        setSending(false);
    };

    const handleBetaSubmit = async () => {
        if (rating === 0) return;
        setSending(true);

        try {
            const { data: { user } } = await supabase.auth.getUser();
            let profileId = null;

            if (user) {
                const { data: profile } = await supabase
                    .from("user_profiles")
                    .select("id")
                    .eq("auth_user_id", user.id)
                    .single();
                profileId = profile ? (profile as Record<string, unknown>).id : null;
            }

            await supabase.from("user_feedback").insert({
                user_profile_id: profileId,
                rating,
                likes: likes.trim() || null,
                improvements: improvements.trim() || null,
                would_recommend: wouldRecommend,
                page_url: window.location.href,
            });

            setSent(true);
            setTimeout(() => {
                setOpen(false);
                resetAll();
            }, 2500);
        } catch {
            // Silently fail
        }
        setSending(false);
    };

    return (
        <>
            {/* Floating Button */}
            <button
                type="button"
                onClick={() => {
                    if (open) {
                        setOpen(false);
                        resetAll();
                    } else {
                        setOpen(true);
                    }
                }}
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
                        <h3 className="font-bold text-sm text-stone-900">
                            {mode === "menu" ? "Send Feedback" : mode === "beta" ? "Beta Survey" : "Send Feedback"}
                        </h3>
                        <p className="text-[11px] text-stone-500 mt-0.5">
                            {mode === "beta"
                                ? "Complete this to lock in $99/mo pricing"
                                : "Help us improve CapturePilot"}
                        </p>
                    </div>

                    {sent ? (
                        <div className="p-8 text-center">
                            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
                            <p className="font-bold text-sm text-stone-900">Thank you!</p>
                            <p className="text-xs text-stone-500 mt-1">
                                {mode === "beta"
                                    ? "Your beta feedback is recorded. $99/mo pricing locked in!"
                                    : "Your feedback has been received."}
                            </p>
                        </div>
                    ) : mode === "menu" ? (
                        <div className="p-4 space-y-2">
                            {/* Beta Survey CTA */}
                            <button
                                type="button"
                                onClick={() => setMode("beta")}
                                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-emerald-200 bg-emerald-50 text-left hover:border-emerald-300 transition-all"
                            >
                                <div className="p-1.5 bg-emerald-100 rounded-lg flex-shrink-0">
                                    <Star className="w-4 h-4 text-emerald-600" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-emerald-800">Beta Survey</p>
                                    <p className="text-[10px] text-emerald-600">Rate your experience &amp; lock in $99/mo</p>
                                </div>
                            </button>

                            {/* Quick Feedback */}
                            <button
                                type="button"
                                onClick={() => setMode("quick")}
                                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-stone-200 bg-white text-left hover:border-stone-300 transition-all"
                            >
                                <div className="p-1.5 bg-stone-100 rounded-lg flex-shrink-0">
                                    <MessageCircle className="w-4 h-4 text-stone-600" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-stone-800">Quick Feedback</p>
                                    <p className="text-[10px] text-stone-500">Bug report, feature request, or general</p>
                                </div>
                            </button>
                        </div>
                    ) : mode === "quick" ? (
                        <div className="p-4 space-y-3">
                            {/* Back button */}
                            <button type="button" onClick={() => setMode("menu")} className="text-xs text-stone-400 hover:text-stone-600 transition-colors">
                                &larr; Back
                            </button>

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
                                                "flex-1 flex flex-col items-center gap-1 py-2 px-2 rounded-xl border text-[10px] font-bold transition-all",
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
                                onClick={handleQuickSubmit}
                                disabled={sending || !message.trim()}
                                className="w-full bg-black text-white py-2.5 rounded-xl font-bold text-xs hover:bg-stone-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {sending ? (
                                    <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Sending...</>
                                ) : (
                                    <><Send className="w-3.5 h-3.5" /> Send Feedback</>
                                )}
                            </button>
                        </div>
                    ) : (
                        /* Beta Survey Mode */
                        <div className="p-4 space-y-4">
                            {/* Back button */}
                            <button type="button" onClick={() => setMode("menu")} className="text-xs text-stone-400 hover:text-stone-600 transition-colors">
                                &larr; Back
                            </button>

                            {/* Star Rating */}
                            <div>
                                <p className="text-xs font-bold text-stone-700 mb-2">How&apos;s your experience?</p>
                                <div className="flex gap-1 justify-center">
                                    {[1, 2, 3, 4, 5].map((star) => (
                                        <button
                                            key={star}
                                            type="button"
                                            title={`Rate ${star} star${star !== 1 ? "s" : ""}`}
                                            onClick={() => setRating(star)}
                                            onMouseEnter={() => setHoverRating(star)}
                                            onMouseLeave={() => setHoverRating(0)}
                                            className="p-1 transition-transform hover:scale-110"
                                        >
                                            <Star
                                                className={clsx(
                                                    "w-7 h-7 transition-colors",
                                                    (hoverRating || rating) >= star
                                                        ? "text-amber-400 fill-amber-400"
                                                        : "text-stone-200"
                                                )}
                                            />
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Likes */}
                            <div>
                                <label className="text-xs font-bold text-stone-700 block mb-1">What do you like?</label>
                                <textarea
                                    value={likes}
                                    onChange={(e) => setLikes(e.target.value)}
                                    placeholder="Features, experience, value..."
                                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10 resize-none h-16"
                                />
                            </div>

                            {/* Improvements */}
                            <div>
                                <label className="text-xs font-bold text-stone-700 block mb-1">What could be better?</label>
                                <textarea
                                    value={improvements}
                                    onChange={(e) => setImprovements(e.target.value)}
                                    placeholder="Missing features, UX issues..."
                                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10 resize-none h-16"
                                />
                            </div>

                            {/* Would Recommend */}
                            <div>
                                <p className="text-xs font-bold text-stone-700 mb-2">Would you recommend CapturePilot?</p>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setWouldRecommend(true)}
                                        className={clsx(
                                            "flex-1 py-2 rounded-xl border text-xs font-bold transition-all",
                                            wouldRecommend === true
                                                ? "bg-emerald-50 border-emerald-300 text-emerald-700 ring-2 ring-emerald-200"
                                                : "bg-white border-stone-200 text-stone-500 hover:border-stone-300"
                                        )}
                                    >
                                        Yes
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setWouldRecommend(false)}
                                        className={clsx(
                                            "flex-1 py-2 rounded-xl border text-xs font-bold transition-all",
                                            wouldRecommend === false
                                                ? "bg-red-50 border-red-300 text-red-700 ring-2 ring-red-200"
                                                : "bg-white border-stone-200 text-stone-500 hover:border-stone-300"
                                        )}
                                    >
                                        Not yet
                                    </button>
                                </div>
                            </div>

                            {/* Submit */}
                            <button
                                type="button"
                                onClick={handleBetaSubmit}
                                disabled={sending || rating === 0}
                                className="w-full bg-emerald-600 text-white py-2.5 rounded-xl font-bold text-xs hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {sending ? (
                                    <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Submitting...</>
                                ) : (
                                    <><Send className="w-3.5 h-3.5" /> Submit Beta Feedback</>
                                )}
                            </button>
                        </div>
                    )}
                </div>
            )}
        </>
    );
}
