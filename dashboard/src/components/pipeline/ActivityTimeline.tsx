"use client";

import { ArrowRight, CheckCircle, Flag, PlusCircle, StickyNote } from "lucide-react";
import clsx from "clsx";

export interface ActivityRow {
    id: string;
    activity_type: string;
    from_value: string | null;
    to_value: string | null;
    description: string | null;
    created_at: string;
}

interface ActivityTimelineProps {
    activity: ActivityRow[];
    resolveStageLabel?: (key: string | null) => string;
}

function formatDate(ts: string): string {
    const d = new Date(ts);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function activityIcon(type: string) {
    switch (type) {
        case "stage_changed": return <ArrowRight className="w-3.5 h-3.5 text-blue-600" />;
        case "note_added":
        case "note_updated": return <StickyNote className="w-3.5 h-3.5 text-amber-600" />;
        case "action_completed": return <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />;
        case "priority_changed": return <Flag className="w-3.5 h-3.5 text-purple-600" />;
        case "created": return <PlusCircle className="w-3.5 h-3.5 text-stone-600" />;
        default: return <ArrowRight className="w-3.5 h-3.5 text-stone-500" />;
    }
}

function activityDotColor(type: string): string {
    switch (type) {
        case "stage_changed": return "bg-blue-500";
        case "note_added":
        case "note_updated": return "bg-amber-500";
        case "action_completed": return "bg-emerald-500";
        case "priority_changed": return "bg-purple-500";
        case "created": return "bg-stone-500";
        default: return "bg-stone-400";
    }
}

function describe(activity: ActivityRow, resolveStageLabel?: (key: string | null) => string): string {
    if (activity.description) return activity.description;
    switch (activity.activity_type) {
        case "stage_changed": {
            const from = resolveStageLabel ? resolveStageLabel(activity.from_value) : (activity.from_value || "unknown");
            const to = resolveStageLabel ? resolveStageLabel(activity.to_value) : (activity.to_value || "unknown");
            return `Stage moved from ${from} to ${to}`;
        }
        case "note_added": return "Note added";
        case "note_updated": return "Note updated";
        case "action_completed": return `Action item completed${activity.to_value ? `: ${activity.to_value}` : ""}`;
        case "priority_changed": return `Priority changed from ${activity.from_value || "?"} to ${activity.to_value || "?"}`;
        case "created": return "Pursuit created";
        default: return activity.activity_type;
    }
}

export default function ActivityTimeline({ activity, resolveStageLabel }: ActivityTimelineProps) {
    if (activity.length === 0) {
        return (
            <div className="text-center py-6">
                <p className="text-xs text-stone-400">No activity yet. Changes will appear here.</p>
            </div>
        );
    }

    return (
        <ol className="relative border-l border-stone-200 ml-2 space-y-4">
            {activity.map(item => (
                <li key={item.id} className="ml-4">
                    <span className={clsx(
                        "absolute -left-[5px] mt-1.5 w-2.5 h-2.5 rounded-full ring-2 ring-white",
                        activityDotColor(item.activity_type),
                    )} />
                    <div className="flex items-start gap-2">
                        <div className="mt-0.5">{activityIcon(item.activity_type)}</div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm text-stone-800">{describe(item, resolveStageLabel)}</p>
                            <p className="text-[11px] text-stone-400 mt-0.5">{formatDate(item.created_at)}</p>
                        </div>
                    </div>
                </li>
            ))}
        </ol>
    );
}
