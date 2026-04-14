"use client";

import { LayoutGrid, List, Table2 } from "lucide-react";
import clsx from "clsx";

export type ViewMode = "card" | "list" | "table";

export function ViewToggle({ value, onChange }: { value: ViewMode; onChange: (v: ViewMode) => void }) {
    const options: { key: ViewMode; label: string; Icon: typeof LayoutGrid }[] = [
        { key: "card", label: "Cards", Icon: LayoutGrid },
        { key: "list", label: "List", Icon: List },
        { key: "table", label: "Table", Icon: Table2 },
    ];
    return (
        <div className="inline-flex bg-white border border-stone-200 rounded-full p-1 shadow-sm">
            {options.map(opt => (
                <button
                    key={opt.key}
                    type="button"
                    title={`${opt.label} view`}
                    onClick={() => onChange(opt.key)}
                    className={clsx(
                        "text-[11px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full transition-all flex items-center gap-1.5",
                        value === opt.key
                            ? "bg-black text-white"
                            : "text-stone-500 hover:text-black"
                    )}
                >
                    <opt.Icon className="w-3 h-3" />
                    <span className="hidden sm:inline">{opt.label}</span>
                </button>
            ))}
        </div>
    );
}
