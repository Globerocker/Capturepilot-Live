"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseClient } from "@/lib/supabase/client";
import { CreditCard, Loader2, Zap, Shield, Clock, ExternalLink, CheckCircle2, AlertTriangle, Rocket, Star } from "lucide-react";
import clsx from "clsx";

const supabase = createSupabaseClient();

// Beta ends 60 days from March 17, 2026
const BETA_END_DATE = new Date("2026-05-16T00:00:00Z");

interface BillingInfo {
    subscriptionStatus: string;
    trialEndsAt: string | null;
    daysLeft: number | null;
    stripeCustomerId: string | null;
}

const TIERS = [
    {
        name: "Starter",
        price: 49,
        description: "For small businesses starting in GovCon",
        features: [
            "Up to 50 scored matches/month",
            "3 AI email drafts/day",
            "Pipeline management",
            "NAICS & set-aside matching",
            "Basic opportunity search",
            "Email support",
        ],
        cta: "Start with Starter",
        popular: false,
    },
    {
        name: "Professional",
        price: 99,
        description: "For serious government contractors",
        features: [
            "Unlimited scored matches",
            "Unlimited AI email drafts",
            "AI win strategies & scoring",
            "Letter writer with editor",
            "Call transcription + logs",
            "Capture intelligence dashboard",
            "Attachment preview",
            "Priority support",
        ],
        cta: "Go Professional",
        popular: true,
    },
    {
        name: "Enterprise",
        price: 249,
        description: "For teams pursuing large contracts",
        features: [
            "Everything in Professional",
            "Up to 10 team seats",
            "Role-based access control",
            "Gmail & Calendar integration",
            "Custom NAICS watchlists",
            "Automated enrichment pipeline",
            "White-glove onboarding",
            "Dedicated account manager",
        ],
        cta: "Contact Sales",
        popular: false,
    },
];

function BetaCountdown() {
    const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });

    useEffect(() => {
        const tick = () => {
            const now = Date.now();
            const diff = BETA_END_DATE.getTime() - now;
            if (diff <= 0) {
                setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
                return;
            }
            setTimeLeft({
                days: Math.floor(diff / (1000 * 60 * 60 * 24)),
                hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
                minutes: Math.floor((diff / (1000 * 60)) % 60),
                seconds: Math.floor((diff / 1000) % 60),
            });
        };
        tick();
        const interval = setInterval(tick, 1000);
        return () => clearInterval(interval);
    }, []);

    const pad = (n: number) => n.toString().padStart(2, "0");

    return (
        <div className="grid grid-cols-4 gap-3 max-w-sm mx-auto">
            {[
                { val: timeLeft.days, label: "Days" },
                { val: timeLeft.hours, label: "Hours" },
                { val: timeLeft.minutes, label: "Min" },
                { val: timeLeft.seconds, label: "Sec" },
            ].map((unit) => (
                <div key={unit.label} className="text-center">
                    <div className="bg-stone-900 text-white rounded-xl py-3 px-2 font-mono text-2xl sm:text-3xl font-bold tabular-nums">
                        {pad(unit.val)}
                    </div>
                    <p className="text-[10px] font-typewriter text-stone-500 uppercase tracking-widest mt-1.5">{unit.label}</p>
                </div>
            ))}
        </div>
    );
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
    const isPastDue = billing.subscriptionStatus === "past_due";

    return (
        <div className="max-w-5xl mx-auto pb-12 animate-in fade-in duration-500 px-1">
            <header className="mb-8 text-center">
                <h2 className="text-2xl sm:text-3xl font-bold font-typewriter tracking-tighter text-black flex items-center justify-center">
                    <CreditCard className="mr-2 sm:mr-3 w-6 h-6 sm:w-8 sm:h-8" /> Billing & Plans
                </h2>
                <p className="text-stone-500 mt-1 font-medium text-sm">
                    {isActive ? "Manage your subscription" : "You're on the free beta — enjoy it while it lasts!"}
                </p>
            </header>

            {/* Beta Banner */}
            {!isActive && (
                <div className="bg-gradient-to-br from-emerald-50 via-white to-emerald-50 rounded-2xl border border-emerald-200 shadow-sm p-6 sm:p-8 mb-8 text-center">
                    <div className="inline-flex items-center gap-2 bg-emerald-100 text-emerald-700 font-typewriter font-bold text-xs px-4 py-1.5 rounded-full border border-emerald-200 mb-4">
                        <Rocket className="w-3.5 h-3.5" />
                        BETA ACCESS — 100% FREE
                    </div>
                    <h3 className="text-xl sm:text-2xl font-bold font-typewriter mb-2">
                        Free Beta Ends In
                    </h3>
                    <p className="text-sm text-stone-500 mb-6 max-w-md mx-auto">
                        All features are unlocked during beta. Lock in 25% off when you upgrade before the countdown hits zero.
                    </p>
                    <BetaCountdown />
                    <p className="text-xs text-emerald-600 font-typewriter font-bold mt-4">
                        Beta users save 25% on any plan — forever
                    </p>
                </div>
            )}

            {/* Active subscription info */}
            {isActive && (
                <div className="bg-white rounded-2xl border border-emerald-200 shadow-sm p-6 sm:p-8 mb-8">
                    <div className="flex items-start justify-between mb-4">
                        <div>
                            <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-1">Your Plan</p>
                            <h3 className="text-2xl font-bold">Professional</h3>
                        </div>
                        <span className="bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-full text-xs font-typewriter font-bold uppercase">Active</span>
                    </div>
                    <div className="space-y-2 mb-4">
                        {["Unlimited scored matches", "Unlimited AI email drafts", "AI win strategies", "Call transcription", "Priority support"].map(f => (
                            <div key={f} className="flex items-center gap-2 text-sm text-stone-700">
                                <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                                {f}
                            </div>
                        ))}
                    </div>
                    {billing.stripeCustomerId && (
                        <button
                            type="button"
                            onClick={handleManage}
                            disabled={managingPortal}
                            className="inline-flex items-center bg-stone-100 text-stone-700 font-typewriter font-bold px-6 py-3 rounded-full text-sm hover:bg-stone-200 transition-all border border-stone-200 disabled:opacity-50"
                        >
                            {managingPortal ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ExternalLink className="w-4 h-4 mr-2" />}
                            {managingPortal ? "Opening..." : "Manage Subscription"}
                        </button>
                    )}
                </div>
            )}

            {/* Past due warning */}
            {isPastDue && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
                    <div className="flex items-center gap-2 mb-1">
                        <AlertTriangle className="w-4 h-4 text-amber-600" />
                        <span className="text-sm font-bold text-amber-800">Payment failed</span>
                    </div>
                    <p className="text-xs text-amber-700">Please update your payment method to avoid losing access.</p>
                </div>
            )}

            {/* Pricing Tiers */}
            <div className="mb-6">
                <h3 className="font-typewriter font-bold text-sm uppercase tracking-widest text-stone-500 text-center mb-6">
                    {isActive ? "All Plans" : "Choose Your Plan After Beta"}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
                    {TIERS.map((tier) => (
                        <div
                            key={tier.name}
                            className={clsx(
                                "rounded-2xl border overflow-hidden flex flex-col",
                                tier.popular
                                    ? "bg-stone-900 text-white border-stone-800 shadow-xl relative"
                                    : "bg-white border-stone-200 shadow-sm"
                            )}
                        >
                            {tier.popular && (
                                <div className="absolute top-0 right-0 bg-emerald-500 text-white text-[10px] font-typewriter font-bold px-3 py-1 rounded-bl-xl flex items-center gap-1">
                                    <Star className="w-3 h-3" /> MOST POPULAR
                                </div>
                            )}
                            <div className="p-5 sm:p-6 flex-1 flex flex-col">
                                <div className="flex items-center gap-2 mb-2">
                                    {tier.popular ? (
                                        <Shield className="w-5 h-5 text-emerald-400" />
                                    ) : (
                                        <Zap className={clsx("w-5 h-5", tier.name === "Enterprise" ? "text-purple-500" : "text-stone-400")} />
                                    )}
                                    <span className={clsx(
                                        "font-typewriter font-bold text-sm uppercase tracking-wider",
                                        tier.popular ? "text-emerald-400" : "text-stone-500"
                                    )}>
                                        {tier.name}
                                    </span>
                                </div>
                                <div className="mb-2">
                                    <span className={clsx("text-3xl font-bold", tier.popular ? "text-white" : "text-stone-900")}>
                                        ${tier.price}
                                    </span>
                                    <span className={clsx("text-sm ml-1", tier.popular ? "text-stone-400" : "text-stone-500")}>/mo</span>
                                </div>
                                <p className={clsx("text-xs mb-4", tier.popular ? "text-stone-400" : "text-stone-500")}>
                                    {tier.description}
                                </p>
                                <ul className="space-y-2 mb-6 flex-1">
                                    {tier.features.map(f => (
                                        <li key={f} className="flex items-start gap-2 text-xs">
                                            <CheckCircle2 className={clsx(
                                                "w-3.5 h-3.5 flex-shrink-0 mt-0.5",
                                                tier.popular ? "text-emerald-400" : "text-emerald-500"
                                            )} />
                                            <span className={tier.popular ? "text-stone-300" : "text-stone-700"}>{f}</span>
                                        </li>
                                    ))}
                                </ul>
                                <button
                                    type="button"
                                    onClick={tier.name === "Enterprise" ? () => window.open("https://calendly.com/americurial/intro-call", "_blank") : handleUpgrade}
                                    disabled={upgrading && tier.name !== "Enterprise"}
                                    className={clsx(
                                        "w-full py-2.5 rounded-full font-typewriter font-bold text-xs transition-all disabled:opacity-50",
                                        tier.popular
                                            ? "bg-white text-black hover:bg-stone-100"
                                            : "bg-stone-100 text-stone-700 hover:bg-stone-200 border border-stone-200"
                                    )}
                                >
                                    {upgrading && tier.name !== "Enterprise" ? "Redirecting..." : tier.cta}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Beta savings callout */}
            {!isActive && (
                <div className="text-center bg-stone-50 rounded-2xl border border-stone-200 p-4">
                    <p className="text-xs text-stone-500">
                        <span className="font-typewriter font-bold text-emerald-600">Beta users get 25% off</span> any plan when you upgrade before the beta period ends. No credit card required during beta.
                    </p>
                </div>
            )}
        </div>
    );
}
