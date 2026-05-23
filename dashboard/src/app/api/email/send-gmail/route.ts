/**
 * Send an outreach email directly from the user's own Gmail account via the
 * Google OAuth provider_token Supabase already stores when the user signs in
 * with Google.
 *
 * Why provider_token over a service account: SDVOSB / 8(a) / federal sales
 * outreach has stronger deliverability + trust signal when it comes from the
 * sender's own primary domain. The user already authorized Gmail scopes at
 * login (gmail.send), so we just forward.
 *
 * POST /api/email/send-gmail
 *   body: { to, subject, body, opportunityId? }
 *
 * Returns 200 with { message_id } on success, 401 if the user has no
 * provider_token (re-auth required), 502 with Google's error body on failure.
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

function buildRfc822({ to, from, subject, body }: { to: string; from: string; subject: string; body: string }): string {
    // Plain text email. Gmail accepts text/plain or text/html.
    const lines = [
        `From: ${from}`,
        `To: ${to}`,
        `Subject: ${subject}`,
        "MIME-Version: 1.0",
        "Content-Type: text/plain; charset=UTF-8",
        "Content-Transfer-Encoding: 7bit",
        "",
        body,
    ];
    return lines.join("\r\n");
}

// Gmail wants base64url-encoded raw message.
function toBase64Url(s: string): string {
    return Buffer.from(s, "utf8").toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}

export async function POST(req: NextRequest) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() { return cookieStore.getAll(); },
                setAll() { /* read-only */ },
            },
        },
    );
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // provider_token is the Google OAuth access_token Supabase keeps on the
    // session. It only exists for users who signed in with Google AND
    // accepted the gmail.send scope.
    const providerToken = session.provider_token;
    if (!providerToken) {
        return NextResponse.json({
            error: "No Google access token — sign out and sign back in with Google to enable Gmail send.",
        }, { status: 401 });
    }

    let body: { to?: string; subject?: string; body?: string; opportunityId?: string } = {};
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const to = body.to?.trim();
    const subject = body.subject?.trim();
    const text = body.body?.trim();
    if (!to || !subject || !text) {
        return NextResponse.json({ error: "to, subject, body are all required" }, { status: 400 });
    }
    if (!/^[^@]+@[^@]+\.[^@]+$/.test(to)) {
        return NextResponse.json({ error: "Invalid recipient email" }, { status: 400 });
    }

    const from = session.user.email || "me";
    const raw = toBase64Url(buildRfc822({ to, from, subject, body: text }));

    try {
        const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${providerToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ raw }),
            signal: AbortSignal.timeout(20000),
        });
        const data = await res.json().catch(() => ({} as Record<string, unknown>));
        if (!res.ok) {
            const errMsg = (data as { error?: { message?: string } }).error?.message || `HTTP ${res.status}`;
            // 401/403 from Google = token revoked or insufficient scope
            const code = res.status === 401 || res.status === 403 ? 401 : 502;
            return NextResponse.json({ error: `Gmail: ${errMsg}` }, { status: code });
        }
        // Best-effort: log the send so the user has an outreach trail
        try {
            const { data: profile } = await supabase
                .from("user_profiles")
                .select("id")
                .eq("auth_user_id", session.user.id)
                .maybeSingle();
            const profileId = (profile as { id?: string } | null)?.id;
            if (profileId) {
                await supabase.from("sent_emails").insert({
                    user_profile_id: profileId,
                    recipient_email: to,
                    subject,
                    body_preview: text.slice(0, 500),
                    opportunity_id: body.opportunityId || null,
                    provider: "gmail",
                    provider_message_id: (data as { id?: string }).id || null,
                    sent_at: new Date().toISOString(),
                });
            }
        } catch {
            // sent_emails table may not exist on every env; don't block the send
        }
        return NextResponse.json({
            success: true,
            message_id: (data as { id?: string }).id || null,
            thread_id: (data as { threadId?: string }).threadId || null,
        });
    } catch (e) {
        return NextResponse.json({ error: (e as Error).message || "Send failed" }, { status: 502 });
    }
}
