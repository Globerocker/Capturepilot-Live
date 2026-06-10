/**
 * POST /api/admin/outreach/templates/spam-check
 * Body: { subject?: string, body: string, channel: "email" | "sms" }
 *
 * Lightweight, heuristic spam scoring. No external API calls — runs entirely
 * server-side using a curated trigger-word list and structural rules
 * (ALL CAPS ratio, exclamation density, link count, missing unsubscribe).
 *
 * Returns:
 *   { score: 0-100, severity: "ok"|"warn"|"bad", findings: [{ rule, snippet?, weight }] }
 *
 * Higher score = more spammy. severity thresholds:
 *   0-29  ok
 *   30-59 warn
 *   60+   bad
 */

import { NextRequest, NextResponse } from "next/server";
import { assertAdmin } from "@/lib/auth-admin";

export const runtime = "edge";

const TRIGGER_WORDS = [
    "free", "act now", "limited time", "buy now", "click here", "guarantee",
    "risk-free", "no obligation", "winner", "congratulations", "urgent",
    "make money", "earn $", "$$$", "100% free", "cash bonus", "miracle",
    "lose weight", "viagra", "casino", "credit card", "no credit check",
];

interface Finding {
    rule: string;
    snippet?: string;
    weight: number;
}

interface CheckBody {
    subject?: string;
    body?: string;
    channel?: "email" | "sms";
}

export async function POST(req: NextRequest) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;

    const input = (await req.json().catch(() => null)) as CheckBody | null;
    if (!input?.body) {
        return NextResponse.json({ error: "body required" }, { status: 400 });
    }
    const text = `${input.subject || ""}\n${input.body}`.toLowerCase();
    const findings: Finding[] = [];

    // Trigger words
    for (const word of TRIGGER_WORDS) {
        if (text.includes(word)) {
            findings.push({ rule: "trigger_word", snippet: word, weight: 6 });
        }
    }

    // ALL CAPS WORDS (3+ caps)
    const capsMatches = (input.body.match(/\b[A-Z]{4,}\b/g) || []).length;
    if (capsMatches >= 3) {
        findings.push({ rule: "all_caps_run", weight: 10, snippet: `${capsMatches} all-caps words` });
    } else if (capsMatches >= 1) {
        findings.push({ rule: "all_caps_word", weight: 3, snippet: `${capsMatches} all-caps word(s)` });
    }

    // Exclamation density
    const exclamCount = (input.body.match(/!/g) || []).length;
    if (exclamCount >= 4) findings.push({ rule: "many_exclamations", weight: 8, snippet: `${exclamCount}!` });
    else if (exclamCount >= 2) findings.push({ rule: "some_exclamations", weight: 3, snippet: `${exclamCount}!` });

    // Multiple $$$
    if (/\$\$+/.test(input.body) || /\$\d{3,}/.test(input.body)) {
        findings.push({ rule: "money_emphasis", weight: 6 });
    }

    // Link count
    const linkCount = (input.body.match(/https?:\/\//g) || []).length;
    if (linkCount > 5) {
        findings.push({ rule: "too_many_links", weight: 8, snippet: `${linkCount} links` });
    }

    // Email-specific
    if (input.channel === "email") {
        if (!/unsubscribe/i.test(input.body)) {
            findings.push({ rule: "no_unsubscribe", weight: 12 });
        }
        const subjLen = (input.subject || "").length;
        if (subjLen > 70) findings.push({ rule: "long_subject", weight: 3, snippet: `${subjLen} chars` });
        if (subjLen > 0 && /^RE:|^FWD:/i.test(input.subject || "") && !/^RE: /i.test(input.subject || "")) {
            // Fake "RE:" prefix without space — common spam pattern
            findings.push({ rule: "fake_reply_subject", weight: 8 });
        }
    }

    // SMS-specific
    if (input.channel === "sms") {
        if (input.body.length > 320) {
            findings.push({ rule: "sms_too_long", weight: 5, snippet: `${input.body.length} chars (will split into segments)` });
        }
        if (!/STOP/i.test(input.body)) {
            findings.push({ rule: "sms_no_optout", weight: 12 });
        }
    }

    // Merge-tag sanity — un-closed braces
    if (/\{\{[^}]*$/m.test(input.body)) {
        findings.push({ rule: "unclosed_merge_tag", weight: 6 });
    }

    const score = Math.min(100, findings.reduce((s, f) => s + f.weight, 0));
    const severity = score >= 60 ? "bad" : score >= 30 ? "warn" : "ok";
    return NextResponse.json({ score, severity, findings });
}
