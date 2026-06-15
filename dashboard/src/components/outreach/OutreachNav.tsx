"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Inbox, FileText, Users, ListChecks, Target, Workflow } from "lucide-react";
import clsx from "clsx";

/**
 * Shared tab strip for the /admin/outreach hub. The hub was shipped with only
 * the Inbox wired (M3.6); Templates / Contacts / Lists existed as pages or
 * components but were never linked, so they were unreachable in the UI.
 * This nav surfaces all of them consistently across the outreach pages.
 */
const TABS = [
    { key: "inbox", label: "Inbox", href: "/admin/outreach", icon: Inbox },
    { key: "segments", label: "Target Groups", href: "/admin/outreach/segments", icon: Target },
    { key: "sequences", label: "Sequences", href: "/admin/outreach/sequences", icon: Workflow },
    { key: "templates", label: "Templates", href: "/admin/outreach/templates", icon: FileText },
    { key: "contacts", label: "Contacts", href: "/admin/outreach/contacts", icon: Users },
    { key: "lists", label: "Lists", href: "/admin/outreach/lists", icon: ListChecks },
] as const;

export default function OutreachNav({ active }: { active?: string }) {
    const pathname = usePathname();
    return (
        <div className="border-b border-stone-200 flex items-center gap-1 px-3 overflow-x-auto">
            {TABS.map((t) => {
                const isActive = active ? active === t.key : pathname === t.href;
                const Icon = t.icon;
                return (
                    <Link
                        key={t.key}
                        href={t.href}
                        className={clsx(
                            "px-3 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors inline-flex items-center gap-1.5 whitespace-nowrap",
                            isActive
                                ? "border-stone-900 text-stone-900"
                                : "border-transparent text-stone-500 hover:text-stone-900"
                        )}
                    >
                        <Icon className="w-4 h-4" /> {t.label}
                    </Link>
                );
            })}
        </div>
    );
}
