import { NextRequest, NextResponse } from "next/server";
import { sendWelcomeEmail, enqueueDripSequence } from "@/lib/email";
import { requireUser } from "@/lib/auth-server";

/**
 * POST /api/email/welcome
 * Send the post-signup welcome email + enroll in the self-service drip.
 *
 * Audit fix #14: requires an authenticated session, looks up the caller's
 * email from the session (never from request body) so this can't be used
 * to spam arbitrary inboxes on the Resend domain.
 *
 * Body (optional): { company_name?: string }
 */
export async function POST(req: NextRequest) {
    const auth = await requireUser();
    if (auth instanceof NextResponse) return auth;
    const { user, profile, sb } = auth;

    if (!user.email) {
        return NextResponse.json({ error: "Session has no email" }, { status: 400 });
    }

    let companyName = "";
    try {
        const body = await req.json().catch(() => ({} as Record<string, unknown>));
        if (typeof (body as { company_name?: string }).company_name === "string") {
            companyName = ((body as { company_name?: string }).company_name || "").trim();
        }
    } catch { /* body is optional */ }

    if (!companyName && profile?.id) {
        const { data } = await sb
            .from("user_profiles")
            .select("company_name")
            .eq("id", profile.id)
            .single();
        companyName = (data as { company_name?: string } | null)?.company_name || "";
    }
    if (!companyName) companyName = user.email.split("@")[0] || "there";

    try {
        await sendWelcomeEmail(user.email, companyName);

        // Enroll in self-service onboarding drip (fire-and-forget)
        enqueueDripSequence({
            sequenceKey: "self_service_onboarding",
            email: user.email,
            contactName: companyName,
            userProfileId: profile?.id,
        }).catch(err => console.error("Drip enrollment failed:", err));

        return NextResponse.json({ success: true });
    } catch {
        return NextResponse.json({ error: "Failed to send" }, { status: 500 });
    }
}
