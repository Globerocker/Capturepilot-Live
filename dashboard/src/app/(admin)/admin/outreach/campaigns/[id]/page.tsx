"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createBrowserClient } from "@supabase/ssr";
import {
    ArrowLeft, Loader2, Play, Pause, Pencil, Send, MailOpen, MousePointerClick,
    MessageSquare, AlertTriangle, UserX, CheckCircle2, Calendar, Filter, RefreshCw,
    ChevronRight, X, ExternalLink,
} from "lucide-react";
import clsx from "clsx";

const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Campaign {
    id: string;
    name: string;
    status: string;
    channels: string[] | null;
    created_by: string | null;
    created_by_email?: string | null;
    started_at: string | null;
    created_at: string | null;
    description?: string | null;
}

interface CampaignStats {
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    replied: number;
    unsubscribed: number;
    bounced: number;
}

interface StepVariant {
    variant: string;
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    replied: number;
    bounced: number;
    delivered_rate: number;
    open_rate: number;
    click_rate: number;
    reply_rate: number;
    bounce_rate: number;
}

interface StepRow {
    step_id: string;
    step_number: number;
    channel: string | null;
    subject: string | null;
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    replied: number;
    bounced: number;
    delivered_rate: number;
    open_rate: number;
    click_rate: number;
    reply_rate: number;
    bounce_rate: number;
    variants: StepVariant[];
}

interface ContactRow {
    id: string;
    email: string | null;
    name: string | null;
    company: string | null;
    status: string | null;
    current_step: number | null;
    added_at: string | null;
    last_activity_at: string | null;
    replied_at: string | null;
    bounced_at: string | null;
    unsubscribed_at: string | null;
    time_since_added_ms: number | null;
}

interface ReplyRow {
    id: string;
    contact_email: string | null;
    contact_name: string | null;
    subject: string | null;
    snippet: string | null;
    sentiment: string | null;
    received_at: string | null;
    step_number?: number | null;
}

type ContactStatusFilter = "all" | "active" | "replied" | "bounced" | "unsubscribed" | "paused" | "completed";
type DateRange = "all" | "7d" | "30d" | "90d";

const STATUS_BADGE: Record<string, string> = {
    active: "bg-emerald-100 text-emerald-800",
    paused: "bg-amber-100 text-amber-800",
    draft: "bg-stone-100 text-stone-700",
    completed: "bg-blue-100 text-blue-800",
    archived: "bg-stone-100 text-stone-500",
};

// Benchmarks for color coding (industry-rough)
const BENCH = {
    delivered_rate: { good: 97, ok: 90 },
    open_rate: { good: 40, ok: 25 },
    click_rate: { good: 5, ok: 2 },
    reply_rate: { good: 4, ok: 1 },
    bounce_rate: { good: 2, ok: 5, inverse: true }, // lower is better
};

function rateColor(rate: number, kind: keyof typeof BENCH): string {
    const b = BENCH[kind];
    const inverse = "inverse" in b && b.inverse;
    if (inverse) {
        if (rate <= b.good) return "text-emerald-700";
        if (rate <= b.ok) return "text-amber-700";
        return "text-rose-700";
    }
    if (rate >= b.good) return "text-emerald-700";
    if (rate >= b.ok) return "text-stone-700";
    return "text-rose-700";
}

function fmtPct(n: number | null | undefined): string {
    if (n === null || n === undefined || Number.isNaN(n)) return "—";
    return `${n.toFixed(1)}%`;
}

function fmtNum(n: number | null | undefined): string {
    if (n === null || n === undefined || Number.isNaN(n)) return "0";
    return n.toLocaleString();
}

function fmtTimeAgo(ms: number | null): string {
    if (ms === null || ms === undefined) return "—";
    const sec = Math.floor(ms / 1000);
    if (sec < 60) return `${sec}s ago`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 30) return `${d}d ago`;
    const mo = Math.floor(d / 30);
    return `${mo}mo ago`;
}

function fmtDate(s: string | null | undefined): string {
    if (!s) return "—";
    try {
        const d = new Date(s);
        return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    } catch {
        return s;
    }
}

function truncate(s: string | null | undefined, n: number): string {
    if (!s) return "—";
    return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

export default function CampaignDetailPage() {
    const params = useParams();
    const campaignId = params?.id as string;

    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [stats, setStats] = useState<CampaignStats | null>(null);
    const [steps, setSteps] = useState<StepRow[]>([]);
    const [contacts, setContacts] = useState<ContactRow[]>([]);
    const [replies, setReplies] = useState<ReplyRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [dateRange, setDateRange] = useState<DateRange>("all");
    const [contactStatus, setContactStatus] = useState<ContactStatusFilter>("all");
    const [contactSearch, setContactSearch] = useState("");
    const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
    const [drawerContact, setDrawerContact] = useState<ContactRow | null>(null);
    const [drawerTimeline, setDrawerTimeline] = useState<Array<Record<string, unknown>>>([]);
    const [drawerLoading, setDrawerLoading] = useState(false);
    const [bulkRunning, setBulkRunning] = useState<string | null>(null);
    const [togglingStatus, setTogglingStatus] = useState(false);

    const sinceFilter = useMemo(() => {
        if (dateRange === "all") return null;
        const now = Date.now();
        const days = dateRange === "7d" ? 7 : dateRange === "30d" ? 30 : 90;
        return new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
    }, [dateRange]);

    const fetchCampaignCore = useCallback(async () => {
        const { data, error: cErr } = await supabase
            .from("outreach_campaigns")
            .select("id, name, status, channels, created_by, started_at, created_at, description")
            .eq("id", campaignId)
            .single();

        if (cErr || !data) {
            setError(cErr?.message || "Campaign not found");
            return null;
        }

        let creatorEmail: string | null = null;
        if (data.created_by) {
            const { data: prof } = await supabase
                .from("user_profiles")
                .select("email")
                .eq("auth_user_id", data.created_by)
                .maybeSingle();
            creatorEmail = (prof?.email as string) || null;
        }

        const c: Campaign = { ...(data as unknown as Campaign), created_by_email: creatorEmail };
        setCampaign(c);
        return c;
    }, [campaignId]);

    const fetchStats = useCallback(async () => {
        // Aggregate from outreach_messages for the campaign in date range
        let msgQuery = supabase
            .from("outreach_messages")
            .select("status, opened_at, clicked_at, replied_at, bounced_at, delivered_at, sent_at", { count: "exact" })
            .eq("campaign_id", campaignId);

        if (sinceFilter) msgQuery = msgQuery.gte("sent_at", sinceFilter);

        const { data: msgs } = await msgQuery;
        const rows = (msgs || []) as Array<Record<string, unknown>>;

        const s: CampaignStats = { sent: 0, delivered: 0, opened: 0, clicked: 0, replied: 0, unsubscribed: 0, bounced: 0 };
        for (const r of rows) {
            s.sent += 1;
            const status = (r.status as string) || "";
            if (r.delivered_at || ["delivered", "opened", "clicked", "replied"].includes(status)) s.delivered += 1;
            if (r.opened_at) s.opened += 1;
            if (r.clicked_at) s.clicked += 1;
            if (r.replied_at) s.replied += 1;
            if (r.bounced_at || status === "bounced") s.bounced += 1;
        }

        // unsubscribed comes from outreach_contacts
        let unsubQuery = supabase
            .from("outreach_contacts")
            .select("id", { count: "exact", head: true })
            .eq("campaign_id", campaignId)
            .eq("status", "unsubscribed");
        if (sinceFilter) unsubQuery = unsubQuery.gte("unsubscribed_at", sinceFilter);
        const { count: unsubCount } = await unsubQuery;
        s.unsubscribed = unsubCount || 0;

        setStats(s);
    }, [campaignId, sinceFilter]);

    const fetchSteps = useCallback(async () => {
        const r = await fetch(`/api/admin/outreach/campaigns/${campaignId}/step-performance`);
        const json = await r.json();
        if (r.ok) setSteps((json.steps || []) as StepRow[]);
    }, [campaignId]);

    const fetchContacts = useCallback(async () => {
        const qs = new URLSearchParams();
        if (contactStatus !== "all") qs.set("status", contactStatus);
        if (contactSearch.trim()) qs.set("search", contactSearch.trim());
        qs.set("limit", "200");
        const r = await fetch(`/api/admin/outreach/campaigns/${campaignId}/contacts?${qs.toString()}`);
        const json = await r.json();
        if (r.ok) setContacts((json.contacts || []) as ContactRow[]);
    }, [campaignId, contactStatus, contactSearch]);

    const fetchReplies = useCallback(async () => {
        const { data } = await supabase
            .from("outreach_replies")
            .select("id, contact_email, contact_name, subject, snippet, sentiment, received_at, step_number")
            .eq("campaign_id", campaignId)
            .order("received_at", { ascending: false })
            .limit(3);
        setReplies((data || []) as ReplyRow[]);
    }, [campaignId]);

    const refreshAll = useCallback(async () => {
        setRefreshing(true);
        await Promise.all([fetchCampaignCore(), fetchStats(), fetchSteps(), fetchContacts(), fetchReplies()]);
        setRefreshing(false);
    }, [fetchCampaignCore, fetchStats, fetchSteps, fetchContacts, fetchReplies]);

    useEffect(() => {
        if (!campaignId) return;
        (async () => {
            setLoading(true);
            await refreshAll();
            setLoading(false);
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [campaignId]);

    // Re-fetch stats when range changes
    useEffect(() => {
        if (!campaignId || loading) return;
        fetchStats();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sinceFilter]);

    // Re-fetch contacts when status/search changes (debounced for search)
    useEffect(() => {
        if (!campaignId || loading) return;
        const t = setTimeout(() => fetchContacts(), contactSearch ? 300 : 0);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [contactStatus, contactSearch]);

    const handleStatusToggle = async () => {
        if (!campaign) return;
        const next = campaign.status === "active" ? "paused" : "active";
        setTogglingStatus(true);
        const { error: uErr } = await supabase
            .from("outreach_campaigns")
            .update({ status: next })
            .eq("id", campaignId);
        setTogglingStatus(false);
        if (!uErr) setCampaign({ ...campaign, status: next });
    };

    const handleSelectContact = (id: string, checked: boolean) => {
        setSelectedContactIds((prev) => {
            const next = new Set(prev);
            if (checked) next.add(id); else next.delete(id);
            return next;
        });
    };

    const handleSelectAll = (checked: boolean) => {
        if (checked) setSelectedContactIds(new Set(contacts.map((c) => c.id)));
        else setSelectedContactIds(new Set());
    };

    const handleBulkAction = async (action: "pause" | "resume" | "remove") => {
        if (selectedContactIds.size === 0) return;
        if (action === "remove" && !confirm(`Remove ${selectedContactIds.size} contacts from this campaign? They will be unsubscribed from this sequence.`)) return;
        setBulkRunning(action);
        const r = await fetch(`/api/admin/outreach/campaigns/${campaignId}/contacts/bulk-action`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action, contact_ids: Array.from(selectedContactIds) }),
        });
        setBulkRunning(null);
        if (r.ok) {
            setSelectedContactIds(new Set());
            await fetchContacts();
        } else {
            const j = await r.json().catch(() => ({}));
            alert(j.error || "Bulk action failed");
        }
    };

    const openDrawer = async (c: ContactRow) => {
        setDrawerContact(c);
        setDrawerLoading(true);
        // Fetch full engagement timeline
        const { data: msgs } = await supabase
            .from("outreach_messages")
            .select("id, step_id, status, subject, sent_at, delivered_at, opened_at, clicked_at, replied_at, bounced_at")
            .eq("campaign_id", campaignId)
            .eq("contact_id", c.id)
            .order("sent_at", { ascending: true });
        setDrawerTimeline((msgs || []) as Array<Record<string, unknown>>);
        setDrawerLoading(false);
    };

    const closeDrawer = () => {
        setDrawerContact(null);
        setDrawerTimeline([]);
    };

    if (loading) {
        return (
            <div className="min-h-[60vh] flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-stone-400" />
            </div>
        );
    }

    if (error || !campaign) {
        return (
            <div className="max-w-3xl mx-auto pt-12">
                <Link href="/admin/outreach/campaigns" className="inline-flex items-center gap-2 text-sm text-stone-600 hover:text-stone-900 mb-6">
                    <ArrowLeft className="w-4 h-4" /> Back to Campaigns
                </Link>
                <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6">
                    <h2 className="text-lg font-semibold text-rose-900 mb-1">Campaign unavailable</h2>
                    <p className="text-sm text-rose-700">{error || "We couldn't load this campaign."}</p>
                </div>
            </div>
        );
    }

    const statusClass = STATUS_BADGE[campaign.status] || "bg-stone-100 text-stone-700";
    const isPaused = campaign.status === "paused";

    return (
        <div className="max-w-7xl mx-auto">
            {/* Top nav */}
            <div className="flex items-center justify-between mb-4">
                <Link href="/admin/outreach/campaigns" className="inline-flex items-center gap-2 text-sm text-stone-600 hover:text-stone-900">
                    <ArrowLeft className="w-4 h-4" /> Back to Campaigns
                </Link>
                <button
                    type="button"
                    onClick={refreshAll}
                    disabled={refreshing}
                    className="inline-flex items-center gap-2 text-sm text-stone-600 hover:text-stone-900 disabled:opacity-50"
                >
                    <RefreshCw className={clsx("w-4 h-4", refreshing && "animate-spin")} /> Refresh
                </button>
            </div>

            {/* Header card */}
            <div className="bg-white border border-stone-200 rounded-2xl p-6 mb-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex-1 min-w-[260px]">
                        <div className="flex flex-wrap items-center gap-3 mb-1">
                            <h1 className="text-2xl font-bold text-stone-900">{campaign.name}</h1>
                            <span className={clsx("inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full", statusClass)}>
                                {campaign.status.toUpperCase()}
                            </span>
                            <button
                                type="button"
                                onClick={handleStatusToggle}
                                disabled={togglingStatus}
                                className={clsx(
                                    "inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50",
                                    isPaused
                                        ? "bg-emerald-600 text-white hover:bg-emerald-700"
                                        : "bg-amber-100 text-amber-800 hover:bg-amber-200"
                                )}
                                title={isPaused ? "Resume campaign" : "Pause campaign"}
                            >
                                {togglingStatus ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                                {isPaused ? "Resume" : "Pause"}
                            </button>
                        </div>
                        {campaign.description && (
                            <p className="text-sm text-stone-600 mt-2 max-w-2xl">{campaign.description}</p>
                        )}
                        <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-stone-500">
                            <span>Created by <span className="text-stone-700 font-medium">{campaign.created_by_email || campaign.created_by || "—"}</span></span>
                            <span className="flex items-center gap-1.5">
                                <Calendar className="w-3.5 h-3.5" />
                                Started {fmtDate(campaign.started_at || campaign.created_at)}
                            </span>
                            <span className="flex items-center gap-1.5">
                                Channels:
                                {(campaign.channels || []).map((ch) => (
                                    <span key={ch} className="inline-flex items-center px-2 py-0.5 rounded bg-stone-100 text-stone-700 font-medium">
                                        {ch}
                                    </span>
                                ))}
                                {(!campaign.channels || campaign.channels.length === 0) && <span>—</span>}
                            </span>
                        </div>
                    </div>
                    <Link
                        href={`/admin/outreach/campaigns/${campaignId}/edit`}
                        className="inline-flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg border border-stone-300 bg-white hover:bg-stone-50 text-stone-800"
                    >
                        <Pencil className="w-4 h-4" /> Edit campaign
                    </Link>
                </div>
            </div>

            {/* KPI strip + date range */}
            <div className="bg-white border border-stone-200 rounded-2xl p-5 mb-6">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <h2 className="text-sm font-semibold text-stone-900 uppercase tracking-wider">Performance</h2>
                    <div className="flex items-center gap-1 bg-stone-100 rounded-lg p-0.5">
                        {(["all", "90d", "30d", "7d"] as DateRange[]).map((r) => (
                            <button
                                key={r}
                                type="button"
                                onClick={() => setDateRange(r)}
                                className={clsx(
                                    "text-xs font-medium px-3 py-1.5 rounded-md transition-colors",
                                    dateRange === r ? "bg-white text-stone-900 shadow-sm" : "text-stone-600 hover:text-stone-900"
                                )}
                            >
                                {r === "all" ? "All time" : `Last ${r}`}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                    <KpiTile icon={Send} label="Sent" value={stats?.sent ?? 0} tone="stone" />
                    <KpiTile icon={CheckCircle2} label="Delivered" value={stats?.delivered ?? 0} tone="emerald" rate={stats && stats.sent > 0 ? (stats.delivered / stats.sent) * 100 : null} />
                    <KpiTile icon={MailOpen} label="Opened" value={stats?.opened ?? 0} tone="blue" rate={stats && stats.delivered > 0 ? (stats.opened / stats.delivered) * 100 : null} />
                    <KpiTile icon={MousePointerClick} label="Clicked" value={stats?.clicked ?? 0} tone="indigo" rate={stats && stats.delivered > 0 ? (stats.clicked / stats.delivered) * 100 : null} />
                    <KpiTile icon={MessageSquare} label="Replied" value={stats?.replied ?? 0} tone="violet" rate={stats && stats.delivered > 0 ? (stats.replied / stats.delivered) * 100 : null} />
                    <KpiTile icon={UserX} label="Unsubscribed" value={stats?.unsubscribed ?? 0} tone="amber" />
                    <KpiTile icon={AlertTriangle} label="Bounced" value={stats?.bounced ?? 0} tone="rose" rate={stats && stats.sent > 0 ? (stats.bounced / stats.sent) * 100 : null} />
                </div>
            </div>

            {/* Step performance */}
            <div className="bg-white border border-stone-200 rounded-2xl p-5 mb-6">
                <h2 className="text-sm font-semibold text-stone-900 uppercase tracking-wider mb-4">Step performance</h2>
                {steps.length === 0 ? (
                    <p className="text-sm text-stone-500">No steps have run yet for this campaign.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-xs uppercase tracking-wider text-stone-500 border-b border-stone-200">
                                    <th className="py-2 pr-3 font-semibold">#</th>
                                    <th className="py-2 pr-3 font-semibold">Channel</th>
                                    <th className="py-2 pr-3 font-semibold">Subject</th>
                                    <th className="py-2 pr-3 font-semibold text-right">Sent</th>
                                    <th className="py-2 pr-3 font-semibold text-right">Deliv.</th>
                                    <th className="py-2 pr-3 font-semibold text-right">Open</th>
                                    <th className="py-2 pr-3 font-semibold text-right">Click</th>
                                    <th className="py-2 pr-3 font-semibold text-right">Reply</th>
                                    <th className="py-2 pr-3 font-semibold text-right">Bounce</th>
                                </tr>
                            </thead>
                            <tbody>
                                {steps.map((s) => (
                                    <StepRowDisplay key={s.step_id} step={s} />
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Replies block */}
            <div className="bg-white border border-stone-200 rounded-2xl p-5 mb-6">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-semibold text-stone-900 uppercase tracking-wider">Recent replies</h2>
                    <Link href={`/admin/outreach/inbox?campaign=${campaignId}`} className="text-xs font-medium text-stone-600 hover:text-stone-900 inline-flex items-center gap-1">
                        View all in Inbox <ExternalLink className="w-3 h-3" />
                    </Link>
                </div>
                {replies.length === 0 ? (
                    <p className="text-sm text-stone-500">No replies yet.</p>
                ) : (
                    <div className="space-y-3">
                        {replies.map((r) => (
                            <div key={r.id} className="border border-stone-200 rounded-xl p-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 text-sm">
                                            <span className="font-medium text-stone-900">{r.contact_name || r.contact_email || "Unknown"}</span>
                                            {r.contact_email && r.contact_name && (
                                                <span className="text-stone-500 text-xs">&lt;{r.contact_email}&gt;</span>
                                            )}
                                            {r.sentiment && <SentimentBadge sentiment={r.sentiment} />}
                                        </div>
                                        <p className="text-xs text-stone-500 mt-0.5">{r.subject || "(no subject)"}</p>
                                        <p className="text-sm text-stone-700 mt-1.5 line-clamp-2">{r.snippet || "—"}</p>
                                    </div>
                                    <span className="text-xs text-stone-500 whitespace-nowrap">{fmtDate(r.received_at)}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Contacts */}
            <div className="bg-white border border-stone-200 rounded-2xl p-5 mb-6">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <h2 className="text-sm font-semibold text-stone-900 uppercase tracking-wider">Contacts ({contacts.length})</h2>
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="relative">
                            <Filter className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-stone-400" />
                            <select
                                value={contactStatus}
                                onChange={(e) => setContactStatus(e.target.value as ContactStatusFilter)}
                                className="text-xs font-medium pl-8 pr-3 py-2 rounded-lg border border-stone-300 bg-white text-stone-800"
                            >
                                <option value="all">All statuses</option>
                                <option value="active">Active</option>
                                <option value="paused">Paused</option>
                                <option value="replied">Replied</option>
                                <option value="bounced">Bounced</option>
                                <option value="unsubscribed">Unsubscribed</option>
                                <option value="completed">Completed</option>
                            </select>
                        </div>
                        <input
                            type="text"
                            value={contactSearch}
                            onChange={(e) => setContactSearch(e.target.value)}
                            placeholder="Search email, name, company…"
                            className="text-xs px-3 py-2 rounded-lg border border-stone-300 bg-white text-stone-800 w-56"
                        />
                    </div>
                </div>

                {/* Bulk action bar */}
                {selectedContactIds.size > 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3 bg-stone-50 border border-stone-200 rounded-lg px-3 py-2">
                        <span className="text-xs font-medium text-stone-700">{selectedContactIds.size} selected</span>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => handleBulkAction("pause")}
                                disabled={bulkRunning !== null}
                                className="inline-flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded border border-stone-300 bg-white hover:bg-stone-50 text-stone-800 disabled:opacity-50"
                            >
                                {bulkRunning === "pause" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Pause className="w-3.5 h-3.5" />}
                                Pause
                            </button>
                            <button
                                type="button"
                                onClick={() => handleBulkAction("resume")}
                                disabled={bulkRunning !== null}
                                className="inline-flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded border border-stone-300 bg-white hover:bg-stone-50 text-stone-800 disabled:opacity-50"
                            >
                                {bulkRunning === "resume" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                                Resume
                            </button>
                            <button
                                type="button"
                                onClick={() => handleBulkAction("remove")}
                                disabled={bulkRunning !== null}
                                className="inline-flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded border border-rose-300 bg-white hover:bg-rose-50 text-rose-700 disabled:opacity-50"
                            >
                                {bulkRunning === "remove" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserX className="w-3.5 h-3.5" />}
                                Remove
                            </button>
                        </div>
                    </div>
                )}

                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-xs uppercase tracking-wider text-stone-500 border-b border-stone-200">
                                <th className="py-2 pr-3 w-8">
                                    <input
                                        type="checkbox"
                                        checked={selectedContactIds.size === contacts.length && contacts.length > 0}
                                        onChange={(e) => handleSelectAll(e.target.checked)}
                                        className="rounded border-stone-300"
                                    />
                                </th>
                                <th className="py-2 pr-3 font-semibold">Email</th>
                                <th className="py-2 pr-3 font-semibold">Name</th>
                                <th className="py-2 pr-3 font-semibold">Company</th>
                                <th className="py-2 pr-3 font-semibold text-center">Step</th>
                                <th className="py-2 pr-3 font-semibold">Status</th>
                                <th className="py-2 pr-3 font-semibold">Last activity</th>
                                <th className="py-2 pr-3 font-semibold">Added</th>
                                <th className="py-2 pr-3 w-8"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {contacts.length === 0 ? (
                                <tr>
                                    <td colSpan={9} className="py-8 text-center text-sm text-stone-500">No contacts match these filters.</td>
                                </tr>
                            ) : contacts.map((c) => (
                                <tr key={c.id} className="border-b border-stone-100 hover:bg-stone-50 cursor-pointer" onClick={() => openDrawer(c)}>
                                    <td className="py-2 pr-3" onClick={(e) => e.stopPropagation()}>
                                        <input
                                            type="checkbox"
                                            checked={selectedContactIds.has(c.id)}
                                            onChange={(e) => handleSelectContact(c.id, e.target.checked)}
                                            className="rounded border-stone-300"
                                        />
                                    </td>
                                    <td className="py-2 pr-3 text-stone-900 font-medium">{c.email || "—"}</td>
                                    <td className="py-2 pr-3 text-stone-700">{c.name || "—"}</td>
                                    <td className="py-2 pr-3 text-stone-700">{c.company || "—"}</td>
                                    <td className="py-2 pr-3 text-center text-stone-700">{c.current_step ?? "—"}</td>
                                    <td className="py-2 pr-3"><ContactStatusBadge status={c.status} /></td>
                                    <td className="py-2 pr-3 text-stone-500 text-xs">{fmtTimeAgo(c.last_activity_at ? Date.now() - new Date(c.last_activity_at).getTime() : null)}</td>
                                    <td className="py-2 pr-3 text-stone-500 text-xs">{fmtTimeAgo(c.time_since_added_ms)}</td>
                                    <td className="py-2 pr-3 text-stone-400"><ChevronRight className="w-4 h-4" /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Contact drawer */}
            {drawerContact && (
                <ContactDrawer contact={drawerContact} timeline={drawerTimeline} loading={drawerLoading} onClose={closeDrawer} />
            )}
        </div>
    );
}

function KpiTile({ icon: Icon, label, value, tone, rate }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number; tone: string; rate?: number | null }) {
    const toneClass: Record<string, string> = {
        stone: "bg-stone-50 text-stone-700",
        emerald: "bg-emerald-50 text-emerald-700",
        blue: "bg-blue-50 text-blue-700",
        indigo: "bg-indigo-50 text-indigo-700",
        violet: "bg-violet-50 text-violet-700",
        amber: "bg-amber-50 text-amber-700",
        rose: "bg-rose-50 text-rose-700",
    };
    return (
        <div className="border border-stone-200 rounded-xl p-3">
            <div className="flex items-center justify-between mb-1.5">
                <span className={clsx("inline-flex items-center justify-center w-7 h-7 rounded-lg", toneClass[tone] || toneClass.stone)}>
                    <Icon className="w-3.5 h-3.5" />
                </span>
                {rate !== null && rate !== undefined && (
                    <span className="text-xs font-semibold text-stone-500">{fmtPct(rate)}</span>
                )}
            </div>
            <div className="text-xs text-stone-500 font-medium">{label}</div>
            <div className="text-xl font-bold text-stone-900 tabular-nums">{fmtNum(value)}</div>
        </div>
    );
}

function StepRowDisplay({ step }: { step: StepRow }) {
    const [expanded, setExpanded] = useState(false);
    const hasMultipleVariants = step.variants.length > 1;
    return (
        <>
            <tr className={clsx("border-b border-stone-100", hasMultipleVariants && "cursor-pointer hover:bg-stone-50")} onClick={() => hasMultipleVariants && setExpanded(!expanded)}>
                <td className="py-2.5 pr-3 font-semibold text-stone-900">{step.step_number}</td>
                <td className="py-2.5 pr-3 text-stone-700">
                    <span className="inline-flex items-center px-2 py-0.5 rounded bg-stone-100 text-xs font-medium">{step.channel || "—"}</span>
                </td>
                <td className="py-2.5 pr-3 text-stone-700">{truncate(step.subject, 48)}</td>
                <td className="py-2.5 pr-3 text-right tabular-nums text-stone-700">{fmtNum(step.sent)}</td>
                <td className={clsx("py-2.5 pr-3 text-right tabular-nums font-medium", rateColor(step.delivered_rate, "delivered_rate"))}>{fmtPct(step.delivered_rate)}</td>
                <td className={clsx("py-2.5 pr-3 text-right tabular-nums font-medium", rateColor(step.open_rate, "open_rate"))}>{fmtPct(step.open_rate)}</td>
                <td className={clsx("py-2.5 pr-3 text-right tabular-nums font-medium", rateColor(step.click_rate, "click_rate"))}>{fmtPct(step.click_rate)}</td>
                <td className={clsx("py-2.5 pr-3 text-right tabular-nums font-medium", rateColor(step.reply_rate, "reply_rate"))}>{fmtPct(step.reply_rate)}</td>
                <td className={clsx("py-2.5 pr-3 text-right tabular-nums font-medium", rateColor(step.bounce_rate, "bounce_rate"))}>{fmtPct(step.bounce_rate)}</td>
            </tr>
            {hasMultipleVariants && expanded && step.variants.map((v) => (
                <tr key={v.variant} className="border-b border-stone-100 bg-stone-50/50 text-xs">
                    <td className="py-2 pr-3"></td>
                    <td className="py-2 pr-3 text-stone-600 pl-4">↳ Variant {v.variant}</td>
                    <td className="py-2 pr-3 text-stone-500"></td>
                    <td className="py-2 pr-3 text-right tabular-nums text-stone-600">{fmtNum(v.sent)}</td>
                    <td className={clsx("py-2 pr-3 text-right tabular-nums", rateColor(v.delivered_rate, "delivered_rate"))}>{fmtPct(v.delivered_rate)}</td>
                    <td className={clsx("py-2 pr-3 text-right tabular-nums", rateColor(v.open_rate, "open_rate"))}>{fmtPct(v.open_rate)}</td>
                    <td className={clsx("py-2 pr-3 text-right tabular-nums", rateColor(v.click_rate, "click_rate"))}>{fmtPct(v.click_rate)}</td>
                    <td className={clsx("py-2 pr-3 text-right tabular-nums", rateColor(v.reply_rate, "reply_rate"))}>{fmtPct(v.reply_rate)}</td>
                    <td className={clsx("py-2 pr-3 text-right tabular-nums", rateColor(v.bounce_rate, "bounce_rate"))}>{fmtPct(v.bounce_rate)}</td>
                </tr>
            ))}
        </>
    );
}

function ContactStatusBadge({ status }: { status: string | null }) {
    const s = (status || "active").toLowerCase();
    const map: Record<string, string> = {
        active: "bg-emerald-100 text-emerald-800",
        paused: "bg-amber-100 text-amber-800",
        replied: "bg-violet-100 text-violet-800",
        bounced: "bg-rose-100 text-rose-800",
        unsubscribed: "bg-stone-100 text-stone-700",
        completed: "bg-blue-100 text-blue-800",
    };
    return <span className={clsx("inline-flex items-center text-xs font-medium px-2 py-0.5 rounded", map[s] || "bg-stone-100 text-stone-700")}>{s}</span>;
}

function SentimentBadge({ sentiment }: { sentiment: string }) {
    const s = sentiment.toLowerCase();
    const map: Record<string, string> = {
        positive: "bg-emerald-100 text-emerald-800",
        interested: "bg-emerald-100 text-emerald-800",
        neutral: "bg-stone-100 text-stone-700",
        negative: "bg-rose-100 text-rose-800",
        unsubscribe: "bg-amber-100 text-amber-800",
    };
    return <span className={clsx("inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded", map[s] || "bg-stone-100 text-stone-700")}>{sentiment}</span>;
}

function ContactDrawer({ contact, timeline, loading, onClose }: { contact: ContactRow; timeline: Array<Record<string, unknown>>; loading: boolean; onClose: () => void }) {
    return (
        <div className="fixed inset-0 z-50 flex">
            <div className="flex-1 bg-black/30" onClick={onClose} />
            <div className="w-full max-w-md bg-white shadow-2xl overflow-y-auto">
                <div className="sticky top-0 bg-white border-b border-stone-200 px-5 py-4 flex items-center justify-between">
                    <div>
                        <h3 className="text-base font-semibold text-stone-900">{contact.name || contact.email || "Contact"}</h3>
                        {contact.name && contact.email && (
                            <p className="text-xs text-stone-500">{contact.email}</p>
                        )}
                    </div>
                    <button type="button" onClick={onClose} className="text-stone-500 hover:text-stone-900">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-5 space-y-4">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                            <p className="text-xs uppercase tracking-wider text-stone-500 mb-0.5">Company</p>
                            <p className="text-stone-900">{contact.company || "—"}</p>
                        </div>
                        <div>
                            <p className="text-xs uppercase tracking-wider text-stone-500 mb-0.5">Status</p>
                            <ContactStatusBadge status={contact.status} />
                        </div>
                        <div>
                            <p className="text-xs uppercase tracking-wider text-stone-500 mb-0.5">Current step</p>
                            <p className="text-stone-900">{contact.current_step ?? "—"}</p>
                        </div>
                        <div>
                            <p className="text-xs uppercase tracking-wider text-stone-500 mb-0.5">Added</p>
                            <p className="text-stone-900">{fmtDate(contact.added_at)}</p>
                        </div>
                    </div>

                    <div>
                        <p className="text-xs uppercase tracking-wider text-stone-500 mb-2 font-semibold">Engagement timeline</p>
                        {loading ? (
                            <Loader2 className="w-5 h-5 animate-spin text-stone-400" />
                        ) : timeline.length === 0 ? (
                            <p className="text-sm text-stone-500">No activity recorded yet.</p>
                        ) : (
                            <ol className="space-y-2 border-l-2 border-stone-200 pl-4">
                                {timeline.map((m, idx) => (
                                    <TimelineItem key={String(m.id) || idx} message={m} />
                                ))}
                            </ol>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function TimelineItem({ message }: { message: Record<string, unknown> }) {
    const subj = (message.subject as string) || "(no subject)";
    const events: Array<{ when: string; what: string; icon: React.ComponentType<{ className?: string }> }> = [];
    if (message.sent_at) events.push({ when: message.sent_at as string, what: "Sent", icon: Send });
    if (message.delivered_at) events.push({ when: message.delivered_at as string, what: "Delivered", icon: CheckCircle2 });
    if (message.opened_at) events.push({ when: message.opened_at as string, what: "Opened", icon: MailOpen });
    if (message.clicked_at) events.push({ when: message.clicked_at as string, what: "Clicked", icon: MousePointerClick });
    if (message.replied_at) events.push({ when: message.replied_at as string, what: "Replied", icon: MessageSquare });
    if (message.bounced_at) events.push({ when: message.bounced_at as string, what: "Bounced", icon: AlertTriangle });

    return (
        <li className="text-sm">
            <p className="font-medium text-stone-900">{subj}</p>
            <ul className="text-xs text-stone-600 mt-1 space-y-0.5">
                {events.map((e, i) => (
                    <li key={i} className="flex items-center gap-1.5">
                        <e.icon className="w-3 h-3" />
                        <span>{e.what}</span>
                        <span className="text-stone-400">— {fmtDate(e.when)}</span>
                    </li>
                ))}
            </ul>
        </li>
    );
}
