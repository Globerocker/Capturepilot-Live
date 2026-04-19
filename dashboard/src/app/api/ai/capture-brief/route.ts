import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { callLLMJson } from "@/lib/llm/deepseek";

export const maxDuration = 120;

/**
 * POST /api/ai/capture-brief
 * Generates a 2-3 page "capture brief" for a given opportunity + user.
 *
 * Orchestrates: opportunity + structured_requirements + strategic_scoring
 * + past_awards + competitor context → single LLM call → returns JSON
 * with sections. Caches in capture_briefs table for 7 days.
 *
 * Body: { notice_id: string; force?: boolean }
 */

interface CaptureBrief {
    program_background: string;
    incumbent_assessment: string;
    agency_context: string;
    competitor_landscape: string;
    gaps_and_risks: string[];
    win_themes: string[];
    recommended_capture_actions: string[];
    bid_no_bid_recommendation: "GO" | "WATCH" | "NO-GO";
    pwin_estimate: number; // 0-100
    next_7_days: string[];
}

const SYSTEM_PROMPT = `You are a federal capture manager writing a concise capture brief. Output ONLY valid JSON matching the schema. Be specific, cite numbers, and recommend concrete actions. No fluff, no filler.

Schema:
{
  "program_background": "2-3 sentences on what the agency needs and why",
  "incumbent_assessment": "2-3 sentences naming incumbent + contract length + fit",
  "agency_context": "buying patterns of this agency for this NAICS, 2-3 sentences",
  "competitor_landscape": "likely bidders and their strengths, 2-3 sentences",
  "gaps_and_risks": ["bullet", "bullet", "bullet"],
  "win_themes": ["theme 1", "theme 2", "theme 3"],
  "recommended_capture_actions": ["action 1", "action 2", "action 3", "action 4", "action 5"],
  "bid_no_bid_recommendation": "GO" | "WATCH" | "NO-GO",
  "pwin_estimate": integer 0-100,
  "next_7_days": ["specific task 1", "specific task 2", "specific task 3"]
}`;

export async function POST(req: NextRequest) {
    const cookieStore = await cookies();
    const sb = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll: () => cookieStore.getAll() } }
    );
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const noticeId = body.notice_id as string | undefined;
    const force = body.force === true;
    if (!noticeId) return NextResponse.json({ error: "notice_id required" }, { status: 400 });

    const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { data: profile } = await admin
        .from("user_profiles")
        .select("id, company_name, naics_codes, sba_certifications, capability_statement, target_states, revenue, years_in_business, federal_awards_count, is_veteran_owned, veteran_cert_type")
        .eq("auth_user_id", user.id)
        .single();
    if (!profile) return NextResponse.json({ error: "No profile" }, { status: 404 });
    const p = profile as Record<string, unknown>;
    const userProfileId = p.id as string;

    // Load opportunity
    const { data: opp } = await admin
        .from("opportunities")
        .select("id, notice_id, title, department, agency, typeOfSetAside, typeOfSetAsideDescription, naics_code, psc_code, description, response_deadline, award_amount, place_of_performance_state, structured_requirements, strategic_scoring, ai_win_strategy")
        .eq("notice_id", noticeId)
        .single();
    if (!opp) return NextResponse.json({ error: "Opportunity not found" }, { status: 404 });
    const o = opp as Record<string, unknown>;
    const opportunityId = o.id as string;

    // Check cache
    if (!force) {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const { data: cached } = await admin
            .from("capture_briefs")
            .select("brief_json, pwin_estimate, generated_at, model_used")
            .eq("user_profile_id", userProfileId)
            .eq("opportunity_id", opportunityId)
            .gt("generated_at", sevenDaysAgo)
            .order("generated_at", { ascending: false })
            .limit(1)
            .maybeSingle();
        if (cached) {
            return NextResponse.json({
                brief: cached.brief_json,
                pwin: cached.pwin_estimate,
                generated_at: cached.generated_at,
                model: cached.model_used,
                cached: true,
            });
        }
    }

    // Past awards context for the same NAICS/agency (last 3 years, top 5)
    const threeYearsAgo = new Date(Date.now() - 3 * 365 * 24 * 60 * 60 * 1000).toISOString();
    const { data: priorAwards } = await admin
        .from("opportunities")
        .select("title, award_amount, contractor_name, response_deadline, typeOfSetAside")
        .eq("naics_code", o.naics_code)
        .eq("department", o.department)
        .not("award_amount", "is", null)
        .gt("response_deadline", threeYearsAgo)
        .order("award_amount", { ascending: false })
        .limit(5);

    const userCtx = {
        company: p.company_name,
        naics: p.naics_codes,
        certs: p.sba_certifications,
        revenue: p.revenue,
        years_in_business: p.years_in_business,
        federal_awards: p.federal_awards_count,
        target_states: p.target_states,
        veteran: p.is_veteran_owned ? (p.veteran_cert_type || "yes") : null,
        capability_statement: ((p.capability_statement as string) || "").slice(0, 2000),
    };

    const oppCtx = {
        title: o.title,
        agency: o.department,
        set_aside: o.typeOfSetAsideDescription || o.typeOfSetAside,
        naics: o.naics_code,
        psc: o.psc_code,
        state: o.place_of_performance_state,
        response_deadline: o.response_deadline,
        estimated_value: o.award_amount,
        description: ((o.description as string) || "").slice(0, 4000),
        structured_requirements: o.structured_requirements,
        strategic_scoring: o.strategic_scoring,
        ai_win_strategy: o.ai_win_strategy,
    };

    const userMessage = [
        "USER PROFILE:",
        JSON.stringify(userCtx, null, 2),
        "",
        "OPPORTUNITY:",
        JSON.stringify(oppCtx, null, 2),
        "",
        "RECENT RELATED AWARDS (same agency + NAICS, last 3 years):",
        JSON.stringify(priorAwards || [], null, 2),
        "",
        "Generate the capture brief JSON per the schema.",
    ].join("\n");

    let brief: CaptureBrief;
    let modelUsed: string;
    try {
        const result = await callLLMJson<CaptureBrief>(
            [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: userMessage },
            ],
            { temperature: 0.3, max_tokens: 2500 }
        );
        brief = result;
        modelUsed = process.env.DEEPSEEK_API_KEY ? "deepseek-chat" : "gpt-4o-mini";
    } catch (e) {
        const msg = e instanceof Error ? e.message : "LLM call failed";
        return NextResponse.json({ error: msg }, { status: 500 });
    }

    const pwin = Math.max(0, Math.min(100, Number(brief.pwin_estimate) || 0));

    await admin.from("capture_briefs").insert({
        user_profile_id: userProfileId,
        opportunity_id: opportunityId,
        notice_id: noticeId,
        brief_json: brief,
        pwin_estimate: pwin,
        model_used: modelUsed,
    });

    return NextResponse.json({
        brief,
        pwin,
        generated_at: new Date().toISOString(),
        model: modelUsed,
        cached: false,
    });
}
