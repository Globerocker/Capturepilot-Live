import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getSegment } from "@/lib/outreach/segments";

export const dynamic = "force-dynamic";

// POST /api/admin/outreach/segments/enrich  { key }
// Nudges the existing Apollo contractor-enrichment cron to fill missing emails
// for the segment's population (it targets federal_awards_count > 0 / email IS
// NULL, which covers dormant performers; the email-null fallback covers the
// rest). Runs after the response so the request returns immediately.
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
            await fetch(`${origin}/api/cron/enrich_apollo_contractors?batch=200`, {
                headers: { Authorization: `Bearer ${secret}` },
            });
        } catch (e) {
            console.error("[segments/enrich] cron trigger failed", (e as Error).message);
        }
    });

    return NextResponse.json({ triggered: true, segment: seg.key });
}
