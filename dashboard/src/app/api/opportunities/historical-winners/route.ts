import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 30;

/**
 * GET /api/opportunities/historical-winners?naics=541519&limit=10
 *
 * Returns companies that have won federal contracts with this NAICS in the past.
 * Queries the opportunities table (status='AWARDED') and aggregates by awardee.
 * The UI on the opportunity detail page uses this to show "who typically wins"
 * and feeds it into the win-strategy display.
 */
export async function GET(req: NextRequest) {
    const naics = req.nextUrl.searchParams.get("naics");
    const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") || "10", 10), 25);
    if (!naics) return NextResponse.json({ error: "naics required" }, { status: 400 });

    const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );

    // Pull up to 500 awarded rows for the NAICS (ordered by most recent) then
    // aggregate in-memory — cheaper than a per-awardee groupby RPC and fine at
    // this scale. Most NAICS have <100 awards in the corpus.
    const { data, error } = await admin
        .from("opportunities")
        .select("awardee, award_amount, award_date, agency, title")
        .eq("status", "AWARDED")
        .eq("naics_code", naics)
        .not("awardee", "is", null)
        .order("award_date", { ascending: false })
        .limit(500);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const rows = (data || []) as Array<{
        awardee: string; award_amount: number | null; award_date: string | null;
        agency: string | null; title: string | null;
    }>;

    // Group by awardee — normalize whitespace + case so "ACME, INC." and "Acme Inc" merge.
    const byAwardee = new Map<string, {
        awardee: string; award_count: number; total_value: number;
        last_award_date: string | null; top_agencies: Record<string, number>;
        most_recent_title: string | null;
    }>();

    for (const row of rows) {
        if (!row.awardee) continue;
        const key = row.awardee.trim().toLowerCase().replace(/[,.]+/g, "").replace(/\s+(inc|llc|corp|co|ltd|company)\.?$/i, "").trim();
        if (!key) continue;
        const existing = byAwardee.get(key) || {
            awardee: row.awardee.trim(),
            award_count: 0,
            total_value: 0,
            last_award_date: null,
            top_agencies: {} as Record<string, number>,
            most_recent_title: null,
        };
        existing.award_count++;
        existing.total_value += row.award_amount || 0;
        if (row.award_date && (!existing.last_award_date || row.award_date > existing.last_award_date)) {
            existing.last_award_date = row.award_date;
            existing.most_recent_title = row.title;
        }
        if (row.agency) {
            existing.top_agencies[row.agency] = (existing.top_agencies[row.agency] || 0) + 1;
        }
        byAwardee.set(key, existing);
    }

    // Rank by award count, then by total value as tiebreaker.
    const ranked = Array.from(byAwardee.values())
        .sort((a, b) => {
            if (b.award_count !== a.award_count) return b.award_count - a.award_count;
            return b.total_value - a.total_value;
        })
        .slice(0, limit)
        .map(w => ({
            awardee: w.awardee,
            award_count: w.award_count,
            total_value: w.total_value,
            last_award_date: w.last_award_date,
            primary_agency: Object.entries(w.top_agencies).sort((a, b) => b[1] - a[1])[0]?.[0] || null,
            most_recent_title: w.most_recent_title,
        }));

    // Roll-up numbers for the summary card at the top of the UI section.
    const totalAwards = rows.length;
    const totalValue = rows.reduce((s, r) => s + (r.award_amount || 0), 0);
    const uniqueAwardees = byAwardee.size;
    const avgAwardValue = totalAwards > 0 ? totalValue / totalAwards : 0;

    return NextResponse.json({
        naics,
        summary: {
            total_awards: totalAwards,
            total_value: totalValue,
            unique_awardees: uniqueAwardees,
            avg_award_value: avgAwardValue,
            top_concentration: ranked.length > 0 && totalAwards > 0
                ? ranked[0].award_count / totalAwards
                : 0,
        },
        winners: ranked,
    });
}
