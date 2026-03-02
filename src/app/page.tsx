import { Activity, Target, AlertCircle, RefreshCw, Zap, TrendingUp, Play, Calendar, Filter } from "lucide-react";
import clsx from "clsx";
import { createClient } from "@supabase/supabase-js";

// Force dynamic rendering
export const dynamic = 'force-dynamic';

export default async function AgencyDashboard() {

  // Connect to Supabase using .env.local variables
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY! // Safe in a Next.js Server Component
  );

  // Fetch Live Data Metrics
  const { count: opsCount } = await supabase.from("opportunities").select("*", { count: 'exact', head: true });
  const { count: hotCount } = await supabase.from("matches").select("*", { count: 'exact', head: true }).eq("classification", "HOT");
  const { count: outcomesCount } = await supabase.from("capture_outcomes").select("*", { count: 'exact', head: true });

  // Fetch High Priority HOT Matches
  const { data: hotMatches } = await supabase
    .from("matches")
    .select("score, classification, opportunity_id, contractor_id, opportunities(title, agency, notice_id, response_deadline), contractors(company_name)")
    .eq("classification", "HOT")
    .order("score", { ascending: false })
    .limit(5);

  const payload = {
    summary: {
      total_opportunities_ingested: opsCount || 0,
      hot_matches_generated: hotCount || 0,
      recent_outcomes_logged: outcomesCount || 0,
    },
    high_maturity_opportunities: ((hotMatches as any[]) || []).map((match: any) => ({
      notice_id: match.opportunities?.notice_id || "UNK",
      agency: match.opportunities?.agency || match.opportunities?.title || "Unknown",
      maturity_score: match.score,
      deadline: match.opportunities?.response_deadline || new Date().toISOString(),
      contractor: match.contractors?.company_name || "Unknown"
    }))
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">

      {/* Header & Actions */}
      <header className="flex items-end justify-between mb-10">
        <div>
          <h2 className="text-3xl font-bold font-typewriter tracking-tighter text-black">
            Internal Portal
          </h2>
          <p className="text-stone-500 mt-2 font-medium">
            Live Intelligence Overview
          </p>
        </div>
        <div className="flex space-x-3">
          <form action="/api/engine/ingest" method="POST" target="blank_iframe">
            <button type="submit" className="flex items-center space-x-2 bg-white text-stone-700 px-4 py-2.5 rounded-full border border-stone-200 hover:border-black hover:text-black hover:shadow-md transition-all text-sm font-medium">
              <RefreshCw className="w-4 h-4" />
              <span className="font-typewriter">Backfill 90D</span>
            </button>
          </form>
          <form action="/api/engine/score" method="POST" target="blank_iframe">
            <button type="submit" className="flex items-center space-x-2 bg-stone-100 text-black px-4 py-2.5 rounded-full border border-stone-300 hover:bg-stone-200 transition-all text-sm font-bold">
              <Zap className="w-4 h-4" />
              <span className="font-typewriter">Score Matches</span>
            </button>
          </form>
          <form action="/api/engine/drafts" method="POST" target="blank_iframe">
            <button type="submit" className="flex items-center space-x-2 bg-black text-white px-5 py-2.5 rounded-full shadow-lg shadow-stone-300 hover:bg-stone-800 transition-all text-sm font-bold">
              <Play className="w-4 h-4" />
              <span className="font-typewriter">Run Gen AI Engine</span>
            </button>
          </form>
        </div>
      </header>

      {/* Hidden iframe to prevent page reload on script trigger */}
      <iframe name="blank_iframe" id="blank_iframe" style={{ display: 'none' }}></iframe>

      {/* Live Active Filters Bar */}
      <section className="bg-stone-50 border border-stone-200 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-6">
          <div>
            <p className="text-[10px] font-typewriter text-stone-500 uppercase tracking-widest mb-1">Timeframe Scope</p>
            <div className="flex items-center space-x-2">
              <Calendar className="w-4 h-4 text-stone-400" />
              <span className="font-bold text-sm text-black">Trailing 30 Days</span>
            </div>
          </div>
          <div className="h-8 w-px bg-stone-200"></div>
          <div>
            <p className="text-[10px] font-typewriter text-stone-500 uppercase tracking-widest mb-1">Active NAICS Target</p>
            <div className="flex items-center space-x-2">
              <span className="bg-black text-white px-2 py-0.5 rounded font-mono text-xs">541512</span>
              <span className="bg-black text-white px-2 py-0.5 rounded font-mono text-xs">541519</span>
              <span className="bg-black text-white px-2 py-0.5 rounded font-mono text-xs">541611</span>
            </div>
          </div>
          <div className="h-8 w-px bg-stone-200 hidden md:block"></div>
          <div className="hidden md:block">
            <p className="text-[10px] font-typewriter text-stone-500 uppercase tracking-widest mb-1">Notice Types</p>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-sm text-black">Sources Sought, Solicitations</span>
            </div>
          </div>
        </div>
        <button className="text-xs font-typewriter font-bold bg-white border border-stone-200 px-4 py-2 rounded-full hover:bg-stone-100 transition-colors flex items-center shadow-sm">
          <Filter className="w-3 h-3 mr-2" /> Adjust Scope Control
        </button>
      </section>

      {/* KPI Cards */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <MetricCard
          title="Total Ingested"
          value={payload.summary.total_opportunities_ingested.toLocaleString()}
          icon={Activity}
        />
        <MetricCard
          title="HOT Matches Generated"
          value={payload.summary.hot_matches_generated}
          icon={Target}
          highlight
        />
        <MetricCard
          title="System Outcomes Logged"
          value={payload.summary.recent_outcomes_logged}
          icon={AlertCircle}
        />
      </section>

      {/* Two Column Layout */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* High Maturity Table */}
        <div className="lg:col-span-2 bg-white rounded-[32px] p-8 border border-stone-200 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-typewriter font-bold text-lg">Top HOT Matches</h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-stone-200 text-stone-400 text-xs font-typewriter uppercase tracking-wider">
                  <th className="pb-3 font-normal">Notice</th>
                  <th className="pb-3 font-normal">Agency/Title</th>
                  <th className="pb-3 font-normal">Matched Target</th>
                  <th className="pb-3 font-normal">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 text-sm">
                {payload.high_maturity_opportunities.length === 0 && (
                  <tr><td colSpan={4} className="py-8 text-center text-stone-400 font-typewriter">No HOT matches detected. Run Scoring Engine.</td></tr>
                )}
                {payload.high_maturity_opportunities.map((opp, idx) => (
                  <tr key={idx} className="hover:bg-stone-50 transition-colors group">
                    <td className="py-4 font-typewriter font-semibold text-black text-xs">{opp.notice_id}</td>
                    <td className="py-4 text-stone-600 truncate max-w-[200px] text-xs" title={opp.agency}>{opp.agency}</td>
                    <td className="py-4 text-stone-700 font-medium truncate max-w-[150px]">{opp.contractor}</td>
                    <td className="py-4">
                      <div className="flex items-center space-x-2">
                        <div className="w-16 h-1.5 bg-stone-100 rounded-full overflow-hidden">
                          <div
                            className={clsx("h-full rounded-full", opp.maturity_score > 0.8 ? "bg-black" : "bg-stone-400")}
                            style={{ width: `${opp.maturity_score * 100}%` }}
                          />
                        </div>
                        <span className="font-typewriter font-bold text-xs">{opp.maturity_score.toFixed(2)}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Intelligence Briefing */}
        <div className="bg-stone-900 rounded-[32px] p-8 text-white shadow-xl flex flex-col justify-between relative overflow-hidden">
          {/* Subtle noise/gradient background mock */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-stone-700 rounded-full blur-3xl opacity-20 -mr-10 -mt-10 pointer-events-none"></div>

          <div>
            <div className="w-10 h-10 rounded-full bg-stone-800 flex items-center justify-center mb-6">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <h3 className="font-typewriter text-xl font-bold mb-2">Weekly Briefing</h3>
            <p className="text-stone-400 text-xs leading-relaxed mb-8 font-sans">
              Intelligence generated from the last self-annealing analytical pass. System performance is deterministic.
            </p>

            <div className="space-y-6">
              <div className="bg-black/40 p-4 rounded-2xl border border-stone-800">
                <p className="text-stone-500 font-typewriter text-[10px] uppercase tracking-wider mb-1">Top Tracked NAICS</p>
                <p className="font-typewriter font-bold text-lg">541512</p>
              </div>
              <div className="bg-black/40 p-4 rounded-2xl border border-stone-800">
                <p className="text-stone-500 font-typewriter text-[10px] uppercase tracking-wider mb-1">Contractor Pool</p>
                <div className="flex items-end space-x-2">
                  <p className="font-typewriter font-bold text-2xl">50</p>
                  <span className="text-stone-400 text-xs font-bold mb-1">Active</span>
                </div>
              </div>
            </div>
          </div>

          <button className="w-full py-4 mt-8 rounded-full border border-stone-700 text-stone-300 font-typewriter text-sm font-bold hover:bg-white hover:text-black transition-all">
            Access Command Logs
          </button>
        </div>

      </section>
    </div>
  );
}

// Sub-component for KPI
function MetricCard({ title, value, icon: Icon, highlight = false }: { title: string, value: string | number, icon: any, highlight?: boolean }) {
  return (
    <div className={clsx(
      "p-6 rounded-[32px] flex flex-col justify-between transition-all duration-300",
      highlight ? "bg-white shadow-md border-2 border-black" : "bg-white border border-stone-200 shadow-sm"
    )}>
      <div className="flex justify-between items-start mb-4">
        <p className="text-sm font-medium text-stone-500 font-sans tracking-tight">{title}</p>
        <div className={clsx(
          "w-8 h-8 rounded-full flex items-center justify-center",
          highlight ? "bg-black text-white" : "bg-stone-100 text-stone-600"
        )}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div>
        <h4 className="text-4xl font-black font-typewriter tracking-tighter">{value}</h4>
      </div>
    </div>
  )
}
