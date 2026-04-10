"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
    TrendingUp, Flame, MapPin, DollarSign, ArrowRight, Clock, AlertTriangle,
    BarChart3, Briefcase, Calendar,
} from "lucide-react";

export interface OpportunityStats {
    total_opportunities: number;
    total_estimated_value: number;
    hot_matches: number;
    warm_matches: number;
    total_matches: number;
    state_count: number;
    states: string[];
    naics_codes: string[];
    by_naics: { code: string; label: string; count: number; total_value: number }[];
    by_state: { state: string; count: number; total_value: number }[];
}

/**
 * Formats a dollar amount into a compact label ($1.2M, $450K, $9.8B).
 */
function fmtCurrency(amount: number): string {
    if (!amount || amount <= 0) return "$0";
    if (amount >= 1_000_000_000) return `$${(amount / 1_000_000_000).toFixed(1)}B`;
    if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
    if (amount >= 1_000) return `$${Math.round(amount / 1_000)}K`;
    return `$${amount.toLocaleString()}`;
}

/**
 * CountUp — lightweight animated counter (no deps). Ramps 0 → target over ~1s.
 * Used on the four headline numbers to draw the eye.
 */
function CountUp({ end, duration = 900, prefix = "", suffix = "", decimals = 0 }: {
    end: number;
    duration?: number;
    prefix?: string;
    suffix?: string;
    decimals?: number;
}) {
    const [value, setValue] = useState(0);

    useEffect(() => {
        if (end <= 0) {
            setValue(0);
            return;
        }
        const start = performance.now();
        let raf = 0;
        const step = (now: number) => {
            const elapsed = now - start;
            const t = Math.min(1, elapsed / duration);
            // ease-out cubic
            const eased = 1 - Math.pow(1 - t, 3);
            setValue(end * eased);
            if (t < 1) raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
        return () => cancelAnimationFrame(raf);
    }, [end, duration]);

    const display = decimals > 0
        ? value.toFixed(decimals)
        : Math.round(value).toLocaleString();

    return <span>{prefix}{display}{suffix}</span>;
}

/**
 * AnimatedMoney — counts up through magnitudes (K → M → B) smoothly.
 */
function AnimatedMoney({ amount, duration = 1100 }: { amount: number; duration?: number }) {
    const [value, setValue] = useState(0);

    useEffect(() => {
        if (amount <= 0) {
            setValue(0);
            return;
        }
        const start = performance.now();
        let raf = 0;
        const step = (now: number) => {
            const elapsed = now - start;
            const t = Math.min(1, elapsed / duration);
            const eased = 1 - Math.pow(1 - t, 3);
            setValue(amount * eased);
            if (t < 1) raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
        return () => cancelAnimationFrame(raf);
    }, [amount, duration]);

    return <span>{fmtCurrency(value)}</span>;
}

// US state abbreviation → full name (for tooltips + bar labels)
const STATE_NAMES: Record<string, string> = {
    AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
    CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
    HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
    KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
    MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri",
    MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
    NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota",
    OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island",
    SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah",
    VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia",
    WI: "Wisconsin", WY: "Wyoming", DC: "Washington D.C.",
};

/**
 * OpportunityLandscape — the "your federal opportunity landscape" section.
 *
 * Displays (in order):
 *   1. Four big headline stat cards (with animated counters)
 *   2. Horizontal bar chart — by state
 *   3. Horizontal bar chart — by NAICS
 *   4. Emerald-tinted "big pitch" callout with dual CTAs
 */
export function OpportunityLandscape({
    stats,
    meetingUrl = "https://meetings-na2.hubspot.com/americurial/intro-call",
    signupHref = "/signup",
}: {
    stats: OpportunityStats | null | undefined;
    meetingUrl?: string;
    signupHref?: string;
}) {
    if (!stats || stats.total_opportunities === 0) return null;

    const topStateValue = stats.by_state[0]?.total_value || 0;
    const topNaicsValue = stats.by_naics[0]?.total_value || 0;

    // Headline "$X.XM" for the pitch callout — round to 1 decimal in millions,
    // fall back to thousands/billions via fmtCurrency.
    const pitchValue = fmtCurrency(stats.total_estimated_value);

    return (
        <section className="space-y-5">
            <div>
                <h2 className="font-bold text-xl sm:text-2xl text-black flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-emerald-500" />
                    Your Federal Opportunity Landscape
                </h2>
                <p className="text-sm text-stone-500 mt-1">
                    Live federal opportunities matching your NAICS
                    {stats.states.length > 0 ? ` in ${stats.states.join(", ")}` : " nationwide"}.
                </p>
            </div>

            {/* Four big headline cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <StatCard
                    icon={<Briefcase className="w-4 h-4" />}
                    label="Active Opportunities"
                    accent="emerald"
                >
                    <CountUp end={stats.total_opportunities} />
                </StatCard>

                <StatCard
                    icon={<DollarSign className="w-4 h-4" />}
                    label="Total Pipeline Value"
                    accent="emerald"
                >
                    <AnimatedMoney amount={stats.total_estimated_value} />
                </StatCard>

                <StatCard
                    icon={<Flame className="w-4 h-4" />}
                    label="Strong Matches"
                    accent="red"
                    suffix={<span className="text-base text-red-500 font-semibold ml-1 tracking-normal">HOT</span>}
                >
                    <CountUp end={stats.hot_matches} />
                </StatCard>

                <StatCard
                    icon={<MapPin className="w-4 h-4" />}
                    label={stats.state_count === 1 ? "State Covered" : "States Covered"}
                    accent="blue"
                >
                    <CountUp end={stats.state_count} />
                </StatCard>
            </div>

            {/* State + NAICS breakdown bars */}
            {(stats.by_state.length > 0 || stats.by_naics.length > 0) && (
                <div className="grid lg:grid-cols-2 gap-4">
                    {stats.by_state.length > 0 && (
                        <BarBlock
                            title="By State"
                            icon={<MapPin className="w-4 h-4 text-emerald-500" />}
                            rows={stats.by_state.slice(0, 8).map(row => ({
                                key: row.state,
                                label: row.state,
                                sublabel: STATE_NAMES[row.state] || row.state,
                                count: row.count,
                                value: row.total_value,
                                pct: topStateValue > 0 ? (row.total_value / topStateValue) : 0,
                            }))}
                        />
                    )}

                    {stats.by_naics.length > 0 && (
                        <BarBlock
                            title="By NAICS Code"
                            icon={<Briefcase className="w-4 h-4 text-emerald-500" />}
                            rows={stats.by_naics.slice(0, 8).map(row => ({
                                key: row.code,
                                label: row.code,
                                sublabel: row.label,
                                count: row.count,
                                value: row.total_value,
                                pct: topNaicsValue > 0 ? (row.total_value / topNaicsValue) : 0,
                            }))}
                        />
                    )}
                </div>
            )}

            {/* The big pitch */}
            <div className="relative overflow-hidden rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-emerald-50/60 to-white p-6 sm:p-8 shadow-sm">
                <div className="absolute -right-16 -top-16 w-48 h-48 bg-emerald-200/40 rounded-full blur-3xl" aria-hidden />
                <div className="absolute -right-24 top-24 w-64 h-64 bg-emerald-100/60 rounded-full blur-3xl" aria-hidden />

                <div className="relative">
                    <div className="inline-flex items-center gap-1.5 text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-full uppercase tracking-wider mb-3">
                        <TrendingUp className="w-3 h-3" /> Your Pipeline, Right Now
                    </div>
                    <h3 className="text-2xl sm:text-3xl font-bold text-black leading-tight max-w-3xl">
                        There&apos;s{" "}
                        <span className="text-emerald-600">{pitchValue}</span>{" "}
                        in federal opportunities matching your business.
                    </h3>
                    <p className="text-base text-stone-600 mt-3 max-w-2xl">
                        You&apos;re already qualified for{" "}
                        <span className="font-bold text-black">{stats.total_opportunities.toLocaleString()}</span>{" "}
                        of them
                        {stats.states.length > 0 ? ` across ${stats.states.join(", ")}` : ""}.
                        {stats.hot_matches > 0 && (
                            <>
                                {" "}
                                <span className="font-bold text-red-600">{stats.hot_matches} are HOT matches</span>{" "}
                                — strong fit, ready to pursue.
                            </>
                        )}
                        {" "}Let us help you win them.
                    </p>

                    <div className="flex flex-col sm:flex-row gap-3 mt-5">
                        <Link
                            href={signupHref}
                            className="inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm px-6 py-3 rounded-xl shadow-sm transition-colors"
                        >
                            Start Free Trial <ArrowRight className="w-4 h-4" />
                        </Link>
                        <a
                            href={meetingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center gap-2 bg-white hover:bg-stone-50 text-stone-800 border-2 border-stone-200 hover:border-emerald-300 font-bold text-sm px-6 py-3 rounded-xl transition-colors"
                        >
                            Book a Strategy Call
                        </a>
                    </div>
                </div>
            </div>
        </section>
    );
}

/**
 * ConversionBottomSection — "don't let these slip away" urgency block.
 *
 * Rendered after the matches list. Hammers three stats that raise the cost of
 * inaction, then offers a single decisive CTA.
 */
export function ConversionBottomSection({
    stats,
    signupHref = "/signup",
}: {
    stats: OpportunityStats | null | undefined;
    signupHref?: string;
}) {
    if (!stats || stats.total_opportunities === 0) return null;

    return (
        <section className="bg-stone-900 text-white rounded-2xl p-6 sm:p-10 relative overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(16,185,129,0.25),transparent_50%)]" aria-hidden />
            <div className="relative">
                <div className="flex items-center gap-2 text-[10px] font-bold text-emerald-300 uppercase tracking-widest mb-3">
                    <AlertTriangle className="w-3 h-3" /> Don&apos;t let these slip away
                </div>
                <h3 className="text-2xl sm:text-3xl font-bold leading-tight max-w-2xl">
                    Federal contracts don&apos;t wait. Most response windows are{" "}
                    <span className="text-emerald-400">14–30 days</span>.
                </h3>

                <div className="grid sm:grid-cols-3 gap-4 mt-6">
                    <UrgencyStat
                        icon={<Calendar className="w-4 h-4" />}
                        value="45 days"
                        label="Average federal contract close time"
                    />
                    <UrgencyStat
                        icon={<Clock className="w-4 h-4" />}
                        value="14–30 days"
                        label="Typical response window"
                    />
                    <UrgencyStat
                        icon={<AlertTriangle className="w-4 h-4" />}
                        value="3× lower"
                        label="Win rate if you miss Sources Sought"
                    />
                </div>

                <div className="mt-6">
                    <Link
                        href={signupHref}
                        className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-stone-900 font-bold text-sm px-6 py-3 rounded-xl transition-colors"
                    >
                        Get Daily Opportunity Alerts <ArrowRight className="w-4 h-4" />
                    </Link>
                </div>
            </div>
        </section>
    );
}

// ---------- Internal building blocks ----------

function StatCard({
    icon, label, children, accent = "emerald", suffix,
}: {
    icon: React.ReactNode;
    label: string;
    children: React.ReactNode;
    accent?: "emerald" | "red" | "blue";
    suffix?: React.ReactNode;
}) {
    const accentColors = {
        emerald: "text-emerald-600",
        red: "text-red-600",
        blue: "text-blue-600",
    };
    const iconBg = {
        emerald: "bg-emerald-50 text-emerald-600 border-emerald-200",
        red: "bg-red-50 text-red-600 border-red-200",
        blue: "bg-blue-50 text-blue-600 border-blue-200",
    };

    return (
        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-4 sm:p-5 hover:shadow-md transition-shadow">
            <div className={`inline-flex items-center justify-center w-8 h-8 rounded-lg border ${iconBg[accent]} mb-3`}>
                {icon}
            </div>
            <div className={`text-4xl sm:text-5xl font-light tracking-tight ${accentColors[accent]}`}>
                {children}
                {suffix}
            </div>
            <div className="text-[11px] text-stone-500 uppercase tracking-wider font-semibold mt-1.5">
                {label}
            </div>
        </div>
    );
}

function BarBlock({
    title, icon, rows,
}: {
    title: string;
    icon: React.ReactNode;
    rows: { key: string; label: string; sublabel: string; count: number; value: number; pct: number }[];
}) {
    const [mounted, setMounted] = useState(false);
    useEffect(() => {
        const t = setTimeout(() => setMounted(true), 60);
        return () => clearTimeout(t);
    }, []);

    return (
        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
                {icon}
                <h3 className="font-bold text-sm text-black uppercase tracking-wider">{title}</h3>
            </div>
            <div className="space-y-3">
                {rows.map(row => (
                    <div key={row.key}>
                        <div className="flex items-center justify-between text-xs mb-1 gap-2">
                            <div className="flex items-baseline gap-2 min-w-0">
                                <span className="font-mono font-bold text-stone-800 flex-shrink-0">{row.label}</span>
                                <span className="text-stone-400 truncate text-[10px]">{row.sublabel}</span>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                                <span className="text-stone-400 text-[10px]">{row.count.toLocaleString()} opps</span>
                                <span className="font-bold text-emerald-600 tabular-nums">{fmtCurrency(row.value)}</span>
                            </div>
                        </div>
                        <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full transition-all duration-1000 ease-out"
                                style={{ width: mounted ? `${Math.max(4, Math.round(row.pct * 100))}%` : "0%" }}
                            />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function UrgencyStat({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
    return (
        <div className="bg-white/5 border border-white/10 rounded-xl p-4 backdrop-blur-sm">
            <div className="flex items-center gap-1.5 text-emerald-300 mb-2">{icon}</div>
            <div className="text-2xl font-light text-white tabular-nums">{value}</div>
            <div className="text-[11px] text-stone-400 mt-1 leading-tight">{label}</div>
        </div>
    );
}
