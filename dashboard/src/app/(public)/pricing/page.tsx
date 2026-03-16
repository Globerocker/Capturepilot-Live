"use client";

import { Check, X, Zap, Shield, Building } from "lucide-react";
import Link from "next/link";

const PLANS = [
    {
        name: "Free Trial",
        price: "$0",
        period: "14 days",
        description: "Try everything with no credit card required",
        features: [
            { text: "Up to 25 scored matches", included: true },
            { text: "3 AI email drafts per day", included: true },
            { text: "Call transcription", included: true },
            { text: "Opportunity browser", included: true },
            { text: "Pipeline tracking", included: true },
            { text: "Unlimited matches", included: false },
            { text: "Unlimited email drafts", included: false },
            { text: "Priority support", included: false },
        ],
        cta: "Start Free Trial",
        href: "/signup",
        highlighted: false,
        icon: Zap,
    },
    {
        name: "Pro",
        price: "$79",
        period: "/month",
        description: "Everything you need to win federal contracts",
        features: [
            { text: "Unlimited scored matches", included: true },
            { text: "Unlimited AI email drafts", included: true },
            { text: "Call transcription + logs", included: true },
            { text: "Opportunity browser", included: true },
            { text: "Pipeline tracking", included: true },
            { text: "AI win strategies", included: true },
            { text: "Advanced filters & sorting", included: true },
            { text: "Priority support", included: true },
        ],
        cta: "Upgrade to Pro",
        href: "/signup",
        highlighted: true,
        icon: Shield,
    },
    {
        name: "Enterprise",
        price: "Custom",
        period: "",
        description: "For teams and agencies managing multiple bids",
        features: [
            { text: "Everything in Pro", included: true },
            { text: "Team seats & collaboration", included: true },
            { text: "API access", included: true },
            { text: "Custom integrations", included: true },
            { text: "Dedicated account manager", included: true },
            { text: "Custom scoring models", included: true },
            { text: "White-label options", included: true },
            { text: "SLA guarantees", included: true },
        ],
        cta: "Contact Sales",
        href: "https://calendly.com/americurial/intro-call",
        highlighted: false,
        icon: Building,
    },
];

export default function PricingPage() {
    return (
        <div className="min-h-screen bg-stone-50">
            <div className="max-w-5xl mx-auto px-4 py-16 sm:py-24">
                <div className="text-center mb-12 sm:mb-16">
                    <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-stone-900 mb-4">
                        Win More Federal Contracts
                    </h1>
                    <p className="text-lg text-stone-500 max-w-2xl mx-auto">
                        AI-powered capture intelligence that matches your company to the right opportunities and helps you build winning strategies.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
                    {PLANS.map(plan => {
                        const Icon = plan.icon;
                        return (
                            <div key={plan.name} className={`rounded-3xl border p-6 sm:p-8 flex flex-col ${plan.highlighted ? "bg-stone-900 text-white border-stone-800 shadow-xl scale-[1.02]" : "bg-white border-stone-200 shadow-sm"}`}>
                                <div className="flex items-center gap-2 mb-4">
                                    <Icon className={`w-5 h-5 ${plan.highlighted ? "text-emerald-400" : "text-stone-400"}`} />
                                    <span className={`font-typewriter font-bold text-sm uppercase tracking-widest ${plan.highlighted ? "text-emerald-400" : "text-stone-500"}`}>
                                        {plan.name}
                                    </span>
                                </div>

                                <div className="mb-4">
                                    <span className="text-4xl font-bold">{plan.price}</span>
                                    <span className={`text-sm ml-1 ${plan.highlighted ? "text-stone-400" : "text-stone-500"}`}>{plan.period}</span>
                                </div>

                                <p className={`text-sm mb-6 ${plan.highlighted ? "text-stone-300" : "text-stone-500"}`}>
                                    {plan.description}
                                </p>

                                <ul className="space-y-3 mb-8 flex-1">
                                    {plan.features.map(f => (
                                        <li key={f.text} className="flex items-center gap-2 text-sm">
                                            {f.included ? (
                                                <Check className={`w-4 h-4 flex-shrink-0 ${plan.highlighted ? "text-emerald-400" : "text-emerald-500"}`} />
                                            ) : (
                                                <X className="w-4 h-4 text-stone-400 flex-shrink-0" />
                                            )}
                                            <span className={f.included ? "" : "text-stone-400"}>{f.text}</span>
                                        </li>
                                    ))}
                                </ul>

                                <Link
                                    href={plan.href}
                                    className={`block text-center font-typewriter font-bold text-sm py-3 rounded-full transition-all ${plan.highlighted ? "bg-white text-black hover:bg-stone-100" : "bg-black text-white hover:bg-stone-800"}`}
                                >
                                    {plan.cta}
                                </Link>
                            </div>
                        );
                    })}
                </div>

                <div className="text-center mt-12">
                    <Link href="/login" className="text-sm text-stone-500 hover:text-black transition-colors font-typewriter">
                        Already have an account? Sign in
                    </Link>
                </div>
            </div>
        </div>
    );
}
