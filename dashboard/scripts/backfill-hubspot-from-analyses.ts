/**
 * Backfill HubSpot from all completed company_analyses rows.
 *
 * For each row with status='complete' AND a lead_email, push the strategic
 * brief to HubSpot using the EXACT same path as the live pipeline
 * (lib/hubspot-brief.pushQuickCheckerBriefToHubSpot). This populates the
 * new standard fields (Phase 22) + the CP custom multi-selects + the
 * company sync (Phase 21) retroactively for every analysis we already ran.
 *
 * Safe to re-run — HubSpot upsert dedupes by email; company upsert dedupes
 * by domain. Concurrency capped at 3 to stay well under HubSpot's 10 req/sec.
 *
 * Usage:
 *   cd dashboard
 *   set -a; source .env.vercel.production; set +a
 *   npx tsx scripts/backfill-hubspot-from-analyses.ts             # all
 *   npx tsx scripts/backfill-hubspot-from-analyses.ts --limit 5   # smoke test
 *   npx tsx scripts/backfill-hubspot-from-analyses.ts --id <uuid>  # single
 */

import { createClient } from "@supabase/supabase-js";
import { pushQuickCheckerBriefToHubSpot } from "../src/lib/hubspot-brief";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.capturepilot.com";
const CONCURRENCY = 3;

interface AnalysisRow {
    id: string;
    company_name: string | null;
    website: string | null;
    lead_email: string | null;
    lead_phone: string | null;
    readiness_score: number | null;
    preview_matches: unknown[] | null;
    crawl_data: Record<string, unknown> | null;
    inferred_profile: Record<string, unknown> | null;
    reconciled_profile: unknown;
    firmographics: unknown;
    status: string;
}

async function pushOne(row: AnalysisRow): Promise<{ ok: boolean; reason?: string }> {
    if (!row.lead_email) return { ok: false, reason: "no email" };
    const crawl = row.crawl_data || {};
    const inferred = row.inferred_profile || {};
    const contactPerson = inferred.contact_person as { name?: string; title?: string; phone?: string } | null;

    const top5 = (row.preview_matches || []).slice(0, 5).map((m: unknown) => {
        const x = m as Record<string, unknown>;
        return {
            title: (x.title as string) || null,
            agency: (x.agency as string) || null,
            set_aside_code: (x.set_aside_code as string) || null,
            score: x.score as number | undefined,
            eligibility: x.eligibility as "eligible" | "not_eligible_cert" | "not_eligible_size" | undefined,
            required_certifications: x.required_certifications as string[] | undefined,
            notice_id: (x.notice_id as string) || null,
        };
    });

    const res = await pushQuickCheckerBriefToHubSpot({
        email: row.lead_email,
        companyName: row.company_name || row.website || row.lead_email.split("@")[1] || "Unknown",
        contactName: (contactPerson?.name as string | null)
            || (inferred.contact_name as string | null)
            || null,
        contactPhone: contactPerson?.phone || (inferred.contact_phone as string | null) || row.lead_phone || null,
        contactJobTitle: contactPerson?.title || (inferred.job_title as string | null) || null,
        website: row.website || null,
        quickCheckerUrl: `${APP_URL}/check/${row.id}`,
        readinessScore: row.readiness_score ?? null,
        topMatches: top5,
        strengths: (crawl.strengths as string[]) || [],
        weaknesses: (crawl.weaknesses as string[]) || [],
        pitchAngles: (crawl.pitch_angles as string[]) || [],
        nailDownKeywords: (crawl.nail_down_keywords as string[]) || [],
        revenueSignal: (crawl.revenue_signal as string | null) || null,
        federalAgenciesServed: (crawl.federal_agencies_served as string[]) || [],
        reconciled: row.reconciled_profile as Parameters<typeof pushQuickCheckerBriefToHubSpot>[0]["reconciled"],
        naicsCodes: (inferred.naics_codes as string[]) || [],
        firmographics: row.firmographics as Parameters<typeof pushQuickCheckerBriefToHubSpot>[0]["firmographics"],
    });

    if (res.skipped_reason) return { ok: false, reason: res.skipped_reason };
    if (!res.contact_id) return { ok: false, reason: "no contact id" };
    return { ok: true };
}

async function main() {
    const args = process.argv.slice(2);
    const limitArg = args.indexOf("--limit");
    const limit = limitArg >= 0 ? parseInt(args[limitArg + 1] || "0", 10) || 0 : 0;
    const idArg = args.indexOf("--id");
    const singleId = idArg >= 0 ? args[idArg + 1] : null;

    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );

    let query = sb
        .from("company_analyses")
        .select("id, company_name, website, lead_email, lead_phone, readiness_score, preview_matches, crawl_data, inferred_profile, reconciled_profile, firmographics, status")
        .eq("status", "complete")
        .not("lead_email", "is", null)
        .order("updated_at", { ascending: false });
    if (singleId) query = query.eq("id", singleId);
    if (limit > 0) query = query.limit(limit);

    const { data, error } = await query;
    if (error) {
        console.error("query failed:", error);
        process.exit(1);
    }
    const rows = (data || []) as AnalysisRow[];
    console.log(`Found ${rows.length} completed analyses with lead_email`);
    if (rows.length === 0) return;

    let done = 0, failed = 0;
    const queue = [...rows];
    const workers: Promise<void>[] = [];

    for (let w = 0; w < CONCURRENCY; w++) {
        workers.push((async () => {
            while (queue.length > 0) {
                const next = queue.shift();
                if (!next) continue;
                try {
                    const res = await pushOne(next);
                    if (res.ok) {
                        done++;
                        console.log(`  ✓ ${next.id.slice(0, 8)}  ${(next.company_name || "").slice(0, 40)}  <${next.lead_email}>`);
                    } else {
                        failed++;
                        console.log(`  ✗ ${next.id.slice(0, 8)}  ${(next.company_name || "").slice(0, 40)}  — ${res.reason}`);
                    }
                } catch (err) {
                    failed++;
                    console.error(`  ✗ ${next.id.slice(0, 8)}  exception:`, err instanceof Error ? err.message : err);
                }
                // gentle 200ms gap to stay under HubSpot rate limits
                await new Promise(r => setTimeout(r, 200));
            }
        })());
    }
    await Promise.all(workers);

    console.log(`\nDone — ${done} pushed, ${failed} failed.`);
}

main().catch(e => { console.error(e); process.exit(1); });
