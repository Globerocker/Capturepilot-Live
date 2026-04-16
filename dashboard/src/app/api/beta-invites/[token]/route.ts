import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getAdmin() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
    );
}

/**
 * GET /api/beta-invites/[token] — public invite lookup for the signup page.
 * Returns the invite's email/name/company so signup can prefill + personalize.
 * No auth — knowing the unguessable token is the authorization.
 */
export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ token: string }> }
) {
    const { token } = await params;
    if (!token) return NextResponse.json({ error: "Token required" }, { status: 400 });

    const admin = getAdmin();
    const { data, error } = await admin
        .from("beta_invites")
        .select("email, recipient_name, company_name, claimed_at, expires_at")
        .eq("token", token)
        .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Invite not found" }, { status: 404 });

    const expired = data.expires_at && new Date(data.expires_at).getTime() < Date.now();
    if (expired) return NextResponse.json({ error: "Invite expired" }, { status: 410 });

    return NextResponse.json({
        email: data.email,
        recipient_name: data.recipient_name,
        company_name: data.company_name,
        claimed: !!data.claimed_at,
    });
}

/**
 * POST /api/beta-invites/[token] — mark invite as claimed.
 * Called from the signup flow right after the user account is created.
 * Body: { auth_user_id }
 */
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ token: string }> }
) {
    const { token } = await params;
    if (!token) return NextResponse.json({ error: "Token required" }, { status: 400 });

    const { auth_user_id } = await req.json().catch(() => ({}));

    const admin = getAdmin();
    const { data, error } = await admin
        .from("beta_invites")
        .update({
            claimed_at: new Date().toISOString(),
            claimed_by: auth_user_id || null,
        })
        .eq("token", token)
        .is("claimed_at", null)
        .select("id")
        .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, already_claimed: !data });
}
