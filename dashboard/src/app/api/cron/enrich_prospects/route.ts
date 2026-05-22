import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { analyzeCompany } from "@/lib/crawler";

export const maxDuration = 300;

/**
 * Cron: enrich pending outreach prospects with website-scraped contact info.
 *
 * Schedule: daily 07:00 UTC (after discover_new_prospects at 05:30).
 * Picks approved prospects that lack primary_email, crawls their website,
 * extracts emails + leadership. Skips prospects without a website.
 *
 * Budget: batch of 25 per run; each website ~5-15s, so ~5-7min per batch.
 * We intentionally process APPROVED-only (not pending_review) so humans
 * gate email scraping before we do it — a polite default that avoids
 * burning the crawler on prospects we won't contact.
 */
export async function GET(req: NextRequest) {
    const auth = req.headers.get("authorization");
    if (process.env.CRON_SECRET) {
        const expectedCron = `Bearer ${process.env.CRON_SECRET}`;
        const expectedSvc = process.env.SUPABASE_SERVICE_KEY ? `Bearer ${process.env.SUPABASE_SERVICE_KEY}` : null;
        if (auth !== expectedCron && auth !== expectedSvc) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
    }

    const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );

    const batchSize = Math.min(50, parseInt(req.nextUrl.searchParams.get("limit") || "25", 10));

    // Target: approved prospects with a website, no primary_email yet, and
    // either never-enriched or enriched >30 days ago.
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000).toISOString();
    const { data: targets } = await admin
        .from("outreach_prospects")
        .select("id, company_name, website, uei")
        .eq("status", "approved")
        .is("primary_email", null)
        .not("website", "is", null)
        .or(`enriched_at.is.null,enriched_at.lt.${thirtyDaysAgo}`)
        .order("match_score", { ascending: false })
        .limit(batchSize);

    const rows = (targets || []) as Array<{ id: string; company_name: string; website: string | null; uei: string | null }>;
    if (rows.length === 0) {
        return NextResponse.json({ processed: 0, note: "no prospects need enrichment" });
    }

    const stats = { processed: 0, hit: 0, miss: 0, errors: 0 };

    for (const row of rows) {
        if (!row.website) continue;
        try {
            const crawl = await analyzeCompany(row.company_name, row.website);
            if (!crawl.success) {
                await admin.from("outreach_prospects")
                    .update({ enriched_at: new Date().toISOString() })
                    .eq("id", row.id);
                stats.errors++;
                stats.processed++;
                continue;
            }

            const cd = crawl.data as unknown as Record<string, unknown>;
            const contacts = (cd.contacts as Array<{ email?: string; phone?: string }>) || [];
            const leadership = (cd.leadership as Array<{ name?: string; title?: string; email?: string; phone?: string }>) || [];

            // Email priority: leadership email > first contact email. Phones similar.
            // We skip generic addresses (info@, sales@) unless no other option.
            const allEmails = [
                ...leadership.map(l => ({ email: l.email, name: l.name, title: l.title, phone: l.phone })),
                ...contacts.map(c => ({ email: c.email, name: undefined, title: undefined, phone: c.phone })),
            ].filter(e => e.email);

            const personal = allEmails.find(e => !!e.email && !/^(info|sales|contact|hello|admin|support|team|careers|press|media)@/i.test(e.email));
            const chosen = personal || allEmails[0];

            if (chosen?.email) {
                await admin.from("outreach_prospects")
                    .update({
                        primary_email: chosen.email,
                        primary_name: chosen.name || null,
                        primary_title: chosen.title || null,
                        primary_phone: chosen.phone || null,
                        enriched_at: new Date().toISOString(),
                    })
                    .eq("id", row.id);
                stats.hit++;
            } else {
                await admin.from("outreach_prospects")
                    .update({ enriched_at: new Date().toISOString() })
                    .eq("id", row.id);
                stats.miss++;
            }
            stats.processed++;
        } catch {
            stats.errors++;
        }
    }

    return NextResponse.json({ ...stats, batch: rows.length });
}
