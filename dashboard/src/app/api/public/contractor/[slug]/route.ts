import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public read-only endpoint serving contractor profile pages.
 * Powers www.capturepilot.com/contractors/<slug>.
 *
 * CORS is permissive because both capturepilot.com domains hit this.
 * RLS already restricts to is_published = true.
 */

const ALLOWED_ORIGINS = new Set([
    "https://www.capturepilot.com",
    "https://capturepilot.com",
    "https://www.americurial.com",
    "https://americurial.com",
    "http://localhost:3000",
    "http://localhost:3001",
]);

function corsHeaders(origin: string | null): Record<string, string> {
    const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://www.capturepilot.com";
    return {
        "Access-Control-Allow-Origin": allowed,
        "Access-Control-Allow-Methods": "GET,OPTIONS",
        "Vary": "Origin",
    };
}

export async function OPTIONS(req: NextRequest) {
    return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const headers = corsHeaders(req.headers.get("origin"));
    if (!slug) return NextResponse.json({ error: "missing slug" }, { status: 400, headers });

    // Use the anon client + RLS rather than service key — anyone reading
    // this endpoint sees what an unauthenticated visitor would.
    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false } },
    );

    const { data, error } = await sb
        .from("contractor_profile_pages")
        .select("*")
        .eq("slug", slug)
        .eq("is_published", true)
        .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500, headers });
    if (!data) return NextResponse.json({ error: "not found" }, { status: 404, headers });

    return NextResponse.json({ contractor: data }, { status: 200, headers });
}
