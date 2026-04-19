import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { randomBytes, createHash } from "node:crypto";

export const maxDuration = 30;

/**
 * Admin Client-Impersonation.
 *
 *   POST /api/admin/impersonate       body: { user_profile_id }
 *     Mint a short-lived (30-minute) impersonation cookie. When the app
 *     resolves the logged-in user, it reads this cookie and swaps the
 *     effective user_profile_id for the admin session.
 *
 *   DELETE /api/admin/impersonate
 *     Clear the cookie — admin goes back to their own account.
 *
 *   GET /api/admin/impersonate
 *     Returns { impersonating, target: { id, company_name, contact_name } }
 *     so the impersonation banner in the dashboard knows what to render.
 *
 * Security:
 *   - Only accounts with account_type='admin' can start impersonation.
 *   - Cookie is httpOnly + secure + SameSite=Lax, 30-min maxAge.
 *   - Cookie value = HMAC-signed {admin_auth_user_id, target_user_profile_id, issued_at}
 *     so it can't be forged client-side.
 *   - Writes are always attributed to the admin in pipeline_activity /
 *     admin_opportunity_pushes via pushed_by_user_id.
 */

const COOKIE_NAME = "cp_admin_impersonate";
const COOKIE_TTL_SECS = 60 * 30;

function sign(payload: string): string {
    const secret = process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_KEY || "dev-secret";
    return createHash("sha256").update(`${secret}|${payload}`).digest("hex").slice(0, 32);
}

function encodeToken(adminAuthUserId: string, targetUserProfileId: string): string {
    const body = {
        a: adminAuthUserId,
        t: targetUserProfileId,
        i: Math.floor(Date.now() / 1000),
        n: randomBytes(6).toString("hex"),
    };
    const payload = Buffer.from(JSON.stringify(body)).toString("base64url");
    return `${payload}.${sign(payload)}`;
}

export function decodeToken(token: string | null | undefined): { adminAuthUserId: string; targetUserProfileId: string; issuedAt: number } | null {
    if (!token) return null;
    const [payload, sig] = token.split(".");
    if (!payload || !sig) return null;
    if (sign(payload) !== sig) return null;
    try {
        const body = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
        const age = Date.now() / 1000 - Number(body.i);
        if (age > COOKIE_TTL_SECS) return null;
        return {
            adminAuthUserId: String(body.a),
            targetUserProfileId: String(body.t),
            issuedAt: Number(body.i),
        };
    } catch {
        return null;
    }
}

async function loadAdmin(): Promise<{ ok: true; authUserId: string } | { ok: false; status: number; error: string }> {
    const cookieStore = await cookies();
    const sb = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll: () => cookieStore.getAll() } }
    );
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return { ok: false, status: 401, error: "Unauthorized" };

    const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data: profile } = await admin
        .from("user_profiles")
        .select("account_type")
        .eq("auth_user_id", user.id)
        .single();

    if (!profile || (profile as { account_type: string }).account_type !== "admin") {
        return { ok: false, status: 403, error: "Forbidden — admin only" };
    }
    return { ok: true, authUserId: user.id };
}

export async function POST(req: NextRequest) {
    const admin = await loadAdmin();
    if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: admin.status });

    const body = await req.json().catch(() => ({}));
    const targetId = (body.user_profile_id as string)?.trim();
    if (!targetId) return NextResponse.json({ error: "user_profile_id required" }, { status: 400 });

    const db = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data: target } = await db
        .from("user_profiles")
        .select("id, company_name, contact_name")
        .eq("id", targetId)
        .single();
    if (!target) return NextResponse.json({ error: "Target profile not found" }, { status: 404 });

    const token = encodeToken(admin.authUserId, targetId);
    const res = NextResponse.json({
        impersonating: true,
        target,
        expires_in_seconds: COOKIE_TTL_SECS,
    });
    res.cookies.set(COOKIE_NAME, token, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        maxAge: COOKIE_TTL_SECS,
        path: "/",
    });
    return res;
}

export async function DELETE() {
    const res = NextResponse.json({ impersonating: false });
    res.cookies.delete(COOKIE_NAME);
    return res;
}

export async function GET(req: NextRequest) {
    const token = req.cookies.get(COOKIE_NAME)?.value;
    const decoded = decodeToken(token);
    if (!decoded) return NextResponse.json({ impersonating: false });

    const db = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data: target } = await db
        .from("user_profiles")
        .select("id, company_name, contact_name, account_type")
        .eq("id", decoded.targetUserProfileId)
        .single();

    return NextResponse.json({
        impersonating: true,
        target,
        issued_at: decoded.issuedAt,
    });
}

export const COOKIE = COOKIE_NAME;
