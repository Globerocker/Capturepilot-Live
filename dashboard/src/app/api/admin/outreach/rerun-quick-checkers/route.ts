import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

// POST /api/admin/outreach/rerun-quick-checkers
// Fires the Quick Checker re-run cron (refreshes match_1/2/3 on the warm
// quick_checker audience). Runs after the response so the request returns fast.
export async function POST(req: NextRequest) {
    const { unauth } = await requireAdmin();
    if (unauth) return unauth;

    const origin = new URL(req.url).origin;
    const secret = process.env.CRON_SECRET;
    if (!secret) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });

    after(async () => {
        try {
            await fetch(`${origin}/api/cron/rerun_quick_checkers?batch=200`, {
                headers: { Authorization: `Bearer ${secret}` },
            });
        } catch (e) {
            console.error("[rerun-quick-checkers] trigger failed", (e as Error).message);
        }
    });

    return NextResponse.json({ triggered: true });
}
