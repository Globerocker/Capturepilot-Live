"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import {
    Workflow, Mail, MessageSquare, Clock, Plus, Trash2, Loader2, X,
    ChevronUp, ChevronDown, AlertCircle, Send, ArrowRight, FileText, PlayCircle,
    Check, ShieldOff,
} from "lucide-react";
import OutreachNav from "@/components/outreach/OutreachNav";

// ────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────
type Channel = "email" | "sms" | "wait";
type DelayUnit = "minutes" | "hours" | "days";

interface CampaignListRow {
    id: string;
    name: string;
    description: string | null;
    channels: string[] | null;
    status: string;
    contacts_count: number | null;
    reply_rate: number;
    created_at: string | null;
}

interface CampaignStepRow {
    id: string;
    step_index: number;
    channel: Channel;
    delay_value: number;
    delay_unit: DelayUnit;
    after_step: number | null;
    subject: string | null;
    body: string | null;
    variant_key: string | null;
    send_condition: "always" | "if_no_reply" | null;
}

interface Template {
    id: string;
    name: string;
    channel: "email" | "sms";
    subject: string | null;
    body: string;
    category: string | null;
    description?: string | null;
}

type SendCondition = "always" | "if_no_reply";

// A draft step assembled from a template (or a manual wait).
interface DraftStep {
    uid: string;
    template_id: string | null;   // null = wait step
    channel: Channel;
    name: string;                  // template name or "Wait"
    subject: string;
    body: string;
    delay_value: number;           // delay BEFORE this step fires
    delay_unit: DelayUnit;
    send_condition: SendCondition; // "if_no_reply" = only fire if no reply yet
}

// ────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────
const CATEGORY_LABELS: Record<string, string> = {
    seq_dormant: "Dormant re-engage",
    seq_fresh: "Fresh registrations",
    seq_backlink: "Backlink outreach",
    seq_qc_reengage: "Quick-Checker re-engage",
};

function categoryLabel(cat: string | null): string {
    if (!cat) return "Uncategorized";
    return CATEGORY_LABELS[cat] || cat;
}

function channelIcon(channel: Channel, className = "w-4 h-4") {
    if (channel === "email") return <Mail className={className} />;
    if (channel === "sms") return <MessageSquare className={className} />;
    return <Clock className={className} />;
}

function delayLabel(value: number, unit: DelayUnit): string {
    if (value <= 0) return "Immediately";
    const u = value === 1 ? unit.replace(/s$/, "") : unit;
    return `Wait ${value} ${u}`;
}

function uid() {
    return Math.random().toString(36).slice(2, 10);
}

// ────────────────────────────────────────────────────────────────
// Page
// ────────────────────────────────────────────────────────────────
export default function OutreachSequencesPage() {
    const [campaigns, setCampaigns] = useState<CampaignListRow[]>([]);
    const [templates, setTemplates] = useState<Template[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [selectedSteps, setSelectedSteps] = useState<CampaignStepRow[] | null>(null);
    const [selectedLoading, setSelectedLoading] = useState(false);

    const [builderOpen, setBuilderOpen] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [cRes, tRes] = await Promise.all([
                fetch("/api/admin/outreach/campaigns?status=all"),
                fetch("/api/admin/outreach/templates"),
            ]);
            if (!cRes.ok) throw new Error(`Campaigns load failed (${cRes.status})`);
            if (!tRes.ok) throw new Error(`Templates load failed (${tRes.status})`);
            const cJson = (await cRes.json()) as { campaigns: CampaignListRow[] };
            const tJson = (await tRes.json()) as { templates: Template[] };
            const list = (cJson.campaigns || []).filter((c) => c.status !== "archived");
            setCampaigns(list);
            setTemplates(tJson.templates || []);
            // Auto-select the first sequence so the timeline isn't empty on load.
            if (list.length > 0 && !selectedId) setSelectedId(list[0].id);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setLoading(false);
        }
    }, [selectedId]);

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Load the timeline for the selected sequence.
    useEffect(() => {
        if (!selectedId) {
            setSelectedSteps(null);
            return;
        }
        let cancelled = false;
        setSelectedLoading(true);
        (async () => {
            try {
                const res = await fetch(`/api/admin/outreach/campaigns/${selectedId}`);
                if (!res.ok) throw new Error(`Load failed (${res.status})`);
                const json = (await res.json()) as { steps: CampaignStepRow[] };
                if (cancelled) return;
                // Show one row per step_index (collapse A/B variants to the canonical "A").
                const canonical = (json.steps || [])
                    .filter((s) => !s.variant_key || s.variant_key === "A")
                    .sort((a, b) => a.step_index - b.step_index);
                setSelectedSteps(canonical);
            } catch {
                if (!cancelled) setSelectedSteps([]);
            } finally {
                if (!cancelled) setSelectedLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [selectedId]);

    const selected = useMemo(
        () => campaigns.find((c) => c.id === selectedId) || null,
        [campaigns, selectedId],
    );

    return (
        <div className="min-h-screen bg-stone-50">
            <header className="bg-white border-b border-stone-200 px-4 sm:px-6 pt-4">
                <div className="max-w-[1600px] mx-auto">
                    <h1 className="font-bold text-lg flex items-center gap-2 mb-3">
                        <Workflow className="w-5 h-5" /> Sequences
                    </h1>
                    <OutreachNav active="sequences" />
                </div>
            </header>

            <main className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6">
                {error && (
                    <div className="mb-4 text-sm bg-red-50 text-red-700 border border-red-200 rounded-lg px-4 py-2.5 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0" /> {error}
                    </div>
                )}

                <div className="flex items-center justify-between mb-4">
                    <p className="text-sm text-stone-500">
                        Chain templates into a multi-step cadence — email, SMS, and timed waits.
                    </p>
                    <button
                        type="button"
                        onClick={() => setBuilderOpen(true)}
                        className="bg-stone-900 hover:bg-black text-white font-bold px-3.5 py-2 rounded-lg inline-flex items-center gap-2 text-sm"
                    >
                        <Plus className="w-4 h-4" /> New sequence
                    </button>
                </div>

                {loading ? (
                    <div className="flex items-center gap-2 text-stone-500 text-sm">
                        <Loader2 className="w-4 h-4 animate-spin" /> Loading sequences…
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5">
                        {/* Left — sequence list */}
                        <div className="space-y-2">
                            {campaigns.length === 0 && (
                                <div className="bg-white border border-dashed border-stone-300 rounded-2xl p-6 text-center text-sm text-stone-500">
                                    No sequences yet. Click <span className="font-bold">New sequence</span> to build your first cadence.
                                </div>
                            )}
                            {campaigns.map((c) => (
                                <button
                                    key={c.id}
                                    type="button"
                                    onClick={() => setSelectedId(c.id)}
                                    className={clsx(
                                        "w-full text-left bg-white border rounded-2xl p-4 transition-colors",
                                        selectedId === c.id
                                            ? "border-stone-900 ring-1 ring-stone-900"
                                            : "border-stone-200 hover:border-stone-400",
                                    )}
                                >
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold text-sm truncate flex-1">{c.name}</span>
                                        <StatusPill status={c.status} />
                                    </div>
                                    <div className="flex items-center gap-2 mt-2">
                                        {(c.channels || []).map((ch) => (
                                            <span key={ch} className="text-stone-500">
                                                {channelIcon(ch as Channel, "w-3.5 h-3.5")}
                                            </span>
                                        ))}
                                        <span className="text-xs text-stone-400 ml-auto">
                                            {(c.contacts_count ?? 0).toLocaleString()} enrolled
                                        </span>
                                    </div>
                                </button>
                            ))}
                        </div>

                        {/* Right — timeline */}
                        <div className="bg-white border border-stone-200 rounded-2xl p-6 min-h-[400px]">
                            {!selected ? (
                                <div className="h-full flex items-center justify-center text-sm text-stone-400">
                                    Select a sequence to view its cadence.
                                </div>
                            ) : (
                                <>
                                    <div className="flex items-start justify-between mb-5">
                                        <div>
                                            <h2 className="font-bold text-base">{selected.name}</h2>
                                            {selected.description && (
                                                <p className="text-sm text-stone-500 mt-0.5">{selected.description}</p>
                                            )}
                                        </div>
                                        <StatusPill status={selected.status} />
                                    </div>

                                    {selectedLoading ? (
                                        <div className="flex items-center gap-2 text-stone-500 text-sm">
                                            <Loader2 className="w-4 h-4 animate-spin" /> Loading cadence…
                                        </div>
                                    ) : (
                                        <Timeline steps={selectedSteps || []} />
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                )}
            </main>

            {builderOpen && (
                <SequenceBuilder
                    templates={templates}
                    onClose={() => setBuilderOpen(false)}
                    onSaved={(newId) => {
                        setBuilderOpen(false);
                        setSelectedId(newId);
                        load();
                    }}
                />
            )}
        </div>
    );
}

// ────────────────────────────────────────────────────────────────
// Mini toggle switch (visual only — state lives in the parent)
// ────────────────────────────────────────────────────────────────
function Toggle({ on }: { on: boolean }) {
    return (
        <span
            className={clsx(
                "relative inline-flex h-4 w-7 items-center rounded-full transition-colors",
                on ? "bg-emerald-500" : "bg-stone-300",
            )}
            aria-hidden
        >
            <span
                className={clsx(
                    "inline-block h-3 w-3 transform rounded-full bg-white transition-transform",
                    on ? "translate-x-3.5" : "translate-x-0.5",
                )}
            />
        </span>
    );
}

// ────────────────────────────────────────────────────────────────
// Status pill
// ────────────────────────────────────────────────────────────────
function StatusPill({ status }: { status: string }) {
    const map: Record<string, string> = {
        draft: "bg-stone-100 text-stone-600",
        active: "bg-emerald-100 text-emerald-700",
        paused: "bg-amber-100 text-amber-700",
        completed: "bg-sky-100 text-sky-700",
        archived: "bg-stone-100 text-stone-400",
    };
    return (
        <span className={clsx(
            "text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-full shrink-0",
            map[status] || "bg-stone-100 text-stone-600",
        )}>
            {status}
        </span>
    );
}

// ────────────────────────────────────────────────────────────────
// Vertical timeline — the core visual deliverable
// ────────────────────────────────────────────────────────────────
function Timeline({ steps }: { steps: CampaignStepRow[] }) {
    if (steps.length === 0) {
        return (
            <div className="text-sm text-stone-400 border border-dashed border-stone-200 rounded-xl p-6 text-center">
                This sequence has no steps yet.
            </div>
        );
    }

    return (
        <ol className="relative">
            {steps.map((s, i) => {
                const isWait = s.channel === "wait";
                return (
                    <li key={s.id} className="relative pl-12 pb-2">
                        {/* Connector line down to the next step */}
                        {i < steps.length - 1 && (
                            <span
                                className="absolute left-[15px] top-9 bottom-0 w-px bg-stone-200"
                                aria-hidden
                            />
                        )}

                        {/* Channel node */}
                        <span
                            className={clsx(
                                "absolute left-0 top-1 w-8 h-8 rounded-full flex items-center justify-center border",
                                s.channel === "email" && "bg-sky-50 border-sky-200 text-sky-600",
                                s.channel === "sms" && "bg-violet-50 border-violet-200 text-violet-600",
                                s.channel === "wait" && "bg-stone-50 border-stone-200 text-stone-500",
                            )}
                        >
                            {channelIcon(s.channel)}
                        </span>

                        {/* Delay connector label (skip on the very first step if immediate) */}
                        {(s.delay_value > 0 || i > 0) && (
                            <div className="flex items-center gap-1.5 text-[11px] font-medium text-stone-400 mb-1.5">
                                <Clock className="w-3 h-3" />
                                {delayLabel(s.delay_value, s.delay_unit)}
                                {i > 0 && s.delay_value > 0 && <span className="text-stone-300">after previous step</span>}
                            </div>
                        )}

                        {/* Step card */}
                        <div className={clsx(
                            "rounded-2xl border p-4",
                            isWait ? "bg-stone-50 border-stone-200" : "bg-white border-stone-200 shadow-sm",
                        )}>
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-stone-400">
                                    Step {i + 1} · {s.channel}
                                </span>
                                {!isWait && s.send_condition === "if_no_reply" && (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5">
                                        <ShieldOff className="w-2.5 h-2.5" /> Only if no reply
                                    </span>
                                )}
                            </div>
                            {isWait ? (
                                <p className="text-sm text-stone-500">
                                    Pause the cadence for {s.delay_value} {s.delay_unit} before continuing.
                                </p>
                            ) : (
                                <>
                                    {s.channel === "email" && (
                                        <p className="text-sm font-bold text-stone-900 break-words">
                                            {s.subject || <span className="text-stone-300 font-normal">(no subject)</span>}
                                        </p>
                                    )}
                                    <p className="text-xs text-stone-500 mt-1 line-clamp-2 whitespace-pre-wrap break-words">
                                        {s.body || <span className="text-stone-300">(empty body)</span>}
                                    </p>
                                </>
                            )}
                        </div>
                    </li>
                );
            })}

            {/* Tail node */}
            <li className="relative pl-12 pt-1">
                <span className="absolute left-[7px] top-2 w-4 h-4 rounded-full bg-stone-200" aria-hidden />
                <span className="text-xs text-stone-400">Sequence complete</span>
            </li>
        </ol>
    );
}

// ────────────────────────────────────────────────────────────────
// Sequence builder — pick templates in order, set per-step delays
// ────────────────────────────────────────────────────────────────
function SequenceBuilder({
    templates,
    onClose,
    onSaved,
}: {
    templates: Template[];
    onClose: () => void;
    onSaved: (id: string) => void;
}) {
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [steps, setSteps] = useState<DraftStep[]>([]);
    const [stopOnReply, setStopOnReply] = useState(true); // stop the whole cadence once they reply
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    // Escape closes when idle
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape" && !saving) onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [saving, onClose]);

    // Group templates by category for the picker.
    const grouped = useMemo(() => {
        const map = new Map<string, Template[]>();
        for (const t of templates) {
            const key = t.category || "";
            if (!map.has(key)) map.set(key, []);
            map.get(key)!.push(t);
        }
        return [...map.entries()].sort((a, b) => categoryLabel(a[0]).localeCompare(categoryLabel(b[0])));
    }, [templates]);

    const addTemplate = useCallback((t: Template) => {
        setSteps((prev) => [
            ...prev,
            {
                uid: uid(),
                template_id: t.id,
                channel: t.channel,
                name: t.name,
                subject: t.subject || "",
                body: t.body || "",
                // First step fires immediately; later steps default to a 2-day wait.
                delay_value: prev.length === 0 ? 0 : 2,
                delay_unit: "days",
                // First touch always sends; follow-ups default to reply-gated so
                // we stop pestering anyone who already answered.
                send_condition: prev.length === 0 ? "always" : "if_no_reply",
            },
        ]);
    }, []);

    const addWait = useCallback(() => {
        setSteps((prev) => [
            ...prev,
            {
                uid: uid(),
                template_id: null,
                channel: "wait",
                name: "Wait",
                subject: "",
                body: "",
                delay_value: prev.length === 0 ? 1 : 3,
                delay_unit: "days",
                send_condition: "always", // wait steps don't send; gate is irrelevant
            },
        ]);
    }, []);

    const updateStep = useCallback((id: string, patch: Partial<DraftStep>) => {
        setSteps((prev) => prev.map((s) => (s.uid === id ? { ...s, ...patch } : s)));
    }, []);

    const removeStep = useCallback((id: string) => {
        setSteps((prev) => prev.filter((s) => s.uid !== id));
    }, []);

    const moveStep = useCallback((id: string, dir: -1 | 1) => {
        setSteps((prev) => {
            const idx = prev.findIndex((s) => s.uid === id);
            const next = idx + dir;
            if (idx < 0 || next < 0 || next >= prev.length) return prev;
            const copy = [...prev];
            [copy[idx], copy[next]] = [copy[next], copy[idx]];
            return copy;
        });
    }, []);

    const channels = useMemo(() => {
        const set = new Set<string>();
        for (const s of steps) if (s.channel === "email" || s.channel === "sms") set.add(s.channel);
        if (set.size === 0) set.add("email");
        return [...set];
    }, [steps]);

    const save = useCallback(async (activate: boolean) => {
        setErr(null);
        if (!name.trim()) { setErr("Give the sequence a name."); return; }
        if (steps.length === 0) { setErr("Add at least one step."); return; }
        setSaving(true);
        try {
            const payload = {
                name: name.trim(),
                description: description.trim() || undefined,
                channels,
                target_segment: {},
                stop_on_reply: stopOnReply,
                steps: steps.map((s, idx) => ({
                    step_index: idx,
                    channel: s.channel,
                    delay_value: Math.max(0, Number(s.delay_value) || 0),
                    delay_unit: s.delay_unit,
                    after_step: idx === 0 ? null : idx - 1,
                    subject: s.channel === "email" ? s.subject : undefined,
                    body: s.body,
                    body_format: "text" as const,
                    skip_if_replied: true,
                    skip_if_clicked: false,
                    send_condition: s.channel === "wait" ? "always" : s.send_condition,
                    variant_key: "A",
                    variant_weight: 100,
                })),
                activate,
            };
            const res = await fetch("/api/admin/outreach/campaigns", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const json = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
            if (!res.ok || !json.id) throw new Error(json.error || `Save failed (${res.status})`);
            onSaved(json.id);
        } catch (e) {
            setErr((e as Error).message);
        } finally {
            setSaving(false);
        }
    }, [name, description, steps, channels, stopOnReply, onSaved]);

    return (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="border-b border-stone-200 px-6 py-4 flex items-center gap-4">
                    <div className="flex-1">
                        <h2 className="text-lg font-bold tracking-tight flex items-center gap-2">
                            <Workflow className="w-5 h-5" /> New sequence
                        </h2>
                        <p className="text-xs text-stone-500">
                            {name || "Untitled"} · {steps.length} step{steps.length === 1 ? "" : "s"}
                        </p>
                    </div>
                    <button type="button" onClick={onClose} className="p-2 rounded hover:bg-stone-100" aria-label="Close">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="flex-1 grid grid-cols-1 md:grid-cols-[1fr_300px] overflow-hidden">
                    {/* Left — the cadence being assembled */}
                    <div className="overflow-auto p-6 space-y-5 border-r border-stone-200">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs font-bold uppercase tracking-widest text-stone-500 block mb-1.5">
                                    Sequence name
                                </label>
                                <input
                                    type="text"
                                    placeholder="e.g. Dormant client re-engage"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-black"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold uppercase tracking-widest text-stone-500 block mb-1.5">
                                    Description
                                </label>
                                <input
                                    type="text"
                                    placeholder="Internal note (optional)"
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-black"
                                />
                            </div>
                        </div>

                        {/* Campaign-level reply gate */}
                        <button
                            type="button"
                            onClick={() => setStopOnReply((v) => !v)}
                            className={clsx(
                                "w-full flex items-start gap-3 text-left rounded-2xl border p-3 transition-colors",
                                stopOnReply
                                    ? "bg-emerald-50 border-emerald-200"
                                    : "bg-stone-50 border-stone-200 hover:border-stone-300",
                            )}
                        >
                            <span
                                className={clsx(
                                    "mt-0.5 w-9 h-9 rounded-full flex items-center justify-center shrink-0 border",
                                    stopOnReply
                                        ? "bg-emerald-100 border-emerald-200 text-emerald-700"
                                        : "bg-white border-stone-200 text-stone-400",
                                )}
                            >
                                <ShieldOff className="w-4 h-4" />
                            </span>
                            <span className="flex-1">
                                <span className="text-sm font-bold text-stone-900 flex items-center gap-2">
                                    Stop sequence when they reply
                                    <Toggle on={stopOnReply} />
                                </span>
                                <span className="block text-xs text-stone-500 mt-0.5">
                                    The moment a contact replies, all remaining steps are halted. Recommended for cold outreach.
                                </span>
                            </span>
                        </button>

                        {/* Assembled cadence */}
                        {steps.length === 0 ? (
                            <div className="border border-dashed border-stone-300 rounded-2xl p-8 text-center text-sm text-stone-400">
                                Pick a template from the right to start the cadence.
                            </div>
                        ) : (
                            <ol className="relative">
                                {steps.map((s, i) => {
                                    const isWait = s.channel === "wait";
                                    return (
                                        <li key={s.uid} className="relative pl-12 pb-3">
                                            {i < steps.length - 1 && (
                                                <span className="absolute left-[15px] top-10 bottom-0 w-px bg-stone-200" aria-hidden />
                                            )}
                                            <span
                                                className={clsx(
                                                    "absolute left-0 top-2 w-8 h-8 rounded-full flex items-center justify-center border",
                                                    s.channel === "email" && "bg-sky-50 border-sky-200 text-sky-600",
                                                    s.channel === "sms" && "bg-violet-50 border-violet-200 text-violet-600",
                                                    s.channel === "wait" && "bg-stone-50 border-stone-200 text-stone-500",
                                                )}
                                            >
                                                {channelIcon(s.channel)}
                                            </span>

                                            {/* Delay control */}
                                            <div className="flex items-center gap-1.5 text-[11px] text-stone-500 mb-1.5">
                                                <Clock className="w-3 h-3 text-stone-400" />
                                                {i === 0 ? "Send" : "Wait"}
                                                <input
                                                    type="number"
                                                    min={0}
                                                    value={s.delay_value}
                                                    onChange={(e) => updateStep(s.uid, { delay_value: Math.max(0, Number(e.target.value)) })}
                                                    className="w-14 px-1.5 py-0.5 border border-stone-200 rounded text-center"
                                                    aria-label="Delay value"
                                                />
                                                <select
                                                    value={s.delay_unit}
                                                    onChange={(e) => updateStep(s.uid, { delay_unit: e.target.value as DelayUnit })}
                                                    className="px-1.5 py-0.5 border border-stone-200 rounded"
                                                    aria-label="Delay unit"
                                                >
                                                    <option value="minutes">minutes</option>
                                                    <option value="hours">hours</option>
                                                    <option value="days">days</option>
                                                </select>
                                                {i === 0 ? <span className="text-stone-300">after enroll</span> : <span className="text-stone-300">after prev</span>}
                                            </div>

                                            {/* Card */}
                                            <div className={clsx(
                                                "rounded-2xl border p-3",
                                                isWait ? "bg-stone-50 border-stone-200" : "bg-white border-stone-200 shadow-sm",
                                            )}>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] font-bold uppercase tracking-widest text-stone-400">
                                                        Step {i + 1} · {s.channel}
                                                    </span>
                                                    <div className="ml-auto flex items-center gap-0.5">
                                                        <button
                                                            type="button"
                                                            onClick={() => moveStep(s.uid, -1)}
                                                            disabled={i === 0}
                                                            className="p-1 rounded hover:bg-stone-100 disabled:opacity-30"
                                                            aria-label="Move up"
                                                        >
                                                            <ChevronUp className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => moveStep(s.uid, 1)}
                                                            disabled={i === steps.length - 1}
                                                            className="p-1 rounded hover:bg-stone-100 disabled:opacity-30"
                                                            aria-label="Move down"
                                                        >
                                                            <ChevronDown className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => removeStep(s.uid)}
                                                            className="p-1 rounded hover:bg-rose-50 text-rose-600"
                                                            aria-label="Remove step"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                </div>
                                                {isWait ? (
                                                    <p className="text-sm text-stone-500 mt-1">Pause before the next step.</p>
                                                ) : (
                                                    <>
                                                        <p className="text-sm font-bold text-stone-900 mt-1 break-words">{s.name}</p>
                                                        {s.channel === "email" && s.subject && (
                                                            <p className="text-xs text-stone-500 mt-0.5 break-words">{s.subject}</p>
                                                        )}
                                                        <p className="text-xs text-stone-400 mt-1 line-clamp-2 whitespace-pre-wrap break-words">{s.body}</p>

                                                        {/* Per-step reply gate */}
                                                        <button
                                                            type="button"
                                                            onClick={() => updateStep(s.uid, {
                                                                send_condition: s.send_condition === "if_no_reply" ? "always" : "if_no_reply",
                                                            })}
                                                            className={clsx(
                                                                "mt-2 inline-flex items-center gap-1.5 text-[11px] font-medium rounded-full border px-2 py-1 transition-colors",
                                                                s.send_condition === "if_no_reply"
                                                                    ? "bg-amber-50 border-amber-200 text-amber-700"
                                                                    : "bg-white border-stone-200 text-stone-500 hover:border-stone-300",
                                                            )}
                                                            title="Skip this step if the contact has already replied to the sequence"
                                                        >
                                                            <span
                                                                className={clsx(
                                                                    "w-3.5 h-3.5 rounded-[4px] border flex items-center justify-center",
                                                                    s.send_condition === "if_no_reply"
                                                                        ? "bg-amber-500 border-amber-500 text-white"
                                                                        : "bg-white border-stone-300 text-transparent",
                                                                )}
                                                            >
                                                                <Check className="w-2.5 h-2.5" />
                                                            </span>
                                                            Only send if no reply yet
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </li>
                                    );
                                })}
                            </ol>
                        )}
                    </div>

                    {/* Right — template picker */}
                    <div className="overflow-auto bg-stone-50 p-4 space-y-4">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-stone-400">
                                Add to cadence
                            </span>
                            <button
                                type="button"
                                onClick={addWait}
                                className="text-xs font-bold text-stone-600 bg-white border border-stone-200 px-2 py-1 rounded inline-flex items-center gap-1 hover:bg-stone-100"
                            >
                                <Clock className="w-3 h-3" /> Wait
                            </button>
                        </div>

                        {templates.length === 0 && (
                            <p className="text-xs text-stone-400">
                                No templates yet. Create some under the Templates tab first.
                            </p>
                        )}

                        {grouped.map(([cat, list]) => (
                            <div key={cat || "uncat"}>
                                <div className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1.5 flex items-center gap-1">
                                    <FileText className="w-3 h-3" /> {categoryLabel(cat)}
                                </div>
                                <div className="space-y-1.5">
                                    {list.map((t) => (
                                        <button
                                            key={t.id}
                                            type="button"
                                            onClick={() => addTemplate(t)}
                                            className="w-full text-left bg-white border border-stone-200 rounded-lg p-2.5 hover:border-stone-400 transition-colors group"
                                        >
                                            <div className="flex items-center gap-1.5">
                                                {channelIcon(t.channel, "w-3.5 h-3.5 text-stone-500")}
                                                <span className="text-xs font-bold truncate flex-1">{t.name}</span>
                                                <Plus className="w-3.5 h-3.5 text-stone-300 group-hover:text-stone-600" />
                                            </div>
                                            {t.channel === "email" && t.subject && (
                                                <p className="text-[11px] text-stone-400 mt-0.5 truncate">{t.subject}</p>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Footer */}
                <div className="border-t border-stone-200 px-6 py-3 flex items-center gap-3">
                    {err && (
                        <span className="text-xs text-rose-700 inline-flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5" /> {err}
                        </span>
                    )}
                    <span className="text-xs text-stone-400 inline-flex items-center gap-1">
                        {steps.length > 0 && (
                            <>
                                {steps.map((s, i) => (
                                    <span key={s.uid} className="inline-flex items-center gap-1">
                                        {channelIcon(s.channel, "w-3 h-3")}
                                        {i < steps.length - 1 && <ArrowRight className="w-3 h-3 text-stone-300" />}
                                    </span>
                                ))}
                            </>
                        )}
                    </span>
                    <div className="flex-1" />
                    <button
                        type="button"
                        onClick={() => save(false)}
                        disabled={saving || !name.trim() || steps.length === 0}
                        className="text-xs font-bold text-stone-700 bg-white border border-stone-200 px-4 py-2 rounded-lg inline-flex items-center gap-1.5 disabled:opacity-50 hover:bg-stone-50"
                    >
                        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                        Save as draft
                    </button>
                    <button
                        type="button"
                        onClick={() => save(true)}
                        disabled={saving || !name.trim() || steps.length === 0}
                        className="text-xs font-bold bg-emerald-600 text-white px-4 py-2 rounded-lg inline-flex items-center gap-1.5 disabled:opacity-50 hover:bg-emerald-700"
                    >
                        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlayCircle className="w-3.5 h-3.5" />}
                        Save + activate
                    </button>
                </div>
            </div>
        </div>
    );
}
