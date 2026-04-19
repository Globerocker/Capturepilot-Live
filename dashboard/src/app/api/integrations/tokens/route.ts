import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { generateToken } from "@/lib/api-token";

export const maxDuration = 30;

async function getUserProfileId(): Promise<string | null> {
    const cookieStore = await cookies();
    const sb = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll: () => cookieStore.getAll() } }
    );
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return null;

    const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data } = await admin.from("user_profiles").select("id").eq("auth_user_id", user.id).single();
    return (data?.id as string) || null;
}

function admin() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
}

// GET — list current user's tokens (prefix only, never raw)
export async function GET() {
    const userProfileId = await getUserProfileId();
    if (!userProfileId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data } = await admin()
        .from("api_tokens")
        .select("id, token_prefix, kind, label, last_used_at, expires_at, revoked_at, created_at")
        .eq("user_profile_id", userProfileId)
        .order("created_at", { ascending: false });

    return NextResponse.json({ tokens: data || [] });
}

// POST — create a new token. Returns the raw value ONCE.
// Body: { kind: "mcp" | "zapier" | "api", label?: string, expires_days?: number }
export async function POST(req: NextRequest) {
    const userProfileId = await getUserProfileId();
    if (!userProfileId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const kind = (body.kind as "mcp" | "zapier" | "api") || "api";
    if (!["mcp", "zapier", "api"].includes(kind)) {
        return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
    }
    const label = ((body.label as string) || `${kind.toUpperCase()} token`).slice(0, 80);
    const expiresDays = Number(body.expires_days) > 0 ? Number(body.expires_days) : null;

    const { raw, hash, prefix } = generateToken(kind);

    const expiresAt = expiresDays
        ? new Date(Date.now() + expiresDays * 24 * 60 * 60 * 1000).toISOString()
        : null;

    const { data, error } = await admin()
        .from("api_tokens")
        .insert({
            user_profile_id: userProfileId,
            token_prefix: prefix,
            token_hash: hash,
            kind,
            label,
            expires_at: expiresAt,
        })
        .select("id, token_prefix, kind, label, expires_at, created_at")
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
        token: raw,
        warning: "Copy this token now — it will not be shown again.",
        meta: data,
    });
}

// DELETE /api/integrations/tokens?id=<uuid>  — revoke
export async function DELETE(req: NextRequest) {
    const userProfileId = await getUserProfileId();
    if (!userProfileId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const { error } = await admin()
        .from("api_tokens")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_profile_id", userProfileId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
}
