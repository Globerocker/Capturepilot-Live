/**
 * Admin-only test-pitch endpoint.
 *
 * POST /api/admin/backlinks/test-pitch
 *   { to: "info@example.com", angle: "contractor_profile" | "editorial" | "resource_list", mock?: {...} }
 *
 * Generates a pitch via the SAME generatePitch() function the autosender
 * uses, then ships it via Resend to the `to` address. Subject prefixed
 * with "[TEST]" so you can spot it in your inbox.
 *
 * Useful for previewing pitch variants without burning real prospects.
 */

import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { generatePitch } from "@/lib/backlinks/draft-generator";
import { assertAdmin } from "@/lib/auth-admin";

export const runtime = "nodejs";
export const maxDuration = 60;

interface MockProspect {
    prospect_domain: string;
    prospect_category: string;
    prospect_tier: number;
    contact_name: string | null;
    contact_role: string | null;
    pitch_angle: string;
    link_target_url: string;
    link_anchor_suggestion: string | null;
    recent_context_snippet?: string | null;
}

const PRESETS: Record<string, MockProspect> = {
    contractor_profile: {
        prospect_domain: "americurial.com",
        prospect_category: "contractor_profile",
        prospect_tier: 2,
        contact_name: "Andre",
        contact_role: "marketing",
        pitch_angle: "contractor_profile",
        link_target_url: "https://www.capturepilot.com/contractors/americurial-llc",
        link_anchor_suggestion: "Americurial LLC",
        recent_context_snippet: "Ranked #3 in NAICS 541512 (Computer Systems Design Services) with $14.2M in lifetime federal awards. Top customer agency: Department of Defense.",
    },
    editorial: {
        prospect_domain: "americurial.com",
        prospect_category: "editorial",
        prospect_tier: 2,
        contact_name: "Andre",
        contact_role: "editor",
        pitch_angle: "guest_post",
        link_target_url: "https://capturepilot.com/resources/agency-pain-points",
        link_anchor_suggestion: "8 agency pain points small contractors can solve in 2026",
        recent_context_snippet: "Their recent piece on SDVOSB set-aside trends is the kind of content where my 8-pain-points framework would slot in naturally.",
    },
    resource_list: {
        prospect_domain: "americurial.com",
        prospect_category: "resource_list",
        prospect_tier: 3,
        contact_name: "Andre",
        contact_role: "marketing",
        pitch_angle: "resource_inclusion",
        link_target_url: "https://www.capturepilot.com/contractors",
        link_anchor_suggestion: "CapturePilot Federal Contractor Directory",
        recent_context_snippet: "Their existing 'Tools for Small Business Federal Contracting' resource roundup is missing a free directory option — we're free, public, no signup wall.",
    },
};

export async function POST(req: NextRequest) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;

    const body = await req.json().catch(() => ({}));
    const to = String(body.to || "").trim();
    const angle = String(body.angle || "contractor_profile") as keyof typeof PRESETS;
    if (!to) return NextResponse.json({ error: "to required" }, { status: 400 });
    const preset = PRESETS[angle];
    if (!preset) return NextResponse.json({ error: `unknown angle '${angle}'. Try: ${Object.keys(PRESETS).join(", ")}` }, { status: 400 });

    const mock = { ...preset, ...(body.mock as Partial<MockProspect> || {}) };

    // Generate the actual pitch via the same path the autosender uses.
    const pitch = await generatePitch(mock);

    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) return NextResponse.json({ error: "RESEND_API_KEY missing" }, { status: 500 });
    const resend = new Resend(resendKey);

    const { data, error } = await resend.emails.send({
        from: process.env.BACKLINK_OUTREACH_FROM || "Andre Schüler <andre@capturepilot.com>",
        to,
        replyTo: "andre@capturepilot.com",
        subject: `[TEST · ${angle}] ${pitch.subject}`,
        text: pitch.body_text,
        html: pitch.body_html,
    });

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({
        ok: true,
        sent_to: to,
        angle,
        resend_message_id: data?.id,
        preview: {
            subject: pitch.subject,
            body_text: pitch.body_text,
        },
    });
}
