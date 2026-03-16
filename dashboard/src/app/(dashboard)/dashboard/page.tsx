"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, Target, Zap, ArrowRight, Loader2, Clock, Trophy, Search, Shield, BarChart3, Layers, CheckSquare, Phone, UserCheck } from "lucide-react";
import ServiceCTA from "@/components/ui/ServiceCTA";
import clsx from "clsx";
import Link from "next/link";
import { createSupabaseClient } from "@/lib/supabase/client";

const supabase = createSupabaseClient();

interface UserProfile {
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

interface TopOpp {
  id: string;
  title: string;
  agency: string;
  naics_code: string;
  notice_type: string;
  response_deadline: string;
  set_aside_code: string;
}

export default function UserDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [opsCount, setOpsCount] = useState(0);
  const [easyWinsCount, setEasyWinsCount] = useState(0);
  const [naicsMatchCount, setNaicsMatchCount] = useState(0);
  const [urgentCount, setUrgentCount] = useState(0);
  const [topOpps, setTopOpps] = useState<TopOpp[]>([]);
  const [pipelineCount, setPipelineCount] = useState(0);
  const [pipelineStages, setPipelineStages] = useState<Record<string, number>>({});
  const [actionsPending, setActionsPending] = useState(0);
  const [actionsUrgent, setActionsUrgent] = useState(0);

  useEffect(() => {
    async function loadDashboard() {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }

      // Get user profile
      const { data: profileData } = await supabase
        .from("user_profiles")
        .select("id, company_name, naics_codes, sba_certifications, state, target_states, uei, cage_code, website, phone, employee_count, years_in_business, federal_awards_count")
        .eq("auth_user_id", user.id)
        .single();

      if (!profileData) {
        router.push("/onboard");
        return;
      }
      setProfile(profileData as UserProfile);

      const userNaics = (profileData as UserProfile).naics_codes || [];
      const today = new Date().toISOString().split("T")[0];

      // Run all counts in parallel
      const [opsRes, naicsRes, easyRes, urgentRes, topRes] = await Promise.all([
        // Total active opportunities
        supabase.from("opportunities").select("*", { count: "exact", head: true }).eq("is_archived", false),
        // NAICS matched opportunities
        userNaics.length > 0
          ? supabase.from("opportunities").select("*", { count: "exact", head: true }).eq("is_archived", false).in("naics_code", userNaics)
          : Promise.resolve({ count: 0 }),
        // Easy wins: Sources Sought with set-aside + active deadline
        supabase.from("opportunities").select("*", { count: "exact", head: true })
          .eq("is_archived", false)
          .ilike("notice_type", "%Sources Sought%")
          .not("set_aside_code", "is", null)
          .gte("response_deadline", today),
        // Urgent: deadlines in 7 days
        supabase.from("opportunities").select("*", { count: "exact", head: true })
          .eq("is_archived", false)
          .lte("response_deadline", new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString())
          .gte("response_deadline", today),
        // Top matching opportunities by NAICS
        userNaics.length > 0
          ? supabase.from("opportunities")
            .select("id, title, agency, naics_code, notice_type, response_deadline, set_aside_code")
            .eq("is_archived", false)
            .in("naics_code", userNaics)
            .gte("response_deadline", today)
            .order("response_deadline", { ascending: true })
            .limit(8)
          : Promise.resolve({ data: [] }),
      ]);

      setOpsCount(opsRes.count || 0);
      setNaicsMatchCount((naicsRes as { count: number | null }).count || 0);
      setEasyWinsCount(easyRes.count || 0);
      setUrgentCount(urgentRes.count || 0);
      setTopOpps((topRes.data || []) as TopOpp[]);

      // Fetch pipeline and action item counts
      const profileId = (profileData as Record<string, unknown>).id as string;
      if (profileId) {
        const [pursuitRes, actionsRes] = await Promise.all([
          supabase.from("user_pursuits").select("stage").eq("user_profile_id", profileId),
          supabase.from("user_action_items").select("status, priority").eq("user_profile_id", profileId),
        ]);

        const pursuits = (pursuitRes.data || []) as Array<{ stage: string }>;
        setPipelineCount(pursuits.length);
        const stages: Record<string, number> = {};
        pursuits.forEach(p => { stages[p.stage] = (stages[p.stage] || 0) + 1; });
        setPipelineStages(stages);

        const actions = (actionsRes.data || []) as Array<{ status: string; priority: string }>;
        setActionsPending(actions.filter(a => a.status !== "completed").length);
        setActionsUrgent(actions.filter(a => a.priority === "high" && a.status !== "completed").length);
      }

      setLoading(false);
    }
    loadDashboard();
  }, [router]);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <Loader2 className="w-10 h-10 animate-spin text-stone-400" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 sm:space-y-8 animate-in fade-in duration-500 px-1">

      {/* Welcome Header */}
      <header>
        <h2 className="text-2xl sm:text-3xl font-bold font-typewriter tracking-tighter text-black">
          Welcome back, {profile?.company_name || "there"}
        </h2>
        <p className="text-stone-500 mt-1 sm:mt-2 font-medium text-sm sm:text-base">
          Your contract matching dashboard
        </p>
      </header>

      {/* KPI Cards */}
      <section className="grid grid-cols-2 gap-3 sm:gap-4">
        <KpiCard
          title="Your Matches"
          value={naicsMatchCount}
          subtitle="Opportunities matching your NAICS"
          icon={Target}
          href="/opportunities"
          highlight
        />
        <KpiCard
          title="Easy Wins"
          value={easyWinsCount}
          subtitle="Sources Sought with set-asides"
          icon={Trophy}
          href="/opportunities"
          color="emerald"
        />
        <KpiCard
          title="Active Opps"
          value={opsCount.toLocaleString()}
          subtitle="Total federal opportunities"
          icon={Activity}
          href="/opportunities"
        />
        <KpiCard
          title="Urgent"
          value={urgentCount}
          subtitle="Deadlines in 7 days"
          icon={Clock}
          href="/opportunities"
          color={urgentCount > 0 ? "red" : undefined}
        />
      </section>

      {/* Profile Summary */}
      {profile && (
        <section className="bg-white rounded-[24px] sm:rounded-[32px] p-5 sm:p-6 border border-stone-200 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <h3 className="font-typewriter font-bold text-base sm:text-lg flex items-center">
              <BarChart3 className="w-5 h-5 mr-2 text-stone-400" />
              Your Profile
            </h3>
            <Link href="/settings" className="text-xs font-typewriter font-bold text-stone-500 hover:text-black transition-colors flex items-center">
              Edit Profile <ArrowRight className="w-3 h-3 ml-1" />
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-stone-50 rounded-xl p-3 border border-stone-100">
              <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-1">NAICS Codes</p>
              <div className="flex flex-wrap gap-1">
                {profile.naics_codes?.slice(0, 4).map(n => (
                  <span key={n} className="font-mono text-xs bg-black text-white px-2 py-0.5 rounded">{n}</span>
                ))}
                {(profile.naics_codes?.length || 0) > 4 && <span className="text-xs text-stone-400">+{profile.naics_codes.length - 4}</span>}
                {(!profile.naics_codes || profile.naics_codes.length === 0) && <span className="text-xs text-stone-400">Not set</span>}
              </div>
            </div>
            <div className="bg-stone-50 rounded-xl p-3 border border-stone-100">
              <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-1">Certifications</p>
              <div className="flex flex-wrap gap-1">
                {profile.sba_certifications?.slice(0, 3).map(c => (
                  <span key={c} className="text-xs font-typewriter font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded">{c}</span>
                ))}
                {(!profile.sba_certifications || profile.sba_certifications.length === 0) && <span className="text-xs text-stone-400">None</span>}
              </div>
            </div>
            <div className="bg-stone-50 rounded-xl p-3 border border-stone-100">
              <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-1">Location</p>
              <p className="font-bold text-sm">{profile.state || "Not set"}</p>
              {profile.target_states?.length > 0 && (
                <p className="text-xs text-stone-400 mt-0.5">Serving {profile.target_states.length} states</p>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Profile Completeness + Service CTA */}
      {profile && (() => {
        const { score, missing } = calculateProfileCompleteness(profile);
        return (
          <section className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div className="bg-white rounded-[24px] sm:rounded-[32px] p-5 sm:p-6 border border-stone-200 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-typewriter font-bold text-base flex items-center">
                  <UserCheck className="w-5 h-5 mr-2 text-stone-400" /> Profile Strength
                </h3>
                <span className={clsx("text-sm font-black font-typewriter",
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
                  <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-1.5">Missing</p>
                  <p className="text-xs text-stone-500">{missing.slice(0, 3).join(", ")}{missing.length > 3 ? ` +${missing.length - 3} more` : ""}</p>
                  <Link href="/settings" className="text-xs font-typewriter font-bold text-black hover:underline mt-2 inline-flex items-center">
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

      {/* Pipeline & Action Items Summary */}
      {(pipelineCount > 0 || actionsPending > 0) && (
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <Link href="/pipeline" className="bg-white rounded-[24px] sm:rounded-[32px] p-5 sm:p-6 border border-stone-200 shadow-sm hover:shadow-md hover:border-stone-300 transition-all">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-typewriter font-bold text-base flex items-center">
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
          <Link href="/actions" className="bg-white rounded-[24px] sm:rounded-[32px] p-5 sm:p-6 border border-stone-200 shadow-sm hover:shadow-md hover:border-stone-300 transition-all">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-typewriter font-bold text-base flex items-center">
                <CheckSquare className="w-5 h-5 mr-2 text-stone-400" /> Action Items
              </h3>
              <ArrowRight className="w-4 h-4 text-stone-400" />
            </div>
            {actionsPending > 0 ? (
              <div>
                <p className="text-2xl font-black font-typewriter tracking-tighter">{actionsPending}</p>
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

      {/* Top Matching Opportunities */}
      <section className="bg-white rounded-[24px] sm:rounded-[32px] p-5 sm:p-6 border border-stone-200 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h3 className="font-typewriter font-bold text-base sm:text-lg flex items-center">
            <Zap className="w-5 h-5 mr-2 text-stone-400" />
            Top Matches for You
          </h3>
          <Link href="/opportunities" className="text-xs font-typewriter font-bold bg-stone-100 border border-stone-200 px-4 py-2 rounded-full hover:bg-stone-200 transition-colors flex items-center self-start sm:self-auto">
            Browse All <ArrowRight className="w-3 h-3 ml-1" />
          </Link>
        </div>

        {topOpps.length === 0 ? (
          <div className="text-center py-8 sm:py-12">
            <Search className="w-10 h-10 text-stone-300 mx-auto mb-3" />
            <p className="text-stone-500 font-typewriter text-sm mb-2">No matching opportunities yet</p>
            <p className="text-stone-400 text-xs">We&apos;re scanning federal databases daily. Check back soon!</p>
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
                          <span className="text-[9px] font-typewriter font-bold bg-emerald-100 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded uppercase">Easy Win</span>
                        )}
                        {opp.notice_type && (
                          <span className={clsx(
                            "text-[9px] font-typewriter px-2 py-0.5 rounded border uppercase tracking-widest",
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

      {/* Quick Actions */}
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <Link href="/opportunities" className="bg-gradient-to-br from-stone-900 to-black text-white rounded-[24px] sm:rounded-[32px] p-5 sm:p-6 hover:shadow-xl transition-all group">
          <Search className="w-6 h-6 mb-3 text-stone-400 group-hover:text-white transition-colors" />
          <h4 className="font-typewriter font-bold text-base mb-1">Browse Opportunities</h4>
          <p className="text-stone-400 text-xs">Search and filter {opsCount.toLocaleString()} federal contracts</p>
        </Link>
        <Link href="/settings" className="bg-white border border-stone-200 rounded-[24px] sm:rounded-[32px] p-5 sm:p-6 hover:shadow-lg hover:border-stone-300 transition-all group">
          <Shield className="w-6 h-6 mb-3 text-stone-400 group-hover:text-black transition-colors" />
          <h4 className="font-typewriter font-bold text-base mb-1">Update Your Profile</h4>
          <p className="text-stone-400 text-xs">Improve your matches by refining your business details</p>
        </Link>
      </section>
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
        <h4 className="text-2xl sm:text-3xl font-black font-typewriter tracking-tighter">{value}</h4>
        <p className="text-[10px] sm:text-xs text-stone-400 mt-0.5">{subtitle}</p>
      </div>
    </div>
  );

  if (href) return <Link href={href}>{content}</Link>;
  return content;
}
