/**
 * Generic RSS ingest for state/local procurement portals.
 *
 * Walks every row of `rss_sources` (migration 066), fetches the feed,
 * parses items, and upserts into `opportunities` with a source-prefixed
 * notice_id so we never collide with SAM / HigherGov / etc.
 *
 * Why a custom parser instead of a library: most procurement RSS feeds are
 * RSS 2.0 with very predictable structure (title, description, pubDate, link).
 * A 120-line regex parser is faster, smaller, and dependency-free vs adding
 * an XML-parsing library to the route bundle.
 *
 * The feed format varies slightly between providers (Bonfire embeds the
 * project close date inside the description; OpenGov uses dc:date instead
 * of pubDate). The parser handles both gracefully.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { extractContacts } from "@/lib/extract-contacts";
import { extractRichFields } from "@/lib/extract-rich-fields";

export const maxDuration = 300;

function getSupabase() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
    );
}

interface RssSource {
    id: string;
    feed_url: string;
    source_prefix: string;
    provider: string;
    agency_name: string | null;
    agency_type: string | null;
    state: string | null;
    city: string | null;
    website: string | null;
}

interface RssItem {
    title: string;
    description: string;
    pubDate: string | null;
    link: string;
    /** stable hash key from feed-supplied fields (link if present, else guid, else hash of title) */
    key: string;
}

// ── Parser ───────────────────────────────────────────────────────────────
//
// Pulls the inner text of <item>…</item> blocks. For each item, extracts:
//   - <title> (CDATA or plain)
//   - <description> (CDATA or plain)
//   - <pubDate> OR <dc:date>
//   - <link>
//   - <guid> (preferred dedup key when present)
//
// CDATA stripping is naive but covers >99% of real-world feeds.

function decodeXmlEntities(s: string): string {
    return s
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'")
        .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
        .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function stripCdata(s: string): string {
    return s.replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/m, "$1").trim();
}

function extractTag(block: string, tag: string): string | null {
    const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
    const m = block.match(re);
    if (!m || !m[1]) return null;
    return decodeXmlEntities(stripCdata(m[1])).trim();
}

function parseRssItems(xml: string): RssItem[] {
    const items: RssItem[] = [];
    const itemMatches = xml.match(/<item[^>]*>[\s\S]*?<\/item>/gi) || [];
    for (const block of itemMatches) {
        const title = extractTag(block, "title") || "";
        const description = extractTag(block, "description") || "";
        const pubDate = extractTag(block, "pubDate") || extractTag(block, "dc:date") || null;
        const link = extractTag(block, "link") || "";
        const guid = extractTag(block, "guid") || "";
        const key = guid || link || title;
        if (!title && !description) continue;
        items.push({ title, description, pubDate, link, key });
    }
    return items;
}

// Stable, short, URL-safe hash to derive notice_id suffix from feed-supplied key
function shortHash(s: string): string {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return Math.abs(h).toString(36);
}

// Some procurement RSS feeds embed the closing date as plain text in the
// description, e.g. "...Project closes May 27, 2026 3:00 PM EDT." — extract
// it so the opportunity has a real response_deadline.
function extractCloseDate(description: string): string | null {
    const m = description.match(/Project closes?\s+([^.]+?)(\.|$)/i);
    if (!m || !m[1]) return null;
    try {
        const d = new Date(m[1].trim());
        if (Number.isNaN(d.getTime())) return null;
        return d.toISOString();
    } catch { return null; }
}

function deriveStatus(deadlineIso: string | null): string {
    if (!deadlineIso) return "DISCOVERED";
    try {
        const dt = new Date(deadlineIso).getTime();
        const now = Date.now();
        if (dt < now) return "EXPIRED";
        if (dt < now + 7 * 86400000) return "EXPIRING_SOON";
        return "ACTIVE";
    } catch { return "DISCOVERED"; }
}

export async function GET(req: NextRequest) {
    const authHeader = req.headers.get("authorization");
    const serviceKey = process.env.SUPABASE_SERVICE_KEY;
    const expectedCron = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : null;
    const ok = (expectedCron && authHeader === expectedCron) ||
        (serviceKey && authHeader === `Bearer ${serviceKey}`);
    if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const supabase = getSupabase();
        const startTime = Date.now();
        const onlyProvider = req.nextUrl.searchParams.get("provider"); // optional filter
        const limitSources = parseInt(req.nextUrl.searchParams.get("limit") || "200", 10);

        // Pull active sources to poll
        let query = supabase.from("rss_sources").select("*").eq("enabled", true);
        if (onlyProvider) query = query.eq("provider", onlyProvider);
        const { data: sources, error: srcErr } = await query.limit(limitSources);
        if (srcErr) return NextResponse.json({ error: srcErr.message }, { status: 500 });
        if (!sources || sources.length === 0) {
            return NextResponse.json({ success: true, polled: 0, inserted: 0, note: "no enabled sources" });
        }

        const perSourceResults: Array<{ source: string; items: number; inserted: number; status: string }> = [];
        let grandInserted = 0;
        let grandItems = 0;

        for (const src of sources as RssSource[]) {
            if (Date.now() - startTime > 270_000) {
                console.log(`Time limit reached. Stopping at ${src.source_prefix}.`);
                break;
            }
            const t0 = Date.now();
            let items: RssItem[] = [];
            let lastStatus = "ok";

            try {
                const res = await fetch(src.feed_url, {
                    headers: { "User-Agent": "CapturePilot-RSS-Ingest/1.0", Accept: "application/rss+xml,application/xml,text/xml;q=0.9,*/*;q=0.5" },
                    signal: AbortSignal.timeout(20000),
                });
                if (!res.ok) {
                    lastStatus = `http_${res.status}`;
                    console.warn(`[rss] ${src.source_prefix} ${lastStatus}`);
                } else {
                    const xml = await res.text();
                    items = parseRssItems(xml);
                }
            } catch (err) {
                lastStatus = `fetch_error: ${(err as Error).message.slice(0, 80)}`;
                console.warn(`[rss] ${src.source_prefix} ${lastStatus}`);
            }

            // Map RSS items → opportunities rows
            const rows = items.map(item => {
                const deadlineIso = extractCloseDate(item.description);
                const postedIso = item.pubDate ? (() => {
                    try {
                        const d = new Date(item.pubDate as string);
                        return Number.isNaN(d.getTime()) ? null : d.toISOString();
                    } catch { return null; }
                })() : null;
                // Trim noise from Bonfire title pattern "Reference #: X. Name: Y" → keep both
                const cleanTitle = item.title.replace(/^Reference\s*#\s*:\s*/i, "").slice(0, 500);
                const cleanDesc = item.description.replace(/Project closes?\s+[^.]+\.?/i, "").trim();
                // RSS items rarely have structured contact fields — extract
                // POC email/phone/URL from the description text so the
                // detail page can render real Contact cards for SLED opps.
                const extracted = extractContacts(cleanDesc);
                const rich = extractRichFields(cleanDesc);
                return {
                    notice_id: `${src.source_prefix}-${shortHash(item.key)}`,
                    title: cleanTitle || null,
                    description: cleanDesc || null,
                    agency: src.agency_name || null,
                    sub_agency: null,
                    place_of_performance_state: src.state || null,
                    place_of_performance_city: src.city || null,
                    notice_type: "RSS Opportunity",
                    posted_date: postedIso,
                    response_deadline: deadlineIso,
                    link: item.link || src.website || null,
                    status: deriveStatus(deadlineIso),
                    is_archived: false,
                    last_crawled_at: new Date().toISOString(),
                    raw_json: { item, src: { provider: src.provider, source_prefix: src.source_prefix } } as Record<string, unknown>,
                    extracted_emails: extracted.emails.length ? extracted.emails : null,
                    extracted_phones: extracted.phones.length ? extracted.phones : null,
                    extracted_urls: extracted.urls.length ? extracted.urls : null,
                    extracted_at: new Date().toISOString(),
                    estimated_value_min: rich.estimated_value_min,
                    estimated_value_max: rich.estimated_value_max,
                    estimated_value_text: rich.estimated_value_text,
                    is_subcontract: rich.is_subcontract,
                    opportunity_class: rich.opportunity_class,
                    extracted_offices: rich.government_offices.length ? rich.government_offices : null,
                    extracted_attachment_urls: rich.attachment_urls.length ? rich.attachment_urls : null,
                };
            });

            let inserted = 0;
            if (rows.length > 0) {
                // Try with source + extracted_* fields first. Fall back
                // progressively when migrations 064 (source) or 076 (extracted_*)
                // haven't been applied yet so a half-deployed prod still ingests.
                const withSource = rows.map(r => ({ ...r, source: src.provider === "bonfire" ? "sled" : "sled" }));
                let upsertErr = (await supabase.from("opportunities").upsert(withSource, { onConflict: "notice_id" })).error;
                if (upsertErr && /(extracted_|estimated_|opportunity_class|is_subcontract)/i.test(upsertErr.message)) {
                    const slim = withSource.map(({
                        extracted_emails, extracted_phones, extracted_urls, extracted_at,
                        estimated_value_min, estimated_value_max, estimated_value_text,
                        is_subcontract, opportunity_class, extracted_offices,
                        extracted_attachment_urls,
                        ...rest
                    }) => rest);
                    upsertErr = (await supabase.from("opportunities").upsert(slim, { onConflict: "notice_id" })).error;
                }
                if (upsertErr && /source/i.test(upsertErr.message)) {
                    upsertErr = (await supabase.from("opportunities").upsert(rows, { onConflict: "notice_id" })).error;
                }
                if (upsertErr) {
                    lastStatus = `upsert_error: ${upsertErr.message.slice(0, 80)}`;
                    console.warn(`[rss] ${src.source_prefix} ${lastStatus}`);
                } else {
                    inserted = rows.length;
                }
            }

            // Update source metadata
            await supabase
                .from("rss_sources")
                .update({
                    last_fetched_at: new Date().toISOString(),
                    last_status: lastStatus,
                    last_count: items.length,
                    consecutive_failures: lastStatus === "ok" ? 0 : (await (async () => {
                        const { data } = await supabase.from("rss_sources").select("consecutive_failures").eq("id", src.id).maybeSingle();
                        return ((data?.consecutive_failures as number | undefined) || 0) + 1;
                    })()),
                })
                .eq("id", src.id);

            perSourceResults.push({
                source: src.source_prefix,
                items: items.length,
                inserted,
                status: lastStatus,
            });
            grandItems += items.length;
            grandInserted += inserted;

            // Light throttle so we're polite to upstream
            await new Promise(r => setTimeout(r, 150));
            void t0;
        }

        return NextResponse.json({
            success: true,
            polled: perSourceResults.length,
            total_items_seen: grandItems,
            total_inserted: grandInserted,
            elapsed_ms: Date.now() - startTime,
            per_source: perSourceResults.slice(0, 20),
        });
    } catch (error) {
        console.error("RSS ingest error:", error);
        return NextResponse.json({ error: (error as Error).message || "Ingest failed" }, { status: 500 });
    }
}
