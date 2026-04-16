import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/keywords/add
 * Body: { keyword: string }
 *
 * Lets authenticated users add a keyword to the gov_keywords library when the
 * curated list doesn't have what they need (e.g. "body armor" niche terms).
 * Writes with source='user' + added_by_user_id so admins can moderate later.
 *
 * Validation:
 *   - 3-60 chars after lowercase + collapse-whitespace
 *   - Letters/digits/spaces/hyphens only
 *   - Doesn't already exist (idempotent — returns existing row if it does)
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

    let body: { keyword?: string } = {};
    try { body = await req.json(); } catch { /* default */ }
    const raw = (body.keyword || "").toString();
    const normalized = raw.toLowerCase().trim().replace(/\s+/g, " ");

    if (normalized.length < 3 || normalized.length > 60) {
        return NextResponse.json({ error: "Keyword must be 3–60 characters." }, { status: 400 });
    }
    if (!/^[a-z0-9][a-z0-9\s\-]+$/.test(normalized)) {
        return NextResponse.json({ error: "Only letters, digits, spaces, and hyphens are allowed." }, { status: 400 });
    }

    // Service client to bypass RLS for the existence check (insert still writes
    // as the authed user so the policy's source='user' check is honored).
    const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
    );

    // Idempotent: return the existing row if it already exists.
    const { data: existing } = await admin
        .from("gov_keywords")
        .select("keyword, display_label, category, aliases, frequency, title_frequency, source")
        .eq("keyword", normalized)
        .maybeSingle();
    if (existing) {
        return NextResponse.json({ keyword: existing, created: false });
    }

    const displayLabel = normalized
        .split(" ")
        .map(w => w.length <= 3 && w.toUpperCase() !== w.toLowerCase() ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1))
        .join(" ");

    const { data: inserted, error } = await admin
        .from("gov_keywords")
        .insert({
            keyword: normalized,
            display_label: displayLabel,
            source: "user",
            added_by_user_id: user.id,
            category: null,
            frequency: 0,
            title_frequency: 0,
            aliases: [],
        })
        .select("keyword, display_label, category, aliases, frequency, title_frequency, source")
        .single();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ keyword: inserted, created: true });
}
