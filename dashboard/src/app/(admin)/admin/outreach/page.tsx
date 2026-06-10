"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Megaphone, BarChart3, Mail, Users, Inbox, FileText, ShieldOff, Settings as SettingsIcon,
    Loader2, ChevronDown, ArrowUpRight, ArrowDownRight, Minus, ShieldCheck, AlertTriangle,
    MessageCircle, MousePointerClick, MailCheck, Send, UserMinus,
} from "lucide-react";
import clsx from "clsx";

// ---------- constants ----------

type TabId = "overview" | "campaigns" | "contacts" | "inbox" | "templates" | "suppression" | "settings";

const TABS: { id: TabId; label: string; icon: typeof Megaphone }[] = [
    { id: "overview", label: "Overview", icon: BarChart3 },
    { id: "campaigns", label: "Campaigns", icon: Megaphone },
    { id: "contacts", label: "Contacts", icon: Users },
    { id: "inbox", label: "Inbox", icon: Inbox },
    { id: "templates", label: "Templates", icon: FileText },
    { id: "suppression", label: "Suppression", icon: ShieldOff },
    { id: "settings", label: "Settings", icon: SettingsIcon },
];

// B2B cold outreach benchmarks (percentages).
const BENCHMARKS = {
    delivered_rate: 97,
    open_rate: 35,
    click_rate: 3,
    reply_rate: 6,
    bounce_rate: 2,
    unsubscribe_rate: 1,
};

type Preset = "today" | "7d" | "30d" | "90d" | "qtd" | "ytd" | "custom";
const PRESETS: { id: Preset; label: string }[] = [
    { id: "today", label: "Today" },
    { id: "7d", label: "7d" },
    { id: "30d", label: "30d" },
    { id: "90d", label: "90d" },
    { id: "qtd", label: "QTD" },
    { id: "ytd", label: "YTD" },
    { id: "custom", label: "Custom" },
];

// ---------- types ----------

interface KpiRow {
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    replied: number;
    bounced: number;
    unsubscribed: number;
    complaint: number;
}

interface DailyRow {
    day: string;
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    replied: number;
}

interface KpiPayload {
    current: KpiRow;
    previous: KpiRow | null;
    deltas: Record<string, number | null> | null;
    daily: DailyRow[];
    range: { from: string; to: string; prevFrom: string; prevTo: string };
}

interface TopCampaign {
    id: string;
    name: string;
    status: string;
    sent: number;
    reply_rate: number;
}

interface DomainReputation {
    domain: string;
    spf: "pass" | "fail" | "unknown";
    dkim: "pass" | "fail" | "unknown";
    dmarc: "pass" | "fail" | "unknown";
    last_checked: string | null;
    bounce_rate: number;
    complaint_rate: number;
}

// ---------- helpers ----------

function rangeForPreset(preset: Preset): { from: Date; to: Date } | null {
    const now = new Date();
    const to = new Date(now);
    if (preset === "today") {
        const from = new Date(now);
        from.setHours(0, 0, 0, 0);
        return { from, to };
    }
    if (preset === "7d") return { from: new Date(now.getTime() - 7 * 86400000), to };
    if (preset === "30d") return { from: new Date(now.getTime() - 30 * 86400000), to };
    if (preset === "90d") return { from: new Date(now.getTime() - 90 * 86400000), to };
    if (preset === "qtd") {
        const q = Math.floor(now.getMonth() / 3);
        return { from: new Date(now.getFullYear(), q * 3, 1), to };
    }
    if (preset === "ytd") return { from: new Date(now.getFullYear(), 0, 1), to };
    return null;
}

function fmtIsoDate(d: Date) {
    return d.toISOString().slice(0, 10);
}

function parseIsoDate(s: string | null): Date | null {
    if (!s) return null;
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
}

function fmtNumber(n: number) {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
    if (n >= 10_000) return (n / 1000).toFixed(1) + "k";
    return n.toLocaleString();
}

function rate(num: number, denom: number): number {
    if (!denom) return 0;
    return (num / denom) * 100;
}

function fmtRate(n: number) {
    return `${n.toFixed(1)}%`;
}

function benchmarkBadge(rateValue: number, target: number) {
    const ratio = rateValue / target;
    if (ratio >= 1) return { tone: "emerald", label: "Above target" };
    if (ratio >= 0.8) return { tone: "amber", label: "Near target" };
    return { tone: "red", label: "Below target" };
}

// ---------- page ----------

export default function AdminOutreachPage() {
    // Tab nav (hash-persisted)
    const [tab, setTab] = useState<TabId>("overview");
    const [tabMenuOpen, setTabMenuOpen] = useState(false);

    useEffect(() => {
        const apply = () => {
            const h = (window.location.hash || "#overview").replace("#", "");
            if (TABS.some((t) => t.id === h)) setTab(h as TabId);
        };
        apply();
        window.addEventListener("hashchange", apply);
        return () => window.removeEventListener("hashchange", apply);
    }, []);

    const switchTab = useCallback((id: TabId) => {
        setTab(id);
        setTabMenuOpen(false);
        if (typeof window !== "undefined") {
            const next = `#${id}`;
            if (window.location.hash !== next) {
                history.replaceState(null, "", next);
            }
        }
    }, []);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                    <p className="text-stone-400 text-xs uppercase tracking-widest font-medium mb-2">Admin Console</p>
                    <h1 className="text-2xl font-bold text-stone-900 flex items-center gap-2">
                        <Megaphone className="w-6 h-6" /> Outreach
                    </h1>
                </div>
            </div>

            {/* Sticky tab bar */}
            <div className="sticky top-0 z-20 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 bg-stone-50/95 backdrop-blur border-b border-stone-200">
                {/* Desktop tabs */}
                <nav className="hidden md:flex gap-1 overflow-x-auto" aria-label="Outreach tabs">
                    {TABS.map((t) => {
                        const Icon = t.icon;
                        const active = tab === t.id;
                        return (
                            <button
                                key={t.id}
                                type="button"
                                onClick={() => switchTab(t.id)}
                                className={clsx(
                                    "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                                    active
                                        ? "border-stone-900 text-stone-900"
                                        : "border-transparent text-stone-500 hover:text-stone-800 hover:border-stone-300"
                                )}
                                aria-current={active ? "page" : undefined}
                            >
                                <Icon className="w-4 h-4" />
                                {t.label}
                            </button>
                        );
                    })}
                </nav>

                {/* Mobile dropdown */}
                <div className="md:hidden py-2 relative">
                    <button
                        type="button"
                        onClick={() => setTabMenuOpen((o) => !o)}
                        className="w-full flex items-center justify-between bg-white border border-stone-200 rounded-xl px-4 py-2.5 text-sm font-medium"
                    >
                        <span className="flex items-center gap-2">
                            {(() => {
                                const Icon = TABS.find((t) => t.id === tab)!.icon;
                                return <Icon className="w-4 h-4" />;
                            })()}
                            {TABS.find((t) => t.id === tab)!.label}
                        </span>
                        <ChevronDown className={clsx("w-4 h-4 transition-transform", tabMenuOpen && "rotate-180")} />
                    </button>
                    {tabMenuOpen && (
                        <div className="absolute left-0 right-0 mt-1 bg-white border border-stone-200 rounded-xl shadow-lg overflow-hidden z-30">
                            {TABS.map((t) => {
                                const Icon = t.icon;
                                return (
                                    <button
                                        key={t.id}
                                        type="button"
                                        onClick={() => switchTab(t.id)}
                                        className={clsx(
                                            "w-full flex items-center gap-2 px-4 py-2.5 text-sm text-left hover:bg-stone-50",
                                            tab === t.id && "bg-stone-100 font-semibold"
                                        )}
                                    >
                                        <Icon className="w-4 h-4" />
                                        {t.label}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Tab content */}
            {tab === "overview" && <OverviewTab />}
            {tab !== "overview" && <PlaceholderTab id={tab} />}
        </div>
    );
}

// ---------- Overview tab ----------

function OverviewTab() {
    const [preset, setPreset] = useState<Preset>("30d");
    const [customFrom, setCustomFrom] = useState<string>("");
    const [customTo, setCustomTo] = useState<string>("");
    const [compare, setCompare] = useState<boolean>(true);

    const [data, setData] = useState<KpiPayload | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [topCampaigns, setTopCampaigns] = useState<TopCampaign[]>([]);
    const [reputation, setReputation] = useState<DomainReputation | null>(null);

    // Hydrate from URL once
    const hydratedRef = useRef(false);
    useEffect(() => {
        if (hydratedRef.current) return;
        hydratedRef.current = true;
        const sp = new URLSearchParams(window.location.search);
        const presetParam = sp.get("preset") as Preset | null;
        const fromParam = sp.get("from");
        const toParam = sp.get("to");
        const compareParam = sp.get("compare");
        if (presetParam && PRESETS.some((p) => p.id === presetParam)) setPreset(presetParam);
        if (fromParam) setCustomFrom(fromParam);
        if (toParam) setCustomTo(toParam);
        if (compareParam === "0") setCompare(false);
    }, []);

    // Resolve the active range
    const { from, to } = useMemo(() => {
        if (preset === "custom") {
            const f = parseIsoDate(customFrom);
            const t = parseIsoDate(customTo);
            const fallback = rangeForPreset("30d")!;
            return {
                from: f || fallback.from,
                to: t || fallback.to,
            };
        }
        return rangeForPreset(preset) || rangeForPreset("30d")!;
    }, [preset, customFrom, customTo]);

    // Sync to URL
    useEffect(() => {
        const sp = new URLSearchParams(window.location.search);
        sp.set("preset", preset);
        if (preset === "custom") {
            sp.set("from", fmtIsoDate(from));
            sp.set("to", fmtIsoDate(to));
        } else {
            sp.delete("from");
            sp.delete("to");
        }
        sp.set("compare", compare ? "1" : "0");
        const next = `${window.location.pathname}?${sp.toString()}${window.location.hash || "#overview"}`;
        history.replaceState(null, "", next);
    }, [preset, from, to, compare]);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({
                from: from.toISOString(),
                to: to.toISOString(),
                compare: compare ? "1" : "0",
            });
            const res = await fetch(`/api/admin/outreach/overview-kpis?${params.toString()}`, { cache: "no-store" });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error || `Request failed (${res.status})`);
            }
            const json = (await res.json()) as KpiPayload;
            setData(json);
        } catch (e) {
            setError((e as Error).message);
            setData(null);
        } finally {
            setLoading(false);
        }
    }, [from, to, compare]);

    useEffect(() => { void load(); }, [load]);

    // Best-effort load of top campaigns + domain reputation. These endpoints land in later M3.x streams;
    // until then we render an empty-state instead of erroring out.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`/api/admin/outreach/top-campaigns?from=${from.toISOString()}&to=${to.toISOString()}&limit=5`, { cache: "no-store" });
                if (!res.ok) throw new Error();
                const json = await res.json();
                if (!cancelled) setTopCampaigns(json.campaigns || []);
            } catch {
                if (!cancelled) setTopCampaigns([]);
            }
        })();
        (async () => {
            try {
                const res = await fetch(`/api/admin/outreach/domain-reputation`, { cache: "no-store" });
                if (!res.ok) throw new Error();
                const json = await res.json();
                if (!cancelled) setReputation(json.reputation || null);
            } catch {
                if (!cancelled) setReputation(null);
            }
        })();
        return () => { cancelled = true; };
    }, [from, to]);

    return (
        <div className="space-y-6">
            <RangeBar
                preset={preset}
                setPreset={setPreset}
                customFrom={customFrom || fmtIsoDate(from)}
                customTo={customTo || fmtIsoDate(to)}
                setCustomFrom={setCustomFrom}
                setCustomTo={setCustomTo}
                compare={compare}
                setCompare={setCompare}
            />

            {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" /> {error}
                </div>
            )}

            <KpiGrid data={data} loading={loading} />

            <TimeSeries daily={data?.daily || []} loading={loading} />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2">
                    <TopCampaignsTable campaigns={topCampaigns} loading={loading} />
                </div>
                <div>
                    <ReputationStrip reputation={reputation} current={data?.current} />
                </div>
            </div>
        </div>
    );
}

// ---------- Range bar ----------

function RangeBar(props: {
    preset: Preset;
    setPreset: (p: Preset) => void;
    customFrom: string;
    customTo: string;
    setCustomFrom: (s: string) => void;
    setCustomTo: (s: string) => void;
    compare: boolean;
    setCompare: (b: boolean) => void;
}) {
    const { preset, setPreset, customFrom, customTo, setCustomFrom, setCustomTo, compare, setCompare } = props;
    return (
        <div className="bg-white border border-stone-200 rounded-2xl p-3 flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 flex-wrap">
                {PRESETS.map((p) => (
                    <button
                        key={p.id}
                        type="button"
                        onClick={() => setPreset(p.id)}
                        className={clsx(
                            "px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors",
                            preset === p.id
                                ? "bg-stone-900 text-white"
                                : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                        )}
                    >
                        {p.label}
                    </button>
                ))}
            </div>

            {preset === "custom" && (
                <div className="flex items-center gap-2 ml-2">
                    <input
                        type="date"
                        value={customFrom}
                        onChange={(e) => setCustomFrom(e.target.value)}
                        className="border border-stone-200 rounded-lg px-2 py-1 text-xs"
                    />
                    <span className="text-stone-400 text-xs">to</span>
                    <input
                        type="date"
                        value={customTo}
                        onChange={(e) => setCustomTo(e.target.value)}
                        className="border border-stone-200 rounded-lg px-2 py-1 text-xs"
                    />
                </div>
            )}

            <label className="ml-auto flex items-center gap-2 text-xs font-medium text-stone-700 cursor-pointer">
                <input
                    type="checkbox"
                    checked={compare}
                    onChange={(e) => setCompare(e.target.checked)}
                    className="rounded border-stone-300"
                />
                Compare to previous period
            </label>
        </div>
    );
}

// ---------- KPI grid ----------

const KPI_DEFS = [
    { key: "sent", label: "Sent", icon: Send, color: "text-blue-500", rateOf: null as keyof KpiRow | null, benchmark: null as keyof typeof BENCHMARKS | null },
    { key: "delivered", label: "Delivered", icon: MailCheck, color: "text-emerald-500", rateOf: "sent" as keyof KpiRow, benchmark: "delivered_rate" as keyof typeof BENCHMARKS },
    { key: "opened", label: "Opened", icon: Mail, color: "text-violet-500", rateOf: "delivered" as keyof KpiRow, benchmark: "open_rate" as keyof typeof BENCHMARKS },
    { key: "clicked", label: "Clicked", icon: MousePointerClick, color: "text-amber-500", rateOf: "delivered" as keyof KpiRow, benchmark: "click_rate" as keyof typeof BENCHMARKS },
    { key: "replied", label: "Replied", icon: MessageCircle, color: "text-cyan-500", rateOf: "delivered" as keyof KpiRow, benchmark: "reply_rate" as keyof typeof BENCHMARKS },
    { key: "unsubscribed", label: "Unsubscribed", icon: UserMinus, color: "text-red-500", rateOf: "delivered" as keyof KpiRow, benchmark: "unsubscribe_rate" as keyof typeof BENCHMARKS },
] as const;

function KpiGrid({ data, loading }: { data: KpiPayload | null; loading: boolean }) {
    if (loading && !data) {
        return (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {KPI_DEFS.map((d) => (
                    <div key={d.key} className="bg-white border border-stone-200 rounded-2xl p-4 h-32 flex items-center justify-center">
                        <Loader2 className="w-4 h-4 animate-spin text-stone-300" />
                    </div>
                ))}
            </div>
        );
    }

    const curr = data?.current;
    const deltas = data?.deltas;

    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {KPI_DEFS.map((d) => {
                const n = Number(curr?.[d.key as keyof KpiRow] || 0);
                const rateValue = d.rateOf ? rate(n, Number(curr?.[d.rateOf] || 0)) : null;
                const benchmark = d.benchmark ? BENCHMARKS[d.benchmark] : null;
                const delta = deltas ? deltas[d.key] : null;
                const Icon = d.icon;

                return (
                    <div key={d.key} className="bg-white border border-stone-200 rounded-2xl p-4">
                        <div className="flex items-center justify-between mb-1">
                            <Icon className={clsx("w-4 h-4", d.color)} />
                            {delta != null && <DeltaBadge value={delta} />}
                        </div>
                        <p className="text-2xl font-black tabular-nums">{fmtNumber(n)}</p>
                        <p className="text-[10px] text-stone-500 uppercase tracking-wide">{d.label}</p>
                        {rateValue != null && (
                            <div className="mt-2 flex items-center justify-between gap-2">
                                <span className="text-xs font-semibold text-stone-700">{fmtRate(rateValue)}</span>
                                {benchmark != null && <BenchmarkBadge rateValue={rateValue} target={benchmark} />}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

function DeltaBadge({ value }: { value: number | null }) {
    if (value == null) return <span className="text-[10px] text-stone-400">—</span>;
    if (value === 0) {
        return (
            <span className="text-[10px] inline-flex items-center gap-0.5 text-stone-500 font-semibold">
                <Minus className="w-3 h-3" /> 0%
            </span>
        );
    }
    const up = value > 0;
    return (
        <span
            className={clsx(
                "text-[10px] inline-flex items-center gap-0.5 font-semibold",
                up ? "text-emerald-600" : "text-red-600"
            )}
        >
            {up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {Math.abs(value).toFixed(0)}%
        </span>
    );
}

function BenchmarkBadge({ rateValue, target }: { rateValue: number; target: number }) {
    const { tone, label } = benchmarkBadge(rateValue, target);
    const tones: Record<string, string> = {
        emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
        amber: "bg-amber-50 text-amber-700 border-amber-200",
        red: "bg-red-50 text-red-700 border-red-200",
    };
    return (
        <span
            title={`Benchmark ${target}% · ${label}`}
            className={clsx("text-[9px] font-bold uppercase border rounded-full px-1.5 py-0.5", tones[tone])}
        >
            {target}%
        </span>
    );
}

// ---------- Time series chart (lightweight SVG) ----------

function TimeSeries({ daily, loading }: { daily: DailyRow[]; loading: boolean }) {
    return (
        <div className="bg-white border border-stone-200 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
                <h2 className="font-bold text-sm text-stone-900 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4" /> Daily activity
                </h2>
                <div className="flex items-center gap-3 text-[10px] text-stone-500 uppercase tracking-wide">
                    <Legend color="bg-blue-500" label="Sent" />
                    <Legend color="bg-violet-500" label="Opened" />
                    <Legend color="bg-cyan-500" label="Replied" />
                </div>
            </div>
            {loading && daily.length === 0 ? (
                <div className="h-48 flex items-center justify-center">
                    <Loader2 className="w-5 h-5 animate-spin text-stone-300" />
                </div>
            ) : daily.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-xs text-stone-400">
                    No activity in this range yet.
                </div>
            ) : (
                <LineChart daily={daily} />
            )}
        </div>
    );
}

function Legend({ color, label }: { color: string; label: string }) {
    return (
        <span className="inline-flex items-center gap-1">
            <span className={clsx("w-2 h-2 rounded-full", color)} />
            {label}
        </span>
    );
}

function LineChart({ daily }: { daily: DailyRow[] }) {
    const width = 800;
    const height = 200;
    const pad = { top: 12, right: 12, bottom: 24, left: 36 };
    const w = width - pad.left - pad.right;
    const h = height - pad.top - pad.bottom;

    const maxVal = Math.max(
        1,
        ...daily.flatMap((d) => [d.sent, d.opened, d.replied])
    );

    const x = (i: number) => pad.left + (daily.length <= 1 ? w / 2 : (i / (daily.length - 1)) * w);
    const y = (v: number) => pad.top + h - (v / maxVal) * h;

    const path = (key: keyof DailyRow) =>
        daily
            .map((d, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(Number(d[key])).toFixed(1)}`)
            .join(" ");

    const ticks = 4;
    const tickVals = Array.from({ length: ticks + 1 }, (_, i) => Math.round((maxVal * i) / ticks));

    return (
        <div className="overflow-x-auto">
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-48">
                {/* Y axis grid */}
                {tickVals.map((tv, i) => (
                    <g key={i}>
                        <line
                            x1={pad.left}
                            x2={pad.left + w}
                            y1={y(tv)}
                            y2={y(tv)}
                            stroke="#f5f5f4"
                            strokeWidth={1}
                        />
                        <text x={pad.left - 6} y={y(tv) + 3} textAnchor="end" fontSize={9} fill="#a8a29e">
                            {fmtNumber(tv)}
                        </text>
                    </g>
                ))}

                {/* X axis labels (first / mid / last) */}
                {daily.length > 0 && (
                    <>
                        <text x={x(0)} y={height - 6} fontSize={9} fill="#a8a29e">
                            {daily[0].day.slice(5)}
                        </text>
                        {daily.length > 2 && (
                            <text x={x(Math.floor(daily.length / 2))} y={height - 6} fontSize={9} fill="#a8a29e" textAnchor="middle">
                                {daily[Math.floor(daily.length / 2)].day.slice(5)}
                            </text>
                        )}
                        <text x={x(daily.length - 1)} y={height - 6} fontSize={9} fill="#a8a29e" textAnchor="end">
                            {daily[daily.length - 1].day.slice(5)}
                        </text>
                    </>
                )}

                <path d={path("sent")} stroke="#3b82f6" strokeWidth={1.75} fill="none" />
                <path d={path("opened")} stroke="#8b5cf6" strokeWidth={1.75} fill="none" />
                <path d={path("replied")} stroke="#06b6d4" strokeWidth={1.75} fill="none" />
            </svg>
        </div>
    );
}

// ---------- Top campaigns ----------

function TopCampaignsTable({ campaigns, loading }: { campaigns: TopCampaign[]; loading: boolean }) {
    return (
        <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-stone-100 flex items-center justify-between">
                <h2 className="font-bold text-sm flex items-center gap-2">
                    <Megaphone className="w-4 h-4" /> Top campaigns
                </h2>
                <span className="text-[10px] text-stone-400 uppercase tracking-wide">By reply rate</span>
            </div>
            {loading && campaigns.length === 0 ? (
                <div className="h-32 flex items-center justify-center">
                    <Loader2 className="w-4 h-4 animate-spin text-stone-300" />
                </div>
            ) : campaigns.length === 0 ? (
                <div className="px-5 py-10 text-center text-xs text-stone-400">
                    No campaigns ran in this range yet.
                </div>
            ) : (
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-stone-100 text-[10px] text-stone-400 uppercase">
                            <th className="text-left px-5 py-2.5">Campaign</th>
                            <th className="text-center px-3 py-2.5">Status</th>
                            <th className="text-right px-3 py-2.5">Sent</th>
                            <th className="text-right px-5 py-2.5">Reply rate</th>
                        </tr>
                    </thead>
                    <tbody>
                        {campaigns.map((c) => (
                            <tr key={c.id} className="border-b border-stone-50 last:border-0 hover:bg-stone-50">
                                <td className="px-5 py-3">
                                    <a href={`/admin/outreach/campaigns/${c.id}`} className="font-medium text-stone-900 hover:underline">
                                        {c.name}
                                    </a>
                                </td>
                                <td className="text-center px-3 py-3">
                                    <span className="inline-block bg-stone-100 text-stone-700 text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase">
                                        {c.status}
                                    </span>
                                </td>
                                <td className="text-right px-3 py-3 tabular-nums">{fmtNumber(c.sent)}</td>
                                <td className="text-right px-5 py-3 font-semibold tabular-nums">
                                    {fmtRate(c.reply_rate)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}

// ---------- Reputation strip ----------

function ReputationStrip({ reputation, current }: { reputation: DomainReputation | null; current: KpiRow | undefined }) {
    const delivered = Number(current?.delivered || 0);
    const bounceRate = delivered ? (Number(current?.bounced || 0) / delivered) * 100 : 0;
    const complaintRate = delivered ? (Number(current?.complaint || 0) / delivered) * 100 : 0;

    return (
        <div className="bg-white border border-stone-200 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
                <h2 className="font-bold text-sm flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4" /> Domain reputation
                </h2>
                {reputation?.last_checked && (
                    <span className="text-[10px] text-stone-400 uppercase">
                        Checked {new Date(reputation.last_checked).toLocaleDateString()}
                    </span>
                )}
            </div>

            {reputation ? (
                <p className="text-xs text-stone-500 -mt-1">{reputation.domain}</p>
            ) : (
                <p className="text-xs text-stone-400 -mt-1">Domain check pending.</p>
            )}

            <div className="grid grid-cols-3 gap-2">
                <AuthBadge label="SPF" state={reputation?.spf ?? "unknown"} />
                <AuthBadge label="DKIM" state={reputation?.dkim ?? "unknown"} />
                <AuthBadge label="DMARC" state={reputation?.dmarc ?? "unknown"} />
            </div>

            <div className="border-t border-stone-100 pt-3 space-y-2">
                <ReputationRow label="Bounce rate" value={bounceRate} target={BENCHMARKS.bounce_rate} reverse />
                <ReputationRow label="Complaint rate" value={complaintRate} target={0.1} reverse />
                <ReputationRow label="Delivered" value={delivered ? rate(delivered, Number(current?.sent || 0)) : 0} target={BENCHMARKS.delivered_rate} />
            </div>
        </div>
    );
}

function AuthBadge({ label, state }: { label: string; state: "pass" | "fail" | "unknown" }) {
    const tone =
        state === "pass" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
        : state === "fail" ? "bg-red-50 text-red-700 border-red-200"
        : "bg-stone-50 text-stone-500 border-stone-200";
    return (
        <div className={clsx("border rounded-lg px-2 py-1.5 text-center", tone)}>
            <p className="text-[10px] font-bold uppercase tracking-wide">{label}</p>
            <p className="text-[10px] font-semibold capitalize">{state}</p>
        </div>
    );
}

function ReputationRow({ label, value, target, reverse }: { label: string; value: number; target: number; reverse?: boolean }) {
    // For bounce/complaint, lower is better. Flip the badge logic.
    let tone: "emerald" | "amber" | "red" = "emerald";
    if (reverse) {
        if (value > target * 1.5) tone = "red";
        else if (value > target) tone = "amber";
    } else {
        const ratio = value / target;
        if (ratio < 0.8) tone = "red";
        else if (ratio < 1) tone = "amber";
    }
    const tones: Record<string, string> = {
        emerald: "bg-emerald-500",
        amber: "bg-amber-500",
        red: "bg-red-500",
    };
    return (
        <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-2 text-stone-600">
                <span className={clsx("w-2 h-2 rounded-full", tones[tone])} />
                {label}
            </span>
            <span className="font-semibold tabular-nums text-stone-900">{fmtRate(value)}</span>
        </div>
    );
}

// ---------- Placeholder for other tabs ----------

function PlaceholderTab({ id }: { id: TabId }) {
    const meta = TABS.find((t) => t.id === id)!;
    const Icon = meta.icon;
    return (
        <div className="bg-white border border-stone-200 rounded-2xl p-12 text-center">
            <Icon className="w-8 h-8 text-stone-300 mx-auto mb-3" />
            <h2 className="font-bold text-stone-800">{meta.label}</h2>
            <p className="text-sm text-stone-500 mt-1">This tab lands in a follow-up stream.</p>
        </div>
    );
}
