import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/auth-server";

export const maxDuration = 120;

/**
 * POST /api/ai/summarize-document
 * AI-powered document analysis using GPT-4o-mini.
 *
 * Accepts either:
 * - { notice_id } → fetches description + attachments from SAM.gov, summarizes
 * - { text } → summarizes provided text directly
 * - { file_url } → downloads and summarizes a PDF/document
 *
 * Returns structured analysis:
 * - executive_summary (2-3 sentences)
 * - key_requirements (bullet points)
 * - evaluation_criteria (if found)
 * - estimated_value (if extractable)
 * - period_of_performance
 * - certifications_needed
 * - risks_and_flags
 * - recommended_actions
 */
export async function POST(req: NextRequest) {
    // Audit fix #3: require auth — prevent OpenAI cost-abuse via unauth loops.
    const auth = await requireUser();
    if (auth instanceof NextResponse) return auth;

    const OPENAI_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_KEY) {
        return NextResponse.json({ error: "OpenAI API key not configured" }, { status: 500 });
    }

    try {
        const body = await req.json();
        const { notice_id, text, file_url } = body;

        let documentText = text || "";

        // If notice_id provided, fetch from SAM.gov
        if (notice_id && !documentText) {
            const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

            // Get opportunity data
            const { data: opp } = await db
                .from("opportunities")
                .select("title, description, agency, naics_code, set_aside_code, notice_type, response_deadline, estimated_value, structured_requirements, raw_json")
                .eq("notice_id", notice_id)
                .single();

            if (opp) {
                documentText = `Title: ${opp.title || ""}\n`;
                documentText += `Agency: ${opp.agency || ""}\n`;
                documentText += `NAICS: ${opp.naics_code || ""}\n`;
                documentText += `Set-Aside: ${opp.set_aside_code || ""}\n`;
                documentText += `Notice Type: ${opp.notice_type || ""}\n`;
                documentText += `Deadline: ${opp.response_deadline || ""}\n`;
                documentText += `Estimated Value: ${opp.estimated_value || "Not specified"}\n\n`;

                // Try to fetch actual description if it's a URL
                const desc = opp.description || "";
                if (desc.startsWith("https://api.sam.gov")) {
                    try {
                        const SAM_KEY = process.env.SAM_API_KEY;
                        const descRes = await fetch(desc, {
                            headers: SAM_KEY ? { "X-Api-Key": SAM_KEY } : {},
                            signal: AbortSignal.timeout(15000),
                        });
                        if (descRes.ok) {
                            const html = await descRes.text();
                            const cleanText = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
                            documentText += `Description:\n${cleanText.substring(0, 8000)}\n\n`;
                        }
                    } catch { /* timeout ok */ }
                } else if (desc.length > 50) {
                    documentText += `Description:\n${desc.substring(0, 8000)}\n\n`;
                }

                // Include structured requirements if available
                if (opp.structured_requirements && Object.keys(opp.structured_requirements).length > 0) {
                    documentText += `Known Requirements: ${JSON.stringify(opp.structured_requirements)}\n\n`;
                }
            }
        }

        // If file_url provided, try to fetch text
        if (file_url && !documentText) {
            try {
                const fileRes = await fetch(file_url, { signal: AbortSignal.timeout(15000) });
                if (fileRes.ok) {
                    const contentType = fileRes.headers.get("content-type") || "";
                    if (contentType.includes("text") || contentType.includes("html")) {
                        const html = await fileRes.text();
                        documentText = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().substring(0, 10000);
                    } else {
                        // Binary file — extract readable ASCII
                        const buffer = await fileRes.arrayBuffer();
                        const bytes = new Uint8Array(buffer);
                        const raw = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
                        const chunks = raw.match(/[\x20-\x7E]{30,}/g) || [];
                        documentText = chunks.filter(c => !c.includes("obj") && !c.includes("stream")).join(" ").substring(0, 10000);
                    }
                }
            } catch { /* timeout */ }
        }

        if (!documentText || documentText.length < 50) {
            return NextResponse.json({ error: "No document text available to analyze" }, { status: 400 });
        }

        // Call GPT-4o-mini for structured analysis
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${OPENAI_KEY}`,
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [
                    {
                        role: "system",
                        content: `You are an expert government contracting analyst. Analyze the provided opportunity document and return a JSON object with this exact structure:
{
  "executive_summary": "2-3 sentence overview of what this opportunity is about",
  "key_requirements": ["requirement 1", "requirement 2", ...],
  "evaluation_criteria": ["criterion 1", "criterion 2", ...],
  "estimated_value": "dollar amount or range if mentioned, null if not found",
  "period_of_performance": "duration if mentioned, null if not found",
  "certifications_needed": ["cert 1", "cert 2", ...],
  "risks_and_flags": ["risk 1", "risk 2", ...],
  "recommended_actions": ["action 1", "action 2", ...],
  "competition_level": "LOW | MEDIUM | HIGH based on set-aside type and complexity",
  "ideal_contractor_profile": "1-2 sentence description of the ideal contractor"
}
Return ONLY valid JSON, no markdown or code blocks.`
                    },
                    {
                        role: "user",
                        content: documentText.substring(0, 12000)
                    }
                ],
                max_tokens: 1500,
                temperature: 0.2,
            }),
        });

        if (!response.ok) {
            return NextResponse.json({ error: `OpenAI error: ${response.status}` }, { status: 500 });
        }

        const data = await response.json();
        let content = data.choices?.[0]?.message?.content?.trim() || "{}";

        // Clean markdown if returned
        if (content.startsWith("```")) {
            content = content.split("\n").slice(1).join("\n").replace(/```$/, "").trim();
        }

        const analysis = JSON.parse(content);

        // If notice_id, store the analysis in the DB
        if (notice_id) {
            const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
            await db.from("opportunities").update({
                ai_win_strategy: analysis,
                structured_requirements: {
                    ...(analysis.certifications_needed?.length ? { certifications_required: analysis.certifications_needed } : {}),
                    ...(analysis.estimated_value ? { estimated_value_from_ai: analysis.estimated_value } : {}),
                    ...(analysis.period_of_performance ? { period_of_performance: analysis.period_of_performance } : {}),
                },
            }).eq("notice_id", notice_id);
        }

        return NextResponse.json({
            success: true,
            analysis,
            text_length: documentText.length,
        });

    } catch (e) {
        console.error("AI summarize error:", e);
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
