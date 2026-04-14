"use client";

import { useState, useEffect } from "react";
import { createSupabaseClient } from "@/lib/supabase/client";
import { Sparkles, Loader2, CheckCircle2, Layers, ArrowRight, X } from "lucide-react";
import Link from "next/link";
import clsx from "clsx";

const supabase = createSupabaseClient();

interface PursueButtonProps {
    opportunityId: string;
    noticeType: string;
}

const STAGE_LABELS: Record<string, { label: string; color: string }> = {
    discovered: { label: "Discovered", color: "bg-stone-100 text-stone-700 border-stone-200" },
    researching: { label: "Researching", color: "bg-blue-50 text-blue-700 border-blue-200" },
    preparing: { label: "Preparing", color: "bg-amber-50 text-amber-700 border-amber-200" },
    submitted: { label: "Submitted", color: "bg-purple-50 text-purple-700 border-purple-200" },
    awarded: { label: "Awarded", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    lost: { label: "Lost", color: "bg-red-50 text-red-700 border-red-200" },
    no_bid: { label: "No Bid", color: "bg-stone-50 text-stone-500 border-stone-200" },
};

function generateActionItems(noticeType: string, opportunityId: string, profileId: string) {
    const base = [
        { title: "Review opportunity description and requirements", category: "research", priority: "high" },
        { title: "Download and review all attachments", category: "research", priority: "high" },
        { title: "Verify your SAM.gov registration is active", category: "compliance", priority: "high" },
    ];

    const nt = (noticeType || "").toLowerCase();

    let specific: Array<{ title: string; category: string; priority: string }> = [];

    if (nt.includes("sources sought") || nt.includes("rfi")) {
        specific = [
            { title: "Draft capability statement tailored to this requirement", category: "document", priority: "high" },
            { title: "Identify contracting officer contact info", category: "outreach", priority: "medium" },
            { title: "Identify potential teaming partners if needed", category: "teaming", priority: "medium" },
            { title: "Submit response before deadline", category: "compliance", priority: "high" },
        ];
    } else if (nt.includes("presolicitation")) {
        specific = [
            { title: "Prepare capability statement", category: "document", priority: "high" },
            { title: "Research incumbent contractor for this requirement", category: "research", priority: "medium" },
            { title: "Identify potential teaming partners", category: "teaming", priority: "medium" },
            { title: "Begin assembling bid/no-bid analysis", category: "research", priority: "medium" },
        ];
    } else if (nt.includes("solicitation") || nt.includes("combined")) {
        specific = [
            { title: "Read the full solicitation document (SOW/PWS)", category: "research", priority: "high" },
            { title: "Complete go/no-go decision analysis", category: "research", priority: "high" },
            { title: "Draft technical approach / proposal", category: "document", priority: "high" },
            { title: "Prepare pricing / cost volume", category: "document", priority: "high" },
            { title: "Gather past performance references", category: "document", priority: "high" },
            { title: "Submit proposal before deadline", category: "compliance", priority: "high" },
        ];
    }

    return [...base, ...specific].map(item => ({
        user_profile_id: profileId,
        opportunity_id: opportunityId,
        title: item.title,
        category: item.category,
        priority: item.priority,
        status: "pending",
    }));
}

export default function PursueButton({ opportunityId, noticeType }: PursueButtonProps) {
    const [loading, setLoading] = useState(true);
    const [pursuing, setPursuing] = useState(false);
    const [pursuit, setPursuit] = useState<{ id: string; stage: string } | null>(null);
    const [profileId, setProfileId] = useState<string | null>(null);
    const [dismissed, setDismissed] = useState(false);

    const dismissKey = `cp:pursue-dismissed:${opportunityId}`;

    useEffect(() => {
        if (typeof window !== "undefined" && localStorage.getItem(dismissKey) === "1") {
            setDismissed(true);
        }
        async function check() {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) { setLoading(false); return; }

            const { data: profile } = await supabase
                .from("user_profiles")
                .select("id")
                .eq("auth_user_id", user.id)
                .single();

            if (!profile) { setLoading(false); return; }
            setProfileId(profile.id);

            const { data: existing } = await supabase
                .from("user_pursuits")
                .select("id, stage")
                .eq("user_profile_id", profile.id)
                .eq("opportunity_id", opportunityId)
                .single();

            if (existing) setPursuit(existing);
            setLoading(false);
        }
        check();
    }, [opportunityId]);

    const startPursuing = async () => {
        if (!profileId) return;
        setPursuing(true);

        // Create pursuit
        const { data: newPursuit, error } = await supabase
            .from("user_pursuits")
            .insert({
                user_profile_id: profileId,
                opportunity_id: opportunityId,
                stage: "discovered",
                priority: "medium",
            })
            .select("id, stage")
            .single();

        if (error) {
            console.error("Failed to create pursuit:", error);
            setPursuing(false);
            return;
        }

        // Generate action items
        const actionItems = generateActionItems(noticeType, opportunityId, profileId);
        if (actionItems.length > 0) {
            await supabase.from("user_action_items").insert(actionItems);
        }

        setPursuit(newPursuit);
        setPursuing(false);
    };

    const handleDismiss = () => {
        if (typeof window !== "undefined") localStorage.setItem(dismissKey, "1");
        setDismissed(true);
    };

    if (dismissed && !pursuit) return null;

    if (loading) {
        return (
            <div className="bg-white border border-stone-200 rounded-2xl sm:rounded-3xl p-6 sm:p-10 text-center shadow-sm">
                <Loader2 className="w-6 h-6 animate-spin text-stone-400 mx-auto" />
            </div>
        );
    }

    if (pursuit) {
        const stageInfo = STAGE_LABELS[pursuit.stage] || STAGE_LABELS.discovered;
        return (
            <div className="bg-white border border-stone-200 rounded-2xl sm:rounded-3xl p-6 sm:p-8 shadow-sm relative overflow-hidden">
                <div className="absolute left-0 top-0 bottom-0 w-2 bg-gradient-to-b from-emerald-400 to-blue-400"></div>
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <CheckCircle2 className="w-6 h-6 text-emerald-500 flex-shrink-0" />
                        <div>
                            <p className="font-bold text-sm">You&apos;re pursuing this opportunity</p>
                            <div className="flex items-center gap-2 mt-1">
                                <span className={clsx("text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border", stageInfo.color)}>
                                    {stageInfo.label}
                                </span>
                            </div>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <Link href="/pipeline"
                            className="inline-flex items-center bg-stone-100 text-stone-700 font-bold px-4 py-2.5 rounded-full hover:bg-stone-200 transition-all text-xs border border-stone-200">
                            Action Items <ArrowRight className="w-3 h-3 ml-1" />
                        </Link>
                        <Link href="/pipeline"
                            className="inline-flex items-center bg-black text-white font-bold px-4 py-2.5 rounded-full hover:bg-stone-800 transition-all text-xs">
                            <Layers className="w-3 h-3 mr-1" /> Pipeline
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white border border-stone-200 rounded-2xl p-4 sm:p-5 shadow-sm relative overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-blue-400 to-emerald-400" />
            <button
                type="button"
                onClick={handleDismiss}
                title="Dismiss"
                className="absolute top-2 right-2 p-1.5 rounded-full text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors"
            >
                <X className="w-4 h-4" />
            </button>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pl-2 pr-8">
                <div>
                    <p className="font-bold text-sm text-stone-900">Interested in this opportunity?</p>
                    <p className="text-xs text-stone-500 mt-0.5">Add it to your pipeline for guided next steps.</p>
                </div>
                <button
                    type="button"
                    onClick={startPursuing}
                    disabled={pursuing}
                    className="inline-flex items-center justify-center bg-black text-white font-bold px-4 py-2 rounded-full hover:bg-stone-800 transition-all text-xs disabled:opacity-50 flex-shrink-0"
                >
                    {pursuing ? (
                        <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Adding...</>
                    ) : (
                        <><Sparkles className="w-3.5 h-3.5 mr-1.5 text-emerald-400" /> Start Pursuing</>
                    )}
                </button>
            </div>
        </div>
    );
}
