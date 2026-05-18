"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2, CheckCircle2, AlertCircle, Mail } from "lucide-react";

/**
 * Stripe success bridge. After payment Stripe sends users to:
 *   /startup-pack/success?aid=<analysis_id>&session_id=<cs_test_...>
 *
 * We poll our API for ~30s until the webhook has written the access_token,
 * then redirect to /startup-pack/download/<token>.
 *
 * The poll-then-redirect pattern avoids a race condition where the user lands
 * before Stripe has actually delivered the webhook.
 */
function SuccessContent() {
    const router = useRouter();
    const params = useSearchParams();
    const sessionId = params.get("session_id") || "";
    const analysisId = params.get("aid") || "";

    const [stage, setStage] = useState<"polling" | "done" | "timeout" | "error">("polling");
    const [error, setError] = useState("");

    useEffect(() => {
        if (!sessionId && !analysisId) {
            setStage("error");
            setError("Missing session reference. If you just completed payment, check your email for the download link.");
            return;
        }

        let cancelled = false;
        const started = Date.now();
        const maxMs = 30_000;

        const poll = async () => {
            if (cancelled) return;
            try {
                const res = await fetch(`/api/startup-pack/lookup?session_id=${encodeURIComponent(sessionId)}&analysis_id=${encodeURIComponent(analysisId)}`, {
                    cache: "no-store",
                });
                const data = await res.json();
                if (data?.access_token) {
                    setStage("done");
                    router.replace(`/startup-pack/download/${data.access_token}`);
                    return;
                }
            } catch { /* ignore — retry */ }

            if (Date.now() - started > maxMs) {
                setStage("timeout");
                return;
            }
            setTimeout(poll, 1500);
        };

        poll();

        return () => { cancelled = true; };
    }, [sessionId, analysisId, router]);

    if (stage === "timeout") {
        return (
            <div className="bg-white border border-stone-200 rounded-[28px] p-8 max-w-md text-center shadow-sm">
                <Mail className="w-10 h-10 text-amber-500 mx-auto mb-3" />
                <h1 className="font-bold text-lg">Payment successful — almost there</h1>
                <p className="text-sm text-stone-500 mt-2">
                    Your purchase is confirmed but our system is taking a moment to provision your access.
                    Your confirmation email has the same download link — check your inbox in the next minute.
                </p>
                <a
                    href="mailto:support@capturepilot.com"
                    className="mt-5 inline-block text-xs font-bold text-emerald-700 hover:underline"
                >
                    Email support if you don&apos;t see it
                </a>
            </div>
        );
    }

    if (stage === "error") {
        return (
            <div className="bg-white border border-stone-200 rounded-[28px] p-8 max-w-md text-center shadow-sm">
                <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
                <h1 className="font-bold text-lg">Something went sideways</h1>
                <p className="text-sm text-stone-500 mt-2">{error}</p>
                <Link href="/check" className="mt-5 inline-block bg-black text-white px-5 py-2.5 rounded-2xl font-bold text-sm">
                    Back to Quick Check
                </Link>
            </div>
        );
    }

    return (
        <div className="bg-white border border-stone-200 rounded-[28px] p-8 max-w-md text-center shadow-sm">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 className="w-6 h-6 text-emerald-600" />
            </div>
            <h1 className="font-bold text-lg">Payment received</h1>
            <p className="text-sm text-stone-500 mt-2">
                Provisioning your Startup Pack download library…
            </p>
            <Loader2 className="w-6 h-6 text-stone-400 animate-spin mx-auto mt-5" />
        </div>
    );
}

export default function StartupPackSuccessPage() {
    return (
        <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4">
            <Suspense fallback={<Loader2 className="w-8 h-8 text-stone-400 animate-spin" />}>
                <SuccessContent />
            </Suspense>
        </div>
    );
}
