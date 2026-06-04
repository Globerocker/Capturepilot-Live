"use client";

/**
 * FeatureGate — HubSpot-style upgrade wall for any Pro/Light feature.
 *
 * Two modes:
 *   <FeatureGate feature="export_data" tier="pro">
 *     {locked ? <UpgradePrompt/> : <RealComponent/>}
 *   </FeatureGate>
 *
 * Or as a wrapper that shows children when unlocked, marketing copy when locked.
 *
 * The component reads the current user's plan via /api/billing/limits and
 * decides locally what to render. Server-side enforcement still happens in
 * the API routes — this is just the UX layer.
 *
 * Trial users see the full UI (no gate fires) because their limits map to
 * Pro for the trial window. After trial, they see the gate.
 */

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Lock, Sparkles, ArrowRight, Loader2, X } from "lucide-react";
import clsx from "clsx";

type FeatureKey =
    | "state_local_access"
    | "ai_proposals"
    | "ai_summaries"
    | "capability_statement_ai"
    | "export_data"
    | "api_access"
    | "competitor_profiles"
    | "partner_profiles"
    | "sam_passthrough"
    // Agency-only:
    | "client_management"
    | "client_portal"
    | "white_label"
    | "bulk_proposal_gen"
    | "priority_ai_models"
    | "dedicated_support"
    | "bulk_outreach";

interface Props {
    feature: FeatureKey;
    /** Tier required to unlock. Used to label the upgrade CTA. */
    requiredTier?: "light" | "pro" | "agency";
    /** When unlocked → render children. When locked → render UpgradeWall. */
    children: ReactNode;
    /** Optional override for the marketing headline. */
    headline?: string;
    /** Optional override for the marketing description. */
    description?: string;
    /** When set, renders an inline 4-line teaser instead of a full-page wall. */
    inline?: boolean;
}

/**
 * Per-feature marketing copy. Keep the value-prop tight (one sentence)
 * and the bullets specific (3 measurable benefits). HubSpot-style.
 */
const FEATURE_MARKETING: Record<FeatureKey, { headline: string; description: string; bullets: string[]; icon: string }> = {
    state_local_access: {
        headline: "Unlock state, county, and city opportunities",
        description: "4,600+ live RFPs across 48 states. NYC, LA, Chicago, Texas, Florida, plus 200+ portals scraped every 2 hours.",
        bullets: [
            "48 states · 200 active procurement portals · 4,600+ live opportunities",
            "Cities + counties + state agencies + school districts + special districts",
            "Auto-refreshed every 2 hours via Bonfire, OpenGov, Socrata, FlareSolverr",
        ],
        icon: "🌎",
    },
    ai_proposals: {
        headline: "AI Proposal Writer",
        description: "Generate full proposal sections (executive summary, technical approach, past performance) in seconds — tailored to the opportunity's NAICS, set-aside, and agency.",
        bullets: [
            "25 AI-written proposals per month (worth $50+/mo at GovTribe rates)",
            "Trained on your capability statement for company-specific voice",
            "Per-section editing with AI-assisted improve/shorten/expand",
        ],
        icon: "🤖",
    },
    ai_summaries: {
        headline: "AI opportunity summaries",
        description: "Every opportunity gets a one-paragraph plain-language AI summary — skip the 40-page solicitation and know in 10 seconds if it's worth pursuing.",
        bullets: [
            "One-paragraph summary on every opp (auto-generated)",
            "Pulls scope, deadline, dollar range, key requirements in one read",
            "Saves 5-15 min per opportunity you'd normally spend reading",
        ],
        icon: "📄",
    },
    capability_statement_ai: {
        headline: "AI Capability Statement editor",
        description: "Branded PDF capability statement with TipTap rich-text editor, AI improve/shorten/expand, voice-to-text dictation, and Google Drive sync.",
        bullets: [
            "AI bubble-menu editing: improve · shorten · expand · tighten",
            "Branded PDF export with custom colors + logo",
            "Voice dictation (Web Speech API + MP3 upload to Whisper)",
        ],
        icon: "✍️",
    },
    export_data: {
        headline: "Bulk export to CSV + XLSX",
        description: "Download up to 20 opportunities at a time as Excel or CSV. PDF download for capability statements.",
        bullets: [
            "XLSX export with all matched columns + AI summary",
            "CSV export for spreadsheet/CRM import",
            "Capability statement PDF download with branded layout",
        ],
        icon: "📥",
    },
    api_access: {
        headline: "API access",
        description: "Programmatic access to opportunities, matches, contractors, and your saved searches. Build custom integrations or push to your own CRM.",
        bullets: [
            "REST API with token auth",
            "Live opportunity feed via GET /api/v1/opportunities",
            "Webhooks on new matches",
        ],
        icon: "🔌",
    },
    competitor_profiles: {
        headline: "Competitor profiles",
        description: "Detailed competitor pages — federal presence, NAICS overlap, leadership, services, past clients, and likely bid targets joined to live opportunities.",
        bullets: [
            "80K+ SAM-registered contractors searchable",
            "Per-competitor: services as cards, leadership avatars, NAICS overlap score",
            "'Likely Bid Targets' section joins opportunities on overlapping NAICS",
        ],
        icon: "🎯",
    },
    partner_profiles: {
        headline: "Partner search + profiles",
        description: "Search SAM.gov by NAICS + state + set-aside. Save shortlist. View enriched profiles with POC contacts.",
        bullets: [
            "Live SAM.gov search with NAICS × state fanout (up to 12 combos)",
            "POC name + title + email + phone from SAM pointsOfContact",
            "Save partners to your shortlist, push opportunities to them in 1 click",
        ],
        icon: "🤝",
    },
    sam_passthrough: {
        headline: "SAM.gov live search",
        description: "Search the full SAM.gov firehose, not just our ingested 65K opps. Useful for opportunities outside our crawl window.",
        bullets: [
            "Direct passthrough to SAM.gov v3 API",
            "Search by any NAICS / set-aside / state combo",
            "Save anything you find directly to your pipeline",
        ],
        icon: "🔍",
    },
    client_management: {
        headline: "Multi-client workspace",
        description: "Run federal capture for 5, 10, or 50 client companies from one CapturePilot account. Each client gets their own dashboard, pipeline, capability statement, and match feed — without you context-switching.",
        bullets: [
            "Unlimited client workspaces under one Agency seat",
            "Per-client NAICS, certifications, pipeline, and contacts",
            "Switch clients via dropdown — no re-login, no separate seats",
        ],
        icon: "🗂️",
    },
    client_portal: {
        headline: "White-glove client portals",
        description: "Hand each of your clients a clean, read-only portal so they can see their pipeline, opportunities, and progress without seeing your back-office.",
        bullets: [
            "Light-view portal per client (cannot see your other clients)",
            "Pre-filtered to that client's matches and pipeline only",
            "Branded login URL: portal.youragency.com/clientname",
        ],
        icon: "🪟",
    },
    white_label: {
        headline: "White-label everything",
        description: "Custom domain, your logo, your colors. Your clients see your brand — not CapturePilot's. Perfect for consultancies who want to sell capture intel as their own service.",
        bullets: [
            "Custom domain via CNAME (portal.youragency.com)",
            "Replace CapturePilot logo + brand colors per client",
            "Outbound emails (alerts, briefs) sent from your domain",
        ],
        icon: "🎨",
    },
    bulk_proposal_gen: {
        headline: "Bulk proposal generation",
        description: "Generate fully-written first-draft proposals for 5, 10, or 25 opportunities in one batch. Saves 20-40 hours per week for agencies running parallel captures.",
        bullets: [
            "Queue up to 25 opps and walk away — drafts ready in minutes",
            "Each draft tuned to the opp's NAICS + agency + scope",
            "Token-heavy feature — Agency tier covers the GPT-4o cost",
        ],
        icon: "⚡",
    },
    priority_ai_models: {
        headline: "GPT-4o instead of GPT-4o-mini",
        description: "Pro uses gpt-4o-mini (cost-efficient). Agency uses gpt-4o (smarter, more nuanced) for every AI feature — capability statements, proposals, summaries, win strategies.",
        bullets: [
            "GPT-4o on every AI feature (vs gpt-4o-mini on Pro)",
            "Noticeably better at long-form proposal sections",
            "Better handling of complex multi-NAICS scope statements",
        ],
        icon: "🧠",
    },
    dedicated_support: {
        headline: "Dedicated CSM + Slack channel",
        description: "Get a named customer success manager + a private Slack channel for your team. Same-day response on weekdays. No ticket-queue purgatory.",
        bullets: [
            "Named CSM assigned to your account",
            "Private Slack channel with our founder + ops team",
            "Same-day response on weekdays, 24hr on weekends",
        ],
        icon: "💬",
    },
    bulk_outreach: {
        headline: "Outbound prospect campaigns",
        description: "Run bulk email + SMS outreach to potential clients (federal contractors not yet on CapturePilot). Generates qualified leads for your agency's BD pipeline.",
        bullets: [
            "Bulk email/SMS via Resend + Twilio (uses your sender)",
            "Pre-built sequences for capture, teaming, recompete pitches",
            "All replies routed to your inbox + tracked in pipeline",
        ],
        icon: "📤",
    },
};

interface LimitsResponse {
    tier_code: string;
    tier_label: string;
    limits: Record<string, boolean | number>;
    trial_active: boolean;
    trial_ends_at: string | null;
}

export function FeatureGate({ feature, requiredTier = "pro", children, headline, description, inline }: Props) {
    const [loading, setLoading] = useState(true);
    const [unlocked, setUnlocked] = useState(false);
    const [trialActive, setTrialActive] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch("/api/billing/limits");
                if (!res.ok) {
                    if (!cancelled) { setUnlocked(false); setLoading(false); }
                    return;
                }
                const data: LimitsResponse = await res.json();
                if (cancelled) return;
                setTrialActive(!!data.trial_active);
                setUnlocked(!!data.limits[feature]);
            } catch {
                if (!cancelled) setUnlocked(false);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [feature]);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[200px] text-stone-400">
                <Loader2 className="w-4 h-4 animate-spin mr-2" /> Checking access...
            </div>
        );
    }

    if (unlocked) return <>{children}</>;

    return inline
        ? <UpgradeInline feature={feature} requiredTier={requiredTier} trialActive={trialActive} />
        : <UpgradeWall feature={feature} requiredTier={requiredTier} headline={headline} description={description} trialActive={trialActive} />;
}

/* ──────────────────────────────────────────────────────────────────────── */

function UpgradeWall({ feature, requiredTier, headline, description, trialActive }: { feature: FeatureKey; requiredTier: "light" | "pro" | "agency"; headline?: string; description?: string; trialActive: boolean }) {
    const marketing = FEATURE_MARKETING[feature];
    const tierLabel = requiredTier === "agency" ? "Agency" : requiredTier === "pro" ? "Pro" : "Light";
    const tierPrice = requiredTier === "agency" ? "$399/mo" : requiredTier === "pro" ? "$89/mo" : "$39/mo";
    return (
        <div className="relative">
            {/* Frosted preview of the locked content (faded screenshot stand-in) */}
            <div className="absolute inset-0 pointer-events-none opacity-10 select-none bg-gradient-to-b from-stone-50 via-stone-100 to-stone-200 rounded-2xl" />

            <div className="relative bg-white border border-stone-200 rounded-2xl p-8 max-w-3xl mx-auto my-8 shadow-sm">
                <div className="flex items-start gap-4 mb-6">
                    <div className="text-5xl flex-shrink-0">{marketing.icon}</div>
                    <div className="flex-1">
                        <div className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full mb-3">
                            <Lock className="w-3 h-3" /> {tierLabel} feature
                        </div>
                        <h1 className="text-2xl font-bold text-stone-900 leading-tight mb-2">
                            {headline || marketing.headline}
                        </h1>
                        <p className="text-stone-600 leading-relaxed">
                            {description || marketing.description}
                        </p>
                    </div>
                </div>

                <ul className="space-y-2 mb-7 ml-1">
                    {marketing.bullets.map((b, i) => (
                        <li key={i} className="flex items-start gap-2.5 text-sm text-stone-700">
                            <span className="text-emerald-600 mt-0.5 flex-shrink-0">✓</span>
                            <span>{b}</span>
                        </li>
                    ))}
                </ul>

                <div className="bg-stone-50 border border-stone-200 rounded-xl p-5 flex items-center justify-between gap-4">
                    <div>
                        <div className="text-xs font-bold uppercase tracking-wide text-stone-500 mb-1">Unlock {tierLabel}</div>
                        <div className="text-lg font-bold text-stone-900">{tierPrice}</div>
                        {!trialActive && <div className="text-xs text-stone-500 mt-0.5">14-day free trial · cancel anytime</div>}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                        <Link
                            href={`/billing?upgrade=${requiredTier}&feature=${feature}`}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-lg font-bold text-sm inline-flex items-center gap-1.5 transition-colors"
                        >
                            <Sparkles className="w-4 h-4" />
                            {trialActive ? `Upgrade to ${tierLabel}` : `Start ${tierLabel} trial`}
                            <ArrowRight className="w-4 h-4" />
                        </Link>
                        <Link href="/pricing" className="text-xs text-stone-500 hover:text-stone-700 underline">
                            Compare all plans
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}

/**
 * Inline / compact version — drop into a sidebar or list item where the
 * full UpgradeWall would be too much. 1 line + button.
 */
function UpgradeInline({ feature, requiredTier, trialActive }: { feature: FeatureKey; requiredTier: "light" | "pro" | "agency"; trialActive: boolean }) {
    const marketing = FEATURE_MARKETING[feature];
    const tierLabel = requiredTier === "agency" ? "Agency" : requiredTier === "pro" ? "Pro" : "Light";
    return (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
            <Lock className="w-4 h-4 text-amber-700 flex-shrink-0" />
            <div className="flex-1 min-w-0">
                <span className="font-bold text-amber-900">{marketing.headline}</span>
                <span className="text-amber-700 ml-2 truncate">{marketing.description.slice(0, 80)}{marketing.description.length > 80 ? "…" : ""}</span>
            </div>
            <Link
                href={`/billing?upgrade=${requiredTier}&feature=${feature}`}
                className="bg-amber-700 hover:bg-amber-800 text-white px-3 py-1.5 rounded font-bold text-xs whitespace-nowrap inline-flex items-center gap-1"
            >
                {trialActive ? "Upgrade" : "Try free"} <ArrowRight className="w-3 h-3" />
            </Link>
        </div>
    );
}

/**
 * Standalone dismissible upgrade nag — useful for the dashboard sidebar.
 * Stores dismissal in localStorage per feature so it doesn't reappear for 7 days.
 */
export function UpgradeNag({ feature, requiredTier = "pro" }: { feature: FeatureKey; requiredTier?: "light" | "pro" | "agency" }) {
    const [dismissed, setDismissed] = useState(true);
    const storageKey = `upgrade_nag_dismissed_${feature}`;
    const tierLabel = requiredTier === "agency" ? "Agency" : requiredTier === "pro" ? "Pro" : "Light";

    useEffect(() => {
        try {
            const v = localStorage.getItem(storageKey);
            if (!v) return setDismissed(false);
            const dismissedAt = Number(v);
            const days = (Date.now() - dismissedAt) / (1000 * 60 * 60 * 24);
            setDismissed(days < 7);
        } catch { setDismissed(false); }
    }, [storageKey]);

    if (dismissed) return null;
    const marketing = FEATURE_MARKETING[feature];

    return (
        <div className="relative bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200 rounded-xl p-4 my-3">
            <button
                onClick={() => {
                    try { localStorage.setItem(storageKey, String(Date.now())); } catch {}
                    setDismissed(true);
                }}
                className="absolute top-2 right-2 text-emerald-700 hover:text-emerald-900 p-1"
                aria-label="Dismiss"
            >
                <X className="w-3.5 h-3.5" />
            </button>
            <div className="flex items-start gap-3">
                <div className="text-3xl">{marketing.icon}</div>
                <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold uppercase tracking-wide text-emerald-700 mb-1">{tierLabel} feature</div>
                    <h3 className="font-bold text-stone-900 text-sm mb-1.5">{marketing.headline}</h3>
                    <p className="text-xs text-stone-600 mb-3 leading-relaxed">{marketing.description}</p>
                    <Link
                        href={`/billing?upgrade=${requiredTier}&feature=${feature}`}
                        className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 hover:text-emerald-900"
                    >
                        Try {tierLabel} free for 14 days <ArrowRight className="w-3 h-3" />
                    </Link>
                </div>
            </div>
        </div>
    );
}
