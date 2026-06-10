"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import {
    ArrowLeft,
    Building,
    Calendar,
    CheckCircle,
    Circle,
    Clock,
    DollarSign,
    ExternalLink,
    Flag,
    History,
    Loader2,
    Save,
    Target,
    Trophy,
    X as XIcon,
} from "lucide-react";
import { createSupabaseClient } from "@/lib/supabase/client";
import {
    DEFAULT_STAGES,
    type PipelineStage,
    getStageInfo,
    parseStagesFromNotes,
} from "@/lib/pipeline-stages";
import { logPipelineActivity } from "@/lib/pipeline-activity";
import { capturePursuitOutcome } from "@/lib/learning-capture";
import ActivityTimeline, { type ActivityRow } from "@/components/pipeline/ActivityTimeline";

const supabase = createSupabaseClient();

interface PursuitOpportunity {
    id: string;
    title: string;
    agency: string | null;
    response_deadline: string | null;
    notice_type: string | null;
    set_aside_code: string | null;
    naics_code: string | null;
    award_amount: number | null;
}

interface Pursuit {
    id: string;
    opportunity_id: string;
    user_profile_id: string;
    stage: string;
    priority: string;
    notes: string | null;
    stage_changed_at: string;
    created_at: string;
    opportunities: PursuitOpportunity | null;
}

interface ActionItem {
    id: string;
    title: string;
    description: string | null;
    category: string;
    priority: string;
    status: string;
    due_date: string | null;
    completed_at: string | null;
    created_at: string;
}

const PRIORITIES = [
    { key: "low", label: "Low", color: "bg-stone-100 text-stone-600 border-stone-200" },
    { key: "medium", label: "Medium", color: "bg-amber-50 text-amber-700 border-amber-200" },
    { key: "high", label: "High", color: "bg-red-50 text-red-700 border-red-200" },
] as const;

export default function DealDetailPage({ params }: { params: Promise<{ pursuitId: string }> }) {
    const { pursuitId } = use(params);
    const router = useRouter();

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [pursuit, setPursuit] = useState<Pursuit | null>(null);
    const [profileNotes, setProfileNotes] = useState<string | null>(null);
    const [actionItems, setActionItems] = useState<ActionItem[]>([]);
    const [activity, setActivity] = useState<ActivityRow[]>([]);

    const [notesDraft, setNotesDraft] = useState("");
    const [savingNotes, setSavingNotes] = useState(false);
    const [savingStage, setSavingStage] = useState(false);
    const [savingPriority, setSavingPriority] = useState(false);

    // Outcome capture (learning loop)
    const [outcomeOpen, setOutcomeOpen] = useState(false);
    const [outcomeChoice, setOutcomeChoice] = useState<"won" | "lost" | "no_bid" | "withdrawn">("won");
    const [outcomeAmount, setOutcomeAmount] = useState("");
    const [outcomeDate, setOutcomeDate] = useState("");
    const [outcomeLessons, setOutcomeLessons] = useState("");
    const [outcomeSaving, setOutcomeSaving] = useState(false);
    const [outcomeSaved, setOutcomeSaved] = useState(false);
    const [outcomeError, setOutcomeError] = useState<string | null>(null);

    const stages: PipelineStage[] = useMemo(
        () => parseStagesFromNotes(profileNotes),
        [profileNotes],
    );

    const currentStage = useMemo(
        () => (pursuit ? getStageInfo(stages, pursuit.stage) : DEFAULT_STAGES[0]),
        [pursuit, stages],
    );

    const resolveStageLabel = useCallback(
        (key: string | null) => {
            if (!key) return "unknown";
            const match = stages.find(s => s.key === key) || DEFAULT_STAGES.find(s => s.key === key);
            return match ? match.label : key;
        },
        [stages],
    );

    const loadActivity = useCallback(async (pId: string) => {
        const { data } = await supabase
            .from("pipeline_activity")
            .select("id, activity_type, from_value, to_value, description, created_at")
            .eq("pursuit_id", pId)
            .order("created_at", { ascending: false })
            .limit(200);
        setActivity((data || []) as ActivityRow[]);
    }, []);

    useEffect(() => {
        async function load() {
            setLoading(true);
            setError(null);

            const { data: { user } } = await supabase.auth.getUser();
            if (!user) { router.push("/login"); return; }

            const { data: profile } = await supabase
                .from("user_profiles")
                .select("id, notes")
                .eq("auth_user_id", user.id)
                .single();

            if (!profile) { router.push("/onboard"); return; }
            setProfileNotes(profile.notes);

            const { data: pData, error: pErr } = await supabase
                .from("user_pursuits")
                .select("*, opportunities(id, title, agency, response_deadline, notice_type, set_aside_code, naics_code, award_amount)")
                .eq("id", pursuitId)
                .eq("user_profile_id", profile.id)
                .single();

            if (pErr || !pData) {
                setError("Deal not found or access denied.");
                setLoading(false);
                return;
            }

            const typedPursuit = pData as Pursuit;
            setPursuit(typedPursuit);
            setNotesDraft(typedPursuit.notes || "");

            // Load action items matching this opportunity.
            if (typedPursuit.opportunity_id) {
                const { data: aData } = await supabase
                    .from("user_action_items")
                    .select("*")
                    .eq("user_profile_id", profile.id)
                    .eq("opportunity_id", typedPursuit.opportunity_id)
                    .order("created_at", { ascending: true });
                setActionItems((aData || []) as ActionItem[]);
            }

            await loadActivity(typedPursuit.id);
            setLoading(false);
        }
        load();
    }, [pursuitId, router, loadActivity]);

    const updateStage = async (newStage: string) => {
        if (!pursuit || newStage === pursuit.stage) return;
        setSavingStage(true);
        const prevStage = pursuit.stage;
        const now = new Date().toISOString();

        const { error: upErr } = await supabase
            .from("user_pursuits")
            .update({ stage: newStage, stage_changed_at: now })
            .eq("id", pursuit.id);

        if (!upErr) {
            setPursuit(p => (p ? { ...p, stage: newStage, stage_changed_at: now } : p));
            await logPipelineActivity(supabase, {
                pursuitId: pursuit.id,
                userProfileId: pursuit.user_profile_id,
                activityType: "stage_changed",
                fromValue: prevStage,
                toValue: newStage,
            });
            await loadActivity(pursuit.id);
        }
        setSavingStage(false);
    };

    const updatePriority = async (newPriority: string) => {
        if (!pursuit || newPriority === pursuit.priority) return;
        setSavingPriority(true);
        const prev = pursuit.priority;
        const { error: upErr } = await supabase
            .from("user_pursuits")
            .update({ priority: newPriority })
            .eq("id", pursuit.id);

        if (!upErr) {
            setPursuit(p => (p ? { ...p, priority: newPriority } : p));
            await logPipelineActivity(supabase, {
                pursuitId: pursuit.id,
                userProfileId: pursuit.user_profile_id,
                activityType: "priority_changed",
                fromValue: prev,
                toValue: newPriority,
            });
            await loadActivity(pursuit.id);
        }
        setSavingPriority(false);
    };

    const saveNotes = async () => {
        if (!pursuit) return;
        setSavingNotes(true);
        const hadNotes = !!(pursuit.notes && pursuit.notes.trim().length > 0);
        const trimmed = notesDraft.trim();
        const newValue = trimmed.length === 0 ? null : notesDraft;

        const { error: upErr } = await supabase
            .from("user_pursuits")
            .update({ notes: newValue })
            .eq("id", pursuit.id);

        if (!upErr) {
            setPursuit(p => (p ? { ...p, notes: newValue } : p));
            await logPipelineActivity(supabase, {
                pursuitId: pursuit.id,
                userProfileId: pursuit.user_profile_id,
                activityType: hadNotes ? "note_updated" : "note_added",
            });
            await loadActivity(pursuit.id);
        }
        setSavingNotes(false);
    };

    const toggleActionItem = async (item: ActionItem) => {
        if (!pursuit) return;
        const completing = item.status !== "completed";
        const newStatus = completing ? "completed" : "pending";
        const newCompletedAt = completing ? new Date().toISOString() : null;

        const { error: upErr } = await supabase
            .from("user_action_items")
            .update({ status: newStatus, completed_at: newCompletedAt })
            .eq("id", item.id);

        if (!upErr) {
            setActionItems(prev => prev.map(a => a.id === item.id ? { ...a, status: newStatus, completed_at: newCompletedAt } : a));
            if (completing) {
                await logPipelineActivity(supabase, {
                    pursuitId: pursuit.id,
                    userProfileId: pursuit.user_profile_id,
                    activityType: "action_completed",
                    toValue: item.title,
                });
                await loadActivity(pursuit.id);
            }
        }
    };

    const submitOutcome = async () => {
        if (!pursuit || outcomeSaving) return;
        setOutcomeSaving(true);
        setOutcomeError(null);
        try {
            const amount = outcomeAmount.trim().length > 0 ? Number(outcomeAmount) : null;
            const res = await capturePursuitOutcome({
                pursuitId: pursuit.id,
                outcome: outcomeChoice,
                amountAwarded: amount !== null && Number.isFinite(amount) ? amount : null,
                decisionDate: outcomeDate || null,
                lessonsLearned: outcomeLessons.trim().length > 0 ? outcomeLessons.trim() : null,
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({ error: "Save failed" }));
                throw new Error(body.error || "Save failed");
            }
            setOutcomeSaved(true);
            setTimeout(() => {
                setOutcomeOpen(false);
                setOutcomeSaved(false);
            }, 1200);
        } catch (e) {
            setOutcomeError((e as Error).message);
        }
        setOutcomeSaving(false);
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center min-h-[400px]">
                <Loader2 className="w-10 h-10 animate-spin text-stone-400" />
            </div>
        );
    }

    if (error || !pursuit) {
        return (
            <div className="max-w-3xl mx-auto px-4 py-12 text-center">
                <p className="text-stone-600 mb-4">{error || "Deal not found."}</p>
                <button
                    type="button"
                    onClick={() => router.back()}
                    className="inline-flex items-center bg-black text-white font-bold px-4 py-2 rounded-full hover:bg-stone-800 transition-all text-xs"
                >
                    <ArrowLeft className="w-3.5 h-3.5 mr-1.5" /> Back
                </button>
            </div>
        );
    }

    const opp = pursuit.opportunities;
    const deadline = opp?.response_deadline ? new Date(opp.response_deadline) : null;
    const daysLeft = deadline ? Math.ceil((deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;

    const notesDirty = (notesDraft || "") !== (pursuit.notes || "");

    const openItems = actionItems.filter(a => a.status !== "completed");
    const doneItems = actionItems.filter(a => a.status === "completed");

    return (
        <div className="max-w-4xl mx-auto pb-12 animate-in fade-in duration-500 px-1">
            {/* Breadcrumb / back */}
            <div className="mb-4 flex items-center gap-2 text-xs text-stone-500">
                <button
                    type="button"
                    onClick={() => router.back()}
                    className="inline-flex items-center gap-1 hover:text-black font-medium"
                >
                    <ArrowLeft className="w-3.5 h-3.5" /> Back to Pipeline
                </button>
                <span className="text-stone-300">/</span>
                <span className="truncate">Deal detail</span>
            </div>

            {/* Header */}
            <header className="mb-5">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className={clsx("text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border", currentStage.color)}>
                                {currentStage.label}
                            </span>
                            {opp?.notice_type && (
                                <span className="text-[10px] font-bold bg-stone-100 text-stone-600 border border-stone-200 px-2 py-0.5 rounded-full">
                                    {opp.notice_type}
                                </span>
                            )}
                            {opp?.set_aside_code && (
                                <span className="text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full">
                                    {opp.set_aside_code}
                                </span>
                            )}
                        </div>
                        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-black line-clamp-2">
                            {opp?.title || "Unknown Opportunity"}
                        </h1>
                        {opp?.agency && (
                            <p className="text-sm text-stone-500 mt-1 flex items-center gap-1">
                                <Building className="w-3.5 h-3.5" /> {opp.agency}
                            </p>
                        )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        {(pursuit.stage === "submitted" || pursuit.stage === "awarded" || pursuit.stage === "lost") && (
                            <button
                                type="button"
                                onClick={() => {
                                    setOutcomeChoice(pursuit.stage === "awarded" ? "won" : pursuit.stage === "lost" ? "lost" : "won");
                                    setOutcomeOpen(true);
                                }}
                                className="inline-flex items-center bg-emerald-600 text-white font-bold px-3 py-2 rounded-full hover:bg-emerald-700 transition-all text-xs"
                            >
                                <Trophy className="w-3.5 h-3.5 mr-1.5" /> Mark outcome
                            </button>
                        )}
                        {opp && (
                            <Link
                                href={`/opportunities/${opp.id}`}
                                className="inline-flex items-center bg-white border border-stone-200 text-stone-700 font-bold px-3 py-2 rounded-full hover:bg-stone-50 transition-all text-xs"
                            >
                                <Target className="w-3.5 h-3.5 mr-1.5" /> View Opportunity
                                <ExternalLink className="w-3 h-3 ml-1.5 text-stone-400" />
                            </Link>
                        )}
                    </div>
                </div>

                {/* Meta row */}
                <div className="flex flex-wrap items-center gap-2 mt-3">
                    {opp?.naics_code && (
                        <span className="font-mono text-[11px] bg-stone-100 px-2 py-0.5 rounded text-stone-600 border border-stone-200">
                            NAICS {opp.naics_code}
                        </span>
                    )}
                    {opp?.award_amount && (
                        <span className="text-[11px] font-bold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded border border-emerald-200 flex items-center gap-1">
                            <DollarSign className="w-3 h-3" />
                            {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(opp.award_amount)}
                        </span>
                    )}
                    {deadline && daysLeft !== null && (
                        <span className={clsx(
                            "text-[11px] font-bold px-2 py-0.5 rounded border flex items-center gap-1",
                            daysLeft < 0 ? "bg-stone-50 text-stone-500 border-stone-200" :
                                daysLeft <= 3 ? "bg-red-50 text-red-700 border-red-200" :
                                    daysLeft <= 14 ? "bg-amber-50 text-amber-700 border-amber-200" :
                                        "bg-stone-50 text-stone-600 border-stone-200",
                        )}>
                            <Clock className="w-3 h-3" />
                            {daysLeft < 0 ? "Expired" : `${daysLeft}d left`}
                        </span>
                    )}
                    {deadline && (
                        <span className="text-[11px] text-stone-500 flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            Due {deadline.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </span>
                    )}
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Left column: stage, priority, notes, action items */}
                <div className="md:col-span-2 space-y-4">
                    {/* Stage + priority controls */}
                    <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-4 sm:p-5">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-[11px] font-bold uppercase tracking-widest text-stone-400 mb-2">Stage</label>
                                <div className="relative">
                                    <select
                                        value={pursuit.stage}
                                        onChange={e => updateStage(e.target.value)}
                                        disabled={savingStage}
                                        className="w-full appearance-none bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 text-sm font-bold cursor-pointer hover:bg-stone-100 transition-colors disabled:opacity-50"
                                        aria-label="Change stage"
                                    >
                                        {stages.map(s => (
                                            <option key={s.key} value={s.key}>{s.label}</option>
                                        ))}
                                    </select>
                                    {savingStage && (
                                        <Loader2 className="w-4 h-4 animate-spin text-stone-400 absolute right-3 top-1/2 -translate-y-1/2" />
                                    )}
                                </div>
                            </div>
                            <div>
                                <label className="block text-[11px] font-bold uppercase tracking-widest text-stone-400 mb-2">Priority</label>
                                <div className="flex items-center gap-2">
                                    {PRIORITIES.map(p => (
                                        <button
                                            type="button"
                                            key={p.key}
                                            onClick={() => updatePriority(p.key)}
                                            disabled={savingPriority}
                                            className={clsx(
                                                "flex-1 text-xs font-bold px-2 py-1.5 rounded-lg border transition-all",
                                                pursuit.priority === p.key
                                                    ? p.color
                                                    : "bg-white text-stone-500 border-stone-200 hover:bg-stone-50",
                                                savingPriority && "opacity-50 cursor-not-allowed",
                                            )}
                                        >
                                            <Flag className="w-3 h-3 inline -mt-0.5 mr-1" />
                                            {p.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Notes */}
                    <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-4 sm:p-5">
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-sm font-bold">Notes</h3>
                            {notesDirty && (
                                <button
                                    type="button"
                                    onClick={saveNotes}
                                    disabled={savingNotes}
                                    className="inline-flex items-center gap-1 bg-black text-white px-3 py-1.5 rounded-full text-xs font-bold hover:bg-stone-800 disabled:opacity-50"
                                >
                                    {savingNotes ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                                    Save
                                </button>
                            )}
                        </div>
                        <textarea
                            value={notesDraft}
                            onChange={e => setNotesDraft(e.target.value)}
                            rows={5}
                            placeholder="Capture strategy notes, incumbent intel, follow-ups..."
                            className="w-full px-3 py-2.5 border border-stone-200 rounded-xl text-sm focus:ring-2 focus:ring-black focus:border-transparent outline-none resize-y"
                        />
                    </div>

                    {/* Action items */}
                    <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-4 sm:p-5">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-bold">Action Items</h3>
                            <span className="text-[11px] text-stone-500">
                                {doneItems.length} / {actionItems.length} done
                            </span>
                        </div>
                        {actionItems.length === 0 ? (
                            <p className="text-xs text-stone-400 text-center py-4">No action items for this opportunity yet.</p>
                        ) : (
                            <ul className="space-y-1">
                                {[...openItems, ...doneItems].map(item => {
                                    const done = item.status === "completed";
                                    return (
                                        <li key={item.id}>
                                            <button
                                                type="button"
                                                onClick={() => toggleActionItem(item)}
                                                className={clsx(
                                                    "w-full flex items-start gap-2 text-left p-2 rounded-lg hover:bg-stone-50 transition-colors",
                                                    done && "opacity-60",
                                                )}
                                            >
                                                <span className="mt-0.5 flex-shrink-0">
                                                    {done ? (
                                                        <CheckCircle className="w-4 h-4 text-emerald-600" />
                                                    ) : (
                                                        <Circle className="w-4 h-4 text-stone-300" />
                                                    )}
                                                </span>
                                                <div className="flex-1 min-w-0">
                                                    <p className={clsx("text-sm", done && "line-through text-stone-500")}>{item.title}</p>
                                                    {item.description && !done && (
                                                        <p className="text-[11px] text-stone-500 mt-0.5 line-clamp-2">{item.description}</p>
                                                    )}
                                                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                                        <span className="text-[10px] font-bold uppercase tracking-wide text-stone-400">{item.category}</span>
                                                        {item.due_date && !done && (
                                                            <span className="text-[10px] text-stone-500">due {new Date(item.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                </div>

                {/* Right column: activity timeline */}
                <aside className="bg-white rounded-2xl border border-stone-200 shadow-sm p-4 sm:p-5 h-fit">
                    <div className="flex items-center gap-2 mb-4">
                        <History className="w-4 h-4 text-stone-500" />
                        <h3 className="text-sm font-bold">Activity</h3>
                    </div>
                    <ActivityTimeline activity={activity} resolveStageLabel={resolveStageLabel} />
                </aside>
            </div>

            {/* Mark-outcome modal (learning loop capture) */}
            {outcomeOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => !outcomeSaving && setOutcomeOpen(false)}>
                    <div
                        className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 border border-stone-200"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-base font-bold flex items-center gap-2">
                                <Trophy className="w-4 h-4 text-emerald-600" />
                                Log the outcome
                            </h3>
                            <button
                                type="button"
                                onClick={() => !outcomeSaving && setOutcomeOpen(false)}
                                className="p-1 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100"
                                aria-label="Close"
                            >
                                <XIcon className="w-4 h-4" />
                            </button>
                        </div>

                        <p className="text-xs text-stone-500 mb-4">
                            What happened with this pursuit? Your answer trains better matches.
                        </p>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-[11px] font-bold uppercase tracking-widest text-stone-400 mb-2">Result</label>
                                <div className="grid grid-cols-4 gap-1.5">
                                    {([
                                        { key: "won", label: "Won" },
                                        { key: "lost", label: "Lost" },
                                        { key: "no_bid", label: "No bid" },
                                        { key: "withdrawn", label: "Withdrew" },
                                    ] as const).map(opt => (
                                        <button
                                            type="button"
                                            key={opt.key}
                                            onClick={() => setOutcomeChoice(opt.key)}
                                            disabled={outcomeSaving}
                                            className={clsx(
                                                "text-xs font-bold px-2 py-2 rounded-lg border transition-all",
                                                outcomeChoice === opt.key
                                                    ? "bg-black text-white border-black"
                                                    : "bg-white text-stone-600 border-stone-200 hover:bg-stone-50",
                                            )}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {outcomeChoice === "won" && (
                                <div>
                                    <label className="block text-[11px] font-bold uppercase tracking-widest text-stone-400 mb-1.5">Award amount (USD)</label>
                                    <input
                                        type="number"
                                        inputMode="decimal"
                                        value={outcomeAmount}
                                        onChange={(e) => setOutcomeAmount(e.target.value)}
                                        disabled={outcomeSaving}
                                        placeholder="e.g. 250000"
                                        className="w-full px-3 py-2 border border-stone-200 rounded-xl text-sm focus:ring-2 focus:ring-black focus:border-transparent outline-none"
                                    />
                                </div>
                            )}

                            <div>
                                <label className="block text-[11px] font-bold uppercase tracking-widest text-stone-400 mb-1.5">Decision date</label>
                                <input
                                    type="date"
                                    value={outcomeDate}
                                    onChange={(e) => setOutcomeDate(e.target.value)}
                                    disabled={outcomeSaving}
                                    aria-label="Decision date"
                                    title="Decision date"
                                    className="w-full px-3 py-2 border border-stone-200 rounded-xl text-sm focus:ring-2 focus:ring-black focus:border-transparent outline-none"
                                />
                            </div>

                            <div>
                                <label className="block text-[11px] font-bold uppercase tracking-widest text-stone-400 mb-1.5">Lessons learned (optional)</label>
                                <textarea
                                    value={outcomeLessons}
                                    onChange={(e) => setOutcomeLessons(e.target.value)}
                                    disabled={outcomeSaving}
                                    rows={3}
                                    placeholder="What worked, what you'd change next time..."
                                    className="w-full px-3 py-2 border border-stone-200 rounded-xl text-sm focus:ring-2 focus:ring-black focus:border-transparent outline-none resize-y"
                                />
                            </div>

                            {outcomeError && (
                                <p className="text-xs text-red-600">{outcomeError}</p>
                            )}

                            <div className="flex items-center justify-end gap-2 pt-1">
                                <button
                                    type="button"
                                    onClick={() => setOutcomeOpen(false)}
                                    disabled={outcomeSaving}
                                    className="px-4 py-2 text-xs font-bold text-stone-600 hover:bg-stone-100 rounded-full disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={submitOutcome}
                                    disabled={outcomeSaving || outcomeSaved}
                                    className="inline-flex items-center gap-1 bg-emerald-600 text-white px-4 py-2 rounded-full text-xs font-bold hover:bg-emerald-700 disabled:opacity-50"
                                >
                                    {outcomeSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : outcomeSaved ? <CheckCircle className="w-3 h-3" /> : <Save className="w-3 h-3" />}
                                    {outcomeSaved ? "Saved" : "Save outcome"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
