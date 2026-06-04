/**
 * Admin changelog PATCH + DELETE — per-entry edit/remove.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertAdmin } from "@/lib/auth-admin";

export const runtime = "nodejs";

function sb() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));

    // Whitelist updatable fields — never let title/slug change become a SQL trick.
    const patch: Record<string, unknown> = {};
    if (typeof body.title === "string") patch.title = body.title.trim();
    if (typeof body.body_md === "string") patch.body_md = body.body_md;
    if (typeof body.category === "string" && ["feature", "fix", "improvement", "breaking"].includes(body.category)) {
        patch.category = body.category;
    }
    if (typeof body.published === "boolean") patch.published = body.published;
    if (typeof body.released_at === "string") patch.released_at = body.released_at;
    if (typeof body.cover_image_url === "string" || body.cover_image_url === null) {
        patch.cover_image_url = body.cover_image_url;
    }

    if (Object.keys(patch).length === 0) {
        return NextResponse.json({ error: "no updatable fields" }, { status: 400 });
    }

    const { error } = await sb().from("changelog_entries").update(patch).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;
    const { id } = await ctx.params;
    const { error } = await sb().from("changelog_entries").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}
