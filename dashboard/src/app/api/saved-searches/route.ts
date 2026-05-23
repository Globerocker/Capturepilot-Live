import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { withinLimit } from "@/lib/plan-tier";

export const dynamic = "force-dynamic";

/**
 * Saved Searches CRUD — replaces the prior pass-the-profile-id-in-the-body
 * endpoint (no auth, anyone could write to anyone's profile). This version
 * resolves the profile from the auth session and gates writes on
 * plan_tier.max_saved_searches.
 *
 *   GET    /api/saved-searches           — list the caller's searches
 *   POST   /api/saved-searches           — create (plan-tier gated)
 *   PATCH  /api/saved-searches?id=…      — name / filters / alert_enabled
 *   DELETE /api/saved-searches?id=…      — remove
 *
 * `filters` is whatever shape the /matches page emits — we persist
 * verbatim. The notify cron re-applies it to count new matches.
 */

async function getProfile() {
    const cookieStore = await cookies();
    const sb = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll: () => cookieStore.getAll() } },
    );
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return null;
    const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );
    const { data: profile } = await admin
        .from("user_profiles")
        .select("id")
        .eq("auth_user_id", user.id)
        .maybeSingle();
    if (!profile) return null;
    return { admin, profileId: (profile as { id: string }).id, userId: user.id };
}

export async function GET() {
    const ctx = await getProfile();
    if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { data, error } = await ctx.admin
        .from("saved_searches")
        .select("id, name, filters, alert_enabled, last_alert_at, new_match_count, created_at")
        .eq("user_profile_id", ctx.profileId)
        .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ searches: data || [] });
}

export async function POST(req: NextRequest) {
    const ctx = await getProfile();
    if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const name = String(body.name || "").trim();
    const filters = body.filters;
    const alertEnabled = body.alert_enabled !== false;
    if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
    if (!filters || typeof filters !== "object") return NextResponse.json({ error: "filters object required" }, { status: 400 });

    // Plan-tier gate — count current saved searches against the limit.
    const { count } = await ctx.admin
        .from("saved_searches")
        .select("id", { count: "exact", head: true })
        .eq("user_profile_id", ctx.profileId);
    const gate = await withinLimit(ctx.profileId, "max_saved_searches", count || 0);
    if (!gate.ok) {
        return NextResponse.json({
            error: "plan_limit",
            message: `Your plan allows ${gate.limit} saved search${gate.limit === 1 ? "" : "es"}. Upgrade to add more.`,
            limit: gate.limit,
            tier: gate.tierCode,
        }, { status: 402 });
    }

    const { data, error } = await ctx.admin
        .from("saved_searches")
        .insert({
            user_profile_id: ctx.profileId,
            name,
            filters,
            alert_enabled: alertEnabled,
        })
        .select()
        .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ search: data });
}

export async function PATCH(req: NextRequest) {
    const ctx = await getProfile();
    if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id query param required" }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const patch: Record<string, unknown> = {};
    if (typeof body.name === "string") patch.name = body.name.trim();
    if (typeof body.alert_enabled === "boolean") patch.alert_enabled = body.alert_enabled;
    if (body.filters && typeof body.filters === "object") patch.filters = body.filters;
    if (Object.keys(patch).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

    const { data, error } = await ctx.admin
        .from("saved_searches")
        .update(patch)
        .eq("id", id)
        .eq("user_profile_id", ctx.profileId)
        .select()
        .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ search: data });
}

export async function DELETE(req: NextRequest) {
    const ctx = await getProfile();
    if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id query param required" }, { status: 400 });

    const { error } = await ctx.admin
        .from("saved_searches")
        .delete()
        .eq("id", id)
        .eq("user_profile_id", ctx.profileId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}
