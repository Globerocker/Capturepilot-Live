import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const VALID_ACTIONS = new Set(["pause", "resume", "remove"]);

export async function POST(
    req: NextRequest,
    ctx: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await ctx.params;
        if (!id) {
            return NextResponse.json({ error: "Missing campaign id" }, { status: 400 });
        }

        const body = await req.json().catch(() => ({} as Record<string, unknown>));
        const action = (body.action || "").toString().toLowerCase();
        const contactIds = Array.isArray(body.contact_ids) ? (body.contact_ids as string[]).filter((c) => typeof c === "string" && c.length > 0) : [];

        if (!VALID_ACTIONS.has(action)) {
            return NextResponse.json({ error: "Invalid action" }, { status: 400 });
        }
        if (contactIds.length === 0) {
            return NextResponse.json({ error: "No contacts selected" }, { status: 400 });
        }
        if (contactIds.length > 1000) {
            return NextResponse.json({ error: "Too many contacts in one request (max 1000)" }, { status: 400 });
        }

        const sb = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_KEY!
        );

        const now = new Date().toISOString();

        if (action === "remove") {
            const { error, count } = await sb
                .from("outreach_contacts")
                .delete({ count: "exact" })
                .eq("campaign_id", id)
                .in("id", contactIds);

            if (error) return NextResponse.json({ error: error.message }, { status: 500 });
            return NextResponse.json({ success: true, action, affected: count || 0 });
        }

        const newStatus = action === "pause" ? "paused" : "active";
        const updatePayload: Record<string, unknown> = {
            status: newStatus,
            last_activity_at: now,
        };

        const { error, count } = await sb
            .from("outreach_contacts")
            .update(updatePayload, { count: "exact" })
            .eq("campaign_id", id)
            .in("id", contactIds);

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        return NextResponse.json({ success: true, action, affected: count || 0, new_status: newStatus });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Internal server error";
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
