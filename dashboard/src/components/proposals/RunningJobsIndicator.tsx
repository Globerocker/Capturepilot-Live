"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Loader2, FileText } from "lucide-react";
import { createSupabaseClient } from "@/lib/supabase/client";

const supabase = createSupabaseClient();
const POLL_MS = 5000;
const STORAGE_KEY = "activeProposalJobId";

/**
 * Small floating pill that shows "N proposals generating" when the user
 * has background proposal jobs running. Persists across page navigation
 * (mounted in the dashboard layout). Clicking navigates to /proposals.
 *
 * Detection sources:
 *   1) localStorage 'activeProposalJobId' — set by the proposals page when
 *      the user starts a job, so the badge appears instantly.
 *   2) Supabase query against proposal_jobs with status in (pending, writing)
 *      for the current user — so jobs kicked off in another tab/device
 *      still surface.
 */
export default function RunningJobsIndicator() {
    const [runningCount, setRunningCount] = useState(0);
    const [enabled, setEnabled] = useState(false);

    const refresh = useCallback(async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                setRunningCount(0);
                return;
            }
            const { data: profile } = await supabase
                .from("user_profiles")
                .select("id")
                .eq("auth_user_id", user.id)
                .single();
            if (!profile) {
                setRunningCount(0);
                return;
            }
            const { count } = await supabase
                .from("proposal_jobs")
                .select("id", { count: "exact", head: true })
                .eq("user_profile_id", (profile as { id: string }).id)
                .in("status", ["pending", "writing"]);
            setRunningCount(count || 0);
        } catch {
            // swallow — indicator is best-effort
        }
    }, []);

    useEffect(() => {
        // Only activate polling if there's a hint of a running job, to avoid
        // hitting the DB every 5s for every user.
        const hasLocalHint = typeof window !== "undefined" && !!localStorage.getItem(STORAGE_KEY);
        setEnabled(hasLocalHint);
        refresh();

        const interval = setInterval(refresh, POLL_MS);

        const onStorage = (e: StorageEvent) => {
            if (e.key === STORAGE_KEY) {
                setEnabled(!!e.newValue);
                refresh();
            }
        };
        // Custom event fired by the proposals page when jobs start/finish
        const onCustom = () => {
            const hint = !!localStorage.getItem(STORAGE_KEY);
            setEnabled(hint);
            refresh();
        };

        window.addEventListener("storage", onStorage);
        window.addEventListener("proposal-jobs-changed", onCustom);

        return () => {
            clearInterval(interval);
            window.removeEventListener("storage", onStorage);
            window.removeEventListener("proposal-jobs-changed", onCustom);
        };
    }, [refresh]);

    // Auto-clear localStorage hint when no jobs are running
    useEffect(() => {
        if (runningCount === 0 && typeof window !== "undefined") {
            const hint = localStorage.getItem(STORAGE_KEY);
            if (hint) {
                localStorage.removeItem(STORAGE_KEY);
                setEnabled(false);
            }
        }
    }, [runningCount]);

    if (runningCount === 0 && !enabled) return null;
    if (runningCount === 0) return null;

    return (
        <Link
            href="/ai-drafter/proposals"
            className="fixed bottom-6 right-6 z-40 bg-black text-white rounded-full pl-3 pr-4 py-2 shadow-lg hover:bg-stone-800 transition-all flex items-center gap-2 text-xs font-bold"
            aria-label={`${runningCount} proposal${runningCount === 1 ? "" : "s"} generating — view progress`}
        >
            <span className="relative flex items-center justify-center w-5 h-5">
                <Loader2 className="w-4 h-4 animate-spin" />
            </span>
            <FileText className="w-3.5 h-3.5" />
            <span>
                {runningCount} proposal{runningCount === 1 ? "" : "s"} generating
            </span>
        </Link>
    );
}
