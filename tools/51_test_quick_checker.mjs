#!/usr/bin/env node
/**
 * 51_test_quick_checker.mjs
 *
 * Standalone test harness for the rewritten Quick Checker pipeline.
 * Runs runDeepExtract() + reconcileProfile() against a list of real
 * domains and pretty-prints the strategic profile so we can eyeball
 * quality without burning a full /api/analyze-company round-trip.
 *
 * Run:
 *   node tools/51_test_quick_checker.mjs                  # default 3-domain panel
 *   node tools/51_test_quick_checker.mjs acme.com         # one domain
 *   node tools/51_test_quick_checker.mjs --all            # all queued
 *
 * Requires the same env as the dashboard server-side runtime:
 *   FIRECRAWL_API_KEY   (preferred — falls back to plain fetch otherwise)
 *   OLLAMA_URL          (preferred LLM — qwen2.5:7b on Hostinger)
 *   OLLAMA_AUTH_TOKEN
 *   OPENAI_API_KEY      (fallback LLM when OLLAMA_URL is unset/down)
 *   SAM_API_KEY         (reconciliation)
 *
 * Defaults to the 3-domain "regression panel" — known-good US firms
 * across industries we frequently see in real leads:
 *   - smartpipe-com.com  (manufacturing, multi-NAICS)
 *   - bytagig.com        (IT services)
 *   - philpott.com       (federal janitorial — historical CapturePilot test)
 *
 * Adds domains to the panel by passing them on the command line.
 */

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

// Load .env.local if present so the test inherits the same secrets as `npm run dev`.
function loadEnv(path) {
    if (!existsSync(path)) return;
    const text = readFileSync(path, "utf8");
    for (const line of text.split(/\r?\n/)) {
        const m = /^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/.exec(line);
        if (!m) continue;
        const [, k, raw] = m;
        if (process.env[k]) continue;
        let v = raw.trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
        process.env[k] = v;
    }
}
loadEnv(resolve(REPO_ROOT, ".env.local"));
loadEnv(resolve(REPO_ROOT, "dashboard/.env.local"));

const args = process.argv.slice(2);
const ALL = args.includes("--all");
const DEFAULT_PANEL = ["smartpipe-com.com", "bytagig.com", "philpott.com"];
const domains = args.filter(a => !a.startsWith("--"));
const targets = ALL ? [...DEFAULT_PANEL, ...domains] : (domains.length > 0 ? domains : DEFAULT_PANEL);

console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log(`  Quick Checker Test Harness — Phase 7 sanity panel`);
console.log(`  Domains: ${targets.join(", ")}`);
console.log(`  LLM: ${process.env.OLLAMA_URL ? "OLLAMA (preferred) → OpenAI fallback" : "OPENAI"}`);
console.log(`  SAM: ${process.env.SAM_API_KEY ? "enabled" : "DISABLED (no key)"}`);
console.log(`  Firecrawl: ${process.env.FIRECRAWL_API_KEY ? "enabled" : "fetch-fallback only"}`);
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

// Spawn a child Node process inside dashboard/ so the TS-path-aliases
// (`@/lib/...`) resolve through the dashboard's tsconfig. We use a small
// inline TS-compatible runner via ts-node.
const RUNNER = `
import { runDeepExtract } from "@/lib/quick-checker/deep-extract";
import { reconcileProfile } from "@/lib/quick-checker/reconcile";

const domains = ${JSON.stringify(targets)};

(async () => {
    for (const d of domains) {
        const started = Date.now();
        console.log("\\n━━━ " + d + " ━━━");
        try {
            const r = await runDeepExtract({ website: d });
            const ex = r.extraction;
            console.log("[crawl] source=" + r.crawl_source + " · llm=" + r.llm_provider + ":" + (r.llm_model || "fallback") + " · pages=" + r.pages_scraped.length + " · " + r.duration_ms + "ms");
            console.log("[extraction]");
            console.log("  company:        " + (ex.company_name || "(none)"));
            console.log("  founded:        " + (ex.founded_year || "(unknown)"));
            console.log("  state:          " + (ex.headquarters_state || "(unknown)"));
            console.log("  employees:      " + (ex.employee_count_estimate || "(unknown)"));
            console.log("  services:       " + ex.services.slice(0, 5).map(s => s.name).join(" / "));
            console.log("  industries:     " + ex.industries_served.slice(0, 5).join(", "));
            console.log("  nail_down_kw:   " + (ex.nail_down_keywords.join(" · ") || "(none)"));
            console.log("  certifications: " + ex.certifications.map(c => c.type).join(", "));
            console.log("  past_fed_agcy:  " + ex.federal_agencies_served.join(", "));
            console.log("  strengths:");
            for (const s of ex.strengths) console.log("    + " + s);
            console.log("  weaknesses:");
            for (const w of ex.weaknesses) console.log("    - " + w);
            console.log("  pitch_angles:");
            for (const p of ex.pitch_angles) console.log("    > " + p);

            const rec = await reconcileProfile({ extraction: ex, companyName: ex.company_name });
            console.log("[reconcile] sam_active=" + rec.sam_active + " · has_fed_pp=" + rec.has_federal_pp);
            if (rec.uei.value) console.log("  uei: " + rec.uei.value);
            if (rec.legal_name.value && rec.legal_name.source === "sam") console.log("  legal_name (SAM): " + rec.legal_name.value);
            if (rec.verified_certifications.length > 0) console.log("  verified certs:   " + rec.verified_certifications.join(", "));
            if (rec.crawl_claimed_unverified.length > 0) console.log("  unverified claims: " + rec.crawl_claimed_unverified.join(", ") + " ⚠️");
            if (rec.federal_revenue_lifetime.value) console.log("  lifetime fed revenue: $" + rec.federal_revenue_lifetime.value.toLocaleString());
            if (rec.federal_award_count.value) console.log("  total federal awards: " + rec.federal_award_count.value);

            const elapsed = Date.now() - started;
            console.log("[done in " + (elapsed / 1000).toFixed(1) + "s]");
        } catch (err) {
            console.error("[FAIL]", err && err.message ? err.message : err);
        }
    }
})();
`;

const proc = spawn(
    "npx",
    ["tsx", "--tsconfig", "tsconfig.json", "-e", RUNNER],
    {
        cwd: resolve(REPO_ROOT, "dashboard"),
        env: process.env,
        stdio: "inherit",
    },
);

proc.on("exit", (code) => {
    process.exit(code ?? 0);
});
