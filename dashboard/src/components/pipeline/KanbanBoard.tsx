"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Clock, DollarSign, Eye } from "lucide-react";
import clsx from "clsx";
import {
    DndContext,
    DragEndEvent,
    DragOverlay,
    DragStartEvent,
    PointerSensor,
    useSensor,
    useSensors,
    useDraggable,
    useDroppable,
} from "@dnd-kit/core";

interface Opportunity {
    id: string;
    title: string;
    agency: string;
    response_deadline: string | null;
    notice_type: string | null;
    naics_code: string | null;
    award_amount: number | null;
}

interface Pursuit {
    id: string;
    opportunity_id: string;
    stage: string;
    opportunities: Opportunity;
}

interface Stage {
    key: string;
    label: string;
    color: string;
    dot: string;
}

interface Props {
    pursuits: Pursuit[];
    stages: Stage[];
    onMove: (pursuitId: string, newStage: string) => Promise<void> | void;
}

function formatDeadline(deadline: string | null): { label: string; color: string } | null {
    if (!deadline) return null;
    const daysLeft = Math.ceil((new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (daysLeft < 0) return { label: "Expired", color: "text-stone-400" };
    if (daysLeft <= 3) return { label: `${daysLeft}d left`, color: "text-red-600 font-bold" };
    if (daysLeft <= 7) return { label: `${daysLeft}d left`, color: "text-amber-600 font-bold" };
    return { label: `${daysLeft}d left`, color: "text-stone-500" };
}

function PursuitCard({ pursuit, isOverlay = false }: { pursuit: Pursuit; isOverlay?: boolean }) {
    const router = useRouter();
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: pursuit.id,
        data: { stage: pursuit.stage },
    });
    const opp = pursuit.opportunities;
    const deadline = formatDeadline(opp?.response_deadline || null);

    return (
        <div
            ref={isOverlay ? undefined : setNodeRef}
            {...(isOverlay ? {} : attributes)}
            {...(isOverlay ? {} : listeners)}
            onDoubleClick={isOverlay ? undefined : (e) => {
                e.stopPropagation();
                router.push(`/pipeline/${pursuit.id}`);
            }}
            title={isOverlay ? undefined : "Double-click to open deal detail"}
            className={clsx(
                "bg-white border border-stone-200 rounded-xl p-3 shadow-sm cursor-grab active:cursor-grabbing group",
                isDragging && !isOverlay && "opacity-40",
                isOverlay && "shadow-xl rotate-2 cursor-grabbing",
            )}
        >
            <p className="font-bold text-sm text-black line-clamp-2 mb-1">{opp?.title || "Untitled"}</p>
            <p className="text-[11px] text-stone-500 line-clamp-1 mb-2">{opp?.agency}</p>
            <div className="flex items-center gap-1.5 flex-wrap mb-2">
                {opp?.naics_code && (
                    <span className="font-mono text-[9px] bg-stone-100 px-1.5 py-0.5 rounded text-stone-600 border border-stone-200">
                        {opp.naics_code}
                    </span>
                )}
                {opp?.award_amount ? (
                    <span className="text-[9px] font-bold bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded border border-emerald-200 inline-flex items-center">
                        <DollarSign className="w-2.5 h-2.5 mr-0.5" />
                        {new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(opp.award_amount)}
                    </span>
                ) : null}
            </div>
            <div className="flex items-center justify-between">
                {deadline ? (
                    <span className={clsx("text-[10px] flex items-center gap-1", deadline.color)}>
                        <Clock className="w-3 h-3" />
                        {deadline.label}
                    </span>
                ) : <span />}
                {opp?.id && (
                    <Link
                        href={`/opportunities/${opp.id}`}
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                        className="p-1 text-stone-400 hover:text-black transition-colors opacity-0 group-hover:opacity-100"
                        title="View"
                    >
                        <Eye className="w-3.5 h-3.5" />
                    </Link>
                )}
            </div>
        </div>
    );
}

function formatVolume(n: number): string {
    if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
    return `$${Math.round(n)}`;
}

function Column({ stage, items }: { stage: Stage; items: Pursuit[] }) {
    const { setNodeRef, isOver } = useDroppable({ id: stage.key });
    // Sum award_amount across all pursuits in this stage. Opps without a number
    // contribute $0 so the total is never falsely inflated.
    const volume = items.reduce((sum, p) => sum + (p.opportunities?.award_amount || 0), 0);

    return (
        <div
            ref={setNodeRef}
            className={clsx(
                "flex-shrink-0 w-72 bg-stone-50 rounded-2xl border transition-colors flex flex-col",
                isOver ? "border-black bg-stone-100" : "border-stone-200",
            )}
        >
            <div className="px-4 py-3 border-b border-stone-200">
                <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                        <span className={clsx("w-2 h-2 rounded-full", stage.dot)} />
                        <span className={clsx("text-xs font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border", stage.color)}>
                            {stage.label}
                        </span>
                    </div>
                    <span className="text-xs font-bold text-stone-500">{items.length}</span>
                </div>
                {volume > 0 && (
                    <div className="text-[11px] font-semibold text-emerald-700 tracking-tight">
                        {formatVolume(volume)} <span className="font-normal text-stone-400">total</span>
                    </div>
                )}
            </div>
            <div className="p-2 space-y-2 flex-1 min-h-[120px]">
                {items.length === 0 ? (
                    <p className="text-[11px] text-stone-400 text-center py-6">Drop cards here</p>
                ) : (
                    items.map((p) => <PursuitCard key={p.id} pursuit={p} />)
                )}
            </div>
        </div>
    );
}

export default function KanbanBoard({ pursuits, stages, onMove }: Props) {
    const [activePursuit, setActivePursuit] = useState<Pursuit | null>(null);
    // Require a small pointer movement before starting drag so clicks on links still work.
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

    const grouped = stages.reduce((acc, s) => {
        acc[s.key] = pursuits.filter((p) => p.stage === s.key);
        return acc;
    }, {} as Record<string, Pursuit[]>);

    const handleDragStart = (e: DragStartEvent) => {
        const p = pursuits.find((x) => x.id === e.active.id);
        if (p) setActivePursuit(p);
    };

    const handleDragEnd = async (e: DragEndEvent) => {
        setActivePursuit(null);
        const { active, over } = e;
        if (!over) return;
        const fromStage = (active.data.current as { stage?: string } | null)?.stage;
        const toStage = String(over.id);
        if (!fromStage || fromStage === toStage) return;
        await onMove(String(active.id), toStage);
    };

    return (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <div className="flex gap-3 overflow-x-auto pb-4 -mx-1 px-1">
                {stages.map((s) => (
                    <Column key={s.key} stage={s} items={grouped[s.key] || []} />
                ))}
            </div>
            <DragOverlay>
                {activePursuit ? <PursuitCard pursuit={activePursuit} isOverlay /> : null}
            </DragOverlay>
        </DndContext>
    );
}
