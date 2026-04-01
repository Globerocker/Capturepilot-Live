import { NextRequest, NextResponse } from "next/server";
import { sendWelcomeEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
    try {
        const { email, company_name } = await req.json();
        if (!email || !company_name) {
            return NextResponse.json({ error: "email and company_name required" }, { status: 400 });
        }
        await sendWelcomeEmail(email, company_name);
        return NextResponse.json({ success: true });
    } catch {
        return NextResponse.json({ error: "Failed to send" }, { status: 500 });
    }
}
