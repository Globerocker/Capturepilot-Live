import { NextRequest, NextResponse, after } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { computeStrategicScoring } from "@/lib/strategic-scoring";
import { extractStructuredRequirements } from "@/lib/extract-requirements";
import { createJob, runStep, startJob, completeJob, failJob, requireProfileId } from "@/lib/background-jobs";

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
 * Job-based variant. Creates a background job, returns { jobId } immediately,
 * and runs the 5-step enrichment pipeline in an `after()` block. The client
 * subscribes to /api/jobs/[jobId] to get live step-by-step progress.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

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
        .select("id, notice_id, title, description, raw_json, naics_code, set_aside_code, notice_type, award_amount, estimated_value, response_deadline, place_of_performance_state, place_of_performance_city, incumbent_contractor_name, incumbent_contractor_uei, agency, strategic_scoring, structured_requirements, ai_win_strategy")
        .eq("id", id)
        .single();

    if (error || !opp) {
        return NextResponse.json({ error: "Opportunity not found", details: error?.message }, { status: 404 });
    }
    const o = opp as Record<string, unknown>;

    const profileId = await requireProfileId(user.id);

    const { jobId } = await createJob(profileId, {
        kind: "ai_win_strategy",
        title: `Win Strategy: ${String(o.title || "Opportunity").slice(0, 80)}`,
        opportunity_id: id,
        notice_id: (o.notice_id as string) || null,
        steps: [
            { key: "fetch_description", label: "Fetching description from SAM.gov" },
            { key: "extract_requirements", label: "Extracting structured requirements" },
            { key: "compute_scoring", label: "Computing strategic scoring" },
            { key: "link_incumbent", label: "Linking incumbent contractor (if any)" },
            { key: "ai_strategy", label: "Generating AI win strategy (OpenAI)" },
            { key: "persist", label: "Saving to opportunity" },
        ],
    });

    // Fire-and-forget the heavy work. Response returns jobId below.
    after(async () => {
        await startJob(jobId);
        try {
            let description = String(o.description || "");

            // Step 1: description fetch
            description = await runStep<string>(
                jobId,
                "fetch_description",
                async () => {
                    if (!description.startsWith("https://api.sam.gov")) {
                        return description;
                    }
                    const r = await fetch(description, {
                        headers: SAM_API_KEY ? { "X-Api-Key": SAM_API_KEY } : {},
                        signal: AbortSignal.timeout(15_000),
                    });
                    if (!r.ok) throw new Error(`SAM.gov returned ${r.status}`);
                    const html = await r.text();
                    const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 12_000);
                    if (text.length < 100) throw new Error(`SAM.gov returned ${text.length} chars — too short`);
                    return text;
                },
                {
                    detailOnStart: description.startsWith("https://api.sam.gov") ? "Fetching live from SAM.gov" : "Already have text",
                    detailOnDone: (txt) => `${txt.length.toLocaleString()} chars`,
                    skipIf: () => !description.startsWith("https://api.sam.gov") && description.length > 100,
                },
            ) || description;

            // Step 2: requirements
            const reqs = await runStep<Record<string, unknown>>(
                jobId,
                "extract_requirements",
                async () => extractStructuredRequirements(description) as unknown as Record<string, unknown>,
                { detailOnDone: (r) => `${Object.keys(r).length} requirement keys found` },
            ) || {};

            // Step 3: scoring
            const scoring = await runStep<Record<string, unknown>>(
                jobId,
                "compute_scoring",
                async () => computeStrategicScoring({ ...(o as Record<string, unknown>), description } as never) as unknown as Record<string, unknown>,
                { detailOnDone: (s) => `win=${s.win_prob_tier} complexity=${s.complexity_level} competition=${s.est_competition_level}` },
            ) || {};

            // Step 4: incumbent UEI (optional)
            let incumbentUei: string | null = (o.incumbent_contractor_uei as string) || null;
            const incumbentName = (o.incumbent_contractor_name as string) || null;
            await runStep(
                jobId,
                "link_incumbent",
                async () => {
                    if (!incumbentName) return "No incumbent to match";
                    if (incumbentUei) return `Already linked: ${incumbentUei}`;
                    const needle = incumbentName.length > 40 ? incumbentName.slice(0, 40) : incumbentName;
                    const { data: matches } = await admin
                        .from("contractors")
                        .select("uei, legal_business_name")
                        .ilike("legal_business_name", `%${needle}%`)
                        .limit(1);
                    if (matches && matches[0]?.uei) {
                        incumbentUei = matches[0].uei as string;
                        return `Linked UEI ${incumbentUei} → ${matches[0].legal_business_name}`;
                    }
                    return `No UEI match found for "${incumbentName}"`;
                },
                {
                    skipIf: () => !incumbentName,
                    detailOnDone: (msg) => msg as string,
                },
            );

            // Step 5: AI win strategy (OpenAI)
            const openaiKey = process.env.OPENAI_API_KEY;
            const strategy = await runStep<Record<string, unknown>>(
                jobId,
                "ai_strategy",
                async () => {
                    if (!openaiKey) throw new Error("OPENAI_API_KEY not configured");
                    if (!description || description.length < 100) throw new Error("Description too short");
                    const openai = new OpenAI({ apiKey: openaiKey });
                    const setAside = (o.set_aside_code as string) || "None";
                    const noticeType = (o.notice_type as string) || "Unknown";
                    const value = (o.award_amount as number) || (o.estimated_value as number);
                    const valueStr = value ? `$${Number(value).toLocaleString()}` : "Not specified";
                    const prompt = `You are a federal government contracting capture strategist. Analyze this opportunity and provide a concise win strategy.

OPPORTUNITY:
- Title: ${o.title}
- Agency: ${o.agency || "Unknown"}
- Notice Type: ${noticeType}
- NAICS: ${o.naics_code || "N/A"}
- Set-Aside: ${setAside}
- Estimated Value: ${valueStr}
- Location: ${o.place_of_performance_state || "?"}, ${o.place_of_performance_city || ""}
- Deadline: ${o.response_deadline || "Not specified"}
- Incumbent: ${incumbentName || "Unknown"}

DESCRIPTION:
${description.slice(0, 2500)}

Respond in EXACTLY this JSON format:
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
                        response_format: { type: "json_object" },
                    });
                    let text = (response.choices[0]?.message?.content || "").trim();
                    if (text.startsWith("```")) text = text.slice(text.indexOf("\n") + 1);
                    if (text.endsWith("```")) text = text.slice(0, -3);
                    return JSON.parse(text);
                },
                { detailOnDone: (s) => `Generated ${Object.keys(s).length} fields (summary + angle + risks + next steps)` },
            ) || {};

            // Step 6: persist
            const updates: Record<string, unknown> = {
                structured_requirements: reqs,
                strategic_scoring: scoring,
                last_crawled_at: new Date().toISOString(),
            };
            if (description !== String(o.description || "")) {
                updates.description = description;
            }
            if (incumbentUei && incumbentUei !== (o.incumbent_contractor_uei as string)) {
                updates.incumbent_contractor_uei = incumbentUei;
            }
            if (strategy && Object.keys(strategy).length > 0) {
                updates.ai_win_strategy = strategy;
            }

            await runStep(
                jobId,
                "persist",
                async () => {
                    const { error: upErr } = await admin.from("opportunities").update(updates).eq("id", id);
                    if (upErr) throw new Error(upErr.message);
                    return Object.keys(updates);
                },
                { detailOnDone: (keys) => `Updated ${(keys as string[]).length} fields: ${(keys as string[]).join(", ")}` },
            );

            await completeJob(jobId, {
                opportunity_id: id,
                fields_updated: Object.keys(updates),
                has_ai_strategy: !!updates.ai_win_strategy,
            });
        } catch (e) {
            await failJob(jobId, (e as Error).message || "Unknown error").catch(() => { /* already failed */ });
        }
    });

    return NextResponse.json({ jobId });
}
