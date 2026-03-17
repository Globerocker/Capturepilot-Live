import Link from "next/link";
import { Zap, Target, BarChart3, Mail, Layers, Shield, ArrowRight, CheckCircle2 } from "lucide-react";

const FEATURES = [
    { icon: Target, title: "Smart Matching", desc: "15+ criteria scoring engine finds contracts that fit your NAICS, certifications, and capabilities." },
    { icon: BarChart3, title: "AI Win Strategies", desc: "Get AI-powered competitive analysis and capture strategies for every opportunity." },
    { icon: Mail, title: "AI Email Drafts", desc: "Generate professional outreach emails tailored to each opportunity in seconds." },
    { icon: Layers, title: "Pipeline Management", desc: "Track opportunities from discovery through proposal with a visual pipeline." },
    { icon: Shield, title: "Capture Intelligence", desc: "Incumbent analysis, award history, and competitive landscape data from SAM.gov." },
    { icon: Zap, title: "Daily Automation", desc: "New opportunities ingested, scored, and matched to your profile every day automatically." },
];

const STATS = [
    { value: "4,000+", label: "Opportunities Tracked" },
    { value: "15+", label: "Matching Criteria" },
    { value: "6", label: "AI Letter Types" },
    { value: "24hr", label: "Auto-Refresh Cycle" },
];

export default function LandingPage() {
    return (
        <div className="min-h-screen bg-stone-50 text-stone-900">
            {/* Nav */}
            <nav className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                    <div className="w-9 h-9 rounded-xl bg-black flex items-center justify-center shadow-lg">
                        <Zap className="h-4 w-4 text-white" />
                    </div>
                    <span className="text-xl font-bold font-typewriter">CapturePilot</span>
                </div>
                <div className="flex items-center space-x-3">
                    <Link href="/pricing" className="text-sm font-medium text-stone-600 hover:text-black transition-colors px-3 py-2">
                        Pricing
                    </Link>
                    <Link href="/login" className="text-sm font-medium text-stone-600 hover:text-black transition-colors px-3 py-2">
                        Sign In
                    </Link>
                    <Link href="/signup" className="bg-black text-white text-sm font-bold px-5 py-2.5 rounded-full hover:bg-stone-800 transition-colors">
                        Start Free Trial
                    </Link>
                </div>
            </nav>

            {/* Hero */}
            <section className="max-w-4xl mx-auto px-6 pt-16 sm:pt-24 pb-16 text-center">
                <div className="inline-flex items-center bg-emerald-100 text-emerald-800 text-xs font-typewriter font-bold uppercase tracking-widest px-4 py-1.5 rounded-full mb-6">
                    <Zap className="w-3 h-3 mr-1.5" /> Built for Small Business
                </div>
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold font-typewriter tracking-tighter leading-tight mb-6">
                    Win Federal Contracts.<br />
                    <span className="text-stone-400">Smarter.</span>
                </h1>
                <p className="text-lg sm:text-xl text-stone-500 max-w-2xl mx-auto mb-10 leading-relaxed">
                    CapturePilot matches your business to government opportunities using 15+ criteria, then gives you AI-powered strategies to win. Built for veteran-owned and small businesses.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <Link href="/signup" className="inline-flex items-center justify-center bg-black text-white font-typewriter font-bold px-8 py-4 rounded-full text-sm hover:bg-stone-800 transition-all shadow-lg">
                        Start Free Trial <ArrowRight className="w-4 h-4 ml-2" />
                    </Link>
                    <Link href="/login" className="inline-flex items-center justify-center bg-white text-stone-700 font-typewriter font-bold px-8 py-4 rounded-full text-sm border-2 border-stone-200 hover:border-stone-400 transition-all">
                        Sign In
                    </Link>
                </div>
                <p className="text-xs text-stone-400 mt-4">14 days free. No credit card required.</p>
            </section>

            {/* Stats */}
            <section className="max-w-4xl mx-auto px-6 pb-16">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {STATS.map(s => (
                        <div key={s.label} className="bg-white rounded-2xl border border-stone-200 p-5 text-center">
                            <p className="text-2xl sm:text-3xl font-bold font-typewriter tracking-tight">{s.value}</p>
                            <p className="text-xs text-stone-500 font-typewriter uppercase tracking-widest mt-1">{s.label}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* Features */}
            <section className="max-w-5xl mx-auto px-6 pb-20">
                <h2 className="text-2xl sm:text-3xl font-bold font-typewriter tracking-tighter text-center mb-3">
                    Everything You Need to Capture Contracts
                </h2>
                <p className="text-stone-500 text-center mb-10 max-w-xl mx-auto">
                    From opportunity discovery to proposal-ready intelligence, CapturePilot automates the federal capture process.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {FEATURES.map(f => {
                        const Icon = f.icon;
                        return (
                            <div key={f.title} className="bg-white rounded-2xl border border-stone-200 p-6 hover:shadow-md transition-shadow">
                                <div className="w-10 h-10 rounded-xl bg-stone-100 flex items-center justify-center mb-4">
                                    <Icon className="w-5 h-5 text-stone-600" />
                                </div>
                                <h3 className="font-typewriter font-bold text-sm mb-2">{f.title}</h3>
                                <p className="text-sm text-stone-500 leading-relaxed">{f.desc}</p>
                            </div>
                        );
                    })}
                </div>
            </section>

            {/* CTA */}
            <section className="max-w-3xl mx-auto px-6 pb-20">
                <div className="bg-stone-900 text-white rounded-3xl p-8 sm:p-12 text-center">
                    <h2 className="text-2xl sm:text-3xl font-bold font-typewriter tracking-tighter mb-4">
                        Ready to Start Winning?
                    </h2>
                    <p className="text-stone-400 mb-8 max-w-lg mx-auto">
                        Join small businesses using CapturePilot to find, match, and capture federal contracts.
                    </p>
                    <div className="space-y-3 mb-8 inline-block text-left">
                        {["14-day free trial", "No credit card required", "Set up in under 5 minutes"].map(b => (
                            <div key={b} className="flex items-center gap-2 text-sm">
                                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                                <span>{b}</span>
                            </div>
                        ))}
                    </div>
                    <div className="block">
                        <Link href="/signup" className="inline-flex items-center bg-white text-black font-typewriter font-bold px-8 py-4 rounded-full text-sm hover:bg-stone-100 transition-all">
                            Start Free Trial <ArrowRight className="w-4 h-4 ml-2" />
                        </Link>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="max-w-6xl mx-auto px-6 py-8 border-t border-stone-200 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center space-x-2">
                    <Zap className="h-4 w-4 text-stone-400" />
                    <span className="text-sm text-stone-400 font-typewriter">CapturePilot</span>
                </div>
                <div className="flex gap-6 text-xs text-stone-400">
                    <Link href="/pricing" className="hover:text-stone-600 transition-colors">Pricing</Link>
                    <Link href="/login" className="hover:text-stone-600 transition-colors">Sign In</Link>
                    <Link href="/signup" className="hover:text-stone-600 transition-colors">Free Trial</Link>
                </div>
            </footer>
        </div>
    );
}
