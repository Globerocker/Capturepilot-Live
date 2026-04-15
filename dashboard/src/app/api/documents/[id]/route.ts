import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * PATCH /api/documents/[id]  — update name / category / tags / linked_pursuit_id
 * DELETE /api/documents/[id] — delete record (and storage file if storage_path present)
 */

async function getProfileId() {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { supabase, profileId: null as string | null };
    const { data: profile } = await supabase
        .from("user_profiles").select("id").eq("auth_user_id", user.id).single();
    return { supabase, profileId: (profile as { id: string } | null)?.id ?? null };
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const { id } = await ctx.params;
    const { supabase, profileId } = await getProfileId();
    if (!profileId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

    const updates: Record<string, unknown> = {};
    const allowed = ["proposal", "capability", "cert", "reference", "template", "other"];
    if (typeof body.name === "string") updates.name = body.name;
    if (typeof body.category === "string" && allowed.includes(body.category)) updates.category = body.category;
    if (Array.isArray(body.tags)) updates.tags = body.tags;
    if (body.linked_pursuit_id === null || typeof body.linked_pursuit_id === "string") updates.linked_pursuit_id = body.linked_pursuit_id;
    if (typeof body.content === "string") updates.content = body.content;
    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
        .from("user_documents")
        .update(updates)
        .eq("id", id)
        .eq("user_profile_id", profileId)
        .select("*")
        .single();

    if (error) {
        console.error("[api/documents PATCH] failed:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ document: data });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const { id } = await ctx.params;
    const { supabase, profileId } = await getProfileId();
    if (!profileId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Fetch doc to get storage path
    const { data: doc } = await supabase
        .from("user_documents")
        .select("storage_path")
        .eq("id", id)
        .eq("user_profile_id", profileId)
        .single();

    // Delete from storage (best effort)
    const storagePath = (doc as { storage_path: string | null } | null)?.storage_path;
    if (storagePath) {
        const { error: storageErr } = await supabase.storage.from("client-docs").remove([storagePath]);
        if (storageErr) console.warn("[api/documents DELETE] storage remove failed:", storageErr.message);
    }

    const { error } = await supabase
        .from("user_documents")
        .delete()
        .eq("id", id)
        .eq("user_profile_id", profileId);

    if (error) {
        console.error("[api/documents DELETE] failed:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
}
