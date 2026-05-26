/**
 * NAICS classification gap-filler.
 *
 * Walks opportunities where naics_code IS NULL (most SLED rows), runs
 * the gpt-4o-mini classifier against title + description + extracted
 * keywords, persists the result when confidence ≥ 0.6. Lower-confidence
 * results are dropped to avoid poisoning the matching score.
 *
 * Critical for unblocking SLED scoring: state/local rows currently can
 * only match via keyword + base score (the NAICS gate is bypassed when
 * naics_code is null). Once classified, they score properly via NAICS
 * overlap with user profile codes — significantly more HOT matches.
 *
 * Cost: ~$0.0002/row at gpt-4o-mini pricing → $4 for 20k SLED rows.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { guardCron } from "@/lib/cron-auth";
import { classifyNaics } from "@/lib/classify-naics";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
    const denied = guardCron(req);
    if (denied) return denied;

    const url = new URL(req.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 300), 1), 1000);
    const threshold = Math.min(Math.max(Number(url.searchParams.get("threshold") || 0.6), 0.3), 0.95);
    const concurrency = Math.min(Math.max(Number(url.searchParams.get("concurrency") || 8), 1), 16);
    const force = url.searchParams.get("force") === "true";

    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );

    let query = sb
        .from("opportunities")
        .select("id, title, description, extracted_keywords, naics_code")
        .eq("is_archived", false)
        .not("description", "is", null)
        .neq("description", "")
        .limit(limit);
    if (!force) query = query.is("naics_code", null);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    type Row = { id: string; title: string | null; description: string | null; extracted_keywords: string[] | null; naics_code: string | null };
    const targets = (data || []) as Row[];
    if (targets.length === 0) return NextResponse.json({ ok: true, scanned: 0, note: "no pending rows" });

    const startedAt = Date.now();
    let classified = 0;
    let skippedLowConfidence = 0;
    let aiFailures = 0;
    const sample: Array<{ id: string; naics: string; conf: number }> = [];

    for (let i = 0; i < targets.length; i += concurrency) {
        if (Date.now() - startedAt > 270_000) break;
        const slice = targets.slice(i, i + concurrency);
        await Promise.all(slice.map(async (r) => {
            const result = await classifyNaics({
                title: r.title,
                description: r.description,
                extracted_keywords: r.extracted_keywords,
                threshold,
            });
            if (!result) {
                // Mark row as attempted so we don't infinite-loop on hopeless
                // rows. We use naics_code_classified_at as a future marker but
                // for now just track failures.
                aiFailures++;
                return;
            }
            // Confidence already ≥ threshold (checked in classifyNaics).
            const { error: upErr } = await sb
                .from("opportunities")
                .update({ naics_code: result.naics_code })
                .eq("id", r.id)
                .is("naics_code", null);  // race-safety: only update if still null
            if (upErr) {
                console.warn("[backfill_naics]", r.id, upErr.message);
                return;
            }
            classified++;
            if (sample.length < 5) sample.push({ id: r.id, naics: result.naics_code, conf: result.confidence });
        }));
    }
    skippedLowConfidence = targets.length - classified - aiFailures;

    return NextResponse.json({
        ok: true,
        scanned: targets.length,
        classified,
        skipped_low_confidence: skippedLowConfidence,
        ai_failures: aiFailures,
        sample,
        elapsed_ms: Date.now() - startedAt,
    });
}
