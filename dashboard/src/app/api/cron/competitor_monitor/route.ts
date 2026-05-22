import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { analyzeCompany } from "@/lib/crawler";

export const maxDuration = 300;

function getAdmin() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
    );
}

/**
 * Weekly competitor monitoring cron.
 * For each client_competitor with a website:
 * 1. Crawl the website for changes (services, leadership, social)
 * 2. Check SAM.gov for recent awards to this competitor
 * 3. Update crawl_data + last_analyzed_at
 *
 * Schedule: Weekly Sunday 7am UTC
 */
export async function GET(req: NextRequest) {
    const authHeader = req.headers.get("authorization");
    if (process.env.CRON_SECRET) {
        const expectedCron = `Bearer ${process.env.CRON_SECRET}`;
        const expectedSvc = process.env.SUPABASE_SERVICE_KEY ? `Bearer ${process.env.SUPABASE_SERVICE_KEY}` : null;
        if (authHeader !== expectedCron && authHeader !== expectedSvc) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
    }

    try {
        const admin = getAdmin();
        const startTime = Date.now();

        // Get all competitors with websites that haven't been crawled in 7+ days
        const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
        const { data: competitors } = await admin
            .from("client_competitors")
            .select("id, competitor_name, website, uei, user_profile_id, crawl_data")
            .not("website", "is", null)
            .or(`last_analyzed_at.is.null,last_analyzed_at.lt.${sevenDaysAgo}`)
            .limit(10); // Max 10 per run to stay within time budget

        if (!competitors || competitors.length === 0) {
            return NextResponse.json({ success: true, message: "No competitors to crawl", crawled: 0 });
        }

        let crawled = 0;
        const results: Array<{ name: string; changes: string[] }> = [];

        for (const comp of competitors) {
            // Check time budget
            if (Date.now() - startTime > 240_000) break;

            try {
                const crawlResult = await analyzeCompany(comp.competitor_name, comp.website);
                if (!crawlResult.success || !crawlResult.data) continue;

                const newData = crawlResult.data;
                const oldData = (comp.crawl_data || {}) as Record<string, unknown>;
                const changes: string[] = [];

                // Detect changes
                const oldServices = (oldData.services as string[]) || [];
                const newServices = newData.services || [];
                const addedServices = newServices.filter(s => !oldServices.includes(s));
                if (addedServices.length > 0) changes.push(`New services: ${addedServices.join(", ")}`);

                const oldLeadership = ((oldData.leadership as Array<{ name: string }>) || []).map(l => l.name);
                const newLeadership = (newData.leadership || []).map(l => l.name);
                const newLeaders = newLeadership.filter(n => !oldLeadership.includes(n));
                if (newLeaders.length > 0) changes.push(`New leadership: ${newLeaders.join(", ")}`);

                // Check USASpending for recent awards to this competitor
                if (comp.uei) {
                    try {
                        const usaRes = await fetch("https://api.usaspending.gov/api/v2/search/spending_by_award/", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                filters: {
                                    recipient_search_text: [comp.uei],
                                    time_period: [{ start_date: sevenDaysAgo.split("T")[0], end_date: new Date().toISOString().split("T")[0] }],
                                    award_type_codes: ["A", "B", "C", "D"],
                                },
                                fields: ["Award ID", "Award Amount", "Awarding Agency", "Description"],
                                limit: 10, page: 1,
                            }),
                            signal: AbortSignal.timeout(10000),
                        });
                        if (usaRes.ok) {
                            const usaData = await usaRes.json();
                            const recentAwards = (usaData.results || []) as Array<Record<string, unknown>>;
                            if (recentAwards.length > 0) {
                                changes.push(`${recentAwards.length} new federal awards detected`);
                            }
                        }
                    } catch { /* USASpending timeout */ }
                }

                // Update competitor record
                await admin.from("client_competitors").update({
                    crawl_data: {
                        services: newData.services,
                        leadership: newData.leadership,
                        contacts: newData.contacts,
                        social_links: newData.social_links,
                        certifications: newData.certifications,
                        employee_signals: newData.employee_signals,
                        description: newData.description,
                    },
                    last_analyzed_at: new Date().toISOString(),
                    description: newData.description?.substring(0, 500) || comp.competitor_name,
                    employee_count: newData.employee_signals?.estimate ? `~${newData.employee_signals.estimate}` : undefined,
                }).eq("id", comp.id);

                // Log if changes detected
                if (changes.length > 0) {
                    await admin.from("client_activity_log").insert({
                        user_profile_id: comp.user_profile_id,
                        action: "competitor_change_detected",
                        description: `Changes detected for ${comp.competitor_name}: ${changes.join("; ")}`,
                        metadata: { competitor_id: comp.id, changes },
                    });
                }

                results.push({ name: comp.competitor_name, changes });
                crawled++;
            } catch { /* skip on error */ }
        }

        return NextResponse.json({ success: true, crawled, results });
    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
