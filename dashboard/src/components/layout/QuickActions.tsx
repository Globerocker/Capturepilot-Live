"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Zap, FileText, Sparkles, Mic, Check, AlertCircle, Loader2 } from "lucide-react";
import clsx from "clsx";

type RefreshState = "idle" | "loading" | "success" | "error";

interface QuickActionsProps {
    onNavigate?: () => void;
}

export default function QuickActions({ onNavigate }: QuickActionsProps) {
    const pathname = usePathname();
    const [refreshState, setRefreshState] = useState<RefreshState>("idle");

    const handleRefresh = async () => {
        if (refreshState === "loading") return;
        setRefreshState("loading");
        try {
            const res = await fetch("/api/matches/refresh", { method: "POST" });
            if (!res.ok) throw new Error("Refresh failed");
            setRefreshState("success");
            setTimeout(() => setRefreshState("idle"), 2000);
        } catch {
            setRefreshState("error");
            setTimeout(() => setRefreshState("idle"), 2500);
        }
    };

    const linkTiles = [
        { name: "Quick Checker", href: "/check", icon: Zap },
        { name: "AI Drafter", href: "/proposals", icon: FileText },
        { name: "Cap Statement", href: "/capability-statement", icon: Mic },
    ];

    const tileClasses = (isActive: boolean) =>
        clsx(
            "flex flex-col items-center justify-center gap-1.5 py-3 px-2 rounded-2xl transition-all duration-200 border",
            isActive
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/40"
                : "text-stone-500 hover:bg-stone-800/50 hover:text-stone-300 border-stone-800/60"
        );

    const refreshIcon = () => {
        if (refreshState === "loading") return <Loader2 className="h-4 w-4 animate-spin" />;
        if (refreshState === "success") return <Check className="h-4 w-4 text-emerald-400" />;
        if (refreshState === "error") return <AlertCircle className="h-4 w-4 text-red-400" />;
        return <Sparkles className="h-4 w-4" />;
    };

    const refreshLabel = () => {
        if (refreshState === "loading") return "Refreshing…";
        if (refreshState === "success") return "Refreshed";
        if (refreshState === "error") return "Failed";
        return "Refresh";
    };

    return (
        <div className="px-3 lg:px-4 pt-3 pb-3 border-t border-stone-800/60">
            <div className="px-2 mb-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-600">
                    Quick Actions
                </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
                {linkTiles.map((tile) => {
                    const Icon = tile.icon;
                    const isActive = pathname.startsWith(tile.href);
                    return (
                        <Link
                            key={tile.name}
                            href={tile.href}
                            onClick={onNavigate}
                            className={tileClasses(isActive)}
                        >
                            <Icon className={clsx("h-4 w-4", isActive ? "text-emerald-400" : "text-stone-500")} />
                            <span className="text-[11px] font-medium leading-tight text-center">{tile.name}</span>
                        </Link>
                    );
                })}
                <button
                    type="button"
                    onClick={handleRefresh}
                    disabled={refreshState === "loading"}
                    title="Refresh Matches"
                    className={clsx(
                        "flex flex-col items-center justify-center gap-1.5 py-3 px-2 rounded-2xl transition-all duration-200 border disabled:cursor-wait",
                        refreshState === "success"
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/40"
                            : refreshState === "error"
                            ? "bg-red-500/10 text-red-400 border-red-500/40"
                            : "text-stone-500 hover:bg-stone-800/50 hover:text-stone-300 border-stone-800/60"
                    )}
                >
                    {refreshIcon()}
                    <span className="text-[11px] font-medium leading-tight text-center">
                        {refreshState === "idle" ? "Refresh Matches" : refreshLabel()}
                    </span>
                </button>
            </div>
        </div>
    );
}
