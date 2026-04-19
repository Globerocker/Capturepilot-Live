import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 30;

/**
 * Slack OAuth v2 callback.
 *
 * Exchanges the code for a bot token via oauth.v2.access, then upserts
 * the install into slack_installations. Final redirect sends the user
 * back to /settings/integrations with a ?slack=installed flag.
 */

interface SlackOauthResponse {
    ok: boolean;
    error?: string;
    app_id?: string;
    bot_user_id?: string;
    access_token?: string;           // xoxb-... bot token
    token_type?: string;
    scope?: string;
    team?: { id: string; name: string };
    enterprise?: { id: string; name: string } | null;
    authed_user?: { id: string; scope?: string; access_token?: string };
}

function parseState(raw: string | null): { user_profile_id: string; nonce: string } | null {
    if (!raw) return null;
    try {
        const json = Buffer.from(raw, "base64url").toString("utf8");
        return JSON.parse(json);
    } catch {
        return null;
    }
}

export async function GET(req: NextRequest) {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = parseState(url.searchParams.get("state"));
    const errorParam = url.searchParams.get("error");
    const base = process.env.NEXT_PUBLIC_APP_URL || url.origin;

    if (errorParam || !code || !state) {
        return NextResponse.redirect(new URL(`/settings/integrations?slack=error&reason=${errorParam || "missing_code"}`, base));
    }

    const cookieNonce = req.cookies.get("cp_slack_nonce")?.value;
    if (!cookieNonce || cookieNonce !== state.nonce) {
        return NextResponse.redirect(new URL(`/settings/integrations?slack=error&reason=state_mismatch`, base));
    }

    const clientId = process.env.SLACK_CLIENT_ID;
    const clientSecret = process.env.SLACK_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
        return NextResponse.redirect(new URL(`/settings/integrations?slack=error&reason=not_configured`, base));
    }

    const redirectUri = `${base}/api/slack/oauth/callback`;

    const form = new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
    });

    const exchange = await fetch("https://slack.com/api/oauth.v2.access", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
    });

    const data = (await exchange.json()) as SlackOauthResponse;
    if (!data.ok) {
        return NextResponse.redirect(
            new URL(`/settings/integrations?slack=error&reason=${encodeURIComponent(data.error || "exchange_failed")}`, base)
        );
    }

    const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const teamId = data.team?.id;
    if (!teamId || !data.access_token) {
        return NextResponse.redirect(new URL(`/settings/integrations?slack=error&reason=no_team_or_token`, base));
    }

    await admin.from("slack_installations").upsert(
        {
            team_id: teamId,
            team_name: data.team?.name || null,
            enterprise_id: data.enterprise?.id || null,
            enterprise_name: data.enterprise?.name || null,
            bot_user_id: data.bot_user_id || null,
            bot_token: data.access_token,
            user_id: data.authed_user?.id || null,
            scopes: (data.scope || "").split(",").filter(Boolean),
            user_profile_id: state.user_profile_id,
            app_id: data.app_id || null,
            installed_at: new Date().toISOString(),
            uninstalled_at: null,
            raw_response: data as unknown as Record<string, unknown>,
        },
        { onConflict: "team_id" }
    );

    const res = NextResponse.redirect(new URL(`/settings/integrations?slack=installed`, base));
    res.cookies.delete("cp_slack_nonce");
    return res;
}
