#!/usr/bin/env node
/**
 * Backfill contractors.capability_keywords from NAICS industry titles.
 *
 * WHY: ~1/3 of the Sales Cockpit lead queue shows an empty Keywords tab. Those
 * firms are qc_enriched but the crawl never produced structured services, so
 * capability_summary_ai.services / .capability_keywords are [] and the
 * capability_keywords column is NULL. We always know their NAICS codes, and the
 * naics_codes DB table carries a clean industry_title for every code — a free,
 * deterministic keyword source. "561720" → "Janitorial Services" →
 * ["janitorial services", "janitorial"].
 *
 * This mirrors src/lib/derive-keywords.ts so the persisted column matches the
 * live leads-route fallback. Run queue-first (what the partner sees), then the
 * full corpus.
 *
 *   node tools/49_backfill_capability_keywords.mjs --queue-only            # dry-run, queue only
 *   node tools/49_backfill_capability_keywords.mjs --queue-only --apply    # write queue
 *   node tools/49_backfill_capability_keywords.mjs --apply                 # write whole corpus
 *   node tools/49_backfill_capability_keywords.mjs --apply --limit 5000
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL + SUPABASE_SERVICE_KEY (auto-loaded
 * from .env / .env.local in repo root or dashboard/).
 */

import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function loadEnvFile(file) {
    if (!fs.existsSync(file)) return;
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
        const t = line.trim();
        if (!t || t.startsWith("#") || !t.includes("=")) continue;
        const idx = t.indexOf("=");
        const key = t.slice(0, idx).trim();
        let value = t.slice(idx + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        if (!(key in process.env)) process.env[key] = value;
    }
}
loadEnvFile(path.join(root, ".env"));
loadEnvFile(path.join(root, ".env.local"));
loadEnvFile(path.join(root, "dashboard", ".env"));
loadEnvFile(path.join(root, "dashboard", ".env.local"));

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_KEY.");
    process.exit(1);
}
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const QUEUE_ONLY = args.includes("--queue-only");
const LIMIT = (() => {
    const i = args.indexOf("--limit");
    return i >= 0 && args[i + 1] ? Math.max(1, parseInt(args[i + 1], 10)) : Infinity;
})();

// ── keyword derivation (mirror of src/lib/derive-keywords.ts) ─────────────────
const STOP_PHRASES = new Set([
    "services", "service", "all other", "other", "n e c", "nec", "general",
    "and related structures construction",
]);
const TRAILING_NOISE = /(,?\s*(except|including|and related[^,]*|n\.?e\.?c\.?)\b.*)$/i;

function clean(s) {
    return String(s || "")
        .replace(/\([^)]*\)/g, " ")
        .replace(/[^a-zA-Z0-9 &/\-]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
}
function phrasesFromLabel(label) {
    if (!label) return [];
    let l = String(label).replace(/^\s*\d{2,6}\s*[—\-:]\s*/, "");
    l = l.replace(TRAILING_NOISE, "");
    const full = clean(l);
    if (!full) return [];
    const out = [];
    if (!STOP_PHRASES.has(full)) out.push(full);
    for (const part of full.split(/\s*(?:,| and | & |\/)\s*/)) {
        const p = part.trim();
        if (!p || STOP_PHRASES.has(p)) continue;
        const words = p.split(" ");
        if (words.length >= 1 && words.length <= 4 && p !== full) out.push(p);
    }
    return out;
}
function nameArray(v) {
    if (!Array.isArray(v)) return [];
    return v.map((it) => {
        if (typeof it === "string") return it;
        if (it && typeof it === "object") return it.name || it.title || "";
        return "";
    }).filter(Boolean);
}
function deriveKeywords({ existing, services, strengths, naicsLabels, max = 14 }) {
    const ordered = [];
    const seen = new Set();
    const push = (raw) => {
        const k = clean(raw);
        if (!k || STOP_PHRASES.has(k) || seen.has(k)) return;
        seen.add(k);
        ordered.push(k);
    };
    for (const e of existing || []) if (e) push(e);
    for (const s of nameArray(services)) push(s);
    for (const s of nameArray(strengths)) push(s);
    for (const label of naicsLabels || []) {
        if (!label) continue;
        for (const p of phrasesFromLabel(label)) push(p);
    }
    return ordered.slice(0, max);
}

// ── load full NAICS label map from DB (every code, not just the 80 in-app) ────
async function loadNaicsMap() {
    const map = new Map();
    let from = 0;
    const page = 1000;
    for (;;) {
        const { data, error } = await sb
            .from("naics_codes")
            .select("code, industry_title")
            .range(from, from + page - 1);
        if (error) throw new Error(`naics_codes read: ${error.message}`);
        if (!data || data.length === 0) break;
        for (const r of data) if (r.code) map.set(String(r.code), r.industry_title || "");
        if (data.length < page) break;
        from += page;
    }
    return map;
}

// Collect ALL eligible rows up front in a read-only paginated pass. Reads don't
// mutate the eligible set, so offset pagination is stable here — unlike writing
// mid-scan, which shifts the window and skips rows.
async function collectEligible() {
    const page = 1000;
    let from = 0;
    const rows = [];
    for (;;) {
        if (rows.length >= LIMIT) break;
        let q = sb
            .from("contractors")
            .select("id, company_name, naics_codes, capability_keywords, capability_summary_ai, top_match_count")
            .not("naics_codes", "is", null)
            .or("capability_keywords.is.null,capability_keywords.eq.{}")
            .order("top_match_count", { ascending: false, nullsFirst: false })
            .range(from, from + page - 1);
        if (QUEUE_ONLY) q = q.gt("top_match_count", 0);
        const { data, error } = await q;
        if (error) throw new Error(`contractors read: ${error.message}`);
        if (!data || data.length === 0) break;
        rows.push(...data);
        if (data.length < page) break;
        from += page;
    }
    return LIMIT === Infinity ? rows : rows.slice(0, LIMIT);
}

async function main() {
    console.log(`[backfill-keywords] mode=${APPLY ? "APPLY" : "DRY-RUN"} scope=${QUEUE_ONLY ? "queue-only" : "corpus"} limit=${LIMIT === Infinity ? "all" : LIMIT}`);
    const naics = await loadNaicsMap();
    console.log(`[backfill-keywords] loaded ${naics.size} NAICS titles`);

    let scanned = 0, derived = 0, wouldWrite = 0, wrote = 0, emptyAfter = 0;
    const samples = [];

    const eligible = await collectEligible();
    console.log(`[backfill-keywords] eligible rows: ${eligible.length}`);
    for (const c of eligible) {
        scanned++;
        const blob = c.capability_summary_ai && typeof c.capability_summary_ai === "object" ? c.capability_summary_ai : {};
        const labels = (Array.isArray(c.naics_codes) ? c.naics_codes : []).map((code) => naics.get(String(code)) || null);
        const kws = deriveKeywords({
            existing: [...(Array.isArray(c.capability_keywords) ? c.capability_keywords : []), ...(Array.isArray(blob.capability_keywords) ? blob.capability_keywords : [])],
            services: blob.services,
            strengths: blob.strengths,
            naicsLabels: labels,
        });
        if (kws.length === 0) { emptyAfter++; continue; }
        derived++;
        if (samples.length < 8) samples.push(`${c.company_name}: ${kws.slice(0, 6).join(", ")}`);
        if (!APPLY) { wouldWrite++; continue; }
        const { error } = await sb.from("contractors").update({ capability_keywords: kws }).eq("id", c.id);
        if (error) { console.warn(`  update failed ${c.id}: ${error.message}`); continue; }
        wrote++;
        if (wrote % 500 === 0) console.log(`  …wrote ${wrote}`);
    }

    console.log("\n[backfill-keywords] done");
    console.log(`  scanned:      ${scanned}`);
    console.log(`  derived kws:  ${derived}`);
    console.log(`  no naics lbl: ${emptyAfter} (codes not in naics_codes table)`);
    console.log(APPLY ? `  WROTE:        ${wrote}` : `  would write:  ${wouldWrite} (dry-run; add --apply)`);
    if (samples.length) {
        console.log("\n  samples:");
        for (const s of samples) console.log(`   • ${s}`);
    }
}

main().catch((e) => { console.error(e); process.exit(1); });
