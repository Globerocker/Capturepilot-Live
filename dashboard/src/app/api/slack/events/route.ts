import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 30;

/**
 * Slack Events + Slash Command handler.
 *
 * Handles two payload types from Slack:
 *   1. url_verification  (one-time challenge on app install)
 *   2. event_callback    (user-facing app mentions)
 *   3. slash-command form-encoded POSTs (/capturepilot <query>)
 *
 * All requests are signed by Slack with X-Slack-Signature (HMAC-SHA256).
 * We verify against SLACK_SIGNING_SECRET.
 *
 * Workspace → CapturePilot mapping: slack_workspaces table (team_id → user_profile_id)
 * is created on first OAuth callback. For MVP we accept the workspace_id in the command
 * text and resolve via a shared admin key.
 */

function verifySignature(req: Request, rawBody: string): boolean {
    const signingSecret = process.env.SLACK_SIGNING_SECRET;
    if (!signingSecret) return false;
    const ts = req.headers.get("x-slack-request-timestamp") || "";
    const sig = req.headers.get("x-slack-signature") || "";
    if (!ts || !sig) return false;

    // 5-minute replay window
    const age = Math.abs(Date.now() / 1000 - Number(ts));
    if (age > 300) return false;

    const expected = `v0=${createHmac("sha256", signingSecret).update(`v0:${ts}:${rawBody}`).digest("hex")}`;
    const a = Buffer.from(expected);
    const b = Buffer.from(sig);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
}

function admin() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
}

async function handleQuery(query: string): Promise<string> {
    const q = query.trim().toLowerCase();
    const db = admin();

    // "/capturepilot hot" → top HOT matches from any user tied to this workspace
    // For MVP we surface the most-recent HOT classifications globally — ties to
    // a specific user come with the OAuth install flow in a later iteration.
    if (q === "hot" || q === "matches") {
        const { data } = await db
            .from("opportunities")
            .select("title, department, response_deadline, award_amount")
            .in("status", ["ACTIVE", "EXPIRING_SOON"])
            .order("response_deadline", { ascending: true })
            .limit(5);
        if (!data?.length) return ":mag: No active opportunities found.";
        return data
            .map((o, i) => `*${i + 1}. ${o.title}* — ${o.department || "Agency"} · due ${String(o.response_deadline || "—").slice(0, 10)}`)
            .join("\n");
    }

    // "/capturepilot recompetes" → top 5 high-confidence recompetes
    if (q.startsWith("recompete")) {
        const { data } = await db
            .from("recompete_candidates")
            .select("incumbent_name, agency, naics_code, contract_end_date, months_to_end, confidence_score")
            .eq("confidence", "high")
            .order("confidence_score", { ascending: false })
            .limit(5);
        if (!data?.length) return ":radar: No high-confidence recompetes yet. Check back after Tuesday's scan.";
        return data
            .map(
                (r, i) =>
                    `*${i + 1}. ${r.incumbent_name || "?"}* (${r.agency || "?"}) — NAICS ${r.naics_code || "?"}, ends in ${r.months_to_end} mo.`,
            )
            .join("\n");
    }

    // Default: keyword search against opportunities
    if (q.length >= 3) {
        const { data } = await db
            .from("opportunities")
            .select("title, department, response_deadline")
            .or(`title.ilike.%${query}%,description.ilike.%${query}%`)
            .in("status", ["ACTIVE", "EXPIRING_SOON"])
            .limit(5);
        if (!data?.length) return `:mag: No opportunities match "${query}".`;
        return (
            `*Top 5 matches for "${query}":*\n` +
            data
                .map((o, i) => `${i + 1}. ${o.title} — ${o.department || "?"} (due ${String(o.response_deadline || "—").slice(0, 10)})`)
                .join("\n")
        );
    }

    return "Try `/capturepilot hot`, `/capturepilot recompetes`, or `/capturepilot <keyword>`.";
}

export async function POST(req: NextRequest) {
    const rawBody = await req.text();

    if (!verifySignature(req, rawBody)) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const contentType = req.headers.get("content-type") || "";

    // ── URL verification + Event API (JSON) ──
    if (contentType.includes("application/json")) {
        const body = JSON.parse(rawBody);

        if (body.type === "url_verification") {
            return new Response(body.challenge, { status: 200 });
        }

        if (body.type === "event_callback") {
            const event = body.event || {};
            if (event.type === "app_mention") {
                // Echo a short acknowledgement; a richer reply would require
                // chat.postMessage with a Slack bot token (installed workspace).
                const text = String(event.text || "").replace(/<@[A-Z0-9]+>/g, "").trim();
                const reply = await handleQuery(text);
                return NextResponse.json({ text: reply });
            }
        }

        return NextResponse.json({ ok: true });
    }

    // ── Slash command (x-www-form-urlencoded) ──
    if (contentType.includes("application/x-www-form-urlencoded")) {
        const params = new URLSearchParams(rawBody);
        const command = params.get("command") || "";
        const text = params.get("text") || "";
        if (command === "/capturepilot") {
            const response = await handleQuery(text);
            return NextResponse.json({
                response_type: "ephemeral",
                text: response,
            });
        }
        return NextResponse.json({ response_type: "ephemeral", text: "Unknown command." });
    }

    return NextResponse.json({ error: "Unsupported content-type" }, { status: 415 });
}
