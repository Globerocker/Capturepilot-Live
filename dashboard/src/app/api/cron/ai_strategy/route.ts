import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

export const maxDuration = 300;

function getSupabase() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!
    );
}

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export async function GET(req: NextRequest) {
    const authHeader = req.headers.get("authorization");
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
        return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });
    }

    try {
        const supabase = getSupabase();
        const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

        console.log("Starting AI Win Strategy generation...");

        // Fetch opportunities that need strategies
        // ai_win_strategy defaults to {} (empty JSON object) or null
        const { data: opps, error: fetchError } = await supabase
            .from("opportunities")
            .select("id, notice_id, title, agency, notice_type, naics_code, set_aside_code, award_amount, place_of_performance_state, place_of_performance_city, response_deadline, posted_date, description, incumbent_contractor_name, incumbent_contractor_uei, structured_requirements, strategic_scoring, set_aside_types")
            .or("ai_win_strategy.is.null,ai_win_strategy.eq.{}")
            .eq("is_archived", false)
            .order("response_deadline", { ascending: true, nullsFirst: false })
            .limit(20);

        if (fetchError) {
            console.error("Fetch error:", fetchError);
            return NextResponse.json({ error: fetchError.message }, { status: 500 });
        }

        if (!opps || opps.length === 0) {
            return NextResponse.json({ success: true, message: "No opportunities need win strategies", processed: 0 });
        }

        console.log(`Found ${opps.length} opportunities to analyze`);

        let success = 0;
        let failed = 0;
        let skipped = 0;

        for (let i = 0; i < opps.length; i++) {
            const opp = opps[i];
            const desc = (opp.description || "").slice(0, 2000);

            // Skip if we have no data to work with
            if (!desc && !opp.structured_requirements) {
                skipped++;
                continue;
            }

            // Build requirements context
            let reqs = "";
            if (opp.structured_requirements && typeof opp.structured_requirements === "object") {
                const sr = opp.structured_requirements as Record<string, unknown>;
                for (const key of ["scope_of_work", "requirements", "qualifications", "deliverables"]) {
                    if (sr[key]) {
                        const items = Array.isArray(sr[key]) ? sr[key] : [sr[key]];
                        reqs += `\n${key.toUpperCase()}: ${(items as string[]).slice(0, 5).join("; ")}`;
                    }
                }
            }

            const setAside = opp.set_aside_code || "None";
            const noticeType = opp.notice_type || "Unknown";
            const value = opp.award_amount;
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
${desc || "No description available."}

${reqs ? "REQUIREMENTS:" + reqs.slice(0, 1500) : ""}

Respond in EXACTLY this JSON format (no markdown, no code fences):
{
  "summary": "2-3 sentence executive summary of what this opportunity is and why it matters",
  "sales_angle": "The key differentiator or approach a small business should emphasize to win",
  "recommended_profile": "Ideal contractor profile: company size, certifications needed, key capabilities",
  "key_risks": ["risk 1", "risk 2", "risk 3"],
  "win_probability_factors": {
    "positive": ["factor 1", "factor 2"],
    "negative": ["factor 1", "factor 2"]
  },
  "next_steps": ["step 1", "step 2", "step 3"],
  "competitive_positioning": "How to position against likely competitors including the incumbent"
}`;

            try {
                const response = await openai.chat.completions.create({
                    model: "gpt-4o-mini",
                    messages: [{ role: "user", content: prompt }],
                    temperature: 0.3,
                    max_tokens: 1000,
                });

                let text = (response.choices[0]?.message?.content || "").trim();

                // Clean up markdown fences if present
                if (text.startsWith("```")) {
                    text = text.split("\n", 2)[1] ? text.slice(text.indexOf("\n") + 1) : text.slice(3);
                }
                if (text.endsWith("```")) {
                    text = text.slice(0, -3);
                }
                if (text.startsWith("json")) {
                    text = text.slice(4);
                }
                text = text.trim();

                const strategy = JSON.parse(text);

                if (!strategy || typeof strategy !== "object" || !strategy.summary) {
                    throw new Error("Invalid strategy format - missing summary");
                }

                await supabase
                    .from("opportunities")
                    .update({ ai_win_strategy: strategy })
                    .eq("id", opp.id);

                success++;
            } catch (e: unknown) {
                failed++;
                const errMsg = e instanceof Error ? e.message : String(e);
                if (errMsg.includes("429") || errMsg.toLowerCase().includes("quota")) {
                    console.log(`Rate limited at ${i + 1}/${opps.length}. Stopping.`);
                    break;
                }
                if (i < 5) {
                    console.error(`Error on "${(opp.title || "").slice(0, 40)}": ${errMsg.slice(0, 100)}`);
                }
            }

            // Progress logging
            if ((i + 1) % 10 === 0) {
                console.log(`[${i + 1}/${opps.length}] success=${success} fail=${failed} skip=${skipped}`);
            }

            // Rate limit: 1s between requests
            await sleep(1000);
        }

        console.log(`Done. Strategies: ${success}, Failed: ${failed}, Skipped: ${skipped}`);
        return NextResponse.json({ success: true, processed: success, failed, skipped });

    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Unknown error";
        console.error("Fatal AI strategy error:", message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
