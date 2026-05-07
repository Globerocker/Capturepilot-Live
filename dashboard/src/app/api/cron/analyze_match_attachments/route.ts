import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchAndExtract } from "@/lib/document-extract";
import { callLLMJson } from "@/lib/llm/deepseek";

export const maxDuration = 300;

/**
 * Match-attachment analyzer — HOT/WARM first.
 *
 * Per run (every 20 min via pg_cron):
 *   1. Pick N opps that have resource_links but no analyzed docs yet,
 *      prioritized by user_matches classification (HOT > WARM > else).
 *   2. For each opp, download up to 3 attachments, extract text
 *      (PDF / DOCX / XLSX / ZIP), cache each in `opportunity_attachments`.
 *   3. Concatenate (current description + extracted texts) and hand the
 *      blob to DeepSeek/OpenAI with a structured-output prompt.
 *   4. Merge the LLM output into the opportunity:
 *      - structured_requirements  (scope, qualifications, deliverables,
 *        clauses, certifications, bonding, experience_years, …)
 *      - ai_win_strategy          (augmented with recommendations +
 *        positioning pulled from attachment evidence)
 *      - description              (replaced with a coherent summary)
 *      - last_crawled_at          (bump)
 *
 * Rate control: BATCH_SIZE=4 opps/run, max 3 docs each = up to 12 SAM
 * downloads per run. 3 runs/hour = 36 opps/hour. The HOT+WARM set is
 * ~100 opps so we cover it in under 3 hours.
 */

// Smaller numbers because Vercel's 1024 MB Lambda OOMs on bigger batches —
// PDF buffers + Mistral OCR markdown + JSZip heap accumulate across docs.
// 2 opps × 2 docs = 4 attachments/run instead of 12.
const BATCH_SIZE = 2;
const MAX_DOCS_PER_OPP = 2;
const MAX_DOC_BYTES = 8 * 1024 * 1024; // skip downloads > 8 MB
const SAM_API_KEY = process.env.SAM_API_KEY || "";

function admin() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );
}

const SYSTEM_PROMPT = `You are a federal capture strategist. You are given an opportunity
description plus concatenated text from its attached solicitation documents.
Output ONLY valid JSON matching the schema below. Be specific, quote numbers
and clauses verbatim when present, and prefer attachment evidence over the
short description.

Schema:
{
  "summary": "3-4 sentences: what the agency needs, why now, for whom.",
  "structured_requirements": {
    "scope_of_work": ["bullet", "bullet"],
    "qualifications": ["certification or experience requirement"],
    "deliverables": ["tangible output"],
    "period_of_performance": "string or null",
    "place_of_performance": "string or null",
    "security_clearance": "none | confidential | secret | top secret | ts/sci | null",
    "bonding_required": true | false | null,
    "insurance_required": true | false | null,
    "min_experience_years": integer | null,
    "certifications_required": ["8(a)","HUBZone","SDVOSB","ISO 9001","CMMI","…"],
    "far_clauses": ["FAR 52.xxx-xx"]
  },
  "recommendations": {
    "bid_or_no_bid": "GO" | "WATCH" | "NO-GO",
    "sales_angle": "The one differentiator to lead with",
    "key_risks": ["risk", "risk"],
    "next_steps": ["concrete action", "action"],
    "teaming_suggestions": ["prime type or specific capability to team with"]
  }
}

Rules:
- Never fabricate FAR clauses. Only list ones explicitly quoted in the
  text.
- If a field cannot be determined, use null (scalars) or [] (lists).
- Keep summary under 500 chars. Keep arrays to <=8 items each.`;

interface AnalysisOutput {
    summary: string;
    structured_requirements: Record<string, unknown>;
    recommendations: {
        bid_or_no_bid?: string;
        sales_angle?: string;
        key_risks?: string[];
        next_steps?: string[];
        teaming_suggestions?: string[];
    };
}

export async function GET(req: NextRequest) {
    // Dual auth (CRON_SECRET or SUPABASE_SERVICE_KEY)
    const auth = req.headers.get("authorization");
    const serviceKey = process.env.SUPABASE_SERVICE_KEY;
    const expectedCron = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : null;
    const expectedSvc = serviceKey ? `Bearer ${serviceKey}` : null;
    if ((expectedCron || expectedSvc) && auth !== expectedCron && auth !== expectedSvc) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = admin();
    const startTime = Date.now();
    const stats = { opps_processed: 0, docs_extracted: 0, llm_calls: 0, failures: 0, no_resource_links: 0, oversized_skipped: 0 };

    // Priority: HOT, WARM, recent
    // 1) Collect HOT+WARM opportunity_ids
    const { data: matches } = await db
        .from("user_matches")
        .select("opportunity_id, classification")
        .in("classification", ["HOT", "WARM"])
        .limit(400);
    const hotWarmIds = [...new Set((matches || []).map((m: { opportunity_id: string }) => m.opportunity_id))];

    // 2) Find candidates — we keep a watermark on opportunities via
    //    structured_requirements->>'_analyzed_attachments_at'. If set, skip.
    //    Prefer HOT/WARM set first, else recent opps with resource_links.
    let candidates: Array<{
        id: string; notice_id: string; title: string; description: string;
        resource_links: unknown; structured_requirements: Record<string, unknown> | null;
        ai_win_strategy: Record<string, unknown> | null; classification?: string | null;
    }> = [];

    if (hotWarmIds.length > 0) {
        const { data: hotOpps } = await db
            .from("opportunities")
            .select("id, notice_id, title, description, resource_links, structured_requirements, ai_win_strategy")
            .in("id", hotWarmIds)
            .eq("is_archived", false)
            .limit(BATCH_SIZE * 4);
        candidates = ((hotOpps || []) as typeof candidates).filter(o =>
            Array.isArray(o.resource_links) && (o.resource_links as unknown[]).length > 0
            && !(o.structured_requirements?._analyzed_attachments_at),
        );
    }
    // Fill remaining slots with recent opps that have resource_links but no
    // attachment-analysis watermark yet. We query aggressively (need * 30)
    // because most recent opps either have empty resource_links (nothing SAM
    // attached) or are already watermarked, so we need a deep pool to find
    // fresh ones.
    if (candidates.length < BATCH_SIZE) {
        const need = BATCH_SIZE - candidates.length;
        // Query the view (migration 060) so the jsonb_array_length>0 filter
        // is enforced server-side. PostgREST's filter syntax can't express
        // that on jsonb columns without false-matching null rows.
        const { data: recentOpps } = await db
            .from("opportunities_attachable")
            .select("id, notice_id, title, description, resource_links, structured_requirements, ai_win_strategy")
            .order("posted_date", { ascending: false, nullsFirst: false })
            .limit(need * 5);
        const alreadyIncluded = new Set(candidates.map(c => c.id));
        const extra = ((recentOpps || []) as typeof candidates).filter(o =>
            !alreadyIncluded.has(o.id)
            && Array.isArray(o.resource_links) && (o.resource_links as unknown[]).length > 0,
        ).slice(0, need);
        candidates.push(...extra);
    }

    const targets = candidates.slice(0, BATCH_SIZE);
    if (targets.length === 0) {
        return NextResponse.json({ success: true, message: "Nothing to analyze", ...stats });
    }

    try {
    for (const opp of targets) {
        if (Date.now() - startTime > 270_000) break;
        console.log(`[analyze_match_attachments] opp ${opp.id} (${(opp.title || "").slice(0, 60)})`);

        const links = (opp.resource_links as string[]) || [];
        if (links.length === 0) { stats.no_resource_links++; continue; }

        // Extract up to N documents
        const docTexts: Array<{ filename: string; text: string; kind: string }> = [];
        for (const url of links.slice(0, MAX_DOCS_PER_OPP)) {
            if (Date.now() - startTime > 260_000) break;
            try {
                let ext = await fetchAndExtract(url, { samApiKey: SAM_API_KEY });
                if (ext.bytes > MAX_DOC_BYTES) {
                    console.log(`[analyze_match_attachments] skip oversized ${ext.filename} (${ext.bytes} bytes)`);
                    stats.oversized_skipped++;
                    continue;
                }
                if (ext.text && ext.text.length > 100) {
                    docTexts.push({ filename: ext.filename, text: ext.text, kind: ext.kind });
                    stats.docs_extracted++;

                    // Upsert opportunity_attachments
                    await db.from("opportunity_attachments").upsert({
                        opportunity_id: opp.id,
                        filename: ext.filename.slice(0, 255),
                        file_url: url,
                        file_type: ext.kind,
                        file_size_bytes: ext.bytes,
                        extracted_text: ext.text.slice(0, 100_000),
                        downloaded_at: new Date().toISOString(),
                    }, { onConflict: "opportunity_id,filename", ignoreDuplicates: false });
                }
                // Drop the buffer so the heap can shrink before the next doc.
                ext = null as unknown as typeof ext;
            } catch (e) {
                console.error(`[analyze_match_attachments] doc failure: ${(e as Error).message}`);
                stats.failures++;
            }
        }

        if (docTexts.length === 0) {
            // Watermark even if nothing extractable, so we don't loop on it next run
            await db.from("opportunities").update({
                structured_requirements: {
                    ...(opp.structured_requirements || {}),
                    _analyzed_attachments_at: new Date().toISOString(),
                    _attachments_extracted: 0,
                },
                last_crawled_at: new Date().toISOString(),
            }).eq("id", opp.id);
            continue;
        }

        // Compose LLM input
        const combinedText = [
            `TITLE: ${opp.title}`,
            ``,
            `CURRENT DESCRIPTION (may be stale or short):`,
            (opp.description || "").slice(0, 3000),
            ``,
            `=== ATTACHED DOCUMENTS ===`,
            ...docTexts.map((d) => `\n--- ${d.filename} (${d.kind}) ---\n${d.text.slice(0, 15_000)}`),
        ].join("\n").slice(0, 90_000);

        let analysis: AnalysisOutput | null = null;
        try {
            analysis = await callLLMJson<AnalysisOutput>(
                [
                    { role: "system", content: SYSTEM_PROMPT },
                    { role: "user", content: combinedText },
                ],
                { temperature: 0.2, max_tokens: 2500 },
            );
            stats.llm_calls++;
        } catch {
            stats.failures++;
        }

        const updates: Record<string, unknown> = {
            last_crawled_at: new Date().toISOString(),
        };

        if (analysis?.structured_requirements) {
            updates.structured_requirements = {
                ...(opp.structured_requirements || {}),
                ...analysis.structured_requirements,
                _analyzed_attachments_at: new Date().toISOString(),
                _attachments_extracted: docTexts.length,
                _source_files: docTexts.map((d) => d.filename),
            };
        } else {
            updates.structured_requirements = {
                ...(opp.structured_requirements || {}),
                _analyzed_attachments_at: new Date().toISOString(),
                _attachments_extracted: docTexts.length,
            };
        }

        if (analysis?.recommendations) {
            updates.ai_win_strategy = {
                ...(opp.ai_win_strategy || {}),
                recommendations: analysis.recommendations,
                summary: analysis.summary || (opp.ai_win_strategy as Record<string, unknown>)?.summary,
                _augmented_from_attachments_at: new Date().toISOString(),
            };
        }

        if (analysis?.summary && analysis.summary.length > 100) {
            // Only replace description if it's still a URL stub or very short
            const currentDesc = String(opp.description || "");
            if (currentDesc.startsWith("https://api.sam.gov") || currentDesc.length < 200) {
                updates.description = analysis.summary;
            }
        }

        await db.from("opportunities").update(updates).eq("id", opp.id);
        stats.opps_processed++;
    }
    } catch (e) {
        console.error(`[analyze_match_attachments] fatal: ${(e as Error).message}`, e);
        return NextResponse.json({ error: (e as Error).message, ...stats, elapsed_ms: Date.now() - startTime }, { status: 500 });
    }

    return NextResponse.json({ success: true, ...stats, elapsed_ms: Date.now() - startTime });
}
