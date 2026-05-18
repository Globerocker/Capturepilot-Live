"use client";

import Link from "next/link";
import { ArrowRight, Lock, Phone, Target, ShieldCheck, Sparkles } from "lucide-react";
import clsx from "clsx";

type Variant =
    /** Shown when readiness score flags missing SAM.gov registration. */
    | "sam_registration"
    /** Shown after a single opportunity match — offers help bidding it. */
    | "bid_help"
    /** Generic "we do it for you" — Calendly intro call (highest ticket). */
    | "done_for_you"
    /** Inside the StartupPackOfferCard sibling — same kit, smaller surface. */
    | "launch_kit_compact";

interface Props {
    variant: Variant;
    /** Optional analysis ID — appended to checkout URLs so we can attribute. */
    analysisId?: string;
    /** Optional opportunity title — personalizes bid_help copy. */
    opportunityTitle?: string;
}

const CONSULTING_CAL = "https://calendly.com/capturepilot/strategy-call";
const LAUNCH_KIT_HREF = "/startup-pack";

export default function InlineCTA({ variant, analysisId, opportunityTitle }: Props) {
    if (variant === "sam_registration") {
        return (
            <div className="rounded-2xl border-2 border-amber-300 bg-gradient-to-br from-amber-50 to-white p-5 sm:p-6 shadow-sm">
                <div className="flex items-start gap-4">
                    <div className="w-11 h-11 rounded-xl bg-amber-500 text-white flex items-center justify-center flex-shrink-0 shadow-sm">
                        <ShieldCheck className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-amber-700">Quick win</p>
                        <h3 className="font-bold text-base text-stone-900 mt-0.5">
                            Get on SAM.gov in 3–5 days
                        </h3>
                        <p className="text-sm text-stone-600 mt-1.5 leading-relaxed">
                            Our Federal Launch Kit includes a 32-page step-by-step SAM.gov walkthrough plus the pre-flight checklist most founders miss.
                            $70 today &nbsp;·&nbsp; lifetime access.
                        </p>
                        <div className="flex flex-wrap gap-2 mt-4">
                            <Link
                                href={LAUNCH_KIT_HREF}
                                className="bg-amber-500 text-white text-xs font-bold px-4 py-2 rounded-lg hover:bg-amber-600 transition-colors inline-flex items-center gap-1.5 shadow-sm"
                            >
                                <Lock className="w-3.5 h-3.5" /> Get the Launch Kit
                            </Link>
                            <a
                                href={CONSULTING_CAL}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="bg-white border border-stone-200 text-stone-700 text-xs font-bold px-4 py-2 rounded-lg hover:border-stone-300 transition-colors inline-flex items-center gap-1.5"
                            >
                                <Phone className="w-3.5 h-3.5" /> Have us register you
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (variant === "bid_help") {
        const titleClipped = opportunityTitle
            ? opportunityTitle.length > 60 ? opportunityTitle.slice(0, 60) + "…" : opportunityTitle
            : "this opportunity";
        return (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 mt-3">
                <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center flex-shrink-0">
                        <Target className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm text-stone-900">
                            Want to bid on {titleClipped}?
                        </p>
                        <p className="text-xs text-stone-600 mt-1 leading-relaxed">
                            The Federal Launch Kit has a full Sources Sought / RFP response playbook + bid-no-bid scorecard. Or have us walk it through live.
                        </p>
                        <div className="flex flex-wrap gap-1.5 mt-2.5">
                            <Link
                                href={LAUNCH_KIT_HREF}
                                className="bg-emerald-600 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg hover:bg-emerald-700 transition-colors inline-flex items-center gap-1"
                            >
                                Launch Kit · $70 <ArrowRight className="w-3 h-3" />
                            </Link>
                            <a
                                href={CONSULTING_CAL}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="bg-white border border-stone-200 text-stone-700 text-[11px] font-bold px-3 py-1.5 rounded-lg hover:border-stone-300 transition-colors inline-flex items-center gap-1"
                            >
                                Book a call
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (variant === "done_for_you") {
        return (
            <div className="rounded-[28px] bg-gradient-to-br from-stone-900 to-stone-800 text-white p-6 sm:p-8 shadow-lg">
                <div className="flex flex-col sm:flex-row gap-5 items-start">
                    <div className="w-14 h-14 rounded-2xl bg-amber-400 text-amber-900 flex items-center justify-center flex-shrink-0 shadow-md">
                        <Sparkles className="w-7 h-7" />
                    </div>
                    <div className="flex-1">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-amber-300">Done for you</p>
                        <h3 className="font-black text-xl sm:text-2xl mt-1">Want us to run capture for you?</h3>
                        <p className="text-white/80 text-sm mt-2 max-w-xl leading-relaxed">
                            Our managed-capture team handles SAM, response writing, color-team reviews, and submission for $4–8k/month.
                            Book a 30-min strategy call and we&apos;ll tell you in 5 minutes whether it&apos;s a fit.
                        </p>
                        <a
                            href={CONSULTING_CAL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-4 inline-flex items-center gap-2 bg-amber-300 text-amber-900 px-5 py-3 rounded-2xl font-bold text-sm hover:bg-amber-200 transition-all shadow-md"
                        >
                            <Phone className="w-4 h-4" /> Book strategy call
                        </a>
                    </div>
                </div>
            </div>
        );
    }

    // launch_kit_compact
    return (
        <Link
            href={LAUNCH_KIT_HREF}
            className={clsx(
                "block rounded-2xl border-2 border-emerald-300 bg-gradient-to-r from-emerald-50 to-blue-50 px-5 py-4 hover:border-emerald-400 hover:shadow-md transition-all",
            )}
        >
            <div className="flex items-center gap-3">
                <Lock className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-stone-900">Federal Launch Kit · $70</p>
                    <p className="text-[11px] text-stone-500 mt-0.5">36 templates + playbooks + worksheets · 7-day refund</p>
                </div>
                <ArrowRight className="w-4 h-4 text-emerald-600" />
            </div>
        </Link>
    );
}
