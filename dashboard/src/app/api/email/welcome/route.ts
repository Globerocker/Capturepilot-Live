import { NextRequest, NextResponse } from "next/server";
import { sendWelcomeEmail, enqueueDripSequence } from "@/lib/email";

export async function POST(req: NextRequest) {
    try {
        const { email, company_name, user_profile_id } = await req.json();
        if (!email || !company_name) {
            return NextResponse.json({ error: "email and company_name required" }, { status: 400 });
        }
        await sendWelcomeEmail(email, company_name);

        // Enroll in self-service onboarding drip (fire-and-forget)
        enqueueDripSequence({
            sequenceKey: "self_service_onboarding",
            email,
            contactName: company_name,
            userProfileId: user_profile_id,
        }).catch(err => console.error("Drip enrollment failed:", err));

        return NextResponse.json({ success: true });
    } catch {
        return NextResponse.json({ error: "Failed to send" }, { status: 500 });
    }
}
