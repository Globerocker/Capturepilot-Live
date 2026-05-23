import { createClient } from "@supabase/supabase-js";

/**
 * Team-account helpers — foundation for multi-user-per-profile access.
 *
 * Migration 071 introduced `team_members` (user_profile_id, auth_user_id,
 * role). The owner is implicit (user_profiles.auth_user_id); additional
 * collaborators live in this table.
 *
 * IMPORTANT: this file ships the LIBRARY. The UI to invite teammates,
 * accept invites, and view the team is intentionally a stub — it's a
 * multi-week feature that needs its own dedicated session. Don't enable
 * the routes that depend on this lib until that work is in.
 */

export type TeamRole = "owner" | "collaborator" | "viewer";

const ROLE_RANK: Record<TeamRole, number> = {
    viewer: 1,
    collaborator: 2,
    owner: 3,
};

function svc() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );
}

/**
 * Returns the role an auth-user has on a given profile, or null if they
 * have no access. The profile's owner (auth_user_id) always returns
 * "owner" without a team_members row needed.
 */
export async function resolveRole(authUserId: string, userProfileId: string): Promise<TeamRole | null> {
    const sb = svc();
    // Owner check first — cheaper than the team_members hit.
    const { data: profile } = await sb
        .from("user_profiles")
        .select("auth_user_id")
        .eq("id", userProfileId)
        .maybeSingle();
    if ((profile as { auth_user_id?: string } | null)?.auth_user_id === authUserId) return "owner";

    const { data: member } = await sb
        .from("team_members")
        .select("role, accepted_at")
        .eq("user_profile_id", userProfileId)
        .eq("auth_user_id", authUserId)
        .maybeSingle();
    const m = member as { role: TeamRole; accepted_at: string | null } | null;
    if (!m) return null;
    if (!m.accepted_at) return null; // pending invite — not yet active
    return m.role;
}

/**
 * Higher-order guard for API routes. Returns the role on success, throws
 * a Response (401/403) on failure so the handler can early-return.
 *
 * Usage:
 *   const role = await requireRole(authUserId, profileId, "collaborator");
 *   if (role instanceof Response) return role;
 */
export async function requireRole(
    authUserId: string,
    userProfileId: string,
    minimum: TeamRole,
): Promise<TeamRole | Response> {
    const role = await resolveRole(authUserId, userProfileId);
    if (!role) {
        return new Response(JSON.stringify({ error: "Forbidden — not a team member" }), {
            status: 403,
            headers: { "Content-Type": "application/json" },
        });
    }
    if (ROLE_RANK[role] < ROLE_RANK[minimum]) {
        return new Response(JSON.stringify({ error: `Forbidden — ${minimum} required, you are ${role}` }), {
            status: 403,
            headers: { "Content-Type": "application/json" },
        });
    }
    return role;
}

/**
 * List active + pending members of a profile. Owner is materialized as
 * row #0 from user_profiles so callers don't need a second query.
 */
export async function listTeam(userProfileId: string) {
    const sb = svc();
    const [{ data: profile }, { data: members }] = await Promise.all([
        sb.from("user_profiles")
            .select("id, auth_user_id, email, contact_name, company_name")
            .eq("id", userProfileId)
            .maybeSingle(),
        sb.from("team_members")
            .select("id, auth_user_id, role, invited_by, invited_email, accepted_at, created_at")
            .eq("user_profile_id", userProfileId)
            .order("created_at", { ascending: true }),
    ]);

    if (!profile) return null;

    const owner = {
        kind: "owner" as const,
        auth_user_id: (profile as { auth_user_id: string }).auth_user_id,
        email: (profile as { email: string | null }).email,
        contact_name: (profile as { contact_name: string | null }).contact_name,
        role: "owner" as TeamRole,
        accepted_at: null as string | null,
    };

    const collaborators = (members || []).map(m => ({
        kind: "member" as const,
        id: (m as { id: string }).id,
        auth_user_id: (m as { auth_user_id: string }).auth_user_id,
        invited_email: (m as { invited_email: string | null }).invited_email,
        role: (m as { role: TeamRole }).role,
        accepted_at: (m as { accepted_at: string | null }).accepted_at,
    }));

    return { owner, members: collaborators };
}
