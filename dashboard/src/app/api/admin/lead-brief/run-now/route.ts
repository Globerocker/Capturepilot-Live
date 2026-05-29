/**
 * POST /api/admin/lead-brief/run-now?limit=10
 *
 * Drains the backlog of Meta-lead briefs INLINE — no queue, no waiting.
 *
 * Why this exists: the worker_jobs queue can stall when an upstream API
 * (Apollo, SAM, OpenAI) gets slow and a single tick blows past the 60s
 * Vercel maxDuration. Pending jobs pile up and the partner Gmail goes silent.
 * This endpoint walks the pending leads in order, runs generateLeadBrief
 * one at a time with a 35s per-lead cap, sends the email, and marks the
 * worker_jobs row done so it stops blocking the dedup index.
 *
 * Dual auth: admin session OR Bearer CRON_SECRET (so it can also be hit
 * from a CLI / GitHub Action / external scheduler).
 *
 * Query params:
 *   limit       — number of leads to process this call (default 10, max 40)
 *   status      — filter target: pending (default) | failed | all
 *   include_done — "1" to re-run leads that already have a brief (testing only)
 *   dry_run     — "1" to generate the brief but skip emailing AND skip the
 *                 lead_brief DB write. Useful for previewing the new template
 *                 before re-sending to the partner.
 *   lead_id     — when set, restricts to a single lead row (works with dry_run
 *                 for preview).
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertAdmin } from "@/lib/auth-admin";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { generateLeadBrief, previewLeadBrief } from "@/lib/lead-brief";

export const runtime = "nodejs";
export const maxDuration = 300;

const PER_LEAD_TIMEOUT_MS = 35_000;

interface RunResult {
    lead_id: string;
    email: string;
    company: string | null;
    status: "sent" | "failed" | "timeout";
    fit_score?: number;
    error?: string;
    ms: number;
}

export async function POST(req: NextRequest) {
    const isCron = isAuthorizedCron(req.headers.get("authorization"));
    if (!isCron) {
        const unauth = await assertAdmin();
        if (unauth) return unauth;
    }

    const url = new URL(req.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 10), 1), 40);
    const statusFilter = (url.searchParams.get("status") || "pending").toLowerCase();
    const includeDone = url.searchParams.get("include_done") === "1";
    const dryRun = url.searchParams.get("dry_run") === "1";
    const singleLeadId = url.searchParams.get("lead_id");

    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );

    // Pull eligible leads. Pending = enqueued but never processed. Failed =
    // a prior worker tick errored. "all" rolls both up. Order by created_at
    // so the partner sees them in chronological order of arrival.
    let query = sb
        .from("marketing_leads")
        .select("id, email, company, created_at, lead_brief_status, lead_brief_sent_at")
        .order("created_at", { ascending: true })
        .limit(limit);
    if (singleLeadId) {
        query = query.eq("id", singleLeadId);
    } else if (!includeDone) {
        if (statusFilter === "failed") {
            query = query.eq("lead_brief_status", "failed");
        } else if (statusFilter === "all") {
            query = query.or("lead_brief_status.is.null,lead_brief_status.eq.pending,lead_brief_status.eq.failed");
        } else {
            // default: pending OR never-enqueued
            query = query.or("lead_brief_status.is.null,lead_brief_status.eq.pending");
        }
    }

    const { data: leads, error } = await query as {
        data: Array<{ id: string; email: string; company: string | null; created_at: string }> | null;
        error: { message: string } | null;
    };
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!leads || leads.length === 0) {
        return NextResponse.json({ processed: 0, results: [], note: "no eligible leads" });
    }

    // Dry-run mode: build the brief in memory, never write to DB, never
    // send email, return the rendered html+text so the partner can review
    // the template before we re-fire the batch.
    if (dryRun) {
        const previews: Array<{ lead_id: string; email: string; subject: string; text: string; html: string; fit_score: number }> = [];
        for (const lead of leads) {
            try {
                const { brief, subject, text, html } = await Promise.race([
                    previewLeadBrief(sb, lead.id),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error(`lead ${lead.id} exceeded ${PER_LEAD_TIMEOUT_MS}ms`)), PER_LEAD_TIMEOUT_MS),
                    ),
                ]) as Awaited<ReturnType<typeof previewLeadBrief>>;
                previews.push({
                    lead_id: lead.id,
                    email: lead.email,
                    subject,
                    text,
                    html,
                    fit_score: brief.ai.fit_score,
                });
            } catch (e) {
                previews.push({
                    lead_id: lead.id,
                    email: lead.email,
                    subject: "(error)",
                    text: `ERROR: ${(e as Error).message.slice(0, 240)}`,
                    html: "",
                    fit_score: 0,
                });
            }
        }
        return NextResponse.json({ dry_run: true, count: previews.length, previews });
    }

    const results: RunResult[] = [];
    for (const lead of leads) {
        const started = Date.now();
        // Move to "running" so the queue worker doesn't double-process if
        // it wakes up mid-loop. We don't bother claiming via claim_jobs
        // here — the worker_jobs row tied to this lead is also stuck in
        // pending so just bump it to done at the bottom.
        await sb.from("marketing_leads")
            .update({ lead_brief_status: "running" })
            .eq("id", lead.id)
            .then(({ error }) => { if (error) console.warn("[run-now] status flip non-fatal:", error.message); });

        try {
            const brief = await Promise.race([
                generateLeadBrief(sb, lead.id),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error(`lead ${lead.id} exceeded ${PER_LEAD_TIMEOUT_MS}ms`)), PER_LEAD_TIMEOUT_MS),
                ),
            ]) as Awaited<ReturnType<typeof generateLeadBrief>>;

            // Drop the now-resolved worker_jobs row so dedup_key frees up.
            await sb.from("worker_jobs")
                .update({ status: "done", finished_at: new Date().toISOString(), result: { fit_score: brief.ai.fit_score, recipient: brief.lead.email } })
                .eq("task_type", "enrich_lead_brief")
                .eq("status", "pending")
                .contains("payload", { lead_id: lead.id });

            results.push({
                lead_id: lead.id,
                email: lead.email,
                company: lead.company,
                status: "sent",
                fit_score: brief.ai.fit_score,
                ms: Date.now() - started,
            });
        } catch (e) {
            const msg = (e as Error).message;
            const isTimeout = msg.includes("exceeded");
            await sb.from("marketing_leads")
                .update({ lead_brief_status: "failed" })
                .eq("id", lead.id);
            results.push({
                lead_id: lead.id,
                email: lead.email,
                company: lead.company,
                status: isTimeout ? "timeout" : "failed",
                error: msg.slice(0, 240),
                ms: Date.now() - started,
            });
        }
    }

    const sent = results.filter(r => r.status === "sent").length;
    const failed = results.length - sent;
    return NextResponse.json({
        processed: results.length,
        sent,
        failed,
        results,
        note: sent > 0 ? `${sent} brief(s) emailed to americurial@gmail.com` : "no briefs sent — check results[].error",
    });
}
