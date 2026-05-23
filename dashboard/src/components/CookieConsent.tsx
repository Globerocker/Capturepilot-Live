"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X, Cookie } from "lucide-react";

/**
 * EU-friendly cookie consent banner. Defers to /privacy for the full policy.
 *
 * Storage: localStorage key `cp:cookie-consent`. Possible values:
 *   "accepted_all"    — analytics + functional cookies allowed
 *   "essential_only"  — only what's needed for sign-in/billing
 *
 * Banner re-appears if the key is missing OR if consent_version (bumped
 * when policy changes) doesn't match the stored value. Components that
 * conditionally load analytics should read `getCookieConsent()` rather
 * than hitting localStorage directly.
 */

const STORAGE_KEY = "cp:cookie-consent";
const CONSENT_VERSION = "2026-05";

type Consent = "accepted_all" | "essential_only" | null;

interface StoredConsent {
    decision: "accepted_all" | "essential_only";
    version: string;
    decided_at: string;
}

export function getCookieConsent(): Consent {
    if (typeof window === "undefined") return null;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as StoredConsent;
        if (parsed.version !== CONSENT_VERSION) return null;
        return parsed.decision;
    } catch {
        return null;
    }
}

function setStoredConsent(decision: "accepted_all" | "essential_only") {
    const payload: StoredConsent = {
        decision,
        version: CONSENT_VERSION,
        decided_at: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    // Let other components (e.g. MetaPixel) react to consent changes live.
    window.dispatchEvent(new CustomEvent("cp:consent-changed", { detail: { decision } }));
}

export function CookieConsent() {
    const [decision, setDecision] = useState<Consent>(null);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        setDecision(getCookieConsent());
    }, []);

    // Skip render until we know the actual state (avoid hydration flash).
    if (!mounted || decision !== null) return null;

    const onAccept = () => {
        setStoredConsent("accepted_all");
        setDecision("accepted_all");
    };
    const onEssentialOnly = () => {
        setStoredConsent("essential_only");
        setDecision("essential_only");
    };

    return (
        <div
            role="dialog"
            aria-labelledby="cookie-consent-title"
            aria-describedby="cookie-consent-desc"
            className="fixed bottom-4 left-4 right-4 sm:left-6 sm:right-auto sm:max-w-md z-50 bg-white border border-stone-200 shadow-2xl rounded-2xl p-5 animate-in fade-in slide-in-from-bottom-4 duration-300"
        >
            <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2">
                    <Cookie className="w-4 h-4 text-stone-600" />
                    <h2 id="cookie-consent-title" className="font-bold text-sm text-stone-900">Cookies on CapturePilot</h2>
                </div>
                <button
                    type="button"
                    onClick={onEssentialOnly}
                    aria-label="Dismiss with essential-only consent"
                    className="text-stone-400 hover:text-stone-700"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>
            <p id="cookie-consent-desc" className="text-xs text-stone-600 leading-relaxed mb-4">
                We use essential cookies to keep you signed in and process payments. Optional analytics cookies
                help us understand which features matter so we can improve them.{" "}
                <Link href="/privacy" className="text-emerald-700 underline">Read our privacy policy</Link>.
            </p>
            <div className="flex flex-wrap gap-2 justify-end">
                <button
                    type="button"
                    onClick={onEssentialOnly}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-stone-200 hover:bg-stone-50 text-stone-700"
                >
                    Essential only
                </button>
                <button
                    type="button"
                    onClick={onAccept}
                    className="text-xs font-bold px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                    Accept all
                </button>
            </div>
        </div>
    );
}
