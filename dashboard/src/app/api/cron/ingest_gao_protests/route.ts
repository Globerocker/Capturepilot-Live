import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 120;

/**
 * GAO Bid Protest ingestion — daily at 10:30 UTC.
 *
 * GAO publishes bid protest decisions at https://www.gao.gov/legal/bid-protests
 * Daily updates are exposed as RSS at https://www.gao.gov/rss/bidprotestdecisions.xml
 *
 * We parse the feed, extract the docket number (B-\d+), protester name, agency,
 * decision date, and outcome (from the decision title prefix — e.g. "Denied",
 * "Dismissed", "Sustained"). Upsert by docket_number.
 */
const RSS_URL = "https://www.gao.gov/rss/bidprotestdecisions.xml";

function getDb() {
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
}

type Outcome = "sustained" | "denied" | "dismissed" | "withdrawn" | "pending" | "other";

function extractTag(xml: string, tag: string): string | null {
    const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
    const m = xml.match(re);
    return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim() : null;
}

function detectOutcome(title: string): Outcome {
    const t = title.toLowerCase();
    if (t.includes("sustain")) return "sustained";
    if (t.includes("denied")) return "denied";
    if (t.includes("dismiss")) return "dismissed";
    if (t.includes("withdraw")) return "withdrawn";
    return "other";
}

export async function GET(req: NextRequest) {
    const authHeader = req.headers.get("authorization");
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = getDb();

    try {
        const res = await fetch(RSS_URL, {
            headers: { "User-Agent": "CapturePilot/1.0 (+https://capturepilot.com)" },
        });
        if (!res.ok) {
            return NextResponse.json({ error: `GAO RSS returned ${res.status}` }, { status: 502 });
        }
        const xml = await res.text();

        // Split on <item> boundaries
        const items = xml
            .split(/<item[\s>]/i)
            .slice(1)
            .map((chunk) => "<item " + chunk.split(/<\/item>/i)[0] + "</item>");

        let upserted = 0;
        const parsed: Array<{
            docket_number: string;
            protester: string | null;
            agency: string | null;
            decision_date: string | null;
            outcome: Outcome;
            decision_url: string | null;
            summary: string | null;
        }> = [];

        for (const item of items) {
            const title = extractTag(item, "title") || "";
            const link = extractTag(item, "link");
            const pubDate = extractTag(item, "pubDate");
            const desc = extractTag(item, "description");

            // Docket: B-422123, B-422123.2, B-422123.3
            const docketMatch = title.match(/\b(B-\d{5,}(?:\.\d+)?)\b/);
            if (!docketMatch) continue;
            const docket = docketMatch[1];

            // Protester: before the first comma, after the docket + colon
            let protester: string | null = null;
            const afterDocket = title.slice(title.indexOf(docket) + docket.length).replace(/^[:,\s]+/, "");
            if (afterDocket) {
                const firstComma = afterDocket.indexOf(",");
                protester = firstComma > 0 ? afterDocket.slice(0, firstComma).trim() : afterDocket.split(/\s+/).slice(0, 5).join(" ");
            }

            const decisionDate = pubDate ? new Date(pubDate).toISOString().slice(0, 10) : null;

            parsed.push({
                docket_number: docket,
                protester,
                agency: null, // often not in RSS; populated by decision-page scraper later
                decision_date: decisionDate,
                outcome: detectOutcome(title),
                decision_url: link,
                summary: desc ? desc.replace(/<[^>]+>/g, "").slice(0, 1000) : null,
            });
        }

        for (const p of parsed) {
            const { error } = await db
                .from("bid_protests")
                .upsert(p, { onConflict: "docket_number" });
            if (!error) upserted++;
        }

        return NextResponse.json({
            success: true,
            items_parsed: parsed.length,
            rows_upserted: upserted,
        });
    } catch (e) {
        const msg = e instanceof Error ? e.message : "ingest_gao_protests failed";
        return NextResponse.json({ success: false, error: msg }, { status: 500 });
    }
}
