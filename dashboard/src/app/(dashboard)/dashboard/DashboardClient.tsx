"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Target, Sparkles, ArrowRight, Loader2, Search, Shield, BarChart3, Layers, CheckSquare, UserCheck, FileText, Mic, Mail, Pencil } from "lucide-react";
import ServiceCTA from "@/components/ui/ServiceCTA";
import { MarketIntelligence } from "@/components/MarketIntelligence";
import { DashboardMarketCard } from "@/components/DashboardMarketCard";
import { SpendRadarCard } from "@/components/SpendRadarCard";
import DashboardCustomizer from "@/components/dashboard/DashboardCustomizer";
import GovTribeActivityCard from "@/components/dashboard/GovTribeActivityCard";
import { isHidden, type DashboardLayout } from "@/lib/dashboard-layout";
import clsx from "clsx";
import Link from "next/link";

interface UserProfile {
  id?: string;
  company_name: string;
  naics_codes: string[];
  sba_certifications: string[];
  state: string;
  target_states: string[];
  uei: string | null;
  cage_code: string | null;
  website: string | null;
  phone: string | null;
  employee_count: number | null;
  years_in_business: number | null;
  federal_awards_count: number | null;
}

interface TopOpp {
  id: string;
  title: string;
  agency: string;
  naics_code: string;
  notice_type: string;
  response_deadline: string;
  set_aside_code: string;
}

interface DashboardClientProps {
  profile: UserProfile;
  stats: {
    opsCount: number;
    hotMatchCount: number;
    warmMatchCount: number;
    totalMatchCount: number;
    urgentCount: number;
    topOpps: TopOpp[];
    pipelineCount: number;
    pipelineStages: Record<string, number>;
    actionsPending: number;
    actionsUrgent: number;
    competitorCount: number;
    recentPipeline: Array<{ id: string; stage: string; title: string; opportunity_id: string }>;
    pendingActions: Array<{ id: string; title: string; priority: string; opportunity_id: string }>;
    newOpps7d: number;
    newMatches7d: number;
  };
  initialLayout?: DashboardLayout;
}

function calculateProfileCompleteness(profile: UserProfile): { score: number; missing: string[] } {
  const checks: [boolean, string][] = [
    [!!profile.company_name, "Company Name"],
    [!!profile.uei, "UEI"],
    [!!profile.cage_code, "CAGE Code"],
    [(profile.naics_codes?.length || 0) > 0, "NAICS Codes"],
    [(profile.sba_certifications?.length || 0) > 0, "SBA Certifications"],
    [!!profile.state, "State"],
    [(profile.target_states?.length || 0) > 0, "Target States"],
    [!!profile.website, "Website"],
    [!!profile.phone, "Phone"],
    [!!profile.employee_count, "Employee Count"],
    [!!profile.years_in_business, "Years in Business"],
    [(profile.federal_awards_count || 0) > 0, "Past Federal Awards"],
  ];
  const completed = checks.filter(([ok]) => ok).length;
  const missing = checks.filter(([ok]) => !ok).map(([, label]) => label);
  return { score: Math.round((completed / checks.length) * 100), missing };
}

export default function DashboardClient({ profile, stats, initialLayout }: DashboardClientProps) {
  const router = useRouter();
  const [generatingMatches, setGeneratingMatches] = useState(false);
  const [layout, setLayout] = useState<DashboardLayout>(initialLayout || {});
  const show = (id: Parameters<typeof isHidden>[1]) => !isHidden(layout, id);

  const {
    opsCount,
    hotMatchCount,
    warmMatchCount,
    totalMatchCount,
    urgentCount,
    topOpps,
    pipelineCount,
    pipelineStages,
    actionsPending,
    actionsUrgent,
    competitorCount,
    recentPipeline,
    pendingActions,
    newOpps7d,
    newMatches7d
  } = stats;

  return (
    <div className="w-full 2xl:w-full 2xl:max-w-[1600px] mx-auto space-y-6 sm:space-y-8 animate-in fade-in duration-500 px-1">
      {/* Welcome Header — always shown; carries the Customize button */}
      <header className="flex items-start justify-between gap-3">
        <div>
          {show("welcome") && (
            <>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tighter text-black">
                Welcome back, {profile?.company_name || "there"}
              </h2>
              <p className="text-stone-500 mt-1 sm:mt-2 font-medium text-sm sm:text-base">
                Your contract matching dashboard
              </p>
            </>
          )}
        </div>
        <DashboardCustomizer initialLayout={layout} onLayoutChange={setLayout} />
      </header>

      {/* "This Week" hero strip — surfaces velocity (new opps + new matches)
          and routes to /matches with the URL-state filters from Tag 2. */}
      <section className="bg-gradient-to-br from-stone-900 via-stone-900 to-black text-white rounded-[24px] sm:rounded-[28px] p-5 sm:p-6 shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 sm:mb-5">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-emerald-300/80 font-semibold">This Week</p>
            <h3 className="text-lg sm:text-xl font-bold tracking-tight">What&apos;s new in your pipeline</h3>
          </div>
          <button
            type="button"
            onClick={async () => {
              setGeneratingMatches(true);
              try {
                await fetch("/api/matches/refresh", { method: "POST" });
                router.refresh();
              } catch { /* ignore */ }
              finally { setGeneratingMatches(false); }
            }}
            disabled={generatingMatches}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold bg-white text-stone-900 hover:bg-stone-100 disabled:opacity-60 transition self-start sm:self-auto"
          >
            {generatingMatches ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Refreshing…</> : <><Sparkles className="w-3.5 h-3.5" /> Refresh matches</>}
          </button>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <Link href="/matches" className="bg-white/5 hover:bg-white/10 rounded-[16px] sm:rounded-[20px] p-4 border border-white/10 transition">
            <p className="text-2xl sm:text-3xl font-black leading-none">{newMatches7d}</p>
            <p className="text-[10px] uppercase tracking-widest text-stone-400 mt-2">New matches</p>
            <p className="text-[10px] text-stone-500 mt-0.5">last 7 days</p>
          </Link>
          <Link href="/matches?max_deadline=7" className="bg-amber-900/30 hover:bg-amber-900/40 rounded-[16px] sm:rounded-[20px] p-4 border border-amber-700/40 transition">
            <p className="text-2xl sm:text-3xl font-black leading-none text-amber-200">{urgentCount}</p>
            <p className="text-[10px] uppercase tracking-widest text-amber-300/90 mt-2">Expiring soon</p>
            <p className="text-[10px] text-amber-400/70 mt-0.5">deadline ≤ 7 days</p>
          </Link>
          <Link href="/matches?filter=HOT" className="bg-rose-900/30 hover:bg-rose-900/40 rounded-[16px] sm:rounded-[20px] p-4 border border-rose-700/40 transition">
            <p className="text-2xl sm:text-3xl font-black leading-none text-rose-200">{hotMatchCount}</p>
            <p className="text-[10px] uppercase tracking-widest text-rose-300/90 mt-2">Strong matches</p>
            <p className="text-[10px] text-rose-400/70 mt-0.5">≥ 70% fit score</p>
          </Link>
          <Link href="/opportunities" className="bg-emerald-900/30 hover:bg-emerald-900/40 rounded-[16px] sm:rounded-[20px] p-4 border border-emerald-700/40 transition">
            <p className="text-2xl sm:text-3xl font-black leading-none text-emerald-200">{newOpps7d.toLocaleString()}</p>
            <p className="text-[10px] uppercase tracking-widest text-emerald-300/90 mt-2">New opportunities</p>
            <p className="text-[10px] text-emerald-400/70 mt-0.5">ingested last 7 days</p>
          </Link>
        </div>

        {/* Quick filter pills — pre-built deep links into /matches via Tag-2 URL state */}
        <div className="flex flex-wrap gap-1.5 mt-4 sm:mt-5">
          <span className="text-[10px] uppercase tracking-widest text-stone-400 self-center mr-1">Jump to:</span>
          <Link href="/matches?notice_type=Sources%20Sought" className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/20 transition">Sources Sought</Link>
          <Link href="/matches?notice_type=Presolicitation" className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/20 transition">Pre-Sol</Link>
          <Link href="/matches?set_aside=8(a)" className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/20 transition">8(a)</Link>
          <Link href="/matches?set_aside=HUBZone" className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/20 transition">HUBZone</Link>
          <Link href="/matches?set_aside=WOSB" className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/20 transition">WOSB</Link>
          <Link href="/matches?set_aside=SDVOSB" className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/20 transition">SDVOSB</Link>
          <Link href="/matches?filter=SAVED" className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/20 transition">⭐ Saved</Link>
        </div>
      </section>

      {/* KPI Cards */}
      {show("kpi_cards") && (
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <KpiCard
          title="Matched Opportunities"
          value={totalMatchCount}
          subtitle={`${hotMatchCount} strong, ${warmMatchCount} good`}
          icon={Target}
          href="/matches"
          highlight
        />
        <KpiCard
          title="Pipeline Deals"
          value={pipelineCount}
          subtitle={pipelineCount > 0 ? `${Object.keys(pipelineStages).length} stages active` : "Add deals from matches"}
          icon={Layers}
          href="/pipeline"
          color="emerald"
        />
        <KpiCard
          title="Pending Action Items"
          value={actionsPending}
          subtitle={actionsUrgent > 0 ? `${actionsUrgent} urgent` : "Across all pursuits"}
          icon={CheckSquare}
          href="/pipeline"
        />
        <KpiCard
          title="Competitors Tracked"
          value={competitorCount}
          subtitle={competitorCount > 0 ? "Click to view intel" : "Analyze your competition"}
          icon={Shield}
          href="/competitors"
        />
      </section>
      )}

      {/* Compact market card */}
      {show("market_card") && profile && profile.naics_codes.length > 0 && (
        <section>
          <DashboardMarketCard naicsCodes={profile.naics_codes} />
        </section>
      )}

      {/* Year-End Spend Radar */}
      {show("spend_radar") && <SpendRadarCard />}

      {/* Federal Market Pulse — last 14 days via GovTribe */}
      <GovTribeActivityCard days={14} naicsIds={profile?.naics_codes && profile.naics_codes.length > 0 ? profile.naics_codes : undefined} />

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start mt-6">
        {/* LEFT COLUMN */}
        <div className="xl:col-span-8 flex flex-col gap-6">
          {/* Quick Actions */}
          {show("quick_actions") && (
          <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
            <Link href="/check" className="bg-gradient-to-br from-emerald-700 to-emerald-900 text-white rounded-[20px] sm:rounded-[24px] p-4 sm:p-5 hover:shadow-xl transition-all group">
              <Search className="w-5 h-5 mb-2 text-emerald-300 group-hover:text-white transition-colors" />
              <h4 className="font-bold text-sm mb-0.5">Quick Check</h4>
              <p className="text-emerald-300/80 text-[10px]">Analyze any company</p>
            </Link>
            <Link href="/ai-drafter/proposals" className="bg-gradient-to-br from-stone-900 to-black text-white rounded-[20px] sm:rounded-[24px] p-4 sm:p-5 hover:shadow-xl transition-all group">
              <FileText className="w-5 h-5 mb-2 text-stone-400 group-hover:text-white transition-colors" />
              <h4 className="font-bold text-sm mb-0.5">Draft Proposal</h4>
              <p className="text-stone-400 text-[10px]">AI-powered writing</p>
            </Link>
            <Link href="/ai-drafter?tab=email" className="bg-white border border-stone-200 rounded-[20px] sm:rounded-[24px] p-4 sm:p-5 hover:shadow-lg hover:border-stone-300 transition-all group">
              <Mail className="w-5 h-5 mb-2 text-stone-400 group-hover:text-black transition-colors" />
              <h4 className="font-bold text-sm mb-0.5">Email Drafter</h4>
              <p className="text-stone-400 text-[10px]">POC outreach</p>
            </Link>
            <Link href="/ai-drafter?tab=template" className="bg-white border border-stone-200 rounded-[20px] sm:rounded-[24px] p-4 sm:p-5 hover:shadow-lg hover:border-stone-300 transition-all group">
              <Pencil className="w-5 h-5 mb-2 text-stone-400 group-hover:text-black transition-colors" />
              <h4 className="font-bold text-sm mb-0.5">Template Drafter</h4>
              <p className="text-stone-400 text-[10px]">Reusable sections</p>
            </Link>
            <Link href="/matches" className="bg-white border border-stone-200 rounded-[20px] sm:rounded-[24px] p-4 sm:p-5 hover:shadow-lg hover:border-stone-300 transition-all group">
              <Target className="w-5 h-5 mb-2 text-stone-400 group-hover:text-black transition-colors" />
              <h4 className="font-bold text-sm mb-0.5">View Matches</h4>
              <p className="text-stone-400 text-[10px]">{totalMatchCount} opportunities</p>
            </Link>
            <Link href="/ai-drafter/capability-statement" className="bg-white border border-stone-200 rounded-[20px] sm:rounded-[24px] p-4 sm:p-5 hover:shadow-lg hover:border-stone-300 transition-all group">
              <Mic className="w-5 h-5 mb-2 text-stone-400 group-hover:text-black transition-colors" />
              <h4 className="font-bold text-sm mb-0.5">Cap Statement</h4>
              <p className="text-stone-400 text-[10px]">Build your statement</p>
            </Link>
          </section>
          )}

          {/* Top Matching Opportunities */}
          {show("top_opps") && (
          <section className="bg-white rounded-[24px] sm:rounded-[32px] p-5 sm:p-6 border border-stone-200 shadow-sm">
            <div className="flex flex-col gap-4 mb-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <h3 className="font-bold text-base sm:text-lg flex items-center">
                  <Sparkles className="w-5 h-5 mr-2 text-stone-400" />
                  Opportunities
                </h3>
                <Link href="/opportunities" className="text-xs font-bold bg-stone-100 border border-stone-200 px-4 py-2 rounded-full hover:bg-stone-200 transition-colors flex items-center self-start sm:self-auto">
                  Browse All <ArrowRight className="w-3 h-3 ml-1" />
                </Link>
              </div>
              
              {/* Quick Filters */}
              <div className="flex items-center space-x-2 flex-wrap border-b border-stone-100 pb-2">
                 <button className="text-xs font-bold px-3 py-1.5 rounded-full bg-black text-white transition-all">All Opportunities</button>
                 <button className="text-xs font-bold px-3 py-1.5 rounded-full bg-white text-stone-500 hover:bg-stone-100 transition-all">Strong Matches</button>
                 <button className="text-xs font-bold px-3 py-1.5 rounded-full bg-white text-stone-500 hover:bg-stone-100 transition-all">Good Matches</button>
                 <button className="text-xs font-bold px-3 py-1.5 rounded-full bg-white text-stone-500 hover:bg-stone-100 transition-all">Possible Matches</button>
              </div>
            </div>

            {topOpps.length === 0 ? (
              <div className="text-center py-8 sm:py-12">
                <Sparkles className="w-10 h-10 text-stone-300 mx-auto mb-3" />
                <p className="text-stone-500 text-sm mb-2">
                  {generatingMatches ? "Loading opportunities..." : "No opportunities found"}
                </p>
                <p className="text-stone-400 text-xs mb-4">
                  {generatingMatches
                    ? "This usually takes 10-30 seconds. We're scoring opportunities against your profile."
                    : "We couldn't find any opportunities matching these criteria."}
                </p>
                <div className="flex items-center justify-center gap-3 flex-wrap">
                  <button
                    type="button"
                    onClick={async () => {
                      setGeneratingMatches(true);
                      try {
                        await fetch("/api/matches/refresh", { method: "POST" });
                        window.location.reload();
                      } catch { setGeneratingMatches(false); }
                    }}
                    disabled={generatingMatches}
                    className="bg-black text-white px-6 py-2.5 rounded-full text-sm font-bold inline-flex items-center disabled:opacity-60"
                  >
                    {generatingMatches ? (
                      <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> Generating...</>
                    ) : (
                      <><Sparkles className="w-3.5 h-3.5 mr-2" /> Find Opportunities</>
                    )}
                  </button>
                  <Link href="/settings" className="bg-white text-stone-700 border border-stone-200 px-6 py-2.5 rounded-full text-sm font-bold inline-flex items-center hover:bg-stone-50">
                    Update Profile <ArrowRight className="w-3 h-3 ml-2" />
                  </Link>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {topOpps.map((opp) => {
                  const isEasyWin = opp.notice_type?.includes("Sources Sought") && opp.set_aside_code;
                  return (
                    <Link
                      key={opp.id}
                      href={`/opportunities/${opp.id}`}
                      className="block bg-stone-50 hover:bg-stone-100 active:bg-stone-200 border border-stone-200 hover:border-stone-300 rounded-xl sm:rounded-2xl p-3 sm:p-4 transition-all"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            {isEasyWin && (
                              <span className="text-[9px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded uppercase">Easy Win</span>
                            )}
                            {opp.notice_type && (
                              <span className={clsx(
                                "text-[9px] px-2 py-0.5 rounded border uppercase tracking-widest",
                                opp.notice_type.includes("Sources Sought") ? "bg-emerald-50 text-emerald-600 border-emerald-200" :
                                opp.notice_type.includes("Presolicitation") ? "bg-blue-50 text-blue-600 border-blue-200" :
                                "bg-stone-100 text-stone-500 border-stone-200"
                              )}>
                                {opp.notice_type}
                              </span>
                            )}
                          </div>
                          <p className="font-bold text-sm text-black line-clamp-1">{opp.title}</p>
                          <p className="text-xs text-stone-500 line-clamp-1">{opp.agency}</p>
                        </div>
                        <div className="flex items-center gap-3 text-xs flex-shrink-0">
                          <span className="font-mono bg-stone-200 px-2 py-0.5 rounded text-stone-600">{opp.naics_code}</span>
                          <span className="font-bold text-stone-700 whitespace-nowrap">
                            {opp.response_deadline ? new Date(opp.response_deadline).toLocaleDateString() : "TBD"}
                          </span>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>
          )}
        </div>

        {/* RIGHT COLUMN */}
        <div className="xl:col-span-4 flex flex-col gap-6">
          {/* Profile Summary */}
          {show("profile_summary") && profile && (
            <section className="bg-white rounded-[24px] sm:rounded-[32px] p-5 sm:p-6 border border-stone-200 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                <h3 className="font-bold text-base sm:text-lg flex items-center">
                  <BarChart3 className="w-5 h-5 mr-2 text-stone-400" />
                  Your Profile
                </h3>
                <Link href="/settings" className="text-xs font-bold text-stone-500 hover:text-black transition-colors flex items-center">
                  Edit Profile <ArrowRight className="w-3 h-3 ml-1" />
                </Link>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-stone-50 rounded-xl p-3 border border-stone-100">
                  <p className="text-[10px] text-stone-400 uppercase tracking-widest mb-1">NAICS Codes</p>
                  <div className="flex flex-wrap gap-1">
                    {profile.naics_codes?.slice(0, 4).map(n => (
                      <span key={n} className="font-mono text-xs bg-black text-white px-2 py-0.5 rounded">{n}</span>
                    ))}
                    {(profile.naics_codes?.length || 0) > 4 && <span className="text-xs text-stone-400">+{profile.naics_codes.length - 4}</span>}
                    {(!profile.naics_codes || profile.naics_codes.length === 0) && <span className="text-xs text-stone-400">Not set</span>}
                  </div>
                </div>
                <div className="bg-stone-50 rounded-xl p-3 border border-stone-100">
                  <p className="text-[10px] text-stone-400 uppercase tracking-widest mb-1">Certifications</p>
                  <div className="flex flex-wrap gap-1">
                    {profile.sba_certifications?.slice(0, 3).map(c => (
                      <span key={c} className="text-xs font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded">{c}</span>
                    ))}
                    {(!profile.sba_certifications || profile.sba_certifications.length === 0) && <span className="text-xs text-stone-400">None</span>}
                  </div>
                </div>
                <div className="bg-stone-50 rounded-xl p-3 border border-stone-100">
                  <p className="text-[10px] text-stone-400 uppercase tracking-widest mb-1">Location</p>
                  <p className="font-bold text-sm">{profile.state || "Not set"}</p>
                  {profile.target_states?.length > 0 && (
                    <p className="text-xs text-stone-400 mt-0.5">Serving {profile.target_states.length} states</p>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* Pipeline & Action Items Summary */}
          {show("pipeline_summary") && (pipelineCount > 0 || actionsPending > 0) && (
            <section className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <Link href="/pipeline" className="bg-white rounded-[24px] sm:rounded-[32px] p-5 sm:p-6 border border-stone-200 shadow-sm hover:shadow-md hover:border-stone-300 transition-all">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-base flex items-center">
                    <Layers className="w-5 h-5 mr-2 text-stone-400" /> Pipeline
                  </h3>
                  <ArrowRight className="w-4 h-4 text-stone-400" />
                </div>
                {pipelineCount > 0 ? (
                  <div className="space-y-1">
                    {Object.entries(pipelineStages).filter(([, count]) => count > 0).map(([stage, count]) => (
                      <div key={stage} className="flex items-center justify-between text-xs">
                        <span className="text-stone-500 capitalize">{stage.replace("_", " ")}</span>
                        <span className="font-bold text-stone-700">{count}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-stone-400">No opportunities in pipeline</p>
                )}
              </Link>
              <Link href="/pipeline" className="bg-white rounded-[24px] sm:rounded-[32px] p-5 sm:p-6 border border-stone-200 shadow-sm hover:shadow-md hover:border-stone-300 transition-all">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-base flex items-center">
                    <CheckSquare className="w-5 h-5 mr-2 text-stone-400" /> Action Items
                  </h3>
                  <ArrowRight className="w-4 h-4 text-stone-400" />
                </div>
                {actionsPending > 0 ? (
                  <div>
                    <p className="text-2xl font-black tracking-tighter">{actionsPending}</p>
                    <p className="text-xs text-stone-500">
                      pending{actionsUrgent > 0 && <span className="text-red-600 font-bold"> ({actionsUrgent} high priority)</span>}
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-stone-400">No pending action items</p>
                )}
              </Link>
            </section>
          )}

          {/* Action Items + Pipeline preview */}
          {show("action_items_summary") && (pendingActions.length > 0 || recentPipeline.length > 0) && (
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Action Items Preview */}
              {pendingActions.length > 0 && (
                <div className="bg-white border border-stone-200 rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-bold text-sm flex items-center"><CheckSquare className="w-4 h-4 mr-2 text-stone-400" /> Action Items</h3>
                    <Link href="/pipeline" className="text-xs text-stone-500 hover:text-black inline-flex items-center">View all <ArrowRight className="w-3 h-3 ml-1" /></Link>
                  </div>
                  <div className="space-y-1.5">
                    {pendingActions.map(a => (
                      <Link key={a.id} href={`/opportunities/${a.opportunity_id}`}
                            className="block p-3 rounded-xl border border-stone-100 hover:bg-stone-50">
                        <div className="flex items-center gap-2">
                          <span className={clsx(
                            "text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded border",
                            a.priority === "high" ? "bg-red-50 text-red-700 border-red-200" :
                            a.priority === "medium" ? "bg-amber-50 text-amber-700 border-amber-200" :
                            "bg-stone-50 text-stone-600 border-stone-200",
                          )}>
                            {a.priority}
                          </span>
                          <p className="text-xs text-stone-800 line-clamp-1">{a.title}</p>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Pipeline Preview */}
              {recentPipeline.length > 0 && (
                <div className="bg-white border border-stone-200 rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-bold text-sm flex items-center"><Layers className="w-4 h-4 mr-2 text-stone-400" /> Recent Pipeline Activity</h3>
                    <Link href="/pipeline" className="text-xs text-stone-500 hover:text-black inline-flex items-center">Open pipeline <ArrowRight className="w-3 h-3 ml-1" /></Link>
                  </div>
                  <div className="space-y-1.5">
                    {recentPipeline.map(p => (
                      <Link key={p.id} href={`/opportunities/${p.opportunity_id}`}
                            className="block p-3 rounded-xl border border-stone-100 hover:bg-stone-50">
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded border bg-stone-100 text-stone-700 border-stone-200">
                            {p.stage}
                          </span>
                          <p className="text-xs text-stone-800 line-clamp-1">{p.title}</p>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Profile Completeness */}
          {profile && (() => {
            const { score, missing } = calculateProfileCompleteness(profile);
            return (
              <section className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="bg-white rounded-[24px] sm:rounded-[32px] p-5 sm:p-6 border border-stone-200 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-bold text-base flex items-center">
                      <UserCheck className="w-5 h-5 mr-2 text-stone-400" /> Profile Strength
                    </h3>
                    <span className={clsx("text-sm font-black",
                      score >= 80 ? "text-emerald-600" : score >= 50 ? "text-amber-600" : "text-red-600"
                    )}>{score}%</span>
                  </div>
                  <div className="w-full bg-stone-200 rounded-full h-2 mb-3">
                    <div className={clsx("rounded-full h-2 transition-all duration-500",
                      score >= 80 ? "bg-emerald-500" : score >= 50 ? "bg-amber-500" : "bg-red-500"
                    )} style={{ width: `${score}%` }} />
                  </div>
                  {missing.length > 0 && score < 100 && (
                    <div>
                      <p className="text-[10px] text-stone-400 uppercase tracking-widest mb-1.5">Missing</p>
                      <div className="flex flex-wrap gap-1 mb-2">
                        {missing.slice(0, 5).map(field => {
                          const slug = field.toLowerCase().replace(/\s+/g, "-").replace(/[()]/g, "");
                          return (
                            <Link key={field} href={`/settings#${slug}`}
                              className="text-[10px] bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded hover:bg-red-100 transition-colors cursor-pointer">
                              {field}
                            </Link>
                          );
                        })}
                        {missing.length > 5 && <span className="text-[10px] text-stone-400">+{missing.length - 5} more</span>}
                      </div>
                      <Link href="/settings" className="text-xs font-bold text-black hover:underline inline-flex items-center">
                        Complete Profile <ArrowRight className="w-3 h-3 ml-1" />
                      </Link>
                    </div>
                  )}
                  {score >= 100 && (
                    <p className="text-xs text-emerald-600 font-bold">Your profile is complete. You are getting the best possible matches.</p>
                  )}
                </div>
                <ServiceCTA
                  title="Book a Free Strategy Call"
                  description="Talk to a GovCon expert about your pipeline, winning strategies, and how to grow your federal business."
                  variant="dark"
                />
              </section>
            );
          })()}
        </div>
      </div>

      {/* Market Intelligence */}
      {profile && profile.naics_codes.length > 0 && (
        <MarketIntelligence naicsCodes={profile.naics_codes} companyName={profile.company_name} />
      )}
    </div>
  );
}

function KpiCard({ title, value, subtitle, icon: Icon, href, highlight = false, color }: {
  title: string; value: string | number; subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  href?: string; highlight?: boolean; color?: string;
}) {
  const colorMap: Record<string, string> = {
    emerald: "border-emerald-200 bg-gradient-to-br from-emerald-50 to-white",
    red: "border-red-200 bg-gradient-to-br from-red-50 to-white",
  };

  const content = (
    <div className={clsx(
      "p-4 sm:p-5 rounded-[20px] sm:rounded-[28px] flex flex-col justify-between transition-all duration-300",
      highlight ? "bg-white shadow-md border-2 border-black" : color && colorMap[color] ? colorMap[color] + " border shadow-sm" : "bg-white border border-stone-200 shadow-sm",
      href && "cursor-pointer hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0"
    )}>
      <div className="flex justify-between items-start mb-3">
        <p className="text-xs sm:text-sm font-medium text-stone-500 font-sans tracking-tight">{title}</p>
        <div className={clsx(
          "w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center flex-shrink-0",
          highlight ? "bg-black text-white" : color === "emerald" ? "bg-emerald-100 text-emerald-600" : color === "red" ? "bg-red-100 text-red-600" : "bg-stone-100 text-stone-600"
        )}>
          <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </div>
      </div>
      <div>
        <h4 className="text-2xl sm:text-3xl font-black tracking-tighter">{value}</h4>
        <p className="text-[10px] sm:text-xs text-stone-400 mt-0.5">{subtitle}</p>
      </div>
    </div>
  );

  if (href) return <Link href={href}>{content}</Link>;
  return content;
}
