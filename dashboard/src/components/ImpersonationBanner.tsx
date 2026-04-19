"use client";

import { useEffect, useState } from "react";
import { UserCheck, X, Loader2 } from "lucide-react";

interface ImpersonationState {
    impersonating: boolean;
    target?: {
        id: string;
        company_name: string | null;
        contact_name: string | null;
        account_type?: string | null;
    };
    issued_at?: number;
}

/**
 * Always-on banner. Polls /api/admin/impersonate on mount. When an admin
 * has an active impersonation cookie, shows a red top-stripe "Viewing as
 * {client} — Exit" so we can never forget we're acting on someone's behalf.
 */
export default function ImpersonationBanner() {
    const [state, setState] = useState<ImpersonationState | null>(null);
    const [exiting, setExiting] = useState(false);

    async function refresh() {
        try {
            const res = await fetch("/api/admin/impersonate", { cache: "no-store" });
            if (!res.ok) return;
            setState(await res.json());
        } catch {
            /* ignore — if unavailable we just don't show the banner */
        }
    }

    useEffect(() => {
        refresh();
    }, []);

    async function exit() {
        setExiting(true);
        try {
            await fetch("/api/admin/impersonate", { method: "DELETE" });
            window.location.href = "/admin/clients";
        } finally {
            setExiting(false);
        }
    }

    if (!state?.impersonating || !state.target) return null;

    const label = state.target.company_name || state.target.contact_name || "client";

    return (
        <div className="sticky top-0 z-40 bg-red-600 text-white">
            <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 text-sm">
                    <UserCheck className="w-4 h-4 flex-shrink-0" />
                    <span className="font-bold">Viewing as:</span>
                    <span>{label}</span>
                    <span className="opacity-70 text-xs hidden sm:inline">
                        · impersonation expires in 30 min
                    </span>
                </div>
                <button
                    type="button"
                    onClick={exit}
                    disabled={exiting}
                    className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/15 hover:bg-white/25 rounded-full text-xs font-bold transition-colors disabled:opacity-50"
                >
                    {exiting ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                    Exit impersonation
                </button>
            </div>
        </div>
    );
}
