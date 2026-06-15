import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getSegment } from "@/lib/outreach/segments";

export const dynamic = "force-dynamic";

// POST /api/admin/outreach/segments/enrich  { key }
// Kicks the website-email scraper to fill missing emails for contractors that
// have a website but no email. (SAM redacts POC emails and Apollo is exhausted
// at ~0.4% yield, so scraping the contractor's own site is the practical
// source.) Runs after the response so the request returns immediately.
export async function POST(req: NextRequest) {
    const { unauth } = await requireAdmin();
    if (unauth) return unauth;

    const body = await req.json().catch(() => null);
    const seg = body?.key ? getSegment(String(body.key)) : undefined;
    if (!seg) return NextResponse.json({ error: "unknown segment" }, { status: 400 });

    const origin = new URL(req.url).origin;
    const secret = process.env.CRON_SECRET;
    if (!secret) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });

    after(async () => {
        try {
            await fetch(`${origin}/api/cron/scrape_contractor_emails?batch=50`, {
                headers: { Authorization: `Bearer ${secret}` },
            });
        } catch (e) {
            console.error("[segments/enrich] scraper trigger failed", (e as Error).message);
        }
    });

    return NextResponse.json({ triggered: true, segment: seg.key });
}
