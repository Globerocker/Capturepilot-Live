import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import * as cheerio from "cheerio";

export const maxDuration = 120;

/**
 * war.gov Daily Contract Announcements scraper — daily at 22:00 UTC
 * (after the 5pm ET DoD posts go live).
 *
 * Source: https://www.war.gov/News/Contracts/
 *   Each day's announcement is a single HTML page with a list of awards.
 *   Contract blocks follow the pattern:
 *     "<CONTRACTOR>, <CITY>, <STATE>, is being awarded a $<AMOUNT> <TYPE>
 *      contract for <SOW>. <TERMS>. <CONTRACT_NUMBER>"
 *
 * We scrape the listing page + today's items, then parse each block with
 * regex. Idempotent: contract_number is unique, so duplicate inserts are ignored.
 */
const LISTING = "https://www.war.gov/News/Contracts/";

function getDb() {
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
}

interface ParsedAward {
    contractor_name: string;
    amount_usd: number | null;
    location: string | null;
    sow_summary: string;
    contract_number: string | null;
    raw_text: string;
}

const AMOUNT_RE = /\$([\d,]+(?:\.\d+)?)\s*(million|billion|thousand)?/i;
const CONTRACT_RE = /\b([A-Z0-9]{4}-[A-Z0-9-]{2,}|[A-Z]\d{8,})\b/;

function parseAmount(text: string): number | null {
    const m = text.match(AMOUNT_RE);
    if (!m) return null;
    const base = Number(m[1].replace(/,/g, ""));
    if (!isFinite(base)) return null;
    const unit = (m[2] || "").toLowerCase();
    if (unit === "billion") return base * 1_000_000_000;
    if (unit === "million") return base * 1_000_000;
    if (unit === "thousand") return base * 1_000;
    return base;
}

function parseAwardBlock(text: string): ParsedAward | null {
    const trimmed = text.trim();
    if (trimmed.length < 50) return null;
    // First comma-separated token is usually the contractor.
    const firstComma = trimmed.indexOf(",");
    if (firstComma < 3) return null;
    const contractor = trimmed.slice(0, firstComma).trim();
    if (!contractor || contractor.length > 150) return null;

    const amount = parseAmount(trimmed);
    if (!amount) return null; // Must have a dollar amount to be a contract announcement.

    const contractMatch = trimmed.match(CONTRACT_RE);
    const contractNum = contractMatch ? contractMatch[1] : null;

    // Location = city + state (or country), usually right after contractor.
    const locPart = trimmed.slice(firstComma + 1).split(",").slice(0, 2).join(",").trim();
    const location = locPart.length < 80 ? locPart : null;

    return {
        contractor_name: contractor,
        amount_usd: amount,
        location,
        sow_summary: trimmed.slice(0, 400),
        contract_number: contractNum,
        raw_text: trimmed.slice(0, 2000),
    };
}

export async function GET(req: NextRequest) {
    const authHeader = req.headers.get("authorization");
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = getDb();

    try {
        const listingRes = await fetch(LISTING, {
            headers: { "User-Agent": "CapturePilot/1.0 (+https://capturepilot.com)" },
        });
        if (!listingRes.ok) {
            return NextResponse.json({ error: `war.gov returned ${listingRes.status}` }, { status: 502 });
        }
        const listingHtml = await listingRes.text();
        const $list = cheerio.load(listingHtml);

        // Find links to today's / most-recent announcement pages.
        const pageLinks: string[] = [];
        $list('a[href*="/News/Contracts/"]').each((_i, el) => {
            const href = $list(el).attr("href") || "";
            if (/\/News\/Contracts\/Contract\//.test(href)) {
                const abs = href.startsWith("http") ? href : `https://www.war.gov${href}`;
                if (!pageLinks.includes(abs)) pageLinks.push(abs);
            }
        });

        const recentLinks = pageLinks.slice(0, 3); // today + fallback for weekends
        const today = new Date().toISOString().slice(0, 10);
        const awards: Array<ParsedAward & { announcement_date: string; source_url: string; agency: string | null }> = [];

        for (const link of recentLinks) {
            const res = await fetch(link, {
                headers: { "User-Agent": "CapturePilot/1.0 (+https://capturepilot.com)" },
            });
            if (!res.ok) continue;
            const html = await res.text();
            const $ = cheerio.load(html);

            // Agency sections are H2/H3 like "ARMY", "NAVY", "AIR FORCE", "DEFENSE LOGISTICS AGENCY"
            let currentAgency: string | null = null;
            $("h2, h3, p").each((_i, el) => {
                const tag = el.type === "tag" ? el.name : "";
                const text = $(el).text().trim();
                if (!text) return;
                if (tag === "h2" || tag === "h3") {
                    if (text.length < 80 && /^[A-Z][A-Z \-&]+$/.test(text)) {
                        currentAgency = text.replace(/\s+/g, " ");
                    }
                    return;
                }
                // Paragraph → attempt to parse as an award block.
                const parsed = parseAwardBlock(text);
                if (parsed) {
                    awards.push({
                        ...parsed,
                        announcement_date: today,
                        source_url: link,
                        agency: currentAgency,
                    });
                }
            });
        }

        // Dedup on contract_number when present
        const seen = new Set<string>();
        const deduped = awards.filter((a) => {
            const key = a.contract_number || `${a.contractor_name}|${a.amount_usd}|${a.announcement_date}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        let inserted = 0;
        for (const a of deduped) {
            const { error } = await db.from("daily_dod_awards").insert({
                announcement_date: a.announcement_date,
                contractor_name: a.contractor_name,
                amount_usd: a.amount_usd,
                location: a.location,
                agency: a.agency,
                contract_number: a.contract_number,
                sow_summary: a.sow_summary,
                source_url: a.source_url,
                raw_text: a.raw_text,
            });
            if (!error) inserted++;
        }

        return NextResponse.json({
            success: true,
            pages_read: recentLinks.length,
            awards_parsed: deduped.length,
            awards_inserted: inserted,
        });
    } catch (e) {
        const msg = e instanceof Error ? e.message : "ingest_dod_daily failed";
        return NextResponse.json({ success: false, error: msg }, { status: 500 });
    }
}
