import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 60;

/**
 * POST /api/competitors/from-analysis
 * Body: { analysis_id: string }
 *
 * Turns a Quick-Checker analysis into a client_competitors row for the
 * authenticated user. Also fires keyword suggestion so the competitor lands
 * with primary/secondary keywords ready to display.
 *
 * Idempotent: if the user already has a competitor with the same website,
 * returns that one.
 */
export async function POST(req: NextRequest) {
    const cookieStore = await cookies();
    const authSupabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll: () => cookieStore.getAll() } }
    );
    const { data: { user } } = await authSupabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({})) as { analysis_id?: string };
    const analysisId = body.analysis_id;
    if (!analysisId) return NextResponse.json({ error: "analysis_id required" }, { status: 400 });

    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

    const { data: profile } = await admin
        .from("user_profiles")
        .select("id")
        .eq("auth_user_id", user.id)
        .maybeSingle();
    if (!profile) return NextResponse.json({ error: "No profile" }, { status: 404 });

    const { data: analysis } = await admin
        .from("company_analyses")
        .select("*")
        .eq("id", analysisId)
        .maybeSingle();
    if (!analysis) return NextResponse.json({ error: "Analysis not found" }, { status: 404 });

    const a = analysis as Record<string, unknown>;
    const crawlData = (a.crawl_data || {}) as Record<string, unknown>;
    const samData = (a.sam_data || {}) as Record<string, unknown>;

    const competitorName = (a.company_name as string) || "Unnamed";
    const website = (a.website as string) || (crawlData.website as string) || null;
    const uei = (samData.uei as string) || (a.uei as string) || null;
    const description = (a.company_summary as string) || (crawlData.description as string) || null;

    const rawInferred = (a.inferred_naics as unknown[]) || [];
    const naicsCodes = rawInferred
        .map(item => typeof item === "string"
            ? item
            : item && typeof item === "object" && "code" in item
                ? String((item as { code: unknown }).code || "")
                : "")
        .filter(c => /^\d{4,6}$/.test(c));

    // Idempotency check — de-dupe on website within the same user.
    if (website) {
        const { data: existing } = await admin
            .from("client_competitors")
            .select("id")
            .eq("user_profile_id", profile.id)
            .eq("website", website)
            .maybeSingle();
        if (existing) {
            return NextResponse.json({ competitor_id: existing.id, created: false });
        }
    }

    // Keyword suggestion — 30s budget. Best-effort.
    let primaryKeywords: string[] = [];
    let secondaryKeywords: string[] = [];
    try {
        const proto = req.headers.get("x-forwarded-proto") || "https";
        const host = req.headers.get("host");
        const kwUrl = host ? `${proto}://${host}/api/keywords/suggest` : null;
        if (kwUrl) {
            const kwRes = await fetch(kwUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json", cookie: req.headers.get("cookie") || "" },
                body: JSON.stringify({
                    company_name: competitorName,
                    company_description: description || "",
                    services: Array.isArray(crawlData.services) ? crawlData.services : [],
                    differentiators: Array.isArray(crawlData.differentiators) ? crawlData.differentiators : [],
                }),
                signal: AbortSignal.timeout(30_000),
            });
            if (kwRes.ok) {
                const kwBody = await kwRes.json() as { primary?: string[]; secondary?: string[] };
                primaryKeywords = kwBody.primary || [];
                secondaryKeywords = kwBody.secondary || [];
            }
        }
    } catch { /* non-fatal */ }

    const crawlWithKw = {
        ...crawlData,
        primary_keywords: primaryKeywords,
        secondary_keywords: secondaryKeywords,
    };

    const federalPresence = Object.keys(samData).length > 0 ? "strong" : uei ? "moderate" : "none";

    const { data: inserted, error } = await admin
        .from("client_competitors")
        .insert({
            user_profile_id: profile.id,
            competitor_name: competitorName,
            website: website && website.startsWith("http") ? website : website ? `https://${website}` : null,
            uei,
            description,
            naics_codes: naicsCodes,
            employee_count: (crawlData.employee_signals as string) || (crawlData.employee_count as string) || null,
            revenue_estimate: (crawlData.revenue_signals as string) || (crawlData.revenue_estimate as string) || null,
            federal_presence: federalPresence,
            crawl_data: crawlWithKw,
            last_analyzed_at: new Date().toISOString(),
            overlap_score: 0,
        })
        .select("id")
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ competitor_id: inserted.id, created: true });
}
