import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 300;

function getSupabase() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!
    );
}

const GRANTS_API_URL = "https://api.simpler.grants.gov/v1/opportunities/search";
const GRANTS_API_KEY = "fEjsOtXsDOOQIqtLwHXXu6CCV";

// Map Grants.gov categories to approximate NAICS codes for matching
const CATEGORY_NAICS_MAP: Record<string, string> = {
    "recovery_act": "541990",
    "agriculture": "111000",
    "arts": "711000",
    "business_and_commerce": "541611",
    "community_development": "925120",
    "consumer_protection": "541990",
    "disaster_prevention_and_relief": "922190",
    "education": "611710",
    "employment_labor_and_training": "611430",
    "energy": "221100",
    "environment": "541620",
    "food_and_nutrition": "311000",
    "health": "621999",
    "housing": "925110",
    "humanities": "711000",
    "information_technology": "541512",
    "infrastructure": "237310",
    "income_security_and_social_services": "624190",
    "law_justice_and_legal_services": "541110",
    "natural_resources": "113000",
    "opportunity_zone_benefits": "925120",
    "regional_development": "925120",
    "science_technology_and_other_research_and_development": "541710",
    "transportation": "488999",
    "affordable_care_act": "621999",
    "other": "541990",
};

// Map Grants.gov applicant types to set-aside descriptions
function detectSetAside(applicantTypes: string[]): string | null {
    const types = applicantTypes.map(t => t.toLowerCase());
    if (types.some(t => t.includes("small_business"))) return "Small Business";
    if (types.some(t => t.includes("minority"))) return "Small Disadvantaged Business";
    if (types.some(t => t.includes("nonprofits"))) return "Nonprofit";
    return null;
}

interface GrantOpportunity {
    opportunity_id: number;
    opportunity_number?: string;
    opportunity_title?: string;
    agency?: string;
    agency_code?: string;
    opportunity_status?: string;
    summary?: {
        summary_description?: string;
        post_date?: string;
        close_date?: string;
        close_date_description?: string;
        archive_date?: string;
        estimated_total_program_funding?: number;
        expected_number_of_awards?: number;
        award_floor?: number;
        award_ceiling?: number;
        applicant_types?: string[];
        funding_categories?: string[];
        funding_instruments?: string[];
        agency_name?: string;
    };
    category?: string;
    opportunity_assistance_listings?: Array<{
        assistance_listing_number?: string;
        program_title?: string;
    }>;
}

function computeGrantStatus(grant: GrantOpportunity): string {
    const status = (grant.opportunity_status || "").toLowerCase();
    if (status === "closed" || status === "archived") return "EXPIRED";
    if (status === "forecasted") return "SEARCH_SEED";

    const closeDate = grant.summary?.close_date;
    if (closeDate) {
        try {
            const deadline = new Date(closeDate);
            const now = new Date();
            if (deadline < now) return "EXPIRED";
            if (deadline < new Date(now.getTime() + 7 * 86400000)) return "EXPIRING_SOON";
        } catch { /* ignore */ }
    }

    return "ACTIVE";
}

/**
 * Daily cron: Ingest grants from Simpler.Grants.gov
 *
 * Stores grants into the opportunities table with notice_type = 'Grant'
 * so the existing scoring engine automatically picks them up.
 * Notice IDs are prefixed with GRANT- to avoid collisions with SAM.gov IDs.
 *
 * Schedule: 0 3 * * * (03:00 UTC daily, after SAM ingest)
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
        const supabase = getSupabase();
        const startTime = Date.now();
        console.log("Starting Grants.gov Ingestion (daily)...");

        // Pre-load valid FK codes for NAICS
        const { data: naicsRows } = await supabase.from("naics_codes").select("code");
        const validNaics = new Set((naicsRows || []).map((r: { code: string }) => r.code));

        let totalProcessed = 0;
        let totalUpserted = 0;
        const pageSize = 25;
        const maxPages = 40; // Cap at 1000 grants per run

        // Search for grants posted or forecasted
        const statuses = ["posted", "forecasted"];

        for (const status of statuses) {
            console.log(`Fetching grants with status: ${status}`);
            let pageOffset = 1;
            let hasMore = true;

            while (hasMore && pageOffset <= maxPages) {
                // Check time limit (leave 30s buffer)
                if (Date.now() - startTime > 250_000) {
                    console.log(`Time limit approaching. Stopping at page ${pageOffset}.`);
                    hasMore = false;
                    break;
                }

                // Build search body - filter by post date in last 7 days
                const sevenDaysAgo = new Date();
                sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

                const searchBody = {
                    pagination: {
                        page_offset: pageOffset,
                        page_size: pageSize,
                        order_by: "post_date",
                        sort_direction: "descending",
                    },
                    filters: {
                        opportunity_status: { one_of: [status] },
                        post_date: {
                            start_date: sevenDaysAgo.toISOString().split("T")[0],
                            end_date: new Date().toISOString().split("T")[0],
                        },
                    },
                };

                let res: Response;
                try {
                    res = await fetch(GRANTS_API_URL, {
                        method: "POST",
                        headers: {
                            "X-Api-Key": GRANTS_API_KEY,
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify(searchBody),
                        signal: AbortSignal.timeout(30000),
                    });
                } catch (fetchErr) {
                    console.error(`Grants API fetch error (page ${pageOffset}):`, fetchErr);
                    break;
                }

                if (!res.ok) {
                    console.error(`Grants API Error: ${res.status} ${res.statusText}`);
                    const body = await res.text().catch(() => "");
                    console.error(`Response body: ${body.slice(0, 500)}`);
                    break;
                }

                const data = await res.json();
                const grants: GrantOpportunity[] = data.data || [];

                if (grants.length === 0) {
                    hasMore = false;
                    break;
                }

                totalProcessed += grants.length;

                // Transform grants into opportunities table format
                const payload = grants
                    .filter(g => g.opportunity_id)
                    .map(g => {
                        const summary = g.summary || {};
                        const categories = summary.funding_categories || [];
                        const firstCategory = categories[0] || g.category || "";

                        // Derive NAICS from category mapping
                        const mappedNaics = CATEGORY_NAICS_MAP[firstCategory.toLowerCase()] || null;
                        const naicsCode = mappedNaics && validNaics.has(mappedNaics) ? mappedNaics : null;

                        // Compute estimated value from funding data
                        const estimatedValue = summary.award_ceiling
                            || summary.estimated_total_program_funding
                            || null;

                        const grantStatus = computeGrantStatus(g);
                        const applicantTypes = summary.applicant_types || [];
                        const setAside = detectSetAside(applicantTypes);

                        // Build CFDA reference from assistance listings
                        const cfdaRef = (g.opportunity_assistance_listings || [])
                            .map(a => `${a.assistance_listing_number || ""}: ${a.program_title || ""}`)
                            .filter(s => s.length > 2)
                            .join("; ");

                        // Build description
                        const descParts = [
                            summary.summary_description || "",
                            cfdaRef ? `\n\nCFDA: ${cfdaRef}` : "",
                            categories.length ? `\nCategories: ${categories.join(", ")}` : "",
                            summary.expected_number_of_awards ? `\nExpected Awards: ${summary.expected_number_of_awards}` : "",
                            summary.award_floor ? `\nAward Floor: $${summary.award_floor.toLocaleString()}` : "",
                            summary.award_ceiling ? `\nAward Ceiling: $${summary.award_ceiling.toLocaleString()}` : "",
                        ].filter(Boolean).join("");

                        return {
                            notice_id: `GRANT-${g.opportunity_id}`,
                            title: g.opportunity_title || null,
                            description: descParts || null,
                            agency: summary.agency_name || g.agency || null,
                            sub_agency: null,
                            office: null,
                            organization_code: g.agency_code || null,
                            naics_code: naicsCode,
                            psc_code: null,
                            set_aside_code: setAside,
                            notice_type: "Grant",
                            posted_date: summary.post_date
                                ? new Date(summary.post_date).toISOString()
                                : null,
                            response_deadline: summary.close_date
                                ? new Date(summary.close_date).toISOString()
                                : null,
                            solicitation_number: g.opportunity_number || null,
                            estimated_value: estimatedValue ? Number(estimatedValue) : null,
                            link: `https://www.grants.gov/search-results-detail/${g.opportunity_id}`,
                            priority_flag: false,
                            is_archived: ["EXPIRED"].includes(grantStatus),
                            raw_json: g,
                            // Strategic fields
                            status: grantStatus,
                            veteran_relevance_flag: false,
                            small_business_relevance_flag: setAside !== null,
                            wosb_relevance_flag: false,
                            sources_sought_flag: grantStatus === "SEARCH_SEED",
                            last_crawled_at: new Date().toISOString(),
                            retention_protected: false,
                            retention_reason: null,
                        };
                    });

                if (payload.length > 0) {
                    const { error: dbError } = await supabase
                        .from("opportunities")
                        .upsert(payload, { onConflict: "notice_id", ignoreDuplicates: false });

                    if (dbError) {
                        console.error(`DB Error (page ${pageOffset}): ${dbError.message}`);
                        // Fallback: strip newer columns
                        const NEW_COLS = [
                            "sub_agency", "office", "estimated_value", "status",
                            "veteran_relevance_flag", "small_business_relevance_flag",
                            "wosb_relevance_flag", "sources_sought_flag",
                            "last_crawled_at", "retention_protected", "retention_reason",
                        ];
                        const fallback = payload.map(row => {
                            const clean: Record<string, unknown> = {};
                            for (const [k, v] of Object.entries(row)) {
                                if (!NEW_COLS.includes(k)) clean[k] = v;
                            }
                            return clean;
                        });
                        const { error: fallbackErr } = await supabase
                            .from("opportunities")
                            .upsert(fallback, { onConflict: "notice_id", ignoreDuplicates: true });
                        if (fallbackErr) {
                            console.error(`Fallback also failed: ${fallbackErr.message}`);
                        }
                    }

                    totalUpserted += payload.length;
                }

                // Move to next page
                pageOffset++;
                if (grants.length < pageSize) hasMore = false;
            }
        }

        const elapsed = Math.round((Date.now() - startTime) / 1000);
        console.log(`Grants.gov Ingestion Complete. Processed: ${totalProcessed}. Upserted: ${totalUpserted}. Time: ${elapsed}s`);

        return NextResponse.json({
            success: true,
            source: "grants.gov",
            processed: totalProcessed,
            upserted: totalUpserted,
            elapsed_seconds: elapsed,
        });

    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Fatal Error";
        console.error("Fatal Grants.gov Ingestion Error:", e);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
