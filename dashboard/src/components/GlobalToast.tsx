"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, X, AlertCircle, Info } from "lucide-react";
import clsx from "clsx";

interface ToastItem {
    id: number;
    message: string;
    type: "success" | "error" | "info";
}

/**
 * GlobalToast — self-contained toast notification system.
 *
 * Usage from any client component:
 *   window.dispatchEvent(new CustomEvent("toast", { detail: { message: "Saved!", type: "success" } }));
 *
 * Or use the helper:
 *   import { showToast } from "@/components/GlobalToast";
 *   showToast("Saved!", "success");
 */
export function showToast(message: string, type: "success" | "error" | "info" = "success") {
    if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("toast", { detail: { message, type } }));
    }
}

export default function GlobalToast() {
    const [toasts, setToasts] = useState<ToastItem[]>([]);

    useEffect(() => {
        const handler = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            const id = Date.now();
            setToasts(prev => [...prev, { id, message: detail.message, type: detail.type || "success" }]);
            setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
        };

        window.addEventListener("toast", handler);
        return () => window.removeEventListener("toast", handler);
    }, []);

    if (toasts.length === 0) return null;

    return (
        <div className="fixed bottom-6 right-6 z-50 space-y-2">
            {toasts.map(t => {
                const Icon = t.type === "success" ? CheckCircle2 : t.type === "error" ? AlertCircle : Info;
                return (
                    <div key={t.id} className={clsx(
                        "flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border min-w-[280px] animate-in slide-in-from-bottom-4 duration-300",
                        t.type === "success" ? "bg-emerald-50 text-emerald-800 border-emerald-200" :
                        t.type === "error" ? "bg-red-50 text-red-800 border-red-200" :
                        "bg-blue-50 text-blue-800 border-blue-200"
                    )}>
                        <Icon className="w-5 h-5 flex-shrink-0" />
                        <p className="text-sm font-medium flex-1">{t.message}</p>
                        <button type="button" onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
                            className="text-stone-400 hover:text-stone-600 flex-shrink-0">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                );
            })}
        </div>
    );
}
