"use client";

import { useEffect, useState } from "react";
import { createSupabaseClient } from "@/lib/supabase/client";
import { AlertTriangle, Zap, Loader2 } from "lucide-react";
import Link from "next/link";

const supabase = createSupabaseClient();

export default function UpgradeBanner() {
    const [show, setShow] = useState(false);
    const [daysLeft, setDaysLeft] = useState<number | null>(null);
    const [status, setStatus] = useState<string>("trialing");

    useEffect(() => {
        async function check() {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data: profile } = await supabase
                .from("user_profiles")
                .select("subscription_status, trial_ends_at")
                .eq("auth_user_id", user.id)
                .single();

            if (!profile) return;

            const p = profile as unknown as Record<string, unknown>;
            const subStatus = (p.subscription_status as string) || "trialing";
            const trialEndsAt = (p.trial_ends_at as string) || null;

            if (subStatus === "active") return;

            if (trialEndsAt) {
                const days = Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                setDaysLeft(days);

                if (days <= 0) {
                    setStatus("expired");
                    setShow(true);
                } else if (days <= 3) {
                    setStatus("expiring_soon");
                    setShow(true);
                }
            }

            if (subStatus === "past_due" || subStatus === "canceled") {
                setStatus(subStatus);
                setShow(true);
            }
        }
        check();
    }, []);

    if (!show) return null;

    const isExpired = status === "expired";
    const isExpiringSoon = status === "expiring_soon";
    const isPastDue = status === "past_due";

    return (
        <div className={`px-4 py-2.5 flex items-center justify-between text-sm ${
            isExpired || isPastDue
                ? "bg-red-600 text-white"
                : "bg-amber-500 text-white"
        }`}>
            <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span className="font-typewriter font-bold text-xs sm:text-sm">
                    {isExpired && "Your free trial has expired."}
                    {isExpiringSoon && `Your trial expires in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}.`}
                    {isPastDue && "Payment failed. Update your payment method."}
                    {status === "canceled" && "Your subscription has been canceled."}
                </span>
            </div>
            <Link
                href="/billing"
                className={`inline-flex items-center font-typewriter font-bold text-xs px-4 py-1.5 rounded-full transition-all flex-shrink-0 ${
                    isExpired || isPastDue
                        ? "bg-white text-red-600 hover:bg-red-50"
                        : "bg-white text-amber-600 hover:bg-amber-50"
                }`}
            >
                <Zap className="w-3 h-3 mr-1" />
                {isExpired || status === "canceled" ? "Upgrade" : isPastDue ? "Fix Payment" : "Upgrade Now"}
            </Link>
        </div>
    );
}
