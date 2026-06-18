#!/usr/bin/env node
/**
 * Backfill contractors.sba_cert_codes (migration 189) from the SAM-authoritative
 * sba_certifications column. Normalized codes power the reverse-match set-aside
 * HARD GATE's SQL pre-filter (`&&` overlap). Mirrors normalizeCertCodes() in
 * src/lib/set-aside-eligibility.ts EXACTLY — keep the two in sync.
 *
 * Reads ONLY sba_certifications (never the AI capability blob). The mapping is
 * additive and conservative: SDVOSB also implies VOSB, EDWOSB also implies WOSB
 * (real SBA hierarchy). Cryptic SAM business-type codes (2X, A8, 27, LJ, …) map
 * to nothing — so a firm only ever GAINS a cert code for an explicit match,
 * never a false one.
 *
 *   node tools/50_backfill_sba_cert_codes.mjs            # dry-run
 *   node tools/50_backfill_sba_cert_codes.mjs --apply    # write
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL + SUPABASE_SERVICE_KEY.
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
        let v = t.slice(idx + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
        if (!(key in process.env)) process.env[key] = v;
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
const APPLY = process.argv.includes("--apply");

// ── normalizeCertCodes — MUST mirror src/lib/set-aside-eligibility.ts ─────────
function normalizeCertCodes(certStrings) {
    const out = new Set();
    for (const raw of certStrings || []) {
        const c = String(raw || "").toLowerCase();
        if (!c) continue;
        if (c.includes("8(a)") || /\b8a\b/.test(c)) out.add("8A");
        if (c.includes("sdvosb") || c.includes("service-disabled") || c.includes("service disabled")) out.add("SDVOSB");
        if (c.includes("vosb") || c.includes("veteran-owned") || c.includes("veteran owned")) out.add("VOSB");
        if (c.includes("hubzone")) out.add("HUBZONE");
        if (c.includes("edwosb") || c.includes("economically disadvantaged women")) out.add("EDWOSB");
        if (c.includes("wosb") || c.includes("women-owned") || c.includes("women owned")) out.add("WOSB");
        if (c.includes("indian economic enterprise") || /\biee\b/.test(c) || c.includes("tribal") || c.includes("native american") || c.includes("indian-owned")) out.add("TRIBAL_8A");
    }
    return Array.from(out).sort();
}

const sameSet = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

async function collectEligible() {
    const page = 1000;
    let from = 0;
    const rows = [];
    for (;;) {
        const { data, error } = await sb
            .from("contractors")
            .select("id, sba_certifications, sba_cert_codes")
            .not("sba_certifications", "is", null)
            .range(from, from + page - 1);
        if (error) throw new Error(`read: ${error.message}`);
        if (!data || data.length === 0) break;
        rows.push(...data);
        if (data.length < page) break;
        from += page;
    }
    return rows;
}

async function main() {
    console.log(`[backfill-cert-codes] mode=${APPLY ? "APPLY" : "DRY-RUN"}`);
    const rows = await collectEligible();
    console.log(`[backfill-cert-codes] contractors with sba_certifications: ${rows.length}`);

    let changed = 0, wrote = 0;
    const tally = {};
    const samples = [];
    for (const r of rows) {
        const codes = normalizeCertCodes(Array.isArray(r.sba_certifications) ? r.sba_certifications : []);
        const current = Array.isArray(r.sba_cert_codes) ? [...r.sba_cert_codes].sort() : [];
        if (sameSet(codes, current)) continue;
        changed++;
        for (const c of codes) tally[c] = (tally[c] || 0) + 1;
        if (samples.length < 8 && codes.length) samples.push(`${(r.sba_certifications || []).join("/")} → ${codes.join(", ")}`);
        if (!APPLY) continue;
        const { error } = await sb.from("contractors").update({ sba_cert_codes: codes }).eq("id", r.id);
        if (error) { console.warn(`  update failed ${r.id}: ${error.message}`); continue; }
        wrote++;
        if (wrote % 2000 === 0) console.log(`  …wrote ${wrote}`);
    }

    console.log(`\n[backfill-cert-codes] ${APPLY ? "wrote" : "would change"}: ${APPLY ? wrote : changed}`);
    console.log("  code coverage:", JSON.stringify(tally));
    if (samples.length) { console.log("  samples:"); for (const s of samples) console.log(`   • ${s}`); }
}
main().catch((e) => { console.error(e); process.exit(1); });
