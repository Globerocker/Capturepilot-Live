import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { computeStrategicScoring } from "@/lib/strategic-scoring";
import { extractStructuredRequirements } from "@/lib/extract-requirements";

export const maxDuration = 120;

function getAdmin() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
    );
}

const SAM_API_KEY = process.env.SAM_API_KEY || "";

/**
 * POST /api/admin/enrich-opportunity/[id]
 *
 * Runs the full enrichment pipeline end-to-end for ONE opportunity:
 *   1. Fetch description text from SAM.gov (if still a URL)
 *   2. Extract structured_requirements
 *   3. Compute strategic_scoring
 *   4. Try to link incumbent_contractor_uei
 *   5. Generate ai_win_strategy via OpenAI (optional, only if OPENAI_API_KEY is set)
 *
 * Designed for debugging and one-off smoke tests — no batching, no rate limits.
 * Returns the full before/after payload so you can see exactly what changed.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    // Gate on authenticated user (any onboarded customer may enrich on-demand).
    const cookieStore = await cookies();
    const sb = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll: () => cookieStore.getAll() } },
    );
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = getAdmin();
    const { data: opp, error } = await admin
        .from("opportunities")
        .select("*")
        .eq("id", id)
        .single();

    if (error || !opp) {
        return NextResponse.json({ error: "Opportunity not found", details: error?.message }, { status: 404 });
    }

    const results: Record<string, unknown> = { steps: [], before: {}, after: {} };
    (results.before as Record<string, unknown>) = {
        has_strategic_scoring: opp.strategic_scoring && Object.keys(opp.strategic_scoring).length > 0,
        has_structured_requirements: opp.structured_requirements && Object.keys(opp.structured_requirements).length > 0,
        has_ai_win_strategy: opp.ai_win_strategy && Object.keys(opp.ai_win_strategy).length > 0,
        incumbent_uei: opp.incumbent_contractor_uei,
        description_is_url: String(opp.description || "").startsWith("https://api.sam.gov"),
    };

    const updates: Record<string, unknown> = {};

    // Step 1: Fetch description text if it's still a URL
    let description = String(opp.description || "");
    if (description.startsWith("https://api.sam.gov")) {
        try {
            const r = await fetch(description, {
                headers: SAM_API_KEY ? { "X-Api-Key": SAM_API_KEY } : {},
                signal: AbortSignal.timeout(15_000),
            });
            if (r.ok) {
                const html = await r.text();
                const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 12_000);
                if (text.length > 100) {
                    description = text;
                    updates.description = text;
                    (results.steps as string[]).push(`description_fetched (${text.length} chars)`);
                } else {
                    (results.steps as string[]).push("description_fetch_returned_short");
                }
            } else {
                (results.steps as string[]).push(`description_fetch_failed (status ${r.status})`);
            }
        } catch (e) {
            (results.steps as string[]).push(`description_fetch_error (${(e as Error).message})`);
        }
    } else {
        (results.steps as string[]).push(`description_already_text (${description.length} chars)`);
    }

    // Step 2: Structured requirements
    const reqs = extractStructuredRequirements(description);
    updates.structured_requirements = reqs;
    (results.steps as string[]).push(`structured_requirements_extracted (keys=${Object.keys(reqs).length})`);

    // Step 3: Strategic scoring
    const scoring = computeStrategicScoring({
        ...opp,
        description, // use potentially-refreshed description
    });
    updates.strategic_scoring = scoring;
    (results.steps as string[]).push(`strategic_scoring: comp=${scoring.est_competition_level} cx=${scoring.complexity_level} win=${scoring.win_prob_tier}`);

    // Step 4: Incumbent UEI link
    if (opp.incumbent_contractor_name && !opp.incumbent_contractor_uei) {
        try {
            const name = String(opp.incumbent_contractor_name).trim();
            const needle = name.length > 40 ? name.slice(0, 40) : name;
            const { data: matches } = await admin
                .from("contractors")
                .select("uei, legal_business_name")
                .ilike("legal_business_name", `%${needle}%`)
                .limit(1);
            if (matches && matches[0]?.uei) {
                updates.incumbent_contractor_uei = matches[0].uei;
                (results.steps as string[]).push(`incumbent_uei_linked (${matches[0].uei})`);
            } else {
                (results.steps as string[]).push("incumbent_uei_not_found");
            }
        } catch (e) {
            (results.steps as string[]).push(`incumbent_lookup_error (${(e as Error).message})`);
        }
    }

    // Step 5: AI win strategy (OpenAI)
    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey && description.length > 100) {
        try {
            const openai = new OpenAI({ apiKey: openaiKey });
            const setAside = opp.set_aside_code || "None";
            const noticeType = opp.notice_type || "Unknown";
            const value = opp.award_amount || opp.estimated_value;
            const valueStr = value ? `$${Number(value).toLocaleString()}` : "Not specified";
            const incumbent = opp.incumbent_contractor_name || "Unknown";
            const deadline = opp.response_deadline || "Not specified";
            const state = opp.place_of_performance_state || "Not specified";

            const prompt = `You are a federal government contracting capture strategist. Analyze this opportunity and provide a concise win strategy.

OPPORTUNITY:
- Title: ${opp.title}
- Agency: ${opp.agency || "Unknown"}
- Notice Type: ${noticeType}
- NAICS: ${opp.naics_code || "N/A"}
- Set-Aside: ${setAside}
- Estimated Value: ${valueStr}
- Location: ${state}, ${opp.place_of_performance_city || ""}
- Deadline: ${deadline}
- Incumbent: ${incumbent}

DESCRIPTION:
${description.slice(0, 2500)}

Respond in EXACTLY this JSON format (no markdown, no code fences):
{
  "summary": "2-3 sentence executive summary",
  "sales_angle": "Key differentiator a small business should emphasize",
  "recommended_profile": "Ideal contractor profile",
  "key_risks": ["risk 1", "risk 2", "risk 3"],
  "win_probability_factors": {"positive": ["factor 1"], "negative": ["factor 1"]},
  "next_steps": ["step 1", "step 2", "step 3"],
  "competitive_positioning": "How to position vs incumbent"
}`;

            const response = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [{ role: "user", content: prompt }],
                temperature: 0.3,
                max_tokens: 1000,
            });

            let text = (response.choices[0]?.message?.content || "").trim();
            if (text.startsWith("```")) text = text.slice(text.indexOf("\n") + 1);
            if (text.endsWith("```")) text = text.slice(0, -3);
            if (text.startsWith("json")) text = text.slice(4);
            text = text.trim();

            const strategy = JSON.parse(text);
            if (strategy && typeof strategy === "object" && strategy.summary) {
                updates.ai_win_strategy = strategy;
                (results.steps as string[]).push(`ai_win_strategy_generated (summary=${String(strategy.summary).length} chars)`);
            }
        } catch (e) {
            (results.steps as string[]).push(`ai_strategy_error (${(e as Error).message.slice(0, 200)})`);
        }
    } else if (!openaiKey) {
        (results.steps as string[]).push("ai_strategy_skipped_no_openai_key");
    } else {
        (results.steps as string[]).push("ai_strategy_skipped_description_too_short");
    }

    // Persist
    updates.last_crawled_at = new Date().toISOString();
    const { error: upErr } = await admin
        .from("opportunities")
        .update(updates)
        .eq("id", id);
    if (upErr) {
        return NextResponse.json({ error: "Update failed", details: upErr.message, steps: results.steps }, { status: 500 });
    }

    (results.after as Record<string, unknown>) = {
        fields_updated: Object.keys(updates),
    };

    return NextResponse.json({ success: true, id, ...results });
}
