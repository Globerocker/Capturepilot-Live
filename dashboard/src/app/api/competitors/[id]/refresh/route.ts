import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { analyzeCompany } from "@/lib/crawler";

export const maxDuration = 120;

interface Ctx { params: Promise<{ id: string }> }

/**
 * POST /api/competitors/[id]/refresh
 *
 * Re-runs the website crawler against the stored client_competitors row and
 * updates description, naics_codes, crawl_data (+ suggested keywords), and
 * federal_presence. Mirrors the partner refresh endpoint so the UI behavior
 * matches — requested during the Apr 20 review.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
    const { id } = await ctx.params;

    const cookieStore = await cookies();
    const authSupabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll: () => cookieStore.getAll() } }
    );
    const { data: { user } } = await authSupabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
    const { data: profileRow } = await admin
        .from("user_profiles")
        .select("id, naics_codes")
        .eq("auth_user_id", user.id)
        .maybeSingle();
    const profile = profileRow as { id: string; naics_codes: string[] | null } | null;
    if (!profile) return NextResponse.json({ error: "No profile" }, { status: 404 });

    const { data: compRow } = await admin
        .from("client_competitors")
        .select("id, competitor_name, website, naics_codes, uei")
        .eq("id", id)
        .eq("user_profile_id", profile.id)
        .maybeSingle();
    const comp = compRow as {
        id: string;
        competitor_name: string;
        website: string | null;
        naics_codes: string[] | null;
        uei: string | null;
    } | null;
    if (!comp) return NextResponse.json({ error: "Competitor not found" }, { status: 404 });
    if (!comp.website) return NextResponse.json({ error: "Competitor has no website to crawl" }, { status: 400 });

    const crawlResult = await analyzeCompany(comp.competitor_name, comp.website);
    if (!crawlResult.success) {
        return NextResponse.json({
            error: "Crawl failed",
            details: crawlResult.errors,
        }, { status: 502 });
    }

    const cd = crawlResult.data as unknown as Record<string, unknown>;
    const description = (cd.description as string) || null;
    const services = Array.isArray(cd.services) ? cd.services : [];
    const differentiators = Array.isArray(cd.differentiators) ? cd.differentiators : [];

    // Re-run keyword suggestion so the competitor's positioning stays current.
    let primary: string[] = [];
    let secondary: string[] = [];
    try {
        const proto = req.headers.get("x-forwarded-proto") || "https";
        const host = req.headers.get("host");
        if (host) {
            const kwRes = await fetch(`${proto}://${host}/api/keywords/suggest`, {
                method: "POST",
                headers: { "Content-Type": "application/json", cookie: req.headers.get("cookie") || "" },
                body: JSON.stringify({
                    company_name: comp.competitor_name,
                    company_description: description || "",
                    services,
                    differentiators,
                }),
                signal: AbortSignal.timeout(30_000),
            });
            if (kwRes.ok) {
                const body = await kwRes.json() as { primary?: string[]; secondary?: string[] };
                primary = body.primary || [];
                secondary = body.secondary || [];
            }
        }
    } catch { /* best-effort */ }

    // Recompute NAICS overlap against the caller's profile so the badge stays
    // correct if we learned new NAICS codes from the crawl.
    const inferredNaicsRaw = (cd.inferred_naics as unknown[]) || [];
    const inferredNaics = inferredNaicsRaw
        .map(item => {
            if (typeof item === "string") return item;
            if (item && typeof item === "object" && "code" in item) {
                const code = (item as { code: unknown }).code;
                return typeof code === "string" ? code : null;
            }
            return null;
        })
        .filter((c): c is string => !!c && /^\d{4,6}$/.test(c));
    const mergedNaics = Array.from(new Set([...(comp.naics_codes || []), ...inferredNaics]));

    const userSet = new Set((profile.naics_codes || []).map(String));
    const compSet = new Set(mergedNaics.map(String));
    let exactOverlap = 0;
    let prefixOverlap = 0;
    for (const c of compSet) {
        if (userSet.has(c)) { exactOverlap++; continue; }
        const p = c.slice(0, 4);
        for (const u of userSet) {
            if (u.slice(0, 4) === p) { prefixOverlap++; break; }
        }
    }
    const overlapDenom = Math.max(userSet.size, compSet.size) || 1;
    const overlapScore = Math.max(0, Math.min(100, Math.round(((exactOverlap + prefixOverlap * 0.5) / overlapDenom) * 100)));

    const awardCount = Number((cd.usaspending_data as { award_count?: number } | null)?.award_count || 0);
    let federalPresence = "unknown";
    if (awardCount >= 3) federalPresence = "strong";
    else if (awardCount >= 1 || comp.uei) federalPresence = "moderate";
    else federalPresence = "none";

    const mergedCrawl = {
        ...cd,
        primary_keywords: primary,
        secondary_keywords: secondary,
    };

    const { error } = await admin.from("client_competitors")
        .update({
            description,
            naics_codes: mergedNaics,
            crawl_data: mergedCrawl,
            federal_presence: federalPresence,
            overlap_score: overlapScore,
            last_analyzed_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("user_profile_id", profile.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
        success: true,
        description,
        naics_codes: mergedNaics,
        overlap_score: overlapScore,
        federal_presence: federalPresence,
        keywords: { primary, secondary },
    });
}
