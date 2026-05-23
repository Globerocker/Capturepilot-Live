"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { UserCheck, X, Loader2, ShieldCheck, ArrowLeft } from "lucide-react";

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
 * Always-on banner for admin sessions on customer-facing pages.
 *
 * Two modes:
 *   1. Impersonation (RED) — `cp_admin_impersonate` cookie is set. Shows
 *      who's being impersonated + a 30-min countdown reminder. "Exit"
 *      DELETEs the cookie + returns to /admin/clients/[id].
 *   2. Self-view (EMERALD) — admin clicked "View as customer" from the
 *      admin shell. No impersonation cookie. Discreet emerald strip
 *      with a 1-click link back to /admin/overview.
 *
 * Non-admin sessions: this component renders nothing.
 *
 * Two parallel fetches kick off on mount — neither blocks render, both
 * fail silently. The banner only appears once we've confirmed admin status.
 */
export default function ImpersonationBanner() {
    const [state, setState] = useState<ImpersonationState | null>(null);
    const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
    const [exiting, setExiting] = useState(false);

    useEffect(() => {
        const ctrl = new AbortController();
        (async () => {
            try {
                const [imp, admin] = await Promise.all([
                    fetch("/api/admin/impersonate", { cache: "no-store", signal: ctrl.signal })
                        .then(r => r.ok ? r.json() as Promise<ImpersonationState> : null)
                        .catch(() => null),
                    fetch("/api/account/admin-check", { cache: "no-store", signal: ctrl.signal })
                        .then(r => r.ok ? r.json() as Promise<{ isAdmin: boolean }> : null)
                        .catch(() => null),
                ]);
                if (imp) setState(imp);
                setIsAdmin(admin?.isAdmin ?? false);
            } catch {
                /* aborted on unmount — ignore */
            }
        })();
        return () => ctrl.abort();
    }, []);

    async function exit() {
        if (!state?.target) return;
        setExiting(true);
        try {
            await fetch("/api/admin/impersonate", { method: "DELETE" });
            window.location.href = `/admin/clients/${state.target.id}`;
        } finally {
            setExiting(false);
        }
    }

    // Impersonation banner wins over self-view.
    if (state?.impersonating && state.target) {
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

    // Self-view banner — only when we've positively confirmed admin status.
    if (isAdmin === true) {
        return (
            <div className="sticky top-0 z-30 bg-emerald-50 border-b border-emerald-100 text-emerald-900 text-xs">
                <div className="max-w-7xl mx-auto px-4 py-1.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                        <span className="font-bold">Admin</span>
                        <span className="opacity-70 hidden sm:inline">· you&apos;re browsing the customer view</span>
                    </div>
                    <Link
                        href="/admin/overview"
                        className="inline-flex items-center gap-1.5 font-bold text-emerald-700 hover:text-emerald-900 whitespace-nowrap"
                    >
                        <ArrowLeft className="w-3 h-3" /> Back to admin
                    </Link>
                </div>
            </div>
        );
    }

    return null;
}
