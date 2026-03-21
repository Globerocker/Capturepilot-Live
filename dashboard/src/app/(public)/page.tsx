"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Zap, Globe, Search, Target, Shield, CheckCircle2, ArrowRight, Building } from "lucide-react";
import Link from "next/link";
import { InfoTooltip } from "@/components/ui/InfoTooltip";

export default function LandingPage() {
    const router = useRouter();
    const [companyName, setCompanyName] = useState("");
    const [website, setWebsite] = useState("");
    const [uei, setUei] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const handleAnalyze = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        if (!companyName.trim()) {
            setError("Company name is required.");
            return;
        }
        if (!website.trim()) {
            setError("Website URL is required.");
            return;
        }

        // Basic URL validation
        let url = website.trim();
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
            url = "https://" + url;
        }
        try {
            new URL(url);
        } catch {
            setError("Please enter a valid website URL.");
            return;
        }

        // UEI validation (if provided)
        if (uei.trim() && !/^[A-Za-z0-9]{12}$/.test(uei.trim())) {
            setError("UEI must be exactly 12 alphanumeric characters.");
            return;
        }

        setLoading(true);

        // Navigate to analyze page with query params
        const params = new URLSearchParams({
            company_name: companyName.trim(),
            website: url,
        });
        if (uei.trim()) params.set("uei", uei.trim().toUpperCase());

        router.push(`/analyze?${params.toString()}`);
    };

    return (
        <div className="min-h-screen bg-stone-50 flex flex-col">
            {/* Header */}
            <header className="px-6 py-4 flex items-center justify-between max-w-6xl mx-auto w-full">
                <div className="flex items-center space-x-2">
                    <Zap className="w-6 h-6 text-black" />
                    <span className="font-typewriter font-bold text-lg tracking-tight">CapturePilot</span>
                </div>
                <Link href="/login" className="text-sm font-typewriter font-bold text-stone-500 hover:text-black transition-colors">
                    Sign In
                </Link>
            </header>

            {/* Hero */}
            <main className="flex-1 flex flex-col items-center justify-center px-4 py-12 sm:py-20">
                <div className="max-w-2xl mx-auto text-center mb-8 sm:mb-12">
                    <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-black leading-tight mb-4 sm:mb-6">
                        Find Government Contracts
                        <br />
                        <span className="text-stone-400">That Fit Your Business</span>
                    </h1>
                    <p className="text-stone-500 text-base sm:text-lg max-w-lg mx-auto">
                        Enter your company details and we&apos;ll instantly analyze your federal contracting potential and find matching opportunities.
                    </p>
                </div>

                {/* Form Card */}
                <div className="w-full max-w-lg mx-auto">
                    <form onSubmit={handleAnalyze} className="bg-white rounded-[32px] border border-stone-200 shadow-lg p-6 sm:p-10 space-y-5">
                        <div>
                            <label className="text-[10px] font-typewriter text-stone-500 uppercase tracking-widest mb-2 block">
                                Company Name *
                            </label>
                            <div className="relative">
                                <Building className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                                <input
                                    type="text"
                                    value={companyName}
                                    onChange={(e) => setCompanyName(e.target.value)}
                                    placeholder="Acme Cleaning Services LLC"
                                    className="w-full bg-stone-50 border border-stone-200 rounded-2xl pl-11 pr-4 py-3.5 text-sm outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all"
                                    required
                                />
                            </div>
                        </div>

                        <div>
                            <label className="text-[10px] font-typewriter text-stone-500 uppercase tracking-widest mb-2 block">
                                Website *
                            </label>
                            <div className="relative">
                                <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                                <input
                                    type="text"
                                    value={website}
                                    onChange={(e) => setWebsite(e.target.value)}
                                    placeholder="www.acmecleaning.com"
                                    className="w-full bg-stone-50 border border-stone-200 rounded-2xl pl-11 pr-4 py-3.5 text-sm outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all"
                                    required
                                />
                            </div>
                        </div>

                        <div>
                            <label className="text-[10px] font-typewriter text-stone-500 uppercase tracking-widest mb-2 block">
                                UEI (Optional)
                                <InfoTooltip text="Your Unique Entity Identifier from SAM.gov. If provided, we'll pull your full registration data including certifications and NAICS codes." />
                            </label>
                            <input
                                type="text"
                                value={uei}
                                onChange={(e) => setUei(e.target.value.toUpperCase())}
                                placeholder="ABC123456789"
                                maxLength={12}
                                className="w-full bg-stone-50 border border-stone-200 rounded-2xl px-4 py-3.5 text-sm outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all font-mono"
                            />
                        </div>

                        {error && (
                            <p className="text-red-600 text-sm font-medium bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
                                {error}
                            </p>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-black text-white font-bold font-typewriter text-sm py-4 rounded-2xl hover:bg-stone-800 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                        >
                            {loading ? (
                                <>Redirecting...</>
                            ) : (
                                <>
                                    <Zap className="w-4 h-4" />
                                    Analyze My Business
                                </>
                            )}
                        </button>

                        <p className="text-[10px] text-stone-400 text-center">
                            Free analysis. No account required. Results in 30 seconds.
                        </p>
                    </form>
                </div>

                {/* Benefits */}
                <div className="max-w-2xl mx-auto mt-12 sm:mt-16 grid grid-cols-1 sm:grid-cols-2 gap-4 px-4">
                    {[
                        { icon: Search, title: "Auto-Detect Services", desc: "We crawl your website and extract your services, certifications, and capabilities." },
                        { icon: Target, title: "NAICS Classification", desc: "Our algorithm infers your top NAICS codes so you never miss a relevant contract." },
                        { icon: Zap, title: "Instant Matching", desc: "See government opportunities that align with your business profile in seconds." },
                        { icon: Shield, title: "GovCon Readiness", desc: "Identify gaps in your SAM.gov registration and improve your competitive position." },
                    ].map((item) => (
                        <div key={item.title} className="flex items-start gap-3 bg-white rounded-2xl border border-stone-200 p-5">
                            <div className="w-9 h-9 rounded-xl bg-stone-100 flex items-center justify-center flex-shrink-0">
                                <item.icon className="w-4 h-4 text-stone-600" />
                            </div>
                            <div>
                                <p className="font-bold text-sm text-black mb-1">{item.title}</p>
                                <p className="text-xs text-stone-500 leading-relaxed">{item.desc}</p>
                            </div>
                        </div>
                    ))}
                </div>

                {/* How It Works */}
                <div className="max-w-2xl mx-auto mt-12 sm:mt-16 text-center px-4">
                    <h2 className="font-typewriter font-bold text-lg mb-8 text-stone-800">How It Works</h2>
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-6 sm:gap-4">
                        {[
                            { step: "1", title: "Enter Your Details", desc: "Company name and website" },
                            { step: "2", title: "We Analyze", desc: "AI-powered company profiling" },
                            { step: "3", title: "See Matches", desc: "Instant contract opportunities" },
                        ].map((item, i) => (
                            <div key={item.step} className="flex sm:flex-col items-center gap-3 sm:gap-2">
                                <div className="w-10 h-10 rounded-full bg-black text-white font-typewriter font-bold flex items-center justify-center text-sm flex-shrink-0">
                                    {item.step}
                                </div>
                                <div className="text-left sm:text-center">
                                    <p className="font-bold text-sm text-black">{item.title}</p>
                                    <p className="text-xs text-stone-500">{item.desc}</p>
                                </div>
                                {i < 2 && <ArrowRight className="w-4 h-4 text-stone-300 hidden sm:block mx-2" />}
                            </div>
                        ))}
                    </div>
                </div>

                {/* CTA */}
                <div className="mt-12 sm:mt-16 text-center">
                    <p className="text-sm text-stone-500">
                        Already have an account?{" "}
                        <Link href="/login" className="font-bold text-black hover:underline">
                            Sign In
                        </Link>
                    </p>
                </div>
            </main>

            {/* Footer */}
            <footer className="px-6 py-6 text-center border-t border-stone-200">
                <div className="flex items-center justify-center gap-1 text-xs text-stone-400">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Powered by SAM.gov data</span>
                    <span className="mx-2">|</span>
                    <Link href="/privacy" className="hover:text-stone-600">Privacy</Link>
                    <span className="mx-2">|</span>
                    <Link href="/terms" className="hover:text-stone-600">Terms</Link>
                </div>
            </footer>
        </div>
    );
}
