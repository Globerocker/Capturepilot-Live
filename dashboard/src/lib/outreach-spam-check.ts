/**
 * Deterministic spam-score heuristic for cold-outreach subjects + bodies.
 * Score is 0-100, higher = riskier. The UI surfaces a badge + the reasons
 * so the operator can see exactly which trigger fired.
 */

export interface SpamCheckResult {
    score: number;
    severity: "good" | "warn" | "bad";
    reasons: string[];
}

const SPAM_WORDS = [
    // Money + urgency triggers — the SpamAssassin canon
    "free", "act now", "limited time", "urgent", "winner", "cash", "guaranteed",
    "no obligation", "risk-free", "amazing", "incredible deal", "click here",
    "buy now", "save big", "100% free", "earn $", "make money", "exclusive deal",
    "best price", "lowest price", "lifetime", "while supplies last",
    "double your income", "viagra", "weight loss", "miracle", "as seen on tv",
    "credit card", "no credit check", "pre-approved", "lottery", "winner",
];

const SCAMMY_PUNCT_RE = /[!?]{2,}/g;
const ALL_CAPS_WORD_RE = /\b[A-Z]{4,}\b/g;
const SHOUTING_RE = /[A-Z\s!?.]{20,}/g;

export function spamCheck(subject: string, body: string): SpamCheckResult {
    const reasons: string[] = [];
    let score = 0;

    const subj = (subject || "").trim();
    const text = (body || "").trim();

    if (!subj && text) {
        score += 25;
        reasons.push("No subject line.");
    }
    if (subj.length > 78) {
        score += 8;
        reasons.push(`Subject is ${subj.length} chars (over 78 truncates in inbox).`);
    }
    if (subj.length < 4 && subj.length > 0) {
        score += 10;
        reasons.push("Subject is very short — looks low-effort.");
    }

    // Spammy words
    const haystack = `${subj} ${text}`.toLowerCase();
    const hits = SPAM_WORDS.filter(w => haystack.includes(w));
    if (hits.length > 0) {
        score += Math.min(40, hits.length * 8);
        reasons.push(`Contains spam-trigger phrases: ${hits.slice(0, 4).map(s => `"${s}"`).join(", ")}.`);
    }

    // ALL-CAPS words
    const capsHits = (subj + " " + text).match(ALL_CAPS_WORD_RE);
    if (capsHits && capsHits.length >= 2) {
        score += 10;
        reasons.push(`${capsHits.length} ALL-CAPS words — looks like shouting.`);
    }

    // Punctuation spam
    if (SCAMMY_PUNCT_RE.test(`${subj} ${text}`)) {
        score += 12;
        reasons.push("Multiple !! or ?? in a row.");
    }

    // Money symbols
    const dollarCount = (haystack.match(/\$\d/g) || []).length;
    if (dollarCount >= 3) {
        score += 10;
        reasons.push(`${dollarCount} dollar amounts in copy.`);
    }

    // Link-heavy
    const linkCount = (text.match(/https?:\/\/\S+/gi) || []).length;
    if (linkCount > 4) {
        score += 8;
        reasons.push(`${linkCount} links — keep it under 4 for cold email.`);
    }

    // Body length sanity
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    if (wordCount > 0 && wordCount < 25) {
        score += 6;
        reasons.push(`Body is ${wordCount} words — feels rushed for cold outreach.`);
    }
    if (wordCount > 300) {
        score += 8;
        reasons.push(`Body is ${wordCount} words — over 300 hurts reply rate.`);
    }

    // Image-only body (no plain text)
    if (text.length > 0 && !/[a-z]{4,}/i.test(text)) {
        score += 15;
        reasons.push("No real prose — looks image-only.");
    }

    // Subject-line all caps
    if (subj.length > 8 && subj === subj.toUpperCase()) {
        score += 15;
        reasons.push("Subject is ALL CAPS.");
    }

    // Shouty lines
    const shoutMatches = SHOUTING_RE.exec(text);
    if (shoutMatches) {
        score += 6;
        reasons.push("Long stretch of caps / punctuation in body.");
    }

    score = Math.min(100, Math.max(0, score));

    let severity: SpamCheckResult["severity"] = "good";
    if (score >= 50) severity = "bad";
    else if (score >= 20) severity = "warn";

    if (reasons.length === 0) reasons.push("Reads clean — should land in the inbox.");

    return { score, severity, reasons };
}
