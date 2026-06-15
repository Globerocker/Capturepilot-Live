"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
    Inbox,
    Search,
    RefreshCw,
    CheckCircle2,
    Circle,
    Loader2,
    Tag,
    Forward,
    Reply as ReplyIcon,
    Send,
    UserCircle2,
    Calendar,
    Sparkles,
    X,
    AlertCircle,
} from "lucide-react";
import clsx from "clsx";
import OutreachNav from "@/components/outreach/OutreachNav";
import { SentimentBadge } from "@/components/outreach/SentimentBadge";
import {
    SENTIMENTS,
    SENTIMENT_STYLES,
    type Sentiment,
    isSentiment,
} from "@/lib/outreach/sentiment";

type HandledFilter = "unhandled" | "handled" | "all";
type SentimentFilter = "all" | Sentiment;

interface Reply {
    id: string;
    from_email: string;
    from_name: string | null;
    to_email: string | null;
    subject: string | null;
    snippet: string | null;
    body_text: string | null;
    received_at: string;
    sentiment: Sentiment;
    sentiment_source: "auto" | "manual";
    intent: string | null;
    confidence: number | null;
    meeting_url: string | null;
    is_handled: boolean;
    handled_at: string | null;
    notes: string | null;
    campaign_id: string | null;
    contact_id: string | null;
    step_id: string | null;
    outreach_campaigns: { id: string; name: string } | null;
    outreach_contacts: {
        id: string;
        email: string;
        first_name: string | null;
        last_name: string | null;
        company_name: string | null;
    } | null;
}

const SENTIMENT_TABS: { key: SentimentFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "positive", label: SENTIMENT_STYLES.positive.label },
    { key: "neutral", label: SENTIMENT_STYLES.neutral.label },
    { key: "negative", label: SENTIMENT_STYLES.negative.label },
    { key: "auto_reply", label: SENTIMENT_STYLES.auto_reply.label },
    { key: "unsubscribe", label: SENTIMENT_STYLES.unsubscribe.label },
    { key: "unsure", label: SENTIMENT_STYLES.unsure.label },
];

function relativeTime(iso: string): string {
    const then = new Date(iso).getTime();
    const diff = Date.now() - then;
    if (diff < 60_000) return "just now";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
    if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d`;
    return new Date(iso).toLocaleDateString();
}

export default function AdminOutreachPage() {
    const [replies, setReplies] = useState<Reply[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Filters
    const [sentimentFilter, setSentimentFilter] = useState<SentimentFilter>("all");
    const [handledFilter, setHandledFilter] = useState<HandledFilter>("unhandled");
    const [campaignFilter, setCampaignFilter] = useState<string>("");
    const [search, setSearch] = useState("");

    // Selection
    const [selectedId, setSelectedId] = useState<string | null>(null);

    // Composer state for selected reply
    const [composerOpen, setComposerOpen] = useState(false);
    const [composerBody, setComposerBody] = useState("");
    const [sending, setSending] = useState(false);
    const [drafting, setDrafting] = useState(false);
    const [sendNote, setSendNote] = useState<string | null>(null);
    const [tagInput, setTagInput] = useState("");
    const [moveCampaign, setMoveCampaign] = useState("");
    const [acting, setActing] = useState<string | null>(null);

    const campaigns = useMemo(() => {
        const map = new Map<string, string>();
        for (const r of replies) {
            if (r.outreach_campaigns) map.set(r.outreach_campaigns.id, r.outreach_campaigns.name);
        }
        return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
    }, [replies]);

    const buildQuery = useCallback(() => {
        const params = new URLSearchParams();
        if (sentimentFilter !== "all") params.set("sentiment", sentimentFilter);
        if (handledFilter === "unhandled") params.set("handled", "false");
        else if (handledFilter === "handled") params.set("handled", "true");
        if (campaignFilter) params.set("campaign_id", campaignFilter);
        if (search.trim()) params.set("q", search.trim());
        return params.toString();
    }, [sentimentFilter, handledFilter, campaignFilter, search]);

    const load = useCallback(
        async (opts?: { silent?: boolean }) => {
            if (!opts?.silent) setRefreshing(true);
            try {
                const res = await fetch(`/api/admin/outreach/replies?${buildQuery()}`, {
                    cache: "no-store",
                });
                if (!res.ok) {
                    const txt = await res.text();
                    throw new Error(txt || `HTTP ${res.status}`);
                }
                const json = (await res.json()) as { replies: Reply[]; unhandled: number };
                setReplies(json.replies);
                setError(null);
                // Keep selection valid
                setSelectedId((prev) => {
                    if (prev && json.replies.some((r) => r.id === prev)) return prev;
                    return json.replies[0]?.id || null;
                });
            } catch (e) {
                setError(e instanceof Error ? e.message : "Failed to load");
            } finally {
                setLoading(false);
                setRefreshing(false);
            }
        },
        [buildQuery]
    );

    useEffect(() => {
        load();
    }, [load]);

    // Poll every 30s for fresh replies on the current filter set.
    const pollRef = useRef<NodeJS.Timeout | null>(null);
    useEffect(() => {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = setInterval(() => load({ silent: true }), 30_000);
        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
        };
    }, [load]);

    const selected = useMemo(
        () => replies.find((r) => r.id === selectedId) || null,
        [replies, selectedId]
    );

    // Reset composer state when selection changes
    useEffect(() => {
        setComposerOpen(false);
        setComposerBody("");
        setSendNote(null);
        setTagInput("");
        setMoveCampaign("");
        setDrafting(false);
    }, [selectedId]);

    const patchSelected = async (
        body: Record<string, unknown>,
        actionKey: string
    ): Promise<boolean> => {
        if (!selected) return false;
        setActing(actionKey);
        try {
            const res = await fetch(`/api/admin/outreach/replies/${selected.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            if (!res.ok) throw new Error(await res.text());
            const json = (await res.json()) as { reply: Reply };
            setReplies((prev) => prev.map((r) => (r.id === json.reply.id ? json.reply : r)));
            return true;
        } catch (e) {
            setSendNote(e instanceof Error ? e.message : "Action failed");
            return false;
        } finally {
            setActing(null);
        }
    };

    const markHandled = () =>
        selected && patchSelected({ is_handled: !selected.is_handled }, "handled");

    const setManualSentiment = (s: Sentiment) => patchSelected({ sentiment: s }, `sent-${s}`);

    const tagContact = async () => {
        const tag = tagInput.trim();
        if (!tag) return;
        const ok = await patchSelected({ tag_contact: tag }, "tag");
        if (ok) setTagInput("");
    };

    const addToCampaign = async () => {
        if (!moveCampaign) return;
        await patchSelected({ add_to_campaign_id: moveCampaign }, "campaign");
        setMoveCampaign("");
    };

    const reclassify = async () => {
        if (!selected) return;
        setActing("reclassify");
        try {
            const res = await fetch(
                `/api/admin/outreach/replies/${selected.id}/reclassify`,
                { method: "POST" }
            );
            if (!res.ok) throw new Error(await res.text());
            await load({ silent: true });
        } catch (e) {
            setSendNote(e instanceof Error ? e.message : "Re-classify failed");
        } finally {
            setActing(null);
        }
    };

    const draftReply = async () => {
        if (!selected || drafting) return;
        setDrafting(true);
        setSendNote(null);
        setComposerOpen(true);
        try {
            const res = await fetch(
                `/api/admin/outreach/replies/${selected.id}/ai-draft`,
                { method: "POST" }
            );
            const json = (await res.json().catch(() => ({}))) as {
                draft?: string;
                error?: string;
            };
            if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
            if (!json.draft) throw new Error("No draft returned");
            setComposerBody(json.draft);
        } catch (e) {
            setSendNote(e instanceof Error ? e.message : "AI draft failed");
        } finally {
            setDrafting(false);
        }
    };

    const sendReply = async () => {
        if (!selected || !composerBody.trim()) return;
        setSending(true);
        setSendNote(null);
        try {
            const res = await fetch(`/api/admin/outreach/replies/${selected.id}/reply`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ body: composerBody.trim() }),
            });
            if (!res.ok) {
                const txt = await res.text();
                throw new Error(txt || `HTTP ${res.status}`);
            }
            setSendNote("Reply sent.");
            setComposerBody("");
            setComposerOpen(false);
            await load({ silent: true });
        } catch (e) {
            setSendNote(e instanceof Error ? e.message : "Send failed");
        } finally {
            setSending(false);
        }
    };

    const forwardReply = async () => {
        if (!selected) return;
        const to = window.prompt("Forward to email address:");
        if (!to) return;
        setActing("forward");
        try {
            const fwBody = `--- Forwarded message ---\nFrom: ${selected.from_email}\nSubject: ${
                selected.subject || ""
            }\nDate: ${new Date(selected.received_at).toLocaleString()}\n\n${
                selected.body_text || selected.snippet || ""
            }`;
            const res = await fetch(`/api/admin/outreach/replies/${selected.id}/reply`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    body: fwBody,
                    subject: `Fwd: ${selected.subject || ""}`,
                    to_override: to,
                }),
            });
            if (!res.ok) throw new Error(await res.text());
            setSendNote(`Forwarded to ${to}.`);
        } catch (e) {
            setSendNote(e instanceof Error ? e.message : "Forward failed");
        } finally {
            setActing(null);
        }
    };

    return (
        <div className="space-y-4">
            <header className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                    <h1 className="text-2xl font-bold text-stone-900 flex items-center gap-2">
                        <Inbox className="w-6 h-6" /> Outreach
                    </h1>
                    <p className="text-sm text-stone-500 mt-0.5">
                        Inbox for outbound reply triage. Polls every 30s.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => load()}
                    disabled={refreshing}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-200 bg-white text-sm hover:bg-stone-50 disabled:opacity-60"
                >
                    <RefreshCw className={clsx("w-3.5 h-3.5", refreshing && "animate-spin")} />
                    Refresh
                </button>
            </header>

            <div className="bg-white rounded-2xl border border-stone-200 shadow-sm">
                {/* Outreach hub tab strip */}
                <OutreachNav active="inbox" />

                {/* Filter bar */}
                <div className="px-3 py-3 border-b border-stone-200 space-y-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                        {SENTIMENT_TABS.map((t) => (
                            <button
                                key={t.key}
                                type="button"
                                onClick={() => setSentimentFilter(t.key)}
                                className={clsx(
                                    "px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                                    sentimentFilter === t.key
                                        ? "bg-stone-900 text-white border-stone-900"
                                        : "bg-white text-stone-600 border-stone-200 hover:bg-stone-50"
                                )}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        <div className="inline-flex rounded-lg border border-stone-200 overflow-hidden text-xs">
                            {(["unhandled", "handled", "all"] as HandledFilter[]).map((h) => (
                                <button
                                    key={h}
                                    type="button"
                                    onClick={() => setHandledFilter(h)}
                                    className={clsx(
                                        "px-2.5 py-1 capitalize",
                                        handledFilter === h
                                            ? "bg-stone-900 text-white"
                                            : "bg-white text-stone-600 hover:bg-stone-50"
                                    )}
                                >
                                    {h}
                                </button>
                            ))}
                        </div>
                        <select
                            value={campaignFilter}
                            onChange={(e) => setCampaignFilter(e.target.value)}
                            className="text-xs border border-stone-200 rounded-lg px-2 py-1 bg-white"
                        >
                            <option value="">All campaigns</option>
                            {campaigns.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.name}
                                </option>
                            ))}
                        </select>
                        <div className="relative flex-1 min-w-[180px]">
                            <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2 top-1/2 -translate-y-1/2" />
                            <input
                                type="search"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search subject or body…"
                                className="w-full pl-7 pr-2 py-1.5 text-xs border border-stone-200 rounded-lg bg-white"
                            />
                        </div>
                    </div>
                </div>

                {/* Body */}
                {loading ? (
                    <div className="p-12 flex items-center justify-center text-stone-400">
                        <Loader2 className="w-6 h-6 animate-spin" />
                    </div>
                ) : error ? (
                    <div className="p-6 flex items-center gap-2 text-red-600 text-sm">
                        <AlertCircle className="w-4 h-4" /> {error}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-5 min-h-[60vh]">
                        {/* List (40%) */}
                        <div className="md:col-span-2 border-r border-stone-200 max-h-[75vh] overflow-y-auto">
                            {replies.length === 0 ? (
                                <div className="p-8 text-center text-stone-400 text-sm">
                                    No replies match these filters.
                                </div>
                            ) : (
                                <ul className="divide-y divide-stone-100">
                                    {replies.map((r) => (
                                        <li key={r.id}>
                                            <button
                                                type="button"
                                                onClick={() => setSelectedId(r.id)}
                                                className={clsx(
                                                    "w-full text-left px-3 py-3 hover:bg-stone-50 transition-colors",
                                                    selectedId === r.id && "bg-stone-50"
                                                )}
                                            >
                                                <div className="flex items-start gap-2">
                                                    {r.is_handled ? (
                                                        <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                                                    ) : (
                                                        <Circle className="w-4 h-4 text-stone-300 flex-shrink-0 mt-0.5" />
                                                    )}
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center justify-between gap-2">
                                                            <span className="text-sm font-medium text-stone-900 truncate">
                                                                {r.from_name || r.from_email}
                                                            </span>
                                                            <span className="text-[10px] text-stone-400 flex-shrink-0">
                                                                {relativeTime(r.received_at)}
                                                            </span>
                                                        </div>
                                                        <div className="text-xs text-stone-600 truncate">
                                                            {r.subject || "(no subject)"}
                                                        </div>
                                                        <div className="text-xs text-stone-400 truncate mt-0.5">
                                                            {r.snippet || ""}
                                                        </div>
                                                        <div className="flex items-center gap-1.5 mt-1.5">
                                                            <SentimentBadge value={r.sentiment} size="xs" />
                                                            {r.outreach_campaigns && (
                                                                <span className="text-[10px] text-stone-500 px-1.5 py-0.5 bg-stone-100 rounded">
                                                                    {r.outreach_campaigns.name}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        {/* Detail (60%) */}
                        <div className="md:col-span-3 max-h-[75vh] overflow-y-auto">
                            {!selected ? (
                                <div className="p-12 text-center text-stone-400 text-sm">
                                    Pick a reply from the list to view it.
                                </div>
                            ) : (
                                <div className="p-5 space-y-4">
                                    <div className="space-y-1">
                                        <div className="flex items-start justify-between gap-2">
                                            <h2 className="text-base font-semibold text-stone-900">
                                                {selected.subject || "(no subject)"}
                                            </h2>
                                            <SentimentBadge value={selected.sentiment} />
                                        </div>
                                        <div className="text-xs text-stone-500 flex flex-wrap items-center gap-x-3 gap-y-1">
                                            <span className="flex items-center gap-1">
                                                <UserCircle2 className="w-3.5 h-3.5" />
                                                {selected.from_name
                                                    ? `${selected.from_name} <${selected.from_email}>`
                                                    : selected.from_email}
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <Calendar className="w-3.5 h-3.5" />
                                                {new Date(selected.received_at).toLocaleString()}
                                            </span>
                                            {selected.outreach_campaigns && (
                                                <span className="px-2 py-0.5 rounded bg-stone-100">
                                                    {selected.outreach_campaigns.name}
                                                </span>
                                            )}
                                            {selected.sentiment_source === "manual" && (
                                                <span className="text-[10px] uppercase tracking-wide text-amber-600">
                                                    sentiment: manual
                                                </span>
                                            )}
                                            {typeof selected.confidence === "number" && (
                                                <span className="text-[10px] text-stone-400">
                                                    confidence {(selected.confidence * 100).toFixed(0)}%
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {selected.intent && (
                                        <div className="text-xs px-2.5 py-1.5 rounded-lg bg-stone-50 border border-stone-200 text-stone-700">
                                            <strong className="text-stone-900">Intent:</strong>{" "}
                                            {selected.intent}
                                        </div>
                                    )}

                                    {selected.meeting_url && (
                                        <a
                                            href={selected.meeting_url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="inline-flex items-center gap-1.5 text-xs text-emerald-700 underline"
                                        >
                                            <Sparkles className="w-3.5 h-3.5" />
                                            Meeting link in this reply
                                        </a>
                                    )}

                                    {selected.outreach_contacts && (
                                        <div className="text-xs text-stone-600 border border-stone-200 rounded-lg p-2.5">
                                            <div className="font-medium text-stone-900">
                                                {[selected.outreach_contacts.first_name, selected.outreach_contacts.last_name].filter(Boolean).join(" ") ||
                                                    selected.outreach_contacts.email}
                                            </div>
                                            {selected.outreach_contacts.company_name && (
                                                <div className="text-stone-500">
                                                    {selected.outreach_contacts.company_name}
                                                </div>
                                            )}
                                            <Link
                                                href={`/admin/leads?contact=${selected.outreach_contacts.id}`}
                                                className="text-stone-600 underline mt-1 inline-block"
                                            >
                                                Open contact
                                            </Link>
                                        </div>
                                    )}

                                    <pre className="whitespace-pre-wrap font-sans text-sm text-stone-700 bg-stone-50 border border-stone-100 rounded-lg p-3 max-h-80 overflow-y-auto">
                                        {selected.body_text || selected.snippet || "(empty body)"}
                                    </pre>

                                    {sendNote && (
                                        <div className="text-xs text-stone-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                                            {sendNote}
                                        </div>
                                    )}

                                    {/* Action bar */}
                                    <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-stone-100">
                                        <button
                                            type="button"
                                            onClick={markHandled}
                                            disabled={acting === "handled"}
                                            className={clsx(
                                                "text-xs px-3 py-1.5 rounded-lg border",
                                                selected.is_handled
                                                    ? "border-stone-200 text-stone-600 bg-white"
                                                    : "border-emerald-500 text-white bg-emerald-600 hover:bg-emerald-700"
                                            )}
                                        >
                                            {selected.is_handled ? "Mark unhandled" : "Mark handled"}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setComposerOpen((v) => !v)}
                                            className="text-xs px-3 py-1.5 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 flex items-center gap-1"
                                        >
                                            <ReplyIcon className="w-3.5 h-3.5" /> Reply
                                        </button>
                                        <button
                                            type="button"
                                            onClick={draftReply}
                                            disabled={drafting}
                                            className="text-xs px-3 py-1.5 rounded-lg border border-violet-300 bg-violet-50 text-violet-800 hover:bg-violet-100 flex items-center gap-1 disabled:opacity-60"
                                        >
                                            {drafting ? (
                                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            ) : (
                                                <Sparkles className="w-3.5 h-3.5" />
                                            )}
                                            AI draft reply
                                        </button>
                                        <button
                                            type="button"
                                            onClick={forwardReply}
                                            disabled={acting === "forward"}
                                            className="text-xs px-3 py-1.5 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 flex items-center gap-1"
                                        >
                                            <Forward className="w-3.5 h-3.5" /> Forward
                                        </button>
                                        <button
                                            type="button"
                                            onClick={reclassify}
                                            disabled={acting === "reclassify"}
                                            className="text-xs px-3 py-1.5 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 flex items-center gap-1"
                                        >
                                            <Sparkles className="w-3.5 h-3.5" /> Re-classify
                                        </button>
                                    </div>

                                    {/* Manual sentiment override */}
                                    <div className="flex items-center gap-1.5 flex-wrap text-xs">
                                        <span className="text-stone-500">Manual sentiment:</span>
                                        {SENTIMENTS.map((s) => (
                                            <button
                                                key={s}
                                                type="button"
                                                onClick={() => setManualSentiment(s)}
                                                disabled={acting === `sent-${s}`}
                                                className={clsx(
                                                    "px-2 py-0.5 rounded-full border text-[10px]",
                                                    SENTIMENT_STYLES[s].chip,
                                                    selected.sentiment === s &&
                                                        "ring-2 ring-stone-900 ring-offset-1"
                                                )}
                                            >
                                                {SENTIMENT_STYLES[s].label}
                                            </button>
                                        ))}
                                    </div>

                                    {/* Tag contact + move campaign */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-2 border-t border-stone-100">
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="text"
                                                value={tagInput}
                                                onChange={(e) => setTagInput(e.target.value)}
                                                placeholder="Tag contact…"
                                                className="flex-1 text-xs border border-stone-200 rounded-lg px-2 py-1.5"
                                            />
                                            <button
                                                type="button"
                                                onClick={tagContact}
                                                disabled={acting === "tag" || !tagInput.trim()}
                                                className="text-xs px-2.5 py-1.5 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 flex items-center gap-1 disabled:opacity-50"
                                            >
                                                <Tag className="w-3.5 h-3.5" /> Tag
                                            </button>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <select
                                                value={moveCampaign}
                                                onChange={(e) => setMoveCampaign(e.target.value)}
                                                className="flex-1 text-xs border border-stone-200 rounded-lg px-2 py-1.5 bg-white"
                                            >
                                                <option value="">Add to follow-up campaign…</option>
                                                {campaigns.map((c) => (
                                                    <option key={c.id} value={c.id}>
                                                        {c.name}
                                                    </option>
                                                ))}
                                            </select>
                                            <button
                                                type="button"
                                                onClick={addToCampaign}
                                                disabled={acting === "campaign" || !moveCampaign}
                                                className="text-xs px-2.5 py-1.5 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 disabled:opacity-50"
                                            >
                                                Add
                                            </button>
                                        </div>
                                    </div>

                                    {/* Composer */}
                                    {composerOpen && (
                                        <div className="border border-stone-200 rounded-lg p-3 space-y-2">
                                            <div className="flex items-center justify-between text-xs text-stone-500">
                                                <span>
                                                    Replying to <strong>{selected.from_email}</strong>
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => setComposerOpen(false)}
                                                    className="text-stone-400 hover:text-stone-700"
                                                >
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                            <textarea
                                                value={composerBody}
                                                onChange={(e) => setComposerBody(e.target.value)}
                                                rows={6}
                                                placeholder="Write your reply…"
                                                className="w-full text-sm border border-stone-200 rounded-lg px-2.5 py-2"
                                            />
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    type="button"
                                                    onClick={draftReply}
                                                    disabled={drafting}
                                                    className="text-xs px-3 py-1.5 rounded-lg border border-violet-300 bg-violet-50 text-violet-800 hover:bg-violet-100 disabled:opacity-60 flex items-center gap-1.5"
                                                >
                                                    {drafting ? (
                                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                    ) : (
                                                        <Sparkles className="w-3.5 h-3.5" />
                                                    )}
                                                    {composerBody.trim() ? "Redraft" : "AI draft"}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={sendReply}
                                                    disabled={sending || !composerBody.trim()}
                                                    className="text-xs px-3 py-1.5 rounded-lg bg-stone-900 text-white hover:bg-stone-800 disabled:opacity-50 flex items-center gap-1.5"
                                                >
                                                    {sending ? (
                                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                    ) : (
                                                        <Send className="w-3.5 h-3.5" />
                                                    )}
                                                    Send reply
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
