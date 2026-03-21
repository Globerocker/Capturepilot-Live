"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Zap } from "lucide-react";
import { AnalysisProgressStepper } from "@/components/AnalysisProgressStepper";

function AnalyzeContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [step, setStep] = useState(0);
    const [error, setError] = useState("");
    const startedRef = useRef(false);

    const companyName = searchParams.get("company_name") || "";
    const website = searchParams.get("website") || "";
    const uei = searchParams.get("uei") || "";

    useEffect(() => {
        if (startedRef.current) return;
        if (!companyName || !website) {
            router.push("/");
            return;
        }
        startedRef.current = true;

        // Animate progress steps on a timer while API call runs
        const stepTimers = [
            setTimeout(() => setStep(1), 5000),
            setTimeout(() => setStep(2), 12000),
            setTimeout(() => setStep(3), 20000),
        ];

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
                stepTimers.forEach(clearTimeout);
                if (data.analysis_id) {
                    router.push(`/analyze/${data.analysis_id}`);
                } else {
                    setError("Analysis completed but no results were returned.");
                }
            })
            .catch((err) => {
                stepTimers.forEach(clearTimeout);
                setError(err.message || "Something went wrong. Please try again.");
            });

        return () => stepTimers.forEach(clearTimeout);
    }, [companyName, website, uei, router]);

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
                        This usually takes 30-60 seconds...
                    </p>
                </div>

                <AnalysisProgressStepper currentStep={step} />

                <p className="text-[10px] text-stone-400 text-center mt-6">
                    We&apos;re crawling your website and matching against federal opportunities.
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
