"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Search,
  Target,
  FileText,
  MessageSquare,
  Zap,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ArrowRight,
  ChevronUp,
  ChevronDown,
  Shield,
  Globe,
  Wrench,
  Building2,
  Users,
  BadgeDollarSign,
  Clock,
  TrendingUp,
  Briefcase,
  Phone,
  Mail,
  Award,
} from "lucide-react";

const TOTAL_SLIDES = 12;

export default function TDIPresentationPage() {
  const [currentSlide, setCurrentSlide] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);
  const isScrollingRef = useRef(false);

  const scrollToSlide = useCallback((slideNumber: number) => {
    const container = containerRef.current;
    if (!container) return;
    const slideEl = container.children[slideNumber - 1] as HTMLElement;
    if (slideEl) {
      isScrollingRef.current = true;
      slideEl.scrollIntoView({ behavior: "smooth" });
      setCurrentSlide(slideNumber);
      setTimeout(() => {
        isScrollingRef.current = false;
      }, 800);
    }
  }, []);

  const goNext = useCallback(() => {
    if (currentSlide < TOTAL_SLIDES) scrollToSlide(currentSlide + 1);
  }, [currentSlide, scrollToSlide]);

  const goPrev = useCallback(() => {
    if (currentSlide > 1) scrollToSlide(currentSlide - 1);
  }, [currentSlide, scrollToSlide]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown" || e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        goNext();
      } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goNext, goPrev]);

  // Scroll observer to track current slide
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (isScrollingRef.current) return;
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
            const index = Array.from(container.children).indexOf(
              entry.target as HTMLElement
            );
            if (index >= 0) setCurrentSlide(index + 1);
          }
        });
      },
      { root: container, threshold: 0.5 }
    );

    Array.from(container.children).forEach((child) => observer.observe(child));
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <style jsx global>{`
        @media print {
          body {
            background: white !important;
            color: black !important;
          }
          .slide-container {
            scroll-snap-type: none !important;
            overflow: visible !important;
            height: auto !important;
          }
          .slide {
            min-height: 100vh !important;
            page-break-after: always;
            page-break-inside: avoid;
            background: white !important;
            color: #1a1a1a !important;
          }
          .slide * {
            color: #1a1a1a !important;
            border-color: #d1d5db !important;
          }
          .slide .stat-number {
            color: #059669 !important;
          }
          .nav-dots,
          .slide-counter,
          .nav-arrows {
            display: none !important;
          }
          .bg-stone-900 {
            background: #f3f4f6 !important;
          }
          .bg-stone-950 {
            background: white !important;
          }
          .bg-stone-800 {
            background: #e5e7eb !important;
          }
          .bg-emerald-500\\/10,
          .bg-emerald-900\\/20 {
            background: #d1fae5 !important;
          }
          .bg-red-500\\/10,
          .bg-red-900\\/20 {
            background: #fee2e2 !important;
          }
          .grid-bg {
            display: none !important;
          }
        }
        @keyframes gridMove {
          0% {
            transform: translate(0, 0);
          }
          100% {
            transform: translate(60px, 60px);
          }
        }
      `}</style>

      {/* Navigation Dots */}
      <div className="nav-dots fixed right-6 top-1/2 -translate-y-1/2 z-50 flex flex-col gap-2">
        {Array.from({ length: TOTAL_SLIDES }, (_, i) => (
          <button
            key={i}
            onClick={() => scrollToSlide(i + 1)}
            className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
              currentSlide === i + 1
                ? "bg-emerald-500 scale-125 shadow-lg shadow-emerald-500/50"
                : "bg-stone-600 hover:bg-stone-400"
            }`}
            aria-label={`Go to slide ${i + 1}`}
          />
        ))}
      </div>

      {/* Slide Counter */}
      <div className="slide-counter fixed bottom-6 right-6 z-50 text-stone-500 font-mono text-sm tracking-wider">
        <span className="text-emerald-500 font-semibold">{currentSlide}</span>
        <span className="mx-1">/</span>
        <span>{TOTAL_SLIDES}</span>
      </div>

      {/* Arrow Navigation */}
      <div className="nav-arrows fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex gap-2">
        <button
          type="button"
          onClick={goPrev}
          disabled={currentSlide === 1}
          aria-label="Previous slide"
          className="p-2 rounded-lg bg-stone-800/80 text-stone-400 hover:text-white hover:bg-stone-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all backdrop-blur-sm"
        >
          <ChevronUp className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={goNext}
          disabled={currentSlide === TOTAL_SLIDES}
          aria-label="Next slide"
          className="p-2 rounded-lg bg-stone-800/80 text-stone-400 hover:text-white hover:bg-stone-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all backdrop-blur-sm"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>

      {/* Slide Container */}
      <div
        ref={containerRef}
        className="slide-container h-screen overflow-y-scroll"
        style={{ scrollSnapType: "y mandatory" }}
      >
        {/* ===== SLIDE 1: Title ===== */}
        <section
          className="slide min-h-screen bg-stone-950 flex items-center justify-center relative overflow-hidden"
          style={{ scrollSnapAlign: "start" }}
        >
          {/* Animated Grid Background */}
          <div className="grid-bg absolute inset-0 opacity-[0.04]">
            <div
              className="absolute inset-0"
              style={{
                backgroundImage:
                  "linear-gradient(rgba(16,185,129,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(16,185,129,0.3) 1px, transparent 1px)",
                backgroundSize: "60px 60px",
                animation: "gridMove 20s linear infinite",
              }}
            />
          </div>
          <div className="relative z-10 text-center max-w-5xl mx-auto px-8">
            {/* Logo */}
            <div className="mb-16">
              <div className="inline-flex items-center gap-3 px-6 py-3 border border-stone-800 rounded-full">
                <Shield className="w-5 h-5 text-emerald-500" />
                <span className="text-stone-300 tracking-[0.3em] uppercase text-sm font-light">
                  Americurial LLC
                </span>
              </div>
            </div>

            <h1 className="text-5xl md:text-7xl font-extralight text-white tracking-tight leading-tight mb-8">
              Entering the{" "}
              <span className="text-emerald-500 font-light">
                Federal Contracting
              </span>{" "}
              Market
            </h1>

            <p className="text-xl md:text-2xl text-stone-400 font-light max-w-3xl mx-auto leading-relaxed mb-16">
              How TD&I Can Unlock New Revenue Streams Without Building an
              Internal Capture Team
            </p>

            <div className="flex flex-col items-center gap-4">
              <div className="w-px h-12 bg-gradient-to-b from-transparent via-stone-700 to-transparent" />
              <p className="text-stone-600 text-sm tracking-wider uppercase">
                Prepared for TD&I Cable Maintenance | April 2026
              </p>
            </div>
          </div>

          {/* Corner accents */}
          <div className="absolute top-8 left-8 w-16 h-16 border-l border-t border-stone-800" />
          <div className="absolute bottom-8 right-20 w-16 h-16 border-r border-b border-stone-800" />
        </section>

        {/* ===== SLIDE 2: The Market Opportunity ===== */}
        <section
          className="slide min-h-screen bg-stone-950 flex items-center justify-center relative"
          style={{ scrollSnapAlign: "start" }}
        >
          <div className="max-w-6xl mx-auto px-8 w-full">
            <p className="text-emerald-500 text-sm tracking-[0.3em] uppercase mb-4 font-medium">
              Market Opportunity
            </p>
            <h2 className="text-3xl md:text-5xl font-extralight text-white mb-4 leading-tight max-w-4xl">
              Massive revenue opportunities exist that most telecom contractors{" "}
              <span className="text-emerald-500">never access.</span>
            </h2>
            <div className="w-20 h-px bg-emerald-500/50 mb-16" />

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                {
                  stat: "$700B+",
                  label: "Annual Federal Contracting Market",
                  icon: Building2,
                },
                {
                  stat: "$65B+",
                  label: "Broadband & Telecom Infrastructure Funding",
                  icon: Globe,
                },
                {
                  stat: "42%",
                  label: "Growth in Federal Fiber Projects (YoY)",
                  icon: TrendingUp,
                },
                {
                  stat: "$120B",
                  label: "Rural Broadband Investment (BEAD Program)",
                  icon: Wrench,
                },
              ].map((item, i) => (
                <div
                  key={i}
                  className="bg-stone-900 border border-stone-800 rounded-2xl p-8 hover:border-emerald-500/30 transition-all duration-500 group"
                >
                  <item.icon className="w-6 h-6 text-stone-600 group-hover:text-emerald-500/50 mb-6 transition-colors" />
                  <p className="stat-number text-4xl md:text-5xl font-light text-emerald-500 mb-3">
                    {item.stat}
                  </p>
                  <p className="text-stone-400 text-sm leading-relaxed">
                    {item.label}
                  </p>
                </div>
              ))}
            </div>

            <p className="text-stone-600 text-xs mt-8 tracking-wide">
              Sources: USASpending.gov, FCC, NTIA
            </p>
          </div>
        </section>

        {/* ===== SLIDE 3: The Problem ===== */}
        <section
          className="slide min-h-screen bg-stone-950 flex items-center justify-center relative"
          style={{ scrollSnapAlign: "start" }}
        >
          <div className="max-w-4xl mx-auto px-8 w-full">
            <p className="text-red-400 text-sm tracking-[0.3em] uppercase mb-4 font-medium">
              The Problem
            </p>
            <h2 className="text-3xl md:text-5xl font-extralight text-white mb-4 leading-tight">
              Federal contracts are not won by{" "}
              <span className="text-red-400">capability alone.</span>
            </h2>
            <div className="w-20 h-px bg-red-400/50 mb-16" />

            <div className="flex flex-col gap-4">
              {[
                "No federal capture team internally",
                "No existing procurement relationships",
                "Complex proposal & compliance process",
                "Long sales cycles (6-18 months)",
                "Internal bandwidth focused on commercial delivery",
              ].map((problem, i) => (
                <div
                  key={i}
                  className="bg-stone-900 border border-stone-800 rounded-xl p-6 flex items-center gap-5 hover:border-red-500/20 transition-all"
                >
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
                    {i < 3 ? (
                      <XCircle className="w-5 h-5 text-red-400" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-amber-400" />
                    )}
                  </div>
                  <p className="text-stone-300 text-lg font-light">
                    {problem}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-12 p-6 border border-stone-800 rounded-xl bg-stone-900/50">
              <p className="text-stone-400 text-center text-sm">
                This is why{" "}
                <span className="text-red-400 font-medium">90%</span> of
                qualified contractors never enter the federal market.
              </p>
            </div>
          </div>
        </section>

        {/* ===== SLIDE 4: The Gap Analysis ===== */}
        <section
          className="slide min-h-screen bg-stone-950 flex items-center justify-center relative"
          style={{ scrollSnapAlign: "start" }}
        >
          <div className="max-w-6xl mx-auto px-8 w-full">
            <p className="text-emerald-500 text-sm tracking-[0.3em] uppercase mb-4 font-medium">
              Gap Analysis
            </p>
            <h2 className="text-3xl md:text-5xl font-extralight text-white mb-4 leading-tight max-w-4xl">
              TD&I has the delivery strength — but lacks{" "}
              <span className="text-amber-400">
                federal capture infrastructure.
              </span>
            </h2>
            <div className="w-20 h-px bg-emerald-500/50 mb-16" />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* What TD&I Has */}
              <div className="bg-stone-900 border border-emerald-500/20 rounded-2xl p-8">
                <div className="flex items-center gap-3 mb-8">
                  <div className="w-3 h-3 rounded-full bg-emerald-500" />
                  <h3 className="text-emerald-500 text-lg font-medium tracking-wide">
                    What TD&I Has
                  </h3>
                </div>
                <div className="flex flex-col gap-4">
                  {[
                    "Strong execution capability",
                    "Technical expertise (40 years)",
                    "Multi-state presence (MN, WI, IA, NE, AK)",
                    "Subcontractor network",
                    "Turnkey delivery model",
                    "$120M revenue / PE backing",
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                      <span className="text-stone-300 font-light">{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* What's Missing */}
              <div className="bg-stone-900 border border-red-500/20 rounded-2xl p-8">
                <div className="flex items-center gap-3 mb-8">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <h3 className="text-red-400 text-lg font-medium tracking-wide">
                    What&apos;s Missing
                  </h3>
                </div>
                <div className="flex flex-col gap-4">
                  {[
                    "Capture strategy & methodology",
                    "Proposal positioning expertise",
                    "Agency relationship development",
                    "Federal sales process knowledge",
                    "SAM.gov registration & compliance",
                    "Past performance documentation",
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <XCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                      <span className="text-stone-300 font-light">{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ===== SLIDE 5: Our Solution ===== */}
        <section
          className="slide min-h-screen bg-stone-950 flex items-center justify-center relative"
          style={{ scrollSnapAlign: "start" }}
        >
          <div className="max-w-6xl mx-auto px-8 w-full">
            <p className="text-emerald-500 text-sm tracking-[0.3em] uppercase mb-4 font-medium">
              Our Solution
            </p>
            <h2 className="text-3xl md:text-5xl font-extralight text-white mb-4 leading-tight">
              Your outsourced{" "}
              <span className="text-emerald-500">
                federal capture department.
              </span>
            </h2>
            <div className="w-20 h-px bg-emerald-500/50 mb-16" />

            <div className="flex flex-col md:flex-row items-stretch gap-0">
              {[
                {
                  icon: Search,
                  title: "We Identify",
                  desc: "Find matching opportunities",
                  color: "emerald",
                },
                {
                  icon: Target,
                  title: "We Position",
                  desc: "Strategic capture planning",
                  color: "emerald",
                },
                {
                  icon: FileText,
                  title: "We Prepare",
                  desc: "Proposal development support",
                  color: "emerald",
                },
                {
                  icon: MessageSquare,
                  title: "We Communicate",
                  desc: "Agency relationship management",
                  color: "emerald",
                },
                {
                  icon: Zap,
                  title: "TD&I Executes",
                  desc: "Technical delivery & performance",
                  color: "blue",
                },
              ].map((step, i) => (
                <div key={i} className="flex items-center flex-1">
                  <div
                    className={`flex-1 bg-stone-900 border ${
                      step.color === "blue"
                        ? "border-blue-500/30 bg-blue-950/20"
                        : "border-stone-800"
                    } rounded-2xl p-6 text-center hover:border-emerald-500/30 transition-all group`}
                  >
                    <div
                      className={`w-14 h-14 rounded-xl ${
                        step.color === "blue"
                          ? "bg-blue-500/10"
                          : "bg-emerald-500/10"
                      } flex items-center justify-center mx-auto mb-4`}
                    >
                      <step.icon
                        className={`w-7 h-7 ${
                          step.color === "blue"
                            ? "text-blue-400"
                            : "text-emerald-500"
                        }`}
                      />
                    </div>
                    <p className="text-white font-medium mb-1">{step.title}</p>
                    <p className="text-stone-500 text-sm">{step.desc}</p>
                  </div>
                  {i < 4 && (
                    <ArrowRight className="w-5 h-5 text-stone-700 mx-2 flex-shrink-0 hidden md:block" />
                  )}
                </div>
              ))}
            </div>

            <div className="mt-16 text-center">
              <p className="text-stone-400 text-xl font-light italic">
                &ldquo;We load the gun.{" "}
                <span className="text-emerald-500 not-italic font-medium">
                  You pull the trigger.
                </span>
                &rdquo;
              </p>
            </div>
          </div>
        </section>

        {/* ===== SLIDE 6: The Process ===== */}
        <section
          className="slide min-h-screen bg-stone-950 flex items-center justify-center relative"
          style={{ scrollSnapAlign: "start" }}
        >
          <div className="max-w-6xl mx-auto px-8 w-full">
            <p className="text-emerald-500 text-sm tracking-[0.3em] uppercase mb-4 font-medium">
              The Process
            </p>
            <h2 className="text-3xl md:text-5xl font-extralight text-white mb-4 leading-tight max-w-4xl">
              A proven four-phase approach to{" "}
              <span className="text-emerald-500">federal market entry.</span>
            </h2>
            <div className="w-20 h-px bg-emerald-500/50 mb-16" />

            <div className="relative">
              {/* Connector line */}
              <div className="hidden md:block absolute top-12 left-0 right-0 h-px bg-gradient-to-r from-emerald-500/50 via-emerald-500/30 to-emerald-500/50" />

              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {[
                  {
                    phase: "Phase 1",
                    title: "Market Entry & Positioning",
                    items: [
                      "SAM registration",
                      "NAICS optimization",
                      "Capability statement",
                      "Market analysis",
                    ],
                  },
                  {
                    phase: "Phase 2",
                    title: "Opportunity Capture",
                    items: [
                      "Daily opportunity scanning",
                      "Qualification & scoring",
                      "Agency outreach",
                      "Sources Sought responses",
                    ],
                  },
                  {
                    phase: "Phase 3",
                    title: "Proposal & Win Strategy",
                    items: [
                      "Proposal outline development",
                      "Compliance matrix",
                      "Pricing strategy support",
                      "Teaming arrangements",
                    ],
                  },
                  {
                    phase: "Phase 4",
                    title: "Contract Execution Support",
                    items: [
                      "Award transition",
                      "Performance monitoring",
                      "Recompete positioning",
                      "Portfolio growth",
                    ],
                  },
                ].map((phase, i) => (
                  <div key={i} className="relative">
                    {/* Phase dot */}
                    <div className="hidden md:flex w-6 h-6 rounded-full bg-emerald-500 border-4 border-stone-950 mx-auto mb-6 relative z-10 items-center justify-center">
                      <div className="w-2 h-2 rounded-full bg-white" />
                    </div>
                    <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6 hover:border-emerald-500/20 transition-all">
                      <p className="text-emerald-500 text-xs tracking-[0.2em] uppercase mb-2">
                        {phase.phase}
                      </p>
                      <h4 className="text-white font-medium mb-4 text-lg">
                        {phase.title}
                      </h4>
                      <ul className="space-y-2">
                        {phase.items.map((item, j) => (
                          <li
                            key={j}
                            className="text-stone-400 text-sm flex items-start gap-2"
                          >
                            <div className="w-1 h-1 rounded-full bg-emerald-500/50 mt-2 flex-shrink-0" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ===== SLIDE 7: Expected Timeline ===== */}
        <section
          className="slide min-h-screen bg-stone-950 flex items-center justify-center relative"
          style={{ scrollSnapAlign: "start" }}
        >
          <div className="max-w-5xl mx-auto px-8 w-full">
            <p className="text-emerald-500 text-sm tracking-[0.3em] uppercase mb-4 font-medium">
              Expected Timeline
            </p>
            <h2 className="text-3xl md:text-5xl font-extralight text-white mb-4 leading-tight max-w-4xl">
              Federal sales cycles require patience — but create{" "}
              <span className="text-emerald-500">
                long-term revenue stability.
              </span>
            </h2>
            <div className="w-20 h-px bg-emerald-500/50 mb-16" />

            <div className="space-y-6">
              {[
                {
                  months: "Month 1-3",
                  title: "Pipeline Creation",
                  desc: "Building your federal opportunity pipeline",
                  color: "bg-blue-500",
                  barColor: "bg-blue-500/20",
                  textColor: "text-blue-400",
                  width: "25%",
                  left: "0%",
                },
                {
                  months: "Month 3-6",
                  title: "Active Bids",
                  desc: "Responding to qualified opportunities",
                  color: "bg-amber-500",
                  barColor: "bg-amber-500/20",
                  textColor: "text-amber-400",
                  width: "25%",
                  left: "25%",
                },
                {
                  months: "Month 6-12",
                  title: "Potential Awards",
                  desc: "First contract awards expected",
                  color: "bg-emerald-500",
                  barColor: "bg-emerald-500/20",
                  textColor: "text-emerald-400",
                  width: "50%",
                  left: "42%",
                },
                {
                  months: "Month 12+",
                  title: "Portfolio Growth",
                  desc: "Recurring revenue & recompetes",
                  color: "bg-emerald-400",
                  barColor: "bg-emerald-400/20",
                  textColor: "text-emerald-300",
                  width: "100%",
                  left: "0%",
                },
              ].map((phase, i) => (
                <div key={i} className="group">
                  <div className="flex items-center gap-6 mb-2">
                    <span
                      className={`${phase.textColor} text-sm font-mono w-24 flex-shrink-0`}
                    >
                      {phase.months}
                    </span>
                    <span className="text-white font-medium">
                      {phase.title}
                    </span>
                    <span className="text-stone-500 text-sm hidden md:block">
                      {phase.desc}
                    </span>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="w-24 flex-shrink-0" />
                    <div className="flex-1 h-8 bg-stone-900 rounded-lg overflow-hidden border border-stone-800">
                      <div
                        className={`h-full ${phase.color} rounded-lg transition-all duration-1000 opacity-80`}
                        style={{ width: phase.width, marginLeft: phase.left }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-12 p-6 border border-stone-800 rounded-xl bg-stone-900/50">
              <p className="text-stone-400 text-sm text-center">
                <Clock className="w-4 h-4 inline-block mr-2 text-emerald-500" />
                Federal contracts typically run{" "}
                <span className="text-white font-medium">
                  1-5 years with option years
                </span>
                , creating stable recurring revenue.
              </p>
            </div>
          </div>
        </section>

        {/* ===== SLIDE 8: Financial Comparison ===== */}
        <section
          className="slide min-h-screen bg-stone-950 flex items-center justify-center relative"
          style={{ scrollSnapAlign: "start" }}
        >
          <div className="max-w-5xl mx-auto px-8 w-full">
            <p className="text-emerald-500 text-sm tracking-[0.3em] uppercase mb-4 font-medium">
              Financial Comparison
            </p>
            <h2 className="text-3xl md:text-5xl font-extralight text-white mb-4 leading-tight">
              Enterprise capability without{" "}
              <span className="text-emerald-500">enterprise overhead.</span>
            </h2>
            <div className="w-20 h-px bg-emerald-500/50 mb-16" />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Build Internally */}
              <div className="bg-stone-900 border border-red-500/20 rounded-2xl p-8 relative">
                <div className="absolute top-4 right-4 px-3 py-1 rounded-full bg-red-500/10 text-red-400 text-xs">
                  High Cost
                </div>
                <h3 className="text-red-400 text-xl font-medium mb-8">
                  Build Internally
                </h3>

                <div className="space-y-4 mb-8">
                  {[
                    { role: "Capture Manager", cost: "$120K+" },
                    { role: "Proposal Manager", cost: "$100K+" },
                    { role: "BD Support", cost: "$80K+" },
                    { role: "Tools & Software", cost: "$15K+" },
                  ].map((item, i) => (
                    <div
                      key={i}
                      className="flex justify-between items-center py-2 border-b border-stone-800"
                    >
                      <span className="text-stone-400">{item.role}</span>
                      <span className="text-stone-300 font-mono">
                        {item.cost}/yr
                      </span>
                    </div>
                  ))}
                </div>

                <div className="bg-red-500/10 rounded-xl p-6 text-center mb-4">
                  <p className="text-stone-400 text-sm mb-1">Total Cost</p>
                  <p className="text-red-400 text-4xl font-light">
                    $315K+
                    <span className="text-lg text-stone-500">/year</span>
                  </p>
                </div>
                <p className="text-stone-500 text-sm text-center italic">
                  Plus 6-12 months to hire and ramp
                </p>
              </div>

              {/* Partner With Us */}
              <div className="bg-stone-900 border-2 border-emerald-500/40 rounded-2xl p-8 relative shadow-lg shadow-emerald-500/5">
                <div className="absolute top-4 right-4 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs">
                  Recommended
                </div>
                <h3 className="text-emerald-500 text-xl font-medium mb-8">
                  Partner With Us
                </h3>

                <div className="space-y-4 mb-8">
                  {[
                    {
                      role: "Monthly Retainer",
                      cost: "$3,500",
                      suffix: "/mo",
                    },
                    {
                      role: "Annual Cost",
                      cost: "$42K",
                      suffix: "/year",
                    },
                    {
                      role: "Success Fee",
                      cost: "5%",
                      suffix: " on wins only",
                    },
                  ].map((item, i) => (
                    <div
                      key={i}
                      className="flex justify-between items-center py-2 border-b border-stone-800"
                    >
                      <span className="text-stone-400">{item.role}</span>
                      <span className="text-emerald-400 font-mono">
                        {item.cost}
                        <span className="text-stone-500 text-sm">
                          {item.suffix}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>

                <div className="bg-emerald-500/10 rounded-xl p-6 text-center mb-4">
                  <p className="text-stone-400 text-sm mb-1">You Save</p>
                  <p className="stat-number text-emerald-500 text-4xl font-light">
                    $273K+{" "}
                    <span className="text-lg text-stone-500">Year 1</span>
                  </p>
                </div>
                <p className="text-emerald-400/70 text-sm text-center font-medium">
                  Operational in 30 days
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ===== SLIDE 9: Why TD&I Is Positioned to Win ===== */}
        <section
          className="slide min-h-screen bg-stone-950 flex items-center justify-center relative"
          style={{ scrollSnapAlign: "start" }}
        >
          <div className="max-w-6xl mx-auto px-8 w-full">
            <p className="text-emerald-500 text-sm tracking-[0.3em] uppercase mb-4 font-medium">
              Competitive Strengths
            </p>
            <h2 className="text-3xl md:text-5xl font-extralight text-white mb-4 leading-tight max-w-4xl">
              TD&I is{" "}
              <span className="text-emerald-500">highly positioned</span> to
              compete in federal telecom contracts.
            </h2>
            <div className="w-20 h-px bg-emerald-500/50 mb-16" />

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[
                {
                  icon: Wrench,
                  title: "Fiber Infrastructure Expertise",
                  desc: "40 years of turnkey installation",
                },
                {
                  icon: Globe,
                  title: "Multi-State Presence",
                  desc: "Coverage across MN, WI, IA, NE, AK",
                },
                {
                  icon: Briefcase,
                  title: "Turnkey Delivery Model",
                  desc: "Permitting \u2192 Design \u2192 Installation \u2192 PM",
                },
                {
                  icon: TrendingUp,
                  title: "Scale & Stability",
                  desc: "$120M revenue, PE-backed, 500+ employees",
                },
                {
                  icon: Users,
                  title: "Subcontractor Network",
                  desc: "Established relationships for teaming",
                },
                {
                  icon: Shield,
                  title: "Bonding Capacity",
                  desc: "PE backing enables large contract bonding",
                },
              ].map((card, i) => (
                <div
                  key={i}
                  className="bg-stone-900 border border-stone-800 rounded-2xl p-8 hover:border-emerald-500/20 transition-all group"
                >
                  <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center mb-5 group-hover:bg-emerald-500/20 transition-colors">
                    <card.icon className="w-6 h-6 text-emerald-500" />
                  </div>
                  <h4 className="text-white font-medium mb-2">{card.title}</h4>
                  <p className="text-stone-500 text-sm">{card.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ===== SLIDE 10: Engagement Model ===== */}
        <section
          className="slide min-h-screen bg-stone-950 flex items-center justify-center relative"
          style={{ scrollSnapAlign: "start" }}
        >
          <div className="max-w-5xl mx-auto px-8 w-full">
            <p className="text-emerald-500 text-sm tracking-[0.3em] uppercase mb-4 font-medium">
              Engagement Model
            </p>
            <h2 className="text-3xl md:text-5xl font-extralight text-white mb-4 leading-tight">
              Simple, transparent,{" "}
              <span className="text-emerald-500">aligned incentives.</span>
            </h2>
            <div className="w-20 h-px bg-emerald-500/50 mb-16" />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                {
                  label: "Monthly Retainer",
                  value: "$3,500",
                  desc: "Your dedicated capture team",
                  icon: BadgeDollarSign,
                },
                {
                  label: "Success Fee",
                  value: "5%",
                  desc: "Only when you win contracts",
                  icon: Award,
                },
                {
                  label: "Commitment",
                  value: "12 months",
                  desc: "Minimum engagement period",
                  icon: Clock,
                },
              ].map((card, i) => (
                <div
                  key={i}
                  className="bg-stone-900 border border-stone-800 rounded-2xl p-8 text-center hover:border-emerald-500/20 transition-all"
                >
                  <div className="w-14 h-14 rounded-xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-6">
                    <card.icon className="w-7 h-7 text-emerald-500" />
                  </div>
                  <p className="text-stone-500 text-sm uppercase tracking-wider mb-3">
                    {card.label}
                  </p>
                  <p className="stat-number text-5xl font-light text-emerald-500 mb-3">
                    {card.value}
                  </p>
                  <p className="text-stone-400 text-sm">{card.desc}</p>
                </div>
              ))}
            </div>

            <div className="mt-12 p-6 border border-stone-800 rounded-xl bg-stone-900/50">
              <p className="text-stone-400 text-sm text-center">
                Our success fee model means we&apos;re financially motivated to{" "}
                <span className="text-emerald-500 font-medium">
                  win deals for you
                </span>
                , not just bill hours.
              </p>
            </div>
          </div>
        </section>

        {/* ===== SLIDE 11: Division of Responsibilities ===== */}
        <section
          className="slide min-h-screen bg-stone-950 flex items-center justify-center relative"
          style={{ scrollSnapAlign: "start" }}
        >
          <div className="max-w-5xl mx-auto px-8 w-full">
            <p className="text-emerald-500 text-sm tracking-[0.3em] uppercase mb-4 font-medium">
              Responsibilities
            </p>
            <h2 className="text-3xl md:text-5xl font-extralight text-white mb-4 leading-tight">
              Clear ownership.{" "}
              <span className="text-emerald-500">No confusion.</span>
            </h2>
            <div className="w-20 h-px bg-emerald-500/50 mb-16" />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* We Handle */}
              <div className="bg-stone-900 border-2 border-emerald-500/30 rounded-2xl p-8">
                <div className="flex items-center gap-3 mb-8">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                    <Shield className="w-5 h-5 text-emerald-500" />
                  </div>
                  <h3 className="text-emerald-500 text-xl font-medium">
                    We Handle
                  </h3>
                </div>
                <div className="space-y-4">
                  {[
                    "Opportunity sourcing & qualification",
                    "Capture strategy development",
                    "Agency communication (email & fax)",
                    "Proposal outline & compliance",
                    "Competitive positioning",
                    "Pipeline management",
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                      <span className="text-stone-300 font-light">{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* TD&I Handles */}
              <div className="bg-stone-900 border-2 border-blue-500/30 rounded-2xl p-8">
                <div className="flex items-center gap-3 mb-8">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                    <Wrench className="w-5 h-5 text-blue-400" />
                  </div>
                  <h3 className="text-blue-400 text-xl font-medium">
                    TD&I Handles
                  </h3>
                </div>
                <div className="space-y-4">
                  {[
                    "Technical scope review",
                    "Pricing approval",
                    "Contract execution",
                    "Performance delivery",
                    "Final submission authorization",
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <CheckCircle2 className="w-5 h-5 text-blue-400 flex-shrink-0" />
                      <span className="text-stone-300 font-light">{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ===== SLIDE 12: Next Steps ===== */}
        <section
          className="slide min-h-screen bg-stone-950 flex items-center justify-center relative overflow-hidden"
          style={{ scrollSnapAlign: "start" }}
        >
          {/* Subtle grid background */}
          <div className="grid-bg absolute inset-0 opacity-[0.03]">
            <div
              className="absolute inset-0"
              style={{
                backgroundImage:
                  "linear-gradient(rgba(16,185,129,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(16,185,129,0.4) 1px, transparent 1px)",
                backgroundSize: "60px 60px",
              }}
            />
          </div>

          <div className="relative z-10 max-w-4xl mx-auto px-8 w-full">
            <p className="text-emerald-500 text-sm tracking-[0.3em] uppercase mb-4 font-medium">
              Next Steps
            </p>
            <h2 className="text-3xl md:text-5xl font-extralight text-white mb-4 leading-tight">
              Building TD&I&apos;s federal revenue pipeline{" "}
              <span className="text-emerald-500">starts immediately.</span>
            </h2>
            <div className="w-20 h-px bg-emerald-500/50 mb-16" />

            <div className="space-y-6">
              {[
                {
                  step: "01",
                  title: "Internal Review",
                  desc: "Share this proposal with your leadership team",
                },
                {
                  step: "02",
                  title: "Strategy Onboarding",
                  desc: "90-minute deep dive into your capabilities",
                },
                {
                  step: "03",
                  title: "SAM Registration",
                  desc: "Complete federal registration (we guide the process)",
                },
                {
                  step: "04",
                  title: "Pipeline Creation",
                  desc: "First qualified opportunities within 30 days",
                },
              ].map((item, i) => (
                <div
                  key={i}
                  className="bg-stone-900 border border-stone-800 rounded-xl p-6 flex items-center gap-6 hover:border-emerald-500/20 transition-all group"
                >
                  <div className="w-14 h-14 rounded-xl bg-emerald-500/10 flex items-center justify-center flex-shrink-0 group-hover:bg-emerald-500/20 transition-colors">
                    <span className="text-emerald-500 font-mono text-lg font-medium">
                      {item.step}
                    </span>
                  </div>
                  <div>
                    <h4 className="text-white font-medium text-lg">
                      {item.title}
                    </h4>
                    <p className="text-stone-500 text-sm">{item.desc}</p>
                  </div>
                  <ArrowRight className="w-5 h-5 text-stone-700 ml-auto flex-shrink-0 group-hover:text-emerald-500 transition-colors" />
                </div>
              ))}
            </div>

            {/* CTA */}
            <div className="mt-16 text-center">
              <div className="inline-flex items-center gap-3 px-8 py-4 bg-emerald-500/10 border border-emerald-500/30 rounded-full mb-8">
                <Mail className="w-5 h-5 text-emerald-500" />
                <span className="text-emerald-400 font-medium">
                  Ready to start? Contact us at americurial.com
                </span>
              </div>

              <div className="flex flex-col items-center gap-4">
                <div className="w-px h-8 bg-gradient-to-b from-transparent via-stone-700 to-transparent" />
                <div className="flex items-center gap-3">
                  <Shield className="w-4 h-4 text-stone-600" />
                  <p className="text-stone-600 text-sm tracking-wider">
                    Prepared by Americurial LLC — Veteran-Owned Federal Capture
                    Consulting
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Corner accents */}
          <div className="absolute top-8 left-8 w-16 h-16 border-l border-t border-stone-800" />
          <div className="absolute bottom-8 right-20 w-16 h-16 border-r border-b border-stone-800" />
        </section>
      </div>
    </>
  );
}
