/**
 * Recompute NAICS rank / state rank / "top X of Y" badges across the
 * full contractor_profile_pages table.
 *
 * Runs nightly so the rank pills on each page stay fresh as new contractors
 * publish. Cheap pure-SQL operation — one window-function pass per
 * partition, ~1-2 seconds for the current 1K rows.
 *
 * Why a route + not a SQL trigger: it gets expensive to recompute window
 * functions on every UPDATE the publish + refresh routes do. A nightly
 * pass keeps the table responsive AND the ranks fresh enough.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { guardCron } from "@/lib/cron-auth";
import { withCronTelemetry } from "@/lib/cron-telemetry";

export const runtime = "nodejs";
export const maxDuration = 60;

async function GET_handler(req: NextRequest) {
    const denied = guardCron(req);
    if (denied) return denied;

    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );

    // Pull all published rows; compute ranks client-side because the
    // PostgREST API can't easily express RANK() OVER (). With ~1K rows
    // this is trivial in memory.
    const { data, error } = await sb
        .from("contractor_profile_pages")
        .select("id, primary_naics, state, federal_score, total_awarded_amount, sba_certifications")
        .eq("is_published", true)
        .limit(20000);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    type Row = {
        id: string;
        primary_naics: string | null;
        state: string | null;
        federal_score: number | null;
        total_awarded_amount: number | null;
        sba_certifications: string[] | null;
    };
    const rows = (data || []) as Row[];

    // Group by NAICS + by state, sort each group by federal_score DESC then
    // total_awarded_amount DESC. Position in the sorted list = the rank.
    const byNaics = new Map<string, Row[]>();
    const byState = new Map<string, Row[]>();
    for (const r of rows) {
        if (r.primary_naics) {
            const k = r.primary_naics;
            if (!byNaics.has(k)) byNaics.set(k, []);
            byNaics.get(k)!.push(r);
        }
        if (r.state) {
            const k = r.state;
            if (!byState.has(k)) byState.set(k, []);
            byState.get(k)!.push(r);
        }
    }

    const sortFn = (a: Row, b: Row) =>
        (b.federal_score || 0) - (a.federal_score || 0) ||
        Number(b.total_awarded_amount || 0) - Number(a.total_awarded_amount || 0);

    const updates = new Map<string, { naics_rank?: number; state_rank?: number; naics_total?: number; state_total?: number }>();
    for (const [, group] of byNaics) {
        group.sort(sortFn);
        for (let i = 0; i < group.length; i++) {
            const row = group[i];
            const cur = updates.get(row.id) || {};
            cur.naics_rank = i + 1;
            cur.naics_total = group.length;
            updates.set(row.id, cur);
        }
    }
    for (const [, group] of byState) {
        group.sort(sortFn);
        for (let i = 0; i < group.length; i++) {
            const row = group[i];
            const cur = updates.get(row.id) || {};
            cur.state_rank = i + 1;
            cur.state_total = group.length;
            updates.set(row.id, cur);
        }
    }

    // Recompute badges that depend on rank (top-N badges).
    function rankBadges(naicsRank?: number, stateRank?: number, certs?: string[] | null): string[] {
        const out: string[] = [];
        if (naicsRank && naicsRank <= 3) out.push("naics_top_3");
        else if (naicsRank && naicsRank <= 10) out.push("naics_top_10");
        else if (naicsRank && naicsRank <= 50) out.push("naics_top_50");
        if (stateRank && stateRank <= 10) out.push("state_top_10");
        if ((certs || []).length >= 3) out.push("multi_cert");
        return out;
    }

    // Apply updates in parallel chunks.
    const CONCURRENCY = 25;
    const entries = Array.from(updates.entries());
    let updated = 0;
    let errored = 0;
    for (let i = 0; i < entries.length; i += CONCURRENCY) {
        const chunk = entries.slice(i, i + CONCURRENCY);
        await Promise.all(chunk.map(async ([id, u]) => {
            const row = rows.find((r) => r.id === id);
            const newBadges = rankBadges(u.naics_rank, u.state_rank, row?.sba_certifications);
            const { error: upErr } = await sb
                .from("contractor_profile_pages")
                .update({
                    naics_rank: u.naics_rank ?? null,
                    state_rank: u.state_rank ?? null,
                    naics_total: u.naics_total ?? null,
                    state_total: u.state_total ?? null,
                    badges: newBadges,
                    last_recalc_at: new Date().toISOString(),
                })
                .eq("id", id);
            if (upErr) errored++; else updated++;
        }));
    }

    return NextResponse.json({
        ok: true,
        scanned: rows.length,
        naics_groups: byNaics.size,
        state_groups: byState.size,
        updates: entries.length,
        updated,
        errored,
    });
}

export const GET = withCronTelemetry("/api/cron/recalc_contractor_rankings", GET_handler);
