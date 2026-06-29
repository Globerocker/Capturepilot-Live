import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendCockpitEmail } from "@/lib/email";
import { findKitItem } from "@/lib/startup-pack-assets";
import { protectCrawl } from "@/lib/protect-crawl";

/**
 * POST /api/startup-pack/email-link  { email, itemId? }
 *
 * No-cookie fallback for the /kit/<id> deep-links inside the guide PDFs.
 * Looks up the buyer's most recent non-refunded purchase by email and EMAILS
 * them their existing download link (optionally anchored to the requested
 * item). The access_token is NEVER returned to the browser — that would let
 * anyone type a buyer's email and walk into their kit. Always responds
 * { ok: true } regardless of whether the email matched (enumeration-safe).
 */
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.capturepilot.com";

export async function POST(req: NextRequest) {
    const limited = await protectCrawl(req, { route: "startup-pack/email-link", maxPerMin: 6 });
    if (limited) return limited;

    let email = "";
    let itemId = "";
    try {
        const body = await req.json();
        email = String(body.email || "").trim().toLowerCase();
        itemId = String(body.itemId || "").trim();
    } catch {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        return NextResponse.json({ error: "Enter a valid email" }, { status: 400 });
    }

    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
    );

    const { data } = await sb
        .from("startup_pack_purchases")
        .select("access_token, refunded_at, company_name")
        .ilike("email", email)
        .order("purchased_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (data?.access_token && !data.refunded_at) {
        const item = itemId ? findKitItem(itemId) : undefined;
        const anchor = item ? `#kit-${item.id}` : "";
        const link = `${APP_URL}/startup-pack/download/${data.access_token}${anchor}`;
        const what = item ? `the <strong>${item.title}</strong> section of your` : "your";
        const html = `
            <div style="font-family:system-ui,Segoe UI,Helvetica,Arial,sans-serif;color:#1c1917;line-height:1.6;max-width:520px">
              <p>Here's the link back to ${what} Federal Launch Kit.</p>
              <p><a href="${link}" style="display:inline-block;background:#059669;color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:12px">Open my kit</a></p>
              <p style="font-size:13px;color:#78716c">If the button doesn't work, paste this into your browser:<br>${link}</p>
              <p style="font-size:13px;color:#78716c">Bookmark it. This is your permanent download library.</p>
            </div>`;
        try {
            await sendCockpitEmail({
                from: process.env.FROM_EMAIL || "CapturePilot <noreply@capturepilot.com>",
                to: email,
                subject: "Your Federal Launch Kit link",
                html,
            });
        } catch (err) {
            console.error("[email-link] send failed:", err);
            // Still return ok:true — we don't reveal match status to the caller.
        }
    }

    return NextResponse.json({ ok: true });
}
