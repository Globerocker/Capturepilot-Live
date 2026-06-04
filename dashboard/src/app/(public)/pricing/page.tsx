import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { Check, X, Calendar, ArrowRight, Sparkles } from "lucide-react";
import ConsultingCTA from "@/components/ConsultingCTA";

export const dynamic = "force-dynamic";
export const revalidate = 300;

export const metadata = {
    title: "Pricing — CapturePilot",
    description:
        "Find federal + state + local contracts that fit your business. 14-day free trial · Light $39/mo · Pro $89/mo. Cheaper than GovTribe, SamSearch, GovDash — with more SLED coverage.",
};

interface PlanTier {
    code: string;
    label: string;
    monthly_usd: number | null;
    yearly_usd: number | null;
    sort_order: number;
    is_public: boolean;
    limits: {
        max_saved_searches?: number;
        proposals_per_month?: number;
        matches_per_day?: number;
        capability_statement_ai?: boolean;
        sam_passthrough?: boolean;
        partners_search?: boolean;
        api_access?: boolean;
        team_seats?: number;
        competitor_profiles?: boolean;
        partner_profiles?: boolean;
        state_local_access?: boolean;
        ai_proposals?: boolean;
        ai_summaries?: boolean;
        export_data?: boolean;
        // ── Migration 111 (Agency tier):
        client_management?: boolean;
        client_portal?: boolean;
        white_label?: boolean;
        bulk_proposal_gen?: boolean;
        priority_ai_models?: boolean;
        dedicated_support?: boolean;
        bulk_outreach?: boolean;
    };
}

// Feature rows — declarative so we can render the same comparison across
// every tier. Order matters: most-differentiating features at top.
const FEATURE_ROWS: Array<{
    key: keyof PlanTier["limits"];
    label: string;
    kind: "number" | "bool";
    suffix?: string;
    unlimitedAt?: number;
}> = [
    { key: "matches_per_day", label: "Federal opportunity matches per day", kind: "number", suffix: "/day", unlimitedAt: 9999 },
    { key: "state_local_access", label: "State + county + city opportunities (48 states)", kind: "bool" },
    { key: "competitor_profiles", label: "Competitor profiles (80K+ contractors)", kind: "bool" },
    { key: "partner_profiles", label: "Teaming partner search + save", kind: "bool" },
    { key: "sam_passthrough", label: "Live SAM.gov passthrough search", kind: "bool" },
    { key: "ai_proposals", label: "AI proposal writer", kind: "bool" },
    { key: "ai_summaries", label: "AI opportunity summaries (per-opp)", kind: "bool" },
    { key: "capability_statement_ai", label: "AI capability statement editor", kind: "bool" },
    { key: "proposals_per_month", label: "AI proposals per month", kind: "number", suffix: "/mo", unlimitedAt: 999 },
    { key: "max_saved_searches", label: "Saved searches with alerts", kind: "number", unlimitedAt: 999 },
    { key: "export_data", label: "Export CSV / XLSX + PDF download", kind: "bool" },
    { key: "api_access", label: "API access + webhooks", kind: "bool" },
    { key: "team_seats", label: "Team seats", kind: "number", unlimitedAt: 999 },
    // ── Agency-only rows (migration 111) — surface them on /pricing so the
    // value gap between Pro and Agency is obvious.
    { key: "client_management", label: "Multi-client workspace", kind: "bool" },
    { key: "client_portal", label: "White-glove client portals", kind: "bool" },
    { key: "white_label", label: "White-label (custom domain + logo)", kind: "bool" },
    { key: "bulk_proposal_gen", label: "Bulk proposal generation", kind: "bool" },
    { key: "priority_ai_models", label: "GPT-4o on every AI feature", kind: "bool" },
    { key: "dedicated_support", label: "Dedicated CSM + private Slack", kind: "bool" },
    { key: "bulk_outreach", label: "Outbound prospect campaigns", kind: "bool" },
];

// Competitor comparison data — sourced from docs/PRICING_STRATEGY.md
// (which is sourced from archive/research-2026-04/COMPETITIVE_ANALYSIS.md).
// Update this if competitor pricing changes (verify quarterly).
const COMPETITORS: Array<{
    name: string;
    cheapest: string;
    midTier: string;
    sledIncluded: boolean | "addon";
    aiProposals: boolean;
    apiAccess: boolean;
    annualOnly: boolean;
    trial: string;
}> = [
    { name: "CapturePilot Light", cheapest: "$39/mo", midTier: "$89/mo Pro", sledIncluded: true, aiProposals: true, apiAccess: true, annualOnly: false, trial: "14d free" },
    { name: "GovTribe", cheapest: "$112/mo ($1,350/yr)", midTier: "$150/mo ($1,800/yr) +SLED", sledIncluded: "addon", aiProposals: false, apiAccess: false, annualOnly: true, trial: "14d" },
    { name: "HigherGov", cheapest: "$42/mo ($500/yr)", midTier: "$208/mo Standard", sledIncluded: true, aiProposals: false, apiAccess: true, annualOnly: true, trial: "trial" },
    { name: "SamSearch", cheapest: "$99/mo", midTier: "$149-199/mo Pro", sledIncluded: true, aiProposals: true, apiAccess: false, annualOnly: false, trial: "7d" },
    { name: "Fed-Spend", cheapest: "$49/mo", midTier: "$199/mo Pro", sledIncluded: false, aiProposals: false, apiAccess: true, annualOnly: false, trial: "mo-to-mo" },
    { name: "GovDash", cheapest: "Custom", midTier: "Custom", sledIncluded: true, aiProposals: true, apiAccess: true, annualOnly: true, trial: "demo" },
    { name: "Bloomberg Gov", cheapest: "$7.5K/yr ($625/mo)", midTier: "$14K/yr", sledIncluded: false, aiProposals: false, apiAccess: false, annualOnly: true, trial: "demo" },
    { name: "GovWin (Deltek)", cheapest: "$12K/yr ($1,000/mo)", midTier: "$24K/yr", sledIncluded: "addon", aiProposals: true, apiAccess: false, annualOnly: true, trial: "demo" },
];

const FAQ: Array<{ q: string; a: string }> = [
    {
        q: "Why is CapturePilot so much cheaper than GovTribe / SamSearch?",
        a: "We use proprietary scrapers (Bonfire JSON, OpenGov, FlareSolverr for CF-protected portals) and Ollama for cheap-side AI tasks instead of paying for enterprise data providers. Same SLED coverage (48 states, 200+ portals), same AI capabilities — we just don't pay the enterprise toll. The catch: we don't have a dedicated analyst team like Deltek or BGOV. If you need an analyst calling agencies for you, GovWin is your tool.",
    },
    {
        q: "What's actually in the 14-day free trial?",
        a: "Full Pro access EXCEPT API + bulk export (anti-scrape: prevents people from signing up, downloading 65K opps in 1 hour, and cancelling). You get all the AI features, all the SLED data, all the matching — for 14 days. On day 15 you auto-convert to Pro $89/mo if your card is on file; you can downgrade to Light or cancel before then with no charge.",
    },
    {
        q: "What if I just want federal opportunities?",
        a: "Light at $39/mo is for you. Federal SAM.gov firehose, 200 matches/day, competitor + partner profiles, NAICS-aware scoring. No state/local, no AI. Upgrade anytime if you want SLED coverage or AI proposals.",
    },
    {
        q: "Can I cancel anytime?",
        a: "Yes — month-to-month, no annual contracts (annual gets 20% off but is optional). When you cancel we offer a 25% retention discount for 2 months; after that period it reverts to full price. Cancel-on-renewal works too.",
    },
    {
        q: "Why not pay for an analyst service instead?",
        a: "If you have $24K/yr to spend and you'd rather have a human ringing your phone with pre-RFP leads, that's GovWin/Deltek. We're for small/mid contractors who'd rather DIY with great tools — or pay our consulting team for the white-glove version (book a call below).",
    },
    {
        q: "What about a custom plan for my company?",
        a: "Enterprise is contact-sales — custom seat counts, SLA, dedicated support, optional white-label. Reach out via the chat or book a call.",
    },
];

async function fetchTiers(): Promise<PlanTier[]> {
    // plan_tiers RLS lets everyone read — anon key is fine.
    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false } },
    );
    const { data, error } = await sb
        .from("plan_tiers")
        .select("code, label, monthly_usd, yearly_usd, sort_order, is_public, limits")
        .eq("is_public", true)
        .neq("code", "consulting")  // hide the consulting pseudo-tier — has its own CTA
        .order("sort_order");
    if (error) return [];
    return (data || []) as PlanTier[];
}

function fmtNumber(v: number, unlimitedAt?: number, suffix?: string): string {
    if (unlimitedAt && v >= unlimitedAt) return "Unlimited";
    return suffix ? `${v.toLocaleString()}${suffix}` : v.toLocaleString();
}

function ctaFor(tier: PlanTier): { label: string; href: string; primary: boolean } {
    if (tier.code === "free") return { label: "Start free", href: "/signup", primary: false };
    // Agency tier is high-touch: route through HubSpot booking, not Stripe.
    // Bigger ACV + multi-client setup needs a call before checkout.
    if (tier.code === "agency" || tier.code === "enterprise") {
        return {
            label: "Talk to us",
            href: "https://meetings-na2.hubspot.com/americurial/intro-call?utm_source=pricing&utm_medium=agency_tier_cta",
            primary: false,
        };
    }
    return { label: `Start 14-day ${tier.label} trial`, href: `/signup?plan=${tier.code}`, primary: tier.code === "pro" };
}

/**
 * Stripe-hosted Payment Link URLs (live, with 14-day trial baked in). For
 * users who'd rather skip the app signup and go straight to Stripe Checkout.
 * Regenerate via tools/41_create_stripe_products.mjs when prices change —
 * the script prints these URLs at the end of its run.
 */
const PAYMENT_LINKS: Record<string, string> = {
    light: "https://buy.stripe.com/6oUbJ16zT0zhcmW59kgIo00",   // Light $39/mo
    pro:   "https://buy.stripe.com/6oU00jbUd3Lt5YydFQgIo02",   // Pro $89/mo
};

export default async function PricingPage() {
    const tiers = await fetchTiers();

    if (tiers.length === 0) {
        return (
            <main className="max-w-4xl mx-auto px-6 py-20 text-center">
                <h1 className="text-3xl font-bold mb-4">Pricing</h1>
                <p className="text-stone-500">Pricing details temporarily unavailable. Please email <a href="mailto:hello@capturepilot.com" className="underline">hello@capturepilot.com</a>.</p>
            </main>
        );
    }

    return (
        <main className="max-w-7xl mx-auto px-6 py-12 lg:py-20">

            {/* ────────────── HERO ────────────── */}
            <section className="text-center max-w-3xl mx-auto mb-12 lg:mb-16">
                <div className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-full mb-4">
                    <Sparkles className="w-3 h-3" /> 14-day full Pro trial · no commitment
                </div>
                <h1 className="text-4xl lg:text-5xl font-extrabold text-stone-900 tracking-tight mb-4">
                    Federal contracts shouldn't cost <span className="line-through text-stone-400">$24,000/yr</span>.
                </h1>
                <p className="text-lg text-stone-600 leading-relaxed">
                    The SLED + AI bundle our competitors charge $1,800-$5,500/yr for —
                    starting at <strong>$39/mo</strong>.
                </p>
            </section>

            {/* ────────────── TIER CARDS ────────────── */}
            <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-16">
                {tiers.map(t => {
                    const cta = ctaFor(t);
                    const monthly = t.monthly_usd === null ? "Custom" : t.monthly_usd === 0 ? "$0" : `$${t.monthly_usd}`;
                    const yearly = t.yearly_usd === null ? null : `$${t.yearly_usd.toLocaleString()}/yr (save 20%)`;
                    const isHighlighted = t.code === "pro";
                    return (
                        <div
                            key={t.code}
                            className={
                                "rounded-2xl border p-6 flex flex-col " +
                                (isHighlighted
                                    ? "border-emerald-500 ring-2 ring-emerald-200 bg-white relative shadow-sm"
                                    : "border-stone-200 bg-white")
                            }
                        >
                            {isHighlighted && (
                                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-600 text-white text-xs font-bold px-3 py-1 rounded-full">
                                    Most popular
                                </div>
                            )}
                            <h3 className="text-lg font-bold text-stone-900 mb-1">{t.label}</h3>
                            <div className="text-3xl font-extrabold text-stone-900 mb-1">
                                {monthly}
                                {t.monthly_usd !== null && t.monthly_usd > 0 && (
                                    <span className="text-sm font-medium text-stone-500">/mo</span>
                                )}
                            </div>
                            {yearly && <div className="text-xs text-emerald-700 font-medium mb-4">{yearly}</div>}
                            {!yearly && <div className="text-xs text-stone-500 mb-4">{t.code === "free" ? "After trial · forever free" : "Annual billing"}</div>}

                            <Link
                                href={cta.href}
                                className={
                                    "block text-center font-bold text-sm py-2.5 rounded-lg mb-2 transition-colors " +
                                    (cta.primary
                                        ? "bg-emerald-600 text-white hover:bg-emerald-700"
                                        : "bg-stone-900 text-white hover:bg-stone-800")
                                }
                            >
                                {cta.label}
                            </Link>
                            {PAYMENT_LINKS[t.code] ? (
                                <a
                                    href={PAYMENT_LINKS[t.code]}
                                    className="block text-center text-xs text-stone-500 hover:text-stone-700 underline mb-5"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    Or check out directly via Stripe →
                                </a>
                            ) : (
                                <div className="mb-5" />
                            )}

                            <ul className="space-y-2 text-sm flex-1">
                                {FEATURE_ROWS.slice(0, 8).map(row => {
                                    const v = (t.limits as Record<string, unknown>)[row.key];
                                    if (row.kind === "bool") {
                                        const on = !!v;
                                        return (
                                            <li key={row.key} className="flex items-start gap-2">
                                                {on
                                                    ? <Check className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                                                    : <X className="w-4 h-4 text-stone-300 flex-shrink-0 mt-0.5" />}
                                                <span className={on ? "text-stone-800" : "text-stone-400"}>{row.label}</span>
                                            </li>
                                        );
                                    }
                                    const num = (v as number) || 0;
                                    return (
                                        <li key={row.key} className="flex items-start gap-2">
                                            <Check className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                                            <span className="text-stone-800">
                                                <strong>{fmtNumber(num, row.unlimitedAt, row.suffix)}</strong> {row.label.toLowerCase()}
                                            </span>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    );
                })}
            </section>

            {/* ────────────── CONSULTING CTA ────────────── */}
            <section className="mb-16">
                <ConsultingCTA variant="banner" placement="pricing_page_mid"
                    headline="Don't want to DIY any of this?"
                    sub="We'll take over your federal capture for you. Free 30-min audit call — leave with 3 live opportunities tailored to your business." />
            </section>

            {/* ────────────── FULL FEATURE COMPARISON ────────────── */}
            <section className="mb-16">
                <h2 className="text-2xl font-bold text-stone-900 mb-2">Full feature comparison</h2>
                <p className="text-stone-500 mb-6">Every feature, every tier — no asterisks.</p>
                <div className="overflow-x-auto border border-stone-200 rounded-2xl">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-stone-50 border-b border-stone-200">
                                <th className="text-left p-4 font-bold text-stone-900">Feature</th>
                                {tiers.map(t => (
                                    <th key={t.code} className="text-center p-4 font-bold text-stone-900 min-w-[100px]">
                                        {t.label}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {FEATURE_ROWS.map(row => (
                                <tr key={row.key} className="border-b border-stone-100 last:border-0">
                                    <td className="p-4 text-stone-700">{row.label}</td>
                                    {tiers.map(t => {
                                        const v = (t.limits as Record<string, unknown>)[row.key];
                                        if (row.kind === "bool") {
                                            return (
                                                <td key={t.code} className="p-4 text-center">
                                                    {v
                                                        ? <Check className="w-4 h-4 text-emerald-600 inline" />
                                                        : <X className="w-4 h-4 text-stone-300 inline" />}
                                                </td>
                                            );
                                        }
                                        const num = (v as number) || 0;
                                        return (
                                            <td key={t.code} className="p-4 text-center text-stone-900 font-medium">
                                                {fmtNumber(num, row.unlimitedAt, row.suffix)}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* ────────────── COMPETITOR COMPARISON ────────────── */}
            <section className="mb-16">
                <h2 className="text-2xl font-bold text-stone-900 mb-2">How we compare</h2>
                <p className="text-stone-500 mb-6">
                    Mid-market federal contracting tools, ranked by price. Verified June 2026 from each provider's public pricing pages.
                </p>
                <div className="overflow-x-auto border border-stone-200 rounded-2xl">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-stone-50 border-b border-stone-200">
                                <th className="text-left p-4 font-bold text-stone-900">Provider</th>
                                <th className="text-left p-4 font-bold text-stone-900">Entry tier</th>
                                <th className="text-left p-4 font-bold text-stone-900">Mid tier</th>
                                <th className="text-center p-4 font-bold text-stone-900">SLED</th>
                                <th className="text-center p-4 font-bold text-stone-900">AI proposals</th>
                                <th className="text-center p-4 font-bold text-stone-900">API</th>
                                <th className="text-center p-4 font-bold text-stone-900">Trial</th>
                            </tr>
                        </thead>
                        <tbody>
                            {COMPETITORS.map(c => {
                                const us = c.name.startsWith("CapturePilot");
                                return (
                                    <tr key={c.name} className={"border-b border-stone-100 last:border-0 " + (us ? "bg-emerald-50/50" : "")}>
                                        <td className={"p-4 " + (us ? "font-bold text-emerald-700" : "text-stone-900 font-medium")}>{c.name}</td>
                                        <td className="p-4 text-stone-700">{c.cheapest}</td>
                                        <td className="p-4 text-stone-700">{c.midTier}</td>
                                        <td className="p-4 text-center">
                                            {c.sledIncluded === true
                                                ? <Check className="w-4 h-4 text-emerald-600 inline" />
                                                : c.sledIncluded === "addon"
                                                    ? <span className="text-amber-600 text-xs font-bold">Add-on</span>
                                                    : <X className="w-4 h-4 text-stone-300 inline" />}
                                        </td>
                                        <td className="p-4 text-center">
                                            {c.aiProposals ? <Check className="w-4 h-4 text-emerald-600 inline" /> : <X className="w-4 h-4 text-stone-300 inline" />}
                                        </td>
                                        <td className="p-4 text-center">
                                            {c.apiAccess ? <Check className="w-4 h-4 text-emerald-600 inline" /> : <X className="w-4 h-4 text-stone-300 inline" />}
                                        </td>
                                        <td className="p-4 text-center text-stone-600 text-xs">{c.trial}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                <p className="text-xs text-stone-400 mt-3">
                    Sources: each provider's public pricing page; full citations in <code className="bg-stone-100 px-1.5 py-0.5 rounded">docs/PRICING_STRATEGY.md</code> in the CapturePilot repo. Prices verified June 2026.
                </p>
            </section>

            {/* ────────────── FAQ ────────────── */}
            <section className="mb-16">
                <h2 className="text-2xl font-bold text-stone-900 mb-6">Common questions</h2>
                <div className="space-y-3">
                    {FAQ.map(({ q, a }) => (
                        <details key={q} className="border border-stone-200 rounded-xl bg-white">
                            <summary className="font-bold text-stone-900 cursor-pointer p-4 flex items-center justify-between text-sm">
                                {q}
                                <span className="text-stone-400 text-xs">▼</span>
                            </summary>
                            <div className="px-4 pb-4 text-stone-700 text-sm leading-relaxed">{a}</div>
                        </details>
                    ))}
                </div>
            </section>

            {/* ────────────── FINAL CTA ────────────── */}
            <section className="bg-gradient-to-br from-stone-900 to-stone-800 text-white rounded-2xl p-8 lg:p-12 text-center">
                <h2 className="text-3xl font-bold mb-2">Try Pro free for 14 days.</h2>
                <p className="text-stone-300 mb-6 max-w-2xl mx-auto">
                    Full access to SLED, AI proposals, and competitor intelligence. No charge until day 15 — cancel anytime, no questions asked.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                    <Link href="/signup?plan=pro" className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 rounded-lg font-bold inline-flex items-center gap-2 transition-colors">
                        <Sparkles className="w-4 h-4" /> Start 14-day Pro trial <ArrowRight className="w-4 h-4" />
                    </Link>
                    <Link href={process.env.NEXT_PUBLIC_HUBSPOT_MEETINGS_URL || "https://meetings.hubspot.com/andre-schuler"} target="_blank" rel="noopener noreferrer" className="bg-stone-800 hover:bg-stone-700 text-white px-6 py-3 rounded-lg font-bold inline-flex items-center gap-2 transition-colors border border-stone-700">
                        <Calendar className="w-4 h-4" /> Or book a free 30-min call
                    </Link>
                </div>
            </section>

        </main>
    );
}
