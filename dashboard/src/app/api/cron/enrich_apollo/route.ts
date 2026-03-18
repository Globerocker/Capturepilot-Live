import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 300;

function getSupabase() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!
    );
}

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

interface ApolloOrg {
    name?: string;
    website_url?: string;
    linkedin_url?: string;
    facebook_url?: string;
    twitter_url?: string;
    phone?: string;
    primary_phone?: { number?: string };
    estimated_num_employees?: number;
    annual_revenue?: number;
    founded_year?: number;
    industry?: string;
    city?: string;
    state?: string;
}

export async function GET(req: NextRequest) {
    const authHeader = req.headers.get("authorization");
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const APOLLO_API_KEY = process.env.APOLLO_API_KEY;
    if (!APOLLO_API_KEY) {
        return NextResponse.json({ error: "APOLLO_API_KEY not configured" }, { status: 500 });
    }

    try {
        const supabase = getSupabase();
        console.log("Starting Apollo contractor enrichment...");

        // Fetch contractors that haven't been enriched yet
        const { data: contractors, error: fetchError } = await supabase
            .from("contractors")
            .select("id, company_name, uei, cage_code, website_url, email, phone")
            .eq("apollo_enriched", false)
            .limit(50);

        if (fetchError) {
            console.error("Fetch error:", fetchError);
            return NextResponse.json({ error: fetchError.message }, { status: 500 });
        }

        if (!contractors || contractors.length === 0) {
            return NextResponse.json({ success: true, message: "No contractors need enrichment", enriched: 0 });
        }

        console.log(`Found ${contractors.length} contractors to enrich`);

        let enriched = 0;
        let failed = 0;
        let skipped = 0;

        for (let i = 0; i < contractors.length; i++) {
            const contractor = contractors[i];
            const companyName = contractor.company_name;

            if (!companyName || companyName.length < 3) {
                skipped++;
                continue;
            }

            try {
                // Step 1: Search for company via Apollo mixed_companies/search
                const searchRes = await fetch("https://api.apollo.io/api/v1/mixed_companies/search", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "X-Api-Key": APOLLO_API_KEY,
                    },
                    body: JSON.stringify({
                        organization_name: companyName,
                        page: 1,
                        per_page: 1,
                    }),
                });

                if (searchRes.status === 401 || searchRes.status === 403) {
                    console.error("Apollo API key invalid. Stopping enrichment.");
                    return NextResponse.json({
                        success: false,
                        error: "Apollo API authentication failed",
                        enriched, failed, skipped
                    }, { status: 500 });
                }

                if (!searchRes.ok) {
                    failed++;
                    if (i < 5) console.error(`Apollo search failed for "${companyName}": ${searchRes.status}`);
                    await sleep(1500);
                    continue;
                }

                const searchData = await searchRes.json();
                const orgs: ApolloOrg[] = searchData.organizations || searchData.accounts || [];

                if (orgs.length === 0) {
                    // Mark as enriched even if not found (avoid re-querying)
                    await supabase
                        .from("contractors")
                        .update({ apollo_enriched: true, last_enriched_at: new Date().toISOString() })
                        .eq("id", contractor.id);
                    skipped++;
                    await sleep(1500);
                    continue;
                }

                const org = orgs[0];

                // Step 2: If we got a domain, try organizations/enrich for deeper data
                let enrichedOrg = org;
                const domain = org.website_url ? new URL(org.website_url).hostname.replace("www.", "") : null;

                if (domain) {
                    try {
                        const enrichRes = await fetch("https://api.apollo.io/api/v1/organizations/enrich", {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                "X-Api-Key": APOLLO_API_KEY,
                            },
                            body: JSON.stringify({ domain }),
                        });

                        if (enrichRes.ok) {
                            const enrichData = await enrichRes.json();
                            if (enrichData.organization) {
                                enrichedOrg = { ...org, ...enrichData.organization };
                            }
                        }
                        await sleep(500); // Extra delay for second call
                    } catch {
                        // Use search data as fallback
                    }
                }

                // Step 3: Build update payload
                const phone = enrichedOrg.primary_phone?.number || enrichedOrg.phone || null;
                const updatePayload: Record<string, unknown> = {
                    apollo_enriched: true,
                    last_enriched_at: new Date().toISOString(),
                };

                if (enrichedOrg.website_url && !contractor.website_url) {
                    updatePayload.website_url = enrichedOrg.website_url;
                }
                if (phone && !contractor.phone) {
                    updatePayload.phone = phone;
                }
                if (enrichedOrg.linkedin_url) {
                    updatePayload.linkedin_url = enrichedOrg.linkedin_url;
                }
                if (enrichedOrg.estimated_num_employees) {
                    updatePayload.employee_count = enrichedOrg.estimated_num_employees;
                }
                if (enrichedOrg.annual_revenue) {
                    updatePayload.revenue = enrichedOrg.annual_revenue;
                }
                if (enrichedOrg.founded_year) {
                    updatePayload.founded_year = enrichedOrg.founded_year;
                }
                if (enrichedOrg.industry) {
                    updatePayload.industry = enrichedOrg.industry;
                }

                await supabase
                    .from("contractors")
                    .update(updatePayload)
                    .eq("id", contractor.id);

                enriched++;

            } catch (e: unknown) {
                failed++;
                const errMsg = e instanceof Error ? e.message : String(e);
                if (i < 5) console.error(`Error enriching "${companyName}": ${errMsg.slice(0, 100)}`);
            }

            // Progress logging
            if ((i + 1) % 10 === 0) {
                console.log(`[${i + 1}/${contractors.length}] enriched=${enriched} fail=${failed} skip=${skipped}`);
            }

            // Rate limit: 1.5s between requests
            await sleep(1500);
        }

        console.log(`Done. Enriched: ${enriched}, Failed: ${failed}, Skipped: ${skipped}`);
        return NextResponse.json({ success: true, enriched, failed, skipped });

    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Unknown error";
        console.error("Fatal Apollo enrichment error:", message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
