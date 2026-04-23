"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createSupabaseClient } from "@/lib/supabase/client";
import { FileText, Mic, Mail, ArrowRight, Sparkles, ExternalLink } from "lucide-react";
import clsx from "clsx";

/**
 * Auto-synced from profile: surfaces the live Capability Statement,
 * completed Proposal Jobs, and saved Email Templates as deep-links.
 *
 * The idea is that /documents is the single destination for "stuff I've
 * created with CapturePilot" — not just manual uploads. Each row
 * deep-links to where the item actually lives.
 */
export default function AutoSyncedDocs({ profileId }: { profileId: string }) {
    const [capStatus, setCapStatus] = useState<"loading" | "present" | "missing">("loading");
    const [capUpdatedAt, setCapUpdatedAt] = useState<string | null>(null);
    const [proposalJobs, setProposalJobs] = useState<Array<{ id: string; title: string | null; total_sections: number; completed_at: string | null }>>([]);
    const [emailTemplates, setEmailTemplates] = useState<Array<{ id: string; label: string; updated_at: string | null }>>([]);

    useEffect(() => {
        if (!profileId) return;
        const sb = createSupabaseClient();

        (async () => {
            // Capability statement — anything non-empty on either HTML or text counts
            const { data: profile } = await sb
                .from("user_profiles")
                .select("capability_statement, capability_statement_html, capability_statement_file_url, updated_at")
                .eq("id", profileId)
                .single();
            const p = (profile || {}) as Record<string, unknown>;
            const hasCap = !!(p.capability_statement || p.capability_statement_html || p.capability_statement_file_url);
            setCapStatus(hasCap ? "present" : "missing");
            setCapUpdatedAt(typeof p.updated_at === "string" ? p.updated_at : null);

            // Completed proposals
            const { data: jobs } = await sb
                .from("proposal_jobs")
                .select("id, notice_id, result, total_sections, completed_at")
                .eq("user_profile_id", profileId)
                .eq("status", "completed")
                .order("completed_at", { ascending: false })
                .limit(6);
            type JobRow = { id: string; notice_id: string | null; result: { proposal_title?: string } | null; total_sections: number; completed_at: string | null };
            const mapped = ((jobs || []) as JobRow[]).map(j => ({
                id: j.id,
                title: j.result?.proposal_title || j.notice_id || "Untitled proposal",
                total_sections: j.total_sections,
                completed_at: j.completed_at,
            }));
            setProposalJobs(mapped);

            // Email templates — prefer saved ones; fall back to drafts
            const { data: tpl } = await sb
                .from("email_templates")
                .select("id, label, updated_at")
                .eq("user_profile_id", profileId)
                .order("updated_at", { ascending: false })
                .limit(6);
            setEmailTemplates(((tpl || []) as Array<{ id: string; label: string; updated_at: string | null }>));
        })().catch(() => { /* non-fatal */ });
    }, [profileId]);

    const tile = (opts: {
        title: string;
        subtitle: string;
        href: string;
        icon: React.ComponentType<{ className?: string }>;
        status?: "present" | "missing" | null;
        count?: number;
    }) => {
        const Icon = opts.icon;
        return (
            <Link
                href={opts.href}
                className={clsx(
                    "group flex items-start gap-3 p-4 rounded-2xl border transition-colors",
                    opts.status === "missing"
                        ? "bg-white border-stone-200 hover:border-stone-300"
                        : "bg-white border-stone-200 hover:border-stone-300",
                )}
            >
                <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-stone-100 flex items-center justify-center">
                    <Icon className="w-4 h-4 text-stone-600" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <p className="font-bold text-sm text-stone-900 truncate">{opts.title}</p>
                        {opts.count !== undefined && opts.count > 0 && (
                            <span className="bg-stone-100 text-stone-600 text-[10px] font-bold px-1.5 py-0.5 rounded-full">{opts.count}</span>
                        )}
                        {opts.status === "missing" && (
                            <span className="bg-amber-50 text-amber-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-amber-200">Not set up</span>
                        )}
                    </div>
                    <p className="text-xs text-stone-500 mt-0.5 line-clamp-2">{opts.subtitle}</p>
                </div>
                <ArrowRight className="w-4 h-4 text-stone-300 group-hover:text-stone-600 transition-colors flex-shrink-0" />
            </Link>
        );
    };

    return (
        <section className="mb-6">
            <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-stone-400" />
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-stone-500">Auto-synced from your account</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {tile({
                    title: "Capability Statement",
                    subtitle: capStatus === "present"
                        ? `Last updated ${capUpdatedAt ? new Date(capUpdatedAt).toLocaleDateString() : "recently"}. Open to edit or re-export.`
                        : "Write your 1-pager cap statement. Needed before AI Proposals.",
                    href: "/ai-drafter/capability-statement",
                    icon: Mic,
                    status: capStatus === "loading" ? null : (capStatus === "present" ? "present" : "missing"),
                })}
                {tile({
                    title: "AI Proposals",
                    subtitle: proposalJobs.length > 0
                        ? `${proposalJobs.length} completed. Latest: ${proposalJobs[0].title?.slice(0, 50) || "—"}`
                        : "Generate proposal responses from your matches. Needs capability statement.",
                    href: "/ai-drafter/proposals",
                    icon: FileText,
                    count: proposalJobs.length,
                })}
                {tile({
                    title: "Email Templates",
                    subtitle: emailTemplates.length > 0
                        ? `${emailTemplates.length} saved. Use to introduce yourself to contracting officers.`
                        : "Create and save cold-outreach templates for POCs.",
                    href: "/ai-drafter",
                    icon: Mail,
                    count: emailTemplates.length,
                })}
            </div>
            {/* Light annotation so users know this is live */}
            <p className="text-[10px] text-stone-400 mt-2 flex items-center gap-1">
                <ExternalLink className="w-2.5 h-2.5" />
                These are live pointers — edits happen where the item is managed.
            </p>
        </section>
    );
}
