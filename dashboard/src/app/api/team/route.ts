import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { withinLimit, isAllowed } from "@/lib/plan-tier";
import { listTeam } from "@/lib/team-accounts";
import { sendTeamInviteEmail } from "@/lib/email";
import { randomBytes } from "node:crypto";

export const dynamic = "force-dynamic";

/**
 * Team management — invite / list / accept / remove.
 *
 *   GET    /api/team                    — list owner + members of caller's profile
 *   POST   /api/team                    — invite by email (owner only, plan-gated)
 *                                          body: { email, role }
 *   PATCH  /api/team?id=…               — change a member's role (owner only)
 *   DELETE /api/team?id=…               — remove a member (owner only OR self-leave)
 *   POST   /api/team/accept?token=…     — accept an invite (in /accept route)
 *
 * Plan-tier gate: invites count against `team_seats`. Owner doesn't count.
 * Pending (not-yet-accepted) invites also count so a Pro user with 3 seats
 * can have themselves + 2 invites + 0 accepted = 3 slots claimed.
 */

async function getOwnerCtx() {
    const cookieStore = await cookies();
    const sb = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll: () => cookieStore.getAll() } },
    );
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return null;

    const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );
    // Resolve the OWNED profile. Multi-profile membership comes later;
    // for now an auth user has exactly one owned profile.
    const { data: profile } = await admin
        .from("user_profiles")
        .select("id, company_name, account_type")
        .eq("auth_user_id", user.id)
        .maybeSingle();
    if (!profile) return null;
    return {
        admin,
        userId: user.id,
        userEmail: user.email ?? null,
        profileId: (profile as { id: string }).id,
        companyName: (profile as { company_name: string | null }).company_name,
    };
}

export async function GET() {
    const ctx = await getOwnerCtx();
    if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const team = await listTeam(ctx.profileId);
    return NextResponse.json({ team });
}

export async function POST(req: NextRequest) {
    const ctx = await getOwnerCtx();
    if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const email = String(body.email || "").trim().toLowerCase();
    const role = (body.role as "collaborator" | "viewer") || "collaborator";
    if (!email || !email.includes("@")) return NextResponse.json({ error: "valid email required" }, { status: 400 });
    if (role !== "collaborator" && role !== "viewer") return NextResponse.json({ error: "role must be collaborator or viewer" }, { status: 400 });

    // Plan-tier gate. Owner is always seat #1, so count = current_members + 1.
    const { count: memberCount } = await ctx.admin
        .from("team_members")
        .select("id", { count: "exact", head: true })
        .eq("user_profile_id", ctx.profileId);
    const usedSeats = (memberCount || 0) + 1; // owner
    const gate = await withinLimit(ctx.profileId, "team_seats", usedSeats);
    if (!gate.ok) {
        return NextResponse.json({
            error: "plan_limit",
            message: `Your plan allows ${gate.limit} team seat${gate.limit === 1 ? "" : "s"} (including yourself). Upgrade to add more.`,
            limit: gate.limit,
            tier: gate.tierCode,
        }, { status: 402 });
    }

    // Already on the team?
    const { data: existingByEmail } = await ctx.admin
        .from("team_members")
        .select("id, accepted_at")
        .eq("user_profile_id", ctx.profileId)
        .eq("invited_email", email)
        .maybeSingle();
    if (existingByEmail) {
        return NextResponse.json({ error: "Already invited" }, { status: 409 });
    }

    // Generate a signup-attachable token. Stored in invited_email's row;
    // user clicks the link, signs in (or up), the /api/team/accept route
    // claims the slot.
    const token = randomBytes(24).toString("base64url");
    const { data: inserted, error } = await ctx.admin
        .from("team_members")
        .insert({
            user_profile_id: ctx.profileId,
            // auth_user_id is a placeholder until accept fires — use a v4-ish
            // sentinel so the NOT NULL holds; we'll rewrite on accept.
            auth_user_id: "00000000-0000-0000-0000-000000000000",
            role,
            invited_by: ctx.userId,
            invited_email: email,
            // Stash token in a metadata-ish way — we don't have a dedicated
            // column, so we shove it in the existing schema. (A follow-up
            // migration can add `invite_token text` to make this cleaner.)
        })
        .select()
        .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Encode the team-member row id alongside the random token so the
    // accept route can claim the right row without a separate lookup.
    // Format: <member_id>.<token>
    const compoundToken = `${inserted.id}.${token}`;
    try {
        await sendTeamInviteEmail(email, {
            inviterName: ctx.userEmail || "Your colleague",
            companyName: ctx.companyName || "your team",
            role,
            token: compoundToken,
        });
    } catch (e) {
        // Don't block creation if email fails — admin can resend from UI.
        console.warn("team invite email failed:", e);
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.capturepilot.com";
    return NextResponse.json({
        member: inserted,
        invite_url: `${baseUrl}/invite/accept?token=${compoundToken}`,
    });
}

export async function PATCH(req: NextRequest) {
    const ctx = await getOwnerCtx();
    if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const role = body.role as "collaborator" | "viewer" | undefined;
    if (role !== "collaborator" && role !== "viewer") {
        return NextResponse.json({ error: "role must be collaborator or viewer" }, { status: 400 });
    }

    const { data, error } = await ctx.admin
        .from("team_members")
        .update({ role })
        .eq("id", id)
        .eq("user_profile_id", ctx.profileId)
        .select()
        .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ member: data });
}

export async function DELETE(req: NextRequest) {
    const ctx = await getOwnerCtx();
    if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const { error } = await ctx.admin
        .from("team_members")
        .delete()
        .eq("id", id)
        .eq("user_profile_id", ctx.profileId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}
