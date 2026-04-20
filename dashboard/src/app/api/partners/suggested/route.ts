import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 30;

/**
 * GET /api/partners/suggested?limit=25
 *
 * Returns approved outreach prospects ranked by NAICS overlap with the
 * authenticated user's profile. Designed for the "Suggested Partners" tab
 * on the /partners page — shows companies our outreach pipeline has
 * surfaced and cleared, so users can shortcut the SAM.gov search.
 *
 * Ranking:
 *   - exact NAICS overlap +3 per match
 *   - 4-digit prefix overlap +1 per match
 *   - matching SBA certification +2 per match
 *   Break ties by match_score then discovered_at.
 */
export async function GET(req: NextRequest) {
    const cookieStore = await cookies();
    const authSupabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll: () => cookieStore.getAll() } }
    );
    const { data: { user } } = await authSupabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const limit = Math.min(100, parseInt(req.nextUrl.searchParams.get("limit") || "25", 10));

    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
    const { data: profileRow } = await admin
        .from("user_profiles")
        .select("id, naics_codes, sba_certifications, target_states")
        .eq("auth_user_id", user.id)
        .maybeSingle();
    const profile = profileRow as { id: string; naics_codes: string[] | null; sba_certifications: string[] | null; target_states: string[] | null } | null;
    if (!profile) return NextResponse.json({ prospects: [] });

    const userNaics = profile.naics_codes || [];
    const userCerts = (profile.sba_certifications || []).map(c => c.toLowerCase());
    const userNaicsPrefixes = new Set(userNaics.map(n => n.slice(0, 4)));
    const userNaicsSet = new Set(userNaics);

    // Pull a larger candidate pool (3x limit) so ranking has something to chew on.
    const { data: candidates } = await admin
        .from("outreach_prospects")
        .select("id, uei, company_name, website, state, city, naics_codes, certifications, registration_date, match_score, discovered_at")
        .eq("status", "approved")
        .order("match_score", { ascending: false })
        .order("discovered_at", { ascending: false })
        .limit(Math.max(100, limit * 3));

    type Candidate = {
        id: string; uei: string | null; company_name: string; website: string | null;
        state: string | null; city: string | null; naics_codes: string[]; certifications: string[];
        registration_date: string | null; match_score: number; discovered_at: string;
    };
    const ranked = ((candidates || []) as Candidate[]).map(c => {
        let score = 0;
        const exactNaics: string[] = [];
        const prefixNaics: string[] = [];
        for (const n of c.naics_codes || []) {
            if (userNaicsSet.has(n)) { score += 3; exactNaics.push(n); }
            else if (userNaicsPrefixes.has(n.slice(0, 4))) { score += 1; prefixNaics.push(n); }
        }
        const matchedCerts: string[] = [];
        for (const cert of c.certifications || []) {
            if (userCerts.some(u => u.includes(cert.toLowerCase()) || cert.toLowerCase().includes(u))) {
                score += 2;
                matchedCerts.push(cert);
            }
        }
        // Small bonus for freshly-discovered rows so the feed feels live.
        const days = (Date.now() - new Date(c.discovered_at).getTime()) / 86400_000;
        if (days < 14) score += 1;

        return {
            ...c,
            fit_score: score,
            exact_naics: exactNaics,
            prefix_naics: prefixNaics,
            matched_certs: matchedCerts,
        };
    }).filter(c => c.fit_score > 0);   // Drop zero-fit — nothing useful to show.

    ranked.sort((a, b) => {
        if (b.fit_score !== a.fit_score) return b.fit_score - a.fit_score;
        if (b.match_score !== a.match_score) return b.match_score - a.match_score;
        return new Date(b.discovered_at).getTime() - new Date(a.discovered_at).getTime();
    });

    return NextResponse.json({
        prospects: ranked.slice(0, limit),
        user_naics_count: userNaics.length,
        user_cert_count: userCerts.length,
    });
}
