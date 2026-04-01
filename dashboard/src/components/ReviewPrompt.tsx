"use client";

import { useState, useEffect } from "react";
import { Star, X } from "lucide-react";

/**
 * ReviewPrompt — shows a popup after user has been active for a while,
 * prompting them to leave a review on Google Maps or Trustpilot.
 * Only shows once per 30 days (stored in localStorage).
 */
export function ReviewPrompt() {
    const [show, setShow] = useState(false);

    useEffect(() => {
        const lastShown = localStorage.getItem("cp_review_shown");
        const dismissed = localStorage.getItem("cp_review_dismissed");
        const now = Date.now();

        // Don't show if dismissed in last 30 days
        if (dismissed && now - Number(dismissed) < 30 * 86400 * 1000) return;
        // Don't show if shown in last 7 days
        if (lastShown && now - Number(lastShown) < 7 * 86400 * 1000) return;

        // Show after 60 seconds of activity
        const timer = setTimeout(() => {
            setShow(true);
            localStorage.setItem("cp_review_shown", String(now));
        }, 60000);

        return () => clearTimeout(timer);
    }, []);

    if (!show) return null;

    const handleReview = (url: string) => {
        localStorage.setItem("cp_review_dismissed", String(Date.now()));
        window.open(url, "_blank");
        setShow(false);
    };

    const handleDismiss = () => {
        localStorage.setItem("cp_review_dismissed", String(Date.now()));
        setShow(false);
    };

    return (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm animate-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white border border-stone-200 rounded-2xl shadow-xl p-5 relative">
                <button
                    type="button"
                    onClick={handleDismiss}
                    className="absolute top-3 right-3 text-stone-400 hover:text-stone-600"
                >
                    <X className="w-4 h-4" />
                </button>

                <div className="flex items-center gap-1 mb-2">
                    {[1, 2, 3, 4, 5].map(i => (
                        <Star key={i} className="w-5 h-5 text-amber-400 fill-amber-400" />
                    ))}
                </div>

                <h3 className="font-bold text-sm text-black mb-1">Enjoying CapturePilot?</h3>
                <p className="text-xs text-stone-500 mb-3">
                    Your feedback helps small businesses discover us. Leave a quick review!
                </p>

                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={() => handleReview("https://g.page/r/YOUR_GOOGLE_PLACE_ID/review")}
                        className="flex-1 bg-black text-white px-3 py-2 rounded-xl text-xs font-bold hover:bg-stone-800 transition-colors"
                    >
                        Google Review
                    </button>
                    <button
                        type="button"
                        onClick={handleDismiss}
                        className="text-xs text-stone-400 hover:text-stone-600 px-3"
                    >
                        Maybe later
                    </button>
                </div>
            </div>
        </div>
    );
}
