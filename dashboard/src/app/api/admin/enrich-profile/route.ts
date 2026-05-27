import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { runQuickCheck } from "@/lib/quick-checker";
import { assertAdmin } from "@/lib/auth-admin";
import { SAM_CONTRACTOR_KEY } from "@/lib/sam-keys";

export const maxDuration = 120;

// Entity lookups go through the dedicated SAM_API_KEY_2 (contractor scope).
const SAM_API_KEY = SAM_CONTRACTOR_KEY;
const APOLLO_API_KEY = process.env.APOLLO_API_KEY || "";

function getAdmin() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
    );
}

async function lookupSam(uei: string | null, companyName: string) {
    if (!SAM_API_KEY) return null;
    try {
        if (uei) {
            const res = await fetch(
                `https://api.sam.gov/entity-information/v3/entities?ueiSAM=${encodeURIComponent(uei)}&registrationStatus=A&includeSections=entityRegistration,coreData,assertions,pointsOfContact`,
                { headers: { "X-Api-Key": SAM_API_KEY }, signal: AbortSignal.timeout(15000) }
            );
            if (res.ok) return (await res.json()).entityData?.[0] || null;
        }
        if (companyName && companyName.length >= 3) {
            const res = await fetch(
                `https://api.sam.gov/entity-information/v3/entities?legalBusinessName=${encodeURIComponent(companyName)}&registrationStatus=A&includeSections=entityRegistration,coreData,assertions,pointsOfContact`,
                { headers: { "X-Api-Key": SAM_API_KEY }, signal: AbortSignal.timeout(15000) }
            );
            if (res.ok) return (await res.json()).entityData?.[0] || null;
        }
    } catch { /* timeout/fail — return null */ }
    return null;
}

async function lookupUsaSpending(uei: string | null, companyName: string) {
    try {
        const searchText = (uei && uei.length === 12) ? uei : companyName;
        const res = await fetch("https://api.usaspending.gov/api/v2/search/spending_by_award/", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                filters: {
                    recipient_search_text: [searchText],
                    time_period: [{ start_date: "2015-01-01", end_date: new Date().toISOString().split("T")[0] }],
                    award_type_codes: ["A", "B", "C", "D"],
                },
                fields: ["Award ID", "Recipient Name", "Award Amount", "Awarding Agency", "NAICS Code", "Start Date"],
                limit: 100, page: 1, sort: "Start Date", order: "desc",
            }),
            signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) return null;
        const data = await res.json();
        const results = (data.results || []) as Array<Record<string, unknown>>;
        if (results.length === 0) return null;
        const agencies = [...new Set(results.map(r => String(r["Awarding Agency"] || "")).filter(Boolean))];
        const naics = [...new Set(results.map(r => String(r["NAICS Code"] || "")).filter(c => c.length >= 4))];
        const totalValue = results.reduce((sum, r) => sum + (Number(r["Award Amount"]) || 0), 0);
        return {
            award_count: results.length,
            total_value: totalValue,
            agencies,
            naics_codes: naics,
            last_award: results[0],
        };
    } catch { return null; }
}

async function enrichPersonApollo(firstName: string, lastName: string, domain: string, organization: string) {
    if (!APOLLO_API_KEY || !firstName || !lastName) return null;
    try {
        const res = await fetch("https://api.apollo.io/api/v1/people/match", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Api-Key": APOLLO_API_KEY },
            body: JSON.stringify({ first_name: firstName, last_name: lastName, domain, organization_name: organization }),
            signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) return null;
        const data = await res.json();
        const person = data.person;
        if (!person) return null;
        const phones = (person.phone_numbers || []) as Array<{ sanitized_number?: string; type?: string }>;
        const mobile = phones.find(p => p.type === "mobile")?.sanitized_number;
        const direct = phones.find(p => p.type === "work_direct" || p.type === "direct")?.sanitized_number;
        return {
            email: person.email ? String(person.email) : undefined,
            mobile_phone: mobile,
            direct_phone: direct,
            linkedin_url: person.linkedin_url ? String(person.linkedin_url) : undefined,
            title: person.title ? String(person.title) : undefined,
        };
    } catch { return null; }
}

/**
 * POST /api/admin/enrich-profile
 * Runs the unified Quick Checker pipeline for an existing user profile.
 * Populates: description, NAICS codes, primary/secondary keywords, contacts,
 * leadership, decision-maker, certifications, past customers, state, SAM data,
 * USASpending award history, Apollo mobile phone.
 *
 * Body: { user_profile_id: string, force?: boolean }
 * Returns: { success, fields_updated, quick_check, sam, usaspending, apollo }
 */
export async function POST(req: NextRequest) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;
    try {
        const { user_profile_id, force } = await req.json();
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

        if (!profile.website) {
            return NextResponse.json({ error: "Profile has no website to crawl" }, { status: 400 });
        }

        const updates: Record<string, unknown> = {};
        const sources: string[] = [];

        // 1) SAM.gov first — authoritative source for UEI + certifications + address
        const samEntity = await lookupSam(profile.uei || null, profile.company_name || "");
        let samNaics: string[] = [];
        let samData: Record<string, unknown> | null = null;
        if (samEntity) {
            const reg = samEntity.entityRegistration || {};
            const core = samEntity.coreData || {};
            const addr = core.physicalAddress || core.mailingAddress || {};
            const gen = core.generalInformation || {};
            const uei = String(reg.ueiSAM || "");
            if (uei && !profile.uei) updates.uei = uei;
            if (reg.cageCode && !profile.cage_code) updates.cage_code = reg.cageCode;
            if (addr.stateOrProvinceCode && (!profile.state || force)) updates.state = addr.stateOrProvinceCode;
            if (addr.city && !profile.city) updates.city = addr.city;
            if (addr.addressLine1 && !profile.address_line_1) updates.address_line_1 = addr.addressLine1;
            if (addr.zipCode && !profile.zip_code) updates.zip_code = addr.zipCode;

            samNaics = (samEntity.assertions?.goodsAndServices?.naicsList || [])
                .map((n: { naicsCode: string }) => String(n.naicsCode || ""))
                .filter(Boolean);

            // Extract certifications
            const bizTypes = (gen.businessTypes || []) as string[];
            const sbaList = ((samEntity.assertions?.goodsAndServices?.sbaBusinessTypeList || []) as Array<{ sbaBusinessTypeDesc?: string }>)
                .map(s => String(s.sbaBusinessTypeDesc || "").toLowerCase());
            const typeStr = [...bizTypes, ...sbaList].join(" ").toLowerCase();
            const certs: string[] = [];
            if (typeStr.includes("8(a)") || typeStr.includes("8a")) certs.push("8(a)");
            if (typeStr.includes("hubzone")) certs.push("HUBZone");
            if (typeStr.includes("sdvosb") || typeStr.includes("service-disabled")) certs.push("SDVOSB");
            if (typeStr.includes("wosb") || typeStr.includes("women-owned")) certs.push("WOSB");
            if (typeStr.includes("veteran-owned") || typeStr.includes("vosb")) certs.push("VOSB");
            if (certs.length > 0) {
                updates.sba_certifications = [...new Set([...(profile.sba_certifications || []), ...certs])];
            }

            samData = {
                uei, cage_code: reg.cageCode, certifications: certs, naics_codes: samNaics,
                state: addr.stateOrProvinceCode, city: addr.city,
            };
            sources.push("sam_entity");
        }

        // 2) USASpending award history
        const usa = await lookupUsaSpending(
            (updates.uei as string) || profile.uei || null,
            profile.company_name || "",
        );
        if (usa) {
            if (!profile.federal_awards_count || usa.award_count > Number(profile.federal_awards_count)) {
                updates.federal_awards_count = usa.award_count;
            }
            sources.push("usaspending");
        }

        // 3) Run the unified Quick Checker pipeline (Firecrawl + LLM + Zod)
        const qc = await runQuickCheck(profile.website, {
            companyName: profile.company_name || undefined,
            samNaics,
            usaSpendingNaics: usa?.naics_codes || [],
        });
        sources.push(`quick_check:${qc.source}`);

        const ex = qc.extraction;

        // Merge extracted facts into the profile (only when the existing field is empty or force=true)
        if (ex.long_description && (!profile.company_description || force)) {
            updates.company_description = ex.long_description.slice(0, 2000);
        }
        if (ex.headquarters_state && (!profile.state || force)) {
            updates.state = ex.headquarters_state;
        }
        if (ex.headquarters_city && !profile.city) {
            updates.city = ex.headquarters_city;
        }
        if (ex.founded_year && !profile.years_in_business) {
            updates.years_in_business = new Date().getFullYear() - ex.founded_year;
        }
        if (ex.employee_count_estimate && !profile.employee_count) {
            updates.employee_count = String(ex.employee_count_estimate);
        }

        // Prefer a clear decision-maker, else first leader, else first contact
        const decisionMaker = ex.leadership.find(l => l.is_decision_maker) || ex.leadership[0];
        if (decisionMaker) {
            if (!profile.contact_name) updates.contact_name = decisionMaker.name;
            if (decisionMaker.title && !profile.job_title) updates.job_title = decisionMaker.title;
            if (decisionMaker.phone && !profile.contact_phone) updates.contact_phone = decisionMaker.phone;
        }

        const mainPhone = ex.contacts.find(c => c.phone)?.phone;
        if (mainPhone && !profile.phone) updates.phone = mainPhone;
        const mainEmail = ex.contacts.find(c => c.email)?.email;
        if (mainEmail && !profile.email) updates.email = mainEmail;

        // NAICS codes — merge suggestions with existing, cap at 10
        const mergedNaics = [...new Set([
            ...(profile.naics_codes || []),
            ...qc.naics_suggestions.map(n => n.code),
        ])].slice(0, 10);
        if (mergedNaics.length > (profile.naics_codes || []).length) {
            updates.naics_codes = mergedNaics;
        }

        // Capability keywords → primary / secondary
        const primary = ex.capability_keywords.filter(k => k.tier === "primary").map(k => k.keyword.toLowerCase());
        const secondary = ex.capability_keywords.filter(k => k.tier === "secondary").map(k => k.keyword.toLowerCase());
        if (primary.length > 0) {
            updates.primary_keywords = [...new Set([...(profile.primary_keywords || []), ...primary])].slice(0, 20);
        }
        if (secondary.length > 0) {
            updates.secondary_keywords = [...new Set([...(profile.secondary_keywords || []), ...secondary])].slice(0, 30);
        }

        // 4) Apollo people enrichment for the decision-maker (mobile/direct numbers)
        let apollo: Awaited<ReturnType<typeof enrichPersonApollo>> = null;
        if (decisionMaker) {
            const parts = decisionMaker.name.trim().split(/\s+/);
            const first = parts[0] || "";
            const last = parts.slice(1).join(" ") || "";
            const domain = profile.website.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
            apollo = await enrichPersonApollo(first, last, domain, profile.company_name || "");
            if (apollo) {
                if (apollo.mobile_phone && !profile.contact_phone) updates.contact_phone = apollo.mobile_phone;
                sources.push("apollo_people");
            }
        }

        // 5) Persist the full Quick Checker result into notes.quick_check so the Admin UI can render it
        const prevNotes = (profile.notes && typeof profile.notes === "object") ? profile.notes as Record<string, unknown> : {};
        updates.notes = {
            ...prevNotes,
            quick_check: {
                ran_at: new Date().toISOString(),
                source: qc.source,
                website: qc.website,
                pages_scraped: qc.pages_scraped,
                duration_ms: qc.duration_ms,
                extraction: ex,
                naics_suggestions: qc.naics_suggestions,
                sam_data: samData,
                usaspending: usa ? {
                    award_count: usa.award_count,
                    total_value: usa.total_value,
                    agencies: usa.agencies,
                    naics_codes: usa.naics_codes,
                } : null,
                apollo,
                errors: qc.errors,
            },
        };

        // 6) Update the profile
        const { error: updateErr } = await admin
            .from("user_profiles")
            .update(updates)
            .eq("id", user_profile_id);
        if (updateErr) {
            return NextResponse.json({ error: updateErr.message, updates }, { status: 500 });
        }

        // 7) Log activity
        await admin.from("client_activity_log").insert({
            user_profile_id,
            action: "profile_enriched",
            description: `Quick Checker enriched profile via: ${sources.join(", ")}. Updated ${Object.keys(updates).filter(k => k !== "notes").length} fields.`,
            metadata: { updates: Object.keys(updates), sources },
        });

        return NextResponse.json({
            success: true,
            fields_updated: Object.keys(updates),
            sources,
            quick_check: {
                source: qc.source,
                pages_scraped: qc.pages_scraped,
                duration_ms: qc.duration_ms,
                company_name: ex.company_name,
                services_count: ex.services.length,
                leadership_count: ex.leadership.length,
                contacts_count: ex.contacts.length,
                industries: ex.industries_served,
                naics_suggestions: qc.naics_suggestions,
                primary_keywords: primary,
                secondary_keywords: secondary,
                has_gov_experience: ex.has_gov_experience,
                certifications: ex.certifications.map(c => c.type),
                errors: qc.errors,
            },
            sam: samData,
            usaspending: usa,
            apollo,
        });
    } catch (error) {
        console.error("Enrich profile error:", error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
