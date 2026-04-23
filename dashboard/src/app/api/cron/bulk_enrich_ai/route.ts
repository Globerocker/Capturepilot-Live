import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

export const maxDuration = 300;

/**
 * High-frequency AI Win Strategy backfill.
 * Runs every 30 min via vercel.json. 20 opps/run = ~960/day.
 *
 * Priority:
 *   1) Opportunities referenced by HOT/WARM user_matches
 *   2) Rest: active, has real description (not URL), no ai_win_strategy, recent.
 *
 * Skip if description is still a URL (bulk_enrich_descriptions handles that
 * first). This way we never burn tokens on empty text.
 */
const BATCH_SIZE = 20;

function admin() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );
}

export async function GET(req: NextRequest) {
    const auth = req.headers.get("authorization");
    if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });

    const db = admin();
    const openai = new OpenAI({ apiKey: openaiKey });
    const startTime = Date.now();
    const stats = { generated: 0, failed: 0, skipped_url: 0, skipped_short: 0 };

    // Priority HOT/WARM opps first
    const { data: priority } = await db
        .from("user_matches")
        .select("opportunity_id")
        .in("classification", ["HOT", "WARM"])
        .limit(200);
    const priorityIds = new Set<string>((priority || []).map((m: { opportunity_id: string }) => m.opportunity_id));

    const { data: candidates } = await db
        .from("opportunities")
        .select("id, notice_id, title, agency, notice_type, naics_code, set_aside_code, award_amount, estimated_value, response_deadline, place_of_performance_state, place_of_performance_city, description, incumbent_contractor_name")
        .eq("is_archived", false)
        .or("ai_win_strategy.is.null,ai_win_strategy.eq.{}")
        .order("posted_date", { ascending: false, nullsFirst: false })
        .limit(BATCH_SIZE * 3);

    const rows = (candidates || []) as Array<Record<string, unknown>>;
    const sorted = rows.sort((a, b) => (priorityIds.has(b.id as string) ? 1 : 0) - (priorityIds.has(a.id as string) ? 1 : 0));
    const targets = sorted.slice(0, BATCH_SIZE);

    if (targets.length === 0) {
        return NextResponse.json({ success: true, message: "No opportunities need strategies", ...stats });
    }

    for (const opp of targets) {
        if (Date.now() - startTime > 270_000) break;
        const description = String(opp.description || "");
        if (description.startsWith("https://api.sam.gov")) {
            stats.skipped_url++;
            continue;
        }
        if (description.length < 100) {
            stats.skipped_short++;
            continue;
        }
        try {
            const setAside = (opp.set_aside_code as string) || "None";
            const value = (opp.award_amount as number) || (opp.estimated_value as number);
            const prompt = `Federal contracting capture strategist.
Title: ${opp.title}
Agency: ${opp.agency || "Unknown"}  NAICS: ${opp.naics_code || "N/A"}  Set-Aside: ${setAside}
Value: ${value ? `$${Number(value).toLocaleString()}` : "N/A"}  Incumbent: ${opp.incumbent_contractor_name || "Unknown"}
DESCRIPTION: ${description.slice(0, 2200)}

JSON:
{"summary":"2-3 sentence exec summary","sales_angle":"key differentiator","recommended_profile":"ideal contractor","key_risks":["r1","r2","r3"],"win_probability_factors":{"positive":["f1"],"negative":["f1"]},"next_steps":["s1","s2","s3"],"competitive_positioning":"vs incumbent"}`;
            const resp = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [{ role: "user", content: prompt }],
                temperature: 0.3,
                max_tokens: 900,
                response_format: { type: "json_object" },
            });
            const text = (resp.choices[0]?.message?.content || "").trim();
            const strat = JSON.parse(text);
            if (strat?.summary) {
                await db
                    .from("opportunities")
                    .update({
                        ai_win_strategy: strat,
                        last_crawled_at: new Date().toISOString(),
                    })
                    .eq("id", opp.id);
                stats.generated++;
            } else {
                stats.failed++;
            }
        } catch {
            stats.failed++;
        }
    }

    return NextResponse.json({ success: true, ...stats, elapsed_ms: Date.now() - startTime });
}
