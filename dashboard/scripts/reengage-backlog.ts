/**
 * Re-engage past leads (one-off, NOT a recurring sequence).
 *
 * Three cohorts, three templates. Each cohort has a different gating logic
 * around who qualifies:
 *
 *   biz_fb     — marketing_leads source='meta-lead-ad' + business-email
 *                domain + passes the gibberish-name check.
 *                Template: reengage_biz_fb
 *
 *   freemail_fb — marketing_leads source='meta-lead-ad' + free-email domain
 *                (gmail / yahoo / ISP). Soft three-door upgrade prompt.
 *                Template: reengage_freemail_fb
 *
 *   qc          — company_analyses status='complete' + lead_email + passes
 *                gibberish check. References their past scan.
 *                Template: reengage_qc
 *
 * Delivery verification: after every send we record the Resend ID, then
 * (optionally) re-query each ID a few seconds later to surface the actual
 * delivered/bounced status before the user commits to the full rollout.
 *
 * Idempotency: writes one row per send into a small reengage_sends table
 * (see migration in this commit). If --cohort biz_fb is re-run, recipients
 * already in that table with status='delivered' or 'sent' are skipped.
 *
 * Usage:
 *   cd dashboard
 *   set -a; source .env.vercel.production; set +a
 *   npx tsx scripts/reengage-backlog.ts --cohort biz_fb --limit 5      # smoke
 *   npx tsx scripts/reengage-backlog.ts --cohort biz_fb                # all
 *   npx tsx scripts/reengage-backlog.ts --cohort biz_fb --dry-run      # count only
 *   npx tsx scripts/reengage-backlog.ts --cohort freemail_fb --limit 5
 *   npx tsx scripts/reengage-backlog.ts --cohort qc --limit 5
 */

import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { NURTURE_TEMPLATES } from "../src/lib/email-nurture-templates";
import { looksGibberishName, looksFreeEmailDomain, checkEmailShape } from "../src/lib/lead-validation";

type Cohort = "biz_fb" | "freemail_fb" | "qc";

const TEMPLATE_BY_COHORT: Record<Cohort, string> = {
    biz_fb: "reengage_biz_fb",
    freemail_fb: "reengage_freemail_fb",
    qc: "reengage_qc",
};

const FROM = process.env.EMAIL_FROM || "André @ CapturePilot <hello@capturepilot.com>";

interface Recipient {
    email: string;
    firstName: string;
    lastName: string;
    company: string | null;
    sourceTable: string;
    sourceId: string;
}

async function loadRecipients(
    sb: ReturnType<typeof createClient>,
    cohort: Cohort,
): Promise<Recipient[]> {
    if (cohort === "biz_fb" || cohort === "freemail_fb") {
        const { data, error } = await sb
            .from("marketing_leads")
            .select("id, email, first_name, last_name, company")
            .eq("source", "meta-lead-ad")
            .not("email", "is", null)
            .order("created_at", { ascending: false });
        if (error) throw new Error(`query failed: ${error.message}`);
        const rows = (data || []) as unknown as Array<{
            id: string; email: string; first_name: string | null; last_name: string | null; company: string | null;
        }>;

        return rows
            .map(r => ({
                email: r.email.trim().toLowerCase(),
                firstName: r.first_name?.trim() || "",
                lastName: r.last_name?.trim() || "",
                company: r.company,
                sourceTable: "marketing_leads",
                sourceId: r.id,
            }))
            .filter(r => !checkEmailShape(r.email))
            .filter(r => !looksGibberishName(r.firstName, r.lastName, r.company))
            .filter(r => cohort === "biz_fb"
                ? !looksFreeEmailDomain(r.email)
                : looksFreeEmailDomain(r.email),
            );
    }

    // qc cohort — name lives only in inferred_profile.contact_person
    // (company_analyses has no lead_name column).
    const { data, error } = await sb
        .from("company_analyses")
        .select("id, lead_email, inferred_profile, company_name")
        .eq("status", "complete")
        .not("lead_email", "is", null)
        .order("updated_at", { ascending: false });
    if (error) throw new Error(`query failed: ${error.message}`);
    const rows = (data || []) as unknown as Array<{
        id: string; lead_email: string;
        inferred_profile: Record<string, unknown> | null;
        company_name: string | null;
    }>;

    return rows
        .map(r => {
            const cp = (r.inferred_profile?.contact_person || {}) as Record<string, unknown>;
            const fullName = (cp.name as string) || "";
            const first = (cp.first_name as string) || fullName.trim().split(/\s+/)[0] || "";
            const last = (cp.last_name as string) || fullName.trim().split(/\s+/).slice(1).join(" ") || "";
            return {
                email: r.lead_email.trim().toLowerCase(),
                firstName: first || "",
                lastName: last || "",
                company: r.company_name,
                sourceTable: "company_analyses",
                sourceId: r.id,
            };
        })
        .filter(r => !checkEmailShape(r.email))
        .filter(r => !looksGibberishName(r.firstName, r.lastName, r.company));
}

interface SendResult {
    email: string;
    resendId: string | null;
    error?: string;
}

async function sendOne(resend: Resend, templateKey: string, r: Recipient): Promise<SendResult> {
    const tmpl = NURTURE_TEMPLATES[templateKey];
    if (!tmpl) return { email: r.email, resendId: null, error: `Template ${templateKey} not found` };

    const firstName = r.firstName || "there";
    const html = tmpl.html
        .replace(/\{\{\s*first_name\s*\}\}/g, firstName)
        .replace(/\{\{\s*email_used\s*\}\}/g, r.email)
        .replace(/\{\{\s*unsubscribe_url\s*\}\}/g, `https://app.capturepilot.com/unsubscribe?email=${encodeURIComponent(r.email)}`);
    const subject = tmpl.subject.replace(/\{\{\s*first_name\s*\}\}/g, firstName);

    try {
        const res = await resend.emails.send({ from: FROM, to: r.email, subject, html });
        if (res.error) return { email: r.email, resendId: null, error: res.error.message };
        return { email: r.email, resendId: res.data?.id || null };
    } catch (err) {
        return { email: r.email, resendId: null, error: (err as Error).message };
    }
}

async function verifyDelivery(resend: Resend, resendId: string): Promise<string> {
    try {
        // The resend.emails.get() returns: {data: {object: "email", id, ..., last_event: "delivered"|"sent"|"bounced"|...}}
        const res = await resend.emails.get(resendId);
        const status = (res.data as unknown as { last_event?: string } | null)?.last_event;
        return status || "unknown";
    } catch (err) {
        return `error: ${(err as Error).message.slice(0, 60)}`;
    }
}

async function recordSend(
    sb: ReturnType<typeof createClient>,
    cohort: Cohort,
    templateKey: string,
    r: Recipient,
    result: SendResult,
    status: string,
): Promise<void> {
    const { error } = await sb.from("reengage_sends").insert({
        cohort,
        template_key: templateKey,
        email: r.email,
        source_table: r.sourceTable,
        source_id: r.sourceId,
        resend_id: result.resendId,
        status: result.error ? "failed" : status,
        error_message: result.error || null,
    });
    if (error) console.warn(`[recordSend] DB insert failed for ${r.email}:`, error.message);
}

async function alreadySent(
    sb: ReturnType<typeof createClient>,
    cohort: Cohort,
    email: string,
    excludeOtherCohorts: boolean,
): Promise<boolean> {
    // Default (smoke-test) mode: only dedup within the SAME cohort.
    // --exclude-other-cohorts (full-rollout mode): dedup across ALL cohorts so
    // a recipient already touched by a higher-priority cohort is skipped here.
    let q = sb
        .from("reengage_sends")
        .select("id", { count: "exact", head: true })
        .eq("email", email)
        .neq("status", "failed");
    if (!excludeOtherCohorts) {
        q = q.eq("cohort", cohort);
    }
    const { count } = await q;
    return (count || 0) > 0;
}

async function main() {
    const args = process.argv.slice(2);
    const cohortArg = args.indexOf("--cohort");
    const cohort = (cohortArg >= 0 ? args[cohortArg + 1] : "") as Cohort;
    if (!["biz_fb", "freemail_fb", "qc"].includes(cohort)) {
        console.error("--cohort must be one of: biz_fb, freemail_fb, qc");
        process.exit(1);
    }
    const limitArg = args.indexOf("--limit");
    const limit = limitArg >= 0 ? parseInt(args[limitArg + 1] || "0", 10) : 0;
    const dryRun = args.includes("--dry-run");
    const excludeOtherCohorts = args.includes("--exclude-other-cohorts");

    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );
    const resend = new Resend(process.env.RESEND_API_KEY!);
    const templateKey = TEMPLATE_BY_COHORT[cohort];

    console.log(`Cohort:       ${cohort}`);
    console.log(`Template:     ${templateKey}`);
    console.log(`Limit:        ${limit > 0 ? limit : "ALL"}`);
    console.log(`Dry-run:      ${dryRun ? "YES (no sends)" : "no"}`);
    console.log(`Cross-cohort: ${excludeOtherCohorts ? "EXCLUDE recipients already sent in OTHER cohorts" : "within-cohort dedup only"}`);
    console.log("");

    const candidates = await loadRecipients(sb, cohort);
    console.log(`Found ${candidates.length} candidates after validation`);

    // Dedup against prior sends
    const fresh: Recipient[] = [];
    for (const c of candidates) {
        if (await alreadySent(sb, cohort, c.email, excludeOtherCohorts)) continue;
        fresh.push(c);
        if (limit > 0 && fresh.length >= limit) break;
    }
    console.log(`After dedup against prior sends: ${fresh.length}`);

    if (dryRun) {
        console.log("\n[dry-run] No sends. Recipients:");
        fresh.forEach((r, i) => console.log(`  ${i + 1}. ${r.email}  (${r.firstName} ${r.lastName})`));
        return;
    }

    if (fresh.length === 0) {
        console.log("Nothing to send.");
        return;
    }

    console.log("");
    const results: Array<{ r: Recipient; result: SendResult }> = [];
    for (const r of fresh) {
        const result = await sendOne(resend, templateKey, r);
        results.push({ r, result });
        const tag = result.resendId ? `✓ ${result.resendId}` : `✗ ${result.error}`;
        console.log(`  ${tag.padEnd(45)} ${r.email}  (${r.firstName})`);
        // Polite 800ms throttle to stay well under Resend's 2/sec ceiling
        await new Promise(res => setTimeout(res, 800));
    }

    // Verify delivery 10s later for the smoke-test batch (<=10 recipients)
    if (results.length <= 10) {
        console.log("\nWaiting 12s before checking delivery status…");
        await new Promise(res => setTimeout(res, 12000));
        console.log("");
        for (const { r, result } of results) {
            if (!result.resendId) {
                await recordSend(sb, cohort, templateKey, r, result, "failed");
                continue;
            }
            const status = await verifyDelivery(resend, result.resendId);
            console.log(`  ${status.padEnd(15)} ${r.email}  (id: ${result.resendId.slice(0, 8)}…)`);
            await recordSend(sb, cohort, templateKey, r, result, status);
        }
    } else {
        // Large batch: just record as "sent" — full delivery audit in dashboard later
        for (const { r, result } of results) {
            await recordSend(sb, cohort, templateKey, r, result, result.resendId ? "sent" : "failed");
        }
    }

    const ok = results.filter(x => x.result.resendId).length;
    const failed = results.length - ok;
    console.log("");
    console.log(`Done — ${ok} sent, ${failed} failed.`);
}

main().catch(e => { console.error(e); process.exit(1); });
