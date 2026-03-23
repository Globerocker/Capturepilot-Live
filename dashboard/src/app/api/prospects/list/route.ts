import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/prospects/list
 * Returns all completed company analyses for the admin prospects dashboard.
 * Optionally filter by ?saved=true.
 */
export async function GET(request: NextRequest) {
    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
    );

    const savedOnly = request.nextUrl.searchParams.get("saved") === "true";

    // Select without is_saved column (may not exist yet), use inferred_profile fallback
    const { data, error } = await sb
        .from("company_analyses")
        .select("id, company_name, website, uei, status, company_summary, sam_data, inferred_naics, preview_matches, inferred_profile, crawl_data, lead_email, created_at")
        .in("status", ["complete", "error"])
        .order("created_at", { ascending: false })
        .limit(100);

    if (error) {
        return NextResponse.json({ error: "Failed to fetch prospects" }, { status: 500 });
    }

    // Derive is_saved from inferred_profile JSONB
    const prospects = (data || []).map(p => {
        const profile = (p.inferred_profile || {}) as Record<string, unknown>;
        return { ...p, is_saved: profile.is_saved === true };
    });

    const filtered = savedOnly
        ? prospects.filter(p => p.is_saved)
        : prospects;

    return NextResponse.json({ prospects: filtered });
}
