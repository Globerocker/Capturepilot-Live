import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { analyzeCompany } from "@/lib/crawler";

export const maxDuration = 120;

interface Ctx { params: Promise<{ id: string }> }

/**
 * POST /api/partners/[id]/refresh
 *
 * Re-runs the website crawler against the partner's stored website and
 * updates crawl_data + description + naics_codes + keywords. Used by the
 * "Refresh crawl" button on the partner detail page.
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
    const { data: profileRow } = await admin.from("user_profiles").select("id").eq("auth_user_id", user.id).maybeSingle();
    const profile = profileRow as { id: string } | null;
    if (!profile) return NextResponse.json({ error: "No profile" }, { status: 404 });

    const { data: partnerRow } = await admin.from("client_partners")
        .select("id, company_name, website")
        .eq("id", id)
        .eq("user_profile_id", profile.id)
        .maybeSingle();
    const partner = partnerRow as { id: string; company_name: string; website: string | null } | null;
    if (!partner) return NextResponse.json({ error: "Partner not found" }, { status: 404 });
    if (!partner.website) return NextResponse.json({ error: "Partner has no website to crawl" }, { status: 400 });

    // 1) Crawl — analyzeCompany does logo, description, services, past clients, etc.
    const crawlResult = await analyzeCompany(partner.company_name, partner.website);
    if (!crawlResult.success) {
        return NextResponse.json({
            error: "Crawl failed",
            details: crawlResult.errors,
        }, { status: 502 });
    }

    const cd = crawlResult.data as unknown as Record<string, unknown>;
    const description = (cd.description as string) || null;

    // 2) Re-run keyword suggestion against the fresh data.
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
                    company_name: partner.company_name,
                    company_description: description || "",
                    services: Array.isArray(cd.services) ? cd.services : [],
                    differentiators: Array.isArray(cd.differentiators) ? cd.differentiators : [],
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

    // 3) Persist.
    const mergedCrawl = {
        ...cd,
        primary_keywords: primary,
        secondary_keywords: secondary,
    };
    const { error } = await admin.from("client_partners")
        .update({
            description,
            crawl_data: mergedCrawl,
            last_analyzed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("user_profile_id", profile.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
        success: true,
        description,
        keywords: { primary, secondary },
        pages_crawled: (cd.pages_crawled as string[] | undefined)?.length || 0,
    });
}
