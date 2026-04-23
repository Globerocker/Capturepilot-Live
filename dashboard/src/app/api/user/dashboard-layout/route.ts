import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/user/dashboard-layout
 * Body: { hidden?: string[], order?: string[] }
 * Persists the caller's dashboard layout under user_profiles.notes.dashboard_layout.
 */
export async function POST(req: NextRequest) {
    const cookieStore = await cookies();
    const sb = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll: () => cookieStore.getAll() } },
    );
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const hidden = Array.isArray(body.hidden) ? body.hidden.filter((x: unknown) => typeof x === "string").slice(0, 50) : [];
    const order = Array.isArray(body.order) ? body.order.filter((x: unknown) => typeof x === "string").slice(0, 50) : [];

    const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
    );

    const { data: profile } = await admin
        .from("user_profiles")
        .select("id, notes")
        .eq("auth_user_id", user.id)
        .single();
    if (!profile) return NextResponse.json({ error: "No profile" }, { status: 404 });

    const p = profile as { id: string; notes: Record<string, unknown> | null };
    const notes = { ...(p.notes || {}), dashboard_layout: { hidden, order } };

    const { error: upErr } = await admin.from("user_profiles").update({ notes }).eq("id", p.id);
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    return NextResponse.json({ ok: true, layout: { hidden, order } });
}
