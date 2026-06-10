/**
 * LLM-driven classifier for inbound outreach replies (R3-M2.2).
 *
 * Called from the `classify_outreach_reply` worker_jobs handler. Reads an
 * outreach_replies row, asks gpt-4o-mini for a structured classification,
 * and writes back sentiment/intent/parsed_meeting_url/confidence.
 *
 * Why a dedicated lib: the prompt is small but loud, and the schema needs
 * to match the CHECK constraints on outreach_replies.sentiment +
 * outreach_replies.intent verbatim. Keeping it out of the worker route file
 * means we can unit-test the parser without spinning up the full handler.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { callLLMJson } from "@/lib/llm/deepseek";

// Mirrors the CHECK constraint on outreach_replies.sentiment.
const VALID_SENTIMENTS = new Set([
    "positive",
    "neutral",
    "negative",
    "unsure",
    "auto_reply",
    "unsubscribe",
]);

// Mirrors the CHECK constraint on outreach_replies.intent.
const VALID_INTENTS = new Set([
    "interested",
    "not_interested",
    "meeting_request",
    "reschedule",
    "forwarded",
    "oof",
    "unknown",
]);

type ClassifierOutput = {
    sentiment: string;
    intent: string;
    meeting_url?: string | null;
    confidence?: number;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SbAny = SupabaseClient<any, any, any>;

const SYSTEM_PROMPT = `You classify inbound email replies to a B2B outreach campaign.

Return ONLY a JSON object with these keys:
  "sentiment":  "positive" | "neutral" | "negative" | "unsure" | "auto_reply" | "unsubscribe"
  "intent":     "interested" | "not_interested" | "meeting_request" | "reschedule" | "forwarded" | "oof" | "unknown"
  "meeting_url": <string|null>   // calendly / cal.com / hubspot booking link if present, else null
  "confidence": <0..1 number>

Rules:
- "unsubscribe" sentiment ALWAYS wins when the reply asks to be removed, opt out, stop, take me off the list, etc.
- "auto_reply" sentiment for out-of-office, automatic reply, or vacation responder text.
- "meeting_request" intent when they propose a time, ask for a calendar link, or say "let's schedule".
- "reschedule" intent when they were already booked and want a different time.
- "forwarded" intent when they say "looping in <person>" or "passing to <colleague>".
- If you can't tell, return sentiment="unsure" and intent="unknown" with low confidence.
- meeting_url must be a full https URL or null. Never invent one.`;

export async function classifyOutreachReply(
    sb: SbAny,
    replyId: string,
): Promise<{ ok: true; classification: ClassifierOutput } | { ok: false; error: string }> {
    const { data: reply, error } = await sb.from("outreach_replies")
        .select("id, subject, body_text, body_html, sentiment, classified_at")
        .eq("id", replyId)
        .maybeSingle() as {
            data: { id: string; subject: string | null; body_text: string | null; body_html: string | null; sentiment: string | null; classified_at: string | null } | null;
            error: { message: string } | null;
        };

    if (error) return { ok: false, error: error.message };
    if (!reply) return { ok: false, error: "reply not found" };

    // Idempotency: a 2-min reaper requeue should not double-charge OpenAI.
    if (reply.classified_at) {
        return { ok: true, classification: { sentiment: reply.sentiment || "unsure", intent: "unknown" } };
    }

    // Strip HTML when there's no plain text. Cheap regex — a richer parser
    // would be overkill here; the LLM tolerates leftover tags fine.
    let body = reply.body_text;
    if (!body && reply.body_html) {
        // Use [\s\S] instead of the `s` (dotAll) flag — tsconfig targets
        // ES2017 which predates dotAll. Same semantics.
        body = reply.body_html
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    const userText = [
        reply.subject ? `Subject: ${reply.subject}` : "",
        "",
        (body || "").slice(0, 6_000),
    ].join("\n").trim() || "(empty body)";

    let raw: ClassifierOutput;
    try {
        raw = await callLLMJson<ClassifierOutput>(
            [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: userText },
            ],
            { temperature: 0, max_tokens: 300, model: "gpt-4o-mini", provider: "openai" },
        );
    } catch (e) {
        return { ok: false, error: `LLM classify failed: ${e instanceof Error ? e.message : "unknown"}` };
    }

    const sentiment = VALID_SENTIMENTS.has(raw.sentiment) ? raw.sentiment : "unsure";
    const intent = VALID_INTENTS.has(raw.intent) ? raw.intent : "unknown";
    const meetingUrl = typeof raw.meeting_url === "string" && /^https?:\/\//i.test(raw.meeting_url)
        ? raw.meeting_url.slice(0, 500)
        : null;
    const confidence = typeof raw.confidence === "number" && raw.confidence >= 0 && raw.confidence <= 1
        ? raw.confidence
        : null;

    const { error: upErr } = await sb.from("outreach_replies")
        .update({
            sentiment,
            intent,
            parsed_meeting_url: meetingUrl,
            classification_confidence: confidence,
            classified_at: new Date().toISOString(),
        })
        .eq("id", replyId);

    if (upErr) return { ok: false, error: upErr.message };

    return {
        ok: true,
        classification: {
            sentiment,
            intent,
            meeting_url: meetingUrl,
            confidence: confidence ?? undefined,
        },
    };
}
