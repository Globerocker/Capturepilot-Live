// @ts-nocheck — Supabase join types
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createBrowserClient } from "@supabase/ssr";
import {
    ArrowLeft, Building2, Calendar, Clock, MapPin, Shield, Target,
    Zap, ExternalLink, Loader2, FileText, CheckCircle2, XCircle,
    AlertCircle, Layers, DollarSign, TrendingUp,
} from "lucide-react";
import clsx from "clsx";

const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function PortalOpportunityDetail() {
    const params = useParams();
    const oppId = params.id as string;

    const [opp, setOpp] = useState<Record<string, unknown> | null>(null);
    const [loading, setLoading] = useState(true);
    const [profileId, setProfileId] = useState("");
    const [eligibility, setEligibility] = useState<Record<string, unknown> | null>(null);
    const [eligLoading, setEligLoading] = useState(false);
    const [proposalLoading, setProposalLoading] = useState(false);
    const [proposal, setProposal] = useState<Record<string, unknown> | null>(null);
    const [aiSummary, setAiSummary] = useState<Record<string, unknown> | null>(null);
    const [aiLoading, setAiLoading] = useState(false);

    useEffect(() => {
        (async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            const { data: prof } = await supabase.from("user_profiles").select("id").eq("auth_user_id", user.id).single();
            if (prof) setProfileId(prof.id);

            const { data } = await supabase.from("opportunities").select("*").eq("id", oppId).single();
            if (data) {
                setOpp(data);
                if (data.ai_win_strategy && Object.keys(data.ai_win_strategy).length > 0) {
                    setAiSummary(data.ai_win_strategy);
                }
            }
            setLoading(false);
        })();
    }, [oppId]);

    const checkEligibility = async () => {
        if (!profileId || !opp?.notice_id) return;
        setEligLoading(true);
        const res = await fetch("/api/eligibility", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_profile_id: profileId, notice_id: opp.notice_id }),
        });
        const data = await res.json();
        if (data.success) setEligibility(data);
        setEligLoading(false);
    };

    const runAiAnalysis = async () => {
        if (!opp?.notice_id) return;
        setAiLoading(true);
        const res = await fetch("/api/ai/summarize-document", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ notice_id: opp.notice_id }),
        });
        const data = await res.json();
        if (data.success) setAiSummary(data.analysis);
        setAiLoading(false);
    };

    const generateProposal = async () => {
        if (!opp?.notice_id) return;
        setProposalLoading(true);
        const res = await fetch("/api/ai/write-proposal", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ notice_id: opp.notice_id, user_profile_id: profileId }),
        });
        const data = await res.json();
        if (data.success) setProposal(data);
        setProposalLoading(false);
    };

    const addToPipeline = async () => {
        if (!profileId || !oppId) return;
        await supabase.from("user_pursuits").upsert({
            user_profile_id: profileId,
            opportunity_id: oppId,
            stage: "discovered",
            priority: "medium",
        }, { onConflict: "user_profile_id,opportunity_id" });
    };

    if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-stone-400" /></div>;
    if (!opp) return <div className="text-center py-12"><p className="text-stone-500">Opportunity not found</p></div>;

    const fmtCurrency = (n: number) => {
        if (!n) return "";
        if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
        if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
        return `$${n.toLocaleString()}`;
    };

    const deadline = opp.response_deadline ? new Date(String(opp.response_deadline)) : null;
    const daysLeft = deadline ? Math.ceil((deadline.getTime() - Date.now()) / 86400000) : null;
    const isPast = daysLeft !== null && daysLeft < 0;
    const value = Number(opp.estimated_value || opp.award_amount || 0);
    const reqs = (opp.structured_requirements || {}) as Record<string, unknown>;
    const samUrl = `https://sam.gov/opp/${opp.notice_id}/view`;

    // Success probability
    const hasSetAside = !!opp.set_aside_code && !String(opp.set_aside_code).toLowerCase().includes("none");
    const hasIncumbent = !!opp.incumbent_contractor_name;
    let successScore = 30;
    if (hasSetAside) successScore += 20;
    if (!hasIncumbent) successScore += 15;
    if (opp.sources_sought_flag) successScore += 15;
    if (daysLeft && daysLeft > 14) successScore += 10;
    if (opp.veteran_relevance_flag) successScore += 5;
    if (opp.small_business_relevance_flag) successScore += 5;
    successScore = Math.min(95, successScore);

    return (
        <div className="max-w-5xl space-y-6">
            {/* Back + Header */}
            <div>
                <Link href="/portal/opportunities" className="text-sm text-stone-400 hover:text-stone-600 inline-flex items-center gap-1 mb-3">
                    <ArrowLeft className="w-4 h-4" /> Back to Matches
                </Link>
                <div className="flex items-start gap-2 flex-wrap mb-2">
                    <span className={clsx("text-[9px] font-bold px-2 py-0.5 rounded border uppercase",
                        opp.status === "ACTIVE" ? "bg-emerald-100 text-emerald-700 border-emerald-200" :
                        opp.status === "EXPIRING_SOON" ? "bg-red-100 text-red-700 border-red-200" :
                        opp.status === "MARKET_RESEARCH" ? "bg-violet-100 text-violet-700 border-violet-200" :
                        "bg-stone-100 text-stone-500 border-stone-200"
                    )}>{String(opp.status)}</span>
                    {opp.veteran_relevance_flag && <span className="text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded">VETERAN</span>}
                    {opp.wosb_relevance_flag && <span className="text-[9px] font-bold bg-pink-50 text-pink-700 border border-pink-200 px-2 py-0.5 rounded">WOSB</span>}
                    {opp.small_business_relevance_flag && !opp.veteran_relevance_flag && !opp.wosb_relevance_flag && (
                        <span className="text-[9px] font-bold bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded">SMALL BIZ</span>
                    )}
                </div>
                <h1 className="text-xl sm:text-2xl font-bold text-black leading-tight">{String(opp.title)}</h1>
                <p className="text-sm text-stone-500 mt-1">{String(opp.agency || "")}</p>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-white border border-stone-200 rounded-xl p-3 text-center">
                    <p className={clsx("text-2xl font-black", successScore >= 70 ? "text-emerald-600" : successScore >= 50 ? "text-amber-600" : "text-stone-600")}>{successScore}%</p>
                    <p className="text-[9px] text-stone-400 uppercase font-typewriter">Win Probability</p>
                </div>
                <div className="bg-white border border-stone-200 rounded-xl p-3 text-center">
                    <p className="text-2xl font-black text-stone-800">{value > 0 ? fmtCurrency(value) : "TBD"}</p>
                    <p className="text-[9px] text-stone-400 uppercase font-typewriter">Est. Value</p>
                </div>
                <div className="bg-white border border-stone-200 rounded-xl p-3 text-center">
                    <p className={clsx("text-2xl font-black",
                        isPast ? "text-red-500" : daysLeft && daysLeft <= 7 ? "text-red-600" : "text-stone-800"
                    )}>{daysLeft !== null ? (isPast ? "Closed" : `${daysLeft}d`) : "TBD"}</p>
                    <p className="text-[9px] text-stone-400 uppercase font-typewriter">Deadline</p>
                </div>
                <div className="bg-white border border-stone-200 rounded-xl p-3 text-center">
                    <p className="text-2xl font-black text-stone-800">{String(opp.notice_type || "—")}</p>
                    <p className="text-[9px] text-stone-400 uppercase font-typewriter">Type</p>
                </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-2">
                <button type="button" onClick={addToPipeline}
                    className="bg-black text-white px-4 py-2 rounded-xl text-sm font-bold inline-flex items-center gap-1.5 hover:bg-stone-800">
                    <Layers className="w-4 h-4" /> Add to My Deals
                </button>
                <button type="button" onClick={checkEligibility} disabled={eligLoading}
                    className="bg-white border border-stone-200 text-stone-700 px-4 py-2 rounded-xl text-sm font-bold inline-flex items-center gap-1.5 hover:bg-stone-50 disabled:opacity-50">
                    {eligLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                    {eligLoading ? "Checking..." : "Check Eligibility"}
                </button>
                <button type="button" onClick={runAiAnalysis} disabled={aiLoading}
                    className="bg-white border border-stone-200 text-stone-700 px-4 py-2 rounded-xl text-sm font-bold inline-flex items-center gap-1.5 hover:bg-stone-50 disabled:opacity-50">
                    {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                    {aiLoading ? "Analyzing..." : "AI Analysis"}
                </button>
                <button type="button" onClick={generateProposal} disabled={proposalLoading}
                    className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-bold inline-flex items-center gap-1.5 hover:bg-blue-700 disabled:opacity-50">
                    {proposalLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                    {proposalLoading ? "Writing..." : "Generate Proposal"}
                </button>
                <a href={samUrl} target="_blank" rel="noopener noreferrer"
                    className="bg-white border border-stone-200 text-blue-600 px-4 py-2 rounded-xl text-sm font-bold inline-flex items-center gap-1.5 hover:bg-blue-50">
                    <ExternalLink className="w-4 h-4" /> SAM.gov
                </a>
            </div>

            {/* Eligibility Results */}
            {eligibility && (
                <div className={clsx("border rounded-2xl p-5",
                    eligibility.match_strength === "strong" ? "bg-emerald-50 border-emerald-200" :
                    eligibility.match_strength === "moderate" ? "bg-amber-50 border-amber-200" :
                    eligibility.match_strength === "ineligible" ? "bg-red-50 border-red-200" :
                    "bg-stone-50 border-stone-200"
                )}>
                    <div className="flex items-center gap-2 mb-3">
                        {eligibility.eligible ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <XCircle className="w-5 h-5 text-red-600" />}
                        <h3 className="font-bold text-sm">{eligibility.eligible ? "You Qualify!" : "Missing Requirements"}</h3>
                        <span className={clsx("text-[10px] font-bold px-2 py-0.5 rounded uppercase",
                            eligibility.match_strength === "strong" ? "bg-emerald-200 text-emerald-800" :
                            eligibility.match_strength === "moderate" ? "bg-amber-200 text-amber-800" :
                            "bg-red-200 text-red-800"
                        )}>{String(eligibility.match_strength)}</span>
                    </div>
                    {(eligibility.eligible_reasons as string[])?.map((r, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs text-emerald-700 mb-1">
                            <CheckCircle2 className="w-3 h-3 mt-0.5 flex-shrink-0" /><span>{r}</span>
                        </div>
                    ))}
                    {(eligibility.missing_requirements as string[])?.map((r, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs text-red-700 mb-1">
                            <XCircle className="w-3 h-3 mt-0.5 flex-shrink-0" /><span>{r}</span>
                        </div>
                    ))}
                    {(eligibility.recommendations as string[])?.map((r, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs text-amber-700 mb-1">
                            <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" /><span>{r}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* Details Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Contract Details */}
                <div className="bg-white border border-stone-200 rounded-2xl p-5 space-y-3">
                    <h3 className="font-bold text-sm flex items-center gap-2"><Target className="w-4 h-4 text-stone-400" /> Contract Details</h3>
                    <div className="space-y-2 text-xs">
                        <div className="flex justify-between"><span className="text-stone-400">Agency</span><span className="font-medium text-right max-w-[60%] truncate">{String(opp.agency || "—")}</span></div>
                        <div className="flex justify-between"><span className="text-stone-400">Sub-Agency</span><span className="font-medium">{String(opp.sub_agency || "—")}</span></div>
                        <div className="flex justify-between"><span className="text-stone-400">Office</span><span className="font-medium">{String(opp.office || "—")}</span></div>
                        <div className="flex justify-between"><span className="text-stone-400">NAICS</span><span className="font-mono font-bold">{String(opp.naics_code || "—")}</span></div>
                        <div className="flex justify-between"><span className="text-stone-400">Set-Aside</span><span className="font-medium">{String(opp.set_aside_code || "Open")}</span></div>
                        <div className="flex justify-between"><span className="text-stone-400">Solicitation #</span><span className="font-mono">{String(opp.solicitation_number || "—")}</span></div>
                        <div className="flex justify-between"><span className="text-stone-400">Posted</span><span>{opp.posted_date ? new Date(String(opp.posted_date)).toLocaleDateString() : "—"}</span></div>
                        <div className="flex justify-between"><span className="text-stone-400">Deadline</span><span className={clsx("font-bold", isPast ? "text-red-500" : "")}>{deadline ? deadline.toLocaleDateString() : "—"}</span></div>
                        {opp.place_of_performance_state && (
                            <div className="flex justify-between"><span className="text-stone-400">Location</span><span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" />{String(opp.place_of_performance_state)}</span></div>
                        )}
                    </div>
                </div>

                {/* Requirements */}
                <div className="bg-white border border-stone-200 rounded-2xl p-5 space-y-3">
                    <h3 className="font-bold text-sm flex items-center gap-2"><FileText className="w-4 h-4 text-stone-400" /> Requirements</h3>
                    {Object.keys(reqs).length > 0 ? (
                        <div className="space-y-2 text-xs">
                            {reqs.bonding_required && <div className="flex items-center gap-2"><DollarSign className="w-3 h-3 text-amber-500" /><span>Bonding required {reqs.bonding_amount ? `(${reqs.bonding_amount})` : ""}</span></div>}
                            {reqs.insurance_required && <div className="flex items-center gap-2"><Shield className="w-3 h-3 text-blue-500" /><span>Insurance required</span></div>}
                            {reqs.security_clearance && <div className="flex items-center gap-2"><Shield className="w-3 h-3 text-red-500" /><span>Clearance: {String(reqs.security_clearance)}</span></div>}
                            {reqs.min_experience_years && <div className="flex items-center gap-2"><Clock className="w-3 h-3 text-stone-400" /><span>{String(reqs.min_experience_years)} years experience required</span></div>}
                            {(reqs.certifications_required as string[])?.map((c, i) => (
                                <div key={i} className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-emerald-500" /><span>{c}</span></div>
                            ))}
                            {reqs.period_of_performance && <div className="flex items-center gap-2"><Calendar className="w-3 h-3 text-stone-400" /><span>Period: {String(reqs.period_of_performance)}</span></div>}
                            {(reqs.equipment_required as string[])?.map((e, i) => (
                                <div key={i} className="flex items-center gap-2"><span className="text-stone-400">🔧</span><span>{e}</span></div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-xs text-stone-400">No requirements extracted yet. Click "AI Analysis" to generate.</p>
                    )}
                </div>
            </div>

            {/* AI Analysis */}
            {aiSummary && (
                <div className="bg-stone-900 text-white rounded-2xl p-5 space-y-4">
                    <h3 className="font-bold text-sm flex items-center gap-2"><Zap className="w-4 h-4 text-emerald-400" /> AI Analysis</h3>
                    {aiSummary.executive_summary && (
                        <div><p className="text-[10px] text-stone-400 uppercase mb-1">Summary</p><p className="text-sm text-stone-300 leading-relaxed">{String(aiSummary.executive_summary)}</p></div>
                    )}
                    {(aiSummary.key_requirements as string[])?.length > 0 && (
                        <div><p className="text-[10px] text-stone-400 uppercase mb-1">Key Requirements</p>
                            {(aiSummary.key_requirements as string[]).map((r, i) => (
                                <p key={i} className="text-xs text-stone-300 mb-1">• {r}</p>
                            ))}
                        </div>
                    )}
                    {(aiSummary.recommended_actions as string[])?.length > 0 && (
                        <div><p className="text-[10px] text-emerald-400 uppercase mb-1">Recommended Actions</p>
                            {(aiSummary.recommended_actions as string[]).map((a, i) => (
                                <p key={i} className="text-xs text-stone-300 mb-1">{i + 1}. {a}</p>
                            ))}
                        </div>
                    )}
                    {aiSummary.competition_level && (
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] text-stone-400 uppercase">Competition:</span>
                            <span className={clsx("text-xs font-bold px-2 py-0.5 rounded",
                                aiSummary.competition_level === "LOW" ? "bg-emerald-900 text-emerald-300" :
                                aiSummary.competition_level === "HIGH" ? "bg-red-900 text-red-300" :
                                "bg-amber-900 text-amber-300"
                            )}>{String(aiSummary.competition_level)}</span>
                        </div>
                    )}
                </div>
            )}

            {/* Generated Proposal */}
            {proposal && (
                <div className="bg-white border border-stone-200 rounded-2xl p-5 space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="font-bold text-sm flex items-center gap-2"><FileText className="w-4 h-4 text-blue-500" /> Generated Proposal</h3>
                        <span className="text-xs text-stone-400">{proposal.total_word_count} words · ~{proposal.estimated_pages} pages</span>
                    </div>
                    {(proposal.sections as Array<{ title: string; content: string; word_count: number }>)?.map((sec, i) => (
                        <details key={i} className="border border-stone-100 rounded-xl">
                            <summary className="px-4 py-3 cursor-pointer hover:bg-stone-50 text-sm font-bold flex items-center justify-between">
                                {sec.title}
                                <span className="text-[10px] text-stone-400 font-normal">{sec.word_count} words</span>
                            </summary>
                            <div className="px-4 pb-4 text-sm text-stone-700 leading-relaxed whitespace-pre-wrap">{sec.content}</div>
                        </details>
                    ))}
                </div>
            )}

            {/* Incumbent */}
            {opp.incumbent_contractor_name && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
                    <h3 className="font-bold text-sm text-amber-800 flex items-center gap-2 mb-2"><AlertCircle className="w-4 h-4" /> Incumbent Contractor</h3>
                    <p className="text-sm font-bold text-amber-900">{String(opp.incumbent_contractor_name)}</p>
                    {opp.incumbent_contractor_uei && <p className="text-xs text-amber-700 font-mono mt-1">UEI: {String(opp.incumbent_contractor_uei)}</p>}
                </div>
            )}
        </div>
    );
}
