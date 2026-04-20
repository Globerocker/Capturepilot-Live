/**
 * NAICS inference against a whitelist (either the DB naics_codes table or
 * the static NAICS_CODES module). The model is constrained to pick from
 * the provided candidates only — it cannot hallucinate codes.
 */

import OpenAI from "openai";
import { NAICS_CODES, type NaicsCode } from "@/lib/naics-codes";
import { classifyNaics } from "@/lib/naics-classifier";
import type { QuickCheckerExtraction, NaicsGuess } from "./schema";

const MODEL = process.env.QUICK_CHECKER_MODEL || "gpt-4o-mini";

interface InferInput {
    companyName: string;
    extraction: QuickCheckerExtraction;
    pageContent: string;
    samNaics?: string[];
    usaSpendingNaics?: string[];
    allowlist?: NaicsCode[];
}

export interface InferredNaics {
    code: string;
    label: string;
    confidence: number;
    matched_keywords: string[];
    source: "sam" | "usaspending" | "ai" | "keyword_fallback";
}

const SYSTEM_PROMPT = `You are a NAICS classification expert for U.S. federal contracting.
Given a company's website content and a WHITELIST of candidate codes, pick the best 1–3 codes
that describe what the company actually does. You MUST only return codes that appear in the
whitelist — never invent a code.

Rules:
- Returning 1 highly accurate code is better than 3 mediocre ones.
- Confidence 0.9+ means the website explicitly describes this work multiple times.
- Confidence 0.6–0.8 means this is implied but not explicit.
- Below 0.5 = don't include it.
- The 'reason' must quote specific text from the page.

Return STRICT JSON only:
{"codes":[{"code":"541511","confidence":0.95,"reason":"'custom software development for industrial clients'"}]}`;

export async function inferNaics(input: InferInput): Promise<InferredNaics[]> {
    const allow = input.allowlist && input.allowlist.length > 0 ? input.allowlist : NAICS_CODES;
    const allowSet = new Set(allow.map(c => c.code));
    const labelFor = (code: string) => allow.find(c => c.code === code)?.label || code;

    const out: InferredNaics[] = [];

    // 1) SAM-registered NAICS — authoritative, confidence 1.0
    for (const code of input.samNaics || []) {
        if (!allowSet.has(code)) continue;
        if (out.some(o => o.code === code)) continue;
        out.push({
            code,
            label: labelFor(code),
            confidence: 1.0,
            matched_keywords: ["SAM.gov registration"],
            source: "sam",
        });
    }

    // 2) Past federal awards (USASpending) — high confidence
    for (const code of input.usaSpendingNaics || []) {
        if (!allowSet.has(code)) continue;
        if (out.some(o => o.code === code)) continue;
        out.push({
            code,
            label: labelFor(code),
            confidence: 0.95,
            matched_keywords: ["Past federal award history"],
            source: "usaspending",
        });
    }

    // 3) Primary: OpenAI against a whitelist constructed from the company's capability keywords.
    //    We send the most plausible ~80 candidates to keep the prompt tight.
    const key = process.env.OPENAI_API_KEY;
    if (key) {
        const shortlist = shortlistCandidates(input.extraction, allow).slice(0, 80);
        if (shortlist.length > 0) {
            try {
                const client = new OpenAI({ apiKey: key });
                const userContent = buildUserPrompt(input, shortlist);
                const resp = await client.chat.completions.create({
                    model: MODEL,
                    temperature: 0,
                    response_format: { type: "json_object" },
                    messages: [
                        { role: "system", content: SYSTEM_PROMPT },
                        { role: "user", content: userContent },
                    ],
                }, { timeout: 30_000 });
                const raw = resp.choices?.[0]?.message?.content || "{}";
                const parsed = JSON.parse(raw.replace(/^```json\s*/i, "").replace(/```$/i, "").trim());
                const codes = Array.isArray(parsed.codes) ? parsed.codes : [];
                for (const c of codes) {
                    const code = String(c?.code || "");
                    if (!/^\d{6}$/.test(code)) continue;
                    if (!allowSet.has(code)) continue;
                    if (out.some(o => o.code === code)) continue;
                    out.push({
                        code,
                        label: labelFor(code),
                        confidence: Math.min(0.95, Math.max(0, Number(c?.confidence) || 0.7)),
                        matched_keywords: [String(c?.reason || "AI classification")],
                        source: "ai",
                    });
                    if (out.length >= 5) break;
                }
            } catch (err) {
                console.warn("[quick-checker/naics] OpenAI inference failed:", err instanceof Error ? err.message : err);
            }
        }
    }

    // 4) Fallback: keyword classifier if we still have nothing
    if (out.length === 0) {
        const desc = input.extraction.short_description || input.extraction.long_description;
        const services = input.extraction.services.map(s => s.name);
        const keywordResults = classifyNaics(desc, services, input.pageContent);
        for (const k of keywordResults) {
            if (!allowSet.has(k.code)) continue;
            out.push({
                code: k.code,
                label: k.label,
                confidence: k.confidence,
                matched_keywords: k.matched_keywords || [],
                source: "keyword_fallback",
            });
        }
    }

    out.sort((a, b) => b.confidence - a.confidence);
    return out.slice(0, 5);
}

function shortlistCandidates(ex: QuickCheckerExtraction, all: NaicsCode[]): NaicsCode[] {
    const keywords = [
        ...ex.capability_keywords.map(k => k.keyword.toLowerCase()),
        ...ex.industries_served.map(s => s.toLowerCase()),
        ...ex.services.map(s => s.name.toLowerCase()),
    ];
    const popular = all.filter(c => c.popular);
    const scored: Array<{ c: NaicsCode; score: number }> = [];
    for (const c of all) {
        const label = c.label.toLowerCase();
        let s = 0;
        for (const k of keywords) {
            if (!k) continue;
            if (label.includes(k)) s += 3;
            else {
                for (const tok of k.split(/\s+/)) {
                    if (tok.length > 3 && label.includes(tok)) s += 1;
                }
            }
        }
        if (s > 0) scored.push({ c, score: s });
    }
    scored.sort((a, b) => b.score - a.score);
    const picked = scored.slice(0, 60).map(s => s.c);
    // Always include the popular ones so the model always has a sane default set
    const seen = new Set(picked.map(p => p.code));
    for (const p of popular) {
        if (!seen.has(p.code)) {
            picked.push(p);
            seen.add(p.code);
        }
        if (picked.length >= 100) break;
    }
    return picked;
}

function buildUserPrompt(input: InferInput, shortlist: NaicsCode[]): string {
    return [
        `COMPANY: ${input.companyName}`,
        `DESCRIPTION: ${input.extraction.short_description || input.extraction.long_description.slice(0, 500)}`,
        `INDUSTRIES SERVED: ${input.extraction.industries_served.join(", ") || "(unclear)"}`,
        `SERVICES: ${input.extraction.services.map(s => `${s.name}: ${s.description}`).slice(0, 12).join(" | ")}`,
        `CAPABILITY KEYWORDS: ${input.extraction.capability_keywords.map(k => k.keyword).join(", ")}`,
        ``,
        `WHITELIST (code → label) — you MUST pick from this list:`,
        shortlist.map(c => `${c.code} → ${c.label}`).join("\n"),
        ``,
        `PAGE CONTENT (first 4000 chars):`,
        input.pageContent.slice(0, 4000),
    ].join("\n");
}
