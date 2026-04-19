import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

export const maxDuration = 30;

/**
 * Slack OAuth v2 install flow.
 *
 * Step 1 — GET /api/slack/install
 *   Signed-in user hits this from /settings/integrations. We mint a nonce
 *   that encodes their user_profile_id, stash it in a short-lived cookie,
 *   and redirect them to Slack's authorize URL.
 *
 * Step 2 — GET /api/slack/oauth/callback?code=...&state=...
 *   Slack redirects back here. We verify state == cookie, exchange the
 *   code at oauth.v2.access, and upsert the resulting bot-token into
 *   slack_installations keyed by team_id + user_profile_id.
 *
 * Env:
 *   SLACK_CLIENT_ID
 *   SLACK_CLIENT_SECRET
 *   SLACK_SIGNING_SECRET (used by the events route)
 *   NEXT_PUBLIC_APP_URL
 */

const SCOPES = [
    "commands",
    "chat:write",
    "app_mentions:read",
].join(",");

export async function GET(req: NextRequest) {
    const cookieStore = await cookies();
    const sb = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll: () => cookieStore.getAll() } }
    );
    const { data: { user } } = await sb.auth.getUser();
    if (!user) {
        const url = new URL(req.url);
        return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(url.pathname)}`, url));
    }

    const clientId = process.env.SLACK_CLIENT_ID;
    if (!clientId) {
        return NextResponse.json(
            { error: "SLACK_CLIENT_ID not configured. Create an app at api.slack.com/apps and set env vars." },
            { status: 501 }
        );
    }

    const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data: profile } = await admin
        .from("user_profiles")
        .select("id")
        .eq("auth_user_id", user.id)
        .single();
    if (!profile) return NextResponse.json({ error: "No profile" }, { status: 404 });

    const nonce = randomBytes(16).toString("hex");
    const state = Buffer.from(
        JSON.stringify({ user_profile_id: (profile as { id: string }).id, nonce })
    ).toString("base64url");

    const base = process.env.NEXT_PUBLIC_APP_URL || `${new URL(req.url).origin}`;
    const redirectUri = `${base}/api/slack/oauth/callback`;

    const authorize = new URL("https://slack.com/oauth/v2/authorize");
    authorize.searchParams.set("client_id", clientId);
    authorize.searchParams.set("scope", SCOPES);
    authorize.searchParams.set("redirect_uri", redirectUri);
    authorize.searchParams.set("state", state);

    const res = NextResponse.redirect(authorize);
    res.cookies.set("cp_slack_nonce", nonce, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        maxAge: 600,
        path: "/",
    });
    return res;
}
