import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signedDocUrl } from "@/lib/signed-doc-url";

/**
 * GET /api/documents/signed-url?path=...
 *
 * Mints a short-lived signed URL for a file in the private `client-docs`
 * bucket. Requires the caller to be authenticated. Storage RLS gates
 * which paths a given user can access.
 *
 * Used by:
 *   - /documents (dashboard) — view / download own uploaded docs
 *   - /portal/documents (consulting portal) — same, client side
 *   - /portal/messages (consulting portal) — open message attachments
 */
export async function GET(req: NextRequest) {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const path = url.searchParams.get("path");
    if (!path) return NextResponse.json({ error: "path required" }, { status: 400 });

    const ttlSec = Number(url.searchParams.get("ttl") || "300");
    const signedUrl = await signedDocUrl(supabase, path, Number.isFinite(ttlSec) ? ttlSec : 300);

    if (!signedUrl) {
        return NextResponse.json({ error: "Failed to sign URL" }, { status: 403 });
    }
    return NextResponse.json({ url: signedUrl });
}
