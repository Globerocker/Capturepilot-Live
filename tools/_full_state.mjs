#!/usr/bin/env node
// Comprehensive DB state snapshot: opportunities, contractors, contacts,
// subaward graph, RSS sources, enrichment coverage.
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

async function count(table, filters = {}) {
    let q = sb.from(table).select("*", { count: "exact", head: true });
    for (const [k, [op, v]] of Object.entries(filters)) {
        if (op === "not.is")    q = q.not(k, "is", v);
        else if (op === "gte")  q = q.gte(k, v);
        else if (op === "gt")   q = q.gt(k, v);
        else if (op === "lt")   q = q.lt(k, v);
        else                    q = q[op](k, v);
    }
    const { count, error } = await q;
    if (error) return `ERR ${error.message.slice(0, 70)}`;
    return count;
}

(async () => {
    console.log("=== OPPORTUNITIES ===");
    console.log(" total                          :", await count("opportunities"));
    console.log(" last 7d (created_at)           :", await count("opportunities", { created_at: ["gte", new Date(now - 7*oneDay).toISOString()] }));
    console.log(" last 1d                        :", await count("opportunities", { created_at: ["gte", new Date(now - 1*oneDay).toISOString()] }));
    console.log(" active (deadline > now)        :", await count("opportunities", { response_deadline: ["gt", new Date().toISOString()] }));
    console.log(" source=sled (highergov)        :", await count("opportunities", { source: ["eq", "sled"] }));
    console.log(" source=grant                   :", await count("opportunities", { source: ["eq", "grant"] }));
    console.log(" source=null (sam legacy)       :", await count("opportunities", { source: ["is", null] }));
    console.log(" w/ strategic_scoring           :", await count("opportunities", { strategic_scoring: ["not.is", null] }));
    console.log(" w/ ai_win_strategy             :", await count("opportunities", { ai_win_strategy: ["not.is", null] }));
    console.log(" w/ structured_requirements     :", await count("opportunities", { structured_requirements: ["not.is", null] }));
    console.log(" w/ deep_enrich done            :", await count("opportunities", { deep_enrich_status: ["eq", "completed"] }));

    console.log("\n=== CONTRACTORS ===");
    console.log(" total                          :", await count("contractors"));
    console.log(" with last_award_date           :", await count("contractors", { last_award_date: ["not.is", null] }));
    console.log(" with federal_awards_count>0    :", await count("contractors", { federal_awards_count: ["gt", 0] }));
    console.log(" with primary_poc_email         :", await count("contractors", { primary_poc_email: ["not.is", null] }));
    console.log(" ever enriched                  :", await count("contractors", { last_enriched_at: ["not.is", null] }));
    console.log(" usaspending refreshed 7d       :", await count("contractors", { last_usaspending_refresh: ["gte", new Date(now - 7*oneDay).toISOString()] }));

    console.log("\n=== GOVERNMENT CONTACTS ===");
    console.log(" total                          :", await count("government_contacts"));
    console.log(" with email                     :", await count("government_contacts", { email: ["not.is", null] }));
    console.log(" with agency_domain             :", await count("government_contacts", { agency_domain: ["not.is", null] }));
    console.log(" with first+last name           :", await count("government_contacts", { first_name: ["not.is", null] }));
    console.log(" enriched (apollo)              :", await count("government_contacts", { enriched_at: ["not.is", null] }));
    console.log(" with linkedin_url              :", await count("government_contacts", { linkedin_url: ["not.is", null] }));
    console.log(" with mobile_phone              :", await count("government_contacts", { mobile_phone: ["not.is", null] }));

    console.log("\n=== TEAMING GRAPH ===");
    console.log(" subaward_edges                 :", await count("subaward_edges"));
    console.log(" tribal_contractors             :", await count("tribal_contractors"));
    console.log(" prime_sblos                    :", await count("prime_sblos"));
    console.log(" agency_spend_forecast          :", await count("agency_spend_forecast"));

    console.log("\n=== RSS / SLED INGESTION ===");
    console.log(" rss_sources total              :", await count("rss_sources"));
    console.log(" rss_sources enabled            :", await count("rss_sources", { enabled: ["eq", true] }));
    console.log(" rss_sources last fetched ok    :", await count("rss_sources", { last_status: ["eq", "ok"] }));

    console.log("\n=== MATCHES + USERS ===");
    console.log(" user_matches                   :", await count("user_matches"));
    console.log(" user_matches HOT               :", await count("user_matches", { classification: ["eq", "HOT"] }));
    console.log(" user_matches WARM              :", await count("user_matches", { classification: ["eq", "WARM"] }));
    console.log(" user_pursuits                  :", await count("user_pursuits"));
    console.log(" user_profiles                  :", await count("user_profiles"));

    console.log("\n=== CONTACTS / SAM POCS ===");
    console.log(" contacts (sam POCs)            :", await count("contacts"));
    console.log(" company_analyses (quick-checker):", await count("company_analyses"));

    console.log("\n=== ATTACHMENTS + ATTACHED_AI_ANALYSIS ===");
    try {
        const { count: cAtt } = await sb.from("opportunity_attachments").select("*", { count: "exact", head: true });
        console.log(" opportunity_attachments         :", cAtt);
    } catch (e) { console.log(" opportunity_attachments         : -", e.message); }
})();
