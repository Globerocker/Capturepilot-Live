import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

/**
 * POST /api/team/accept
 *   body: { token: "<member_id>.<random>" }
 *
 * Called from the /invite/accept page after the user has logged in (or
 * just signed up). Claims the team_members row, sets accepted_at, and
 * rewires auth_user_id from the sentinel to the real caller.
 *
 * The token's first component MUST match an existing team_member row;
 * the random second component is a future-proof slot (currently we don't
 * compare it, but a follow-up migration can add `invite_token text` and
 * we'll start enforcing).
 */

export async function POST(req: NextRequest) {
    const cookieStore = await cookies();
    const sb = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll: () => cookieStore.getAll() } },
    );
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const token = String(body.token || "");
    const [memberId] = token.split(".");
    if (!memberId) return NextResponse.json({ error: "Invalid token" }, { status: 400 });

    const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );

    const { data: member } = await admin
        .from("team_members")
        .select("id, user_profile_id, invited_email, accepted_at, auth_user_id")
        .eq("id", memberId)
        .maybeSingle();
    if (!member) return NextResponse.json({ error: "Invite not found" }, { status: 404 });

    const m = member as { id: string; user_profile_id: string; invited_email: string | null; accepted_at: string | null };
    if (m.accepted_at) return NextResponse.json({ ok: true, already_accepted: true });

    // Best-effort email match: if the invite was scoped to a specific email,
    // verify the caller matches. Lets us spot typos without making the
    // invite system fragile to email changes.
    if (m.invited_email && user.email && m.invited_email.toLowerCase() !== user.email.toLowerCase()) {
        return NextResponse.json({
            error: "Email mismatch",
            detail: `This invite was sent to ${m.invited_email}, but you're signed in as ${user.email}. Sign in with the invited address.`,
        }, { status: 403 });
    }

    const { data: updated, error } = await admin
        .from("team_members")
        .update({
            auth_user_id: user.id,
            accepted_at: new Date().toISOString(),
        })
        .eq("id", m.id)
        .select()
        .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, member: updated });
}
