"use client";

import { useEffect, useState } from "react";
import { Activity, Target, TrendingUp, Users, ArrowRight, Flame, Loader2, Clock, Briefcase, UserCheck } from "lucide-react";
import clsx from "clsx";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import DashboardActions from "@/components/DashboardActions";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ryxgjzehoijjvczqkhwr.supabase.co",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ5eGdqemVob2lqanZjenFraHdyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwNDg0NTUsImV4cCI6MjA4NzYyNDQ1NX0.q0HivHixjE-A2MuQZlmlZOO2eLpQEm8c6XhQQQKaJsY"
);

interface HotMatch {
  id: string;
  opportunity_id: string;
  contractor_id: string;
  notice_id: string;
  title: string;
  agency: string;
  naics: string;
  score_pct: number;
  deadline?: string;
  contractor: string;
  contractor_loc: string;
}

interface WarmMatch {
  id: string;
  opportunity_id: string;
  contractor_id: string;
  title: string;
  naics: string;
  score_pct: number;
  contractor: string;
}

export default function AgencyDashboard() {
  const [loading, setLoading] = useState(true);
  const [opsCount, setOpsCount] = useState(0);
  const [hotCount, setHotCount] = useState(0);
  const [warmCount, setWarmCount] = useState(0);
  const [contractorCount, setContractorCount] = useState(0);
  const [hotList, setHotList] = useState<HotMatch[]>([]);
  const [warmList, setWarmList] = useState<WarmMatch[]>([]);
  const [pipelineCount, setPipelineCount] = useState(0);
  const [lastScoredAt, setLastScoredAt] = useState<string | null>(null);

  useEffect(() => {
    async function loadDashboard() {
      // Run counts in parallel
      const [opsRes, hotRes, warmRes, conRes, pipeRes, freshRes] = await Promise.all([
        supabase.from("opportunities").select("*", { count: 'exact', head: true }).eq("is_archived", false),
        supabase.from("matches").select("*", { count: 'exact', head: true }).eq("classification", "HOT"),
        supabase.from("matches").select("*", { count: 'exact', head: true }).eq("classification", "WARM"),
        supabase.from("contractors").select("*", { count: 'exact', head: true }).neq("data_quality_flag", "LOW_QUALITY"),
        supabase.from("capture_outcomes").select("*", { count: 'exact', head: true }),
        supabase.from("matches").select("created_at").order("created_at", { ascending: false }).limit(1),
      ]);

      setOpsCount(opsRes.count || 0);
      setHotCount(hotRes.count || 0);
      setWarmCount(warmRes.count || 0);
      setContractorCount(conRes.count || 0);
      setPipelineCount(pipeRes.count || 0);
      if (freshRes.data && freshRes.data.length > 0) setLastScoredAt(freshRes.data[0].created_at);

      // Fetch HOT matches + WARM matches in parallel
      const [hotMatchRes, warmMatchRes] = await Promise.all([
        supabase.from("matches").select("id, score, opportunity_id, contractor_id").eq("classification", "HOT").order("score", { ascending: false }).limit(10),
        supabase.from("matches").select("id, score, opportunity_id, contractor_id").eq("classification", "WARM").order("score", { ascending: false }).limit(5),
      ]);

      const hotMatches = hotMatchRes.data || [];
      const warmMatches = warmMatchRes.data || [];

      // Collect all needed opp/contractor IDs
      const allOppIds = [...new Set([...hotMatches, ...warmMatches].map(m => m.opportunity_id))];
      const allConIds = [...new Set([...hotMatches, ...warmMatches].map(m => m.contractor_id))];

      // Fetch details in parallel
      const [oppsRes, consRes] = await Promise.all([
        allOppIds.length > 0 ? supabase.from("opportunities").select("id, title, notice_id, response_deadline, agency, naics_code, notice_type").in("id", allOppIds) : Promise.resolve({ data: [] }),
        allConIds.length > 0 ? supabase.from("contractors").select("id, company_name, city, state").in("id", allConIds) : Promise.resolve({ data: [] }),
      ]);

      const oppMap = new Map((oppsRes.data || []).map((o: Record<string, string>) => [o.id, o]));
      const conMap = new Map((consRes.data || []).map((c: Record<string, string>) => [c.id, c]));

      // Build hot list
      setHotList(hotMatches.map(m => {
        const opp = oppMap.get(m.opportunity_id) as Record<string, string> | undefined;
        const con = conMap.get(m.contractor_id) as Record<string, string> | undefined;
        return {
          id: m.id,
          opportunity_id: m.opportunity_id,
          contractor_id: m.contractor_id,
          notice_id: opp?.notice_id || "UNK",
          title: opp?.title || "Unknown",
          agency: opp?.agency || "Unknown Agency",
          naics: opp?.naics_code || "---",
          score_pct: Math.round(m.score * 100),
          deadline: opp?.response_deadline || undefined,
          contractor: con?.company_name || "Unknown",
          contractor_loc: [con?.city, con?.state].filter(Boolean).join(", ") || "",
        };
      }));

      // Build warm list
      setWarmList(warmMatches.map(m => {
        const opp = oppMap.get(m.opportunity_id) as Record<string, string> | undefined;
        const con = conMap.get(m.contractor_id) as Record<string, string> | undefined;
        return {
          id: m.id,
          opportunity_id: m.opportunity_id,
          contractor_id: m.contractor_id,
          title: opp?.title || "Unknown",
          naics: opp?.naics_code || "---",
          score_pct: Math.round(m.score * 100),
          contractor: con?.company_name || "Unknown",
        };
      }));

      setLoading(false);
    }
    loadDashboard();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <Loader2 className="w-10 h-10 animate-spin text-stone-400" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">

      {/* Header & Actions */}
      <header className="flex items-end justify-between mb-10">
        <div>
          <h2 className="text-3xl font-bold font-typewriter tracking-tighter text-black">
            Command Center
          </h2>
          <p className="text-stone-500 mt-2 font-medium">
            Live Intelligence Overview
          </p>
        </div>
        <DashboardActions />
      </header>

      {/* KPI Cards — All clickable */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard title="Active Opportunities" value={opsCount.toLocaleString()} icon={Activity} href="/opportunities" />
        <MetricCard title="HOT Matches" value={hotCount} icon={Flame} highlight href="/matches?class=HOT" />
        <MetricCard title="WARM Matches" value={warmCount.toLocaleString()} icon={Target} href="/matches?class=WARM" />
        <MetricCard title="Contractor Pool" value={contractorCount.toLocaleString()} icon={Users} href="/contractors" />
      </section>

      {/* Two Column Layout */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* HOT Matches Table */}
        <div className="lg:col-span-2 bg-white rounded-[32px] p-8 border border-stone-200 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-typewriter font-bold text-lg flex items-center">
              <Flame className="w-5 h-5 mr-2 text-red-500" /> HOT Matches
              <span className="ml-3 text-sm font-normal text-stone-400">Top scoring pairs</span>
            </h3>
            <Link href="/matches?class=HOT" className="text-xs font-typewriter font-bold bg-stone-100 border border-stone-200 px-4 py-2 rounded-full hover:bg-stone-200 transition-colors flex items-center">
              View All <ArrowRight className="w-3 h-3 ml-1" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-stone-200 text-stone-400 text-xs font-typewriter uppercase tracking-wider">
                  <th className="pb-3 font-normal">Score</th>
                  <th className="pb-3 font-normal">Opportunity</th>
                  <th className="pb-3 font-normal">Contractor</th>
                  <th className="pb-3 font-normal">NAICS</th>
                  <th className="pb-3 font-normal">Deadline</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 text-sm">
                {hotList.length === 0 && (
                  <tr><td colSpan={5} className="py-8 text-center text-stone-400 font-typewriter">No HOT matches detected. Click &quot;Score Matches&quot; above to generate.</td></tr>
                )}
                {hotList.map((opp) => (
                  <tr key={opp.id} className="hover:bg-stone-50 transition-colors group cursor-pointer">
                    <td className="py-4">
                      <div className="flex items-center space-x-2">
                        <div className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0"></div>
                        <span className="font-mono font-bold text-base">{opp.score_pct}</span>
                      </div>
                    </td>
                    <td className="py-4 max-w-[250px]">
                      <Link href={`/matches/${opp.opportunity_id}/${opp.contractor_id}`} className="hover:underline">
                        <p className="font-bold text-black line-clamp-1 text-sm">{opp.title}</p>
                        <p className="text-stone-500 text-xs line-clamp-1">{opp.agency}</p>
                      </Link>
                    </td>
                    <td className="py-4">
                      <p className="font-medium text-stone-800 text-sm">{opp.contractor}</p>
                      {opp.contractor_loc && <p className="text-stone-400 text-xs">{opp.contractor_loc}</p>}
                    </td>
                    <td className="py-4">
                      <span className="font-mono text-xs bg-stone-100 px-2 py-1 rounded border border-stone-200">{opp.naics}</span>
                    </td>
                    <td className="py-4">
                      <span className="font-bold text-xs text-stone-700">
                        {opp.deadline ? new Date(opp.deadline).toLocaleDateString() : "TBD"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Intelligence Briefing */}
        <div className="bg-gradient-to-br from-stone-900 via-stone-900 to-black rounded-[32px] p-8 text-white shadow-xl flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 w-40 h-40 bg-stone-600 rounded-full blur-3xl opacity-15 -mr-10 -mt-10 pointer-events-none"></div>
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-stone-700 rounded-full blur-3xl opacity-10 -ml-8 -mb-8 pointer-events-none"></div>

          <div>
            <div className="w-10 h-10 rounded-full bg-stone-800 flex items-center justify-center mb-6">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <h3 className="font-typewriter text-xl font-bold mb-2">Intelligence Brief</h3>
            <p className="text-stone-400 text-xs leading-relaxed mb-6 font-sans">
              Real-time metrics from scoring and enrichment engines.
            </p>

            <div className="space-y-4">
              <Link href="/matches" className="bg-black/40 p-4 rounded-2xl border border-stone-800 block hover:border-stone-600 transition-colors">
                <p className="text-stone-500 font-typewriter text-[10px] uppercase tracking-wider mb-1">Match Pipeline</p>
                <div className="flex items-end space-x-3">
                  <span className="font-typewriter font-bold text-2xl text-red-400">{hotCount}</span>
                  <span className="text-stone-500 text-xs font-bold mb-1">HOT</span>
                  <span className="font-typewriter font-bold text-xl text-amber-400">{warmCount.toLocaleString()}</span>
                  <span className="text-stone-500 text-xs font-bold mb-1">WARM</span>
                </div>
              </Link>
              <div className="grid grid-cols-2 gap-3">
                <Link href="/contractors" className="bg-black/40 p-4 rounded-2xl border border-stone-800 block hover:border-stone-600 transition-colors">
                  <p className="text-stone-500 font-typewriter text-[10px] uppercase tracking-wider mb-1">Contractors</p>
                  <p className="font-typewriter font-bold text-xl">{contractorCount.toLocaleString()}</p>
                </Link>
                <Link href="/pipeline" className="bg-black/40 p-4 rounded-2xl border border-stone-800 block hover:border-stone-600 transition-colors">
                  <p className="text-stone-500 font-typewriter text-[10px] uppercase tracking-wider mb-1 flex items-center"><Briefcase className="w-3 h-3 mr-1" />Pipeline</p>
                  <p className="font-typewriter font-bold text-xl">{pipelineCount}</p>
                </Link>
              </div>
              <div className="bg-black/40 p-4 rounded-2xl border border-stone-800">
                <p className="text-stone-500 font-typewriter text-[10px] uppercase tracking-wider mb-1 flex items-center"><Clock className="w-3 h-3 mr-1" />Last Scored</p>
                <p className="font-typewriter font-bold text-sm">
                  {lastScoredAt ? new Date(lastScoredAt).toLocaleString() : "Never"}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3 mt-6">
            <Link href="/portal" className="w-full py-3 rounded-full bg-white text-black font-typewriter text-sm font-bold hover:bg-stone-100 transition-all text-center block flex items-center justify-center">
              <UserCheck className="w-4 h-4 mr-2" /> Client Portal
            </Link>
            <Link href="/matches" className="w-full py-3 rounded-full border border-stone-700 text-stone-300 font-typewriter text-sm font-bold hover:bg-white hover:text-black transition-all text-center block">
              View All Matches
            </Link>
          </div>
        </div>

      </section>

      {/* Top WARM Matches Preview */}
      {warmList.length > 0 && (
        <section className="bg-white rounded-[32px] p-8 border border-stone-200 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-typewriter font-bold text-lg flex items-center">
              <Target className="w-5 h-5 mr-2 text-amber-500" /> Top WARM Matches
            </h3>
            <Link href="/matches?class=WARM" className="text-xs font-typewriter font-bold text-stone-500 hover:text-black transition-colors flex items-center">
              View All <ArrowRight className="w-3 h-3 ml-1" />
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {warmList.map((m) => (
              <Link key={m.id} href={`/matches/${m.opportunity_id}/${m.contractor_id}`} className="bg-stone-50 border border-stone-200 rounded-2xl p-4 hover:border-black hover:shadow-md transition-all group">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono font-bold text-lg">{m.score_pct}</span>
                  <span className="bg-amber-100 text-amber-700 text-[9px] font-typewriter px-2 py-0.5 rounded uppercase">WARM</span>
                </div>
                <p className="font-bold text-sm line-clamp-2 text-stone-800 group-hover:text-black mb-1">{m.title}</p>
                <p className="text-xs text-stone-500 line-clamp-1">{m.contractor}</p>
                <span className="font-mono text-[10px] text-stone-400 mt-2 block">{m.naics}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function MetricCard({ title, value, icon: Icon, highlight = false, href }: { title: string, value: string | number, icon: React.ComponentType<{ className?: string }>, highlight?: boolean, href?: string }) {
  const content = (
    <div className={clsx(
      "p-6 rounded-[32px] flex flex-col justify-between transition-all duration-300",
      highlight ? "bg-white shadow-md border-2 border-black" : "bg-white border border-stone-200 shadow-sm",
      href && "cursor-pointer hover:shadow-lg hover:border-black hover:-translate-y-0.5"
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
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }
  return content;
}
