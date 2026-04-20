import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Token-based unsubscribe for beta-invite / marketing emails. Works without
 * login — the recipient should never have to sign in to opt out.
 *
 * Behavior:
 *   1. Resolve beta_invites row by token.
 *   2. Mark the invite as revoked (expires_at = now, revoked flag).
 *   3. Insert the email into outreach_optouts (idempotent) so the same
 *      address can't be re-invited by mistake.
 *   4. Redirect to /unsubscribed (GET) or return JSON (POST).
 *
 * Matches the RFC 8058 one-click-unsubscribe pattern already used by
 * /api/outreach/unsubscribe.
 */
async function handle(req: NextRequest, method: "GET" | "POST") {
    const token = method === "GET"
        ? req.nextUrl.searchParams.get("token")
        : new URLSearchParams(await req.text()).get("token") || req.nextUrl.searchParams.get("token");

    if (!token) {
        return NextResponse.json({ error: "token required" }, { status: 400 });
    }

    const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );

    const { data: inviteRow } = await admin
        .from("beta_invites")
        .select("id, email")
        .eq("token", token)
        .maybeSingle();
    const invite = inviteRow as { id: string; email: string } | null;

    // Generic success — don't leak whether the token exists.
    const redirectToConfirm = () => {
        const url = new URL("/unsubscribed", req.url);
        url.searchParams.set("ok", "1");
        return NextResponse.redirect(url);
    };

    if (!invite) {
        return method === "GET" ? redirectToConfirm() : NextResponse.json({ ok: true });
    }

    const nowIso = new Date().toISOString();
    await admin.from("beta_invites")
        .update({ expires_at: nowIso })
        .eq("id", invite.id);

    if (invite.email) {
        await admin.from("outreach_optouts").upsert(
            { email: invite.email.toLowerCase(), reason: "beta-invite unsubscribe" },
            { onConflict: "email" },
        );
    }

    return method === "GET" ? redirectToConfirm() : NextResponse.json({ ok: true });
}

export async function GET(req: NextRequest) { return handle(req, "GET"); }
export async function POST(req: NextRequest) { return handle(req, "POST"); }
