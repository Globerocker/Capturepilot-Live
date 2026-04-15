"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseClient } from "@/lib/supabase/client";
import {
  CreditCard,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  ChevronDown,
  Star,
  Phone,
} from "lucide-react";
import clsx from "clsx";

const supabase = createSupabaseClient();

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

interface BillingInfo {
  planTier: string;
  subscriptionStatus: string;
  trialEndsAt: string | null;
  trialDaysLeft: number | null;
  nextBillingDate: string | null;
  stripeCustomerId: string | null;
}

type Interval = "monthly" | "yearly";

/* ------------------------------------------------------------------ */
/*  Plan data                                                         */
/* ------------------------------------------------------------------ */

const FREE_FEATURES = [
  "Quick Company Check",
  "5 opportunity matches",
  "NAICS identification",
  "Basic eligibility report",
];

const PRO_FEATURES = [
  "Everything in Free",
  "Unlimited matches",
  "AI Proposal Draft Generator",
  "Market Intelligence",
  "Capability Statement Builder",
  "Deal Pipeline",
  "Partner Search",
  "Email Alerts",
  "Eligibility Checks",
  "Priority Support",
];

const CONSULTING_FEATURES = [
  "Everything in Pro",
  "Dedicated capture team",
  "All agency communications handled",
  "Full proposal development",
  "SAM.gov registration support",
  "Competitor analysis reports",
  "Monthly strategy calls",
  "5% success fee on wins",
];

/* ------------------------------------------------------------------ */
/*  FAQ data                                                          */
/* ------------------------------------------------------------------ */

const FAQ_ITEMS = [
  {
    q: "Can I cancel anytime?",
    a: "Yes, monthly plans can be canceled at any time. You'll retain access through the end of your current billing period.",
  },
  {
    q: "What's included in the free trial?",
    a: "You get full access to every Pro feature for 30 days — unlimited matches, AI proposals, pipeline tools, the works.",
  },
  {
    q: "What happens after the trial ends?",
    a: "You'll be charged the plan rate on file. Cancel before the trial ends to avoid any charges.",
  },
  {
    q: "Can I switch from monthly to yearly?",
    a: "Yes. Open the Manage Subscription portal and switch plans. The yearly discount will apply immediately on a prorated basis.",
  },
  {
    q: "What payment methods do you accept?",
    a: "All major credit cards processed securely through Stripe.",
  },
];

/* ------------------------------------------------------------------ */
/*  FAQ Accordion Item                                                */
/* ------------------------------------------------------------------ */

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-stone-200 last:border-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-4 text-left text-sm font-medium text-stone-800 hover:text-emerald-700 transition-colors"
      >
        {q}
        <ChevronDown
          className={clsx(
            "w-4 h-4 text-stone-400 transition-transform flex-shrink-0 ml-4",
            open && "rotate-180"
          )}
        />
      </button>
      {open && (
        <p className="pb-4 text-sm text-stone-500 leading-relaxed">{a}</p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Status badge helper                                               */
/* ------------------------------------------------------------------ */

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    active: { bg: "bg-emerald-100", text: "text-emerald-700", label: "Active" },
    trialing: { bg: "bg-blue-100", text: "text-blue-700", label: "Trial" },
    past_due: { bg: "bg-amber-100", text: "text-amber-700", label: "Past Due" },
    canceled: { bg: "bg-red-100", text: "text-red-700", label: "Canceled" },
    free: { bg: "bg-stone-100", text: "text-stone-600", label: "Free" },
  };
  const s = map[status] || map.free;
  return (
    <span
      className={clsx(
        s.bg,
        s.text,
        "px-3 py-1 rounded-full text-xs font-bold uppercase"
      )}
    >
      {s.label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Main page component                                               */
/* ------------------------------------------------------------------ */

function BillingPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [billing, setBilling] = useState<BillingInfo | null>(null);
  const [interval, setInterval] = useState<Interval>("monthly");
  const [upgrading, setUpgrading] = useState(false);
  const [managingPortal, setManagingPortal] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "canceled"; message: string } | null>(null);

  const isPaywallRedirect = searchParams.get("paywall") === "1";

  /* ---- Toast from Stripe redirect ---- */
  useEffect(() => {
    if (searchParams.get("success") === "true") {
      setToast({ type: "success", message: "Subscription activated! Welcome to Pro." });
    } else if (searchParams.get("canceled") === "true") {
      setToast({ type: "canceled", message: "Checkout canceled. No charges were made." });
    }
  }, [searchParams]);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 6000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  /* ---- Load billing data ---- */
  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }

      const { data: profile } = await supabase
        .from("user_profiles")
        .select(
          "subscription_status, trial_ends_at, stripe_customer_id, plan_tier, account_type"
        )
        .eq("auth_user_id", user.id)
        .single();

      if (!profile) {
        router.push("/onboard");
        return;
      }

      const p = profile as unknown as Record<string, unknown>;
      const status = (p.subscription_status as string) || "free";
      const trialEndsAt = (p.trial_ends_at as string) || null;
      const planTier = (p.plan_tier as string) || "free";
      const accountType = (p.account_type as string) || "self_service";

      let trialDaysLeft: number | null = null;
      if (trialEndsAt) {
        trialDaysLeft = Math.max(
          0,
          Math.ceil(
            (new Date(trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
          )
        );
      }

      // Determine effective status
      let effectiveStatus = status;
      if (accountType === "consulting") effectiveStatus = "consulting";
      else if (status === "trialing" && trialDaysLeft !== null && trialDaysLeft <= 0)
        effectiveStatus = "free";
      else if (!status || status === "none") effectiveStatus = "free";

      setBilling({
        planTier: accountType === "consulting" ? "consulting" : planTier,
        subscriptionStatus: effectiveStatus,
        trialEndsAt,
        trialDaysLeft,
        nextBillingDate: null, // set by Stripe webhook in future
        stripeCustomerId: (p.stripe_customer_id as string) || null,
      });
      setLoading(false);
    }
    load();
  }, [router]);

  /* ---- Handlers ---- */

  const handleUpgrade = async (selectedInterval: Interval) => {
    setUpgrading(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interval: selectedInterval }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setUpgrading(false);
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
      } else {
        setManagingPortal(false);
      }
    } catch {
      setManagingPortal(false);
    }
  };

  /* ---- Loading ---- */
  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <Loader2 className="w-10 h-10 animate-spin text-stone-400" />
      </div>
    );
  }

  if (!billing) return null;

  const isSubscribed =
    billing.subscriptionStatus === "active" ||
    billing.subscriptionStatus === "trialing" ||
    billing.subscriptionStatus === "past_due";
  const isConsulting = billing.subscriptionStatus === "consulting";
  const showPricingCards = !isSubscribed && !isConsulting;

  const proPrice = interval === "yearly" ? 159 : 199;
  const yearlyTotal = 1908;

  /* ---- Derived display values ---- */
  const planDisplayName =
    billing.subscriptionStatus === "active" || billing.subscriptionStatus === "trialing"
      ? "Pro"
      : billing.subscriptionStatus === "consulting"
        ? "Consulting"
        : "Free";

  return (
    <div className="max-w-6xl mx-auto pb-16 animate-in fade-in duration-500 px-1">
      {/* Toast */}
      {toast && (
        <div
          className={clsx(
            "fixed top-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2 animate-in slide-in-from-top-2 duration-300",
            toast.type === "success"
              ? "bg-emerald-600 text-white"
              : "bg-stone-700 text-white"
          )}
        >
          {toast.type === "success" ? (
            <CheckCircle2 className="w-4 h-4" />
          ) : (
            <AlertTriangle className="w-4 h-4" />
          )}
          {toast.message}
        </div>
      )}

      {/* ---- Paywall Banner (shown after beta ends if redirected here) ---- */}
      {isPaywallRedirect && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-5 sm:p-6 mb-6 text-center">
          <p className="text-lg font-bold text-amber-900 mb-1">
            Beta Has Ended — Subscribe to Continue
          </p>
          <p className="text-sm text-amber-800 leading-relaxed">
            Your free beta access ended on May 9, 2026. Pick a plan below to restore full access.
            Beta feedback users keep their <span className="font-bold">$149/mo locked-in</span> rate.
          </p>
        </div>
      )}

      {/* ---- Beta Banner ---- */}
      <div className="bg-emerald-50 border-2 border-emerald-300 rounded-2xl p-5 sm:p-6 mb-8 text-center">
        <p className="text-lg font-bold text-emerald-800 mb-1">
          PUBLIC BETA — ALL FEATURES FREE
        </p>
        <p className="text-sm text-emerald-700 leading-relaxed">
          You have full access to every Pro feature during our public beta.
          <br className="hidden sm:block" />
          Beta ends <span className="font-bold">May 9, 2026</span> (our founder Andre Schuler&apos;s birthday).
          Beta users who provide feedback get{" "}
          <span className="font-bold">$149/mo locked-in pricing</span> (25% off forever).
        </p>
      </div>

      {/* ---- Header ---- */}
      <header className="mb-8 text-center">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tighter text-black flex items-center justify-center">
          <CreditCard className="mr-2 sm:mr-3 w-6 h-6 sm:w-8 sm:h-8" />
          Billing &amp; Plans
        </h2>
        <p className="text-stone-500 mt-1 font-medium text-sm">
          Current plan:{" "}
          <span className="font-semibold text-stone-700">{planDisplayName}</span>
        </p>
      </header>

      {/* ---- Current Subscription Card (subscribed users) ---- */}
      {isSubscribed && (
        <div className="bg-white rounded-2xl border border-emerald-200 shadow-sm p-6 sm:p-8 mb-8">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-[10px] text-stone-400 uppercase tracking-widest mb-1">
                Your Plan
              </p>
              <h3 className="text-2xl font-bold text-stone-900">Pro</h3>
            </div>
            <StatusBadge status={billing.subscriptionStatus} />
          </div>

          {/* Trial countdown */}
          {billing.subscriptionStatus === "trialing" &&
            billing.trialDaysLeft !== null && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
                <p className="text-sm text-blue-800 font-medium">
                  {billing.trialDaysLeft} day{billing.trialDaysLeft !== 1 ? "s" : ""}{" "}
                  remaining in your free trial
                </p>
                <p className="text-xs text-blue-600 mt-0.5">
                  Full Pro features are unlocked until your trial ends.
                </p>
              </div>
            )}

          {/* Past due warning */}
          {billing.subscriptionStatus === "past_due" && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span className="text-sm font-bold text-amber-800">
                  Payment failed
                </span>
              </div>
              <p className="text-xs text-amber-700">
                Please update your payment method to avoid losing access.
              </p>
            </div>
          )}

          {/* Next billing date */}
          {billing.nextBillingDate && (
            <p className="text-xs text-stone-500 mb-4">
              Next billing date:{" "}
              <span className="font-medium text-stone-700">
                {new Date(billing.nextBillingDate).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            </p>
          )}

          {/* Feature list */}
          <div className="space-y-2 mb-6">
            {PRO_FEATURES.slice(1).map((f) => (
              <div key={f} className="flex items-center gap-2 text-sm text-stone-700">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                {f}
              </div>
            ))}
          </div>

          {/* Manage button */}
          {billing.stripeCustomerId && (
            <button
              type="button"
              onClick={handleManage}
              disabled={managingPortal}
              className="inline-flex items-center bg-stone-100 text-stone-700 font-bold px-6 py-3 rounded-full text-sm hover:bg-stone-200 transition-all border border-stone-200 disabled:opacity-50"
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
      )}

      {/* ---- Consulting Status Card ---- */}
      {isConsulting && (
        <div className="bg-white rounded-2xl border border-emerald-200 shadow-sm p-6 sm:p-8 mb-8">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-[10px] text-stone-400 uppercase tracking-widest mb-1">
                Your Plan
              </p>
              <h3 className="text-2xl font-bold text-stone-900">Consulting</h3>
            </div>
            <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold uppercase">
              Managed
            </span>
          </div>
          <p className="text-sm text-stone-600 mb-4">
            Your account is managed by our consulting team. Contact your account
            manager for billing questions.
          </p>
          <div className="space-y-2">
            {CONSULTING_FEATURES.map((f) => (
              <div key={f} className="flex items-center gap-2 text-sm text-stone-700">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                {f}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---- Pricing Cards (free / unsubscribed users) ---- */}
      {showPricingCards && (
        <div className="mb-10">
          {/* Monthly / Yearly toggle */}
          <div className="flex items-center justify-center gap-3 mb-8">
            <button
              type="button"
              onClick={() => setInterval("monthly")}
              className={clsx(
                "px-5 py-2 rounded-full text-sm font-bold transition-all",
                interval === "monthly"
                  ? "bg-emerald-600 text-white shadow-md"
                  : "bg-stone-100 text-stone-600 hover:bg-stone-200 border border-stone-200"
              )}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setInterval("yearly")}
              className={clsx(
                "px-5 py-2 rounded-full text-sm font-bold transition-all",
                interval === "yearly"
                  ? "bg-emerald-600 text-white shadow-md"
                  : "bg-stone-100 text-stone-600 hover:bg-stone-200 border border-stone-200"
              )}
            >
              Yearly
              {interval !== "yearly" && (
                <span className="ml-1.5 text-[10px] text-emerald-600 font-bold">
                  SAVE 20%
                </span>
              )}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6">
            {/* ---------- Free Card ---------- */}
            <div className="rounded-2xl border border-stone-200 bg-white shadow-sm flex flex-col overflow-hidden">
              <div className="p-6 flex-1 flex flex-col">
                <p className="font-bold text-xs uppercase tracking-wider text-stone-500 mb-2">
                  Free
                </p>
                <div className="mb-1">
                  <span className="text-4xl font-bold text-stone-900">$0</span>
                  <span className="text-sm text-stone-500 ml-1">/mo</span>
                </div>
                <p className="text-xs text-stone-500 mb-5">
                  Get started with federal contracting
                </p>

                <ul className="space-y-2.5 mb-6 flex-1">
                  {FREE_FEATURES.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-stone-400 flex-shrink-0 mt-0.5" />
                      <span className="text-stone-700">{f}</span>
                    </li>
                  ))}
                </ul>

                {billing.subscriptionStatus === "free" && (
                  <div className="w-full py-2.5 rounded-full font-bold text-xs text-center bg-stone-100 text-stone-400 border border-stone-200">
                    Current Plan
                  </div>
                )}
              </div>
            </div>

            {/* ---------- Pro Card ---------- */}
            <div className="rounded-2xl border-2 border-emerald-500 bg-white shadow-xl flex flex-col overflow-hidden relative">
              {/* Most Popular badge */}
              <div className="absolute top-0 right-0 bg-emerald-500 text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl flex items-center gap-1">
                <Star className="w-3 h-3" /> MOST POPULAR
              </div>
              <div className="p-6 flex-1 flex flex-col">
                <p className="font-bold text-xs uppercase tracking-wider text-emerald-600 mb-2">
                  Pro
                </p>
                <div className="mb-1">
                  <span className="text-4xl font-bold text-stone-900">
                    ${proPrice}
                  </span>
                  <span className="text-sm text-stone-500 ml-1">/mo</span>
                </div>
                {interval === "yearly" ? (
                  <div className="flex items-center gap-2 mb-5">
                    <span className="text-xs text-stone-500">
                      ${yearlyTotal.toLocaleString()}/yr
                    </span>
                    <span className="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
                      SAVE 20%
                    </span>
                  </div>
                ) : (
                  <p className="text-xs text-stone-500 mb-5">
                    Billed monthly
                  </p>
                )}

                <ul className="space-y-2.5 mb-6 flex-1">
                  {PRO_FEATURES.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                      <span className="text-stone-700">{f}</span>
                    </li>
                  ))}
                </ul>

                <div
                  className="w-full py-3 rounded-full font-bold text-sm bg-emerald-600 text-white text-center shadow-md cursor-default"
                >
                  <span className="flex items-center justify-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    You Have Full Access
                  </span>
                </div>
                <p className="text-[11px] text-stone-500 text-center mt-2.5 font-medium">
                  After beta: $199/mo standard or $149/mo locked-in for beta feedback users (25% off forever)
                </p>
              </div>
            </div>

            {/* ---------- Consulting Card ---------- */}
            <div className="rounded-2xl border border-stone-200 bg-white shadow-sm flex flex-col overflow-hidden relative">
              {/* Done-For-You badge */}
              <div className="absolute top-0 right-0 bg-stone-800 text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl">
                DONE-FOR-YOU
              </div>
              <div className="p-6 flex-1 flex flex-col">
                <p className="font-bold text-xs uppercase tracking-wider text-stone-500 mb-2">
                  Consulting
                </p>
                <div className="mb-1">
                  <span className="text-lg font-bold text-stone-900">From</span>
                  <span className="text-4xl font-bold text-stone-900 ml-2">
                    $2,500
                  </span>
                  <span className="text-sm text-stone-500 ml-1">/mo</span>
                </div>
                <p className="text-xs text-stone-500 mb-5">
                  We win contracts for you
                </p>

                <ul className="space-y-2.5 mb-6 flex-1">
                  {CONSULTING_FEATURES.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                      <span className="text-stone-700">{f}</span>
                    </li>
                  ))}
                </ul>

                <a
                  href="https://meetings-na2.hubspot.com/americurial/intro-call"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-3 rounded-full font-bold text-sm bg-stone-900 text-white hover:bg-stone-800 transition-all text-center flex items-center justify-center gap-2"
                >
                  <Phone className="w-4 h-4" />
                  Book Qualification Call
                </a>
                <p className="text-[11px] text-stone-400 text-center mt-2.5">
                  We only take clients we can win for.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---- FAQ Section ---- */}
      <div className="max-w-2xl mx-auto mt-4">
        <h3 className="font-bold text-sm uppercase tracking-widest text-stone-500 text-center mb-6">
          Frequently Asked Questions
        </h3>
        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm px-6">
          {FAQ_ITEMS.map((item) => (
            <FAQItem key={item.q} q={item.q} a={item.a} />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page export — Suspense boundary for useSearchParams               */
/* ------------------------------------------------------------------ */

export default function BillingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center items-center min-h-[400px]">
          <Loader2 className="w-10 h-10 animate-spin text-stone-400" />
        </div>
      }
    >
      <BillingPageContent />
    </Suspense>
  );
}
