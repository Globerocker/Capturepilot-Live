#!/usr/bin/env node
// Bulk enrich contractors with USASpending.gov past-award data.
//
// Mirrors /api/cron/enrich_contractors_usaspending but runs without the
// Vercel time limits so we can backfill the whole 80k-row table.
//
// Usage:
//   node tools/23_enrich_contractors_usaspending.mjs                 # run until done
//   node tools/23_enrich_contractors_usaspending.mjs --limit 5000    # stop after N rows
//   node tools/23_enrich_contractors_usaspending.mjs --concurrency 8 # parallel calls
//   node tools/23_enrich_contractors_usaspending.mjs --refresh       # ignore last_usaspending_refresh cache
//
// Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_KEY

import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;
if (!URL || !KEY) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_KEY");
    process.exit(1);
}

const db = createClient(URL, KEY, { auth: { persistSession: false } });

function arg(flag, fallback) {
    const i = process.argv.indexOf(flag);
    if (i === -1) return fallback;
    const v = process.argv[i + 1];
    if (!v || v.startsWith("--")) return true;
    return isNaN(+v) ? v : +v;
}

const LIMIT = arg("--limit", 100_000);
const CONCURRENCY = Math.max(1, Math.min(20, arg("--concurrency", 8)));
const FORCE_REFRESH = arg("--refresh", false);
const PAGE = 200;

const endDate = new Date().toISOString().split("T")[0];
const startDate = new Date(Date.now() - 5 * 365 * 86400_000).toISOString().split("T")[0];

async function enrichOne(row) {
    try {
        const res = await fetch("https://api.usaspending.gov/api/v2/search/spending_by_award/", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                filters: {
                    time_period: [{ start_date: startDate, end_date: endDate }],
                    award_type_codes: ["A", "B", "C", "D"],
                    recipient_search_text: [row.uei],
                },
                fields: ["Award Amount", "Awarding Agency", "Last Modified Date", "NAICS"],
                page: 1,
                limit: 100,
                sort: "Last Modified Date",
                order: "desc",
            }),
            signal: AbortSignal.timeout(20_000),
        });
        if (!res.ok) return { id: row.id, status: "http_error", http: res.status };
        const data = await res.json();
        const awards = data.results || [];

        if (awards.length === 0) {
            await db.from("contractors").update({
                federal_awards_count: 0,
                total_award_volume: 0,
                agency_relationships: [],
                naics_awards: [],
                last_usaspending_refresh: new Date().toISOString(),
            }).eq("id", row.id);
            return { id: row.id, status: "miss" };
        }

        const agencyMap = new Map();
        const naicsMap = new Map();
        let total = 0;
        let lastDate = null;
        for (const a of awards) {
            const amt = Number(a["Award Amount"] || 0);
            total += amt;
            const ag = a["Awarding Agency"] || "Unknown Agency";
            const prevA = agencyMap.get(ag) || { amount: 0, count: 0 };
            agencyMap.set(ag, { amount: prevA.amount + amt, count: prevA.count + 1 });
            const nc = a.NAICS?.code || "";
            if (nc) {
                const prevN = naicsMap.get(nc) || { description: a.NAICS?.description || "", amount: 0, count: 0 };
                naicsMap.set(nc, { description: prevN.description, amount: prevN.amount + amt, count: prevN.count + 1 });
            }
            const d = a["Last Modified Date"];
            if (d && (!lastDate || d > lastDate)) lastDate = d;
        }
        const topAgencies = [...agencyMap.entries()]
            .map(([name, v]) => ({ name, amount: v.amount, count: v.count }))
            .sort((a, b) => b.amount - a.amount).slice(0, 10);
        const topNaics = [...naicsMap.entries()]
            .map(([code, v]) => ({ code, description: v.description, amount: v.amount, count: v.count }))
            .sort((a, b) => b.amount - a.amount).slice(0, 10);

        await db.from("contractors").update({
            federal_awards_count: awards.length,
            total_award_volume: total,
            agency_relationships: topAgencies,
            naics_awards: topNaics,
            last_award_date: lastDate,
            last_usaspending_refresh: new Date().toISOString(),
        }).eq("id", row.id);
        return { id: row.id, status: "hit", awards: awards.length, total };
    } catch (e) {
        return { id: row.id, status: "error", error: e.message };
    }
}

async function processBatch(rows) {
    const results = [];
    // Run CONCURRENCY requests in parallel; each is independent of the others.
    for (let i = 0; i < rows.length; i += CONCURRENCY) {
        const slice = rows.slice(i, i + CONCURRENCY);
        const out = await Promise.all(slice.map(enrichOne));
        results.push(...out);
    }
    return results;
}

async function main() {
    console.log(`Bulk USASpending enrichment — concurrency=${CONCURRENCY}, limit=${LIMIT}, force_refresh=${!!FORCE_REFRESH}`);

    let processed = 0;
    let hits = 0;
    let misses = 0;
    let errors = 0;
    const started = Date.now();

    while (processed < LIMIT) {
        const take = Math.min(PAGE, LIMIT - processed);
        let q = db.from("contractors")
            .select("id, uei, company_name")
            .not("uei", "is", null)
            .order("last_usaspending_refresh", { ascending: true, nullsFirst: true })
            .limit(take);
        if (!FORCE_REFRESH) q = q.is("last_usaspending_refresh", null);

        const { data, error } = await q;
        if (error) { console.error("fetch failed:", error.message); break; }
        if (!data || data.length === 0) { console.log("no more contractors to process."); break; }

        const results = await processBatch(data);
        for (const r of results) {
            if (r.status === "hit") hits++;
            else if (r.status === "miss") misses++;
            else errors++;
        }
        processed += data.length;

        const elapsed = (Date.now() - started) / 1000;
        const rate = processed / elapsed;
        const eta = LIMIT - processed > 0 ? Math.round((LIMIT - processed) / rate / 60) : 0;
        console.log(`  [${processed.toString().padStart(6)}/${LIMIT}] hits=${hits} miss=${misses} err=${errors}  ~${rate.toFixed(1)}/s  ETA ${eta}min`);

        if (data.length < take) break; // we asked for `take` but got less → done
    }

    console.log(`\ndone. processed=${processed} hits=${hits} miss=${misses} err=${errors} in ${((Date.now() - started) / 60_000).toFixed(1)}min`);
}

main().catch(e => { console.error(e); process.exit(1); });
