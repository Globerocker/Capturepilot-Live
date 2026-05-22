/**
 * DoD daily contract releases (>$7.5M).
 *
 * Replaces ingest_dod_daily which used a war.gov RSS feed that now
 * 403s. The /News/Contracts/ pages render server-side; we scrape the
 * listing for the last N days, then each detail page for award + recipient
 * structured fields.
 *
 * Source: https://www.war.gov/News/Contracts/ (formerly defense.gov; now
 * war.gov per Trump-era rebrand). Pages are paginated ?Page=N.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { withCronTelemetry } from "@/lib/cron-telemetry";

export const maxDuration = 300;

function getDb() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );
}

const UA = "Mozilla/5.0 (compatible; CapturePilotResearch/1.0; +https://capturepilot.com)";

// Pulls anchor hrefs that point at /News/Contracts/Contract/Article/<id>/<slug>
function extractContractLinks(html: string): string[] {
    const matches = html.match(/href="(\/News\/Contracts\/Contract\/Article\/\d+\/[^"]+)"/g) || [];
    const links = matches.map(m => "https://www.war.gov" + m.replace(/^href="|"$/g, ""));
    return Array.from(new Set(links));
}

// Detail page: <h1> contains contract value heading; body has structured
// blocks split by company name in CAPS followed by award details.
function parseDetailPage(html: string): {
    publishedDate: string | null;
    blocks: Array<{
        recipient: string;
        amount: number | null;
        contractNumber: string;
        place: string | null;
        awardingOffice: string | null;
        description: string;
    }>;
} {
    const pub = html.match(/<time[^>]*datetime="([^"]+)"/);
    const publishedDate = pub?.[1]?.slice(0, 10) || null;

    // Pull article body
    const bodyMatch = html.match(/<div class="body[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    const body = bodyMatch?.[1] || html;
    // Convert to plain-text-ish for regex extraction
    const text = body
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/\s+/g, " ")
        .trim();

    // DoD writes each award like:
    //   "Lockheed Martin Corp., Bethesda, Maryland, has been awarded a $1,234,567,890 modification ... contract number FA8810-25-C-0001 ... place of performance Hill Air Force Base, Utah ... Air Force Life Cycle Management Center ..."
    // We split on " has been awarded " to chunk per award.
    const segments = text.split(/(?= [A-Z][^.]{0,80}? has been awarded )/);
    const blocks: ReturnType<typeof parseDetailPage>["blocks"] = [];
    for (const seg of segments) {
        const awardMatch = seg.match(/([A-Z][^,]{2,80}?),?\s*[A-Z][^,]{2,40},?\s*[A-Z][^,]{2,40}?,? has been awarded.*?\$([\d,]+)/);
        if (!awardMatch) continue;
        const contractMatch = seg.match(/contract\s+(?:number\s+)?([A-Z0-9-]{6,20})/i);
        const placeMatch = seg.match(/place of performance(?: is)?(?: in)?\s+([^.]{5,120}?)(?:[.,] |$)/i);
        const officeMatch = seg.match(/(\b(?:Air Force|Naval|Army|Marine|Defense|Space Force|Special Operations)[^.,]{5,90}?)(?:[.,]| is the contracting)/i);
        blocks.push({
            recipient: awardMatch[1]!.replace(/[,.]+$/, "").trim(),
            amount: parseInt(awardMatch[2]!.replace(/,/g, ""), 10) || null,
            contractNumber: (contractMatch?.[1] || "").trim(),
            place: placeMatch?.[1]?.trim() || null,
            awardingOffice: officeMatch?.[1]?.trim() || null,
            description: seg.slice(0, 600),
        });
    }
    return { publishedDate, blocks };
}

async function GET_handler(req: NextRequest): Promise<NextResponse> {
    const authHeader = req.headers.get("authorization");
    if (process.env.CRON_SECRET) {
        const expectedCron = `Bearer ${process.env.CRON_SECRET}`;
        const expectedSvc = process.env.SUPABASE_SERVICE_KEY ? `Bearer ${process.env.SUPABASE_SERVICE_KEY}` : null;
        if (authHeader !== expectedCron && authHeader !== expectedSvc) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
    }

    const t0 = Date.now();
    const db = getDb();
    const maxPages = Math.min(parseInt(req.nextUrl.searchParams.get("pages") || "3", 10), 10);
    const stats = { listings_seen: 0, details_fetched: 0, awards_parsed: 0, upserted: 0, errors: 0 };
    const listingLinks = new Set<string>();

    for (let page = 1; page <= maxPages; page++) {
        const url = `https://www.war.gov/News/Contracts/?Page=${page}`;
        try {
            const res = await fetch(url, {
                headers: { "User-Agent": UA, Accept: "text/html" },
                signal: AbortSignal.timeout(20000),
            });
            if (!res.ok) { stats.errors++; break; }
            const html = await res.text();
            const links = extractContractLinks(html);
            stats.listings_seen += links.length;
            for (const l of links) listingLinks.add(l);
        } catch (e) {
            stats.errors++;
            console.warn("DoD listing fetch error:", (e as Error).message);
        }
    }

    // Visit each detail page (concurrent w/ small pool)
    const linkArr = Array.from(listingLinks).slice(0, 50);
    const detailResults: ReturnType<typeof parseDetailPage>[] = [];
    const POOL = 4;
    for (let i = 0; i < linkArr.length && Date.now() - t0 < 250_000; i += POOL) {
        const batch = linkArr.slice(i, i + POOL);
        const fetched = await Promise.all(batch.map(async (link) => {
            try {
                const res = await fetch(link, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15000) });
                if (!res.ok) return null;
                const html = await res.text();
                stats.details_fetched++;
                const parsed = parseDetailPage(html);
                return { link, ...parsed };
            } catch { return null; }
        }));
        for (const r of fetched) if (r) detailResults.push(r);
    }

    // Flatten + upsert
    const rows: Array<Record<string, unknown>> = [];
    for (const dr of detailResults) {
        for (const b of dr.blocks) {
            if (!b.contractNumber) continue;
            rows.push({
                contract_number: b.contractNumber,
                recipient_name: b.recipient,
                recipient_uei: null,
                recipient_state: null,
                awarding_office: b.awardingOffice,
                award_amount: b.amount,
                award_date: dr.publishedDate,
                period_of_performance: null,
                description: b.description.slice(0, 1000),
                naics_code: null,
                psc_code: null,
                place_of_performance: b.place,
                set_aside: null,
                source_url: null,
                raw_blob: b.description.slice(0, 2000),
                last_synced: new Date().toISOString(),
            });
        }
    }
    stats.awards_parsed = rows.length;

    if (rows.length > 0) {
        const { error } = await db
            .from("dod_contracts")
            .upsert(rows, { onConflict: "contract_number,award_date", ignoreDuplicates: false });
        if (error) {
            stats.errors++;
            console.warn("DoD upsert error:", error.message);
        } else {
            stats.upserted = rows.length;
        }
    }

    return NextResponse.json({ success: true, ...stats, elapsed_ms: Date.now() - t0 });
}

export const GET = withCronTelemetry("/api/cron/ingest_dod_contracts", GET_handler);
