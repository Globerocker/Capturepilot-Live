/**
 * Shared "why this opportunity fits YOUR company" summary generator.
 *
 * Used in two places:
 *   1. Initial Quick Checker pipeline (lib/quick-checker-finish.ts) when
 *      a brand-new analysis lands its first 10 matches.
 *   2. Re-scoring endpoint (api/analyze-company/rescore) so the summary
 *      list stays in sync with the user's "Edit & Re-Match" choices —
 *      previously the summaries from the initial run were never
 *      regenerated, which left SLED matches without any per-row blurb.
 *
 * Falls back to a deterministic one-liner when OPENAI_API_KEY is unset
 * or the model call fails. Thin-description rows (< 50 chars) skip the
 * "Description snippet" block entirely so the model isn't tempted to
 * fabricate justification from a single-word title.
 */

export interface MatchForAi {
    opportunity_id: string;
    title?: string;
    agency?: string;
    naics_code?: string;
    set_aside_code?: string;
    notice_type?: string;
    award_amount?: number;
    description_url?: string;
    response_deadline?: string;
    matched_keywords?: string[];
    score_breakdown?: Record<string, number>;
}

export interface CompanyContextForAi {
    companyName: string;
    description: string;
    services: string[];
    naicsCodes: string[];
    certifications: string[];
    state: string;
    employeeCount: number | null;
    yearsInBusiness: number | null;
    capStatementText: string;
}

export async function generateMatchSummary(
    company: CompanyContextForAi,
    match: MatchForAi,
): Promise<string> {
    const openaiKey = process.env.OPENAI_API_KEY;

    const fallback = (() => {
        const sa = match.set_aside_code ? ` (set-aside: ${match.set_aside_code})` : "";
        const naicsMatch = match.naics_code && company.naicsCodes.includes(match.naics_code)
            ? ` Direct NAICS match (${match.naics_code}).`
            : "";
        return `Match for ${company.companyName} at ${match.agency || "this agency"}${sa}.${naicsMatch}`;
    })();

    if (!openaiKey) return fallback;

    const capStatementHint = company.capStatementText
        ? `\nCAPABILITY STATEMENT EXCERPT (verbatim from user-uploaded doc, first 1500 chars):\n${company.capStatementText.slice(0, 1500)}`
        : "";

    const deadlineHint = (() => {
        if (!match.response_deadline) return "";
        const dt = new Date(match.response_deadline).getTime();
        if (Number.isNaN(dt)) return "";
        const days = Math.round((dt - Date.now()) / (1000 * 60 * 60 * 24));
        if (days < 0 || days > 30) return "";
        return `  Closes in: ${days} day${days === 1 ? "" : "s"}`;
    })();

    const matchedKwHint = (match.matched_keywords && match.matched_keywords.length > 0)
        ? `  MATCHED YOUR KEYWORDS: ${match.matched_keywords.join(", ")}`
        : "";

    const scoreHint = (match.score_breakdown && Object.keys(match.score_breakdown).length > 0)
        ? `  SCORE SIGNALS: NAICS=${Math.round((match.score_breakdown.naics || 0) * 100)}% · keywords=${Math.round((match.score_breakdown.keywords || 0) * 100)}% · geo=${Math.round((match.score_breakdown.geo || 0) * 100)}% · set-aside=${Math.round((match.score_breakdown.set_aside || 0) * 100)}%`
        : "";

    // Some SLED rows store description as a JSON-encoded blob — unwrap so
    // the model doesn't see literal curly braces. Drop the description hint
    // entirely when it's too short to add real signal (< 50 chars) — at that
    // length the body is usually just a title-repeat or "TO ADVERTISE", and
    // the model invents justification when fed nothing to chew on.
    const cleanDesc = (() => {
        let raw = typeof match.description_url === "string" ? match.description_url.trim() : "";
        if (!raw) return "";
        if (raw.startsWith("{") && raw.includes('"description"')) {
            try {
                const parsed = JSON.parse(raw) as { description?: unknown };
                if (parsed && typeof parsed.description === "string") raw = parsed.description.trim();
            } catch {
                const m = raw.match(/"description"\s*:\s*"([^"]+)"/);
                if (m && m[1]) raw = m[1].trim();
            }
        }
        return raw;
    })();
    const descHint = cleanDesc.length >= 50 ? `  Description snippet: ${cleanDesc.slice(0, 600)}` : "";

    const userMsg = [
        `COMPANY: ${company.companyName}`,
        `DESCRIPTION: ${company.description || "(no website description)"}`,
        `SERVICES: ${company.services.slice(0, 8).join(", ") || "(none extracted)"}`,
        `NAICS: ${company.naicsCodes.join(", ") || "(none)"}`,
        `CERTIFICATIONS: ${company.certifications.join(", ") || "(none)"}`,
        `STATE: ${company.state || "(unknown)"}`,
        `SIZE: ${company.employeeCount ? `${company.employeeCount} employees` : "(unknown)"}${company.yearsInBusiness ? ` · ${company.yearsInBusiness} yrs in business` : ""}`,
        capStatementHint,
        ``,
        `OPPORTUNITY:`,
        `  Title: ${match.title || "(no title)"}`,
        `  Agency: ${match.agency || "(unknown)"}`,
        `  Notice type: ${match.notice_type || "(unknown)"}`,
        `  NAICS: ${match.naics_code || "(none)"}`,
        `  Set-aside: ${match.set_aside_code || "(open)"}`,
        match.award_amount ? `  Estimated value: $${match.award_amount.toLocaleString()}` : "",
        deadlineHint,
        matchedKwHint,
        scoreHint,
        descHint,
    ].filter(Boolean).join("\n");

    try {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${openaiKey}` },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [
                    {
                        role: "system",
                        content: [
                            "You write personalized 2-sentence federal-contracting fit summaries for a small-business lead-magnet. Write IN SECOND PERSON (you / your company).",
                            "Be TRUTHFUL about why the opportunity matched. ONLY cite a matched keyword in quotes if it appears in MATCHED YOUR KEYWORDS — do NOT invent keyword hits.",
                            "When MATCHED YOUR KEYWORDS is provided: OPEN by quoting 1–2 of them and connect to a specific company strength.",
                            "When MATCHED YOUR KEYWORDS is empty/absent: explain the match honestly — lead with the strongest signal in SCORE SIGNALS (NAICS / set-aside / geo). Example: 'Strong NAICS match (541511) and your California base lines up with this VA contract.'",
                            "If 'Closes in' is provided AND ≤ 14 days, lead with urgency (e.g. 'Closes in N days — this one is yours to grab.').",
                            "When Description snippet is absent (state/local rows often lack one), DO NOT invent project scope — anchor on agency, NAICS, set-aside, and your company strengths instead.",
                            "Avoid filler. NEVER invent company facts that aren't in the input. NEVER pretend keywords matched when they didn't. Cap output at 320 characters.",
                            "Format: two tight sentences, no bullet points, no headings.",
                        ].join(" "),
                    },
                    { role: "user", content: userMsg },
                ],
                max_tokens: 160,
                temperature: 0.35,
            }),
            signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) return fallback;
        const data = await res.json();
        const text = (data.choices?.[0]?.message?.content || "").trim();
        return text || fallback;
    } catch {
        return fallback;
    }
}
