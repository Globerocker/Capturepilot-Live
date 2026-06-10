import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function getAdmin() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
    );
}

interface KpiRow {
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    replied: number;
    bounced: number;
    unsubscribed: number;
    complaint: number;
}

interface DailyRow {
    day: string;
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    replied: number;
}

const ZERO: KpiRow = {
    sent: 0, delivered: 0, opened: 0, clicked: 0,
    replied: 0, bounced: 0, unsubscribed: 0, complaint: 0,
};

function parseDate(s: string | null, fallback: Date): Date {
    if (!s) return fallback;
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return fallback;
    return d;
}

function deltas(curr: KpiRow, prev: KpiRow) {
    const d: Record<string, number | null> = {};
    (Object.keys(curr) as (keyof KpiRow)[]).forEach((k) => {
        const a = Number(curr[k] || 0);
        const b = Number(prev[k] || 0);
        if (b === 0) {
            d[k] = a === 0 ? 0 : null; // null = no baseline → render as "—"
        } else {
            d[k] = ((a - b) / b) * 100;
        }
    });
    return d;
}

async function callKpis(admin: ReturnType<typeof getAdmin>, from: Date, to: Date): Promise<KpiRow> {
    const { data, error } = await admin.rpc("outreach_kpis", {
        p_from: from.toISOString(),
        p_to: to.toISOString(),
    });
    // If the RPC or table doesn't exist yet, return zeros so the UI still renders.
    if (error) return { ...ZERO };
    const row = Array.isArray(data) ? (data[0] as KpiRow | undefined) : (data as KpiRow | undefined);
    if (!row) return { ...ZERO };
    return {
        sent: Number(row.sent || 0),
        delivered: Number(row.delivered || 0),
        opened: Number(row.opened || 0),
        clicked: Number(row.clicked || 0),
        replied: Number(row.replied || 0),
        bounced: Number(row.bounced || 0),
        unsubscribed: Number(row.unsubscribed || 0),
        complaint: Number(row.complaint || 0),
    };
}

async function callDaily(admin: ReturnType<typeof getAdmin>, from: Date, to: Date): Promise<DailyRow[]> {
    const { data, error } = await admin.rpc("outreach_kpis_daily", {
        p_from: from.toISOString(),
        p_to: to.toISOString(),
    });
    if (error || !Array.isArray(data)) return [];
    return (data as DailyRow[]).map((r) => ({
        day: r.day,
        sent: Number(r.sent || 0),
        delivered: Number(r.delivered || 0),
        opened: Number(r.opened || 0),
        clicked: Number(r.clicked || 0),
        replied: Number(r.replied || 0),
    }));
}

/**
 * GET /api/admin/outreach/overview-kpis?from=ISO&to=ISO&compare=1
 * Returns { current, previous?, deltas?, daily, range:{from,to,prevFrom,prevTo} }.
 */
export async function GET(req: NextRequest) {
    try {
        const url = new URL(req.url);
        const now = new Date();
        const defaultFrom = new Date(now.getTime() - 30 * 86400000);

        const to = parseDate(url.searchParams.get("to"), now);
        const from = parseDate(url.searchParams.get("from"), defaultFrom);
        const compare = url.searchParams.get("compare") !== "0";

        if (from >= to) {
            return NextResponse.json({ error: "Invalid range: from must be before to" }, { status: 400 });
        }

        const admin = getAdmin();
        const span = to.getTime() - from.getTime();
        const prevTo = new Date(from.getTime());
        const prevFrom = new Date(from.getTime() - span);

        const [current, daily, previous] = await Promise.all([
            callKpis(admin, from, to),
            callDaily(admin, from, to),
            compare ? callKpis(admin, prevFrom, prevTo) : Promise.resolve(null),
        ]);

        return NextResponse.json({
            current,
            previous,
            deltas: previous ? deltas(current, previous) : null,
            daily,
            range: {
                from: from.toISOString(),
                to: to.toISOString(),
                prevFrom: prevFrom.toISOString(),
                prevTo: prevTo.toISOString(),
            },
        });
    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
