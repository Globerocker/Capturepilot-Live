import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { sendTeamInviteEmail } from "@/lib/email";
import { seatsFor } from "@/lib/seat-limits";

export const maxDuration = 30;

/**
 * POST /api/team/invite
 * Body: { email: string, role: "admin" | "member" | "viewer", feature_access?: Record<string, boolean> }
 *
 * Creates a profile_invitations row and emails the recipient an accept link.
 * Seat limits (free=1, starter=3, pro=10, enterprise=999) are enforced before
 * inserting — the owner counts toward the cap.
 */
export async function POST(req: NextRequest) {
    const cookieStore = await cookies();
    const authSupabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll: () => cookieStore.getAll() } }
    );
    const { data: { user } } = await authSupabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({})) as {
        email?: string; role?: string; feature_access?: Record<string, boolean>;
    };
    const email = (body.email || "").toString().trim().toLowerCase();
    const role = ["admin", "member", "viewer"].includes(body.role || "") ? body.role! : "member";
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return NextResponse.json({ error: "Valid email required" }, { status: 400 });
    }

    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
    const { data: p } = await admin
        .from("user_profiles")
        .select("id, company_name, plan_tier, contact_name")
        .eq("auth_user_id", user.id)
        .maybeSingle();
    const profile = p as { id: string; company_name: string; plan_tier: string | null; contact_name: string | null } | null;
    if (!profile) return NextResponse.json({ error: "No profile" }, { status: 404 });

    // ─── Seat-limit check ───────────────────────────────────
    // Owner (1) + current accepted members + pending invites must not exceed
    // the plan's seat count. Accepted + pending are counted together because
    // a pending invite still reserves a seat the owner has committed to.
    const seatCap = seatsFor(profile.plan_tier);
    const [{ count: memberCount }, { count: pendingCount }] = await Promise.all([
        admin.from("profile_members")
            .select("*", { count: "exact", head: true })
            .eq("profile_id", profile.id),
        admin.from("profile_invitations")
            .select("*", { count: "exact", head: true })
            .eq("profile_id", profile.id)
            .is("accepted_at", null)
            .gt("expires_at", new Date().toISOString()),
    ]);
    const currentSeats = 1 + (memberCount || 0) + (pendingCount || 0);
    if (currentSeats >= seatCap) {
        return NextResponse.json({
            error: `Seat limit reached (${seatCap} seats on your ${profile.plan_tier || "free"} plan). Upgrade to invite more teammates.`,
            seats_used: currentSeats,
            seat_cap: seatCap,
        }, { status: 402 });
    }

    // Prevent duplicate invites to the same email (active/pending).
    const { data: existing } = await admin
        .from("profile_invitations")
        .select("id, expires_at, accepted_at")
        .eq("profile_id", profile.id)
        .eq("email", email)
        .maybeSingle();
    if (existing) {
        const row = existing as { id: string; expires_at: string; accepted_at: string | null };
        if (!row.accepted_at && row.expires_at > new Date().toISOString()) {
            return NextResponse.json({ error: "An invitation to this email is already pending." }, { status: 409 });
        }
    }

    const token = randomBytes(24).toString("hex");

    const { data: inviteRow, error } = await admin.from("profile_invitations").insert({
        profile_id: profile.id,
        email,
        role,
        feature_access: body.feature_access || {},
        token,
        invited_by: user.id,
    }).select("id, token").single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Fire the email. If Resend fails we still return success — the owner can
    // resend manually. We surface the error in the response so the UI can toast.
    let emailStatus: "sent" | "failed" = "sent";
    let emailError: string | null = null;
    try {
        await sendTeamInviteEmail(email, {
            inviterName: profile.contact_name || user.email || "Your teammate",
            companyName: profile.company_name,
            role,
            token: inviteRow.token,
        });
    } catch (e) {
        emailStatus = "failed";
        emailError = (e as Error).message;
    }

    return NextResponse.json({
        success: true,
        invitation_id: inviteRow.id,
        email_status: emailStatus,
        email_error: emailError,
    });
}
