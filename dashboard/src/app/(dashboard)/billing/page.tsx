"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseClient } from "@/lib/supabase/client";
import { CreditCard, Loader2, Zap, Shield, Clock, ExternalLink, CheckCircle2, AlertTriangle } from "lucide-react";
import clsx from "clsx";

const supabase = createSupabaseClient();

interface BillingInfo {
    subscriptionStatus: string;
    trialEndsAt: string | null;
    daysLeft: number | null;
    stripeCustomerId: string | null;
}

export default function BillingPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [billing, setBilling] = useState<BillingInfo | null>(null);
    const [upgrading, setUpgrading] = useState(false);
    const [managingPortal, setManagingPortal] = useState(false);

    useEffect(() => {
        async function load() {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) { router.push("/login"); return; }

            const { data: profile } = await supabase
                .from("user_profiles")
                .select("subscription_status, trial_ends_at, stripe_customer_id")
                .eq("auth_user_id", user.id)
                .single();

            if (!profile) { router.push("/onboard"); return; }

            const p = profile as unknown as Record<string, unknown>;
            const status = (p.subscription_status as string) || "trialing";
            const trialEndsAt = (p.trial_ends_at as string) || null;

            let daysLeft: number | null = null;
            if (trialEndsAt) {
                daysLeft = Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            }

            setBilling({
                subscriptionStatus: status === "trialing" && daysLeft !== null && daysLeft <= 0 ? "expired" : status,
                trialEndsAt,
                daysLeft,
                stripeCustomerId: (p.stripe_customer_id as string) || null,
            });
            setLoading(false);
        }
        load();
    }, [router]);

    const handleUpgrade = async () => {
        setUpgrading(true);
        try {
            const res = await fetch("/api/stripe/checkout", { method: "POST" });
            const data = await res.json();
            if (data.url) {
                window.location.href = data.url;
            }
        } catch {
            setUpgrading(false);
        }
    };

    const handleManage = async () => {
        setManagingPortal(true);
        try {
            const res = await fetch("/api/stripe/portal", { method: "POST" });
            const data = await res.json();
            if (data.url) {
                window.location.href = data.url;
            }
        } catch {
            setManagingPortal(false);
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center min-h-[400px]">
                <Loader2 className="w-10 h-10 animate-spin text-stone-400" />
            </div>
        );
    }

    if (!billing) return null;

    const isActive = billing.subscriptionStatus === "active";
    const isTrialing = billing.subscriptionStatus === "trialing";
    const isExpired = billing.subscriptionStatus === "expired";
    const isCanceled = billing.subscriptionStatus === "canceled";
    const isPastDue = billing.subscriptionStatus === "past_due";

    return (
        <div className="max-w-2xl mx-auto pb-12 animate-in fade-in duration-500 px-1">
            <header className="mb-6">
                <h2 className="text-2xl sm:text-3xl font-bold font-typewriter tracking-tighter text-black flex items-center">
                    <CreditCard className="mr-2 sm:mr-3 w-6 h-6 sm:w-8 sm:h-8" /> Billing
                </h2>
                <p className="text-stone-500 mt-1 font-medium text-sm">
                    Manage your subscription and billing
                </p>
            </header>

            {/* Current Plan Card */}
            <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden mb-6">
                <div className="p-6 sm:p-8">
                    <div className="flex items-start justify-between mb-4">
                        <div>
                            <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-1">Current Plan</p>
                            <h3 className="text-2xl font-bold">
                                {isActive ? "Pro" : isTrialing ? "Free Trial" : isExpired ? "Trial Expired" : isCanceled ? "Canceled" : "Pro (Past Due)"}
                            </h3>
                        </div>
                        <div className={clsx(
                            "px-3 py-1.5 rounded-full text-xs font-typewriter font-bold uppercase tracking-wider",
                            isActive ? "bg-emerald-100 text-emerald-700" :
                            isTrialing ? "bg-blue-100 text-blue-700" :
                            isExpired || isCanceled ? "bg-red-100 text-red-700" :
                            "bg-amber-100 text-amber-700"
                        )}>
                            {isActive ? "Active" : isTrialing ? "Trial" : isExpired ? "Expired" : isCanceled ? "Canceled" : "Past Due"}
                        </div>
                    </div>

                    {/* Trial info */}
                    {isTrialing && billing.daysLeft !== null && (
                        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
                            <div className="flex items-center gap-2 mb-1">
                                <Clock className="w-4 h-4 text-blue-600" />
                                <span className="text-sm font-bold text-blue-800">
                                    {billing.daysLeft} day{billing.daysLeft !== 1 ? "s" : ""} remaining
                                </span>
                            </div>
                            <p className="text-xs text-blue-700">
                                Your free trial ends on {new Date(billing.trialEndsAt!).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.
                                Upgrade to Pro to keep access to all features.
                            </p>
                        </div>
                    )}

                    {/* Expired warning */}
                    {isExpired && (
                        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
                            <div className="flex items-center gap-2 mb-1">
                                <AlertTriangle className="w-4 h-4 text-red-600" />
                                <span className="text-sm font-bold text-red-800">Trial expired</span>
                            </div>
                            <p className="text-xs text-red-700">
                                Your free trial has ended. Upgrade to Pro to regain access to all features.
                            </p>
                        </div>
                    )}

                    {/* Past due warning */}
                    {isPastDue && (
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
                            <div className="flex items-center gap-2 mb-1">
                                <AlertTriangle className="w-4 h-4 text-amber-600" />
                                <span className="text-sm font-bold text-amber-800">Payment failed</span>
                            </div>
                            <p className="text-xs text-amber-700">
                                Your last payment failed. Please update your payment method to avoid losing access.
                            </p>
                        </div>
                    )}

                    {/* Active plan features */}
                    {isActive && (
                        <div className="space-y-2 mb-4">
                            {["Unlimited scored matches", "Unlimited AI email drafts", "Call transcription + logs", "AI win strategies", "Priority support"].map(f => (
                                <div key={f} className="flex items-center gap-2 text-sm text-stone-700">
                                    <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                                    {f}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex flex-wrap gap-3 pt-2">
                        {!isActive && (
                            <button
                                type="button"
                                onClick={handleUpgrade}
                                disabled={upgrading}
                                className="inline-flex items-center bg-black text-white font-typewriter font-bold px-6 py-3 rounded-full text-sm hover:bg-stone-800 transition-all disabled:opacity-50"
                            >
                                {upgrading ? (
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                ) : (
                                    <Zap className="w-4 h-4 mr-2" />
                                )}
                                {upgrading ? "Redirecting..." : "Upgrade to Pro — $79/mo"}
                            </button>
                        )}

                        {billing.stripeCustomerId && (
                            <button
                                type="button"
                                onClick={handleManage}
                                disabled={managingPortal}
                                className="inline-flex items-center bg-stone-100 text-stone-700 font-typewriter font-bold px-6 py-3 rounded-full text-sm hover:bg-stone-200 transition-all border border-stone-200 disabled:opacity-50"
                            >
                                {managingPortal ? (
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                ) : (
                                    <ExternalLink className="w-4 h-4 mr-2" />
                                )}
                                {managingPortal ? "Opening..." : "Manage Subscription"}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Pro Plan Details */}
            {!isActive && (
                <div className="bg-stone-900 text-white rounded-2xl border border-stone-800 shadow-xl p-6 sm:p-8">
                    <div className="flex items-center gap-2 mb-4">
                        <Shield className="w-5 h-5 text-emerald-400" />
                        <span className="font-typewriter font-bold text-sm uppercase tracking-widest text-emerald-400">Pro Plan</span>
                    </div>
                    <div className="mb-4">
                        <span className="text-4xl font-bold">$79</span>
                        <span className="text-sm text-stone-400 ml-1">/month</span>
                    </div>
                    <p className="text-sm text-stone-300 mb-6">
                        Everything you need to win federal contracts.
                    </p>
                    <ul className="space-y-2 mb-6">
                        {[
                            "Unlimited scored matches",
                            "Unlimited AI email drafts",
                            "Call transcription + logs",
                            "AI win strategies",
                            "Advanced filters & sorting",
                            "Priority support",
                        ].map(f => (
                            <li key={f} className="flex items-center gap-2 text-sm">
                                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                                {f}
                            </li>
                        ))}
                    </ul>
                    <button
                        type="button"
                        onClick={handleUpgrade}
                        disabled={upgrading}
                        className="w-full bg-white text-black font-typewriter font-bold py-3 rounded-full text-sm hover:bg-stone-100 transition-all disabled:opacity-50"
                    >
                        {upgrading ? "Redirecting..." : "Upgrade Now"}
                    </button>
                </div>
            )}
        </div>
    );
}
