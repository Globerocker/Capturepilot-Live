"use client";

import clsx from "clsx";
import { Loader2 } from "lucide-react";

/**
 * ActionButton — the standard refresh / "List recent objects" / "Run probe"
 * button used across the /admin/health/* category pages. Encodes the
 * loading-spinner pattern so callers don't have to redo the conditional in
 * every page. Three tones: default (white pill), primary (emerald), and
 * danger (rose) — kept narrow on purpose; destructive actions go through a
 * confirm dialog elsewhere.
 */
export function ActionButton({
    children,
    onClick,
    loading,
    disabled,
    icon: Icon,
    tone = "default",
    type = "button",
    size = "sm",
    className,
}: {
    children: React.ReactNode;
    onClick?: () => void;
    loading?: boolean;
    disabled?: boolean;
    icon?: React.ComponentType<{ className?: string }>;
    tone?: "default" | "primary" | "danger";
    type?: "button" | "submit";
    size?: "xs" | "sm";
    className?: string;
}) {
    const toneClasses =
        tone === "primary"
            ? "bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700"
            : tone === "danger"
            ? "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100"
            : "bg-white text-stone-700 border-stone-200 hover:bg-stone-50";

    const sizeClasses =
        size === "xs"
            ? "px-2.5 py-1 text-[11px]"
            : "px-3 py-1.5 text-xs";

    return (
        <button
            type={type}
            onClick={onClick}
            disabled={disabled || loading}
            className={clsx(
                "inline-flex items-center gap-1.5 rounded-xl border font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                toneClasses,
                sizeClasses,
                className,
            )}
        >
            {loading
                ? <Loader2 className={clsx(size === "xs" ? "w-3 h-3" : "w-3.5 h-3.5", "animate-spin")} />
                : Icon && <Icon className={clsx(size === "xs" ? "w-3 h-3" : "w-3.5 h-3.5")} />}
            {children}
        </button>
    );
}
