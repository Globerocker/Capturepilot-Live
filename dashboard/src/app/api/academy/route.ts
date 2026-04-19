import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 30;

/**
 * GET /api/academy
 *   ?slug=<slug>   — single article (full body if authenticated)
 *   ?category=…    — filter by category
 *   ?featured=1    — only featured articles
 *   ?public=1      — public teaser mode (title + excerpt only, for website)
 *
 * No auth required — the endpoint itself is public, but `public=1` gates
 * body_md to keep the full content inside the app.
 */
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const slug = searchParams.get("slug");
    const category = searchParams.get("category");
    const featured = searchParams.get("featured") === "1";
    const publicMode = searchParams.get("public") === "1";

    const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // Single-article mode
    if (slug) {
        const cols = publicMode
            ? "slug, title, excerpt, category, reading_minutes, cover_image_url, author_name, published_at"
            : "slug, title, excerpt, body_md, category, reading_minutes, cover_image_url, author_name, published_at, featured";
        const { data, error } = await admin
            .from("academy_articles")
            .select(cols)
            .eq("slug", slug)
            .not("published_at", "is", null)
            .maybeSingle();
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });
        return NextResponse.json({ article: data });
    }

    // List mode
    let query = admin
        .from("academy_articles")
        .select("slug, title, excerpt, category, reading_minutes, featured, cover_image_url, author_name, published_at")
        .not("published_at", "is", null)
        .order("featured", { ascending: false })
        .order("published_at", { ascending: false })
        .limit(50);

    if (category) query = query.eq("category", category);
    if (featured) query = query.eq("featured", true);
    if (publicMode) query = query.eq("teaser_public", true);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ articles: data || [] });
}
