"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseClient } from "@/lib/supabase/client";
import { FileText, Loader2, Plus, Download, Clock, CheckCircle2, AlertCircle, ArrowRight, Search } from "lucide-react";
import clsx from "clsx";
import Link from "next/link";
import ProposalJobProgress, { type ProposalJobStatus } from "@/components/proposals/ProposalJobProgress";

const supabase = createSupabaseClient();

const ACTIVE_JOB_STORAGE_KEY = "activeProposalJobId";

interface ProposalDraft {
    id: string;
    notice_id: string;
    title: string;
    agency: string;
    sections: Array<{ title: string; content: string; word_count: number }>;
    total_word_count: number;
    estimated_pages: number;
    created_at: string;
}

export default function ProposalsPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [profileId, setProfileId] = useState<string | null>(null);
    const [drafts, setDrafts] = useState<ProposalDraft[]>([]);

    // New proposal form
    const [showNewForm, setShowNewForm] = useState(false);
    const [noticeId, setNoticeId] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [genError, setGenError] = useState("");

    // Active background job
    const [activeJobId, setActiveJobId] = useState<string | null>(null);
    const downloadedJobsRef = useRef<Set<string>>(new Set());

    // Search
    const [searchInput, setSearchInput] = useState("");

    // Matches for quick-select
    const [recentMatches, setRecentMatches] = useState<Array<{ notice_id: string; title: string; agency: string }>>([]);

    const loadDrafts = useCallback(async () => {
        const { data } = await supabase
            .from("opportunities")
            .select("notice_id, title, agency, ai_win_strategy")
            .not("ai_win_strategy", "is", null)
            .order("updated_at", { ascending: false })
            .limit(50);

        const proposalDrafts: ProposalDraft[] = [];
        for (const opp of (data || []) as Array<{ notice_id: string; title: string; agency: string; ai_win_strategy: Record<string, unknown> }>) {
            const strat = opp.ai_win_strategy;
            if (strat?.proposal_generated) {
                proposalDrafts.push({
                    id: opp.notice_id,
                    notice_id: opp.notice_id,
                    title: opp.title,
                    agency: opp.agency,
                    sections: [],
                    total_word_count: (strat.proposal_words as number) || 0,
                    estimated_pages: Math.ceil(((strat.proposal_words as number) || 0) / 250),
                    created_at: (strat.generated_at as string) || "",
                });
            }
        }
        setDrafts(proposalDrafts);
    }, []);

    // Restore active job from localStorage (survives reload / tab navigation)
    useEffect(() => {
        if (typeof window === "undefined") return;
        const stored = localStorage.getItem(ACTIVE_JOB_STORAGE_KEY);
        if (stored) setActiveJobId(stored);
    }, []);

    useEffect(() => {
        (async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) { router.push("/login"); return; }

            const { data: profile } = await supabase
                .from("user_profiles")
                .select("id")
                .eq("auth_user_id", user.id)
                .single();

            if (!profile) { router.push("/onboard"); return; }
            const pid = (profile as Record<string, unknown>).id as string;
            setProfileId(pid);

            // Look for the user's most recent active job in case one is
            // running but localStorage was cleared (e.g. switched devices)
            if (!activeJobId) {
                const { data: activeJobs } = await supabase
                    .from("proposal_jobs")
                    .select("id")
                    .eq("user_profile_id", pid)
                    .in("status", ["pending", "writing"])
                    .order("created_at", { ascending: false })
                    .limit(1);
                const restored = (activeJobs as Array<{ id: string }> | null)?.[0];
                if (restored) {
                    setActiveJobId(restored.id);
                    localStorage.setItem(ACTIVE_JOB_STORAGE_KEY, restored.id);
                    window.dispatchEvent(new Event("proposal-jobs-changed"));
                }
            }

            // Load recent HOT matches for quick-select
            const { data: matches } = await supabase
                .from("user_matches")
                .select("opportunities(notice_id, title, agency)")
                .eq("user_profile_id", pid)
                .eq("is_dismissed", false)
                .order("score", { ascending: false })
                .limit(10);

            if (matches) {
                const matchList = (matches as unknown as Array<{ opportunities: { notice_id: string; title: string; agency: string } }>)
                    .filter(m => m.opportunities)
                    .map(m => m.opportunities);
                setRecentMatches(matchList);
            }

            await loadDrafts();
            setLoading(false);
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [router, loadDrafts]);

    const downloadProposal = (data: {
        proposal_title: string;
        agency: string;
        sections: Array<{ title: string; content: string; word_count: number }>;
        compliance_matrix: Array<{ requirement: string; addressed_in: string; status: string }>;
        total_word_count: number;
        estimated_pages: number;
    }) => {
        let text = `${data.proposal_title}\n`;
        text += `${"=".repeat(60)}\n`;
        text += `Agency: ${data.agency}\n`;
        text += `Total Pages: ~${data.estimated_pages} | Words: ${data.total_word_count.toLocaleString()}\n`;
        text += `Generated: ${new Date().toLocaleDateString()}\n\n`;

        for (const section of data.sections) {
            text += `\n${"—".repeat(40)}\n`;
            text += `${section.title}\n`;
            text += `${"—".repeat(40)}\n\n`;
            text += `${section.content}\n\n`;
        }

        if (data.compliance_matrix?.length > 0) {
            text += `\n${"=".repeat(60)}\n`;
            text += `COMPLIANCE MATRIX\n`;
            text += `${"=".repeat(60)}\n\n`;
            for (const item of data.compliance_matrix) {
                text += `Requirement: ${item.requirement}\n`;
                text += `Addressed In: ${item.addressed_in}\n`;
                text += `Status: ${item.status}\n\n`;
            }
        }

        const blob = new Blob([text], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `proposal-${data.proposal_title.substring(0, 40).replace(/[^a-zA-Z0-9]/g, "-")}.txt`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const setActiveJob = (jobId: string | null) => {
        setActiveJobId(jobId);
        if (typeof window !== "undefined") {
            if (jobId) {
                localStorage.setItem(ACTIVE_JOB_STORAGE_KEY, jobId);
            } else {
                localStorage.removeItem(ACTIVE_JOB_STORAGE_KEY);
            }
            window.dispatchEvent(new Event("proposal-jobs-changed"));
        }
    };

    const handleGenerate = async (targetNoticeId?: string) => {
        const nid = (targetNoticeId ?? noticeId).trim();
        if (!nid || !profileId) return;
        setSubmitting(true);
        setGenError("");

        try {
            const res = await fetch("/api/ai/write-proposal/start", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    notice_id: nid,
                    user_profile_id: profileId,
                }),
            });

            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                if (d.code === "CAPABILITY_STATEMENT_REQUIRED") {
                    setGenError("You need a capability statement first. Redirecting...");
                    setTimeout(() => router.push(d.next || "/capability-statement"), 1200);
                    return;
                }
                throw new Error(d.error || `Failed (${res.status})`);
            }

            const data = await res.json();
            setActiveJob(data.jobId);
            setShowNewForm(false);
            setNoticeId("");
        } catch (err) {
            setGenError((err as Error).message || "Something went wrong.");
        } finally {
            setSubmitting(false);
        }
    };

    const handleJobComplete = useCallback(async (status: ProposalJobStatus) => {
        // Auto-download once, refresh draft list, but keep the completed card
        // visible until the user dismisses it.
        if (!status.result) return;
        if (downloadedJobsRef.current.has(status.id)) return;
        downloadedJobsRef.current.add(status.id);
        downloadProposal(status.result);
        await loadDrafts();
        // Clear the "running" storage hint so the indicator can hide
        if (typeof window !== "undefined") {
            localStorage.removeItem(ACTIVE_JOB_STORAGE_KEY);
            window.dispatchEvent(new Event("proposal-jobs-changed"));
        }
    }, [loadDrafts]);

    const handleJobFail = useCallback(() => {
        if (typeof window !== "undefined") {
            localStorage.removeItem(ACTIVE_JOB_STORAGE_KEY);
            window.dispatchEvent(new Event("proposal-jobs-changed"));
        }
    }, []);

    const dismissActiveJob = () => {
        setActiveJob(null);
    };

    const filteredDrafts = searchInput
        ? drafts.filter(d => d.title.toLowerCase().includes(searchInput.toLowerCase()) || d.agency.toLowerCase().includes(searchInput.toLowerCase()))
        : drafts;

    if (loading) {
        return (
            <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500 px-1">
                <div className="h-8 w-48 bg-stone-200 rounded animate-pulse" />
                <div className="h-4 w-72 bg-stone-100 rounded animate-pulse" />
                <div className="space-y-3">
                    {[1, 2, 3].map(i => <div key={i} className="h-24 bg-stone-100 rounded-2xl animate-pulse" />)}
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500 px-1">
            <header>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tighter text-black flex items-center">
                    <FileText className="mr-2 sm:mr-3 w-6 h-6 sm:w-8 sm:h-8" /> AI Proposals
                    <span className="ml-3 text-sm font-sans font-medium bg-stone-100 px-3 py-1 rounded-full text-stone-500 border border-stone-200">
                        {drafts.length}
                    </span>
                </h2>
                <p className="text-stone-500 mt-1 font-medium text-sm">
                    Generate full proposal drafts powered by AI for any federal opportunity.
                </p>
            </header>

            {/* Active job progress (persists across navigation via localStorage) */}
            {activeJobId && (
                <ProposalJobProgress
                    jobId={activeJobId}
                    onComplete={handleJobComplete}
                    onFail={handleJobFail}
                    onDismiss={dismissActiveJob}
                />
            )}

            {/* New Proposal CTA */}
            {!showNewForm && !submitting && (
                <button
                    type="button"
                    onClick={() => setShowNewForm(true)}
                    className="w-full bg-gradient-to-r from-emerald-600 to-emerald-700 text-white rounded-2xl p-5 flex items-center justify-center gap-3 font-bold text-sm hover:from-emerald-700 hover:to-emerald-800 transition-all shadow-sm"
                >
                    <Plus className="w-5 h-5" /> Start New Proposal
                </button>
            )}

            {/* New Proposal Form */}
            {showNewForm && (
                <div className="bg-white border border-stone-200 rounded-2xl p-6 space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="font-bold text-base flex items-center gap-2">
                            <Plus className="w-4 h-4 text-emerald-600" /> New Proposal Draft
                        </h3>
                        <button type="button" onClick={() => { setShowNewForm(false); setGenError(""); }} className="text-xs text-stone-400 hover:text-stone-600">Cancel</button>
                    </div>

                    <div>
                        <label className="text-[10px] text-stone-400 uppercase tracking-widest mb-2 block">
                            Notice ID (from SAM.gov)
                        </label>
                        <input
                            type="text"
                            value={noticeId}
                            onChange={(e) => setNoticeId(e.target.value)}
                            placeholder="e.g. fa852524r0001"
                            className="w-full px-4 py-3 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 font-mono"
                        />
                    </div>

                    {/* Quick-select from matches */}
                    {recentMatches.length > 0 && (
                        <div>
                            <p className="text-[10px] text-stone-400 uppercase tracking-widest mb-2">Or select from your top matches</p>
                            <div className="space-y-1.5 max-h-48 overflow-y-auto">
                                {recentMatches.map((m) => (
                                    <button
                                        key={m.notice_id}
                                        type="button"
                                        onClick={() => setNoticeId(m.notice_id)}
                                        className={clsx(
                                            "w-full text-left px-3 py-2 rounded-xl text-xs border transition-all",
                                            noticeId === m.notice_id
                                                ? "bg-emerald-50 border-emerald-300 text-emerald-800"
                                                : "bg-stone-50 border-stone-200 text-stone-600 hover:bg-stone-100"
                                        )}
                                    >
                                        <p className="font-bold line-clamp-1">{m.title}</p>
                                        <p className="text-stone-400 text-[10px]">{m.agency} | {m.notice_id}</p>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {genError && (
                        <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                            <AlertCircle className="w-4 h-4 flex-shrink-0" /> {genError}
                        </div>
                    )}

                    <button
                        type="button"
                        onClick={() => handleGenerate()}
                        disabled={!noticeId.trim() || submitting}
                        className="bg-black text-white px-6 py-3 rounded-xl text-sm font-bold inline-flex items-center gap-2 disabled:opacity-40 hover:bg-stone-800 transition-colors"
                    >
                        {submitting ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" /> Starting job...
                            </>
                        ) : (
                            <>
                                <FileText className="w-4 h-4" /> Generate Proposal
                            </>
                        )}
                    </button>
                    <p className="text-[10px] text-stone-400">
                        Generation runs in the background — you can keep browsing other pages and come back; progress is saved.
                    </p>
                </div>
            )}

            {/* Search */}
            {drafts.length > 0 && (
                <div className="bg-white p-2 rounded-full border border-stone-200 shadow-sm flex items-center focus-within:ring-2 focus-within:ring-black focus-within:border-transparent transition-all">
                    <Search className="w-5 h-5 text-stone-400 ml-3 mr-2" />
                    <input
                        type="text"
                        placeholder="Search proposals..."
                        className="bg-transparent border-none outline-none w-full text-stone-700 text-sm"
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                    />
                </div>
            )}

            {/* Drafts List */}
            {filteredDrafts.length > 0 ? (
                <div className="space-y-2">
                    {filteredDrafts.map((draft) => (
                        <div key={draft.id} className="bg-white border border-stone-200 hover:border-stone-300 rounded-2xl p-4 transition-all shadow-sm group">
                            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center flex-shrink-0">
                                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-bold text-sm text-black line-clamp-1">{draft.title}</p>
                                    <p className="text-xs text-stone-500">{draft.agency}</p>
                                    <div className="flex items-center gap-3 mt-1 text-[10px] text-stone-400">
                                        <span className="flex items-center gap-1">
                                            <Clock className="w-3 h-3" />
                                            {draft.created_at ? new Date(draft.created_at).toLocaleDateString() : "Recently"}
                                        </span>
                                        <span>{draft.total_word_count.toLocaleString()} words</span>
                                        <span>~{draft.estimated_pages} pages</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                    <button
                                        type="button"
                                        onClick={() => handleGenerate(draft.notice_id)}
                                        disabled={submitting || !!activeJobId}
                                        className="text-xs font-bold bg-white border border-stone-200 text-stone-600 px-3 py-1.5 rounded-lg hover:bg-stone-50 inline-flex items-center gap-1 disabled:opacity-50"
                                    >
                                        <Download className="w-3 h-3" /> Re-generate
                                    </button>
                                    <Link
                                        href={`/opportunities/${draft.notice_id}`}
                                        className="text-xs font-bold bg-emerald-50 border border-emerald-200 text-emerald-700 px-3 py-1.5 rounded-lg hover:bg-emerald-100 inline-flex items-center gap-1"
                                    >
                                        View Opp <ArrowRight className="w-3 h-3" />
                                    </Link>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                !submitting && !showNewForm && !activeJobId && (
                    <div className="bg-stone-50 border border-stone-200 border-dashed rounded-2xl p-12 text-center">
                        <FileText className="w-12 h-12 text-stone-300 mx-auto mb-4" />
                        <p className="text-stone-500 text-sm mb-2">No proposals generated yet</p>
                        <p className="text-stone-400 text-xs mb-4">Click &quot;Start New Proposal&quot; above to draft your first AI-powered proposal.</p>
                    </div>
                )
            )}
        </div>
    );
}
