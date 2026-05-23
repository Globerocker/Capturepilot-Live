import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendOpportunityAlert } from "@/lib/email";
import { assertAdmin } from "@/lib/auth-admin";

function getAdmin() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
    );
}

/**
 * POST /api/admin/send-update — Send opportunity update email to a client
 * Body: { user_profile_id, type: "opportunities" | "custom", subject?, body? }
 *
 * For "opportunities": auto-fetches their top matches and sends alert
 * For "custom": sends custom subject + body
 */
export async function POST(req: NextRequest) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;
    try {
        const { user_profile_id, type, subject, body } = await req.json();
        if (!user_profile_id) return NextResponse.json({ error: "user_profile_id required" }, { status: 400 });

        const admin = getAdmin();
        const { data: profile } = await admin
            .from("user_profiles")
            .select("email, contact_name, company_name")
            .eq("id", user_profile_id)
            .single();

        if (!profile?.email) return NextResponse.json({ error: "No email on profile" }, { status: 400 });

        if (type === "opportunities") {
            // Fetch top matches
            const { data: matches } = await admin
                .from("user_matches")
                .select(`
                    score, classification,
                    opportunity:opportunities!inner(title, agency, response_deadline)
                `)
                .eq("user_profile_id", user_profile_id)
                .order("score", { ascending: false })
                .limit(5);

            if (!matches || matches.length === 0) {
                return NextResponse.json({ error: "No matches to send" }, { status: 400 });
            }

            const opps = matches.map((m: Record<string, unknown>) => {
                const opp = (Array.isArray(m.opportunity) ? m.opportunity[0] : m.opportunity) as Record<string, unknown>;
                return {
                    title: String(opp?.title || "Opportunity"),
                    agency: String(opp?.agency || "Federal Agency"),
                    score: Math.round(Number(m.score) * 100),
                    deadline: opp?.response_deadline ? String(opp.response_deadline) : undefined,
                };
            });

            await sendOpportunityAlert(profile.email, profile.contact_name || "there", opps);

            await admin.from("client_activity_log").insert({
                user_profile_id,
                action: "email_sent",
                description: `Opportunity update email sent (${opps.length} matches)`,
            });

            return NextResponse.json({ success: true, sent_to: profile.email, matches_sent: opps.length });
        }

        if (type === "custom" && subject && body) {
            // Use Resend directly for custom emails
            const { Resend } = await import("resend");
            const resend = new Resend(process.env.RESEND_API_KEY);
            await resend.emails.send({
                from: process.env.FROM_EMAIL || "CapturePilot <noreply@capturepilot.com>",
                to: profile.email,
                subject,
                html: `<div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
                    <h1 style="font-size: 24px; font-weight: 800;">CapturePilot</h1>
                    <p>Hi ${profile.contact_name || "there"},</p>
                    <div style="margin: 20px 0; line-height: 1.6;">${body.replace(/\n/g, "<br>")}</div>
                    <p style="color: #a1a1aa; font-size: 12px; margin-top: 40px;">CapturePilot — Strategic Capture Intelligence</p>
                </div>`,
            });

            await admin.from("client_activity_log").insert({
                user_profile_id,
                action: "custom_email_sent",
                description: `Custom email sent: "${subject}"`,
            });

            return NextResponse.json({ success: true, sent_to: profile.email });
        }

        return NextResponse.json({ error: "Invalid type. Use 'opportunities' or 'custom' with subject+body" }, { status: 400 });
    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
