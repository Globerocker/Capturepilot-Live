"use client";

import { useEffect, useState, useRef, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Zap } from "lucide-react";
import { AnalysisProgressStepper, statusToStep } from "@/components/AnalysisProgressStepper";

function AnalyzeContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [step, setStep] = useState(0);
    const [error, setError] = useState("");
    const startedRef = useRef(false);
    const analysisIdRef = useRef<string | null>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const companyName = searchParams.get("company_name") || "";
    const website = searchParams.get("website") || "";
    const uei = searchParams.get("uei") || "";

    // Poll status from DB for real progress updates
    const pollStatus = useCallback(() => {
        const id = analysisIdRef.current;
        if (!id) return;

        pollRef.current = setInterval(async () => {
            try {
                const res = await fetch(`/api/analyze-company/status/${id}`);
                if (!res.ok) return;
                const data = await res.json();
                const newStep = statusToStep(data.status);
                setStep(newStep);

                if (data.status === "complete") {
                    if (pollRef.current) clearInterval(pollRef.current);
                    router.push(`/analyze/${id}`);
                }
            } catch {
                // Ignore poll errors, the main API call will handle failures
            }
        }, 2000);
    }, [router]);

    useEffect(() => {
        if (startedRef.current) return;
        if (!companyName || !website) {
            router.push("/");
            return;
        }
        startedRef.current = true;

        // Fallback timer: ensure at least step 0 shows immediately
        const fallbackTimer = setTimeout(() => {
            if (step === 0) setStep(0); // Keep at crawling
        }, 1000);

        // Call the API
        fetch("/api/analyze-company", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                company_name: companyName,
                website,
                uei: uei || undefined,
            }),
        })
            .then(async (res) => {
                if (!res.ok) {
                    const data = await res.json().catch(() => ({}));
                    throw new Error(data.error || `Analysis failed (${res.status})`);
                }
                return res.json();
            })
            .then((data) => {
                clearTimeout(fallbackTimer);
                if (pollRef.current) clearInterval(pollRef.current);
                if (data.analysis_id) {
                    setStep(5); // All complete
                    router.push(`/analyze/${data.analysis_id}`);
                } else {
                    setError("Analysis completed but no results were returned.");
                }
            })
            .catch((err) => {
                clearTimeout(fallbackTimer);
                if (pollRef.current) clearInterval(pollRef.current);
                setError(err.message || "Something went wrong. Please try again.");
            });

        return () => {
            clearTimeout(fallbackTimer);
            if (pollRef.current) clearInterval(pollRef.current);
        };
    }, [companyName, website, uei, router, step, pollStatus]);

    // Start polling once we have an analysis ID (from initial insert)
    // We get the ID early since the API creates the record before starting the crawl
    useEffect(() => {
        if (!startedRef.current || analysisIdRef.current) return;

        // Poll for any recent analysis for this company
        const checkForId = async () => {
            try {
                // The main API call will return the ID when done.
                // For now, use a timer-based fallback for the first ~15 seconds (crawl phase)
                const timers = [
                    setTimeout(() => setStep(prev => Math.max(prev, 1)), 15000), // enriching after 15s
                    setTimeout(() => setStep(prev => Math.max(prev, 2)), 25000), // classifying after 25s
                    setTimeout(() => setStep(prev => Math.max(prev, 3)), 35000), // scoring after 35s
                    setTimeout(() => setStep(prev => Math.max(prev, 4)), 45000), // generating after 45s
                ];
                return () => timers.forEach(clearTimeout);
            } catch {
                // ignore
            }
        };
        checkForId();
    }, []);

    if (error) {
        return (
            <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4">
                <div className="max-w-md mx-auto text-center">
                    <div className="bg-white rounded-[32px] border border-stone-200 shadow-lg p-8 sm:p-10">
                        <div className="w-12 h-12 rounded-2xl bg-red-100 flex items-center justify-center mx-auto mb-4">
                            <Zap className="w-6 h-6 text-red-500" />
                        </div>
                        <h2 className="font-typewriter font-bold text-lg mb-2">Analysis Failed</h2>
                        <p className="text-sm text-stone-500 mb-6">{error}</p>
                        <button
                            type="button"
                            onClick={() => router.push("/")}
                            className="bg-black text-white font-bold text-sm px-6 py-3 rounded-2xl hover:bg-stone-800 transition-all"
                        >
                            Try Again
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4">
            <div className="max-w-md mx-auto w-full">
                <div className="text-center mb-8">
                    <div className="flex items-center justify-center gap-2 mb-4">
                        <Zap className="w-6 h-6 text-black" />
                        <span className="font-typewriter font-bold text-lg">CapturePilot</span>
                    </div>
                    <h2 className="font-typewriter font-bold text-xl sm:text-2xl mb-2">
                        Analyzing {companyName}
                    </h2>
                    <p className="text-sm text-stone-500">
                        Deep crawl in progress — this takes 30-90 seconds...
                    </p>
                </div>

                <AnalysisProgressStepper currentStep={step} />

                <p className="text-[10px] text-stone-400 text-center mt-6">
                    Crawling your website, checking federal databases & finding matching opportunities.
                </p>
            </div>
        </div>
    );
}

export default function AnalyzePage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-stone-50 flex items-center justify-center">
                <div className="text-center">
                    <Zap className="w-8 h-8 text-stone-300 mx-auto mb-3 animate-pulse" />
                    <p className="text-stone-500 font-typewriter">Loading...</p>
                </div>
            </div>
        }>
            <AnalyzeContent />
        </Suspense>
    );
}
