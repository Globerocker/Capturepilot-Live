/**
 * Vercel-side queue consumer.
 *
 * Counterpart to the Playwright worker on Railway — handles HTTP-only task
 * types that don't need a browser. Claims jobs from worker_jobs via the
 * claim_jobs() SQL function and dispatches to per-task handlers.
 *
 * Task types handled here:
 *   - classify_naics             → lib/classify-naics (gpt-4o-mini)
 *   - extract_structured_reqs    → lib/extract-structured-requirements
 *   - extract_keywords           → AI keyword extraction (existing pipeline)
 *   - analyze_attachments        → analyze_match_attachments logic
 *
 * Browser tasks (scrape_portal_detail, warm_cf_cookie, etc) are claimed by
 * the Railway worker via the same claim_jobs() function, so they're never
 * picked up here — claim_jobs filters by task_type ANY().
 *
 * Scheduled every 5 min via the enrichment_orchestrator. Each invocation
 * drains up to ~50 jobs (10 batches of 5) inside the 60s budget.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { guardCron } from "@/lib/cron-auth";
import { classifyNaics } from "@/lib/classify-naics";
import { extractStructuredRequirements } from "@/lib/extract-structured-requirements";
import { extractAiKeywords } from "@/lib/extract-ai-keywords";
import { generateLeadBrief } from "@/lib/lead-brief";

// Loose SupabaseClient typing — the handlers below intentionally use the
// generic any-shape client to avoid PostgrestQueryBuilder generic
// constraints that complain about our jsonb payloads.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SbAny = SupabaseClient<any, any, any>;

export const runtime = "nodejs";
export const maxDuration = 60;

// Task types this Vercel consumer handles. Browser-based ones (scrape_portal_detail,
// warm_cf_cookie) stay claimed by the Railway worker.
const HTTP_TASK_TYPES = [
    "classify_naics",
    "extract_structured_reqs",
    "extract_keywords",
    "enrich_lead_brief",
    "analyze_attachments",
];

type Job = {
    id: string;
    task_type: string;
    payload: Record<string, unknown>;
    attempts: number;
    max_attempts: number;
};

async function handleClassifyNaics(sb: SbAny, job: Job) {
    const oppId = job.payload.opp_id as string;
    if (!oppId) return { error: "missing opp_id" };
    const { data: opp } = await sb.from("opportunities")
        .select("title, description, naics_code")
        .eq("id", oppId)
        .maybeSingle() as { data: { title: string | null; description: string | null; naics_code: string | null } | null };
    if (!opp) return { error: "opp not found" };
    if (opp.naics_code) return { result: { skipped: "already_has_naics" } };
    const result = await classifyNaics({ title: opp.title, description: opp.description });
    if (!result) return { result: { no_classification: true } };
    if (result.confidence < 0.6) return { result: { low_confidence: result.confidence } };
    const { error: upErr } = await sb.from("opportunities")
        .update({ naics_code: result.naics_code })
        .eq("id", oppId)
        .is("naics_code", null);
    if (upErr) return { error: upErr.message };
    return { result: { naics_code: result.naics_code, confidence: result.confidence } };
}

async function handleExtractStructuredReqs(sb: SbAny, job: Job) {
    const oppId = job.payload.opp_id as string;
    if (!oppId) return { error: "missing opp_id" };
    const { data: opp } = await sb.from("opportunities")
        .select("title, description, structured_requirements")
        .eq("id", oppId)
        .maybeSingle() as { data: { title: string | null; description: string | null; structured_requirements: Record<string, unknown> | null } | null };
    if (!opp) return { error: "opp not found" };
    const existing = opp.structured_requirements || {};
    // Skip if attachments have been analyzed (deeper data lives there)
    if ((existing as { _attachments_extracted?: number })._attachments_extracted) {
        return { result: { skipped: "attachments_extracted" } };
    }
    const result = await extractStructuredRequirements({ title: opp.title, description: opp.description });
    if (!result) return { result: { no_extraction: true } };
    const merged = { ...existing, ...result };
    const { error: upErr } = await sb.from("opportunities")
        .update({ structured_requirements: merged })
        .eq("id", oppId);
    if (upErr) return { error: upErr.message };
    return { result: { extracted: true } };
}

async function handleExtractKeywords(sb: SbAny, job: Job) {
    const oppId = job.payload.opp_id as string;
    if (!oppId) return { error: "missing opp_id" };
    const { data: opp } = await sb.from("opportunities")
        .select("title, description, ai_keywords")
        .eq("id", oppId)
        .maybeSingle();
    if (!opp) return { error: "opp not found" };
    if (opp.ai_keywords && Array.isArray(opp.ai_keywords) && opp.ai_keywords.length > 0) {
        return { result: { skipped: "already_extracted" } };
    }
    const result = await extractAiKeywords({ title: opp.title, description: opp.description });
    if (!result || !result.keywords || result.keywords.length === 0) {
        return { result: { no_keywords: true } };
    }
    const { error: upErr } = await sb.from("opportunities")
        .update({ ai_keywords: result.keywords })
        .eq("id", oppId);
    if (upErr) return { error: upErr.message };
    return { result: { keyword_count: result.keywords.length } };
}

async function handleEnrichLeadBrief(sb: SbAny, job: Job) {
    const leadId = job.payload.lead_id as string;
    if (!leadId) return { error: "missing lead_id" };
    try {
        const brief = await generateLeadBrief(sb, leadId);
        return { result: { fit_score: brief.ai.fit_score, recipient_email: brief.lead.email } };
    } catch (e) {
        // Mark the lead so a human can see it failed without joining worker_jobs.
        await sb.from("marketing_leads")
            .update({ lead_brief_status: "failed" })
            .eq("id", leadId);
        return { error: (e as Error).message };
    }
}

async function handleAnalyzeAttachments(sb: SbAny, job: Job) {
    // Per-opportunity attachment analysis. The job payload only carries the
    // opp_id — we look up the row, pull its resource_links, fetch+extract
    // the first 1-2 docs, run callLLMJson, and upsert the structured
    // requirements. Mirror of the batched
    // /api/cron/analyze_match_attachments handler but scoped to one row so
    // the worker queue can process the 11K pending backlog at one-per-job
    // granularity. Hard 50s budget per call so we always finish inside the
    // 60s Vercel function ceiling.
    const oppId = job.payload.opp_id as string;
    if (!oppId) return { error: "missing opp_id" };

    const { fetchAndExtract } = await import("@/lib/document-extract");
    const { callLLMJson } = await import("@/lib/llm/deepseek");

    const { data: opp } = await sb.from("opportunities")
        .select("id, title, description, resource_links, structured_requirements")
        .eq("id", oppId)
        .maybeSingle() as { data: { id: string; title: string | null; description: string | null; resource_links: string[] | null; structured_requirements: Record<string, unknown> | null } | null };
    if (!opp) return { error: "opp not found" };
    const links = (opp.resource_links || []).filter(Boolean);
    if (links.length === 0) return { result: { skipped: "no_resource_links" } };

    const SAM_API_KEY = process.env.SAM_API_KEY || "";
    const MAX_BYTES = 4 * 1024 * 1024;
    const start = Date.now();
    const docTexts: Array<{ filename: string; text: string; kind: string }> = [];
    for (const url of links.slice(0, 2)) {
        if (Date.now() - start > 30_000) break;
        try {
            const ext = await fetchAndExtract(url, { samApiKey: SAM_API_KEY });
            if (ext.bytes > MAX_BYTES || !ext.text || ext.text.length < 100) continue;
            docTexts.push({ filename: ext.filename, text: ext.text, kind: ext.kind });
            await sb.from("opportunity_attachments").upsert({
                opportunity_id: opp.id,
                filename: ext.filename.slice(0, 255),
                file_url: url,
                file_type: ext.kind,
                file_size_bytes: ext.bytes,
                extracted_text: ext.text.slice(0, 100_000),
                downloaded_at: new Date().toISOString(),
            }, { onConflict: "opportunity_id,filename", ignoreDuplicates: false });
        } catch (e) {
            console.warn(`[analyze_attachments] doc fail ${url}:`, e instanceof Error ? e.message : e);
        }
    }

    if (docTexts.length === 0) {
        // Watermark so the same opp doesn't keep getting re-queued
        await sb.from("opportunities").update({
            structured_requirements: {
                ...(opp.structured_requirements || {}),
                _analyzed_attachments_at: new Date().toISOString(),
                _attachments_extracted: 0,
            },
            last_crawled_at: new Date().toISOString(),
        }).eq("id", opp.id);
        return { result: { extracted: 0, watermarked: true } };
    }

    const SYS = `You are a federal capture strategist. Given the opp description + attached doc text, output ONLY valid JSON: {"summary": "3-4 sentence summary", "structured_requirements": {"scope_of_work":[],"qualifications":[],"deliverables":[],"period_of_performance":null,"place_of_performance":null,"security_clearance":null,"certifications_required":[],"far_clauses":[]}, "recommendations":{"bid_or_no_bid":"GO|WATCH|NO-GO","sales_angle":"","key_risks":[],"next_steps":[]}}. Never fabricate FAR clauses. Use null for unknowns.`;
    const combined = [
        `TITLE: ${opp.title}`,
        `DESCRIPTION: ${(opp.description || "").slice(0, 2500)}`,
        `=== DOCUMENTS ===`,
        ...docTexts.map(d => `\n--- ${d.filename} ---\n${d.text.slice(0, 12_000)}`),
    ].join("\n").slice(0, 70_000);

    try {
        const analysis = await callLLMJson<{ summary?: string; structured_requirements?: Record<string, unknown>; recommendations?: Record<string, unknown> }>(
            [{ role: "system", content: SYS }, { role: "user", content: combined }],
            { temperature: 0.2, max_tokens: 2000 },
        );
        await sb.from("opportunities").update({
            structured_requirements: {
                ...(analysis.structured_requirements || {}),
                _summary: analysis.summary || null,
                _recommendations: analysis.recommendations || null,
                _analyzed_attachments_at: new Date().toISOString(),
                _attachments_extracted: docTexts.length,
            },
            last_crawled_at: new Date().toISOString(),
        }).eq("id", opp.id);
        return { result: { extracted: docTexts.length, analyzed: true } };
    } catch (e) {
        return { error: `LLM analyze failed: ${e instanceof Error ? e.message : "unknown"}` };
    }
}

const HANDLERS: Record<string, (sb: SbAny, job: Job) => Promise<{ result?: unknown; error?: string }>> = {
    classify_naics: handleClassifyNaics,
    extract_structured_reqs: handleExtractStructuredReqs,
    extract_keywords: handleExtractKeywords,
    enrich_lead_brief: handleEnrichLeadBrief,
    analyze_attachments: handleAnalyzeAttachments,
};

export async function GET(req: NextRequest) {
    const denied = guardCron(req);
    if (denied) return denied;

    const url = new URL(req.url);
    const totalBudget = Math.min(Math.max(Number(url.searchParams.get("budget") || 55000), 5000), 290000);

    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );

    // Cookie refresh: top up warm_cf_cookie jobs for any portal whose
    // cached cookie expires within 6 minutes. CF clearance cookies live
    // ~30 min; we keep a 6-min safety window so scrape_portal_detail
    // never hits an expired cookie. The dedup index prevents duplicate
    // pending jobs for the same host. Hosts marked blocked in the last
    // 6h (migration 087) are skipped — see worker.js markHostBlocked.
    {
        const expirySoon = new Date(Date.now() + 6 * 60 * 1000).toISOString();
        const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
        const { data: expiring } = await sb.from("portal_cookies")
            .select("host, expires_at, last_blocked_at")
            .or(`expires_at.is.null,expires_at.lt.${expirySoon}`)
            .limit(50);
        const expiringHosts = ((expiring || []) as {
            host: string;
            expires_at: string | null;
            last_blocked_at: string | null;
        }[]).filter(r => !r.last_blocked_at || r.last_blocked_at < sixHoursAgo);
        if (expiringHosts.length > 0) {
            const rows = expiringHosts.map(r => ({
                task_type: "warm_cf_cookie",
                payload: { host: r.host },
                priority: 9,
            }));
            await sb.from("worker_jobs").insert(rows);
        }
    }

    const startedAt = Date.now();
    let processed = 0;
    let done = 0;
    let failed = 0;
    const byType: Record<string, { done: number; failed: number }> = {};

    while (Date.now() - startedAt < totalBudget) {
        const { data: jobs, error } = await sb.rpc("claim_jobs", {
            p_task_types: HTTP_TASK_TYPES,
            p_batch_size: 5,
        });
        if (error) {
            return NextResponse.json({ error: error.message, processed, done, failed }, { status: 500 });
        }
        if (!jobs || jobs.length === 0) break;

        for (const j of jobs as Job[]) {
            processed++;
            byType[j.task_type] = byType[j.task_type] || { done: 0, failed: 0 };
            const handler = HANDLERS[j.task_type];
            if (!handler) {
                await sb.rpc("finish_job", { p_job_id: j.id, p_status: "skipped", p_result: null, p_error: "no handler" });
                continue;
            }
            try {
                const res = await handler(sb, j);
                if (res.error) {
                    await sb.rpc("finish_job", {
                        p_job_id: j.id,
                        p_status: j.attempts >= j.max_attempts ? "failed" : "pending",
                        p_result: null,
                        p_error: res.error,
                    });
                    failed++;
                    byType[j.task_type].failed++;
                } else {
                    await sb.rpc("finish_job", { p_job_id: j.id, p_status: "done", p_result: (res.result || {}) as never, p_error: null });
                    done++;
                    byType[j.task_type].done++;
                }
            } catch (e) {
                const msg = (e instanceof Error ? e.message : String(e)).slice(0, 200);
                await sb.rpc("finish_job", {
                    p_job_id: j.id,
                    p_status: j.attempts >= j.max_attempts ? "failed" : "pending",
                    p_result: null,
                    p_error: msg,
                });
                failed++;
                byType[j.task_type].failed++;
            }
        }
    }

    return NextResponse.json({
        ok: true,
        processed,
        done,
        failed,
        by_type: byType,
        elapsed_ms: Date.now() - startedAt,
    });
}
