import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { analyzeCompany } from "@/lib/crawler";

export const maxDuration = 120;

const SAM_API_KEY = process.env.SAM_API_KEY || "";
const APOLLO_API_KEY = process.env.APOLLO_API_KEY || "";

function getAdmin() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
    );
}

/**
 * POST /api/admin/enrich-profile
 * Runs the full enrichment pipeline (same as Quick Checker) for an existing user profile.
 * Body: { user_profile_id: string }
 *
 * Steps:
 * 1. Website crawl (if website set)
 * 2. SAM.gov entity lookup (by UEI or company name)
 * 3. USASpending award history
 * 4. Apollo people enrichment for decision-maker
 * 5. Update profile with enriched data
 */
export async function POST(req: NextRequest) {
    try {
        const { user_profile_id } = await req.json();
        if (!user_profile_id) {
            return NextResponse.json({ error: "user_profile_id required" }, { status: 400 });
        }

        const admin = getAdmin();
        const { data: profile, error: profErr } = await admin
            .from("user_profiles")
            .select("*")
            .eq("id", user_profile_id)
            .single();

        if (profErr || !profile) {
            return NextResponse.json({ error: "Profile not found" }, { status: 404 });
        }

        const results: Record<string, unknown> = { enriched: [] };
        const updates: Record<string, unknown> = {};
        let uei = profile.uei as string | null;

        // --- 1. Website Crawl ---
        if (profile.website) {
            try {
                const crawlResult = await analyzeCompany(profile.company_name, profile.website);
                if (crawlResult.success && crawlResult.data) {
                    const crawl = crawlResult.data;
                    // Extract useful fields
                    if (!profile.phone && crawl.contacts?.[0]?.phone) updates.phone = crawl.contacts[0].phone;
                    if (!profile.email && crawl.contacts?.[0]?.email) updates.email = crawl.contacts[0].email;
                    if (crawl.detected_states?.[0] && !profile.state) updates.state = crawl.detected_states[0];
                    if (crawl.employee_signals?.estimate && !profile.employee_count) updates.employee_count = String(crawl.employee_signals.estimate);
                    if (crawl.founding_year && !profile.years_in_business) updates.years_in_business = new Date().getFullYear() - crawl.founding_year;
                    if (crawl.description && !profile.company_description) updates.company_description = crawl.description;

                    // Store leadership + social as metadata
                    const leadership = crawl.leadership || [];
                    const social = crawl.social_links || {};
                    if (leadership.length > 0 && !profile.contact_name) {
                        updates.contact_name = leadership[0].name;
                    }

                    (results.enriched as string[]).push("website_crawl");
                    results.services_found = crawl.services?.length || 0;
                    results.contacts_found = crawl.contacts?.length || 0;
                    results.social = social;
                }
            } catch (e) {
                results.crawl_error = (e as Error).message;
            }
        }

        // --- 2. SAM.gov Entity Lookup ---
        if (!uei && profile.company_name) {
            // Search by name to discover UEI
            try {
                const searchUrl = `https://api.sam.gov/entity-information/v3/entities?api_key=${SAM_API_KEY}&legalBusinessName=${encodeURIComponent(profile.company_name)}&registrationStatus=A`;
                const samRes = await fetch(searchUrl, { signal: AbortSignal.timeout(15000) });
                if (samRes.ok) {
                    const samData = await samRes.json();
                    const entity = samData.entityData?.[0];
                    if (entity) {
                        uei = entity.entityRegistration?.ueiSAM;
                        if (uei) {
                            updates.uei = uei;
                            (results.enriched as string[]).push("sam_uei_discovered");
                        }
                    }
                }
            } catch { /* SAM search timeout */ }
        }

        if (uei) {
            try {
                const entityUrl = `https://api.sam.gov/entity-information/v3/entities?api_key=${SAM_API_KEY}&ueiSAM=${uei}`;
                const samRes = await fetch(entityUrl, { signal: AbortSignal.timeout(15000) });
                if (samRes.ok) {
                    const samData = await samRes.json();
                    const entity = samData.entityData?.[0];
                    if (entity) {
                        const reg = entity.entityRegistration || {};
                        const core = entity.coreData || {};
                        const addr = core.physicalAddress || {};
                        const gen = core.generalInformation || {};

                        if (reg.cageCode && !profile.cage_code) updates.cage_code = reg.cageCode;
                        if (addr.stateOrProvinceCode && !profile.state) updates.state = addr.stateOrProvinceCode;
                        if (addr.city && !profile.city) updates.city = addr.city;
                        if (addr.addressLine1 && !profile.address_line_1) updates.address_line_1 = addr.addressLine1;
                        if (addr.zipCode && !profile.zip_code) updates.zip_code = addr.zipCode;

                        // Extract NAICS from SAM if richer than profile
                        const samNaics = (entity.assertions?.naicsCodeList || []).map((n: { naicsCode: string }) => n.naicsCode).filter(Boolean);
                        if (samNaics.length > (profile.naics_codes || []).length) {
                            updates.naics_codes = [...new Set([...(profile.naics_codes || []), ...samNaics])];
                        }

                        // Extract certs
                        const bizTypes = gen.businessTypes || [];
                        const certMap: Record<string, string> = {
                            "2X": "WOSB", "A2": "WOSB", "A5": "VOSB", "QF": "SDVOSB",
                            "27": "HUBZone", "A6": "8(a)", "XX": "SDB",
                        };
                        const samCerts = bizTypes.map((bt: string) => certMap[bt]).filter(Boolean);
                        if (samCerts.length > 0) {
                            updates.sba_certifications = [...new Set([...(profile.sba_certifications || []), ...samCerts])];
                        }

                        (results.enriched as string[]).push("sam_entity");
                        results.sam_uei = uei;
                        results.sam_cage = reg.cageCode;
                    }
                }
            } catch { /* SAM entity timeout */ }
        }

        // --- 3. USASpending Award History ---
        try {
            const usaRes = await fetch("https://api.usaspending.gov/api/v2/search/spending_by_award/", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    filters: {
                        recipient_search_text: [uei || profile.company_name],
                        time_period: [{ start_date: "2015-01-01", end_date: new Date().toISOString().split("T")[0] }],
                        award_type_codes: ["A", "B", "C", "D"],
                    },
                    fields: ["Award ID", "Recipient Name", "Award Amount", "Awarding Agency", "Start Date"],
                    limit: 50, page: 1, sort: "Start Date", order: "desc",
                }),
                signal: AbortSignal.timeout(15000),
            });
            if (usaRes.ok) {
                const usaData = await usaRes.json();
                const awards = usaData.results || [];
                if (awards.length > 0) {
                    const totalValue = awards.reduce((s: number, a: Record<string, unknown>) => s + (Number(a["Award Amount"]) || 0), 0);
                    const agencies = [...new Set(awards.map((a: Record<string, unknown>) => String(a["Awarding Agency"] || "")).filter(Boolean))];

                    if (!profile.federal_awards_count || awards.length > Number(profile.federal_awards_count)) {
                        updates.federal_awards_count = awards.length;
                    }

                    results.usaspending = {
                        award_count: awards.length,
                        total_value: totalValue,
                        agencies: agencies.slice(0, 10),
                        last_award: awards[0]?.["Start Date"],
                        searched_by: uei ? "uei" : "name",
                    };
                    (results.enriched as string[]).push("usaspending");
                }
            }
        } catch { /* USASpending timeout */ }

        // --- 4. Apollo People Enrichment ---
        if (APOLLO_API_KEY && profile.contact_name) {
            try {
                const nameParts = String(profile.contact_name).trim().split(/\s+/);
                const firstName = nameParts[0] || "";
                const lastName = nameParts.slice(1).join(" ") || "";
                const domain = profile.website ? String(profile.website).replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "") : "";

                const apolloRes = await fetch("https://api.apollo.io/api/v1/people/match", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "X-Api-Key": APOLLO_API_KEY },
                    body: JSON.stringify({ first_name: firstName, last_name: lastName, domain, organization_name: profile.company_name }),
                    signal: AbortSignal.timeout(10000),
                });

                if (apolloRes.ok) {
                    const apolloData = await apolloRes.json();
                    const person = apolloData.person;
                    if (person) {
                        const phones = (person.phone_numbers || []) as Array<{ sanitized_number?: string; type?: string }>;
                        const mobile = phones.find(p => p.type === "mobile")?.sanitized_number;
                        if (mobile && !profile.contact_phone) updates.contact_phone = mobile;
                        results.apollo = {
                            email: person.email,
                            mobile: mobile,
                            linkedin: person.linkedin_url,
                            title: person.title,
                        };
                        (results.enriched as string[]).push("apollo_people");
                    }
                }
            } catch { /* Apollo timeout */ }
        }

        // --- 5. Update profile ---
        if (Object.keys(updates).length > 0) {
            const { error: updateErr } = await admin
                .from("user_profiles")
                .update(updates)
                .eq("id", user_profile_id);
            if (updateErr) {
                results.update_error = updateErr.message;
            }
        }

        // --- 6. Log activity ---
        const enriched = results.enriched as string[];
        await admin.from("client_activity_log").insert({
            user_profile_id,
            action: "profile_enriched",
            description: `Profile enriched via: ${enriched.join(", ") || "none"}. Updated ${Object.keys(updates).length} fields.`,
            metadata: { updates: Object.keys(updates), sources: enriched },
        });

        return NextResponse.json({
            success: true,
            fields_updated: Object.keys(updates),
            sources: enriched,
            details: results,
        });

    } catch (error) {
        console.error("Enrich profile error:", error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
