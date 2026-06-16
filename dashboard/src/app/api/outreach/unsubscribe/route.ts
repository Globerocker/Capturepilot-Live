import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyEmailSig } from "@/lib/outreach/unsubscribe";

/**
 * GET (one-click unsubscribe — RFC 8058) and POST handlers for the CAN-SPAM
 * footer link. Two paths:
 *   A) email + sig  — the outreach_contacts cadence (HMAC-signed email).
 *   B) token        — the legacy prospect path (unsubscribe_token lookup).
 *
 * Either way the recipient never needs to log in, and we always appear to
 * succeed (don't leak whether an address/token exists).
 */
function done(req: NextRequest, method: "GET" | "POST") {
    if (method === "GET") {
        const url = new URL("/unsubscribed", req.url);
        url.searchParams.set("ok", "1");
        return NextResponse.redirect(url);
    }
    return NextResponse.json({ ok: true });
}

async function handle(req: NextRequest, method: "GET" | "POST") {
    const params = method === "GET"
        ? req.nextUrl.searchParams
        : new URLSearchParams(await req.text());

    const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );

    // ── Path A: signed-email unsubscribe (outreach_contacts cadence) ──
    const email = (params.get("email") || "").toLowerCase().trim();
    const sig = params.get("sig") || req.nextUrl.searchParams.get("sig") || "";
    if (email) {
        if (verifyEmailSig(email, sig)) {
            await admin.from("outreach_optouts").upsert(
                { email, reason: "one-click unsubscribe", source: "outreach:contact" },
                { onConflict: "email" },
            );
            await admin.from("outreach_contacts")
                .update({ opted_out_at: new Date().toISOString() })
                .eq("email", email);
            // Stop any in-flight cadence rows for this contact.
            const { data: contacts } = await admin
                .from("outreach_contacts").select("id").eq("email", email);
            const ids = (contacts || []).map((c: { id: string }) => c.id);
            if (ids.length) {
                await admin.from("outreach_campaign_contacts")
                    .update({ status: "unsubscribed", finished_at: new Date().toISOString() })
                    .in("contact_id", ids)
                    .in("status", ["active", "queued"]);
            }
        }
        // Always appear to succeed.
        return done(req, method);
    }

    // ── Path B: legacy prospect token ──
    const token = params.get("token") || req.nextUrl.searchParams.get("token");
    if (!token) {
        return NextResponse.json({ error: "token or email required" }, { status: 400 });
    }

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
