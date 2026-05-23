import { NextRequest, NextResponse } from "next/server";
import { HUMAN_VOICE_RULES } from "@/lib/llm/humanizer";

export const maxDuration = 30;

/**
 * POST /api/ai/capability-improve
 * Rewrites a selected passage from a Capability Statement section.
 *
 * Body: { text: string, section_title?: string, instruction?: "rewrite"|"shorten"|"expand"|"tighten" }
 * Returns: { improved_text: string }
 */
export async function POST(req: NextRequest) {
    const OPENAI_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_KEY) return NextResponse.json({ error: "OpenAI not configured" }, { status: 500 });

    try {
        const { text, section_title, instruction } = await req.json();
        if (!text || typeof text !== "string") {
            return NextResponse.json({ error: "text required" }, { status: 400 });
        }

        const mode = instruction || "rewrite";
        const directive: Record<string, string> = {
            rewrite: "Rewrite the passage to read more professionally for a federal Contracting Officer. Keep the same core facts. Active voice. No fluff.",
            shorten: "Shorten the passage by ~40%, preserving all concrete facts. Drop filler and adjectives.",
            expand: "Expand the passage by ~50% by adding specificity (capabilities, scope, quantified outcomes) without inventing new facts.",
            tighten: "Tighten the passage: remove hedging language, passive voice, and generic phrases. Keep same length roughly.",
        };

        const res = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_KEY}` },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [
                    {
                        role: "system",
                        content:
                            `${HUMAN_VOICE_RULES}\n\n` +
                            "You are rewriting passages of a Capability Statement. " +
                            "Return ONLY the rewritten text with no preamble, no quotation marks, no explanation. Preserve line breaks and bullet formatting if present.",
                    },
                    {
                        role: "user",
                        content: `${directive[mode] || directive.rewrite}\n\nSection: ${section_title || "unknown"}\n\nPassage:\n${text}`,
                    },
                ],
                max_tokens: 600,
                temperature: 0.3,
            }),
        });

        if (!res.ok) {
            const body = await res.text().catch(() => "");
            return NextResponse.json({ error: `OpenAI error ${res.status}: ${body}` }, { status: 500 });
        }

        const data = await res.json();
        const improved = (data.choices?.[0]?.message?.content || "").trim();
        return NextResponse.json({ improved_text: improved });
    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
