/**
 * Dedicated drain route for the analyze_attachments backlog.
 *
 * Counterpart to /api/cron/run_worker_jobs that ONLY claims
 * analyze_attachments jobs. Split out (2026-06-08) because the shared
 * Vercel consumer competes with cheap HTTP tasks (classify_naics,
 * extract_keywords, ...) and a single analyze_attachments job is 30-40s —
 * 1-2 attachment downloads + Mistral OCR + an LLM JSON pass. Sharing the
 * 60s budget meant only ~1-2 attachment jobs per invocation while the
 * pending backlog sat at ~12,723 rows (~30 days to drain at the shared
 * cadence).
 *
 * This route:
 *   - Claims ONLY task_type='analyze_attachments' (batch_size=10)
 *   - Runs to a 270s budget so it can sit inside Vercel's 300s maxDuration
 *   - Reuses the analyze_attachments handler from run_worker_jobs/route.ts
 *     by importing the per-task logic locally (duplicated below — the
 *     handler is self-contained so duplication is cheaper than carving
 *     a shared module mid-flight).
 *
 * Scheduled every 3 min in vercel.json. Drain math:
 *   ~10 jobs/run × 20 runs/hour × 24h ≈ 4,800/day.
 *   12,723 backlog ÷ 4,800 ≈ ~2.6 days to drain (vs ~30 days shared).
 *
 * Notes:
 *   - Stale-running reap is handled by the shared consumer; no need to
 *     duplicate the RPC here (it would just race on the same rows).
 *   - Cookie warmer top-up is also shared-consumer territory — this route
 *     never claims warm_cf_cookie / scrape_portal_detail.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { guardCron } from "@/lib/cron-auth";
import { withCronTelemetry } from "@/lib/cron-telemetry";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SbAny = SupabaseClient<any, any, any>;

export const runtime = "nodejs";
export const maxDuration = 300;

type Job = {
    id: string;
    task_type: string;
    payload: Record<string, unknown>;
    attempts: number;
    max_attempts: number;
};

// Per-opportunity attachment analysis. Mirrors handleAnalyzeAttachments in
// /api/cron/run_worker_jobs/route.ts — kept inline (rather than imported)
// so this drain route stays isolated and self-contained. Any change to the
// analysis logic must be applied in BOTH places.
async function handleAnalyzeAttachments(sb: SbAny, job: Job) {
    const oppId = job.payload.opp_id as string;
    if (!oppId) return { error: "missing opp_id" };

    const { fetchAndExtract } = await import("@/lib/document-extract");
    const { callLLMJson } = await import("@/lib/llm/deepseek");

    const { data: opp } = await sb.from("opportunities")
        .select("id, notice_id, title, description, resource_links, structured_requirements")
        .eq("id", oppId)
        .maybeSingle() as { data: { id: string; notice_id: string | null; title: string | null; description: string | null; resource_links: string[] | null; structured_requirements: Record<string, unknown> | null } | null };
    if (!opp) return { error: "opp not found" };
    const links = (opp.resource_links || []).filter(Boolean);
    if (links.length === 0) return { result: { skipped: "no_resource_links" } };

    const SAM_API_KEY = process.env.SAM_API_KEY || "";
    const MAX_BYTES = 4 * 1024 * 1024;
    const start = Date.now();
    const docTexts: Array<{ filename: string; text: string; kind: string }> = [];
    let bucketUploads = 0;
    let bucketSkips = 0;
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

            if (opp.notice_id && /sam\.gov/i.test(url) && Date.now() - start < 28_000) {
                try {
                    const headers: Record<string, string> = SAM_API_KEY ? { "X-Api-Key": SAM_API_KEY } : {};
                    const r = await fetch(url, {
                        headers,
                        signal: AbortSignal.timeout(15_000),
                        redirect: "follow",
                    });
                    if (r.ok) {
                        const bytes = new Uint8Array(await r.arrayBuffer());
                        if (bytes.byteLength > 0 && bytes.byteLength <= MAX_BYTES) {
                            const safeName = ext.filename.replace(/[^\w\-. ]+/g, "_").slice(0, 200) || `${Date.now()}.${ext.kind}`;
                            const path = `${opp.notice_id}/${safeName}`;
                            const contentType = r.headers.get("content-type")
                                || (ext.kind === "pdf" ? "application/pdf" : "application/octet-stream");
                            const { error: upErr } = await sb.storage
                                .from("opportunity-attachments")
                                .upload(path, bytes, { contentType, upsert: true });
                            if (upErr) {
                                bucketSkips++;
                                console.warn(`[analyze_attachments] storage upload failed for ${path}: ${upErr.message}`);
                            } else {
                                bucketUploads++;
                            }
                        } else {
                            bucketSkips++;
                        }
                    } else {
                        bucketSkips++;
                    }
                } catch (storErr) {
                    bucketSkips++;
                    console.warn(`[analyze_attachments] storage fetch/upload error for ${url}:`, storErr instanceof Error ? storErr.message : storErr);
                }
            }
        } catch (e) {
            console.warn(`[analyze_attachments] doc fail ${url}:`, e instanceof Error ? e.message : e);
        }
    }

    if (docTexts.length === 0) {
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
        return { result: { extracted: docTexts.length, analyzed: true, bucket_uploads: bucketUploads, bucket_skips: bucketSkips } };
    } catch (e) {
        return { error: `LLM analyze failed: ${e instanceof Error ? e.message : "unknown"}` };
    }
}

async function GET_handler(req: NextRequest): Promise<NextResponse> {
    const denied = guardCron(req);
    if (denied) return denied;

    const url = new URL(req.url);
    // Default 270s — keeps a safety margin inside the 300s maxDuration so
    // the in-flight job + finish_job RPC have time to complete cleanly.
    const totalBudget = Math.min(Math.max(Number(url.searchParams.get("budget") || 270_000), 5_000), 290_000);
    const batchSize = Math.min(Math.max(Number(url.searchParams.get("batch_size") || 10), 1), 25);

    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );

    const startedAt = Date.now();
    let processed = 0;
    let done = 0;
    let failed = 0;

    while (Date.now() - startedAt < totalBudget) {
        const { data: jobs, error } = await sb.rpc("claim_jobs", {
            p_task_types: ["analyze_attachments"],
            p_batch_size: batchSize,
        });
        if (error) {
            return NextResponse.json({ error: error.message, processed, done, failed }, { status: 500 });
        }
        if (!jobs || jobs.length === 0) break;

        for (const j of jobs as Job[]) {
            // Hard stop if we're close to the budget — don't start a new
            // 30-40s job if we have <40s left. Leaves it for the next tick.
            if (Date.now() - startedAt > totalBudget - 40_000) break;
            processed++;
            try {
                const res = await handleAnalyzeAttachments(sb, j);
                if (res.error) {
                    await sb.rpc("finish_job", {
                        p_job_id: j.id,
                        p_status: j.attempts >= j.max_attempts ? "failed" : "pending",
                        p_result: null,
                        p_error: res.error,
                    });
                    failed++;
                } else {
                    await sb.rpc("finish_job", { p_job_id: j.id, p_status: "done", p_result: (res.result || {}) as never, p_error: null });
                    done++;
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
            }
        }
    }

    return NextResponse.json({
        ok: true,
        task_type: "analyze_attachments",
        processed,
        done,
        failed,
        elapsed_ms: Date.now() - startedAt,
    });
}

export const GET = withCronTelemetry("/api/cron/run_worker_jobs_attachments", GET_handler);
