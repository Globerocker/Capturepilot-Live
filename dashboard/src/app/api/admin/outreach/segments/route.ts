import { NextResponse } from "next/server";
import { requireAdmin, getServiceClient } from "@/lib/admin-auth";
import { SEGMENTS, emailableFilter } from "@/lib/outreach/segments";

export const dynamic = "force-dynamic";

// GET /api/admin/outreach/segments
// Returns each predefined target group with a live total + emailable count.
export async function GET() {
    const { unauth } = await requireAdmin();
    if (unauth) return unauth;
    const sb = getServiceClient();

    const segments = await Promise.all(
        SEGMENTS.map(async (seg) => {
            const totalRes = await seg
                .apply(sb.from("contractors").select("id", { count: "exact", head: true }));
            const emailRes = await emailableFilter(
                seg.apply(sb.from("contractors").select("id", { count: "exact", head: true }))
            );
            return {
                key: seg.key,
                label: seg.label,
                description: seg.description,
                templateName: seg.templateName,
                total: totalRes.count ?? 0,
                emailable: emailRes.count ?? 0,
            };
        })
    );

    return NextResponse.json({ segments });
}
