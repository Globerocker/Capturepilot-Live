import { NextRequest, NextResponse } from "next/server";
import { assertAdmin } from "@/lib/auth-admin";
import { spamCheck } from "@/lib/outreach-spam-check";

/**
 * POST /api/admin/outreach/spam-check
 * Body: { subject?: string, body?: string }
 *
 * Returns { score, severity, reasons } so the campaign builder can show
 * a live spam-risk badge. Pure compute — no DB, safe to debounce 500ms.
 */
export async function POST(req: NextRequest) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;

    const body = await req.json().catch(() => ({})) as { subject?: string; body?: string };
    const result = spamCheck(body.subject || "", body.body || "");
    return NextResponse.json(result);
}
