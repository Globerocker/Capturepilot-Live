"use client";

import { useState, Suspense, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Zap, Building, Globe, Search, Loader2 } from "lucide-react";
import { AnalysisProgressStepper } from "@/components/AnalysisProgressStepper";

function CheckContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [companyName, setCompanyName] = useState("");
    const [website, setWebsite] = useState("");
    const [uei, setUei] = useState("");
    const [running, setRunning] = useState(false);
    const [step, setStep] = useState(0);
    const [error, setError] = useState("");
    const startedRef = useRef(false);

    // If query params provided, auto-start analysis
    const autoName = searchParams.get("company_name") || "";
    const autoWebsite = searchParams.get("website") || "";
    const autoUei = searchParams.get("uei") || "";

    useEffect(() => {
        if (startedRef.current) return;
        if (autoName && autoWebsite) {
            startedRef.current = true;
            setCompanyName(autoName);
            setWebsite(autoWebsite);
            setUei(autoUei);
            runAnalysis(autoName, autoWebsite, autoUei);
        }
    }, [autoName, autoWebsite, autoUei]);

    function runAnalysis(name: string, site: string, ueiVal: string) {
        setRunning(true);
        setError("");
        setStep(0);

        const stepTimers = [
            setTimeout(() => setStep(1), 5000),
            setTimeout(() => setStep(2), 12000),
            setTimeout(() => setStep(3), 20000),
        ];

        fetch("/api/analyze-company", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                company_name: name,
                website: site,
                uei: ueiVal || undefined,
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
                    router.push(`/check/${data.analysis_id}`);
                } else {
                    setError("Analysis completed but no results returned.");
                    setRunning(false);
                }
            })
            .catch((err) => {
                stepTimers.forEach(clearTimeout);
                setError(err.message || "Something went wrong.");
                setRunning(false);
            });
    }

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!companyName.trim() || !website.trim()) return;
        let url = website.trim();
        if (!/^https?:\/\//i.test(url)) url = "https://" + url;
        runAnalysis(companyName.trim(), url, uei.trim());
    }

    if (running) {
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
                        <p className="text-sm text-stone-500">This usually takes 30-60 seconds...</p>
                    </div>
                    <AnalysisProgressStepper currentStep={step} />
                    {error && (
                        <div className="mt-6 bg-red-50 border border-red-200 rounded-2xl p-4 text-center">
                            <p className="text-sm text-red-600 mb-3">{error}</p>
                            <button onClick={() => { setRunning(false); setError(""); }} className="bg-black text-white px-5 py-2 rounded-xl text-sm font-bold">
                                Try Again
                            </button>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4">
            <div className="w-full max-w-lg">
                <div className="text-center mb-8">
                    <div className="flex items-center justify-center gap-2 mb-3">
                        <div className="w-10 h-10 rounded-xl bg-black flex items-center justify-center">
                            <Zap className="w-5 h-5 text-white" />
                        </div>
                        <span className="font-typewriter font-bold text-xl">CapturePilot</span>
                    </div>
                    <h1 className="font-typewriter font-bold text-2xl sm:text-3xl mb-2">
                        Quick Lead Check
                    </h1>
                    <p className="text-sm text-stone-500">
                        Enter a company&apos;s details to instantly find matching government contracts.
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="bg-white rounded-[28px] border border-stone-200 shadow-sm p-6 sm:p-8 space-y-4">
                    <div>
                        <label className="block text-xs font-typewriter font-bold text-stone-500 uppercase tracking-widest mb-1.5">
                            Company Name *
                        </label>
                        <div className="relative">
                            <Building className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                            <input
                                type="text"
                                value={companyName}
                                onChange={(e) => setCompanyName(e.target.value)}
                                className="w-full pl-10 pr-4 py-3 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-stone-400"
                                placeholder="Acme Services LLC"
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-typewriter font-bold text-stone-500 uppercase tracking-widest mb-1.5">
                            Website *
                        </label>
                        <div className="relative">
                            <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                            <input
                                type="text"
                                value={website}
                                onChange={(e) => setWebsite(e.target.value)}
                                className="w-full pl-10 pr-4 py-3 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-stone-400"
                                placeholder="www.acmeservices.com"
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-typewriter font-bold text-stone-500 uppercase tracking-widest mb-1.5">
                            UEI <span className="text-stone-300 normal-case">(optional)</span>
                        </label>
                        <div className="relative">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                            <input
                                type="text"
                                value={uei}
                                onChange={(e) => setUei(e.target.value.toUpperCase())}
                                className="w-full pl-10 pr-4 py-3 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-stone-400 font-mono"
                                placeholder="ABC123DEF456"
                                maxLength={12}
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="bg-red-50 text-red-600 text-xs p-3 rounded-xl border border-red-200">
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        className="w-full bg-black text-white py-3.5 rounded-2xl font-bold text-sm hover:bg-stone-800 transition-all flex items-center justify-center gap-2"
                    >
                        <Zap className="w-4 h-4" /> Analyze & Find Matches
                    </button>
                </form>

                <p className="text-[10px] text-stone-400 text-center mt-4">
                    Internal partner tool — all matches shown without gate.
                </p>
            </div>
        </div>
    );
}

export default function CheckPage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-stone-50"><Loader2 className="w-8 h-8 animate-spin text-stone-400" /></div>}>
            <CheckContent />
        </Suspense>
    );
}
