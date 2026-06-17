/**
 * Backfill / re-score Quick Checker readiness for EXISTING company_analyses.
 *
 * The readiness score used to be computed BEFORE the firmographic cascade
 * resolved employees / years_in_business, so ~75% of analyses scored < 4/10
 * even when the data was found (it just landed in inferred_profile after the
 * score was frozen). This re-runs computeReadinessScore() against the stored
 * crawl_data MERGED with the resolved inferred_profile values — no re-crawl,
 * no external API calls — and rewrites readiness_score + readiness_breakdown.
 *
 * The "Past Federal Awards" factor can't be recomputed without re-querying
 * USASpending, so its credited state is preserved from the existing breakdown.
 *
 * GET /api/cron/backfill_readiness?limit=2000   (guarded)
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { guardCron } from "@/lib/cron-auth";
import { computeReadinessScore } from "@/lib/quick-checker-helpers";

export const runtime = "nodejs";
export const maxDuration = 300;
/* eslint-disable @typescript-eslint/no-explicit-any */

export async function GET(req: NextRequest) {
    const unauth = guardCron(req);
    if (unauth) return unauth;

    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );
    const url = new URL(req.url);
    const limit = Math.min(5000, Number(url.searchParams.get("limit")) || 2000);

    const { data: rows, error } = await sb
        .from("company_analyses")
        .select("id, sam_data, crawl_data, inferred_profile, readiness_score, readiness_breakdown")
        .not("crawl_data", "is", null)
        .order("created_at", { ascending: false })
        .limit(limit);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    let scanned = 0, updated = 0, raised = 0, sumOld = 0, sumNew = 0;

    for (const r of (rows || []) as any[]) {
        scanned++;
        const crawl = (r.crawl_data || {}) as Record<string, unknown>;
        const ip = (r.inferred_profile || {}) as Record<string, any>;
        const oldB = (r.readiness_breakdown || {}) as any;
        const oldScore = Number(r.readiness_score) || 0;

        // Preserve the award factor (can't recompute without USASpending).
        const awardF = (oldB.factors || []).find((f: any) => /Past Federal Awards/i.test(f?.label || ""));
        const awardCount = awardF?.present
            ? (parseInt(String(awardF.detail || "").match(/(\d+)/)?.[1] || "1", 10) || 1)
            : 0;

        // Certs: crawl-detected + confirmed SBA certs (samData certs handled inside).
        const crawlCerts = (((crawl.certifications as any[]) || [])).map((c: any) => ({
            type: c?.type || "", confidence: typeof c?.confidence === "number" ? c.confidence : 0.7,
        })).filter((c: any) => c.type);
        const sbaCerts = (((ip.sba_certifications as string[]) || [])).map((t: string) => ({ type: t, confidence: 1 }));

        const merged = {
            ...crawl,
            employee_count: (ip.employee_count as number) || (crawl.employee_count as number) || undefined,
            years_in_business: (ip.years_in_business as number) || undefined,
        };

        let score: number, breakdown: any;
        try {
            const re = computeReadinessScore({
                samData: r.sam_data || null,
                crawlData: merged,
                certifications: [...crawlCerts, ...sbaCerts],
                usaspendingAwardCount: awardCount,
            });
            score = re.score; breakdown = re.breakdown;
        } catch {
            continue;
        }

        sumOld += oldScore; sumNew += score;
        if (score !== oldScore) {
            await sb.from("company_analyses").update({ readiness_score: score, readiness_breakdown: breakdown }).eq("id", r.id);
            updated++;
            if (score > oldScore) raised++;
        }
    }

    return NextResponse.json({
        ok: true, scanned, updated, raised,
        avg_old: scanned ? +(sumOld / scanned).toFixed(2) : 0,
        avg_new: scanned ? +(sumNew / scanned).toFixed(2) : 0,
    });
}
