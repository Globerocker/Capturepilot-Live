"use client";

/**
 * PlanCardsGrid — the 4-tier card grid (Free / Light / Pro / Agency) shown
 * on /billing AND used as the canonical "see all plans" view. Replaces the
 * old 3-card hardcoded layout (Free / Pro / Consulting) so users on a trial
 * can still see — and switch between — every plan without leaving /billing.
 *
 * Reads tier data from public.plan_tiers (anon-read RLS). Falls back to a
 * built-in static array if the fetch fails, so users always see something.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { createSupabaseClient } from "@/lib/supabase/client";
import { CheckCircle2, Loader2, Star, Phone, Check, X as XIcon, ArrowRight, Crown } from "lucide-react";
import clsx from "clsx";
import { VETERAN_DISCOUNT_PERCENT, discountedPrice } from "@/lib/veteran";

const sb = createSupabaseClient();

interface PlanTierRow {
    code: string;
    label: string;
    monthly_usd: number | null;
    yearly_usd: number | null;
    sort_order: number;
    is_public: boolean;
    limits: Record<string, boolean | number>;
}

interface Props {
    /** Current user's plan tier code (e.g. "pro", "light", "free"). Used to render
     *  the "Current Plan" badge + suppress the upgrade button on that card. */
    currentTier: string;
    /** Subscription status from Stripe: "trialing" | "active" | etc. */
    subscriptionStatus: string;
    /** Monthly / yearly billing interval toggle. */
    interval: "monthly" | "yearly";
    setInterval: (i: "monthly" | "yearly") => void;
    /** True while a checkout redirect is in flight. */
    upgrading: boolean;
    /** Called when user clicks "Start trial" / "Switch to X". Triggers Stripe checkout. */
    onUpgrade: (interval: "monthly" | "yearly", plan: "light" | "pro") => void | Promise<void>;
    /** Whether the user qualifies for the veteran discount (applied to Pro). */
    isVet: boolean;
}

/**
 * Bullet list per tier — the most marketing-impactful features. Pulled from
 * the limits JSONB so this stays in sync with what the gates actually enforce.
 */
function bulletsFor(tier: PlanTierRow): string[] {
    const L = tier.limits;
    const bullets: string[] = [];
    if (typeof L.matches_per_day === "number") {
        bullets.push(
            L.matches_per_day >= 9999
                ? "Unlimited federal opportunity matches"
                : `${L.matches_per_day} federal matches / day`,
        );
    }
    if (L.state_local_access) bullets.push("State + county + city opportunities (48 states)");
    if (L.sam_passthrough)    bullets.push("Live SAM.gov passthrough search");
    if (L.competitor_profiles) bullets.push("Competitor profiles (80K+ contractors)");
    if (L.partner_profiles)    bullets.push("Teaming partner search + save");
    if (L.ai_proposals)        bullets.push("AI proposal writer");
    if (L.ai_summaries)        bullets.push("Per-opportunity AI summaries");
    if (L.capability_statement_ai) bullets.push("AI capability statement editor");
    if (L.export_data)         bullets.push("Export to CSV / XLSX + PDF");
    if (L.api_access)          bullets.push("API access + webhooks");
    if (typeof L.team_seats === "number" && L.team_seats > 1) {
        bullets.push(L.team_seats >= 9999 ? "Unlimited team seats" : `${L.team_seats} team seats`);
    }
    // Agency-only flags get appended for the Agency card:
    if (L.client_management)   bullets.push("Multi-client workspace");
    if (L.client_portal)       bullets.push("White-glove client portals");
    if (L.white_label)         bullets.push("White-label (custom domain + logo)");
    if (L.bulk_proposal_gen)   bullets.push("Bulk proposal generation");
    if (L.priority_ai_models)  bullets.push("GPT-4o on every AI feature");
    if (L.dedicated_support)   bullets.push("Dedicated CSM + private Slack");
    if (L.bulk_outreach)       bullets.push("Outbound prospect campaigns");
    return bullets;
}

function tierPrice(tier: PlanTierRow, interval: "monthly" | "yearly", isVet: boolean): { display: string; sub: string; rawMonthly: number | null } {
    if (tier.monthly_usd === null) return { display: "Custom", sub: "Talk to us", rawMonthly: null };
    if (tier.monthly_usd === 0)    return { display: "$0", sub: "Forever free", rawMonthly: 0 };
    if (interval === "yearly" && tier.yearly_usd) {
        const monthlyEq = Math.round(tier.yearly_usd / 12);
        const finalMonthly = isVet && tier.code === "pro" ? discountedPrice(monthlyEq) : monthlyEq;
        return {
            display: `$${finalMonthly}`,
            sub: `$${tier.yearly_usd.toLocaleString()}/yr · save 20%`,
            rawMonthly: finalMonthly,
        };
    }
    const finalMonthly = isVet && tier.code === "pro" ? discountedPrice(tier.monthly_usd) : tier.monthly_usd;
    return { display: `$${finalMonthly}`, sub: "Billed monthly · cancel anytime", rawMonthly: finalMonthly };
}

export default function PlanCardsGrid({
    currentTier, subscriptionStatus, interval, setInterval, upgrading, onUpgrade, isVet,
}: Props) {
    const [tiers, setTiers] = useState<PlanTierRow[] | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const { data, error } = await sb
                .from("plan_tiers")
                .select("code, label, monthly_usd, yearly_usd, sort_order, is_public, limits")
                .eq("is_public", true)
                .order("sort_order");
            if (cancelled) return;
            if (error || !data) {
                // Fail loud + fall back to a sane static list so the page never breaks.
                console.error("[PlanCardsGrid] plan_tiers fetch failed:", error);
                setTiers(STATIC_FALLBACK);
            } else {
                setTiers(data as PlanTierRow[]);
            }
            setLoading(false);
        })();
        return () => { cancelled = true; };
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12 text-stone-400">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading plans...
            </div>
        );
    }

    if (!tiers || tiers.length === 0) return null;

    return (
        <div className="mb-10">
            {/* Monthly / Yearly toggle */}
            <div className="flex items-center justify-center gap-3 mb-8">
                <button type="button" onClick={() => setInterval("monthly")} className={clsx(
                    "px-5 py-2 rounded-full text-sm font-bold transition-all",
                    interval === "monthly"
                        ? "bg-emerald-600 text-white shadow-md"
                        : "bg-stone-100 text-stone-600 hover:bg-stone-200 border border-stone-200",
                )}>
                    Monthly
                </button>
                <button type="button" onClick={() => setInterval("yearly")} className={clsx(
                    "px-5 py-2 rounded-full text-sm font-bold transition-all",
                    interval === "yearly"
                        ? "bg-emerald-600 text-white shadow-md"
                        : "bg-stone-100 text-stone-600 hover:bg-stone-200 border border-stone-200",
                )}>
                    Yearly
                    {interval !== "yearly" && (
                        <span className="ml-1.5 text-[10px] text-emerald-600 font-bold">SAVE 20%</span>
                    )}
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {tiers
                    // Agency is enterprise-style custom pricing — handled by the
                    // dedicated footer CTA below + its own landing page. Keeping
                    // it out of the grid avoids the "but I don't need an agency
                    // plan" friction for solo contractors who just want Pro.
                    .filter(t => t.code !== "agency" && t.code !== "enterprise")
                    .map(tier => {
                    const isCurrent = tier.code === currentTier;
                    const isMostPopular = tier.code === "pro";
                    const isAgency = false; // filtered out above; kept for type safety in CTA branches
                    const isFree = tier.code === "free";
                    const price = tierPrice(tier, interval, isVet);

                    return (
                        <div key={tier.code} className={clsx(
                            "rounded-2xl bg-white flex flex-col overflow-hidden relative",
                            isMostPopular ? "border-2 border-emerald-500 shadow-xl" : "border border-stone-200 shadow-sm",
                        )}>
                            {isMostPopular && (
                                <div className="absolute top-0 right-0 bg-emerald-500 text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl flex items-center gap-1">
                                    <Star className="w-3 h-3" /> MOST POPULAR
                                </div>
                            )}
                            {isAgency && (
                                <div className="absolute top-0 right-0 bg-stone-800 text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl flex items-center gap-1">
                                    <Crown className="w-3 h-3" /> FOR AGENCIES
                                </div>
                            )}

                            <div className="p-5 flex-1 flex flex-col">
                                <p className={clsx(
                                    "font-bold text-xs uppercase tracking-wider mb-2",
                                    isMostPopular ? "text-emerald-600" : "text-stone-500",
                                )}>
                                    {tier.label}
                                </p>

                                <div className="mb-1 flex items-baseline gap-2">
                                    <span className="text-3xl font-extrabold text-stone-900">{price.display}</span>
                                    {tier.monthly_usd !== null && tier.monthly_usd > 0 && (
                                        <span className="text-xs text-stone-500">/mo</span>
                                    )}
                                </div>
                                <p className="text-[11px] text-stone-500 mb-5 min-h-[16px]">{price.sub}</p>

                                <ul className="space-y-2 mb-6 flex-1">
                                    {bulletsFor(tier).slice(0, 8).map(b => (
                                        <li key={b} className="flex items-start gap-2 text-xs">
                                            <Check className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />
                                            <span className="text-stone-700">{b}</span>
                                        </li>
                                    ))}
                                </ul>

                                {/* CTA — three flavors:
                                    1) Current plan → emerald "Current Plan" pill (not clickable)
                                    2) Agency → "Talk to us" anchor (HubSpot)
                                    3) Free / Light / Pro → Stripe checkout via onUpgrade */}
                                {isCurrent ? (
                                    <div className="w-full py-2.5 rounded-full font-bold text-xs text-center bg-emerald-100 text-emerald-700 border border-emerald-200 flex items-center justify-center gap-1.5">
                                        <CheckCircle2 className="w-3.5 h-3.5" /> Current Plan
                                    </div>
                                ) : isAgency ? (
                                    <Link
                                        href="https://meetings-na2.hubspot.com/americurial/intro-call?utm_source=billing&utm_medium=agency_tier"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="w-full py-2.5 rounded-full font-bold text-xs bg-stone-900 text-white hover:bg-stone-800 transition-all flex items-center justify-center gap-1.5"
                                    >
                                        <Phone className="w-3.5 h-3.5" /> Talk to us
                                    </Link>
                                ) : isFree ? (
                                    <button
                                        type="button"
                                        disabled
                                        className="w-full py-2.5 rounded-full font-bold text-xs bg-stone-100 text-stone-400 border border-stone-200 cursor-not-allowed"
                                    >
                                        Default after trial
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => onUpgrade(interval, tier.code as "light" | "pro")}
                                        disabled={upgrading}
                                        className={clsx(
                                            "w-full py-2.5 rounded-full font-bold text-xs transition-all inline-flex items-center justify-center gap-1.5",
                                            isMostPopular
                                                ? "bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800 shadow-md"
                                                : "bg-stone-900 text-white hover:bg-stone-800",
                                            "disabled:opacity-60",
                                        )}
                                    >
                                        {upgrading ? (
                                            <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Redirecting...</>
                                        ) : (
                                            <>
                                                {currentTier === "free" || subscriptionStatus === "free"
                                                    ? `Start 14-day ${tier.label} trial`
                                                    : `Switch to ${tier.label}`}
                                                <ArrowRight className="w-3.5 h-3.5" />
                                            </>
                                        )}
                                    </button>
                                )}

                                {!isCurrent && !isAgency && !isFree && (
                                    <p className="text-[10px] text-stone-400 text-center mt-2 leading-tight">
                                        Card required · 14-day trial · auto-converts to ${price.rawMonthly}/mo unless you cancel
                                    </p>
                                )}
                                {isVet && tier.code === "pro" && (
                                    <p className="text-[10px] text-emerald-600 text-center mt-2 font-bold">
                                        Veteran-owned: {VETERAN_DISCOUNT_PERCENT}% off applied at checkout
                                    </p>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Lightweight comparison sentence so users know there's a deeper table elsewhere */}
            <p className="text-center text-xs text-stone-500 mt-6">
                Need the full breakdown? See <Link href="/pricing" className="underline hover:text-stone-700">every feature side-by-side →</Link>
            </p>

            {/* Agency CTA — agencies/consultants get a separate sales path
                rather than a price card. Custom pricing, requires a call. */}
            <div className="mt-8 rounded-2xl border border-stone-200 bg-gradient-to-r from-stone-900 to-stone-800 text-white p-5 sm:p-6 flex items-center justify-between gap-4 max-w-3xl mx-auto">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="bg-emerald-500/20 p-2.5 rounded-lg flex-shrink-0">
                        <Crown className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div className="min-w-0">
                        <p className="font-bold text-sm leading-tight">Running federal capture for 5+ clients?</p>
                        <p className="text-xs text-stone-300 mt-1 leading-relaxed">
                            Our Agency tier gives consultancies multi-client workspaces, white-glove portals, white-labeling, and bulk proposal generation. Custom pricing.
                        </p>
                    </div>
                </div>
                <Link
                    href="https://meetings-na2.hubspot.com/americurial/intro-call?utm_source=billing&utm_medium=agency_footer_cta"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg font-bold text-xs inline-flex items-center gap-1.5 transition-colors flex-shrink-0 whitespace-nowrap"
                >
                    <Phone className="w-3.5 h-3.5" /> Talk to us
                </Link>
            </div>
        </div>
    );
}

/**
 * Static fallback so the page renders SOMETHING even if Supabase is down.
 * Matches the live plan_tiers row set as of migration 111.
 */
const STATIC_FALLBACK: PlanTierRow[] = [
    {
        code: "free", label: "Free", monthly_usd: 0, yearly_usd: null, sort_order: 10, is_public: true,
        limits: { matches_per_day: 50, team_seats: 1 },
    },
    {
        code: "light", label: "Light", monthly_usd: 39, yearly_usd: 374, sort_order: 20, is_public: true,
        limits: { matches_per_day: 200, sam_passthrough: true, competitor_profiles: true, partner_profiles: true, team_seats: 1 },
    },
    {
        code: "pro", label: "Pro", monthly_usd: 89, yearly_usd: 854, sort_order: 30, is_public: true,
        limits: {
            matches_per_day: 9999, state_local_access: true, sam_passthrough: true, competitor_profiles: true,
            partner_profiles: true, ai_proposals: true, ai_summaries: true, capability_statement_ai: true,
            export_data: true, api_access: true, team_seats: 5,
        },
    },
    {
        code: "agency", label: "Agencies & Consultants", monthly_usd: 399, yearly_usd: 3830, sort_order: 40, is_public: true,
        limits: {
            matches_per_day: 99999, state_local_access: true, sam_passthrough: true, competitor_profiles: true,
            partner_profiles: true, ai_proposals: true, ai_summaries: true, capability_statement_ai: true,
            export_data: true, api_access: true, client_management: true, client_portal: true,
            white_label: true, bulk_proposal_gen: true, priority_ai_models: true, dedicated_support: true,
            bulk_outreach: true, team_seats: 9999,
        },
    },
];
