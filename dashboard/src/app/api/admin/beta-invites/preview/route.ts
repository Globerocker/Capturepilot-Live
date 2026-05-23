import { NextRequest, NextResponse } from "next/server";
import { renderBetaInviteEmail } from "@/lib/email";
import { assertAdmin } from "@/lib/auth-admin";

/**
 * POST /api/admin/beta-invites/preview — render a preview of the invite email.
 * Uses a dummy token so the CTA has a realistic (but non-routable) link.
 * Returns { subject, html } so the admin page can iframe-srcDoc it.
 */
export async function POST(req: NextRequest) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;
    try {
        const body = await req.json();
        const { recipient_name, company_name, personal_note, overrides } = body;

        const { subject, html } = renderBetaInviteEmail({
            recipientName: recipient_name,
            companyName: company_name,
            personalNote: personal_note,
            token: "PREVIEW_TOKEN",
            overrides: overrides
                ? {
                      subject: overrides.subject,
                      eyebrow: overrides.eyebrow,
                      heading: overrides.heading,
                      ctaLabel: overrides.ctaLabel,
                      introLine: overrides.introLine,
                  }
                : undefined,
        });

        return NextResponse.json({ subject, html });
    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
