"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Target, Layers, Settings } from "lucide-react";
import clsx from "clsx";

/**
 * Sticky bottom navigation for mobile only.
 *
 * Renders below the main scroll area on screens narrower than `lg` (1024px).
 * Hidden on desktop where the full sidebar already covers navigation.
 *
 * The parent layout adds bottom padding on small screens so the nav doesn't
 * overlap page content.
 */
export default function MobileBottomNav() {
  const pathname = usePathname();

  const tabs = [
    { name: "Home", href: "/dashboard", icon: LayoutDashboard, match: (p: string) => p === "/dashboard" || p.startsWith("/dashboard/") },
    { name: "Matches", href: "/matches", icon: Target, match: (p: string) => p.startsWith("/matches") || p.startsWith("/opportunities") },
    { name: "Pipeline", href: "/pipeline", icon: Layers, match: (p: string) => p.startsWith("/pipeline") },
    { name: "Settings", href: "/settings", icon: Settings, match: (p: string) => p.startsWith("/settings") },
  ];

  return (
    <nav
      aria-label="Primary mobile navigation"
      className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-stone-200 shadow-[0_-2px_10px_rgba(0,0,0,0.04)] pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="grid grid-cols-4">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const active = tab.match(pathname || "");
          return (
            <li key={tab.name}>
              <Link
                href={tab.href}
                className={clsx(
                  "flex flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] font-bold uppercase tracking-wider transition-colors",
                  active ? "text-black" : "text-stone-400 hover:text-stone-700"
                )}
              >
                <Icon className={clsx("w-5 h-5", active ? "text-black" : "text-stone-400")} />
                <span>{tab.name}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
