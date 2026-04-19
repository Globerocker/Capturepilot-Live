/**
 * API token helpers — used by MCP server + Zapier integration.
 *
 * Tokens are stored in api_tokens table as SHA-256 hashes; the raw token is
 * only shown once on creation. Prefix (first 8 chars) is kept for UI display.
 */
import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export interface ApiToken {
    id: string;
    user_profile_id: string;
    token_prefix: string;
    kind: "mcp" | "zapier" | "api";
    label: string | null;
    last_used_at: string | null;
    expires_at: string | null;
    revoked_at: string | null;
}

export function hashToken(raw: string): string {
    return createHash("sha256").update(raw).digest("hex");
}

export function generateToken(kind: "mcp" | "zapier" | "api"): {
    raw: string;
    hash: string;
    prefix: string;
} {
    const prefix = kind === "mcp" ? "cp_mcp" : kind === "zapier" ? "cp_zap" : "cp_api";
    const random = randomBytes(24).toString("base64url");
    const raw = `${prefix}_${random}`;
    return {
        raw,
        hash: hashToken(raw),
        prefix: raw.slice(0, 12),
    };
}

function adminClient() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
}

/**
 * Resolves a bearer token to its owning user_profile_id. Returns null if the
 * token is unknown, revoked, or expired. Touches last_used_at on hit.
 */
export async function resolveToken(
    rawToken: string | null | undefined,
    kind?: "mcp" | "zapier" | "api"
): Promise<{ userProfileId: string; tokenId: string; tokenKind: string } | null> {
    if (!rawToken) return null;
    const hash = hashToken(rawToken.trim());

    const admin = adminClient();
    let query = admin
        .from("api_tokens")
        .select("id, user_profile_id, kind, revoked_at, expires_at")
        .eq("token_hash", hash)
        .is("revoked_at", null)
        .single();

    const { data } = await query;
    if (!data) return null;

    const t = data as {
        id: string;
        user_profile_id: string;
        kind: string;
        revoked_at: string | null;
        expires_at: string | null;
    };

    if (kind && t.kind !== kind) return null;
    if (t.expires_at && new Date(t.expires_at) < new Date()) return null;

    // Fire-and-forget touch
    admin.from("api_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", t.id).then();

    return {
        userProfileId: t.user_profile_id,
        tokenId: t.id,
        tokenKind: t.kind,
    };
}

export function extractBearer(headerValue: string | null): string | null {
    if (!headerValue) return null;
    const match = headerValue.match(/^Bearer\s+(.+)$/i);
    return match ? match[1].trim() : null;
}
