import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * GET (one-click unsubscribe — RFC 8058) and POST handlers for the CAN-SPAM
 * footer link. Token-only lookup so the recipient never needs to log in.
 *
 * Behavior:
 *   1. Resolve prospect by unsubscribe_token.
 *   2. Insert the prospect's email into outreach_optouts (idempotent).
 *   3. Flip the prospect status to 'opted_out'.
 *   4. Cancel any scheduled sequence steps.
 *   5. Redirect to /unsubscribed confirmation page (or return JSON for POST).
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

    const { data: prospect } = await admin
        .from("outreach_prospects")
        .select("id, primary_email, company_name")
        .eq("unsubscribe_token", token)
        .maybeSingle();
    const p = prospect as { id: string; primary_email: string | null; company_name: string } | null;

    if (!p) {
        // Generic success — don't leak whether the token exists. Compliant unsub
        // always appears to succeed from the recipient's perspective.
        if (method === "GET") {
            const url = new URL("/unsubscribed", req.url);
            url.searchParams.set("ok", "1");
            return NextResponse.redirect(url);
        }
        return NextResponse.json({ ok: true });
    }

    if (p.primary_email) {
        await admin.from("outreach_optouts").upsert(
            { email: p.primary_email.toLowerCase(), reason: "one-click unsubscribe" },
            { onConflict: "email" },
        );
    }
    await admin.from("outreach_prospects")
        .update({ status: "opted_out", updated_at: new Date().toISOString() })
        .eq("id", p.id);
    // Cancel any not-yet-sent steps so nothing slips through.
    await admin.from("outreach_sequence_state")
        .update({ status: "skipped", error_msg: "opted out", updated_at: new Date().toISOString() })
        .eq("prospect_id", p.id)
        .eq("status", "scheduled");

    if (method === "GET") {
        const url = new URL("/unsubscribed", req.url);
        url.searchParams.set("ok", "1");
        return NextResponse.redirect(url);
    }
    return NextResponse.json({ ok: true });
}

export async function GET(req: NextRequest) { return handle(req, "GET"); }
export async function POST(req: NextRequest) { return handle(req, "POST"); }
