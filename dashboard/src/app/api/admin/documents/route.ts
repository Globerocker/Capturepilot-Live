import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getAdmin() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
    );
}

/**
 * GET /api/admin/documents?user_profile_id=xxx
 */
export async function GET(req: NextRequest) {
    const profileId = req.nextUrl.searchParams.get("user_profile_id");
    const admin = getAdmin();

    let query = admin.from("client_documents").select("*").order("created_at", { ascending: false });
    if (profileId) query = query.eq("user_profile_id", profileId);

    const { data, error } = await query.limit(100);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ documents: data || [] });
}

/**
 * POST /api/admin/documents — Create document record (after upload to storage)
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { user_profile_id, filename, file_url, file_size, mime_type, category, description } = body;

        if (!user_profile_id || !filename || !file_url) {
            return NextResponse.json({ error: "user_profile_id, filename, file_url required" }, { status: 400 });
        }

        const admin = getAdmin();
        const { data, error } = await admin.from("client_documents").insert({
            user_profile_id,
            filename,
            file_url,
            file_size: file_size || null,
            mime_type: mime_type || null,
            category: category || "general",
            description: description || null,
        }).select("id").single();

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        await admin.from("client_activity_log").insert({
            user_profile_id,
            action: "document_uploaded",
            description: `Document uploaded: ${filename}`,
        });

        return NextResponse.json({ success: true, document_id: data.id });
    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}

/**
 * DELETE /api/admin/documents?id=xxx
 */
export async function DELETE(req: NextRequest) {
    const docId = req.nextUrl.searchParams.get("id");
    if (!docId) return NextResponse.json({ error: "id required" }, { status: 400 });

    const admin = getAdmin();
    const { error } = await admin.from("client_documents").delete().eq("id", docId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
}
