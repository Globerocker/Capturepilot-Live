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
    const [displayName, setDisplayName] = useState("");
    const startedRef = useRef(false);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const companyName = searchParams.get("company_name") || "";
    const website = searchParams.get("website") || "";
    const uei = searchParams.get("uei") || "";

    function getDomain(url: string): string {
        try { return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(/^www\./, ""); } catch { return url; }
    }

    const stopPolling = useCallback(() => {
        if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
        }
    }, []);

    // Poll the status endpoint for real progress
    const startPolling = useCallback((id: string) => {
        stopPolling();

        pollRef.current = setInterval(async () => {
            try {
                const res = await fetch(`/api/analyze-company/status/${id}`);
                if (!res.ok) return;
                const data = await res.json();

                // Update display name when crawler detects it
                if (data.company_name && data.company_name.length > 1) {
                    const domain = getDomain(website);
                    if (data.company_name !== domain) {
                        setDisplayName(data.company_name);
                    }
                }

                if (data.status === "error") {
                    stopPolling();
                    setError(data.error_message || "Analysis failed. Please try again.");
                    return;
                }

                const newStep = statusToStep(data.status);
                setStep(newStep);

                if (data.status === "complete") {
                    stopPolling();
                    router.push(`/analyze/${id}`);
                }
            } catch {
                // Ignore transient poll errors
            }
        }, 2000);
    }, [router, stopPolling, website]);

    useEffect(() => {
        if (startedRef.current) return;
        if (!website && !uei) {
            router.push("/");
            return;
        }
        startedRef.current = true;
        setDisplayName(companyName || (website ? getDomain(website) : "") || uei);

        // POST to API — returns analysis_id immediately, processes in background
        fetch("/api/analyze-company", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                company_name: companyName || undefined,
                website: website || undefined,
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
                if (data.analysis_id) {
                    startPolling(data.analysis_id);
                } else {
                    setError("Failed to start analysis.");
                }
            })
            .catch((err) => {
                setError(err.message || "Something went wrong. Please try again.");
            });

        return () => stopPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [website]);

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
                        Analyzing {displayName}
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
