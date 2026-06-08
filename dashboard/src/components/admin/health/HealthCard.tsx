"use client";

import clsx from "clsx";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

/**
 * HealthCard — the rounded-[28px] tile used as the primary visual element
 * across every /admin/health/* category page. Picks up emerald accent on
 * hover when wrapped in a link, matching the admin shell's accent color.
 *
 * Usage: pass `href` to render as a Link, or omit it for a static panel.
 * The card always renders a small label/value/footer trio plus an optional
 * lucide icon and right-side meta column.
 */
export function HealthCard({
    icon: Icon,
    label,
    title,
    value,
    valueTone = "default",
    footer,
    meta,
    href,
    className,
    children,
}: {
    icon?: React.ComponentType<{ className?: string }>;
    label?: string;
    title: string;
    value?: React.ReactNode;
    valueTone?: "default" | "ok" | "warn" | "error";
    footer?: React.ReactNode;
    meta?: React.ReactNode;
    href?: string;
    className?: string;
    children?: React.ReactNode;
}) {
    const valueColor =
        valueTone === "ok" ? "text-emerald-700"
        : valueTone === "warn" ? "text-amber-700"
        : valueTone === "error" ? "text-rose-700"
        : "text-stone-900";

    const body = (
        <div
            className={clsx(
                "bg-white border border-stone-200 rounded-[28px] p-5 transition-all",
                href && "hover:border-emerald-300 hover:shadow-sm cursor-pointer group",
                className,
            )}
        >
            <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0">
                    {label && (
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-stone-400 mb-1">
                            {label}
                        </p>
                    )}
                    <div className="flex items-center gap-2 flex-wrap">
                        {Icon && <Icon className="w-4 h-4 text-stone-500 flex-shrink-0" />}
                        <h3 className="text-sm font-bold text-stone-900 truncate">{title}</h3>
                    </div>
                    {value !== undefined && value !== null && (
                        <p className={clsx("text-2xl font-black mt-2 tabular-nums", valueColor)}>
                            {value}
                        </p>
                    )}
                    {footer && <div className="mt-2 text-xs text-stone-500">{footer}</div>}
                    {children}
                </div>
                {meta && <div className="flex-shrink-0 text-right">{meta}</div>}
                {href && (
                    <ChevronRight className="w-4 h-4 text-stone-300 group-hover:text-emerald-500 transition-colors flex-shrink-0 mt-1" />
                )}
            </div>
        </div>
    );

    if (href) return <Link href={href} className="block">{body}</Link>;
    return body;
}
