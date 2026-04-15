import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const maxDuration = 60;

interface SamPartner {
    uei: string;
    cage_code?: string;
    company_name: string;
    dba_name?: string;
    state?: string;
    city?: string;
    naics_codes?: string[];
    primary_naics?: string;
    certifications?: string[];
    website?: string;
    sam_url?: string;
    entity_type?: string;
}

const MAX_PER_ADD = 20;

function computeOverlapScore(userNaics: string[], compNaics: string[]): number {
    if (!userNaics.length || !compNaics.length) return 0;
    const userSet = new Set(userNaics.map(String));
    const compSet = new Set(compNaics.map(String));
    let exact = 0;
    for (const c of compSet) if (userSet.has(c)) exact++;
    // Also count 4-digit prefix matches (industry group) at half weight
    let prefix = 0;
    for (const c of compSet) {
        if (userSet.has(c)) continue;
        const p = c.slice(0, 4);
        for (const u of userSet) {
            if (u.slice(0, 4) === p) { prefix++; break; }
        }
    }
    const denom = Math.max(userSet.size, compSet.size);
    const score = (exact + prefix * 0.5) / denom;
    return Math.max(0, Math.min(100, Math.round(score * 100)));
}

/**
 * POST /api/competitors/add-from-sam
 * Body: { partners: SamPartner[] }
 *
 * Inserts up to 20 competitors into client_competitors for the current user.
 * Skips UEIs already tracked for this user. Computes overlap_score based on
 * NAICS overlap with user profile's naics_codes.
 */
export async function POST(req: NextRequest) {
    try {
        const supabase = await createSupabaseServerClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const body = await req.json().catch(() => ({}));
        const partners: SamPartner[] = Array.isArray(body?.partners) ? body.partners : [];
        if (partners.length === 0) {
            return NextResponse.json({ error: "No partners provided" }, { status: 400 });
        }
        if (partners.length > MAX_PER_ADD) {
            return NextResponse.json({ error: `Max ${MAX_PER_ADD} competitors per add` }, { status: 400 });
        }

        const { data: profile } = await supabase
            .from("user_profiles")
            .select("id, naics_codes")
            .eq("auth_user_id", user.id)
            .single();
        if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

        const profileId = (profile as { id: string }).id;
        const userNaics = ((profile as { naics_codes?: string[] | null }).naics_codes || []) as string[];

        // Find existing UEIs for this user to skip duplicates
        const incomingUeis = partners.map(p => p.uei).filter(Boolean);
        const { data: existing } = await supabase
            .from("client_competitors")
            .select("uei")
            .eq("user_profile_id", profileId)
            .in("uei", incomingUeis);
        const existingUeis = new Set((existing || []).map((r: { uei: string | null }) => r.uei).filter(Boolean));

        const toInsert = partners
            .filter(p => p.uei && !existingUeis.has(p.uei))
            .map(p => {
                const naicsCodes = Array.isArray(p.naics_codes) ? p.naics_codes.filter(Boolean) : [];
                const overlap = computeOverlapScore(userNaics, naicsCodes);
                const websiteRaw = (p.website || "").trim();
                const website = websiteRaw
                    ? (/^https?:\/\//i.test(websiteRaw) ? websiteRaw : `https://${websiteRaw}`)
                    : null;
                const locationParts = [p.city, p.state].filter(Boolean);
                return {
                    user_profile_id: profileId,
                    competitor_name: p.company_name || p.dba_name || p.uei,
                    website,
                    uei: p.uei,
                    cage_code: p.cage_code || null,
                    naics_codes: naicsCodes,
                    employee_count: null,
                    revenue_estimate: null,
                    description: locationParts.length
                        ? `SAM.gov registered entity — ${locationParts.join(", ")}`
                        : "SAM.gov registered entity",
                    overlap_score: overlap,
                    federal_presence: "strong",
                    crawl_data: {
                        source: "sam_bulk_add",
                        sam_url: p.sam_url || null,
                        certifications: p.certifications || [],
                        primary_naics: p.primary_naics || null,
                        locations: locationParts.length ? [locationParts.join(", ")] : [],
                        entity_type: p.entity_type || null,
                    },
                    last_analyzed_at: new Date().toISOString(),
                };
            });

        let inserted = 0;
        if (toInsert.length > 0) {
            const { error, data } = await supabase
                .from("client_competitors")
                .insert(toInsert)
                .select("id");
            if (error) {
                return NextResponse.json({ error: error.message }, { status: 500 });
            }
            inserted = (data || []).length;
        }

        return NextResponse.json({
            success: true,
            inserted,
            skipped: partners.length - inserted,
            duplicates: existingUeis.size,
        });
    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
