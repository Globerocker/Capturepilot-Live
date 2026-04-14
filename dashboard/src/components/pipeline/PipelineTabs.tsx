"use client";

import clsx from "clsx";
import { NOTICE_TYPE_TABS } from "@/lib/pipeline-stages";

interface PipelineTabsProps {
    counts: Record<string, number>;
    active: string;
    onChange: (key: string) => void;
}

export default function PipelineTabs({ counts, active, onChange }: PipelineTabsProps) {
    return (
        <div className="flex flex-wrap items-center gap-2 mb-3 border-b border-stone-100 pb-3">
            {NOTICE_TYPE_TABS.map(tab => {
                const count = counts[tab.key] ?? 0;
                const isActive = active === tab.key;
                return (
                    <button
                        type="button"
                        key={tab.key}
                        onClick={() => onChange(tab.key)}
                        className={clsx(
                            "text-xs font-bold px-3 py-1.5 rounded-full border transition-all flex items-center gap-1.5",
                            isActive
                                ? "bg-black text-white border-black"
                                : "bg-white text-stone-500 border-stone-200 hover:bg-stone-100",
                        )}
                    >
                        {tab.label}
                        <span
                            className={clsx(
                                "text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                                isActive ? "bg-white/20 text-white" : "bg-stone-100 text-stone-500",
                            )}
                        >
                            {count}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
