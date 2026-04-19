/**
 * Server-side helper to check whether an admin is currently impersonating a
 * client, and to resolve the effective user_profile_id for a request.
 *
 * The cookie is set by POST /api/admin/impersonate and signed there — we
 * re-verify the signature on every read to prevent tampering.
 */
import { createHash } from "node:crypto";

export const IMPERSONATE_COOKIE = "cp_admin_impersonate";
const COOKIE_TTL_SECS = 60 * 30;

function sign(payload: string): string {
    const secret = process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_KEY || "dev-secret";
    return createHash("sha256").update(`${secret}|${payload}`).digest("hex").slice(0, 32);
}

export function decodeImpersonateToken(token: string | null | undefined): {
    adminAuthUserId: string;
    targetUserProfileId: string;
    issuedAt: number;
} | null {
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
