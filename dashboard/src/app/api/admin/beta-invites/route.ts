import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "crypto";
import { sendBetaInviteEmail } from "@/lib/email";

function getAdmin() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
    );
}

function generateToken(): string {
    return randomBytes(24).toString("base64url");
}

/**
 * POST /api/admin/beta-invites — create + email a beta invitation.
 * Body: { email, recipient_name, company_name, personal_note? }
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { email, recipient_name, company_name, personal_note, overrides, resend } = body;

        if (!email) {
            return NextResponse.json({ error: "Email is required" }, { status: 400 });
        }

        const admin = getAdmin();
        const normalizedEmail = email.trim().toLowerCase();

        // If an unclaimed invite already exists for this email, reuse its token (unless resend = refresh)
        const { data: existing } = await admin
            .from("beta_invites")
            .select("id, token, claimed_at")
            .eq("email", normalizedEmail)
            .is("claimed_at", null)
            .order("sent_at", { ascending: false })
            .limit(1)
            .maybeSingle();

        let inviteId: string;
        let token: string;

        if (existing && !resend) {
            inviteId = existing.id;
            token = existing.token;
            await admin.from("beta_invites").update({
                recipient_name: recipient_name || null,
                company_name: company_name || null,
                personal_note: personal_note || null,
                sent_at: new Date().toISOString(),
            }).eq("id", existing.id);
        } else {
            token = generateToken();
            const { data: inserted, error: insertErr } = await admin
                .from("beta_invites")
                .insert({
                    email: normalizedEmail,
                    recipient_name: recipient_name || null,
                    company_name: company_name || null,
                    personal_note: personal_note || null,
                    token,
                })
                .select("id")
                .single();

            if (insertErr || !inserted) {
                return NextResponse.json({ error: `Insert failed: ${insertErr?.message}` }, { status: 500 });
            }
            inviteId = inserted.id;
        }

        const sent = await sendBetaInviteEmail(normalizedEmail, {
            recipientName: recipient_name,
            companyName: company_name,
            personalNote: personal_note,
            token,
            overrides: overrides && typeof overrides === "object"
                ? {
                      subject: overrides.subject,
                      eyebrow: overrides.eyebrow,
                      heading: overrides.heading,
                      ctaLabel: overrides.ctaLabel,
                      introLine: overrides.introLine,
                  }
                : undefined,
        });

        if (!sent) {
            return NextResponse.json({
                success: false,
                invite_id: inviteId,
                error: "Invite saved but email failed to send. Check RESEND_API_KEY and email settings.",
            }, { status: 502 });
        }

        return NextResponse.json({
            success: true,
            invite_id: inviteId,
            token,
            message: `Invitation sent to ${normalizedEmail}.`,
        });
    } catch (error) {
        console.error("Beta invite error:", error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}

/**
 * GET /api/admin/beta-invites — list all invitations, most recent first.
 */
export async function GET() {
    try {
        const admin = getAdmin();
        const { data, error } = await admin
            .from("beta_invites")
            .select("id, email, recipient_name, company_name, personal_note, token, sent_at, claimed_at, expires_at")
            .order("sent_at", { ascending: false })
            .limit(200);

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }
        return NextResponse.json({ invites: data || [] });
    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}

/**
 * DELETE /api/admin/beta-invites — revoke an invite by id.
 */
export async function DELETE(req: NextRequest) {
    try {
        const { id } = await req.json();
        if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
        const admin = getAdmin();
        const { error } = await admin.from("beta_invites").delete().eq("id", id);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ success: true });
    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
