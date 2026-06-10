import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const VALID_STATUS = new Set(["active", "replied", "bounced", "unsubscribed", "paused", "completed", "all"]);

export async function GET(
    req: NextRequest,
    ctx: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await ctx.params;
        if (!id) {
            return NextResponse.json({ error: "Missing campaign id" }, { status: 400 });
        }

        const url = new URL(req.url);
        const status = (url.searchParams.get("status") || "all").toLowerCase();
        const limit = Math.min(parseInt(url.searchParams.get("limit") || "100", 10) || 100, 500);
        const search = (url.searchParams.get("search") || "").trim();

        if (!VALID_STATUS.has(status)) {
            return NextResponse.json({ error: "Invalid status" }, { status: 400 });
        }

        const sb = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_KEY!
        );

        let query = sb
            .from("outreach_contacts")
            .select("id, email, name, company, status, current_step, added_at, last_activity_at, replied_at, bounced_at, unsubscribed_at, lead_id")
            .eq("campaign_id", id)
            .order("added_at", { ascending: false })
            .limit(limit);

        if (status !== "all") {
            query = query.eq("status", status);
        }

        if (search) {
            // basic OR on email/name/company
            const safe = search.replace(/[%,()]/g, "");
            query = query.or(`email.ilike.%${safe}%,name.ilike.%${safe}%,company.ilike.%${safe}%`);
        }

        const { data, error } = await query;

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        const now = Date.now();
        const contacts = (data || []).map((c: Record<string, unknown>) => {
            const addedAt = c.added_at ? new Date(c.added_at as string).getTime() : null;
            const timeSinceAddedMs = addedAt ? now - addedAt : null;
            return {
                ...c,
                time_since_added_ms: timeSinceAddedMs,
            };
        });

        return NextResponse.json({ contacts });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Internal server error";
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
