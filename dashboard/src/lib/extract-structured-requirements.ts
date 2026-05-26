/**
 * AI-driven extraction of structured_requirements from opportunity text.
 *
 * Fills the fields visible on the opportunity detail page's "Structured
 * Requirements" panel that currently render "Not Spec." across the board:
 *
 *   - min_workforce       (e.g. "5 personnel", "team of at least 10")
 *   - years_experience    (e.g. "3+ years in HVAC", "minimum 5 years")
 *   - bonding             (e.g. "performance bond 100% of contract value")
 *   - performance_period  (e.g. "base year + 4 option years")
 *   - security_clearance  (e.g. "Secret", "Top Secret/SCI", "Public Trust")
 *   - insurance           (e.g. "$1M GL", "workers comp required")
 *   - equipment_required  (list of vehicles / tools / certifications)
 *   - scope_of_work       (one-paragraph plain-text summary)
 *   - qualifications      (text[] of required quals)
 *   - deliverables        (text[] of required deliverables)
 *
 * Returns null when:
 *   - description is empty
 *   - OPENAI_API_KEY + GEMINI_API_KEY both unset
 *   - the AI call fails
 * Caller persists into opportunities.structured_requirements JSONB.
 */

export interface StructuredRequirements {
    min_workforce: string | null;
    years_experience: string | null;
    bonding: string | null;
    performance_period: string | null;
    security_clearance: string | null;
    insurance: string | null;
    equipment_required: string[] | null;
    scope_of_work: string | null;
    qualifications: string[] | null;
    deliverables: string[] | null;
}

const SYSTEM_PROMPT = `You extract structured requirements from US federal/state/local procurement opportunity descriptions. Return JSON only. For each field, return the literal value found in the text or null if not specified — DO NOT invent. Be brief: each field value should be one short phrase, NOT a paragraph. equipment_required, qualifications, and deliverables are arrays of short phrases. scope_of_work is one ≤80-word summary of what work is being procured.`;

const FEW_SHOT_USER = `DESCRIPTION:
The General Services Administration requires daily janitorial services for the Hammond Federal Courthouse including restroom sanitation, floor maintenance, and waste removal. Performance period is one base year with four (4) one-year option periods. Contractor shall provide a minimum of 6 cleaning staff and at least 3 years of janitorial experience on federal buildings. Performance bond of 100% of contract value required. Workers compensation insurance and $1M general liability required. Contractor must provide all cleaning equipment and supplies. Public Trust clearance required for all on-site personnel. Contractor shall submit monthly quality reports and a quarterly inspection log.`;

const FEW_SHOT_ASSISTANT = JSON.stringify({
    min_workforce: "6 cleaning staff",
    years_experience: "3+ years federal janitorial",
    bonding: "performance bond 100% of contract value",
    performance_period: "base year + 4 option years",
    security_clearance: "Public Trust",
    insurance: "$1M general liability + workers compensation",
    equipment_required: ["cleaning equipment", "cleaning supplies"],
    scope_of_work: "Daily janitorial services at the Hammond Federal Courthouse including restroom sanitation, floor maintenance, and waste removal.",
    qualifications: ["3+ years federal janitorial experience", "Public Trust clearance for on-site personnel"],
    deliverables: ["monthly quality reports", "quarterly inspection log"],
});

interface ChatMessage { role: "system" | "user" | "assistant"; content: string }

async function callOpenAI(messages: ChatMessage[], timeoutMs = 20000): Promise<string | null> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return null;
    try {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages,
                response_format: { type: "json_object" },
                temperature: 0.2,
                max_tokens: 600,
            }),
            signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) return null;
        const j = await res.json() as { choices?: { message?: { content?: string } }[] };
        return j.choices?.[0]?.message?.content || null;
    } catch {
        return null;
    }
}

function stripHtml(s: string): string {
    return s
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, " ")
        .trim();
}

function arr(v: unknown): string[] | null {
    if (!Array.isArray(v)) return null;
    const a = v.map((x) => String(x).trim()).filter(Boolean).slice(0, 12);
    return a.length > 0 ? a : null;
}

function strOrNull(v: unknown): string | null {
    if (v == null) return null;
    const s = String(v).trim();
    if (!s) return null;
    if (/^(none|not specified|n\/a|null)$/i.test(s)) return null;
    return s.slice(0, 300);
}

export async function extractStructuredRequirements(args: {
    title: string | null | undefined;
    description: string | null | undefined;
}): Promise<StructuredRequirements | null> {
    const title = (args.title || "").trim();
    const description = stripHtml(args.description || "").slice(0, 6000);
    if (!title && !description) return null;

    const userMessage = `DESCRIPTION:\nTITLE: ${title}\n\n${description}`;
    const content = await callOpenAI([
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: FEW_SHOT_USER },
        { role: "assistant", content: FEW_SHOT_ASSISTANT },
        { role: "user", content: userMessage },
    ]);
    if (!content) return null;

    try {
        const parsed = JSON.parse(content) as Record<string, unknown>;
        return {
            min_workforce: strOrNull(parsed.min_workforce),
            years_experience: strOrNull(parsed.years_experience),
            bonding: strOrNull(parsed.bonding),
            performance_period: strOrNull(parsed.performance_period),
            security_clearance: strOrNull(parsed.security_clearance),
            insurance: strOrNull(parsed.insurance),
            equipment_required: arr(parsed.equipment_required),
            scope_of_work: strOrNull(parsed.scope_of_work),
            qualifications: arr(parsed.qualifications),
            deliverables: arr(parsed.deliverables),
        };
    } catch {
        return null;
    }
}
