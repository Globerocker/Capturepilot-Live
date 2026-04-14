import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { NAICS_CODES } from "@/lib/naics-codes";

export const maxDuration = 30;

const NOTICE_TYPES = ["Sources Sought", "Presolicitation", "Solicitation", "Combined Synopsis/Solicitation", "Special Notice", "Award Notice"];
const SET_ASIDES = ["SBA", "8A", "SDVOSB", "WOSB", "HUBZone", "VSA"];
const US_STATES = ["AL","AK","AZ","AR","CA","CO","CT","DC","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];

/**
 * POST /api/matches/ai-filter
 * Body: { prompt: string }
 * Uses OpenAI to parse natural language into structured filter values.
 * Returns: { filters: { naics_code?, set_aside?, state?, notice_type?, min_score?, max_deadline_days?, keyword? } }
 */
export async function POST(req: NextRequest) {
    try {
        const OPENAI_KEY = process.env.OPENAI_API_KEY;
        if (!OPENAI_KEY) return NextResponse.json({ error: "OpenAI not configured" }, { status: 500 });

        const { prompt } = await req.json();
        if (!prompt || typeof prompt !== "string" || prompt.length > 500) {
            return NextResponse.json({ error: "Valid prompt required (max 500 chars)" }, { status: 400 });
        }

        // Auth (soft — we just want to ensure this is not abusable)
        const cookieStore = await cookies();
        const authSupabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            { cookies: { getAll: () => cookieStore.getAll() } }
        );
        const { data: { user } } = await authSupabase.auth.getUser();
        if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        // Pull profile context (user's NAICS) to bias the LLM where useful
        let profileContext = "";
        try {
            const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
            const { data: profile } = await sb
                .from("user_profiles")
                .select("naics_codes, sba_certifications, state, target_states")
                .eq("auth_user_id", user.id)
                .single();
            if (profile) {
                const p = profile as Record<string, unknown>;
                profileContext = `User profile hints:
- NAICS: ${(p.naics_codes as string[] || []).join(", ") || "none"}
- Certifications: ${(p.sba_certifications as string[] || []).join(", ") || "none"}
- State: ${p.state || "n/a"}
- Target states: ${(p.target_states as string[] || []).join(", ") || "none"}`;
            }
        } catch { /* non-fatal */ }

        // Compact NAICS hint list — keep short
        const naicsHint = NAICS_CODES.slice(0, 60).map(n => `${n.code}=${n.label}`).join(", ");

        const system = `You translate natural-language descriptions of federal contracting opportunities into a JSON filter object.
Return ONLY a JSON object with these optional keys (omit any that don't apply):
- naics_code: string (6-digit NAICS code)
- set_aside: one of ${SET_ASIDES.join(", ")}
- state: 2-letter US state code, one of ${US_STATES.slice(0, 10).join(",")}... etc.
- notice_type: one of ${NOTICE_TYPES.join(", ")}
- min_score: number 0.0-1.0 (e.g. 0.7 for "strong match only")
- max_deadline_days: integer (e.g. 30 for "closing in 30 days")
- keyword: short free-text fallback term for title/agency search

Known NAICS (code=label): ${naicsHint}

Rules:
- Prefer exact matches from the allowed value lists. If unsure, OMIT the field.
- "small business" -> set_aside=SBA. "veteran" -> SDVOSB. "8(a)" -> 8A. "women" -> WOSB.
- "janitorial" -> naics_code=561720. "IT" -> 541512. "construction" -> 236220. "landscaping" -> 561730.
- "sources sought" / "RFI" -> notice_type="Sources Sought".
- "hot" / "strong match" -> min_score=0.70. "warm" / "good" -> min_score=0.50.
- "closing soon" -> max_deadline_days=14. "this month" -> 30. "next 60 days" -> 60.
- If the prompt doesn't clearly specify, DON'T invent a value.`;

        const userMsg = `${profileContext}

User description: "${prompt}"

Return the JSON filter object.`;

        const res = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_KEY}` },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [
                    { role: "system", content: system },
                    { role: "user", content: userMsg },
                ],
                response_format: { type: "json_object" },
                max_tokens: 300,
                temperature: 0.1,
            }),
            signal: AbortSignal.timeout(20000),
        });

        if (!res.ok) {
            const txt = await res.text();
            return NextResponse.json({ error: `OpenAI error: ${txt.substring(0, 200)}` }, { status: 502 });
        }

        const data = await res.json();
        const raw = data.choices?.[0]?.message?.content || "{}";
        let parsed: Record<string, unknown> = {};
        try {
            parsed = JSON.parse(raw);
        } catch {
            return NextResponse.json({ error: "Could not parse AI response" }, { status: 502 });
        }

        // Sanitize — only keep known keys, and validate
        const filters: Record<string, string | number> = {};

        if (typeof parsed.naics_code === "string" && /^\d{4,6}$/.test(parsed.naics_code)) {
            filters.naics_code = parsed.naics_code;
        }
        if (typeof parsed.set_aside === "string" && SET_ASIDES.includes(parsed.set_aside)) {
            filters.set_aside = parsed.set_aside;
        }
        if (typeof parsed.state === "string" && US_STATES.includes(parsed.state.toUpperCase())) {
            filters.state = parsed.state.toUpperCase();
        }
        if (typeof parsed.notice_type === "string" && NOTICE_TYPES.includes(parsed.notice_type)) {
            filters.notice_type = parsed.notice_type;
        }
        if (typeof parsed.min_score === "number" && parsed.min_score >= 0 && parsed.min_score <= 1) {
            filters.min_score = parsed.min_score;
        }
        if (typeof parsed.max_deadline_days === "number" && parsed.max_deadline_days > 0 && parsed.max_deadline_days <= 365) {
            filters.max_deadline_days = Math.round(parsed.max_deadline_days);
        }
        if (typeof parsed.keyword === "string" && parsed.keyword.length > 0 && parsed.keyword.length < 100) {
            filters.keyword = parsed.keyword;
        }

        return NextResponse.json({ filters });
    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
