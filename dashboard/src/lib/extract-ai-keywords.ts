/**
 * AI-driven keyword extraction.
 *
 * Pulls 5-12 short noun-phrase keywords from an opportunity title + description.
 * These get written to `opportunities.extracted_keywords text[]` (migration 080)
 * so the matches page can render a fast keyword filter UX and the matching
 * scorer can use them as supplemental signal alongside the user's profile
 * keywords.
 *
 * Why AI instead of regex: state/local RFPs are written in wildly different
 * styles (one is a 200-word HTML soup, another is a 3-page legal brief). A
 * heuristic tokenizer would either miss the meaningful phrases or surface
 * stopwords. gpt-4o-mini at $0.15/M input + $0.60/M output is ~$0.0002 per
 * opportunity — full corpus backfill (30k active rows) ≈ $6. Cheap.
 *
 * Model fallback: if OPENAI_API_KEY is set we use gpt-4o-mini. If only
 * DEEPSEEK_API_KEY is set (also $0.14/M roughly) we route there. If neither
 * is set the function returns null and the caller skips the row.
 */

const PROMPT_SYSTEM =
    "You extract short, concrete keywords from US federal/state/local procurement opportunities. " +
    "Return JSON with a single key `keywords` whose value is an array of 5-12 short noun phrases " +
    "(1-4 words each) that describe what the contract is for. Focus on the WORK / GOODS / SERVICES " +
    "being procured. Skip generic stopwords (the, and, services), agency names, dates, and money. " +
    "Lowercase except for proper nouns. No punctuation in phrases. Strict JSON only.";

const FEW_SHOT = [
    {
        role: "user" as const,
        content:
            "TITLE: Janitorial Services for Federal Courthouse\n" +
            "DESCRIPTION: The General Services Administration requires custodial / janitorial services " +
            "including daily cleaning, floor maintenance, restroom sanitation, and waste removal for " +
            "the Hammond Federal Courthouse facility.",
    },
    {
        role: "assistant" as const,
        content: JSON.stringify({
            keywords: [
                "janitorial services",
                "custodial services",
                "floor maintenance",
                "restroom sanitation",
                "waste removal",
                "courthouse cleaning",
                "facility cleaning",
            ],
        }),
    },
    {
        role: "user" as const,
        content:
            "TITLE: Cybersecurity Vulnerability Assessment\n" +
            "DESCRIPTION: Department of Veterans Affairs seeking SDVOSB contractor to perform " +
            "network penetration testing, application security review, and NIST 800-53 compliance " +
            "audit on legacy VistA systems.",
    },
    {
        role: "assistant" as const,
        content: JSON.stringify({
            keywords: [
                "cybersecurity assessment",
                "penetration testing",
                "vulnerability assessment",
                "network security",
                "application security",
                "NIST 800-53",
                "compliance audit",
                "VistA",
            ],
        }),
    },
];

interface ChatMessage {
    role: "system" | "user" | "assistant";
    content: string;
}

interface CompletionResult {
    keywords: string[];
    model: string;
}

async function callOpenAI(messages: ChatMessage[], timeoutMs = 15000): Promise<{ content: string } | null> {
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
                max_tokens: 300,
            }),
            signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) return null;
        const json = await res.json() as { choices?: { message?: { content?: string } }[] };
        const content = json.choices?.[0]?.message?.content;
        if (!content) return null;
        return { content };
    } catch {
        return null;
    }
}

async function callGemini(messages: ChatMessage[], timeoutMs = 15000): Promise<{ content: string } | null> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return null;
    try {
        // Convert OpenAI-shaped messages to Gemini's contents-array shape.
        // System messages go in systemInstruction; user/assistant alternate
        // in contents[]. Gemini's "model" role is the equivalent of "assistant".
        const systemParts = messages.filter((m) => m.role === "system").map((m) => ({ text: m.content }));
        const contents = messages
            .filter((m) => m.role !== "system")
            .map((m) => ({
                role: m.role === "assistant" ? "model" : "user",
                parts: [{ text: m.content }],
            }));
        const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    systemInstruction: systemParts.length > 0 ? { parts: systemParts } : undefined,
                    contents,
                    generationConfig: {
                        temperature: 0.2,
                        maxOutputTokens: 300,
                        responseMimeType: "application/json",
                    },
                }),
                signal: AbortSignal.timeout(timeoutMs),
            },
        );
        if (!res.ok) return null;
        const json = await res.json() as {
            candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        const content = json.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("");
        if (!content) return null;
        return { content };
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

function cleanKeyword(kw: string): string | null {
    let s = String(kw).trim().toLowerCase();
    s = s.replace(/^[\W_]+|[\W_]+$/g, ""); // strip punctuation at edges
    if (!s) return null;
    // Drop ones that are too long or too short.
    if (s.length < 3 || s.length > 60) return null;
    // Drop pure number tokens.
    if (/^\d+$/.test(s)) return null;
    return s;
}

/**
 * Extract 5-12 keywords from an opportunity's title + description.
 *
 * Returns null when:
 *   - No AI provider env is configured.
 *   - The API call failed (caller can retry later).
 *   - The response wasn't parseable JSON.
 *
 * The caller decides whether to retry / skip / write empty array.
 */
export async function extractAiKeywords(args: {
    title: string | null | undefined;
    description: string | null | undefined;
    /** Optional preferred provider. Default: Gemini Flash, OpenAI gpt-4o-mini fallback. */
    prefer?: "gemini" | "openai";
}): Promise<CompletionResult | null> {
    const title = (args.title || "").trim();
    const desc = stripHtml(args.description || "").slice(0, 4000); // cap input to ~1000 tokens
    if (!title && !desc) return null;

    const payload =
        `TITLE: ${title.slice(0, 300) || "(none)"}\n` +
        `DESCRIPTION: ${desc || "(empty)"}`;

    const messages: ChatMessage[] = [
        { role: "system", content: PROMPT_SYSTEM },
        ...FEW_SHOT,
        { role: "user", content: payload },
    ];

    // Provider order: Gemini Flash (cheapest + per user preference) → OpenAI
    // gpt-4o-mini (fallback). DeepSeek/Mistral removed since their keys are
    // empty in this environment.
    const order: Array<"gemini" | "openai"> = args.prefer === "openai"
        ? ["openai", "gemini"]
        : ["gemini", "openai"];

    for (const provider of order) {
        const result = provider === "gemini" ? await callGemini(messages) : await callOpenAI(messages);
        if (!result) continue;
        try {
            const parsed = JSON.parse(result.content) as { keywords?: unknown[] };
            const kws = Array.isArray(parsed.keywords) ? parsed.keywords : [];
            const cleaned = kws
                .map((k) => cleanKeyword(String(k)))
                .filter((k): k is string => k !== null)
                .slice(0, 12);
            // Dedupe.
            const unique = Array.from(new Set(cleaned));
            if (unique.length === 0) continue;
            return { keywords: unique, model: provider };
        } catch {
            // Bad JSON, try the next provider.
            continue;
        }
    }
    return null;
}
