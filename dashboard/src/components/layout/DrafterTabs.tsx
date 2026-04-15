"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import clsx from "clsx";
import { Pencil, FileText, Mic, Mail } from "lucide-react";

export default function DrafterTabs() {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    
    // We treat /ai-drafter (which has email/template tabs inside) as "Emails & Templates"
    const isAiDrafterRoot = pathname === "/ai-drafter";
    
    const tabs = [
        { name: "Proposals", href: "/ai-drafter/proposals", icon: FileText, isActive: pathname === "/ai-drafter/proposals" },
        { name: "Capability Statement", href: "/ai-drafter/capability-statement", icon: Mic, isActive: pathname === "/ai-drafter/capability-statement" },
        { name: "Emails & Templates", href: "/ai-drafter", icon: Mail, isActive: isAiDrafterRoot },
    ];

    return (
        <div className="mb-6">
            <header className="mb-6">
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tighter text-black flex items-center">
                    <Pencil className="mr-2 sm:mr-3 w-6 h-6 sm:w-8 sm:h-8" /> AI Drafter Studio
                </h2>
                <p className="text-stone-500 font-medium text-sm mt-1">
                    Draft proposals, capability statements, and targeted outreach completely powered by your company profile.
                </p>
            </header>
            
            <nav className="flex flex-wrap items-center gap-2 border-b border-stone-200">
                {tabs.map((t) => {
                    const Icon = t.icon;
                    return (
                        <Link
                            key={t.name}
                            href={t.href}
                            className={clsx(
                                "flex items-center gap-2 px-4 py-2.5 text-sm font-bold border-b-2 transition-colors -mb-px hover:bg-stone-50 rounded-t-lg",
                                t.isActive ? "border-black text-black" : "border-transparent text-stone-400 hover:text-stone-700 hover:border-stone-200"
                            )}
                        >
                            <Icon className={clsx("w-4 h-4", t.isActive ? "text-emerald-500" : "text-stone-400")} /> 
                            {t.name}
                        </Link>
                    )
                })}
            </nav>
        </div>
    );
}
