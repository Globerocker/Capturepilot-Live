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
import { extractCountyRequirements } from "@/lib/structured-requirements/county";
import { extractStateRequirements } from "@/lib/structured-requirements/state";
import { extractFederalRequirements } from "@/lib/structured-requirements/federal";
import { extractCityRequirements } from "@/lib/structured-requirements/city";
import { extractAiKeywords } from "@/lib/extract-ai-keywords";
import { generateLeadBrief } from "@/lib/lead-brief";
import { enrichPersonViaApollo } from "@/lib/lead-enrichment";
// Fix: cron_runs telemetry coverage — wrap handler so /admin/health stale-cron
// detector and daily digest can see this route. Previously only 5 of 35 crons
// were logging to cron_runs.
import { withCronTelemetry } from "@/lib/cron-telemetry";

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
    "extract_structured_reqs_county",
    "extract_structured_reqs_federal",
    "extract_structured_reqs_state",
    "extract_structured_reqs_city",
    "extract_keywords",
    "enrich_lead_brief",
    "enrich_lead_apollo",
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

// Source-tuned extractor for county opportunities. The fan-out trigger
// enqueues this task_type instead of the generic extract_structured_reqs
// whenever source='county'. Writes the canonical
// {@link import("@/lib/structured-requirements/types").StructuredRequirements}
// shape and merges over whatever the regex/legacy extractor previously wrote.
//
// We also pre-fetch any attachment text already cached on
// opportunity_attachments so the prompt sees both sources in one shot —
// avoids the analyze_attachments→merge race where the LLM-from-attachments
// run can stomp the cleaner description-only extraction.
async function handleExtractStructuredReqsCounty(sb: SbAny, job: Job) {
    const oppId = job.payload.opp_id as string;
    if (!oppId) return { error: "missing opp_id" };

    const { data: opp } = await sb.from("opportunities")
        .select("id, title, description, agency, naics_code, set_aside_code, response_deadline, structured_requirements")
        .eq("id", oppId)
        .maybeSingle() as { data: {
            id: string;
            title: string | null;
            description: string | null;
            agency: string | null;
            naics_code: string | null;
            set_aside_code: string | null;
            response_deadline: string | null;
            structured_requirements: Record<string, unknown> | null;
        } | null };
    if (!opp) return { error: "opp not found" };

    const existing = (opp.structured_requirements || {}) as Record<string, unknown>;

    // Pre-fetch any attachment text already extracted by the
    // analyze_attachments path. Stored in opportunity_attachments.extracted_text.
    let attachmentsText: string | null = null;
    try {
        const { data: atts } = await sb.from("opportunity_attachments")
            .select("filename, extracted_text")
            .eq("opportunity_id", oppId)
            .limit(3) as { data: { filename: string | null; extracted_text: string | null }[] | null };
        if (atts && atts.length > 0) {
            attachmentsText = atts
                .map(a => `--- ${a.filename || "doc"} ---\n${(a.extracted_text || "").slice(0, 8_000)}`)
                .join("\n\n")
                .slice(0, 18_000);
        }
    } catch {
        // Non-fatal — fall through with description only.
    }

    const result = await extractCountyRequirements({
        id: opp.id,
        title: opp.title,
        description: opp.description,
        agency: opp.agency,
        naics_code: opp.naics_code,
        set_aside_code: opp.set_aside_code,
        response_deadline: opp.response_deadline,
        attachments_text: attachmentsText,
    });
    if (!result) return { result: { no_extraction: true } };

    // Merge over whatever was previously written (regex sentinels, etc.).
    // Last writer wins on conflicting keys — county extractor is the authority
    // for county rows.
    const merged = { ...existing, ...result };
    const { error: upErr } = await sb.from("opportunities")
        .update({ structured_requirements: merged })
        .eq("id", oppId);
    if (upErr) return { error: upErr.message };
    return {
        result: {
            extracted: true,
            extracted_from: result.extracted_from,
            scope_items: result.scope_of_work.length,
            extractor_version: result.extractor_version,
        },
    };
}

// Source-tuned extractor for city / municipal opportunities. The fan-out
// trigger (migration 121) enqueues this task_type instead of the generic
// extract_structured_reqs whenever jurisdiction_level='city'. Writes the
// canonical StructuredRequirements shape and merges over whatever the
// regex/legacy extractor previously wrote. Also pre-fetches any attachment
// text already cached on opportunity_attachments so the prompt sees both
// description + attachments in one shot.
async function handleExtractStructuredReqsCity(sb: SbAny, job: Job) {
    const oppId = job.payload.opp_id as string;
    if (!oppId) return { error: "missing opp_id" };

    const { data: opp } = await sb.from("opportunities")
        .select("id, title, description, agency, naics_code, set_aside_code, response_deadline, structured_requirements")
        .eq("id", oppId)
        .maybeSingle() as { data: {
            id: string;
            title: string | null;
            description: string | null;
            agency: string | null;
            naics_code: string | null;
            set_aside_code: string | null;
            response_deadline: string | null;
            structured_requirements: Record<string, unknown> | null;
        } | null };
    if (!opp) return { error: "opp not found" };

    const existing = (opp.structured_requirements || {}) as Record<string, unknown>;

    let attachmentsText: string | null = null;
    try {
        const { data: atts } = await sb.from("opportunity_attachments")
            .select("filename, extracted_text")
            .eq("opportunity_id", oppId)
            .limit(3) as { data: { filename: string | null; extracted_text: string | null }[] | null };
        if (atts && atts.length > 0) {
            attachmentsText = atts
                .map(a => `--- ${a.filename || "doc"} ---\n${(a.extracted_text || "").slice(0, 8_000)}`)
                .join("\n\n")
                .slice(0, 18_000);
        }
    } catch {
        // Non-fatal — fall through with description only.
    }

    const result = await extractCityRequirements({
        id: opp.id,
        title: opp.title,
        description: opp.description,
        agency: opp.agency,
        naics_code: opp.naics_code,
        set_aside_code: opp.set_aside_code,
        response_deadline: opp.response_deadline,
        attachments_text: attachmentsText,
    });
    if (!result) return { result: { no_extraction: true } };

    const merged = { ...existing, ...result };
    const { error: upErr } = await sb.from("opportunities")
        .update({ structured_requirements: merged })
        .eq("id", oppId);
    if (upErr) return { error: upErr.message };
    return {
        result: {
            extracted: true,
            extracted_from: result.extracted_from,
            scope_items: result.scope_of_work.length,
            extractor_version: result.extractor_version,
        },
    };
}

// Source-tuned extractor for State (SLED) opportunities. The fan-out trigger
// enqueues this task_type instead of the generic extract_structured_reqs
// whenever source='sled' (state portals — Bonfire/BidExpress/IonWave/etc.).
// Writes the canonical
// {@link import("@/lib/structured-requirements/types").StructuredRequirements}
// shape and merges over whatever the regex/legacy extractor previously wrote.
//
// State prompts surface signals federal extractors miss: MBE/WBE/DBE
// diversity (NOT 8(a)/HUBZone), state-issued certifications (NOT FAR
// clauses), bid_bond_pct + performance_bond_pct as numbers, mandatory
// pre-bid meeting date/location, local-vendor preference.
async function handleExtractStructuredReqsState(sb: SbAny, job: Job) {
    const oppId = job.payload.opp_id as string;
    if (!oppId) return { error: "missing opp_id" };

    const { data: opp } = await sb.from("opportunities")
        .select("id, title, description, agency, naics_code, set_aside_code, response_deadline, structured_requirements")
        .eq("id", oppId)
        .maybeSingle() as { data: {
            id: string;
            title: string | null;
            description: string | null;
            agency: string | null;
            naics_code: string | null;
            set_aside_code: string | null;
            response_deadline: string | null;
            structured_requirements: Record<string, unknown> | null;
        } | null };
    if (!opp) return { error: "opp not found" };

    const existing = (opp.structured_requirements || {}) as Record<string, unknown>;

    // Pre-fetch attachment text already extracted by the analyze_attachments
    // path. State portals typically post a Bid Documents PDF that holds the
    // meat of the requirements — the listing page is often a one-paragraph
    // blurb. Including both sources in one prompt avoids the
    // description→merge race where attachments stomp cleaner extractions.
    let attachmentsText: string | null = null;
    try {
        const { data: atts } = await sb.from("opportunity_attachments")
            .select("filename, extracted_text")
            .eq("opportunity_id", oppId)
            .limit(3) as { data: { filename: string | null; extracted_text: string | null }[] | null };
        if (atts && atts.length > 0) {
            attachmentsText = atts
                .map(a => `--- ${a.filename || "doc"} ---\n${(a.extracted_text || "").slice(0, 8_000)}`)
                .join("\n\n")
                .slice(0, 18_000);
        }
    } catch {
        // Non-fatal — fall through with description only.
    }

    const result = await extractStateRequirements({
        id: opp.id,
        title: opp.title,
        description: opp.description,
        agency: opp.agency,
        naics_code: opp.naics_code,
        set_aside_code: opp.set_aside_code,
        response_deadline: opp.response_deadline,
        attachments_text: attachmentsText,
    });
    if (!result) return { result: { no_extraction: true } };

    // Stamp the actual write timestamp so the column timeline matches the
    // DB write, not the LLM-completion moment (which can lag a few seconds).
    result.extracted_at = new Date().toISOString();

    // Merge over whatever was previously written. Last writer wins on
    // conflicting keys — the state extractor is the authority for sled rows.
    const merged = { ...existing, ...result };
    const { error: upErr } = await sb.from("opportunities")
        .update({ structured_requirements: merged })
        .eq("id", oppId);
    if (upErr) return { error: upErr.message };
    return {
        result: {
            extracted: true,
            extracted_from: result.extracted_from,
            scope_items: result.scope_of_work.length,
            cert_items: result.required_certifications.length,
            diversity_items: result.diversity_requirements?.length ?? 0,
            has_pre_bid: !!result.pre_bid_meeting,
            extractor_version: result.extractor_version,
        },
    };
}

// Source-tuned extractor for Federal (SAM.gov) opportunities. The fan-out
// trigger enqueues this task_type instead of the generic
// extract_structured_reqs whenever source='sam'. Writes the canonical
// {@link import("@/lib/structured-requirements/types").StructuredRequirements}
// shape and merges over whatever the legacy regex / LLM extractor wrote.
//
// Mirrors the county/state/city handlers — pre-fetches cached attachment
// text from opportunity_attachments so the prompt sees both description +
// attachments in one LLM call. Avoids the analyze_attachments → merge race
// where the attachment-only extractor stomps cleaner description-only fields.
async function handleExtractStructuredReqsFederal(sb: SbAny, job: Job) {
    const oppId = job.payload.opp_id as string;
    if (!oppId) return { error: "missing opp_id" };

    const { data: opp } = await sb.from("opportunities")
        .select("id, title, description, agency, naics_code, set_aside_code, response_deadline, structured_requirements")
        .eq("id", oppId)
        .maybeSingle() as { data: {
            id: string;
            title: string | null;
            description: string | null;
            agency: string | null;
            naics_code: string | null;
            set_aside_code: string | null;
            response_deadline: string | null;
            structured_requirements: Record<string, unknown> | null;
        } | null };
    if (!opp) return { error: "opp not found" };

    const existing = (opp.structured_requirements || {}) as Record<string, unknown>;

    let attachmentsText: string | null = null;
    try {
        const { data: atts } = await sb.from("opportunity_attachments")
            .select("filename, extracted_text")
            .eq("opportunity_id", oppId)
            .limit(3) as { data: { filename: string | null; extracted_text: string | null }[] | null };
        if (atts && atts.length > 0) {
            attachmentsText = atts
                .map(a => `--- ${a.filename || "doc"} ---\n${(a.extracted_text || "").slice(0, 8_000)}`)
                .join("\n\n")
                .slice(0, 18_000);
        }
    } catch {
        // Non-fatal — proceed with description only.
    }

    const result = await extractFederalRequirements({
        id: opp.id,
        title: opp.title,
        description: opp.description,
        agency: opp.agency,
        naics_code: opp.naics_code,
        set_aside_code: opp.set_aside_code,
        response_deadline: opp.response_deadline,
        attachments_text: attachmentsText,
    });
    if (!result) return { result: { no_extraction: true } };

    // Last writer wins on conflicting keys — federal extractor is the
    // authority for SAM rows.
    const merged = { ...existing, ...result };
    const { error: upErr } = await sb.from("opportunities")
        .update({ structured_requirements: merged })
        .eq("id", oppId);
    if (upErr) return { error: upErr.message };
    return {
        result: {
            extracted: true,
            extracted_from: result.extracted_from,
            scope_items: result.scope_of_work.length,
            cert_items: result.required_certifications.length,
            diversity_items: result.diversity_requirements?.length ?? 0,
            has_pre_bid: !!result.pre_bid_meeting,
            extractor_version: result.extractor_version,
        },
    };
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

// Fix: marketing_leads.apollo_enriched_at was never written for leads where
// the inline /api/leads call missed (no Apollo hit, missing key, network err).
// This handler ALWAYS stamps the timestamp after the attempt — so a miss is
// recorded as "we tried" and the lead never gets re-queued forever.
// Gated by APOLLO_ENABLE_LEAD_MATCH so we don't burn credits in dev.
async function handleEnrichLeadApollo(sb: SbAny, job: Job) {
    const leadId = job.payload.lead_id as string;
    if (!leadId) return { error: "missing lead_id" };

    // Env gate — when unset, mark as enriched (with skip reason) so the
    // lead leaves the queue. Flip APOLLO_ENABLE_LEAD_MATCH=true in Vercel
    // to actually call Apollo. Cheap insurance against accidental spend.
    if (process.env.APOLLO_ENABLE_LEAD_MATCH !== "true") {
        await sb.from("marketing_leads")
            .update({
                apollo_enriched_at: new Date().toISOString(),
                apollo_data: { _skipped: "APOLLO_ENABLE_LEAD_MATCH disabled" } as unknown as Record<string, unknown>,
            })
            .eq("id", leadId);
        return { result: { skipped: "env_disabled" } };
    }

    const { data: lead } = await sb.from("marketing_leads")
        .select("id, email, first_name, last_name, company, phone, apollo_enriched_at")
        .eq("id", leadId)
        .maybeSingle() as { data: { id: string; email: string | null; first_name: string | null; last_name: string | null; company: string | null; phone: string | null; apollo_enriched_at: string | null } | null };

    if (!lead) return { error: "lead not found" };
    if (!lead.email) {
        // No email → can't query Apollo. Stamp it so the lead doesn't loop.
        await sb.from("marketing_leads")
            .update({
                apollo_enriched_at: new Date().toISOString(),
                apollo_data: { _skipped: "no_email" } as unknown as Record<string, unknown>,
            })
            .eq("id", leadId);
        return { result: { skipped: "no_email" } };
    }
    if (lead.apollo_enriched_at) {
        return { result: { skipped: "already_enriched" } };
    }

    const enriched = await enrichPersonViaApollo({
        firstName: lead.first_name,
        lastName: lead.last_name,
        email: lead.email,
        companyName: lead.company,
    });

    // CRITICAL: stamp apollo_enriched_at even on a miss. Without this, the
    // backfill cron re-queues the same leads forever and we never know
    // whether the data is missing because we never tried or because the
    // person isn't in Apollo's index.
    const update: Record<string, unknown> = {
        apollo_enriched_at: new Date().toISOString(),
        apollo_data: enriched
            ? (enriched as unknown as Record<string, unknown>)
            : ({ _miss: true } as unknown as Record<string, unknown>),
    };
    // Backfill phone only when the user didn't provide one.
    if (!lead.phone && enriched?.phone) {
        update.phone = enriched.phone;
    }

    const { error: upErr } = await sb.from("marketing_leads")
        .update(update)
        .eq("id", leadId);
    if (upErr) return { error: upErr.message };

    return { result: { matched: !!enriched, has_phone: !!enriched?.phone } };
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
    extract_structured_reqs_county: handleExtractStructuredReqsCounty,
    extract_structured_reqs_city: handleExtractStructuredReqsCity,
    extract_structured_reqs_state: handleExtractStructuredReqsState,
    extract_structured_reqs_federal: handleExtractStructuredReqsFederal,
    extract_keywords: handleExtractKeywords,
    enrich_lead_brief: handleEnrichLeadBrief,
    enrich_lead_apollo: handleEnrichLeadApollo,
    analyze_attachments: handleAnalyzeAttachments,
};

async function GET_handler(req: NextRequest): Promise<NextResponse> {
    const denied = guardCron(req);
    if (denied) return denied;

    const url = new URL(req.url);
    const totalBudget = Math.min(Math.max(Number(url.searchParams.get("budget") || 55000), 5000), 290000);

    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );

    // Fix: reap stale "running" worker_jobs (migration 119).
    // Vercel timeouts and Railway worker crashes can leave rows in
    // status='running' forever. The partial unique dedup index covers
    // status IN ('pending','running'), so a stuck row silently blocks every
    // re-enqueue of the same (task_type, target) — the fan-out trigger and
    // enqueue_backfill both ON CONFLICT DO NOTHING. Running this every tick
    // keeps the active dedup window honest.
    {
        const { data: reaped, error: reapErr } = await sb.rpc("reap_stale_jobs");
        if (reapErr) {
            console.warn("[run_worker_jobs] reap_stale_jobs failed:", reapErr.message);
        } else if (reaped && Array.isArray(reaped) && reaped[0]) {
            const r = reaped[0] as { requeued?: number; failed?: number };
            if ((r.requeued || 0) + (r.failed || 0) > 0) {
                console.log(`[run_worker_jobs] reaped stale jobs: requeued=${r.requeued} failed=${r.failed}`);
            }
        }
    }

    // Cookie refresh: top up warm_cf_cookie jobs for any portal whose
    // cached cookie expires within 2 minutes. CF clearance cookies live
    // ~30 min; we keep a 2-min safety window so scrape_portal_detail
    // never hits an expired cookie. The dedup index prevents duplicate
    // pending jobs for the same host. Hosts marked blocked in the last
    // 6h (migration 087) are skipped — see worker.js markHostBlocked.
    //
    // Fix: was 6 min, but worker.js savePortalCookies defaults expires_at
    // to now()+25min for session-only CF cookies — a freshly-saved cookie
    // would already look "expiring soon" under a wider window and burn
    // warm jobs in a loop. 2 min is well inside the 25-min default TTL.
    {
        const expirySoon = new Date(Date.now() + 2 * 60 * 1000).toISOString();
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

export const GET = withCronTelemetry("/api/cron/run_worker_jobs", GET_handler);
