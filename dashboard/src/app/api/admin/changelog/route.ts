/**
 * Admin changelog API. Used by /admin/changelog page to CRUD entries
 * without a code deploy.
 *
 *   GET  /api/admin/changelog          → list ALL entries (incl. drafts)
 *   POST /api/admin/changelog          → create (body: { slug, title, body_md, category?, released_at?, published?, cover_image_url? })
 *   PATCH /api/admin/changelog/[id]    → update (handled in [id]/route.ts)
 *   DELETE /api/admin/changelog/[id]   → delete (handled in [id]/route.ts)
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

export async function GET() {
    const unauth = await assertAdmin();
    if (unauth) return unauth;
    const { data, error } = await sb()
        .from("changelog_entries")
        .select("*")
        .order("released_at", { ascending: false })
        .limit(200);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ entries: data || [] });
}

export async function POST(req: NextRequest) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;
    const body = await req.json().catch(() => ({}));
    const slug = String(body.slug || "").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
    const title = String(body.title || "").trim();
    const body_md = String(body.body_md || "").trim();
    const category = ["feature", "fix", "improvement", "breaking"].includes(body.category) ? body.category : "feature";
    const released_at = body.released_at || new Date().toISOString();
    const published = !!body.published;

    if (!slug || !title || !body_md) {
        return NextResponse.json({ error: "slug, title, and body_md are required" }, { status: 400 });
    }

    const { data, error } = await sb()
        .from("changelog_entries")
        .insert({
            slug, title, body_md, category, released_at, published,
            cover_image_url: body.cover_image_url || null,
            author_email: body.author_email || null,
        })
        .select("id, slug")
        .single();
    if (error) {
        // 23505 = unique violation on slug
        if ((error as { code?: string }).code === "23505") {
            return NextResponse.json({ error: `slug "${slug}" already exists` }, { status: 409 });
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, ...data }, { status: 201 });
}
