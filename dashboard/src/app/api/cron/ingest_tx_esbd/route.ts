/**
 * Texas ESBD ingest cron.
 *
 * Walks the open-solicitation listing pages on txsmartbuy.gov, fetches
 * each detail page, runs the contact + rich-field extractors, and
 * upserts into the `opportunities` table with a `tx-esbd-` notice_id
 * prefix.
 *
 * Per docs/source-analysis/STATE_HTML_SCRAPERS.md the portal is fully
 * server-rendered, so vanilla fetch + regex parsing works. No
 * Playwright dependency.
 *
 * Not scheduled in vercel.json (40/40 cron cap hit). Operator triggers
 * via curl + CRON_SECRET. Default budget: 9 list pages × ~22 rows = 200
 * open solicitations per run. Wall-time ~3-4 minutes (200 row × 1s
 * detail fetch + extractors).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { guardCron } from "@/lib/cron-auth";
import { extractContacts } from "@/lib/extract-contacts";
import { extractRichFields } from "@/lib/extract-rich-fields";
import {
    fetchTxEsbdList,
    fetchTxEsbdDetail,
    mapStatus,
} from "@/lib/parsers/tx-esbd";
import crypto from "node:crypto";

export const runtime = "nodejs";
export const maxDuration = 300;

function shortHash(s: string): string {
    return crypto.createHash("sha1").update(s).digest("hex").slice(0, 12);
}

export async function GET(req: NextRequest) {
    const denied = guardCron(req);
    if (denied) return denied;

    const url = new URL(req.url);
    const maxPages = Math.min(Math.max(Number(url.searchParams.get("max_pages") || 9), 1), 50);
    const concurrency = Math.min(Math.max(Number(url.searchParams.get("concurrency") || 6), 1), 12);

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );

    // Walk pages 1..maxPages
    const listings = new Map<string, { id: string; title: string }>();
    for (let p = 1; p <= maxPages; p++) {
        const rows = await fetchTxEsbdList({ status: "1", page: p });
        for (const r of rows) {
            if (!listings.has(r.id)) listings.set(r.id, r);
        }
        if (rows.length === 0) break;
    }

    if (listings.size === 0) {
        return NextResponse.json({ ok: true, found: 0, inserted: 0, note: "list returned 0" });
    }

    const ids = Array.from(listings.values());
    let inserted = 0;
    let errors = 0;
    let skipped = 0;
    const startedAt = Date.now();

    for (let i = 0; i < ids.length; i += concurrency) {
        if (Date.now() - startedAt > 270_000) {
            // 270s safety cap — leave 30s for the final upsert + return.
            break;
        }
        const slice = ids.slice(i, i + concurrency);
        const details = await Promise.all(slice.map(async (l) => {
            try {
                const d = await fetchTxEsbdDetail(l.id);
                return d ? { listing: l, detail: d } : null;
            } catch {
                return null;
            }
        }));

        const rows = details
            .filter((d): d is NonNullable<typeof d> => d !== null)
            .map(({ listing, detail }) => {
                // Run our existing extractors on the description so the detail
                // page's Contact panel + rich-fields populate consistently.
                const ex = extractContacts(detail.description || "");
                const rich = extractRichFields(detail.description || "");
                // Promote structured POC fields ahead of regex-extracted ones.
                if (detail.contact_email && !ex.emails.includes(detail.contact_email.toLowerCase())) {
                    ex.emails.unshift(detail.contact_email.toLowerCase());
                }
                if (detail.contact_phone) {
                    const digits = detail.contact_phone.replace(/\D/g, "");
                    if (!ex.phones.some((p) => p.replace(/\D/g, "") === digits)) {
                        ex.phones.unshift(detail.contact_phone);
                    }
                }
                // Attachment URLs from the parser feed extracted_attachment_urls.
                const attachmentUrls = detail.attachments.map((a) => a.url).slice(0, 30);

                return {
                    notice_id: `tx-esbd-${shortHash(detail.id)}`,
                    title: detail.title.slice(0, 500),
                    description: detail.description ? detail.description.slice(0, 12000) : null,
                    agency: detail.agency_code,
                    sub_agency: null,
                    place_of_performance_state: "TX",
                    place_of_performance_city: null,
                    notice_type: "Solicitation",
                    posted_date: detail.posted_at,
                    response_deadline: detail.response_deadline,
                    link: `https://www.txsmartbuy.gov/esbd/${detail.id}`,
                    status: mapStatus(detail.status),
                    is_archived: false,
                    last_crawled_at: new Date().toISOString(),
                    source: "sled",
                    jurisdiction_level: "state",
                    jurisdiction_code: "TX",
                    raw_json: {
                        provider: "tx_esbd",
                        source_id: detail.id,
                        raw_fields: detail.raw_fields,
                        nigp_codes: detail.nigp_codes,
                        attachments: detail.attachments,
                    } as Record<string, unknown>,
                    extracted_emails: ex.emails.length ? ex.emails : null,
                    extracted_phones: ex.phones.length ? ex.phones : null,
                    extracted_urls: ex.urls.length ? ex.urls : null,
                    extracted_at: new Date().toISOString(),
                    estimated_value_min: rich.estimated_value_min,
                    estimated_value_max: rich.estimated_value_max,
                    estimated_value_text: rich.estimated_value_text,
                    is_subcontract: rich.is_subcontract,
                    opportunity_class: rich.opportunity_class,
                    extracted_offices: rich.government_offices.length ? rich.government_offices : null,
                    extracted_attachment_urls: attachmentUrls.length ? attachmentUrls : null,
                };
            });

        if (rows.length === 0) {
            skipped += slice.length;
            continue;
        }

        let upsertErr = (await supabase.from("opportunities").upsert(rows, { onConflict: "notice_id" })).error;
        if (upsertErr && /(extracted_|estimated_|opportunity_class|is_subcontract|jurisdiction_)/i.test(upsertErr.message)) {
            const slim = rows.map(({
                extracted_emails, extracted_phones, extracted_urls, extracted_at,
                estimated_value_min, estimated_value_max, estimated_value_text,
                is_subcontract, opportunity_class, extracted_offices, extracted_attachment_urls,
                jurisdiction_level, jurisdiction_code,
                ...rest
            }) => rest);
            upsertErr = (await supabase.from("opportunities").upsert(slim, { onConflict: "notice_id" })).error;
        }
        if (upsertErr && /source/i.test(upsertErr.message)) {
            const slimmer = rows.map(({ source, ...rest }) => rest);
            upsertErr = (await supabase.from("opportunities").upsert(slimmer, { onConflict: "notice_id" })).error;
        }

        if (upsertErr) {
            console.warn("[tx_esbd] upsert failed:", upsertErr.message);
            errors += rows.length;
        } else {
            inserted += rows.length;
        }
    }

    return NextResponse.json({
        ok: true,
        found: ids.length,
        inserted,
        errors,
        skipped,
        elapsed_ms: Date.now() - startedAt,
        sample_ids: ids.slice(0, 5).map((l) => l.id),
    });
}
