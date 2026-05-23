import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { Check, X } from "lucide-react";

export const dynamic = "force-dynamic";
export const revalidate = 300;

export const metadata = {
    title: "Pricing — CapturePilot",
    description:
        "Plans for federal contractors at every stage. Find matches, write proposals, and win more government work without enterprise pricing.",
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
    };
}

// Feature rows — declarative so we can render the same comparison across
// every tier. Keys must match what's in plan_tiers.limits.
const FEATURE_ROWS: Array<{
    key: keyof PlanTier["limits"];
    label: string;
    /** Render as number (limit) or boolean (check/x). */
    kind: "number" | "bool";
    /** For numbers, suffix appended (e.g. "/mo", "/day"). */
    suffix?: string;
    /** "unlimited" threshold — values >= this render as ∞ */
    unlimitedAt?: number;
}> = [
    { key: "matches_per_day", label: "Opportunity matches per day", kind: "number", suffix: "/day", unlimitedAt: 9999 },
    { key: "max_saved_searches", label: "Saved searches with alerts", kind: "number", unlimitedAt: 999 },
    { key: "proposals_per_month", label: "AI-generated proposals", kind: "number", suffix: "/mo", unlimitedAt: 999 },
    { key: "team_seats", label: "Team seats", kind: "number", unlimitedAt: 999 },
    { key: "sam_passthrough", label: "Live SAM.gov passthrough search", kind: "bool" },
    { key: "partners_search", label: "Teaming partner finder", kind: "bool" },
    { key: "capability_statement_ai", label: "AI capability statement", kind: "bool" },
    { key: "api_access", label: "API access", kind: "bool" },
];

async function fetchTiers(): Promise<PlanTier[]> {
    // plan_tiers RLS lets everyone read — anon key is fine.
    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false } },
    );
    const { data } = await sb
        .from("plan_tiers")
        .select("code, label, monthly_usd, yearly_usd, sort_order, is_public, limits")
        .eq("is_public", true)
        .order("sort_order", { ascending: true });
    return (data || []) as PlanTier[];
}

function fmtNumber(v: number | undefined, unlimitedAt: number | undefined, suffix: string | undefined): string {
    if (v == null) return "—";
    if (unlimitedAt != null && v >= unlimitedAt) return "Unlimited";
    return suffix ? `${v.toLocaleString()}${suffix}` : v.toLocaleString();
}

function ctaFor(tier: PlanTier): { label: string; href: string; primary: boolean } {
    if (tier.code === "free") return { label: "Start free", href: "/signup", primary: false };
    if (tier.code === "enterprise") return { label: "Contact sales", href: "mailto:info@fillcart.de?subject=Enterprise%20plan%20inquiry", primary: false };
    return { label: `Start ${tier.label} trial`, href: `/signup?plan=${tier.code}`, primary: tier.code === "pro" };
}

export default async function PricingPage() {
    const tiers = await fetchTiers();

    // Empty-state — useful when /plan_tiers hasn't been seeded yet (mostly
    // an early-dev safeguard, the migration always seeds 5 rows).
    if (tiers.length === 0) {
        return (
            <main className="max-w-4xl mx-auto py-20 px-4">
                <h1 className="text-4xl font-bold mb-4">Pricing</h1>
                <p className="text-stone-500">
                    Plans aren&apos;t configured yet. <Link href="/" className="text-emerald-700 underline">Back home</Link>.
                </p>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-stone-50 py-12 sm:py-20 px-4">
            <div className="max-w-6xl mx-auto">
                <div className="text-center mb-12">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700 mb-3">Pricing</p>
                    <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-stone-900 mb-4">
                        Plans for every stage of your B2G journey
                    </h1>
                    <p className="text-lg text-stone-600 max-w-2xl mx-auto">
                        Find matching opportunities, write proposals, and win contracts. No setup fees, cancel any time.
                    </p>
                </div>

                {/* Tier cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-16">
                    {tiers.map(t => {
                        const cta = ctaFor(t);
                        const featured = t.code === "pro";
                        const monthly = t.monthly_usd;
                        const yearly = t.yearly_usd;
                        const yearlySavings = monthly && yearly ? Math.round((1 - (yearly / 12) / monthly) * 100) : null;
                        return (
                            <div
                                key={t.code}
                                className={
                                    featured
                                        ? "relative bg-white rounded-2xl border-2 border-emerald-500 p-6 shadow-lg ring-2 ring-emerald-100"
                                        : "bg-white rounded-2xl border border-stone-200 p-6"
                                }
                            >
                                {featured && (
                                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-600 text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full shadow">
                                        Most popular
                                    </span>
                                )}
                                <h2 className="font-bold text-xl text-stone-900 mb-1">{t.label}</h2>
                                <div className="mb-4 h-12">
                                    {monthly == null ? (
                                        <p className="text-2xl font-black text-stone-900">Custom</p>
                                    ) : monthly === 0 ? (
                                        <p className="text-2xl font-black text-stone-900">Free</p>
                                    ) : (
                                        <>
                                            <p className="text-2xl font-black text-stone-900">
                                                ${monthly}<span className="text-sm font-medium text-stone-500">/mo</span>
                                            </p>
                                            {yearly && yearlySavings && (
                                                <p className="text-[11px] text-emerald-700 font-bold">
                                                    Save {yearlySavings}% annually
                                                </p>
                                            )}
                                        </>
                                    )}
                                </div>
                                <Link
                                    href={cta.href}
                                    className={
                                        cta.primary
                                            ? "block text-center bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm px-4 py-2.5 rounded-full transition-colors"
                                            : "block text-center bg-stone-900 hover:bg-stone-800 text-white font-bold text-sm px-4 py-2.5 rounded-full transition-colors"
                                    }
                                >
                                    {cta.label}
                                </Link>

                                {/* Compact feature list per tier */}
                                <ul className="mt-5 space-y-2 text-xs">
                                    {FEATURE_ROWS.slice(0, 5).map(row => {
                                        const v = t.limits[row.key];
                                        return (
                                            <li key={row.key} className="flex items-start gap-2">
                                                {row.kind === "bool" ? (
                                                    v ? <Check className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0 mt-0.5" /> : <X className="w-3.5 h-3.5 text-stone-300 flex-shrink-0 mt-0.5" />
                                                ) : (
                                                    <Check className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0 mt-0.5" />
                                                )}
                                                <span className={row.kind === "bool" && !v ? "text-stone-400 line-through" : "text-stone-700"}>
                                                    {row.kind === "bool" ? row.label : `${fmtNumber(v as number, row.unlimitedAt, row.suffix)} ${row.label.toLowerCase()}`}
                                                </span>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>
                        );
                    })}
                </div>

                {/* Full feature comparison table — same data, but with explicit
                    per-tier columns so users can scan exactly what differs. */}
                <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-stone-100">
                        <h2 className="font-bold text-lg text-stone-900">Compare features</h2>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-stone-200">
                                    <th className="text-left px-6 py-3 font-bold text-xs uppercase tracking-wider text-stone-500">Feature</th>
                                    {tiers.map(t => (
                                        <th key={t.code} className="px-4 py-3 font-bold text-stone-900 min-w-[110px]">
                                            {t.label}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {FEATURE_ROWS.map(row => (
                                    <tr key={row.key} className="border-b border-stone-50 last:border-0">
                                        <td className="px-6 py-3 text-stone-700">{row.label}</td>
                                        {tiers.map(t => {
                                            const v = t.limits[row.key];
                                            return (
                                                <td key={t.code} className="text-center px-4 py-3 text-stone-700 tabular-nums">
                                                    {row.kind === "bool"
                                                        ? (v ? <Check className="w-4 h-4 text-emerald-600 mx-auto" /> : <X className="w-4 h-4 text-stone-300 mx-auto" />)
                                                        : fmtNumber(v as number, row.unlimitedAt, row.suffix)}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                <p className="text-center text-xs text-stone-500 mt-8">
                    All plans include unlimited match scoring, the federal opportunity firehose, and weekly market intelligence.
                    Trials are 14 days, no credit card needed.
                </p>
            </div>
        </main>
    );
}
