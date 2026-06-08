/**
 * Ingest State / Local / Education (SLED) opportunities from HigherGov.
 *
 * HigherGov indexes 60,000+ state, local, education and public-utility
 * procurement portals across all 50 states + DC + territories. Their
 * api-external/opportunity endpoint accepts source_type=sled and returns
 * fully-normalized rows that drop straight into our opportunities table.
 *
 * Auth: HIGHERGOV_API_KEY env var passed as ?api_key query param.
 * Pagination: walk meta.pagination until we've consumed every page OR we
 * hit the function's 300s ceiling.
 * Idempotency: upsert on notice_id, prefixed with `hg-sled-` so the row is
 * trivially distinguishable from SAM.gov entries (which use SAM's noticeId).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { withCronTelemetry } from "@/lib/cron-telemetry";

export const maxDuration = 300;

const HIGHERGOV_BASE = "https://www.highergov.com/api-external/opportunity/";

function getSupabase() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
    );
}

interface HigherGovOpp {
    opp_key?: string;
    title?: string;
    description_text?: string;
    agency?: {
        agency_name?: string;
        agency_type?: string;
        agency_abbreviation?: string;
        agency_key?: number;
    };
    naics_code?: { naics_code?: string } | string | null;
    psc_code?: { psc_code?: string } | string | null;
    product_service?: string;
    set_aside?: string;
    pop_state?: string;
    pop_city?: string;
    pop_zip?: string;
    val_est_low?: number;
    val_est_high?: number;
    due_date?: string;
    posted_date?: string;
    captured_date?: string;
    source_type?: string;
    source_id?: string;
    source_path?: string;
    path?: string;
    opp_type?: string;
    opp_cat?: string;
}

interface HigherGovResponse {
    results?: HigherGovOpp[];
    meta?: {
        pagination?: {
            page?: number;
            pages?: number;
            count?: number;
        };
    };
    links?: {
        next?: string | null;
    };
}

function extractNaics(v: HigherGovOpp["naics_code"]): string | null {
    if (!v) return null;
    if (typeof v === "string") return v;
    return v.naics_code || null;
}
function extractPsc(v: HigherGovOpp["psc_code"]): string | null {
    if (!v) return null;
    if (typeof v === "string") return v;
    return v.psc_code || null;
}

async function GET_handler(req: NextRequest) {
    const authHeader = req.headers.get("authorization");
    const serviceKey = process.env.SUPABASE_SERVICE_KEY;
    const expectedCron = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : null;
    const ok = (expectedCron && authHeader === expectedCron) ||
        (serviceKey && authHeader === `Bearer ${serviceKey}`);
    if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const apiKey = process.env.HIGHERGOV_API_KEY;
    if (!apiKey) {
        return NextResponse.json({
            error: "HIGHERGOV_API_KEY env var not configured",
            hint: "Set HIGHERGOV_API_KEY on Vercel and redeploy.",
        }, { status: 500 });
    }

    try {
        const supabase = getSupabase();
        const startTime = Date.now();
        console.log("Starting HigherGov SLED ingestion...");

        // captured_date filter — HigherGov treats this as "captured on or
        // after this date". 7-day window catches backfills + late additions.
        const windowDays = parseInt(req.nextUrl.searchParams.get("days") || "7", 10);
        const since = new Date();
        since.setDate(since.getDate() - windowDays);
        const capturedDate = since.toISOString().split("T")[0]!;
        const pageSize = Math.min(100, parseInt(req.nextUrl.searchParams.get("page_size") || "100", 10));

        // Pre-load valid NAICS / PSC whitelists so we filter junk on insert.
        const [naicsRes, pscRes] = await Promise.all([
            supabase.from("naics_codes").select("code"),
            supabase.from("psc_codes").select("code"),
        ]);
        const validNaics = new Set((naicsRes.data || []).map((r: { code: string }) => r.code));
        const validPsc = new Set((pscRes.data || []).map((r: { code: string }) => r.code));

        let pageNumber = 1;
        let totalProcessed = 0;
        let totalInserted = 0;
        let totalPages = 0;
        let errorCount = 0;

        while (true) {
            // Stop if we're approaching the function timeout.
            if (Date.now() - startTime > 270_000) {
                console.log(`Time limit approaching at page ${pageNumber}. Stopping.`);
                break;
            }

            const url = `${HIGHERGOV_BASE}?api_key=${encodeURIComponent(apiKey)}&source_type=sled&captured_date=${capturedDate}&page_number=${pageNumber}&page_size=${pageSize}`;
            const res = await fetch(url, {
                headers: { "Accept": "application/json" },
                signal: AbortSignal.timeout(25000),
            });
            if (!res.ok) {
                const body = await res.text().catch(() => "<unreadable>");
                console.error(`HigherGov error: ${res.status} ${res.statusText} page=${pageNumber} body=${body.slice(0, 200)}`);
                errorCount++;
                if (res.status === 401 || res.status === 403) break;
                if (errorCount >= 3) break;
                pageNumber++;
                continue;
            }
            const data = (await res.json()) as HigherGovResponse;
            const opps = data.results || [];
            totalPages = data.meta?.pagination?.pages || totalPages;

            if (opps.length === 0) break;

            const rows = opps
                .filter(o => o.opp_key)
                .map(o => {
                    const naics = extractNaics(o.naics_code);
                    const psc = extractPsc(o.psc_code);
                    const agency = o.agency || {};

                    // val_est is a range; pick the midpoint when both are present, else low or high.
                    let estValue: number | null = null;
                    if (o.val_est_low != null && o.val_est_high != null) {
                        estValue = (Number(o.val_est_low) + Number(o.val_est_high)) / 2;
                    } else if (o.val_est_low != null) {
                        estValue = Number(o.val_est_low);
                    } else if (o.val_est_high != null) {
                        estValue = Number(o.val_est_high);
                    }

                    // Status mapping — HigherGov doesn't give a precomputed
                    // status, but we can derive from due_date (deadline-aware).
                    let status = "DISCOVERED";
                    if (o.due_date) {
                        try {
                            const d = new Date(o.due_date);
                            const now = new Date();
                            if (d < now) status = "EXPIRED";
                            else if (d < new Date(now.getTime() + 7 * 86400000)) status = "EXPIRING_SOON";
                            else status = "ACTIVE";
                        } catch { /* keep DISCOVERED */ }
                    }

                    // notice_id namespaced so we can never collide with SAM.
                    const noticeId = `hg-sled-${o.opp_key}`;

                    return {
                        notice_id: noticeId,
                        title: o.title || null,
                        description: o.description_text || null,
                        agency: agency.agency_name || null,
                        sub_agency: agency.agency_abbreviation || null,
                        office: null,
                        organization_code: agency.agency_key ? String(agency.agency_key) : null,
                        naics_code: naics && validNaics.has(naics) ? naics : null,
                        psc_code: psc && validPsc.has(psc) ? psc : null,
                        set_aside_code: o.set_aside || null,
                        notice_type: o.opp_type || "SLED Opportunity",
                        posted_date: o.posted_date ? new Date(o.posted_date).toISOString() : null,
                        response_deadline: o.due_date ? new Date(o.due_date).toISOString() : null,
                        place_of_performance_state: o.pop_state || null,
                        place_of_performance_city: o.pop_city || null,
                        place_of_performance_zip: o.pop_zip || null,
                        solicitation_number: o.source_id || null,
                        award_amount: estValue,
                        estimated_value: estValue,
                        link: o.source_path || (o.path ? `https://www.highergov.com${o.path}` : null),
                        status,
                        is_archived: false,
                        last_crawled_at: new Date().toISOString(),
                        raw_json: o as unknown as Record<string, unknown>,
                    };
                });

            totalProcessed += rows.length;

            if (rows.length > 0) {
                // First attempt: include `source` column.
                // Fall back to without it if the migration hasn't been
                // applied yet.
                const rowsWithSource = rows.map(r => ({ ...r, source: "sled" }));
                let { error: upsertErr } = await supabase
                    .from("opportunities")
                    .upsert(rowsWithSource, { onConflict: "notice_id" });
                if (upsertErr && /source/i.test(upsertErr.message)) {
                    console.warn("'source' column missing — retry without it. Apply migration 064 to enable filtering by source.");
                    const result = await supabase
                        .from("opportunities")
                        .upsert(rows, { onConflict: "notice_id" });
                    upsertErr = result.error;
                }
                if (upsertErr) {
                    console.error("Upsert error:", upsertErr.message);
                    errorCount++;
                    if (errorCount >= 3) break;
                } else {
                    totalInserted += rows.length;
                }
            }

            if (data.links?.next) {
                pageNumber++;
            } else {
                break;
            }
            if (totalPages > 0 && pageNumber > totalPages) break;
            // Hard cap on pages so a runaway upstream doesn't burn the entire budget.
            if (pageNumber > 200) break;
        }

        console.log(`HigherGov SLED ingest done: processed=${totalProcessed} inserted=${totalInserted} totalPages=${totalPages}`);
        return NextResponse.json({
            success: true,
            source: "highergov_sled",
            window_days: windowDays,
            captured_since: capturedDate,
            total_pages_available: totalPages,
            processed: totalProcessed,
            inserted: totalInserted,
            elapsed_ms: Date.now() - startTime,
        });
    } catch (error) {
        console.error("HigherGov ingest error:", error);
        return NextResponse.json({
            error: (error as Error).message || "Ingest failed",
        }, { status: 500 });
    }
}

export const GET = withCronTelemetry("/api/cron/ingest_highergov_sled", GET_handler);
