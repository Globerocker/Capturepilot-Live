/**
 * Apollo enrichment for government_contacts.
 *
 * HigherGov gives us name + agency + email for ~100k+ government decision-
 * makers, but rarely a LinkedIn URL, mobile number, or tenure data.
 * Apollo.io's /people/match endpoint fills those gaps:
 *   - first_name + last_name + organization_domain → person_id
 *   - person_id → linkedin_url, mobile, employment history, headline
 *
 * Strategy:
 *   1. Pick the next batch of un-enriched contacts (enriched_at is null)
 *   2. Group by agency_domain to maximize cache reuse
 *   3. Call Apollo /people/match with first/last/domain
 *   4. Write back linkedin_url, mobile_phone, direct_phone, headline,
 *      tenure_years, apollo_id, enriched_at, enrichment_quality
 *
 * Rate-limit: Apollo free tier = 50 lookups/day. Paid plans go higher.
 * We cap at 100 contacts per cron run; user can boost via ?limit=N.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 300;

const APOLLO_BASE = "https://api.apollo.io/api/v1";

function getSupabase() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
    );
}

interface ApolloPersonMatch {
    person?: {
        id?: string;
        linkedin_url?: string | null;
        headline?: string | null;
        title?: string | null;
        phone_numbers?: Array<{ sanitized_number?: string; type?: string }>;
        employment_history?: Array<{
            organization_name?: string;
            title?: string;
            start_date?: string;
            end_date?: string | null;
            current?: boolean;
        }>;
        email?: string | null;
        email_status?: string;
    };
}

async function enrichOne(
    apiKey: string,
    firstName: string,
    lastName: string,
    domain: string,
    organizationName?: string,
): Promise<ApolloPersonMatch["person"] | null> {
    if (!firstName || !lastName) return null;
    try {
        const payload: Record<string, unknown> = {
            first_name: firstName,
            last_name: lastName,
        };
        if (domain) payload.domain = domain;
        if (organizationName) payload.organization_name = organizationName;

        const res = await fetch(`${APOLLO_BASE}/people/match`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Api-Key": apiKey,
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) {
            // 429 = rate-limit; surface so caller can stop early
            if (res.status === 429) throw new Error("rate_limit");
            return null;
        }
        const data = (await res.json()) as ApolloPersonMatch;
        return data.person || null;
    } catch (err) {
        if ((err as Error).message === "rate_limit") throw err;
        return null;
    }
}

type EmploymentEntry = { start_date?: string; end_date?: string | null; current?: boolean };

function computeTenureYears(employmentHistory: EmploymentEntry[] | undefined): number | null {
    const hist = employmentHistory;
    if (!hist || hist.length === 0) return null;
    const cur = hist.find(h => h.current) || hist[0];
    if (!cur || !cur.start_date) return null;
    const start = new Date(cur.start_date).getTime();
    const end = cur.end_date ? new Date(cur.end_date).getTime() : Date.now();
    if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return null;
    return Math.round(((end - start) / (1000 * 60 * 60 * 24 * 365.25)) * 10) / 10;
}

function computeQuality(person: NonNullable<ApolloPersonMatch["person"]>): number {
    let score = 30; // baseline for "Apollo returned a match"
    if (person.linkedin_url) score += 25;
    if (person.email_status === "verified") score += 15;
    if (person.phone_numbers && person.phone_numbers.length > 0) score += 10;
    if (person.phone_numbers?.some(p => p.type === "mobile")) score += 10;
    if (person.employment_history && person.employment_history.length >= 2) score += 5;
    if (person.headline) score += 5;
    return Math.min(100, score);
}

export async function GET(req: NextRequest) {
    const authHeader = req.headers.get("authorization");
    const serviceKey = process.env.SUPABASE_SERVICE_KEY;
    const expectedCron = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : null;
    const ok = (expectedCron && authHeader === expectedCron) ||
        (serviceKey && authHeader === `Bearer ${serviceKey}`);
    if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const apiKey = process.env.APOLLO_API_KEY;
    if (!apiKey) {
        return NextResponse.json({ error: "APOLLO_API_KEY not configured" }, { status: 500 });
    }

    try {
        const supabase = getSupabase();
        const startTime = Date.now();
        const limit = Math.min(500, parseInt(req.nextUrl.searchParams.get("limit") || "100", 10));

        // Pull un-enriched, high-value candidates first: those with a known
        // agency_domain (Apollo needs this) and an email or full name.
        const { data: candidates, error: pickErr } = await supabase
            .from("government_contacts")
            .select("id, first_name, last_name, name, agency_name, agency_domain, email")
            .is("enriched_at", null)
            .not("agency_domain", "is", null)
            .not("first_name", "is", null)
            .not("last_name", "is", null)
            .order("last_seen_at", { ascending: false, nullsFirst: false })
            .limit(limit);
        if (pickErr) {
            return NextResponse.json({ error: pickErr.message }, { status: 500 });
        }
        if (!candidates || candidates.length === 0) {
            return NextResponse.json({ success: true, enriched: 0, skipped: 0, hit: false, note: "no candidates" });
        }

        let enriched = 0;
        let missed = 0;
        let rateLimited = false;

        for (const c of candidates as Array<{
            id: string; first_name: string; last_name: string; name: string;
            agency_name: string | null; agency_domain: string | null; email: string | null;
        }>) {
            if (Date.now() - startTime > 270_000) break;
            let person: ApolloPersonMatch["person"] | null = null;
            try {
                person = await enrichOne(
                    apiKey,
                    c.first_name,
                    c.last_name,
                    c.agency_domain || "",
                    c.agency_name || undefined,
                );
            } catch (err) {
                if ((err as Error).message === "rate_limit") {
                    rateLimited = true;
                    break;
                }
            }

            if (!person) {
                // Still mark as enriched (with quality=0) so we don't retry this
                // record every cron run forever. Apollo doesn't have them.
                await supabase
                    .from("government_contacts")
                    .update({
                        enriched_at: new Date().toISOString(),
                        enrichment_provider: "apollo",
                        enrichment_quality: 0,
                    })
                    .eq("id", c.id);
                missed++;
                continue;
            }

            const phones = person.phone_numbers || [];
            const mobile = phones.find(p => p.type === "mobile")?.sanitized_number || null;
            const direct = phones.find(p => p.type === "work_direct" || p.type === "direct")?.sanitized_number || null;
            const tenureYears = computeTenureYears(person.employment_history);
            const totalExperienceYears = (() => {
                const hist = person.employment_history || [];
                if (hist.length === 0) return null;
                const earliest = hist.reduce<number | null>((acc, h) => {
                    if (!h.start_date) return acc;
                    const t = new Date(h.start_date).getTime();
                    if (Number.isNaN(t)) return acc;
                    return acc == null || t < acc ? t : acc;
                }, null);
                if (!earliest) return null;
                return Math.round(((Date.now() - earliest) / (1000 * 60 * 60 * 24 * 365.25)) * 10) / 10;
            })();

            await supabase
                .from("government_contacts")
                .update({
                    linkedin_url: person.linkedin_url || null,
                    mobile_phone: mobile,
                    direct_phone: direct,
                    apollo_id: person.id || null,
                    linkedin_headline: person.headline || null,
                    linkedin_years_in_role: tenureYears,
                    linkedin_total_experience_years: totalExperienceYears,
                    // Upgrade email when Apollo has a verified one and we
                    // had nothing
                    email: c.email || (person.email_status === "verified" ? person.email : null) || null,
                    enriched_at: new Date().toISOString(),
                    enrichment_provider: "apollo",
                    enrichment_quality: computeQuality(person),
                })
                .eq("id", c.id);
            enriched++;
        }

        return NextResponse.json({
            success: true,
            considered: candidates.length,
            enriched,
            missed,
            rate_limited: rateLimited,
            elapsed_ms: Date.now() - startTime,
        });
    } catch (error) {
        console.error("Apollo enrich error:", error);
        return NextResponse.json({
            error: (error as Error).message || "Enrich failed",
        }, { status: 500 });
    }
}
