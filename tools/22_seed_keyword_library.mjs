#!/usr/bin/env node
// Seed the gov_keywords library from the opportunities table.
//
// Phase 1 (--mine): extract 1-3 word n-grams from opportunity titles + descriptions,
//                   filter by stopwords + min frequency, upsert as candidate keywords.
// Phase 2 (--cluster): AI pass (gpt-4o-mini) over the top-N candidates to merge aliases,
//                      assign categories, and mark them as promoted.
//
// Usage:
//   node tools/22_seed_keyword_library.mjs --mine                    # extract + upsert candidates
//   node tools/22_seed_keyword_library.mjs --mine --max-opps 5000    # limit for a quick run
//   node tools/22_seed_keyword_library.mjs --cluster                 # AI-cluster top candidates
//   node tools/22_seed_keyword_library.mjs --cluster --top 500       # cluster just the top 500
//   node tools/22_seed_keyword_library.mjs --stats                   # print library stats
//
// Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_KEY, (OPENAI_API_KEY for --cluster)

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_KEY env vars.");
    process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
});

// ------------------------------------------------------------
// Stopwords — generic English + federal-contracting noise.
// These dominate n-gram counts but carry no capability signal.
// ------------------------------------------------------------
const STOPWORDS = new Set([
    // articles, prepositions, conjunctions
    "the", "and", "for", "of", "to", "in", "a", "an", "is", "with", "on", "by",
    "from", "at", "as", "or", "be", "are", "was", "were", "this", "that", "these",
    "those", "it", "its", "but", "not", "no", "will", "shall", "may", "can",
    "has", "have", "had", "do", "does", "did", "all", "any", "each", "every",
    "if", "then", "than", "when", "where", "which", "who", "whom", "whose",
    "other", "into", "out", "up", "down", "over", "under", "through", "during",
    "per", "via", "such", "only", "also", "both", "same", "more", "most", "less",
    // gov-contracting noise
    "request", "proposal", "rfp", "rfq", "rfi", "solicitation", "notice", "sources",
    "sought", "presolicitation", "combined", "synopsis", "amendment", "award",
    "contract", "contracts", "agreement", "task", "order", "delivery", "indefinite",
    "federal", "government", "gov", "usa", "united", "states", "department", "dept",
    "agency", "office", "bureau", "branch", "division", "command", "center",
    "service", "services", "support", "program", "project", "requirement", "requirements",
    "provide", "provided", "providing", "perform", "performance", "work", "works",
    "vendor", "contractor", "contractors", "offeror", "offerors", "bidder", "bidders",
    "acquisition", "procurement", "purchase", "purchases", "buy", "buying",
    "new", "required", "requires", "applicable", "general", "special", "various",
    "approximately", "estimated", "maximum", "minimum", "total", "each", "one", "two",
    "company", "inc", "llc", "corp", "corporation", "group", "firm",
    "small", "business", "businesses", "commercial",
    // military/fed common formatters
    "us", "u.s", "usarmy", "usaf", "usmc", "usn", "usps",
    // pronouns / aux
    "he", "she", "they", "them", "their", "there", "here", "his", "her", "our",
    "we", "you", "your", "i", "me", "my", "mine",
    // other low-signal
    "including", "include", "includes", "such", "etc", "i.e", "e.g",
]);

// Tokens that are numeric / junk — drop outright.
function isJunkToken(t) {
    if (t.length < 3) return true;
    if (/^\d+$/.test(t)) return true;           // pure numbers
    if (/^[^a-z]+$/.test(t)) return true;       // no letters
    return false;
}

function normalizeText(text) {
    if (!text) return "";
    return text
        .toLowerCase()
        .replace(/[\u2018\u2019\u201C\u201D]/g, "'")       // smart quotes
        .replace(/[^a-z0-9'\-\s]/g, " ")                    // strip punctuation
        .replace(/\s+/g, " ")
        .trim();
}

// Extract candidate n-grams (1, 2, 3 words) from a text span.
// Returns a Set of unique n-grams present in this text (we count presence per doc,
// not raw occurrences, so a title saying "IT IT IT" counts once).
function extractNgrams(text) {
    const out = new Set();
    const clean = normalizeText(text);
    if (!clean) return out;
    const tokens = clean.split(" ").filter(t => !isJunkToken(t));

    // unigrams
    for (const t of tokens) {
        if (STOPWORDS.has(t)) continue;
        if (t.length < 4) continue;                         // unigrams need >=4 chars
        out.add(t);
    }
    // bigrams
    for (let i = 0; i < tokens.length - 1; i++) {
        const [a, b] = [tokens[i], tokens[i + 1]];
        if (STOPWORDS.has(a) || STOPWORDS.has(b)) continue;
        if (a.length < 3 || b.length < 3) continue;
        out.add(`${a} ${b}`);
    }
    // trigrams (allow interior stopword like "body of armor" — nope, too noisy; require all non-stop)
    for (let i = 0; i < tokens.length - 2; i++) {
        const [a, b, c] = [tokens[i], tokens[i + 1], tokens[i + 2]];
        if (STOPWORDS.has(a) || STOPWORDS.has(b) || STOPWORDS.has(c)) continue;
        if (a.length < 3 || b.length < 3 || c.length < 3) continue;
        out.add(`${a} ${b} ${c}`);
    }
    return out;
}

// ------------------------------------------------------------
// Phase 1: mine opportunities → candidate keywords
// ------------------------------------------------------------
async function mine({ maxOpps = 50000, minFreq = 25, minTitleFreq = 5 }) {
    console.log(`Mining up to ${maxOpps} opportunities (min_freq=${minFreq}, min_title_freq=${minTitleFreq})…`);

    const titleCounts = new Map();      // keyword → count of opps whose TITLE contains it
    const descCounts = new Map();       // keyword → count of opps whose DESCRIPTION contains it

    const PAGE = 1000;
    let offset = 0;
    let scanned = 0;

    while (scanned < maxOpps) {
        const { data, error } = await db
            .from("opportunities")
            .select("title, description")
            .range(offset, offset + PAGE - 1);

        if (error) {
            console.error("Supabase query failed:", error.message);
            break;
        }
        if (!data || data.length === 0) break;

        for (const row of data) {
            const titleGrams = extractNgrams(row.title);
            for (const g of titleGrams) titleCounts.set(g, (titleCounts.get(g) || 0) + 1);

            // Descriptions are long — truncate to first 2000 chars to keep n-gram counts
            // dominated by the meaningful preamble, not boilerplate clauses.
            const desc = (row.description || "").slice(0, 2000);
            const descGrams = extractNgrams(desc);
            for (const g of descGrams) descCounts.set(g, (descCounts.get(g) || 0) + 1);
        }

        scanned += data.length;
        offset += PAGE;
        if (scanned % 5000 === 0 || data.length < PAGE) {
            console.log(`  scanned ${scanned} opps  (unique title-grams: ${titleCounts.size}, desc-grams: ${descCounts.size})`);
        }
        if (data.length < PAGE) break;
    }

    console.log(`\nScanned ${scanned} opportunities. Filtering candidates…`);

    // Union of keywords from both sources, scored.
    const all = new Map();  // keyword → { title_freq, desc_freq }
    for (const [k, v] of titleCounts) {
        all.set(k, { title_freq: v, desc_freq: descCounts.get(k) || 0 });
    }
    for (const [k, v] of descCounts) {
        if (!all.has(k)) all.set(k, { title_freq: 0, desc_freq: v });
    }

    // Candidate rule: meaningful if it appears in N titles OR in many descriptions.
    const candidates = [];
    for (const [keyword, { title_freq, desc_freq }] of all) {
        const frequency = title_freq + desc_freq;
        if (title_freq < minTitleFreq && frequency < minFreq) continue;
        candidates.push({
            keyword,
            display_label: toDisplay(keyword),
            frequency,
            title_frequency: title_freq,
            source: "mined",
        });
    }

    // Sort by title_frequency desc (strongest signal), then total frequency.
    candidates.sort((a, b) => {
        if (b.title_frequency !== a.title_frequency) return b.title_frequency - a.title_frequency;
        return b.frequency - a.frequency;
    });

    console.log(`Kept ${candidates.length} candidates. Writing to gov_keywords…`);
    console.log("Top 20 by title frequency:");
    for (const c of candidates.slice(0, 20)) {
        console.log(`  ${c.title_frequency.toString().padStart(5)}t / ${c.frequency.toString().padStart(6)}total  ${c.keyword}`);
    }

    // Fetch existing keywords so we only bump counts on rows that already exist
    // (a raw upsert would clobber category/aliases/source set by --cluster).
    const existing = new Set();
    let existOffset = 0;
    while (true) {
        const { data } = await db
            .from("gov_keywords")
            .select("keyword")
            .range(existOffset, existOffset + 999);
        if (!data || data.length === 0) break;
        for (const r of data) existing.add(r.keyword);
        if (data.length < 1000) break;
        existOffset += 1000;
    }

    const toInsert = candidates.filter(c => !existing.has(c.keyword));
    const toUpdate = candidates.filter(c => existing.has(c.keyword));

    console.log(`  ${toInsert.length} new, ${toUpdate.length} existing (count-refresh only).`);

    // Insert new rows in chunks.
    const CHUNK = 500;
    for (let i = 0; i < toInsert.length; i += CHUNK) {
        const batch = toInsert.slice(i, i + CHUNK);
        const { error } = await db.from("gov_keywords").insert(batch);
        if (error) console.error(`  ! insert batch ${i} failed:`, error.message);
        else process.stdout.write(`.`);
    }

    // Update existing rows — only bump frequency/title_frequency + updated_at.
    for (let i = 0; i < toUpdate.length; i++) {
        const c = toUpdate[i];
        const { error } = await db
            .from("gov_keywords")
            .update({
                frequency: c.frequency,
                title_frequency: c.title_frequency,
                updated_at: new Date().toISOString(),
            })
            .eq("keyword", c.keyword);
        if (error) console.error(`  ! update ${c.keyword} failed:`, error.message);
        if (i % 100 === 0) process.stdout.write(`.`);
    }

    console.log(`\n✓ Seeded ${toInsert.length} new + refreshed ${toUpdate.length} existing keywords.`);
}

function toDisplay(keyword) {
    // Title-case, except keep short words lowercase (except first).
    return keyword
        .split(" ")
        .map((w, i) => {
            if (i > 0 && ["of", "and", "or", "the", "in", "on", "for"].includes(w)) return w;
            if (w.length <= 3 && w.toUpperCase() !== w.toLowerCase()) {
                // "it" → "IT", "gis" → "GIS" (acronym-ish guess for short words)
                return w.toUpperCase();
            }
            return w[0].toUpperCase() + w.slice(1);
        })
        .join(" ");
}

// ------------------------------------------------------------
// Phase 2: AI cluster — merge aliases + assign categories
// ------------------------------------------------------------
async function cluster({ top = 1000, batchSize = 80 }) {
    if (!OPENAI_KEY) {
        console.error("OPENAI_API_KEY missing — cannot run --cluster.");
        process.exit(1);
    }

    console.log(`Clustering top ${top} keywords via gpt-4o-mini (batches of ${batchSize})…`);

    const { data, error } = await db
        .from("gov_keywords")
        .select("keyword, frequency, title_frequency, category")
        .order("title_frequency", { ascending: false })
        .order("frequency", { ascending: false })
        .limit(top);

    if (error) {
        console.error("fetch failed:", error.message);
        return;
    }

    for (let i = 0; i < data.length; i += batchSize) {
        const batch = data.slice(i, i + batchSize);
        const prompt = buildClusterPrompt(batch);
        console.log(`\nBatch ${Math.floor(i / batchSize) + 1}/${Math.ceil(data.length / batchSize)} (${batch.length} keywords)`);
        const result = await callOpenAI(prompt);
        if (!result) continue;
        await applyClusterResult(result);
    }
    console.log("\n✓ Cluster pass complete.");
}

function buildClusterPrompt(batch) {
    const list = batch.map(r => `- ${r.keyword}  (title:${r.title_frequency}, total:${r.frequency})`).join("\n");
    return `You are curating a keyword library for federal contracting. Here are candidate keywords mined from opportunity titles/descriptions:

${list}

For each keyword, decide:
1. Is it a legitimate capability/domain keyword (e.g. "body armor", "cybersecurity", "janitorial"), or pure noise (e.g. "north carolina", "fiscal year", "united states")? Drop noise.
2. If legitimate, assign a category from: defense, it, cybersecurity, construction, facilities, medical, professional_services, logistics, engineering, research, training, environmental, transportation, food_services, other.
3. If it's a variant/synonym of another keyword in the list, mark it as an alias and name the canonical (e.g. "body armour" is an alias of canonical "body armor"). Prefer the more common US-English form as canonical.

Return ONLY valid JSON of this shape:
{
  "keywords": [
    {"keyword": "body armor", "category": "defense", "canonical": null, "aliases": ["body armour", "ballistic armor"]},
    {"keyword": "body armour", "category": "defense", "canonical": "body armor", "aliases": []},
    {"keyword": "north carolina", "drop": true}
  ]
}`;
}

async function callOpenAI(prompt) {
    try {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${OPENAI_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [{ role: "user", content: prompt }],
                response_format: { type: "json_object" },
                temperature: 0.2,
            }),
        });
        if (!res.ok) {
            console.error("  ! OpenAI", res.status, await res.text());
            return null;
        }
        const json = await res.json();
        const content = json.choices?.[0]?.message?.content;
        if (!content) return null;
        return JSON.parse(content);
    } catch (err) {
        console.error("  ! OpenAI call failed:", err.message);
        return null;
    }
}

async function applyClusterResult(result) {
    const items = result.keywords || [];
    let dropped = 0, aliased = 0, categorized = 0;

    for (const item of items) {
        if (item.drop) {
            await db.from("gov_keywords").delete().eq("keyword", item.keyword);
            dropped++;
            continue;
        }
        if (item.canonical && item.canonical !== item.keyword) {
            // This is a variant — merge into canonical as alias, then delete the variant row.
            const { data: canon } = await db
                .from("gov_keywords")
                .select("aliases, frequency, title_frequency")
                .eq("keyword", item.canonical)
                .maybeSingle();
            if (canon) {
                const merged = Array.from(new Set([...(canon.aliases || []), item.keyword]));
                await db.from("gov_keywords")
                    .update({
                        aliases: merged,
                        source: "ai",
                        updated_at: new Date().toISOString(),
                    })
                    .eq("keyword", item.canonical);
                await db.from("gov_keywords").delete().eq("keyword", item.keyword);
                aliased++;
            }
            continue;
        }
        // Canonical entry — set category and add any discovered aliases.
        await db.from("gov_keywords")
            .update({
                category: item.category || null,
                aliases: item.aliases && item.aliases.length > 0 ? item.aliases : undefined,
                source: "ai",
                updated_at: new Date().toISOString(),
            })
            .eq("keyword", item.keyword);
        categorized++;
    }

    console.log(`  ✓ categorized ${categorized}, aliased ${aliased}, dropped ${dropped}`);
}

// ------------------------------------------------------------
// --stats
// ------------------------------------------------------------
async function stats() {
    const { count: total } = await db
        .from("gov_keywords")
        .select("*", { count: "exact", head: true });

    const { data: byCategory } = await db
        .from("gov_keywords")
        .select("category")
        .not("category", "is", null);

    const catMap = new Map();
    for (const row of byCategory || []) {
        catMap.set(row.category, (catMap.get(row.category) || 0) + 1);
    }

    const { data: top } = await db
        .from("gov_keywords")
        .select("keyword, display_label, category, title_frequency, frequency")
        .order("title_frequency", { ascending: false })
        .limit(25);

    console.log(`\nTotal keywords: ${total}`);
    console.log(`Categorized:    ${[...catMap.values()].reduce((a, b) => a + b, 0)}`);
    console.log(`\nBy category:`);
    for (const [cat, n] of [...catMap.entries()].sort((a, b) => b[1] - a[1])) {
        console.log(`  ${n.toString().padStart(5)}  ${cat}`);
    }
    console.log(`\nTop 25 by title frequency:`);
    for (const r of top || []) {
        const cat = (r.category || "—").padEnd(20);
        console.log(`  ${r.title_frequency.toString().padStart(5)}t / ${r.frequency.toString().padStart(6)}total  ${cat}  ${r.display_label}`);
    }
}

// ------------------------------------------------------------
// CLI
// ------------------------------------------------------------
function arg(flag, fallback) {
    const i = process.argv.indexOf(flag);
    if (i === -1) return fallback;
    const v = process.argv[i + 1];
    if (!v || v.startsWith("--")) return true;
    return isNaN(+v) ? v : +v;
}

const mode = process.argv.slice(2).find(a => ["--mine", "--cluster", "--stats"].includes(a));

if (mode === "--mine") {
    await mine({
        maxOpps: arg("--max-opps", 50000),
        minFreq: arg("--min-freq", 25),
        minTitleFreq: arg("--min-title-freq", 5),
    });
} else if (mode === "--cluster") {
    await cluster({
        top: arg("--top", 1000),
        batchSize: arg("--batch", 80),
    });
} else if (mode === "--stats") {
    await stats();
} else {
    console.log(`Usage:
  node tools/22_seed_keyword_library.mjs --mine [--max-opps N] [--min-freq N] [--min-title-freq N]
  node tools/22_seed_keyword_library.mjs --cluster [--top N] [--batch N]
  node tools/22_seed_keyword_library.mjs --stats

Recommended workflow:
  1. node tools/22_seed_keyword_library.mjs --mine                   # ~5-10 min, builds candidate pool
  2. node tools/22_seed_keyword_library.mjs --cluster --top 1500     # AI cleanup pass (needs OPENAI_API_KEY)
  3. node tools/22_seed_keyword_library.mjs --stats                  # verify results
`);
    process.exit(mode ? 0 : 1);
}
