import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 30;

async function getUserProfileId(): Promise<{ userProfileId: string | null; error?: string }> {
    const cookieStore = await cookies();
    const sb = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll: () => cookieStore.getAll() } }
    );
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return { userProfileId: null, error: "Unauthorized" };

    const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data: profile } = await admin
        .from("user_profiles")
        .select("id")
        .eq("auth_user_id", user.id)
        .single();
    if (!profile) return { userProfileId: null, error: "No profile" };
    return { userProfileId: (profile as { id: string }).id };
}

function admin() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
}

// GET — list the current user's market watches
export async function GET() {
    const { userProfileId, error } = await getUserProfileId();
    if (!userProfileId) return NextResponse.json({ error }, { status: error === "Unauthorized" ? 401 : 404 });

    const { data, error: err } = await admin()
        .from("market_watch_searches")
        .select("*")
        .eq("user_profile_id", userProfileId)
        .order("created_at", { ascending: false });
    if (err) return NextResponse.json({ error: err.message }, { status: 500 });
    return NextResponse.json({ searches: data || [] });
}

// POST — create a saved search
export async function POST(req: NextRequest) {
    const { userProfileId, error } = await getUserProfileId();
    if (!userProfileId) return NextResponse.json({ error }, { status: error === "Unauthorized" ? 401 : 404 });

    const body = await req.json().catch(() => ({}));
    const name = (body.name || "").toString().trim();
    const queryText = (body.query_text || "").toString().trim();
    const filters = (body.filters || {}) as Record<string, unknown>;

    if (!name || !queryText) {
        return NextResponse.json({ error: "name + query_text required" }, { status: 400 });
    }

    const { data, error: err } = await admin()
        .from("market_watch_searches")
        .insert({
            user_profile_id: userProfileId,
            name,
            query_text: queryText,
            filters_json: filters,
            active: true,
        })
        .select()
        .single();

    if (err) return NextResponse.json({ error: err.message }, { status: 500 });
    return NextResponse.json({ search: data });
}

// DELETE /api/market-watch?id=<uuid>  — soft-delete (set active=false)
export async function DELETE(req: NextRequest) {
    const { userProfileId, error } = await getUserProfileId();
    if (!userProfileId) return NextResponse.json({ error }, { status: error === "Unauthorized" ? 401 : 404 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const { error: err } = await admin()
        .from("market_watch_searches")
        .update({ active: false })
        .eq("id", id)
        .eq("user_profile_id", userProfileId);

    if (err) return NextResponse.json({ error: err.message }, { status: 500 });
    return NextResponse.json({ success: true });
}
