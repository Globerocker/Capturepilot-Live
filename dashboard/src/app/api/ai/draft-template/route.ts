import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 90;

/**
 * POST /api/ai/draft-template
 * Generate a reusable proposal template section (past-performance blurb,
 * differentiators paragraph, management approach, etc.).
 *
 * Body: {
 *   user_profile_id: string,
 *   template_type: "past_performance" | "differentiators" | "management_approach" | "technical_approach" | "corporate_overview" | "custom",
 *   title?: string,            // custom title (required if template_type === "custom")
 *   prompt?: string,           // extra guidance
 *   save?: boolean,            // if true, save result to user_documents as category=template
 * }
 *
 * Returns: { title, content, saved_document_id?: string }
 */
export async function POST(req: NextRequest) {
    const OPENAI_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_KEY) {
        console.error("[draft-template] OPENAI_API_KEY not set");
        return NextResponse.json({ error: "OpenAI not configured" }, { status: 500 });
    }

    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

    const {
        user_profile_id, template_type, title, prompt, save,
    } = body as {
        user_profile_id?: string;
        template_type?: string;
        title?: string;
        prompt?: string;
        save?: boolean;
    };

    if (!user_profile_id) return NextResponse.json({ error: "user_profile_id required" }, { status: 400 });

    const validTypes = ["past_performance", "differentiators", "management_approach", "technical_approach", "corporate_overview", "custom"];
    if (!template_type || !validTypes.includes(template_type)) {
        return NextResponse.json({ error: `template_type must be one of ${validTypes.join(", ")}` }, { status: 400 });
    }
    if (template_type === "custom" && !title) {
        return NextResponse.json({ error: "title required for custom template_type" }, { status: 400 });
    }

    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

    const { data: profile } = await db.from("user_profiles")
        .select("company_name, naics_codes, sba_certifications, state, employee_count, revenue, years_in_business, federal_awards_count, company_description, website")
        .eq("id", user_profile_id).single();
    if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

    const companyContext = `
COMPANY PROFILE:
Name: ${profile.company_name}
NAICS: ${(profile.naics_codes || []).join(", ")}
Certifications: ${(profile.sba_certifications || []).join(", ") || "None"}
State: ${profile.state || "N/A"}
Employees: ${profile.employee_count || "N/A"}
Revenue: ${profile.revenue ? `$${Number(profile.revenue).toLocaleString()}` : "N/A"}
Years in Business: ${profile.years_in_business || "N/A"}
Federal Awards: ${profile.federal_awards_count || 0}
Description: ${profile.company_description || "N/A"}
Website: ${profile.website || "N/A"}`;

    const typeGuides: Record<string, { title: string; prompt: string }> = {
        past_performance: {
            title: "Past Performance Blurb",
            prompt: "Write a single polished paragraph (~150-220 words) describing the company's past performance on federal or commercial contracts. If specific awards are unknown, speak generally about scope, client types, and results. Use the PWRM framework (Problem, Work, Result, Metric) where possible. Keep it reusable across proposals.",
        },
        differentiators: {
            title: "Differentiators Paragraph",
            prompt: "Write a crisp 150-200 word paragraph that articulates 3-5 concrete differentiators. Each differentiator must be a specific capability or outcome, not a generic adjective. Tie back to federal procurement pain points (schedule risk, cost control, compliance). No marketing fluff.",
        },
        management_approach: {
            title: "Management Approach",
            prompt: "Write a 250-350 word management approach section suitable for a federal proposal. Cover: governance & reporting cadence, staffing model, risk management, QA/QC, and communication. Neutral tone. Use concrete federal contract vocabulary (PM, KO, COR, PWS, QASP).",
        },
        technical_approach: {
            title: "Technical Approach Skeleton",
            prompt: "Produce a reusable technical-approach skeleton (250-350 words) with placeholders [LIKE_THIS] for opportunity-specific details. Cover: understanding of requirement, proposed methodology, tooling/stack categories, phased delivery, transition-in plan. Make it easy to adapt to any PWS.",
        },
        corporate_overview: {
            title: "Corporate Overview",
            prompt: "Write a 180-250 word corporate overview suitable for proposal front matter. Cover: founding context, core competencies, certifications, geographic reach, recent growth. Professional, factual tone.",
        },
        custom: {
            title: title || "Custom Template",
            prompt: "Write a reusable proposal section per the user's guidance. Keep it professional, concrete, and easy to adapt across solicitations.",
        },
    };

    const guide = typeGuides[template_type];
    const resolvedTitle = template_type === "custom" ? (title as string) : guide.title;

    const system = `You are a federal proposal-writing specialist. You produce crisp, reusable proposal sections grounded in the contractor's actual profile. You avoid fabricating specific awards, contract numbers, or clients that aren't provided. Return JSON with keys "title" and "content" only.`;

    const user = `Create a reusable proposal template section.

TITLE: ${resolvedTitle}

INSTRUCTIONS:
${guide.prompt}

${prompt ? `ADDITIONAL USER GUIDANCE:\n${prompt}\n` : ""}

${companyContext}

Output JSON: {"title": "${resolvedTitle}", "content": "..."} — content is plain text with real newlines.`;

    try {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${OPENAI_KEY}`,
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                temperature: 0.5,
                response_format: { type: "json_object" },
                messages: [
                    { role: "system", content: system },
                    { role: "user", content: user },
                ],
            }),
        });

        if (!res.ok) {
            const errText = await res.text();
            console.error("[draft-template] OpenAI error:", res.status, errText);
            return NextResponse.json({ error: `OpenAI request failed: ${res.status}` }, { status: 502 });
        }

        const json = await res.json();
        const content = json.choices?.[0]?.message?.content || "{}";
        let parsed: { title?: string; content?: string };
        try { parsed = JSON.parse(content); } catch (e) {
            console.error("[draft-template] JSON parse failed:", e, content);
            return NextResponse.json({ error: "Invalid AI response" }, { status: 502 });
        }

        if (!parsed.content) {
            console.error("[draft-template] missing content:", parsed);
            return NextResponse.json({ error: "AI returned empty template" }, { status: 502 });
        }

        let saved_document_id: string | undefined;
        if (save) {
            const { data: doc, error: saveErr } = await db.from("user_documents").insert({
                user_profile_id,
                name: parsed.title || resolvedTitle,
                category: "template",
                content: parsed.content,
                tags: [template_type],
            }).select("id").single();
            if (saveErr) {
                console.error("[draft-template] failed to save template:", saveErr);
                // non-fatal; still return draft
            } else {
                saved_document_id = (doc as { id: string }).id;
            }
        }

        return NextResponse.json({
            title: parsed.title || resolvedTitle,
            content: parsed.content,
            saved_document_id,
        });
    } catch (err) {
        console.error("[draft-template] fatal:", err);
        return NextResponse.json({ error: "Generation failed" }, { status: 500 });
    }
}
