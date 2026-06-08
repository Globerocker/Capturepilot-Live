"use client";

import clsx from "clsx";
import { CheckCircle2, AlertTriangle, HelpCircle, Lock, Globe } from "lucide-react";

/**
 * StatusBadge — tiny pill used across every /admin/health/* page to express
 * an "ok / warn / error / unknown" state in a single glance, plus a couple of
 * domain-specific variants ("public" / "private" for storage buckets).
 *
 * Kept here in components/admin/health/ so other category pages (db, queue,
 * crons, etc.) can reuse the same vocabulary without forking the styling.
 */
export type StatusTone =
    | "ok"
    | "warn"
    | "error"
    | "unknown"
    | "public"
    | "private";

const TONE: Record<StatusTone, { bg: string; text: string; Icon: React.ComponentType<{ className?: string }> }> = {
    ok:      { bg: "bg-emerald-100", text: "text-emerald-700", Icon: CheckCircle2 },
    warn:    { bg: "bg-amber-100",   text: "text-amber-700",   Icon: AlertTriangle },
    error:   { bg: "bg-rose-100",    text: "text-rose-700",    Icon: AlertTriangle },
    unknown: { bg: "bg-stone-100",   text: "text-stone-500",   Icon: HelpCircle },
    public:  { bg: "bg-blue-100",    text: "text-blue-700",    Icon: Globe },
    private: { bg: "bg-stone-100",   text: "text-stone-600",   Icon: Lock },
};

export function StatusBadge({
    tone,
    label,
    className,
}: {
    tone: StatusTone;
    label: string;
    className?: string;
}) {
    const cfg = TONE[tone];
    return (
        <span
            className={clsx(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide",
                cfg.bg,
                cfg.text,
                className,
            )}
        >
            <cfg.Icon className="w-3 h-3" />
            {label}
        </span>
    );
}
