/**
 * LA RAMP per-row enrichment.
 *
 * For every `socrata-la-ramp-*` opportunity that has a raw_json.row.url.url
 * pointing at rampla.org, fetch the Aura JSON detail + attachments and
 * upsert the enriched fields back. Idempotent — `?force=true` re-fetches
 * already-enriched rows.
 *
 * Operator triggered (40/40 cron cap reached). Run via:
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *     "https://app.capturepilot.com/api/cron/enrich_la_ramp?limit=50"
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { guardCron } from "@/lib/cron-auth";
import { extractContacts } from "@/lib/extract-contacts";
import { extractRichFields } from "@/lib/extract-rich-fields";
import { fetchRampOpportunityDetail, fetchRampAttachments } from "@/lib/parsers/la-ramp";

export const runtime = "nodejs";
export const maxDuration = 300;

function extractSalesforceId(url: string | null | undefined): string | null {
    if (!url) return null;
    const m = url.match(/[?&]id=([a-zA-Z0-9]{15,18})/);
    return m ? m[1] : null;
}

export async function GET(req: NextRequest) {
    const denied = guardCron(req);
    if (denied) return denied;

    const url = new URL(req.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 50), 1), 200);
    const force = url.searchParams.get("force") === "true";

    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );

    // Pull LA RAMP rows. Prefer rows that don't yet have rich descriptions
    // (Socrata's payload is title-only) unless force=true.
    let query = sb
        .from("opportunities")
        .select("id, notice_id, title, description, link, raw_json")
        .like("notice_id", "socrata-la-ramp-%")
        .limit(limit);
    if (!force) {
        // proxy for "not yet enriched": description is empty or < 200 chars.
        query = query.or("description.is.null,description.eq.");
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    type Row = { id: string; notice_id: string; title: string | null; description: string | null; link: string | null; raw_json: Record<string, unknown> | null };
    const targets = (data || []) as Row[];
    if (targets.length === 0) return NextResponse.json({ ok: true, scanned: 0, note: "no pending LA RAMP rows" });

    const startedAt = Date.now();
    let enriched = 0;
    let aurafail = 0;
    let totalAttachments = 0;
    const sample: Array<{ notice_id: string; rec_id: string; attachments: number }> = [];

    // Stay polite — 4 parallel max per the research recommendation.
    const CONCURRENCY = 4;
    for (let i = 0; i < targets.length; i += CONCURRENCY) {
        if (Date.now() - startedAt > 270_000) break;
        const slice = targets.slice(i, i + CONCURRENCY);
        await Promise.all(slice.map(async (r) => {
            const recId = extractSalesforceId(r.link) || extractSalesforceId(
                (((r.raw_json?.row as Record<string, unknown> | undefined)?.url) as { url?: string } | undefined)?.url,
            );
            if (!recId) return;

            const [detail, attachments] = await Promise.all([
                fetchRampOpportunityDetail({ recordId: recId }),
                fetchRampAttachments({ recordId: recId }),
            ]);
            if (!detail) { aurafail++; return; }

            const newDescription = detail.description || r.description;
            const ex = extractContacts(newDescription || "");
            const rich = extractRichFields(newDescription || "");

            const update: Record<string, unknown> = {
                description: newDescription ? newDescription.slice(0, 12000) : r.description,
                agency: detail.department || null,
                response_deadline: detail.bid_due,
                award_amount: detail.amount,
                extracted_emails: ex.emails.length ? ex.emails : null,
                extracted_phones: ex.phones.length ? ex.phones : null,
                extracted_urls: ex.urls.length ? ex.urls : null,
                extracted_attachment_urls: attachments.map((a) => a.download_url).slice(0, 30),
                extracted_at: new Date().toISOString(),
                estimated_value_min: rich.estimated_value_min ?? detail.amount,
                estimated_value_max: rich.estimated_value_max ?? detail.amount,
                estimated_value_text: rich.estimated_value_text,
                is_subcontract: rich.is_subcontract,
                opportunity_class: rich.opportunity_class,
                extracted_offices: rich.government_offices.length ? rich.government_offices : null,
                last_crawled_at: new Date().toISOString(),
                raw_json: {
                    ...(r.raw_json || {}),
                    ramp_aura: {
                        record_id: recId,
                        account_id: detail.account_id,
                        stage: detail.stage,
                        attachments: attachments.map((a) => ({ id: a.content_document_id, title: a.title, ext: a.file_extension, size: a.size_bytes })),
                    },
                },
            };

            const { error: upErr } = await sb.from("opportunities").update(update).eq("id", r.id);
            if (upErr) {
                console.warn("[enrich_la_ramp]", r.notice_id, upErr.message);
                return;
            }
            enriched++;
            totalAttachments += attachments.length;
            if (sample.length < 5) sample.push({ notice_id: r.notice_id, rec_id: recId, attachments: attachments.length });
        }));
    }

    return NextResponse.json({
        ok: true,
        scanned: targets.length,
        enriched,
        aura_failures: aurafail,
        total_attachments: totalAttachments,
        sample,
        elapsed_ms: Date.now() - startedAt,
    });
}
