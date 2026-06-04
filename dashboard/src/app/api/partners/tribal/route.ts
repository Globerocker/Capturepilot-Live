import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { protectCrawl } from "@/lib/crawl-protection";

export const maxDuration = 30;

/**
 * GET /api/partners/tribal
 *   ?naics=237110&naics=541330      (repeatable; matches against all_naics_codes)
 *   &state=TX&state=VA               (repeatable)
 *   &cert=8(a)&cert=HUBZone          (repeatable)
 *   &keyword=acme                    (fuzzy match on business_name)
 *   &limit=50
 *
 * Queries the curated `tribal_contractors` directory seeded via
 * tools/24_ingest_tribal_contractors.mjs. Unlike /api/partners/search
 * (live SAM.gov fan-out), this returns instantly from our own DB and
 * ranks by NAICS overlap with the caller's profile.
 */
export async function GET(req: NextRequest) {
    const blocked = await protectCrawl(req, { route: "partners-tribal", maxPerMin: 30 });
    if (blocked) return blocked;
    const cookieStore = await cookies();
    const authSupabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll: () => cookieStore.getAll() } }
    );
    const { data: { user } } = await authSupabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = req.nextUrl;
    const naics   = searchParams.getAll("naics").filter(Boolean);
    const states  = searchParams.getAll("state").filter(Boolean);
    const certs   = searchParams.getAll("cert").filter(Boolean);
    const keyword = searchParams.get("keyword")?.trim() || "";
    const limit   = Math.min(Math.max(parseInt(searchParams.get("limit") || "50", 10), 1), 200);

    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

    // Also fetch the caller's profile NAICS so we can rank by overlap even
    // when no explicit filter is passed. Partners UI pre-fills from profile
    // but the server-side ranking is a belt-and-suspenders play.
    const { data: profile } = await admin
        .from("user_profiles")
        .select("naics_codes")
        .eq("auth_user_id", user.id)
        .maybeSingle<{ naics_codes: string[] | null }>();
    const profileNaics = profile?.naics_codes || [];

    let q = admin.from("tribal_contractors").select("*");

    if (naics.length) q = q.overlaps("all_naics_codes", naics);
    // Certifications are stored as parsed tokens ("8(a)", "HUBZone", …).
    if (certs.length) q = q.overlaps("certifications", certs);
    // State values in the CSV are full state names ("Oregon", "Alaska"); the
    // UI filter sends two-letter codes. Normalise both sides before querying.
    if (states.length) {
        const expanded = states.flatMap(s => stateSynonyms(s));
        q = q.in("state", expanded);
    }
    if (keyword) q = q.ilike("business_name", `%${keyword}%`);

    // Pull a generous window so we can rank client-side by NAICS overlap;
    // final slice happens after sorting.
    const { data, error } = await q.limit(Math.max(limit * 3, 200));
    if (error) {
        return NextResponse.json({ error: error.message, partners: [] }, { status: 500 });
    }

    const rankingNaics = naics.length ? naics : profileNaics;
    const rankSet = new Set(rankingNaics);

    const ranked = (data || [])
        .map(row => ({
            ...row,
            naics_overlap: (row.all_naics_codes || []).filter((c: string) => rankSet.has(c)).length,
        }))
        .sort((a, b) => {
            if (b.naics_overlap !== a.naics_overlap) return b.naics_overlap - a.naics_overlap;
            return (a.business_name || "").localeCompare(b.business_name || "");
        })
        .slice(0, limit);

    return NextResponse.json({
        partners: ranked,
        total:    ranked.length,
        ranked_by_profile: !naics.length && profileNaics.length > 0,
    });
}

// Accept "OR" (state abbreviation from UI) and map to "Oregon" (CSV format).
// Kept inline because importing a large state table for one lookup is overkill.
const STATE_NAME: Record<string, string> = {
    AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
    CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "District of Columbia",
    FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
    IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
    ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
    MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada",
    NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
    NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon",
    PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
    TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia",
    WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
    PR: "Puerto Rico", GU: "Guam",
};
function stateSynonyms(input: string): string[] {
    const up = input.trim().toUpperCase();
    if (STATE_NAME[up]) return [STATE_NAME[up], up];
    return [input];
}
