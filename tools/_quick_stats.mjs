#!/usr/bin/env node
// One-shot pipeline diagnostic.
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = fs.readFileSync("/Users/andreschuler/Caturepilot 2.0/.env.local", "utf8");
for (const line of env.split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

const oneDay = 86400_000;
const now = Date.now();

async function head(table, filters = {}) {
    let q = sb.from(table).select("id", { count: "exact", head: true });
    for (const [k, [op, v]] of Object.entries(filters)) {
        if (op === "not.is")    q = q.not(k, "is", v);
        else if (op === "gte")  q = q.gte(k, v);
        else if (op === "gt")   q = q.gt(k, v);
        else if (op === "lt")   q = q.lt(k, v);
        else if (op === "lte")  q = q.lte(k, v);
        else                    q = q[op](k, v);
    }
    const { count, error } = await q;
    if (error) return `ERR ${error.message}`;
    return count;
}
async function maxDate(table, col) {
    const { data, error } = await sb.from(table).select(col).order(col, { ascending: false, nullsFirst: false }).limit(1);
    if (error) return `ERR ${error.message}`;
    return data?.[0]?.[col] || "—";
}

console.log("=== OPPORTUNITIES ===");
console.log(" total                       :", await head("opportunities"));
console.log(" created in last 24h         :", await head("opportunities", { created_at: ["gte", new Date(now - 1*oneDay).toISOString()] }));
console.log(" created in last 7d          :", await head("opportunities", { created_at: ["gte", new Date(now - 7*oneDay).toISOString()] }));
console.log(" active (deadline > now)     :", await head("opportunities", { response_deadline: ["gt", new Date().toISOString()] }));
console.log(" latest posted_date          :", await maxDate("opportunities", "posted_date"));
console.log(" latest created_at           :", await maxDate("opportunities", "created_at"));

console.log("\n=== CONTRACTORS ===");
console.log(" total                       :", await head("contractors"));
console.log(" with last_award_date        :", await head("contractors", { last_award_date: ["not.is", "null"] }));
console.log(" with federal_awards_count>0 :", await head("contractors", { federal_awards_count: ["gt", 0] }));
console.log(" with primary_poc_email      :", await head("contractors", { primary_poc_email: ["not.is", "null"] }));
console.log(" ever enriched               :", await head("contractors", { last_enriched_at: ["not.is", "null"] }));
console.log(" enriched in last 24h        :", await head("contractors", { last_enriched_at: ["gte", new Date(now - 1*oneDay).toISOString()] }));
console.log(" enriched in last 7d         :", await head("contractors", { last_enriched_at: ["gte", new Date(now - 7*oneDay).toISOString()] }));
console.log(" usaspending refreshed 7d    :", await head("contractors", { last_usaspending_refresh: ["gte", new Date(now - 7*oneDay).toISOString()] }));
console.log(" created in last 24h         :", await head("contractors", { created_at: ["gte", new Date(now - 1*oneDay).toISOString()] }));
console.log(" created in last 7d          :", await head("contractors", { created_at: ["gte", new Date(now - 7*oneDay).toISOString()] }));
console.log(" latest created_at           :", await maxDate("contractors", "created_at"));
console.log(" latest last_enriched_at     :", await maxDate("contractors", "last_enriched_at"));

console.log("\n=== LAPSED-AWARD AUDIENCE (12mo silent) ===");
const cutoff = new Date(now - 12 * 30 * oneDay).toISOString();
console.log(" total                       :", await head("contractors", { federal_awards_count: ["gt", 0], last_award_date: ["lt", cutoff] }));
console.log(" with email                  :", await head("contractors", { federal_awards_count: ["gt", 0], last_award_date: ["lt", cutoff], primary_poc_email: ["not.is", "null"] }));
console.log(" with website                :", await head("contractors", { federal_awards_count: ["gt", 0], last_award_date: ["lt", cutoff], website: ["not.is", "null"] }));
