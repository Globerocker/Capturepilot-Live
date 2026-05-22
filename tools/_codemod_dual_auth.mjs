#!/usr/bin/env node
// Adds SUPABASE_SERVICE_KEY fallback to every cron route still using only
// CRON_SECRET. Keeps existing CRON_SECRET path; appends an OR-clause that
// also accepts a Bearer of the service key — same pattern ingest_sam +
// ingest_rss + ingest_highergov_* already follow.
import fs from "node:fs";
import path from "node:path";

const ROOT = "/Users/andreschuler/Caturepilot 2.0/dashboard/src/app/api/cron";
const files = fs.readdirSync(ROOT)
    .map(d => path.join(ROOT, d, "route.ts"))
    .filter(p => fs.existsSync(p));

let touched = 0;
for (const file of files) {
    const src = fs.readFileSync(file, "utf8");
    if (src.includes("expectedSvc") || src.includes("Bearer ${process.env.SUPABASE_SERVICE_KEY}")) continue;
    if (!src.includes("process.env.CRON_SECRET")) continue;

    // Variant 1: `if (process.env.CRON_SECRET && X !== `Bearer ${process.env.CRON_SECRET}`) { ... }`
    let patched = src.replace(
        /if \(process\.env\.CRON_SECRET && (\w+) !== `Bearer \$\{process\.env\.CRON_SECRET\}`\) \{\s*return NextResponse\.json\(\{ error: "Unauthorized" \}, \{ status: 401 \}\);\s*\}/g,
        (_m, varName) => `if (process.env.CRON_SECRET) {
        const expectedCron = \`Bearer \${process.env.CRON_SECRET}\`;
        const expectedSvc = process.env.SUPABASE_SERVICE_KEY ? \`Bearer \${process.env.SUPABASE_SERVICE_KEY}\` : null;
        if (${varName} !== expectedCron && ${varName} !== expectedSvc) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
    }`
    );

    // Variant 2: `if (auth !== `Bearer ${process.env.CRON_SECRET}`) return ...`  (no curly)
    patched = patched.replace(
        /if \((\w+) !== `Bearer \$\{process\.env\.CRON_SECRET\}`\) return NextResponse\.json\(\{ error: "Unauthorized" \}, \{ status: 401 \}\);/g,
        (_m, varName) => `if (process.env.CRON_SECRET) {
        const expectedCron = \`Bearer \${process.env.CRON_SECRET}\`;
        const expectedSvc = process.env.SUPABASE_SERVICE_KEY ? \`Bearer \${process.env.SUPABASE_SERVICE_KEY}\` : null;
        if (${varName} !== expectedCron && ${varName} !== expectedSvc) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
    }`
    );

    if (patched !== src) {
        fs.writeFileSync(file, patched);
        touched++;
        console.log(`patched: ${path.relative("/Users/andreschuler/Caturepilot 2.0/dashboard", file)}`);
    } else {
        console.log(`unmatched (manual): ${path.relative("/Users/andreschuler/Caturepilot 2.0/dashboard", file)}`);
    }
}
console.log(`\nTouched ${touched} files.`);
