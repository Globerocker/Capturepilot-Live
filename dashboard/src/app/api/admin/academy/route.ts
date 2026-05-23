import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertAdmin } from "@/lib/auth-admin";

export const maxDuration = 30;

function getAdmin() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
    );
}

type VideoProvider = "youtube" | "vimeo" | "loom" | "mux" | "other";

function detectVideoMeta(url: string | null | undefined): {
    provider: VideoProvider | null;
    embedId: string | null;
    thumbnail: string | null;
} {
    if (!url) return { provider: null, embedId: null, thumbnail: null };
    try {
        const u = new URL(url);
        const host = u.hostname.replace(/^www\./, "");

        // YouTube — full + short + embed URLs
        if (host === "youtube.com" || host === "m.youtube.com") {
            const v = u.searchParams.get("v");
            if (v) return { provider: "youtube", embedId: v, thumbnail: `https://i.ytimg.com/vi/${v}/hqdefault.jpg` };
            const m = u.pathname.match(/\/embed\/([^/?]+)/);
            if (m) return { provider: "youtube", embedId: m[1], thumbnail: `https://i.ytimg.com/vi/${m[1]}/hqdefault.jpg` };
        }
        if (host === "youtu.be") {
            const id = u.pathname.slice(1);
            if (id) return { provider: "youtube", embedId: id, thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` };
        }

        // Vimeo — thumbnail requires oEmbed lookup, so we leave it null here
        if (host === "vimeo.com" || host === "player.vimeo.com") {
            const m = u.pathname.match(/\/(?:video\/)?(\d+)/);
            if (m) return { provider: "vimeo", embedId: m[1], thumbnail: null };
        }

        // Loom
        if (host === "loom.com" || host === "www.loom.com") {
            const m = u.pathname.match(/\/share\/([a-z0-9]+)/i);
            if (m) return { provider: "loom", embedId: m[1], thumbnail: null };
        }

        return { provider: "other", embedId: null, thumbnail: null };
    } catch {
        return { provider: null, embedId: null, thumbnail: null };
    }
}

/**
 * GET /api/admin/academy
 *   ?slug=<slug> — single row (incl. drafts)
 *   (no params)  — list all (published + drafts)
 */
export async function GET(req: NextRequest) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;
    const { searchParams } = new URL(req.url);
    const slug = searchParams.get("slug");
    const admin = getAdmin();

    const cols =
        "id, slug, title, excerpt, body_md, category, reading_minutes, featured, " +
        "teaser_public, cover_image_url, author_name, published_at, updated_at, " +
        "content_type, video_url, video_provider, video_embed_id, duration_seconds, thumbnail_url";

    if (slug) {
        const { data, error } = await admin
            .from("academy_articles")
            .select(cols)
            .eq("slug", slug)
            .maybeSingle();
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });
        return NextResponse.json({ article: data });
    }

    const { data, error } = await admin
        .from("academy_articles")
        .select(cols)
        .order("updated_at", { ascending: false })
        .limit(200);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ articles: data || [] });
}

/** POST /api/admin/academy — create */
export async function POST(req: NextRequest) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;
    const body = await req.json();
    const {
        slug, title, excerpt, body_md, category, reading_minutes,
        featured, teaser_public, cover_image_url, author_name,
        content_type, video_url, duration_seconds, publish,
    } = body;

    if (!slug || !title) {
        return NextResponse.json({ error: "slug and title are required" }, { status: 400 });
    }

    const type = (content_type === "video" ? "video" : "article") as "article" | "video";
    const videoMeta = type === "video" ? detectVideoMeta(video_url) : { provider: null, embedId: null, thumbnail: null };

    const row = {
        slug,
        title,
        excerpt: excerpt || null,
        body_md: body_md || null,
        category: category || "playbook",
        reading_minutes: reading_minutes ?? null,
        featured: !!featured,
        teaser_public: teaser_public === undefined ? true : !!teaser_public,
        cover_image_url: cover_image_url || videoMeta.thumbnail || null,
        author_name: author_name || "CapturePilot Team",
        content_type: type,
        video_url: video_url || null,
        video_provider: videoMeta.provider,
        video_embed_id: videoMeta.embedId,
        duration_seconds: duration_seconds ?? null,
        thumbnail_url: videoMeta.thumbnail,
        published_at: publish ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
    };

    const admin = getAdmin();
    const { data, error } = await admin
        .from("academy_articles")
        .insert(row)
        .select()
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ article: data });
}

/** PATCH /api/admin/academy — update by slug (slug stays the same unless `new_slug` given) */
export async function PATCH(req: NextRequest) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;
    const body = await req.json();
    const { slug, new_slug, ...rest } = body as Record<string, unknown>;
    if (!slug || typeof slug !== "string") {
        return NextResponse.json({ error: "slug is required" }, { status: 400 });
    }

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const allowed = [
        "title", "excerpt", "body_md", "category", "reading_minutes",
        "featured", "teaser_public", "cover_image_url", "author_name",
        "content_type", "video_url", "duration_seconds", "published_at",
    ] as const;
    for (const k of allowed) if (k in rest) update[k] = rest[k];

    if (new_slug && typeof new_slug === "string" && new_slug !== slug) {
        update.slug = new_slug;
    }

    // Recompute video metadata whenever url or type changed
    if ("video_url" in rest || "content_type" in rest) {
        const meta = detectVideoMeta(
            (("video_url" in rest ? (rest.video_url as string) : null) as string | null) ?? null
        );
        update.video_provider = meta.provider;
        update.video_embed_id = meta.embedId;
        // Only overwrite the thumbnail when we have a new one; keep author uploads otherwise
        if (meta.thumbnail) update.thumbnail_url = meta.thumbnail;
    }

    const admin = getAdmin();
    const { data, error } = await admin
        .from("academy_articles")
        .update(update)
        .eq("slug", slug)
        .select()
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ article: data });
}

/** DELETE /api/admin/academy?slug=… */
export async function DELETE(req: NextRequest) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;
    const { searchParams } = new URL(req.url);
    const slug = searchParams.get("slug");
    if (!slug) return NextResponse.json({ error: "slug is required" }, { status: 400 });

    const admin = getAdmin();
    const { error } = await admin.from("academy_articles").delete().eq("slug", slug);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}
