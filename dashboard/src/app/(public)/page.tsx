"use client";

import Link from "next/link";
import {
  Zap,
  Target,
  Shield,
  Clock,
  BarChart3,
  Search,
  ArrowRight,
  CheckCircle2,
  Star,
} from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      {/* Navigation */}
      <nav className="fixed top-0 w-full bg-white/80 backdrop-blur-md border-b border-stone-200 z-50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-black flex items-center justify-center">
              <Zap className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-bold font-typewriter">CapturePilot</span>
          </div>
          <div className="flex items-center space-x-4">
            <Link
              href="/login"
              className="text-sm font-medium text-stone-600 hover:text-stone-900 transition-colors"
            >
              Log In
            </Link>
            <Link
              href="/signup"
              className="bg-black text-white px-5 py-2.5 rounded-2xl text-sm font-semibold hover:bg-stone-800 transition-colors shadow-lg shadow-stone-300/30"
            >
              Start Free Trial
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center space-x-2 bg-emerald-50 text-emerald-700 px-4 py-1.5 rounded-full text-xs font-semibold mb-8 border border-emerald-200">
            <Star className="w-3.5 h-3.5" />
            <span>Now in Private Beta for VOBs</span>
          </div>
          <h1 className="text-5xl md:text-7xl font-black font-typewriter tracking-tight leading-[1.1] mb-6">
            Stop Searching.
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-stone-900 via-stone-600 to-stone-900">
              Start Winning.
            </span>
          </h1>
          <p className="text-lg md:text-xl text-stone-500 max-w-2xl mx-auto mb-10 leading-relaxed">
            The first intelligent matching engine built specifically for Veteran-Owned
            and Small Businesses. We analyze{" "}
            <span className="text-stone-900 font-semibold">15+ proprietary criteria</span>{" "}
            to find the government contracts you were made to win.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/signup"
              className="bg-black text-white px-8 py-4 rounded-[20px] text-base font-semibold hover:bg-stone-800 transition-all shadow-xl shadow-stone-400/20 flex items-center space-x-2"
            >
              <span>Start Free Trial</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
            <div className="flex items-center space-x-6 text-xs text-stone-400">
              <span className="flex items-center space-x-1">
                <Shield className="w-3.5 h-3.5" />
                <span>SDVOSB Optimized</span>
              </span>
              <span className="flex items-center space-x-1">
                <Clock className="w-3.5 h-3.5" />
                <span>Real-time Alerts</span>
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 px-6 bg-white border-y border-stone-200">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-black font-typewriter text-center mb-16">
            How It Works
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: "01",
                title: "Sign Up",
                desc: "Create your account in seconds with Google. No credit card required.",
                icon: Zap,
              },
              {
                step: "02",
                title: "Describe Your Business",
                desc: "Tell us your NAICS codes, certifications, location, and capacity. Takes 3 minutes.",
                icon: Target,
              },
              {
                step: "03",
                title: "Get Matched",
                desc: "Our engine scores every federal opportunity against your profile. See your best matches instantly.",
                icon: BarChart3,
              },
            ].map((item) => (
              <div
                key={item.step}
                className="bg-stone-50 rounded-[32px] p-8 border border-stone-200 hover:shadow-lg hover:-translate-y-0.5 transition-all"
              >
                <div className="text-xs font-typewriter text-stone-400 mb-4">
                  STEP {item.step}
                </div>
                <item.icon className="w-8 h-8 mb-4 text-stone-900" />
                <h3 className="text-lg font-bold font-typewriter mb-2">
                  {item.title}
                </h3>
                <p className="text-sm text-stone-500 leading-relaxed">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-black font-typewriter text-center mb-4">
            Built for the Underdog
          </h2>
          <p className="text-center text-stone-500 mb-16 max-w-2xl mx-auto">
            Large corporations have entire departments for government contracting.
            You have CapturePilot. We level the playing field.
          </p>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: Search,
                title: "Deep Search Engine",
                desc: "We scan federal databases daily to find hidden opportunities others miss. Sources Sought and RFIs surfaced 6-18 months early.",
              },
              {
                icon: BarChart3,
                title: "Win Probability Scoring",
                desc: "Every match comes with a score based on your certifications, location, past performance, and agency buying patterns.",
              },
              {
                icon: Shield,
                title: "Set-Aside Specialist",
                desc: "We prioritize SDVOSB, WOSB, HUBZone, and 8(a) opportunities where you have the highest competitive advantage.",
              },
              {
                icon: Target,
                title: "Easy Wins First",
                desc: "Sources Sought and RFI contracts highlighted first. These early-stage opportunities have the highest win probability.",
              },
              {
                icon: CheckCircle2,
                title: "Guided Pursuit",
                desc: "Step-by-step action items for every matched contract. Know exactly what to do next to win the bid.",
              },
              {
                icon: Clock,
                title: "Never Miss a Deadline",
                desc: "Email alerts for new matching contracts and upcoming deadlines. Stay ahead without checking daily.",
              },
            ].map((feature) => (
              <div
                key={feature.title}
                className="bg-white rounded-[32px] p-7 border border-stone-200 hover:shadow-lg hover:-translate-y-0.5 transition-all"
              >
                <feature.icon className="w-6 h-6 mb-4 text-stone-700" />
                <h3 className="text-base font-bold font-typewriter mb-2">
                  {feature.title}
                </h3>
                <p className="text-sm text-stone-500 leading-relaxed">
                  {feature.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* The Engine */}
      <section className="py-20 px-6 bg-stone-900 text-white">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-black font-typewriter mb-4">
            15 Criteria. One Perfect Match.
          </h2>
          <p className="text-stone-400 mb-12 max-w-xl mx-auto">
            Our algorithm analyzes your business profile against every federal
            opportunity to find the path of least resistance.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-left">
            {[
              "NAICS Code Synergy",
              "Geographic Advantage",
              "Set-Aside Eligibility",
              "Capacity & Workforce Fit",
              "Federal Track Record",
              "Agency Spending Trends",
              "Notice Type Priority",
              "Competition Density",
              "Incumbent Analysis",
              "Certification Match",
              "Contract Value Fit",
              "Deadline Proximity",
              "Past Performance",
              "Revenue Alignment",
              "Service Radius",
            ].map((c) => (
              <div
                key={c}
                className="flex items-center space-x-2 text-sm text-stone-300"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span>{c}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-20 px-6">
        <div className="max-w-lg mx-auto text-center">
          <h2 className="text-3xl font-black font-typewriter mb-12">
            Ready to Pilot Your Growth?
          </h2>
          <div className="bg-white rounded-[40px] p-10 border border-stone-200 shadow-xl">
            <div className="text-5xl font-black font-typewriter mb-1">$150</div>
            <div className="text-stone-500 text-sm mb-8">Per Month</div>
            <div className="inline-block bg-emerald-50 text-emerald-700 text-xs font-semibold px-3 py-1 rounded-full mb-8 border border-emerald-200">
              FREE 14-DAY TRIAL
            </div>
            <ul className="text-left space-y-3 mb-10">
              {[
                "Unlimited Contract Matches",
                "Win Probability Scoring",
                "Guided Pursuit Workflow",
                "Real-time Email Alerts",
                "Pipeline Management",
                "Set-Aside Optimization",
              ].map((f) => (
                <li key={f} className="flex items-center space-x-3 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <Link
              href="/signup"
              className="block w-full bg-black text-white py-4 rounded-2xl font-semibold hover:bg-stone-800 transition-colors shadow-lg"
            >
              Start Free Trial Now
            </Link>
            <p className="text-xs text-stone-400 mt-4">
              No credit card required for trial. Cancel anytime.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-stone-200 bg-white">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between">
          <div className="flex items-center space-x-3 mb-4 md:mb-0">
            <div className="w-7 h-7 rounded-lg bg-black flex items-center justify-center">
              <Zap className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="text-sm font-bold font-typewriter">CapturePilot</span>
          </div>
          <p className="text-xs text-stone-400">
            Built for Veteran-Owned & Small Businesses
          </p>
        </div>
      </footer>
    </div>
  );
}
