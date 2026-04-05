"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, X, AlertCircle, Info } from "lucide-react";
import clsx from "clsx";

interface ToastProps {
    message: string;
    type?: "success" | "error" | "info";
    duration?: number;
    onClose?: () => void;
}

export function Toast({ message, type = "success", duration = 4000, onClose }: ToastProps) {
    const [visible, setVisible] = useState(true);

    useEffect(() => {
        const timer = setTimeout(() => {
            setVisible(false);
            onClose?.();
        }, duration);
        return () => clearTimeout(timer);
    }, [duration, onClose]);

    if (!visible) return null;

    const Icon = type === "success" ? CheckCircle2 : type === "error" ? AlertCircle : Info;

    return (
        <div className={clsx(
            "fixed bottom-6 right-6 z-50 max-w-sm animate-in slide-in-from-bottom-4 duration-300",
            "flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border",
            type === "success" ? "bg-emerald-50 text-emerald-800 border-emerald-200" :
            type === "error" ? "bg-red-50 text-red-800 border-red-200" :
            "bg-blue-50 text-blue-800 border-blue-200"
        )}>
            <Icon className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm font-medium flex-1">{message}</p>
            <button type="button" onClick={() => { setVisible(false); onClose?.(); }}
                className="text-stone-400 hover:text-stone-600 flex-shrink-0">
                <X className="w-4 h-4" />
            </button>
        </div>
    );
}

// Global toast hook
let toastCallback: ((msg: string, type?: "success" | "error" | "info") => void) | null = null;

export function useToast() {
    return {
        toast: (msg: string, type?: "success" | "error" | "info") => {
            toastCallback?.(msg, type);
        },
    };
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<Array<{ id: number; message: string; type: "success" | "error" | "info" }>>([]);

    useEffect(() => {
        toastCallback = (msg, type = "success") => {
            const id = Date.now();
            setToasts(prev => [...prev, { id, message: msg, type }]);
        };
        return () => { toastCallback = null; };
    }, []);

    return (
        <>
            {children}
            <div className="fixed bottom-6 right-6 z-50 space-y-2">
                {toasts.map(t => (
                    <Toast key={t.id} message={t.message} type={t.type}
                        onClose={() => setToasts(prev => prev.filter(x => x.id !== t.id))} />
                ))}
            </div>
        </>
    );
}
