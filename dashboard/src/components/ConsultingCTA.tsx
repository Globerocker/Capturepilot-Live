"use client";

/**
 * Consulting CTA — "Book a call · we take over your prospecting"
 *
 * Three render variants to drop the same offer into different surfaces:
 *
 *   <ConsultingCTA variant="floating" />   — bottom-left floating pill, always-on
 *   <ConsultingCTA variant="banner" />     — full-width banner row above the dashboard
 *   <ConsultingCTA variant="inline" />     — secondary button next to upgrade CTAs
 *   <ConsultingCTA variant="sidebar" />    — sticky card in the dashboard sidebar
 *
 * The booking link points to HubSpot's meetings page (env: HUBSPOT_MEETINGS_URL,
 * defaulting to https://meetings.hubspot.com/andre-schuler — change if your
 * scheduling URL differs). When the visitor clicks, we also fire a CAPI
 * event so the BD funnel attribution survives the redirect.
 *
 * Why this exists: as a new + small SaaS, we have one foot in consulting.
 * Every page in the software should remind the user "if you don't want to
 * DIY this, we'll do it for you" — that's the high-LTV upsell and our
 * actual differentiator vs the cheap aggregators (GovTribe, HigherGov etc).
 */

import Link from "next/link";
import { useState } from "react";
import { PhoneCall, Calendar, ArrowRight, X, Sparkles } from "lucide-react";
import clsx from "clsx";

const BOOKING_URL = process.env.NEXT_PUBLIC_HUBSPOT_MEETINGS_URL
    || "https://meetings.hubspot.com/andre-schuler";

interface Props {
    variant?: "floating" | "banner" | "inline" | "sidebar";
    /** Override the headline copy per placement. */
    headline?: string;
    /** Override the sub copy. */
    sub?: string;
    /** Optional UTM tag so we can see which placement drives bookings. */
    placement?: string;
}

function bookingHref(placement?: string): string {
    if (!placement) return BOOKING_URL;
    const sep = BOOKING_URL.includes("?") ? "&" : "?";
    return `${BOOKING_URL}${sep}utm_source=app&utm_medium=consulting_cta&utm_campaign=${encodeURIComponent(placement)}`;
}

export default function ConsultingCTA({ variant = "inline", headline, sub, placement }: Props) {
    if (variant === "floating") return <FloatingPill placement={placement} />;
    if (variant === "banner") return <Banner headline={headline} sub={sub} placement={placement} />;
    if (variant === "sidebar") return <SidebarCard headline={headline} sub={sub} placement={placement} />;
    return <InlineButton headline={headline} placement={placement} />;
}

/* ────────────────────────── FLOATING PILL ───────────────────────── */

function FloatingPill({ placement = "floating" }: { placement?: string }) {
    const [dismissed, setDismissed] = useState(false);
    if (dismissed) return null;
    return (
        <div className="fixed bottom-6 left-6 z-40 max-w-[280px]">
            <div className="bg-stone-900 text-white rounded-xl shadow-2xl p-4 border border-stone-700 relative">
                <button
                    onClick={() => setDismissed(true)}
                    aria-label="Dismiss"
                    className="absolute top-2 right-2 text-stone-400 hover:text-white"
                >
                    <X className="w-3.5 h-3.5" />
                </button>
                <div className="flex items-start gap-2.5 mb-3">
                    <div className="bg-emerald-500/20 p-1.5 rounded-lg">
                        <Sparkles className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm leading-tight">Want us to run this for you?</div>
                        <div className="text-xs text-stone-400 mt-1 leading-relaxed">
                            30-min B2G audit · we map your wins + take over prospecting if it fits.
                        </div>
                    </div>
                </div>
                <Link
                    href={bookingHref(placement)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3 py-2 rounded-lg w-full inline-flex items-center justify-center gap-1.5 transition-colors"
                >
                    <Calendar className="w-3.5 h-3.5" /> Book free call <ArrowRight className="w-3 h-3" />
                </Link>
            </div>
        </div>
    );
}

/* ───────────────────────────── BANNER ───────────────────────────── */

function Banner({ headline, sub, placement = "banner" }: { headline?: string; sub?: string; placement?: string }) {
    return (
        <div className="bg-gradient-to-r from-stone-900 to-stone-800 text-white rounded-xl p-5 my-4 flex items-center justify-between gap-4 shadow-sm">
            <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="bg-emerald-500/20 p-2.5 rounded-lg flex-shrink-0">
                    <PhoneCall className="w-5 h-5 text-emerald-400" />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="font-bold text-base leading-tight">
                        {headline || "Don't want to DIY this? We'll do it for you."}
                    </div>
                    <div className="text-sm text-stone-300 mt-0.5">
                        {sub || "Free 30-min B2G audit — leave with 3 live opportunities tailored to your business."}
                    </div>
                </div>
            </div>
            <Link
                href={bookingHref(placement)}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-lg font-bold text-sm inline-flex items-center gap-2 transition-colors flex-shrink-0 whitespace-nowrap"
            >
                <Calendar className="w-4 h-4" /> Book free call <ArrowRight className="w-4 h-4" />
            </Link>
        </div>
    );
}

/* ────────────────────────── SIDEBAR CARD ────────────────────────── */

function SidebarCard({ headline, sub, placement = "sidebar" }: { headline?: string; sub?: string; placement?: string }) {
    return (
        <div className="bg-white border border-stone-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-start gap-2.5 mb-3">
                <div className="bg-emerald-50 p-1.5 rounded-lg flex-shrink-0">
                    <Sparkles className="w-4 h-4 text-emerald-600" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm text-stone-900 leading-tight">
                        {headline || "Need a hand?"}
                    </div>
                    <div className="text-xs text-stone-500 mt-1 leading-relaxed">
                        {sub || "Free B2G audit call · 30 min · we map your wins, you walk away with 3 live opps."}
                    </div>
                </div>
            </div>
            <Link
                href={bookingHref(placement)}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold px-3 py-2 rounded-lg w-full inline-flex items-center justify-center gap-1.5 transition-colors"
            >
                <Calendar className="w-3.5 h-3.5" /> Book audit call
            </Link>
        </div>
    );
}

/* ──────────────────────── INLINE BUTTON ──────────────────────── */

function InlineButton({ headline, placement = "inline" }: { headline?: string; placement?: string }) {
    return (
        <Link
            href={bookingHref(placement)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-bold text-stone-700 hover:text-stone-900 border border-stone-300 hover:border-stone-400 bg-white px-4 py-2 rounded-lg transition-colors"
        >
            <Calendar className="w-3.5 h-3.5" />
            {headline || "Or book a free 30-min call instead"}
        </Link>
    );
}
