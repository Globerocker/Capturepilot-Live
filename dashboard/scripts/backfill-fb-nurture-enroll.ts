/**
 * Backfill: enroll existing Facebook lead-ad submissions into the 12-email
 * fb_nurture sequence. These leads got the magnet PDF but were never
 * enrolled in a follow-up sequence because the nurture wiring landed AFTER
 * they came in.
 *
 * Why this exists
 * ---------------
 * The 90-day nurture sequence (NURTURE_SEQUENCE in lib/email-nurture-
 * templates.ts) was built but never triggered — the leadgen-webhook didn't
 * call enqueueDripSequence("fb_nurture"). That's now fixed forward, but
 * the 90 existing meta-lead-ad rows in marketing_leads were never enrolled.
 *
 * What this does
 * --------------
 * For every marketing_leads row WHERE source='meta-lead-ad' AND
 * email looks valid AND name passes the gibberish filter AND we haven't
 * already enrolled them: insert 12 rows into scheduled_emails with the
 * day_offset baked in from "now" (NOT from the original lead created_at —
 * we don't want to immediately fire 90 days of stale emails). They get
 * the full sequence starting today.
 *
 * Skips:
 *   - Sketchy/free emails (we still send their magnet, but no 90-day burn)
 *   - Gibberish names (spam-bot fills)
 *   - Already-enrolled leads (idempotent dedup by email + sequence_key)
 *
 * Usage:
 *   cd dashboard
 *   set -a; source .env.vercel.production; set +a
 *   npx tsx scripts/backfill-fb-nurture-enroll.ts             # all
 *   npx tsx scripts/backfill-fb-nurture-enroll.ts --dry-run   # count only
 *   npx tsx scripts/backfill-fb-nurture-enroll.ts --id <uuid> # one
 */

import { createClient } from "@supabase/supabase-js";
import { NURTURE_SEQUENCE } from "../src/lib/email-nurture-templates";
import { looksGibberishName, checkEmailShape } from "../src/lib/lead-validation";

interface FbLead {
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    company: string | null;
}

async function main() {
    const args = process.argv.slice(2);
    const dryRun = args.includes("--dry-run");
    const idArg = args.indexOf("--id");
    const singleId = idArg >= 0 ? args[idArg + 1] : null;

    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );

    let q = sb
        .from("marketing_leads")
        .select("id, email, first_name, last_name, company")
        .eq("source", "meta-lead-ad")
        .not("email", "is", null);
    if (singleId) q = q.eq("id", singleId);

    const { data: leads, error } = await q;
    if (error) {
        console.error("query failed:", error);
        process.exit(1);
    }

    const rows = (leads || []) as unknown as FbLead[];
    console.log(`Found ${rows.length} meta-lead-ad rows`);

    // Already-enrolled set: pull every email that has fb_nurture rows in
    // scheduled_emails. Cheap one-query dedup vs hitting it per-lead.
    const { data: enrolledRows } = await sb
        .from("scheduled_emails")
        .select("email_address")
        .eq("sequence_key", "fb_nurture");
    const enrolled = new Set((enrolledRows || []).map((r: { email_address: string }) => r.email_address.toLowerCase()));
    console.log(`Already enrolled: ${enrolled.size}`);

    let candidates = 0, skipBadEmail = 0, skipGibberish = 0, skipDup = 0, enqueued = 0;
    const now = Date.now();
    const insertBatch: Record<string, unknown>[] = [];

    for (const lead of rows) {
        const email = lead.email.trim().toLowerCase();
        if (enrolled.has(email)) { skipDup++; continue; }
        if (checkEmailShape(email)) { skipBadEmail++; continue; }
        if (looksGibberishName(lead.first_name, lead.last_name, lead.company)) { skipGibberish++; continue; }
        candidates++;

        const fullName = [lead.first_name, lead.last_name].filter(Boolean).join(" ") || null;
        for (const step of NURTURE_SEQUENCE) {
            insertBatch.push({
                user_profile_id: null,
                email_address: email,
                contact_name: fullName,
                template_key: step.key,
                sequence_key: "fb_nurture",
                scheduled_for: new Date(now + step.day_offset * 86400000).toISOString(),
                status: "pending",
            });
        }
        enqueued++;
    }

    console.log("");
    console.log(`Candidates:        ${candidates}`);
    console.log(`Skip duplicate:    ${skipDup}`);
    console.log(`Skip bad email:    ${skipBadEmail}`);
    console.log(`Skip gibberish:    ${skipGibberish}`);
    console.log(`Total rows to insert: ${insertBatch.length}  (${enqueued} leads × 12 emails)`);

    if (dryRun) {
        console.log("\n[dry-run] No rows inserted.");
        return;
    }

    if (insertBatch.length === 0) {
        console.log("Nothing to enqueue.");
        return;
    }

    // Insert in chunks of 200 to stay polite under Supabase's payload size.
    const CHUNK = 200;
    let inserted = 0;
    for (let i = 0; i < insertBatch.length; i += CHUNK) {
        const slice = insertBatch.slice(i, i + CHUNK);
        const { error: insErr } = await sb.from("scheduled_emails").insert(slice);
        if (insErr) {
            console.error(`Insert chunk ${i / CHUNK + 1} failed:`, insErr.message);
        } else {
            inserted += slice.length;
        }
    }
    console.log(`\nEnqueued ${inserted}/${insertBatch.length} rows.`);
}

main().catch(e => { console.error(e); process.exit(1); });
