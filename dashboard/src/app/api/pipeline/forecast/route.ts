import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { groupByQuarter, inferPWin, inferCloseDate, inferValueCents } from "@/lib/pipeline-forecast";

export const dynamic = "force-dynamic";

/**
 * GET /api/pipeline/forecast — quarterly weighted-pipeline forecast
 * for the authenticated user.
 *
 * Returns:
 *   - quarters: [{ label, weighted_cents, raw_cents, pursuits }, …]
 *   - top_pursuits: top-5 by weighted value so the user can see what's
 *     driving the forecast.
 */

export async function GET() {
    const cookieStore = await cookies();
    const sb = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll: () => cookieStore.getAll() } },
    );
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const svc = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );
    const { data: profile } = await svc
        .from("user_profiles")
        .select("id")
        .eq("auth_user_id", user.id)
        .maybeSingle();
    if (!profile) return NextResponse.json({ error: "No profile" }, { status: 404 });

    const { data: pursuits } = await svc
        .from("user_pursuits")
        .select(`
            id, stage, priority, pwin, predicted_close_date, predicted_value_cents,
            opportunity:opportunities (id, title, agency, response_deadline, award_amount, estimated_value, notice_type)
        `)
        .eq("user_profile_id", (profile as { id: string }).id);

    // Supabase types embedded relations as arrays even on one-to-one FKs.
    // Cast through unknown and reshape — pick the first element of each
    // opportunity array so the rest of the forecast lib can treat it as
    // a single object.
    type RawRow = {
        id: string;
        stage: string;
        priority: string | null;
        pwin: number | null;
        predicted_close_date: string | null;
        predicted_value_cents: number | null;
        opportunity: Array<{
            id: string; title: string | null; agency: string | null;
            response_deadline: string | null; award_amount: number | null;
            estimated_value: number | null; notice_type: string | null;
        }> | null;
    };
    const raw = ((pursuits || []) as unknown) as RawRow[];
    const rows = raw.map(r => ({
        ...r,
        opportunity: Array.isArray(r.opportunity) ? r.opportunity[0] ?? null : r.opportunity,
    }));

    const quarters = groupByQuarter(rows);

    // Top-5 weighted pursuits — the heavy hitters the user should actually
    // be working on. Excludes terminal stages (handled in groupByQuarter
    // upstream, mirrored here).
    const enrichedActive = rows
        .filter(r => r.stage !== "awarded" && r.stage !== "lost" && r.stage !== "no_bid")
        .map(r => {
            const pwin = inferPWin(r);
            const value_cents = inferValueCents(r);
            const close = inferCloseDate(r);
            return {
                id: r.id,
                stage: r.stage,
                pwin,
                value_cents,
                weighted_cents: Math.round(value_cents * pwin / 100),
                close_date: close,
                title: r.opportunity?.title ?? null,
                agency: r.opportunity?.agency ?? null,
                opportunity_id: r.opportunity?.id ?? null,
            };
        })
        .sort((a, b) => b.weighted_cents - a.weighted_cents)
        .slice(0, 5);

    const totalWeighted = quarters.reduce((s, q) => s + q.weighted_cents, 0);
    const totalRaw = quarters.reduce((s, q) => s + q.raw_cents, 0);

    return NextResponse.json({
        quarters,
        top_pursuits: enrichedActive,
        totals: {
            weighted_cents: totalWeighted,
            raw_cents: totalRaw,
            active_pursuits: enrichedActive.length,
        },
        generated_at: new Date().toISOString(),
    });
}
