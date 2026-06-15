// Seed the Academy from the Federal Launch Kit (the $70 starter pack).
// Uploads each curated asset to a public Supabase bucket and creates an
// academy_articles row (content_type=article) with a description + download
// link. Skips assets the software already replaces.
//
//   node tools/47_seed_academy_starter_pack.mjs            # dry run (no writes)
//   node tools/47_seed_academy_starter_pack.mjs --apply    # upload + insert
//
// Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_KEY

import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
for (const f of [".env", ".env.local", "dashboard/.env", "dashboard/.env.local"]) {
    const p = path.join(root, f);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
        const t = line.trim();
        if (!t || t.startsWith("#") || !t.includes("=")) continue;
        const i = t.indexOf("=");
        const k = t.slice(0, i).trim();
        let v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
        if (!(k in process.env)) process.env[k] = v;
    }
}

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;
if (!URL || !KEY) { console.error("Missing Supabase env"); process.exit(1); }
const APPLY = process.argv.includes("--apply");
const db = createClient(URL, KEY, { auth: { persistSession: false } });
const SRC = path.join(root, "assets/starter-pack/rebuilt");
const BUCKET = "academy-resources";

const MIME = {
    ".pdf": "application/pdf",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

// Curated — the genuinely useful standalone resources. Software-replaced
// assets (capability-statement template, 8(a) self-assessment) are omitted.
const ITEMS = [
    { file: "FLK_Field_Manual.pdf", slug: "federal-contracting-field-manual", title: "Federal Contracting Field Manual", category: "Guides", featured: true, excerpt: "The master guide to winning your first federal contracts.", desc: "The full field manual that ties the whole starter pack together — how federal buying works, where small firms actually win, and the sequence to follow from SAM registration to award." },
    { file: "FLK_00_Navigation_Guide.docx", slug: "starter-pack-navigation-guide", title: "Starter Pack Navigation Guide", category: "Guides", excerpt: "What's in the kit and the order to use it.", desc: "A short map of every resource in the kit and when to reach for each one." },
    { file: "FLK_01_SAM_Renewal_Kit.pdf", slug: "sam-renewal-kit", title: "SAM Renewal Kit", category: "Guides", excerpt: "Keep your SAM.gov registration active without scrambling.", desc: "Checklist and timeline for renewing your SAM.gov registration before it lapses, plus the common mistakes that cause rejections." },
    { file: "FLK_03_Sources_Sought_RFI_Playbook.pdf", slug: "sources-sought-rfi-playbook", title: "Sources Sought & RFI Playbook", category: "Playbooks", featured: true, excerpt: "Shape a requirement 6–18 months before the solicitation drops.", desc: "How to respond to Sources Sought and RFIs so the contracting officer writes the eventual solicitation around what you do. This is the highest-leverage move in federal capture." },
    { file: "FLK_03_RFP_Response_Playbook.pdf", slug: "rfp-response-playbook", title: "RFP Response Playbook", category: "Playbooks", excerpt: "A repeatable structure for compliant, winning proposals.", desc: "Step-by-step approach to reading Section L/M, building a compliance matrix, and writing to the evaluation criteria instead of just describing your company." },
    { file: "FLK_05_VOSB_SDVOSB_CVE_Guide.pdf", slug: "vosb-sdvosb-verification-guide", title: "VOSB / SDVOSB Verification Guide", category: "Guides", excerpt: "Get verified and use the set-aside the right way.", desc: "What veteran-owned and service-disabled veteran-owned firms need for VetCert verification, and how to actually leverage the set-aside once you have it." },
    { file: "FLK_07_CO_Email_Templates.pdf", slug: "contracting-officer-email-templates", title: "Contracting Officer Email Templates", category: "Templates", excerpt: "Outreach that COs actually answer.", desc: "Plain, professional email templates for introducing your firm to contracting officers, asking about upcoming work, and following up after a Sources Sought." },
    { file: "FLK_08_Federal_Labor_Rate_Benchmarks_FY2026.pdf", slug: "federal-labor-rate-benchmarks-fy2026", title: "Federal Labor Rate Benchmarks (FY2026)", category: "Reference", excerpt: "Price competitively without leaving money on the table.", desc: "Reference labor-rate ranges for common federal labor categories in FY2026 to sanity-check your pricing before you bid." },
    { file: "FLK_09_FAR_Clause_Quick_Reference_Decoder.pdf", slug: "far-clause-quick-reference-decoder", title: "FAR Clause Quick-Reference Decoder", category: "Reference", excerpt: "Plain-English translations of the clauses you'll actually hit.", desc: "A decoder for the FAR clauses small contractors run into most, so you know what each one obligates you to before you sign." },
    { file: "FLK_09_Color_Team_Review_Templates.pdf", slug: "color-team-review-templates", title: "Color Team Proposal Review Templates", category: "Templates", excerpt: "Pink/Red/Gold team reviews, scaled for a small shop.", desc: "Lightweight color-team review templates so even a two-person firm can run a real proposal review before submitting." },
    { file: "FLK_09_Compliance_Matrix_Template.xlsx", slug: "compliance-matrix-template", title: "Compliance Matrix Template", category: "Templates", excerpt: "Map every Section L/M requirement to your proposal.", desc: "A ready-to-fill compliance matrix that keeps your proposal from getting tossed for a missed requirement." },
    { file: "FLK_06_Sample_Past_Performance_Janitorial.docx", slug: "sample-past-performance-writeup", title: "Sample Past Performance Write-up", category: "Templates", excerpt: "A worked example of a strong past-performance reference.", desc: "A filled-in past-performance write-up (janitorial example) you can model your own references on." },
    { file: "FLK_04_Sample_Filled_PWin_Worked_Example.xlsx", slug: "pwin-scoring-worked-example", title: "PWin Scoring — Worked Example", category: "Reference", excerpt: "See how a real bid/no-bid score comes together.", desc: "A filled PWin (probability of win) worksheet showing how to score an opportunity across the factors that actually predict a win." },
];

function publicUrl(p) { return `${URL}/storage/v1/object/public/${BUCKET}/${p}`; }

async function ensureBucket() {
    const { data } = await db.storage.getBucket(BUCKET);
    if (!data) {
        const { error } = await db.storage.createBucket(BUCKET, { public: true });
        if (error && !/exists/i.test(error.message)) throw error;
        console.log(`  created bucket ${BUCKET}`);
    }
}

async function main() {
    console.log(`Academy seed — ${APPLY ? "APPLY" : "DRY RUN"} — ${ITEMS.length} resources from ${SRC}`);
    const missing = ITEMS.filter((it) => !fs.existsSync(path.join(SRC, it.file)));
    if (missing.length) console.log(`  MISSING FILES: ${missing.map((m) => m.file).join(", ")}`);
    if (!APPLY) { ITEMS.forEach((it) => console.log(`  would seed: ${it.title}  (${it.file})`)); return; }

    await ensureBucket();
    let ok = 0;
    for (const it of ITEMS) {
        const fp = path.join(SRC, it.file);
        if (!fs.existsSync(fp)) { console.log(`  SKIP (missing) ${it.file}`); continue; }
        const ext = path.extname(it.file).toLowerCase();
        const buf = fs.readFileSync(fp);
        const up = await db.storage.from(BUCKET).upload(it.file, buf, {
            contentType: MIME[ext] || "application/octet-stream", upsert: true,
        });
        if (up.error) { console.log(`  UPLOAD FAIL ${it.file}: ${up.error.message}`); continue; }
        const dl = publicUrl(it.file);
        const body = `${it.desc}\n\n**[⬇ Download — ${it.title}](${dl})**\n\n_Part of the CapturePilot Federal Launch Kit._`;
        const { error } = await db.from("academy_articles").upsert({
            slug: it.slug, title: it.title, excerpt: it.excerpt, body_md: body,
            category: it.category, content_type: "article", featured: !!it.featured,
            teaser_public: false, author_name: "CapturePilot", reading_minutes: 5,
            published_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }, { onConflict: "slug" });
        if (error) { console.log(`  DB FAIL ${it.slug}: ${error.message}`); continue; }
        ok++; console.log(`  ✓ ${it.title}`);
    }
    console.log(`\nDONE — ${ok}/${ITEMS.length} academy resources seeded.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
