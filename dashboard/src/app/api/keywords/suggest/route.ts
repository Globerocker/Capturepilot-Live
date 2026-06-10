import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Edge runtime — Supabase read + OpenAI fetch; both work over standard fetch.
export const runtime = "edge";
export const maxDuration = 30;

/**
 * POST /api/keywords/suggest
 *
 * Picks up to 3 primary + 5 secondary keywords from the gov_keywords library
 * based on a company's description + services + differentiators. The library
 * is sent as a candidate pool so the LLM can only return canonical values
 * (no typos, no drift).
 *
 * Body: {
 *   company_description?: string;
 *   services?: string[];
 *   differentiators?: string[];
 *   company_name?: string;
 * }
 *
 * Returns: { primary: string[]; secondary: string[] }  // canonical gov_keywords.keyword values
 */

interface SuggestBody {
    company_description?: string;
    services?: string[];
    differentiators?: string[];
    company_name?: string;
}

interface CandidateKeyword {
    keyword: string;
    display_label: string;
    category: string | null;
}

export async function POST(req: NextRequest) {
    const body = (await req.json()) as SuggestBody;
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
        return NextResponse.json({ primary: [], secondary: [], error: "OPENAI_API_KEY missing" }, { status: 503 });
    }

    const companyContext = [
        body.company_name ? `Company: ${body.company_name}` : "",
        body.company_description ? `Description: ${body.company_description.slice(0, 2000)}` : "",
        body.services?.length ? `Services: ${body.services.slice(0, 15).join(", ")}` : "",
        body.differentiators?.length ? `Differentiators: ${body.differentiators.slice(0, 10).join(", ")}` : "",
    ].filter(Boolean).join("\n");

    if (!companyContext) {
        return NextResponse.json({ primary: [], secondary: [], note: "no company context provided" });
    }

    // Pull the top library candidates. We bias toward high title_frequency —
    // those keywords have the strongest signal in real opp titles — while
    // keeping broad category coverage so niche matches are still reachable.
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
    const { data: candidates, error } = await db
        .from("gov_keywords")
        .select("keyword, display_label, category")
        .order("title_frequency", { ascending: false })
        .order("frequency", { ascending: false })
        .limit(600);

    if (error || !candidates || candidates.length === 0) {
        return NextResponse.json({ primary: [], secondary: [], error: "library empty or unreachable" }, { status: 500 });
    }

    // Group by category for a compact prompt (LLM handles long flat lists poorly).
    const byCat = new Map<string, CandidateKeyword[]>();
    for (const row of candidates as CandidateKeyword[]) {
        const cat = row.category || "other";
        if (!byCat.has(cat)) byCat.set(cat, []);
        byCat.get(cat)!.push(row);
    }
    const poolText = [...byCat.entries()]
        .map(([cat, rows]) => `[${cat}] ${rows.slice(0, 60).map(r => r.keyword).join(", ")}`)
        .join("\n");

    const canonicalSet = new Set(candidates.map(c => c.keyword));

    const prompt = `You are picking federal-contracting keywords for a company so their opportunity matches can find niche capabilities that NAICS codes miss.

Company context:
${companyContext}

Candidate keyword library (grouped by category — you MUST pick only from these exact canonical strings, no variants):
${poolText}

Rules:
1. Pick up to 3 PRIMARY keywords — the company's clearest, most differentiating capabilities. These should return STRONG positive match signals.
2. Pick up to 5 SECONDARY keywords — adjacent capabilities, technologies, or domains. Refinement signals.
3. Do NOT invent keywords. Every returned string must exist verbatim in the library above.
4. Do not repeat between primary and secondary.
5. If the company has a very niche specialty not covered by NAICS (e.g. "body armor", "uav", "cybersecurity for critical infrastructure"), prefer that in primary.
6. Skip generic or overly broad terms unless they clearly match the company.

Return ONLY valid JSON:
{"primary": ["kw1", "kw2"], "secondary": ["kw3", "kw4", "kw5"]}`;

    try {
        const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${openaiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [{ role: "user", content: prompt }],
                response_format: { type: "json_object" },
                temperature: 0.2,
            }),
        });

        if (!aiRes.ok) {
            const errText = await aiRes.text();
            return NextResponse.json({ primary: [], secondary: [], error: `openai ${aiRes.status}: ${errText.slice(0, 200)}` }, { status: 502 });
        }

        const aiJson = await aiRes.json();
        const content = aiJson.choices?.[0]?.message?.content;
        if (!content) return NextResponse.json({ primary: [], secondary: [] });

        let parsed: { primary?: string[]; secondary?: string[] };
        try {
            parsed = JSON.parse(content);
        } catch {
            return NextResponse.json({ primary: [], secondary: [], error: "LLM returned non-JSON" }, { status: 502 });
        }

        // Defense-in-depth: filter out anything not in the canonical set (LLM drift).
        const primary = (parsed.primary || [])
            .filter(k => typeof k === "string")
            .map(k => k.toLowerCase().trim())
            .filter(k => canonicalSet.has(k))
            .slice(0, 3);

        const secondary = (parsed.secondary || [])
            .filter(k => typeof k === "string")
            .map(k => k.toLowerCase().trim())
            .filter(k => canonicalSet.has(k) && !primary.includes(k))
            .slice(0, 5);

        return NextResponse.json({ primary, secondary });
    } catch (e) {
        return NextResponse.json({ primary: [], secondary: [], error: (e as Error).message }, { status: 500 });
    }
}
