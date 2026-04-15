import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * GET  /api/documents                 — list current user's documents (optional ?category, ?search, ?tag)
 * POST /api/documents                 — create doc record (expects file already uploaded to Storage)
 *   body: { name, category, file_url?, storage_path?, file_size?, mime_type?, content?, tags?, linked_pursuit_id? }
 */

async function getProfileId() {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { supabase, profileId: null as string | null };
    const { data: profile } = await supabase
        .from("user_profiles")
        .select("id")
        .eq("auth_user_id", user.id)
        .single();
    return { supabase, profileId: (profile as { id: string } | null)?.id ?? null };
}

export async function GET(req: NextRequest) {
    const { supabase, profileId } = await getProfileId();
    if (!profileId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const category = url.searchParams.get("category");
    const search = url.searchParams.get("search");
    const tag = url.searchParams.get("tag");

    let q = supabase
        .from("user_documents")
        .select("*")
        .eq("user_profile_id", profileId)
        .order("created_at", { ascending: false });

    if (category && category !== "all") q = q.eq("category", category);
    if (search) q = q.ilike("name", `%${search}%`);
    if (tag) q = q.contains("tags", [tag]);

    const { data, error } = await q;
    if (error) {
        console.error("[api/documents GET] failed:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ documents: data || [] });
}

export async function POST(req: NextRequest) {
    const { supabase, profileId } = await getProfileId();
    if (!profileId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

    const { name, category, file_url, storage_path, file_size, mime_type, content, tags, linked_pursuit_id } = body as {
        name?: string;
        category?: string;
        file_url?: string;
        storage_path?: string;
        file_size?: number;
        mime_type?: string;
        content?: string;
        tags?: string[];
        linked_pursuit_id?: string | null;
    };

    if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

    const allowed = ["proposal", "capability", "cert", "reference", "template", "other"];
    const cat = allowed.includes(category || "") ? category : "other";

    const { data, error } = await supabase
        .from("user_documents")
        .insert({
            user_profile_id: profileId,
            name,
            category: cat,
            file_url: file_url ?? null,
            storage_path: storage_path ?? null,
            file_size: file_size ?? null,
            mime_type: mime_type ?? null,
            content: content ?? null,
            tags: Array.isArray(tags) ? tags : [],
            linked_pursuit_id: linked_pursuit_id ?? null,
        })
        .select("*")
        .single();

    if (error) {
        console.error("[api/documents POST] failed:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ document: data });
}
