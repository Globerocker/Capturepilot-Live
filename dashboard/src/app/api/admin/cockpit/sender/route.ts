/**
 * GET  /api/admin/cockpit/sender — returns the configured cockpit sender, or
 *      sensible '[set me]' placeholder defaults when none is stored yet.
 * POST /api/admin/cockpit/sender — upsert the cockpit sender row.
 *
 * The cockpit sends cold lead-in emails AS the operator (Sergio), not from the
 * platform noreply@ address. That sender identity is stored once in
 * outreach_settings under key='cockpit_sender' as a jsonb value:
 *
 *   {
 *     from_email,         // required before any send is allowed
 *     from_name,
 *     reply_to,
 *     footer_html,        // optional extra HTML appended inside the footer block
 *     physical_address    // CAN-SPAM physical mailing address
 *   }
 *
 * The human fills from_email later. /api/admin/cockpit/send-email refuses to
 * send until from_email is set and non-placeholder (no '[' character).
 *
 * Admin-gated via assertAdmin().
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertAdmin } from "@/lib/auth-admin";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const runtime = "nodejs";
export const maxDuration = 30;

const SETTINGS_KEY = "cockpit_sender";

export interface CockpitSender {
    from_email: string;
    from_name: string;
    reply_to: string;
    footer_html: string;
    physical_address: string;
}

// Placeholders intentionally contain '[' so the send endpoint's
// "contains '['" guard treats an unconfigured sender as not-yet-set.
const DEFAULT_SENDER: CockpitSender = {
    from_email: "[set me] e.g. sergio@capturepilot.com",
    from_name: "Sergio · CapturePilot",
    reply_to: "",
    footer_html: "",
    physical_address: "CapturePilot, 1209 Orange Street, Wilmington, DE 19801",
};

function db() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );
}

export async function GET() {
    const unauth = await assertAdmin();
    if (unauth) return unauth;

    const { data, error } = await db()
        .from("outreach_settings")
        .select("value, updated_at")
        .eq("key", SETTINGS_KEY)
        .maybeSingle();

    if (error) {
        console.error("[cockpit/sender] GET failed:", error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const stored = (data?.value || {}) as Partial<CockpitSender>;
    // Merge over defaults so a partial row still returns a complete shape and
    // missing from_email surfaces as a placeholder the UI can flag.
    const sender: CockpitSender = {
        from_email: stored.from_email ?? DEFAULT_SENDER.from_email,
        from_name: stored.from_name ?? DEFAULT_SENDER.from_name,
        reply_to: stored.reply_to ?? DEFAULT_SENDER.reply_to,
        footer_html: stored.footer_html ?? DEFAULT_SENDER.footer_html,
        physical_address: stored.physical_address ?? DEFAULT_SENDER.physical_address,
    };

    const configured = isConfigured(sender.from_email);

    return NextResponse.json({
        sender,
        configured,
        updated_at: data?.updated_at ?? null,
    });
}

export async function POST(req: NextRequest) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;

    let body: Partial<CockpitSender>;
    try {
        body = (await req.json()) as Partial<CockpitSender>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const value: CockpitSender = {
        from_email: str(body.from_email),
        from_name: str(body.from_name) || DEFAULT_SENDER.from_name,
        reply_to: str(body.reply_to),
        footer_html: str(body.footer_html),
        physical_address: str(body.physical_address) || DEFAULT_SENDER.physical_address,
    };

    const { error } = await db()
        .from("outreach_settings")
        .upsert(
            { key: SETTINGS_KEY, value, updated_at: new Date().toISOString() },
            { onConflict: "key" },
        );

    if (error) {
        console.error("[cockpit/sender] POST failed:", error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, sender: value, configured: isConfigured(value.from_email) });
}

// from_email is "configured" only when set and free of placeholder brackets.
function isConfigured(fromEmail: string | null | undefined): boolean {
    const v = (fromEmail || "").trim();
    return v.length > 0 && !v.includes("[") && v.includes("@");
}

function str(v: unknown): string {
    return typeof v === "string" ? v.trim() : "";
}
