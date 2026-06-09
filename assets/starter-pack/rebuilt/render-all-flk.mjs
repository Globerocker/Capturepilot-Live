#!/usr/bin/env node
/**
 * render-all-flk.mjs — Re-render every Federal Launch Kit PDF using the
 * pdf-builder pipeline, writing each to its production location in
 * dashboard/public/starter-pack/<NN_DIR>/FLK_NN_*.pdf.
 *
 * Used when the pipeline changes (e.g. 2026-06-09 cover-chrome fix) and we
 * need to push the new rendering to every existing FLK PDF.
 *
 * Usage:
 *   node assets/starter-pack/rebuilt/render-all-flk.mjs
 *   node assets/starter-pack/rebuilt/render-all-flk.mjs --only=sam-renewal-kit
 *   node assets/starter-pack/rebuilt/render-all-flk.mjs --parallel=3
 *
 * Sequential by default (Chromium contention is a known issue from the
 * starter-pack initial-build worktree). Bump --parallel only if you've
 * verified the box can handle it.
 */

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { stat } from "node:fs/promises";
import { renderPdf } from "../../../tools/pdf-builder/render.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../..");
const CONFIGS_DIR = __dirname;
const OUT_BASE = resolve(REPO_ROOT, "dashboard/public/starter-pack");

// Locked mapping (slug → relative output path under dashboard/public/starter-pack/).
// Verified 2026-06-09 against the 24 PDFs shipped in commit b2a578af.
const MAPPING = {
    "sam-walkthrough":             "01_SAM_Registration_Kit/FLK_01_SAM_Registration_Walkthrough.pdf",
    "sam-renewal-kit":             "01_SAM_Registration_Kit/FLK_01_SAM_Renewal_Kit.pdf",
    "sam-naics-picker":            "01_SAM_Registration_Kit/FLK_01_NAICS_Code_Picker.pdf",
    "cap-statement-howto":         "02_Capability_Statement_Kit/FLK_02_How_to_Write_Capability_Statement.pdf",
    "cap-statement-template-pdf":  "02_Capability_Statement_Kit/FLK_02_Capability_Statement_Template.pdf",
    "cap-statement-canva-kit":     "02_Capability_Statement_Kit/FLK_02_Capability_Statement_Canva_Kit.pdf",
    "sources-sought-playbook":     "03_Solicitation_Playbooks/FLK_03_Sources_Sought_RFI_Playbook.pdf",
    "presol-playbook":             "03_Solicitation_Playbooks/FLK_03_Pre_Solicitation_Playbook.pdf",
    "rfp-playbook":                "03_Solicitation_Playbooks/FLK_03_RFP_Response_Playbook.pdf",
    "rfq-playbook":                "03_Solicitation_Playbooks/FLK_03_RFQ_Playbook.pdf",
    "idiq-playbook":               "03_Solicitation_Playbooks/FLK_03_IDIQ_GWAC_Task_Order_Playbook.pdf",
    "market-research-playbook":    "03_Solicitation_Playbooks/FLK_03_Market_Research_Playbook.pdf",
    "vosb-sdvosb-cve-guide":       "05_Certification_Eligibility_Worksheets/FLK_05_VOSB_SDVOSB_CVE_Guide.pdf",
    "past-perf-template-pdf":      "06_Past_Performance_Reference_Templates/FLK_06_Past_Performance_Reference_Template.pdf",
    "commercial-to-federal-pp":    "06_Past_Performance_Reference_Templates/FLK_06_Commercial_to_Federal_Past_Performance.pdf",
    "co-email-templates":          "07_Contracting_Officer_Outreach_Library/FLK_07_CO_Email_Templates.pdf",
    "linkedin-outreach-scripts":   "07_Contracting_Officer_Outreach_Library/FLK_07_LinkedIn_Outreach_Scripts.pdf",
    "industry-day-playbook":       "07_Contracting_Officer_Outreach_Library/FLK_07_Industry_Day_Playbook.pdf",
    "cor-pm-scripts":              "07_Contracting_Officer_Outreach_Library/FLK_07_COR_PM_Conversation_Scripts.pdf",
    "labor-rate-benchmarks":       "08_Price_to_Win_Toolkit/FLK_08_Federal_Labor_Rate_Benchmarks_FY2026.pdf",
    "far-clause-decoder":          "09_Internal_Best_Practice_Library/FLK_09_FAR_Clause_Quick_Reference_Decoder.pdf",
    "color-team-review":           "09_Internal_Best_Practice_Library/FLK_09_Color_Team_Review_Templates.pdf",
    "teaming-agreement-pdf":       "09_Internal_Best_Practice_Library/FLK_09_Teaming_Agreement_Template.pdf",
    "founder-onboarding-cta":      "10_Bonus_Founder_Onboarding_Call/FLK_10_Founder_Onboarding_Call.pdf",
};

const args = process.argv.slice(2);
const onlyArg = args.find((a) => a.startsWith("--only="));
const only = onlyArg ? onlyArg.split("=")[1] : null;
const parallelArg = args.find((a) => a.startsWith("--parallel="));
const parallel = parallelArg ? parseInt(parallelArg.split("=")[1], 10) : 1;

const slugs = only ? [only] : Object.keys(MAPPING);
if (only && !MAPPING[only]) {
    console.error(`[render-all-flk] Unknown slug: ${only}`);
    console.error(`Available: ${Object.keys(MAPPING).join(", ")}`);
    process.exit(1);
}

console.log(`[render-all-flk] Rendering ${slugs.length} FLK PDF(s) ${parallel > 1 ? `(${parallel}× parallel)` : "(sequential)"}`);

async function renderOne(slug) {
    const configPath = resolve(CONFIGS_DIR, `${slug}.config.json`);
    const outputPath = resolve(OUT_BASE, MAPPING[slug]);

    const t0 = Date.now();
    try {
        const { readFile } = await import("node:fs/promises");
        const config = JSON.parse(await readFile(configPath, "utf8"));
        const res = await renderPdf({ config, outputPath });
        const dt = Date.now() - t0;
        console.log(`  ✓ ${slug.padEnd(35)} ${res.pageCount}p · ${res.sizeKB || "?"}KB · ${dt}ms`);
        return { slug, ok: true, ...res };
    } catch (e) {
        const dt = Date.now() - t0;
        console.error(`  ✗ ${slug.padEnd(35)} FAILED · ${dt}ms · ${e.message}`);
        return { slug, ok: false, error: e.message };
    }
}

const results = [];
if (parallel > 1) {
    // Batched parallel rendering — `parallel` at a time
    for (let i = 0; i < slugs.length; i += parallel) {
        const batch = slugs.slice(i, i + parallel);
        const batchResults = await Promise.all(batch.map(renderOne));
        results.push(...batchResults);
    }
} else {
    for (const slug of slugs) {
        results.push(await renderOne(slug));
    }
}

const ok = results.filter((r) => r.ok).length;
const failed = results.filter((r) => !r.ok);
console.log(`\n[render-all-flk] Done. ${ok}/${results.length} succeeded.`);
if (failed.length > 0) {
    console.error(`Failed: ${failed.map((f) => f.slug).join(", ")}`);
    process.exit(1);
}
