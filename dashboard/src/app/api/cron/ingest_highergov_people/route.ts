/**
 * Ingest government decision-makers (contracting officers, buyers, SBLOs,
 * program managers) from HigherGov /api-external/people/.
 *
 * Returns rows shaped:
 *   { contact_name, contact_email, contact_phone, contact_title,
 *     contact_type ('federal'/'sled'), agency: {agency_name, agency_type, ...},
 *     last_seen, path }
 *
 * Maps onto our government_contacts table (migration 065). Apollo
 * enrichment is a SEPARATE cron — this route only pulls + dedupes the
 * baseline directory.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 300;

const HIGHERGOV_BASE = "https://www.highergov.com/api-external/people/";

function getSupabase() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
    );
}

interface HigherGovPerson {
    contact_name?: string;
    contact_first_name?: string;
    contact_last_name?: string;
    contact_email?: string;
    contact_phone?: string;
    contact_ext?: string;
    contact_fax?: string;
    contact_title?: string;
    contact_type?: string;
    agency?: {
        agency_name?: string;
        agency_abbreviation?: string;
        agency_key?: number;
        agency_type?: string;
    };
    last_seen?: string;
    path?: string;
}

interface HigherGovPeopleResponse {
    results?: HigherGovPerson[];
    meta?: { pagination?: { page?: number; pages?: number; count?: number } };
    links?: { next?: string | null };
}

function extractDomain(email: string | null | undefined): string | null {
    if (!email) return null;
    const at = email.lastIndexOf("@");
    if (at < 0) return null;
    return email.slice(at + 1).toLowerCase().trim() || null;
}

export async function GET(req: NextRequest) {
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
        }, { status: 500 });
    }

    try {
        const supabase = getSupabase();
        const startTime = Date.now();
        console.log("Starting HigherGov people ingestion...");

        // last_seen filter — HigherGov treats this as "active on or after". 14-day
        // window catches stable contacts even when their last_seen lag is high.
        const windowDays = parseInt(req.nextUrl.searchParams.get("days") || "14", 10);
        const since = new Date();
        since.setDate(since.getDate() - windowDays);
        const lastSeenDate = since.toISOString().split("T")[0]!;
        const pageSize = Math.min(100, parseInt(req.nextUrl.searchParams.get("page_size") || "100", 10));
        const contactTypeFilter = req.nextUrl.searchParams.get("contact_type") || ""; // 'federal' | 'sled' | '' (both)

        let pageNumber = 1;
        let totalProcessed = 0;
        let totalUpserted = 0;
        let totalPages = 0;
        let errorCount = 0;

        while (true) {
            if (Date.now() - startTime > 270_000) {
                console.log(`Time limit approaching at page ${pageNumber}. Stopping.`);
                break;
            }

            const params = new URLSearchParams({
                api_key: apiKey,
                last_seen: lastSeenDate,
                page_number: String(pageNumber),
                page_size: String(pageSize),
            });
            if (contactTypeFilter) params.set("contact_type", contactTypeFilter);
            const url = `${HIGHERGOV_BASE}?${params.toString()}`;

            const res = await fetch(url, {
                headers: { Accept: "application/json" },
                signal: AbortSignal.timeout(25000),
            });
            if (!res.ok) {
                const body = await res.text().catch(() => "<unreadable>");
                console.error(`HigherGov people error: ${res.status} page=${pageNumber} body=${body.slice(0, 200)}`);
                errorCount++;
                if (res.status === 401 || res.status === 403) break;
                if (errorCount >= 3) break;
                pageNumber++;
                continue;
            }
            const data = (await res.json()) as HigherGovPeopleResponse;
            const people = data.results || [];
            totalPages = data.meta?.pagination?.pages || totalPages;
            if (people.length === 0) break;

            // Build upsert rows. Every HigherGov person has a stable `path`,
            // so we dedup on that exclusively. (The legacy email-keyed branch
            // was silently failing because the unique index is on
            // `lower(email)` — an expression index that PostgREST's
            // `onConflict: "email"` can't address.)
            const rows: Record<string, unknown>[] = [];
            const seenPaths = new Set<string>();
            for (const p of people) {
                const name = p.contact_name?.trim()
                    || [p.contact_first_name, p.contact_last_name].filter(Boolean).join(" ").trim()
                    || "Unknown";
                const email = (p.contact_email || "").trim().toLowerCase() || null;
                const agency = p.agency || {};
                const path = p.path?.trim() || null;
                if (!path || seenPaths.has(path)) continue;
                seenPaths.add(path);
                rows.push({
                    name,
                    first_name: p.contact_first_name?.trim() || null,
                    last_name: p.contact_last_name?.trim() || null,
                    title: p.contact_title?.trim() || null,
                    email,
                    phone: p.contact_phone?.trim() || null,
                    phone_ext: p.contact_ext?.trim() || null,
                    fax: p.contact_fax?.trim() || null,
                    agency_name: agency.agency_name?.trim() || null,
                    agency_abbreviation: agency.agency_abbreviation?.trim() || null,
                    agency_key: agency.agency_key ?? null,
                    agency_type: agency.agency_type?.trim() || null,
                    agency_domain: extractDomain(email),
                    source: "highergov",
                    contact_type: p.contact_type?.trim() || null,
                    highergov_path: path,
                    last_seen_at: p.last_seen || null,
                });
            }

            totalProcessed += rows.length;

            if (rows.length > 0) {
                const { error } = await supabase
                    .from("government_contacts")
                    .upsert(rows, { onConflict: "highergov_path", ignoreDuplicates: false });
                if (error) {
                    console.error("Upsert error:", error.message);
                    errorCount++;
                } else {
                    totalUpserted += rows.length;
                }
            }
            if (errorCount >= 3) break;

            if (data.links?.next) {
                pageNumber++;
            } else {
                break;
            }
            if (totalPages > 0 && pageNumber > totalPages) break;
            if (pageNumber > 500) break; // hard cap
        }

        console.log(`HigherGov people done: processed=${totalProcessed} upserted=${totalUpserted} pages=${totalPages}`);
        return NextResponse.json({
            success: true,
            source: "highergov_people",
            window_days: windowDays,
            last_seen_since: lastSeenDate,
            total_pages_available: totalPages,
            processed: totalProcessed,
            upserted: totalUpserted,
            elapsed_ms: Date.now() - startTime,
        });
    } catch (error) {
        console.error("HigherGov people ingest error:", error);
        return NextResponse.json({
            error: (error as Error).message || "Ingest failed",
        }, { status: 500 });
    }
}
