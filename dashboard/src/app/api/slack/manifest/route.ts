import { NextResponse } from "next/server";

/**
 * GET /api/slack/manifest
 *
 * Returns a Slack App Manifest YAML ready to paste into api.slack.com/apps.
 * Generates the URLs dynamically from the current host so dev + prod both
 * stamp the right endpoints.
 */
export async function GET(req: Request) {
    const url = new URL(req.url);
    const base = process.env.NEXT_PUBLIC_APP_URL || `${url.protocol}//${url.host}`;

    const manifest = {
        display_information: {
            name: "CapturePilot",
            description:
                "Federal government-contracting intelligence — opportunity search, capture briefs, recompete radar, past performance.",
            background_color: "#059669",
        },
        features: {
            bot_user: {
                display_name: "CapturePilot",
                always_online: true,
            },
            slash_commands: [
                {
                    command: "/capturepilot",
                    url: `${base}/api/slack/events`,
                    description: "Search federal contracts from Slack",
                    usage_hint: "hot | recompetes | <keyword>",
                    should_escape: false,
                },
            ],
        },
        oauth_config: {
            scopes: {
                bot: ["commands", "chat:write", "app_mentions:read"],
            },
        },
        settings: {
            event_subscriptions: {
                request_url: `${base}/api/slack/events`,
                bot_events: ["app_mention"],
            },
            org_deploy_enabled: false,
            socket_mode_enabled: false,
            token_rotation_enabled: false,
        },
    };

    return new NextResponse(JSON.stringify(manifest, null, 2), {
        status: 200,
        headers: {
            "Content-Type": "application/json",
            "Content-Disposition": 'attachment; filename="slack-app-manifest.json"',
        },
    });
}
