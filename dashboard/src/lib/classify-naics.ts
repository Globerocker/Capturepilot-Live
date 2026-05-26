/**
 * NAICS classification via gpt-4o-mini.
 *
 * For rows where the source feed doesn't publish a NAICS code (Bonfire,
 * Socrata, TX ESBD with NIGP only — i.e. most SLED rows), pick the
 * best-fit 6-digit NAICS based on title + description + extracted
 * keywords.
 *
 * The model returns the code + a 0-1 confidence. We only persist when
 * confidence ≥ 0.6 so the scoring algorithm doesn't get poisoned by
 * weak matches.
 */

const POPULAR_NAICS_HINTS = [
    "541330 Engineering Services",
    "541512 Computer Systems Design Services",
    "541611 Administrative Management Consulting",
    "541620 Environmental Consulting",
    "541715 R&D",
    "236220 Commercial Building Construction",
    "237310 Highway/Street/Bridge Construction",
    "238210 Electrical Contractors",
    "238220 HVAC + Plumbing",
    "238910 Site Preparation Contractors",
    "561210 Facilities Support Services",
    "561720 Janitorial Services",
    "561730 Landscaping Services",
    "561621 Security Systems Services",
    "562112 Hazardous Waste Collection",
    "562910 Remediation Services",
    "611310 Colleges/Universities",
    "611430 Professional/Management Development Training",
    "541310 Architectural Services",
    "541380 Testing Laboratories",
    "541214 Payroll Services",
    "541219 Other Accounting Services",
    "541410 Interior Design Services",
    "541870 Marketing Consulting",
    "517311 Wired Telecommunications",
    "541512 IT Consulting",
    "541618 Other Management Consulting",
    "541990 All Other Professional/Scientific Services",
    "336411 Aircraft Manufacturing",
    "336992 Military Armored Vehicles",
    "423450 Medical Equipment Wholesale",
    "541612 HR Consulting",
    "722320 Caterers",
    "453210 Office Supplies + Stationery Stores",
    "561110 Office Administrative Services",
    "624110 Child/Youth Services",
];

const SYSTEM_PROMPT = `You classify US federal/state/local procurement opportunities into the best-fit 6-digit NAICS code. Return JSON with two keys: "naics_code" (string, 6 digits) and "confidence" (number 0-1). If no NAICS fits with confidence above 0.5, return naics_code: null. Common federal-spend NAICS are listed for reference; you may pick any valid 6-digit NAICS, not just from the list.`;

const FEW_SHOT = [
    {
        role: "user" as const,
        content: "TITLE: Janitorial Services — Federal Courthouse\nDESCRIPTION: Daily cleaning, restroom sanitation, floor maintenance.\nKEYWORDS: janitorial services, custodial, cleaning",
    },
    {
        role: "assistant" as const,
        content: JSON.stringify({ naics_code: "561720", confidence: 0.95 }),
    },
    {
        role: "user" as const,
        content: "TITLE: Cybersecurity Penetration Testing\nDESCRIPTION: VA seeks SDVOSB to perform network pen test + NIST 800-53 audit.\nKEYWORDS: cybersecurity, penetration testing, NIST 800-53",
    },
    {
        role: "assistant" as const,
        content: JSON.stringify({ naics_code: "541512", confidence: 0.9 }),
    },
    {
        role: "user" as const,
        content: "TITLE: Lawn Mowing at Veterans Cemetery\nDESCRIPTION: Mow grass and edge sidewalks monthly.\nKEYWORDS: lawn care, mowing",
    },
    {
        role: "assistant" as const,
        content: JSON.stringify({ naics_code: "561730", confidence: 0.95 }),
    },
];

interface ChatMessage { role: "system" | "user" | "assistant"; content: string }

async function callOpenAI(messages: ChatMessage[]): Promise<string | null> {
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
                temperature: 0.1,
                max_tokens: 80,
            }),
            signal: AbortSignal.timeout(12000),
        });
        if (!res.ok) return null;
        const j = await res.json() as { choices?: { message?: { content?: string } }[] };
        return j.choices?.[0]?.message?.content || null;
    } catch {
        return null;
    }
}

function stripHtml(s: string): string {
    return s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim();
}

export interface NaicsClassification {
    naics_code: string;
    confidence: number;
}

export async function classifyNaics(args: {
    title: string | null | undefined;
    description: string | null | undefined;
    extracted_keywords?: string[] | null;
    /** Minimum confidence to return a result; default 0.6 (callers can lower). */
    threshold?: number;
}): Promise<NaicsClassification | null> {
    const threshold = args.threshold ?? 0.6;
    const title = (args.title || "").slice(0, 300).trim();
    const description = stripHtml(args.description || "").slice(0, 1500);
    const keywords = (args.extracted_keywords || []).slice(0, 8).join(", ");
    if (!title && !description) return null;

    const payload =
        `TITLE: ${title}\n` +
        `DESCRIPTION: ${description}\n` +
        `KEYWORDS: ${keywords || "(none)"}\n` +
        `Reference popular NAICS (any valid 6-digit code is allowed):\n${POPULAR_NAICS_HINTS.slice(0, 25).join("; ")}.`;

    const messages: ChatMessage[] = [
        { role: "system", content: SYSTEM_PROMPT },
        ...FEW_SHOT,
        { role: "user", content: payload },
    ];
    const raw = await callOpenAI(messages);
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw) as { naics_code?: string | null; confidence?: number };
        if (!parsed.naics_code || typeof parsed.naics_code !== "string") return null;
        if (!/^\d{6}$/.test(parsed.naics_code)) return null;
        const conf = typeof parsed.confidence === "number" ? parsed.confidence : 0;
        if (conf < threshold) return null;
        return { naics_code: parsed.naics_code, confidence: conf };
    } catch {
        return null;
    }
}
