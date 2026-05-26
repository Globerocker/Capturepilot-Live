/**
 * Gap-filler for opportunities.structured_requirements.
 *
 * Walks rows where the column is NULL (or `force=true` re-extracts every
 * row), runs gpt-4o-mini against title + description, writes the result
 * back. This is the SAM-side equivalent of what backfill_extracted_contacts
 * does for emails/phones — the same agent pattern.
 *
 * Cost: ~$0.0002 per row × ~30k active opps ≈ $6 for a full backfill.
 * Operator triggers via curl + CRON_SECRET; default limit=200 keeps each
 * call inside the 300s budget.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { guardCron } from "@/lib/cron-auth";
import { extractStructuredRequirements } from "@/lib/extract-structured-requirements";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
    const denied = guardCron(req);
    if (denied) return denied;

    const url = new URL(req.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 200), 1), 1000);
    const force = url.searchParams.get("force") === "true";
    const concurrency = Math.min(Math.max(Number(url.searchParams.get("concurrency") || 6), 1), 12);

    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );

    let query = sb
        .from("opportunities")
        .select("id, title, description")
        .eq("is_archived", false)
        .not("description", "is", null)
        .neq("description", "")
        .limit(limit);
    if (!force) query = query.is("structured_requirements", null);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    type Row = { id: string; title: string | null; description: string | null };
    const targets = (data || []) as Row[];
    if (targets.length === 0) return NextResponse.json({ ok: true, scanned: 0, note: "no pending rows" });

    const startedAt = Date.now();
    let updated = 0;
    let withData = 0;
    let aiFailures = 0;

    for (let i = 0; i < targets.length; i += concurrency) {
        if (Date.now() - startedAt > 270_000) break;
        const slice = targets.slice(i, i + concurrency);
        await Promise.all(slice.map(async (r) => {
            const result = await extractStructuredRequirements({ title: r.title, description: r.description });
            if (!result) {
                aiFailures++;
                return;
            }
            const hasAny = Object.values(result).some((v) => v != null && (!Array.isArray(v) || v.length > 0));
            const { error: upErr } = await sb
                .from("opportunities")
                .update({ structured_requirements: result })
                .eq("id", r.id);
            if (upErr) {
                console.warn("[backfill_structured_requirements]", r.id, upErr.message);
                return;
            }
            updated++;
            if (hasAny) withData++;
        }));
    }

    return NextResponse.json({
        ok: true,
        scanned: targets.length,
        updated,
        with_data: withData,
        ai_failures: aiFailures,
        elapsed_ms: Date.now() - startedAt,
    });
}
