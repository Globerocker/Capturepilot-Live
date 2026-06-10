"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Target, Layers, FileText } from "lucide-react";
import clsx from "clsx";

const ITEMS = [
    { name: "Home", href: "/dashboard", icon: LayoutDashboard },
    { name: "Matches", href: "/matches", icon: Target },
    { name: "Pipeline", href: "/pipeline", icon: Layers },
    { name: "Draft", href: "/ai-drafter/proposals", icon: FileText },
];

/**
 * Persistent bottom nav for mobile (< lg).
 * Shows the four highest-frequency screens — anything else
 * is accessible via the hamburger menu at the top of the page.
 */
export default function MobileBottomNav() {
    const pathname = usePathname();

    return (
        <nav
            className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-stone-950/95 backdrop-blur-md border-t border-stone-800 flex items-stretch justify-around pb-[env(safe-area-inset-bottom,0px)]"
            aria-label="Primary"
        >
            {ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                    <Link
                        key={item.href}
                        href={item.href}
                        className={clsx(
                            "flex-1 flex flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
                            isActive ? "text-emerald-400" : "text-stone-400 hover:text-stone-200"
                        )}
                    >
                        <Icon className={clsx("h-5 w-5", isActive ? "text-emerald-400" : "text-stone-400")} />
                        <span>{item.name}</span>
                    </Link>
                );
            })}
        </nav>
    );
}
