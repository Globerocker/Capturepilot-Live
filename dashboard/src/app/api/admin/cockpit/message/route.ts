import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { HUMAN_VOICE_RULES } from "@/lib/llm/humanizer";
import { assertAdmin } from "@/lib/auth-admin";
import { getNaicsDescription } from "@/lib/naics-labels";
import { toTitleCaseName } from "@/lib/format-name";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const maxDuration = 60;

/**
 * POST /api/admin/cockpit/message
 *
 * Generate a SHORT, specific, non-salesy cold lead-in email tailored to ONE
 * contractor (or inbound Quick Checker lead). The message references real live
 * opportunity matches — with their REAL canonical links (opportunities.link,
 * joined by notice_id, NEVER a constructed sam.gov/opp/<id> URL which 404s for
 * SLED + workspace-style federal notices) and 1-2 short reasons each fits —
 * plus the single sharpest data gap we can fix. Written in the CapturePilot
 * founder voice (veteran-to-veteran, plain — see HUMAN_VOICE_RULES).
 *
 * This is the AI-writer half of the outreach cockpit. It does NOT send anything
 * — it returns { ok, subject, body, template } the admin reviews before pushing
 * into a cadence or HubSpot task.
 *
 * Body: {
 *   contractor_id?: string,   // contractors.id  (one of these two required)
 *   analysis_id?: string,     // company_analyses.id (inbound website lead)
 *   tone?: "warm_intro" | "short" | "call_heads_up"   // legacy; default warm_intro
 *   template?: "intro" | "award_congrats" | "short_nudge" | "deadline"  // default intro
 *   // Optional richer match data the caller may pass through so we don't have
 *   // to re-derive reasons. Each entry keyed by notice_id (or opp_id):
 *   match_reasons?: Record<string, { why?: string; matched_keywords?: string[]; score_breakdown?: Record<string, number> }>
 *   // Optional last-award context (used by the award_congrats template). When
 *   // omitted we look it up from fpds_awards by the contractor's UEI.
 *   last_award?: { agency?: string; amount?: number; date?: string; piid?: string }
 * }
 *
 * Returns: { ok: true, subject, body, template } | { ok: false, error, code? }
 *
 * Mirrors the structure of /api/ai/draft-email/route.ts.
 */

// Legacy tone param (kept for back-compat with the cockpit UI's style picker).
type Tone = "warm_intro" | "short" | "call_heads_up";
const VALID_TONES: Tone[] = ["warm_intro", "short", "call_heads_up"];

// Templates shape both the AI intro AND which block leads the email.
type Template = "intro" | "award_congrats" | "short_nudge" | "deadline";
const VALID_TEMPLATES: Template[] = ["intro", "award_congrats", "short_nudge", "deadline"];

// Channel reshapes length, format, output shape, and which deterministic blocks
// get appended. email = full (subject + matches block + past-perf + CTA);
// linkedin = no subject, one compact match line + short offer; sms = no subject,
// the AI writes the whole short message, nothing appended (carriers split long
// texts + links get filtered).
type Channel = "email" | "linkedin" | "sms";
const VALID_CHANNELS: Channel[] = ["email", "linkedin", "sms"];

interface ChannelSpec {
    needsSubject: boolean;
    appendMatches: "full" | "compact" | "none";
    appendPastPerf: boolean;
    appendCta: "full" | "short" | "none";
}
const CHANNEL_SPEC: Record<Channel, ChannelSpec> = {
    email: { needsSubject: true, appendMatches: "full", appendPastPerf: true, appendCta: "full" },
    linkedin: { needsSubject: false, appendMatches: "compact", appendPastPerf: false, appendCta: "short" },
    sms: { needsSubject: false, appendMatches: "none", appendPastPerf: false, appendCta: "none" },
};

interface LeadMatch {
    title: string;
    agency: string | null;
    deadline: string | null;
    /** Our fit/pwin %, 0-100. Prefer pwin, fall back to score_pct. */
    fit_pct: number | null;
    /** SAM/source notice id — joined back to opportunities for the REAL link. */
    notice_id: string | null;
    /** 1-2 short, plain reasons this opp fits (NAICS / keyword / agency / set-aside). */
    reasons: string[];
    /** Resolved canonical URL from opportunities.link (null when broken/unknown). */
    link: string | null;
}

interface LeadPastPerf {
    federal_awards_count: number | null;
    total_award_volume: number | null;
    top_agency: string | null;
}

interface LeadLastAward {
    agency: string | null;
    amount: number | null;
    date: string | null;
    piid: string | null;
    /** A best-effort USASpending search link for the award (by PIID). */
    link: string | null;
}

interface LeadContext {
    company_name: string;
    first_name: string | null;
    state: string | null;
    certifications: string[];
    naics_codes: string[];
    keywords: string[];
    top_matches: LeadMatch[];
    past_perf: LeadPastPerf;
    last_award: LeadLastAward | null;
    uei: string | null;
    gap_hook: string | null;
    findings_summary: string | null;
    result_url: string | null; // /check/[id] for inbound leads
}

// Per-template guidance for the AI intro. Each describes the OPENING only —
// the structured match block + soft CTA are appended deterministically below.
const TEMPLATE_GUIDE: Record<Template, string> = {
    intro:
        "First-time cold lead-in. Open with the one live opportunity that fits them by name. Mention the single site gap we can fix in one clause. No hard ask. 80-120 words.",
    award_congrats:
        "Open by congratulating them on a recent federal award (you'll be told which one — agency + rough size). One genuine line, then pivot: a few more live opportunities in their lane just opened. Keep it warm, not fawning. 80-120 words.",
    short_nudge:
        "A 3-sentence follow-up nudge. They've heard from us before. Remind them a couple of live matches are still open, ask if they want them. No greeting fluff, no sign-off paragraph — just a name. Under 55 words.",
    deadline:
        "A heads-up that one of their matches closes soon (you'll be told which one + the date). Lead with the deadline, keep it useful not pushy, offer the rest of the list. 80-110 words.",
};

// Map the legacy tone param onto a template when no explicit template is given,
// so existing cockpit-UI callers (which only send `tone`) keep working.
function toneToTemplate(tone: Tone): Template {
    if (tone === "short") return "short_nudge";
    return "intro"; // warm_intro + call_heads_up both lead with the intro shape
}

export async function POST(req: NextRequest) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;

    if (!process.env.OPENAI_API_KEY && !process.env.DEEPSEEK_API_KEY) {
        console.error("[cockpit/message] no LLM key (OPENAI_API_KEY / DEEPSEEK_API_KEY) set");
        return NextResponse.json({ ok: false, error: "No AI writer configured" }, { status: 500 });
    }

    let body: Record<string, unknown>;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }

    const contractor_id = typeof body.contractor_id === "string" ? body.contractor_id : undefined;
    const analysis_id = typeof body.analysis_id === "string" ? body.analysis_id : undefined;
    const tone: Tone = VALID_TONES.includes(body.tone as Tone) ? (body.tone as Tone) : "warm_intro";
    const channel: Channel = VALID_CHANNELS.includes(body.channel as Channel)
        ? (body.channel as Channel)
        : "email";
    // Explicit template wins; otherwise derive from the legacy tone param. SMS
    // has no room for the intro shape — default it to the short follow-up nudge.
    const template: Template = VALID_TEMPLATES.includes(body.template as Template)
        ? (body.template as Template)
        : channel === "sms" ? "short_nudge" : toneToTemplate(tone);
    const spec = CHANNEL_SPEC[channel];
    // Optional caller-supplied per-match reasons (keyed by notice_id or opp_id).
    const matchReasons = (body.match_reasons && typeof body.match_reasons === "object")
        ? (body.match_reasons as Record<string, any>)
        : {};
    const callerAward = (body.last_award && typeof body.last_award === "object")
        ? (body.last_award as Record<string, any>)
        : null;
    const callerWantsCall = tone === "call_heads_up";

    if (!contractor_id && !analysis_id) {
        return NextResponse.json(
            { ok: false, error: "contractor_id or analysis_id required" },
            { status: 400 },
        );
    }

    const db = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );

    // ── Load the lead and normalize into a single shape ──────────────────────
    let lead: LeadContext;
    try {
        lead = contractor_id
            ? await loadContractor(db, contractor_id)
            : await loadAnalysis(db, analysis_id!);
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[cockpit/message] lead load failed:", msg);
        return NextResponse.json({ ok: false, error: msg }, { status: 404 });
    }

    // ── Resolve REAL links + derive richer "why it fits" reasons ─────────────
    // Join each match's notice_id back to opportunities for the canonical link
    // (opportunities.link — sam.gov/.../view OR a SLED portal URL OR a grants
    // URL) and the fields we use to explain the fit. NEVER construct
    // sam.gov/opp/<id>/view — that 404s for workspace + SLED notices.
    const topMatches = lead.top_matches.slice(0, 3);
    await resolveMatchLinksAndReasons(db, topMatches, lead, matchReasons);

    // Resolve last-award context for the award_congrats template (caller value
    // wins; else look it up from fpds_awards by UEI). Cheap + best-effort.
    if (template === "award_congrats") {
        lead.last_award = await resolveLastAward(db, lead, callerAward);
    }

    // ── Build the deterministic blocks (links + fit % + reasons) ─────────────
    const matchesBlock = buildMatchesBlock(topMatches);
    const pastPerfLine = buildPastPerfLine(lead.past_perf);

    // Per-template + per-channel AI prompt + assembled body shape.
    const { system, user } = buildPrompt(template, tone, channel, lead, topMatches);

    // ── Call OpenAI with retry/backoff on 429/503 ────────────────────────────
    const ai = await draftJson({
        temperature: 0.5,
        messages: [
            { role: "system", content: `${HUMAN_VOICE_RULES}\n\n${system}` },
            { role: "user", content: user },
        ],
    });

    if (!ai.ok) {
        // Rate-limit / overload — return a friendly, retryable error so the UI
        // shows "try again in a few seconds" instead of a raw 500.
        if (ai.code === 429) {
            return NextResponse.json(
                { ok: false, error: "The writer is busy right now — try again in a few seconds.", code: 429 },
                { status: 502 },
            );
        }
        return NextResponse.json(
            { ok: false, error: ai.error || `OpenAI request failed${ai.status ? ` (${ai.status})` : ""}` },
            { status: 502 },
        );
    }

    const parsed = ai.parsed;
    // Subject is only required for email; LinkedIn/SMS have none.
    if (!parsed.body || (spec.needsSubject && !parsed.subject)) {
        console.error("[cockpit/message] missing subject/body in response:", parsed);
        return NextResponse.json(
            { ok: false, error: "AI returned incomplete message" },
            { status: 502 },
        );
    }

    // ── Assemble the ready-to-send message (channel-shaped) ──────────────────
    // AI intro → deterministic blocks the model is NOT allowed to write (links,
    // fit %, reasons are always exact). Which blocks get appended depends on the
    // channel: email gets the full treatment; LinkedIn one compact match line +
    // a short offer; SMS nothing (the AI wrote the entire short text).
    const intro = String(parsed.body).trim();

    let finalBody: string;
    if (channel === "sms") {
        // SMS: the model wrote the whole thing. Just normalize whitespace + clamp
        // to ~2 segments so it stays cheap and lands as one readable message.
        finalBody = clampSms(intro);
    } else {
        const sections: string[] = [intro];
        if (spec.appendMatches === "full") {
            if (matchesBlock) sections.push(matchesBlock);
        } else if (spec.appendMatches === "compact") {
            const compact = buildCompactMatchLine(topMatches);
            if (compact) sections.push(compact);
        }
        if (spec.appendPastPerf && pastPerfLine && template !== "short_nudge" && template !== "deadline") {
            sections.push(pastPerfLine);
        }
        if (spec.appendCta !== "none") {
            const cta = spec.appendCta === "short"
                ? buildLinkedinCta(lead, topMatches.length)
                : buildSoftCta(template, lead, topMatches.length, callerWantsCall);
            if (cta) sections.push(cta);
        }
        finalBody = sections.join("\n\n");
    }

    return NextResponse.json({
        ok: true,
        subject: spec.needsSubject ? parsed.subject : null,
        body: finalBody,
        template,
        channel,
    });
}

/** Normalize + clamp an SMS to ~320 chars (2 segments) on a clean word break. */
function clampSms(text: string): string {
    const t = text.replace(/\s*\n\s*\n\s*/g, " ").replace(/[ \t]+/g, " ").trim();
    const MAX = 320;
    if (t.length <= MAX) return t;
    const cut = t.slice(0, MAX);
    const lastSpace = cut.lastIndexOf(" ");
    return (lastSpace > 200 ? cut.slice(0, lastSpace) : cut).trim() + "…";
}

// ── OpenAI call with retry/backoff ──────────────────────────────────────────

type OpenAiResult =
    | { ok: true; parsed: { subject?: string; body?: string } }
    | { ok: false; code?: number; status?: number; error?: string };

/**
 * Call the OpenAI chat-completions API in JSON mode with exponential backoff on
 * transient overload (HTTP 429 rate-limit or 503 service-unavailable). Retries
 * up to 3 times (~800ms, ~1600ms, ~3200ms + jitter). On exhaustion returns
 * { ok:false, code:429 } so the caller can surface a friendly retry message.
 */
async function chatJsonProvider(
    cfg: { endpoint: string; apiKey: string; model: string; label: string },
    payload: {
        temperature: number;
        messages: Array<{ role: string; content: string }>;
    },
): Promise<OpenAiResult> {
    const MAX_ATTEMPTS = 3; // 1 initial + 2 retries, then fall to the next provider
    let lastStatus: number | undefined;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        let res: Response;
        try {
            res = await fetch(cfg.endpoint, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${cfg.apiKey}`,
                },
                body: JSON.stringify({
                    model: cfg.model,
                    temperature: payload.temperature,
                    messages: payload.messages,
                    response_format: { type: "json_object" },
                }),
            });
        } catch (netErr) {
            // Network blip — treat like a transient error and back off.
            console.error("[cockpit/message] OpenAI fetch threw:", netErr);
            if (attempt < MAX_ATTEMPTS - 1) {
                await sleep(backoffMs(attempt));
                continue;
            }
            return { ok: false, code: 429, error: "OpenAI unreachable" };
        }

        if (res.ok) {
            const json = await res.json();
            const content = json.choices?.[0]?.message?.content || "{}";
            try {
                return { ok: true, parsed: JSON.parse(content) };
            } catch (e) {
                console.error("[cockpit/message] JSON parse failed:", e, content);
                return { ok: false, status: 502, error: "Invalid AI response" };
            }
        }

        lastStatus = res.status;
        const errText = await res.text().catch(() => "");

        // Retry only on rate-limit (429) and overload (503). Everything else is
        // a hard failure (bad key, bad request) — fail fast.
        if (res.status === 429 || res.status === 503) {
            console.warn(`[cockpit/message] OpenAI ${res.status} (attempt ${attempt + 1}/${MAX_ATTEMPTS})`);
            if (attempt < MAX_ATTEMPTS - 1) {
                await sleep(backoffMs(attempt));
                continue;
            }
            return { ok: false, code: 429, status: res.status, error: "OpenAI rate-limited" };
        }

        console.error("[cockpit/message] OpenAI error:", res.status, errText);
        return { ok: false, status: res.status, error: `OpenAI request failed: ${res.status}` };
    }

    return { ok: false, code: 429, status: lastStatus, error: `${cfg.label} rate-limited` };
}

/**
 * Draft JSON via the first available provider, falling back on failure. OpenAI
 * (gpt-4o-mini) is primary; DeepSeek (deepseek-chat, OpenAI-compatible) is the
 * fallback so a draft still lands when OpenAI is rate-limited ("writer is busy").
 */
async function draftJson(payload: {
    temperature: number;
    messages: Array<{ role: string; content: string }>;
}): Promise<OpenAiResult> {
    const providers: { endpoint: string; apiKey: string; model: string; label: string }[] = [];
    if (process.env.OPENAI_API_KEY) providers.push({ endpoint: "https://api.openai.com/v1/chat/completions", apiKey: process.env.OPENAI_API_KEY, model: "gpt-4o-mini", label: "OpenAI" });
    if (process.env.DEEPSEEK_API_KEY) providers.push({ endpoint: "https://api.deepseek.com/chat/completions", apiKey: process.env.DEEPSEEK_API_KEY, model: "deepseek-chat", label: "DeepSeek" });
    if (!providers.length) return { ok: false, error: "No AI writer configured" };
    let last: OpenAiResult = { ok: false, code: 429, error: "all writers busy" };
    for (const p of providers) {
        const r = await chatJsonProvider(p, payload);
        if (r.ok) return r;
        last = r;
        console.warn(`[cockpit/message] ${p.label} failed (${r.error}) — trying next provider`);
    }
    return last;
}

/** Exponential backoff with jitter: ~800ms, ~1600ms, ~3200ms. */
function backoffMs(attempt: number): number {
    const base = 800 * Math.pow(2, attempt);
    const jitter = Math.floor(Math.random() * 300);
    return base + jitter;
}

function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

// ── Prompt builder (per-template) ───────────────────────────────────────────

// Channel-specific writing instructions injected into the user prompt.
const CHANNEL_GUIDE: Record<Channel, string> = {
    email:
        "CHANNEL: Email. Write the opener only — our system appends the match list (with links + fit %), a past-performance line, and a soft CTA. End right before the list.",
    linkedin:
        "CHANNEL: LinkedIn DM. No subject. Warm, conversational, like a real message — not a formal email. 2-4 short sentences, ~60-90 words. Reference the single strongest match by name. No greeting like 'Dear', no sign-off, no links (we append one compact match line + a one-line offer after you). It can open by noting you came across their company.",
    sms:
        "CHANNEL: SMS. No subject. This is the WHOLE text — nothing is appended. Keep it under ~300 characters (2 segments max). One or two sentences, casual, first-name only if given. Reference ONE concrete thing (the top match by a SHORT name, or the gap), then a light ask like 'ok if I send you the details?' or 'want me to text you the list?'. No links, no sign-off, no emojis. Good as a follow-up after a LinkedIn connect or a missed call.",
};

function buildPrompt(
    template: Template,
    tone: Tone,
    channel: Channel,
    lead: LeadContext,
    topMatches: LeadMatch[],
): { system: string; user: string } {
    const matchSummaryForPrompt = topMatches.length
        ? topMatches
              .map((m, i) => {
                  const agency = m.agency ? ` — ${m.agency}` : "";
                  const fit = typeof m.fit_pct === "number" ? ` (~${m.fit_pct}% fit)` : "";
                  const why = m.reasons.length ? `  [fits because: ${m.reasons.join("; ")}]` : "";
                  return `${i + 1}. ${m.title}${agency}${fit}${why}`;
              })
              .join("\n")
        : "No live matches found.";

    const awardLine =
        template === "award_congrats" && lead.last_award
            ? `RECENT FEDERAL AWARD (open by congratulating them on this — be specific but brief):\n${describeAward(lead.last_award)}`
            : "";

    const deadlineMatch = template === "deadline" ? pickClosingMatch(topMatches) : null;
    const deadlineLine =
        deadlineMatch && deadlineMatch.deadline
            ? `CLOSING SOON (lead with this one — it closes ${formatDeadline(deadlineMatch.deadline)}):\n${deadlineMatch.title}`
            : "";

    const leadContext = `
LEAD:
Company: ${lead.company_name}   (write the company name AND the person's name in normal Title Case exactly as given here — NEVER ALL-CAPS, even if source data was uppercase)
First name (use in greeting if present): ${lead.first_name || "unknown — use a plain opener, no name"}
State: ${lead.state || "unknown"}
Certifications: ${lead.certifications.length ? lead.certifications.join(", ") : "none found"}

LIVE OPPORTUNITY MATCHES (the full list — with links and fit % — is appended after your text by our system, so DO NOT list them all yourself; reference the TOP one by name to prove you looked):
${matchSummaryForPrompt}
${awardLine ? `\n${awardLine}` : ""}
${deadlineLine ? `\n${deadlineLine}` : ""}

THE ONE GAP WE CAN FIX (reference this plainly, only on the intro template):
${lead.gap_hook || "No specific gap captured — keep the lead-in about the live match only."}

${lead.findings_summary ? `INTERNAL BRIEFING (context only, do not quote verbatim):\n${lead.findings_summary}` : ""}
${lead.result_url ? `\nFull results page we can point them to: ${lead.result_url}` : ""}`.trim();

    const appendNote = channel === "sms"
        ? `IMPORTANT — for SMS you write the COMPLETE message. Nothing is appended. Keep it tiny and self-contained: reference the single strongest item by a short name, then a light ask. No links, no list, no sign-off.`
        : channel === "linkedin"
            ? `IMPORTANT — you write the message body. Our system appends ONE compact match line + a one-line offer after your text. So reference the single strongest item by its real title to prove you looked; do NOT write the match list, links, or a closing CTA — those are appended.`
            : `IMPORTANT — you write ONLY the opening paragraph(s). Our system appends the formatted match list (with REAL links and fit %), a one-line past-performance note, and a soft call-to-action after your text. So:
- Write the opener for the chosen template (described below).
- Reference the single strongest item by its real title to prove you looked. Do not list all the matches — the list is appended after you.
- Do NOT write the match list yourself, do NOT write any links, do NOT write a closing CTA — those are appended.`;

    const system = `You are the founder of CapturePilot, a federal-contracting platform built for small, often veteran-owned firms. You write the first message yourself — vet-owned IT-firm CEO talking to his cousin over coffee, not a marketer. Your job: a short, specific, non-salesy note to ONE contractor that proves you actually looked at their business.

${appendNote}

Hard rules:
- Do not invent opportunities, awards, certifications, or numbers not given to you.
- Plain, direct, a little weary. It should read like a real person typed it.
- No marketing fluff, no "I hope this finds you well", no links, no calendar links.
- Always return JSON with keys "subject" and "body".`;

    const isEmail = channel === "email";
    const subjectReq = isEmail
        ? `- Subject: short and specific (under ~7 words). Reference the match, the award, the deadline, or their company — not a generic hook. No clickbait, no emoji.${
            template === "award_congrats" ? " For this template, the subject can nod to the award win." : ""
        }${template === "deadline" ? " For this template, the subject should signal the closing date." : ""}`
        : `- Subject: not used on this channel — return an empty string "".`;

    const enderReq = isEmail
        ? `- The opener should END right before the match list — do NOT add a sign-off, the list, or a CTA. We append all of that.`
        : channel === "linkedin"
            ? `- Do NOT add a sign-off or links — we append one compact match line + a one-line offer after you.`
            : `- This is the COMPLETE message. No sign-off, no links. Nothing is appended.`;

    const user = `Write ${isEmail ? "the opener for an email" : channel === "linkedin" ? "a LinkedIn message" : "an SMS"} to this contractor.

${CHANNEL_GUIDE[channel]}

TEMPLATE: ${template}
STYLE: ${TEMPLATE_GUIDE[template]}

${leadContext}

Requirements:
${subjectReq}
- Greeting uses the first name when one is given; otherwise a plain opener with no placeholder.${
        template === "short_nudge" ? " (short_nudge: skip a formal greeting — get straight to it.)" : ""
    }
- Reference the lead item by its actual title (shorten naturally if long).
${enderReq}
- Output MUST be JSON: {"subject": "...", "body": "..."} — body is plain text with real newlines (\\n).`;

    return { system, user };
}

// ── CapturePilot soft-CTA (tasteful, indirect promo + risk-free call) ───────

/**
 * The closing line: credits that WE used our own gov-contract matching software
 * to surface these (indirect promo) and offers a low-key, risk-free call. Voice
 * stays plain per HUMAN_VOICE_RULES — never salesy. Shape varies by template.
 */
function buildSoftCta(
    template: Template,
    lead: LeadContext,
    matchCount: number,
    wantsCall: boolean,
): string {
    const link = lead.result_url;
    const credit = matchCount
        ? "We pulled these with our own gov-contract matching tool — it's what we do all day."
        : "Finding these is what our gov-contract matching tool does all day.";

    if (template === "short_nudge") {
        // Lean — one line, no software credit paragraph.
        return link
            ? `Want the full list? It's here: ${link} — or just reply.`
            : `Want the full list? Just reply and I'll send it over.`;
    }

    const callOffer = wantsCall || template === "deadline"
        ? "If it's useful, I'll walk you through the list on a quick 10-minute call — no pitch, and nothing to sign."
        : "Happy to walk you through it on a short call if that's easier — no pitch, nothing to sign.";

    const lead2 = link
        ? `The full breakdown — deadlines, fit notes, the rest of the list — is here: ${link}, or just reply and I'll send it over.`
        : `Reply and I'll send the full breakdown — deadlines, fit notes, the rest of the list.`;

    return matchCount ? `${credit} ${lead2}\n\n${callOffer}` : `${credit} ${lead2}`;
}

// ── Lead loaders ────────────────────────────────────────────────────────────

function firstNameOf(fullName: string | null | undefined): string | null {
    const t = (fullName || "").trim();
    if (!t) return null;
    const first = t.split(/\s+/)[0] || null;
    // SAM stores names ALL-CAPS — normalize so the email never shouts "JOHN".
    return first ? toTitleCaseName(first) : null;
}

function normalizeCerts(...arrs: any[]): string[] {
    const out = new Set<string>();
    for (const a of arrs) {
        if (!Array.isArray(a)) continue;
        for (const c of a) {
            const v = typeof c === "string" ? c : c?.type || c?.name || "";
            if (v) out.add(String(v).trim());
        }
    }
    return [...out];
}

function toStrArray(v: unknown): string[] {
    if (!Array.isArray(v)) return [];
    return v.map((x) => (typeof x === "string" ? x : String(x ?? ""))).filter(Boolean);
}

/**
 * Normalize one capability_summary_ai.top_matches entry into a LeadMatch.
 * Handles legacy (notice_id/score) + richer (opp_id/score(0-1)/pwin/deadline)
 * shapes. fit_pct prefers pwin, then score_pct, coerced to a 0-100 integer.
 * reasons/link are filled later by resolveMatchLinksAndReasons().
 */
function normalizeMatch(m: any): LeadMatch {
    const pctOf = (v: unknown): number | null => {
        if (typeof v !== "number" || !Number.isFinite(v)) return null;
        return v <= 1 ? Math.round(v * 100) : Math.round(v);
    };
    const fit = pctOf(m?.pwin) ?? pctOf(m?.score) ?? pctOf(m?.score_pct);
    return {
        title: String(m?.title || "Untitled opportunity"),
        agency: m?.agency ?? null,
        deadline: m?.deadline ?? m?.response_deadline ?? null,
        fit_pct: fit,
        notice_id: (m?.notice_id ?? m?.opp_id ?? null) || null,
        reasons: [],
        link: null,
    };
}

/** Top agency by obligated amount from agency_relationships (array or map). */
function topAgencyName(v: unknown): string | null {
    let best: { name: string; amount: number } | null = null;
    const consider = (name: string, amount: number) => {
        const nm = name.trim();
        if (!nm) return;
        if (!best || amount > best.amount) best = { name: nm, amount };
    };
    if (Array.isArray(v)) {
        for (const e of v) {
            if (!e || typeof e !== "object") continue;
            const name = String((e as any).name || (e as any).agency || "");
            const amount = Number((e as any).amount ?? (e as any).obligated ?? 0) || 0;
            consider(name, amount);
        }
    } else if (v && typeof v === "object") {
        for (const [name, val] of Object.entries(v as Record<string, any>)) {
            const amount =
                val && typeof val === "object" ? Number(val.amount ?? val.obligated ?? 0) || 0 : Number(val) || 0;
            consider(name, amount);
        }
    }
    return best ? (best as { name: string }).name : null;
}

async function loadContractor(db: any, id: string): Promise<LeadContext> {
    const { data, error } = await db
        .from("contractors")
        .select(
            "id, uei, company_name, primary_poc_name, state, naics_codes, certifications, sba_certifications, " +
            "federal_awards_count, total_federal_awards, total_award_volume, revenue, " +
            "agency_relationships, capability_keywords, capability_summary_ai",
        )
        .eq("id", id)
        .maybeSingle();
    if (error) throw new Error(`contractor lookup failed: ${error.message}`);
    if (!data) throw new Error("contractor not found");

    const blob = (data.capability_summary_ai || {}) as any;
    const top = Array.isArray(blob.top_matches) ? blob.top_matches : [];

    const keywords = [
        ...toStrArray(data.capability_keywords),
        ...toStrArray(blob.capability_keywords),
    ]
        .map((k) => k.toLowerCase())
        .filter((k, i, arr) => k.length > 2 && arr.indexOf(k) === i)
        .slice(0, 30);

    return {
        company_name: toTitleCaseName(data.company_name) || "your company",
        first_name: firstNameOf(data.primary_poc_name),
        state: data.state || null,
        certifications: normalizeCerts(data.certifications, data.sba_certifications, blob.certifications),
        naics_codes: toStrArray(data.naics_codes),
        keywords,
        top_matches: top.slice(0, 3).map(normalizeMatch),
        past_perf: {
            federal_awards_count:
                typeof data.total_federal_awards === "number" ? data.total_federal_awards
                : typeof data.federal_awards_count === "number" ? data.federal_awards_count
                : null,
            total_award_volume:
                typeof data.total_award_volume === "number" ? data.total_award_volume
                : typeof data.revenue === "number" ? data.revenue
                : null,
            top_agency: topAgencyName(data.agency_relationships),
        },
        last_award: null,
        uei: data.uei || null,
        gap_hook: blob.gap_hook || (Array.isArray(blob.data_gaps) ? blob.data_gaps[0]?.hook || blob.data_gaps[0] : null) || null,
        findings_summary: blob.findings_summary || null,
        result_url: null,
    };
}

async function loadAnalysis(db: any, id: string): Promise<LeadContext> {
    const { data, error } = await db
        .from("company_analyses")
        .select(
            "id, company_name, inferred_profile, preview_matches, readiness_breakdown",
        )
        .eq("id", id)
        .maybeSingle();
    if (error) throw new Error(`analysis lookup failed: ${error.message}`);
    if (!data) throw new Error("analysis not found");

    const inferred = (data.inferred_profile || {}) as any;
    const preview = Array.isArray(data.preview_matches) ? data.preview_matches : [];
    const breakdown = (data.readiness_breakdown || {}) as any;

    const gapHook =
        breakdown.gap_hook ||
        (Array.isArray(breakdown.gaps) ? breakdown.gaps[0]?.hook || breakdown.gaps[0] : null) ||
        null;

    const appBase = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "").replace(/\/$/, "");

    return {
        company_name: toTitleCaseName(data.company_name) || "your company",
        first_name: firstNameOf(inferred.contact_person),
        state: inferred.state || null,
        certifications: normalizeCerts(inferred.sba_certifications, inferred.certifications),
        naics_codes: toStrArray(inferred.naics_codes),
        keywords: [...toStrArray(inferred.capability_keywords), ...toStrArray(inferred.keywords)]
            .map((k) => k.toLowerCase())
            .filter((k, i, arr) => k.length > 2 && arr.indexOf(k) === i)
            .slice(0, 30),
        top_matches: preview.slice(0, 3).map(normalizeMatch),
        past_perf: {
            federal_awards_count:
                typeof inferred.federal_awards_count === "number" ? inferred.federal_awards_count : null,
            total_award_volume: null,
            top_agency: null,
        },
        last_award: null,
        uei: inferred.uei || null,
        gap_hook: typeof gapHook === "string" ? gapHook : null,
        findings_summary: breakdown.findings_summary || null,
        result_url: appBase ? `${appBase}/check/${data.id}` : `/check/${data.id}`,
    };
}

// ── Link resolution + reason derivation (THE 404 FIX) ───────────────────────

/**
 * For each match, join its notice_id back to opportunities to get:
 *   • the REAL canonical link (opportunities.link — sam.gov, SLED portal, or
 *     grants URL). We NEVER construct sam.gov/opp/<id>/view, which 404s for
 *     workspace-style federal notices and every SLED notice.
 *   • the fields used to derive 1-2 short "why it fits" reasons.
 *
 * Reasons preference order:
 *   1. caller-supplied match_reasons[notice_id].why (verbatim)
 *   2. caller-supplied matched_keywords / score_breakdown
 *   3. re-derive from the joined opp vs the lead (NAICS / keyword / agency /
 *      set-aside overlap).
 */
async function resolveMatchLinksAndReasons(
    db: any,
    matches: LeadMatch[],
    lead: LeadContext,
    matchReasons: Record<string, any>,
): Promise<void> {
    const ids = matches.map((m) => m.notice_id).filter((x): x is string => !!x);
    const oppByNotice: Record<string, any> = {};
    if (ids.length) {
        const { data } = await db
            .from("opportunities")
            .select(
                "notice_id, link, link_broken, agency, naics_code, set_aside_code, extracted_keywords, response_deadline",
            )
            .in("notice_id", ids);
        for (const row of (data || []) as any[]) {
            if (row?.notice_id) oppByNotice[row.notice_id] = row;
        }
    }

    for (const m of matches) {
        const opp = m.notice_id ? oppByNotice[m.notice_id] : null;

        // Real link — skip when missing OR flagged broken.
        if (opp && opp.link && opp.link_broken !== true) {
            m.link = String(opp.link);
        }
        // Backfill agency + deadline from the opp when the blob didn't carry them.
        if (!m.agency && opp?.agency) m.agency = opp.agency;
        if (!m.deadline && opp?.response_deadline) m.deadline = opp.response_deadline;

        m.reasons = deriveReasons(m, opp, lead, matchReasons[m.notice_id || ""] || null);
    }
}

/** Build up to 2 short, plain reasons the opp fits this lead. */
function deriveReasons(
    match: LeadMatch,
    opp: any,
    lead: LeadContext,
    caller: { why?: string; matched_keywords?: string[]; score_breakdown?: Record<string, number> } | null,
): string[] {
    const reasons: string[] = [];

    // 1. Caller-supplied verbatim "why".
    if (caller?.why && typeof caller.why === "string" && caller.why.trim()) {
        reasons.push(caller.why.trim());
    }

    // 2. Caller-supplied matched keywords.
    const callerKw = Array.isArray(caller?.matched_keywords) ? caller!.matched_keywords!.filter(Boolean) : [];
    if (reasons.length < 2 && callerKw.length) {
        reasons.push(`mentions ${callerKw.slice(0, 2).join(" + ")}`);
    }

    // 3. Re-derive from the joined opp.
    if (opp) {
        // NAICS overlap (exact or 4-digit industry group).
        if (reasons.length < 2 && opp.naics_code && lead.naics_codes.length) {
            const code = String(opp.naics_code);
            const exact = lead.naics_codes.includes(code);
            const group = lead.naics_codes.some((n) => n.slice(0, 4) === code.slice(0, 4));
            if (exact || group) {
                const label = getNaicsDescription(code);
                reasons.push(
                    exact
                        ? `same NAICS (${code}${label ? ` ${label}` : ""})`
                        : `your industry group (NAICS ${code}${label ? ` ${label}` : ""})`,
                );
            }
        }

        // Keyword overlap between the opp's extracted_keywords and the lead's.
        if (reasons.length < 2 && Array.isArray(opp.extracted_keywords) && lead.keywords.length) {
            const oppKw = opp.extracted_keywords.map((k: any) => String(k).toLowerCase());
            const hit = lead.keywords.filter((k) => oppKw.includes(k)).slice(0, 2);
            if (hit.length) reasons.push(`matches your work in ${hit.join(" + ")}`);
        }

        // Set-aside the lead is certified for.
        if (reasons.length < 2 && opp.set_aside_code) {
            const sa = String(opp.set_aside_code).toLowerCase();
            const certHit = lead.certifications.find((c) => {
                const cl = c.toLowerCase();
                return (
                    (sa.includes("8(a)") && (cl.includes("8(a)") || cl.includes("8a"))) ||
                    (sa.includes("hubzone") && cl.includes("hubzone")) ||
                    (sa.includes("sdvosb") && cl.includes("sdvosb")) ||
                    ((sa.includes("wosb") || sa.includes("women")) && (cl.includes("wosb") || cl.includes("edwosb"))) ||
                    ((sa.includes("vosb") || sa.includes("veteran")) && (cl.includes("vosb") || cl.includes("sdvosb")))
                );
            });
            if (certHit) reasons.push(`set aside for ${certHit}`);
        }

        // Agency the lead has worked with before.
        if (reasons.length < 2 && opp.agency && lead.past_perf.top_agency) {
            const a = String(opp.agency).toLowerCase();
            const top = lead.past_perf.top_agency.toLowerCase();
            if (a && top && (a.includes(top) || top.includes(a))) {
                reasons.push(`an agency you've already worked with (${lead.past_perf.top_agency})`);
            }
        }
    }

    // 4. Fallback so a line is never empty.
    if (!reasons.length && typeof match.fit_pct === "number") {
        reasons.push(`a strong overall fit for your shop (~${match.fit_pct}%)`);
    }

    return reasons.slice(0, 2);
}

// ── Last-award resolution (award_congrats template) ─────────────────────────

async function resolveLastAward(
    db: any,
    lead: LeadContext,
    caller: Record<string, any> | null,
): Promise<LeadLastAward | null> {
    // Caller-supplied wins.
    if (caller && (caller.agency || caller.amount || caller.date)) {
        const amount = typeof caller.amount === "number" ? caller.amount : Number(caller.amount) || null;
        return {
            agency: caller.agency ?? null,
            amount,
            date: caller.date ?? null,
            piid: caller.piid ?? null,
            link: usaspendingSearchLink(caller.piid ?? null),
        };
    }

    if (!lead.uei) return null;
    try {
        const { data } = await db
            .from("fpds_awards")
            .select("piid, referenced_idv, awarding_agency, obligation_amount, base_and_all_options, signed_date")
            .eq("contractor_uei", lead.uei)
            .order("signed_date", { ascending: false, nullsFirst: false })
            .limit(1)
            .maybeSingle();
        if (!data) return null;
        const amount =
            Number(data.base_and_all_options) || Number(data.obligation_amount) || null;
        return {
            agency: data.awarding_agency ?? null,
            amount,
            date: data.signed_date ?? null,
            piid: data.piid ?? null,
            link: usaspendingSearchLink(data.piid ?? null),
        };
    } catch {
        return null;
    }
}

/** A best-effort USASpending search link for an award PIID. */
function usaspendingSearchLink(piid: string | null): string | null {
    const id = (piid || "").trim();
    if (!id) return null;
    return `https://www.usaspending.gov/search?keyword=${encodeURIComponent(id)}`;
}

function describeAward(a: LeadLastAward): string {
    const bits: string[] = [];
    if (a.agency) bits.push(`from ${a.agency}`);
    const usd = compactUsd(a.amount);
    if (usd) bits.push(`worth about ${usd}`);
    if (a.date) bits.push(`signed ${formatDeadline(a.date)}`);
    return bits.length ? `An award ${bits.join(", ")}.` : "A recent federal award.";
}

/** Pick the match that closes soonest (for the deadline template). */
function pickClosingMatch(matches: LeadMatch[]): LeadMatch | null {
    const dated = matches.filter((m) => {
        if (!m.deadline) return false;
        const t = new Date(m.deadline).getTime();
        return !Number.isNaN(t) && t >= Date.now();
    });
    if (!dated.length) return matches[0] || null;
    dated.sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime());
    return dated[0];
}

function formatDeadline(d: string | null): string {
    if (!d) return "";
    try {
        const dt = new Date(d);
        if (Number.isNaN(dt.getTime())) return d;
        return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    } catch {
        return d;
    }
}

// ── Email-block builders (deterministic — never paraphrased by the model) ────

/** Compact USD, e.g. 2400000 → "$2.4M". Empty string for null/0. */
function compactUsd(n: number | null | undefined): string {
    if (!n || !Number.isFinite(n)) return "";
    if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
    return `$${Math.round(n).toLocaleString()}`;
}

/**
 * The TOP-3 matches block. Each match:
 *   <title> — <agency> · <fit %> fit
 *   why: <1-2 short reasons>
 *   <REAL link>      (opportunities.link; omitted when missing/broken)
 * Returns "" when there are no matches.
 */
function buildMatchesBlock(matches: LeadMatch[]): string {
    if (!matches.length) return "";
    const lines: string[] = ["A few live ones that fit your shop:"];
    for (const m of matches) {
        const agency = m.agency ? ` — ${m.agency}` : "";
        const fit = typeof m.fit_pct === "number" ? ` · ${m.fit_pct}% fit` : "";
        lines.push("");
        lines.push(`${m.title}${agency}${fit}`);
        if (m.reasons.length) lines.push(`Why it fits: ${m.reasons.join("; ")}`);
        if (m.link) lines.push(m.link);
    }
    return lines.join("\n");
}

/**
 * A LinkedIn-sized match reference: the single strongest match on one line with
 * its REAL link + fit %, plus a count of the rest. Keeps the DM short.
 */
function buildCompactMatchLine(matches: LeadMatch[]): string {
    if (!matches.length) return "";
    const m = matches[0];
    const agency = m.agency ? ` — ${m.agency}` : "";
    const fit = typeof m.fit_pct === "number" ? ` (${m.fit_pct}% fit)` : "";
    const link = m.link ? `\n${m.link}` : "";
    const more = matches.length > 1 ? ` Plus ${matches.length - 1} more in your lane.` : "";
    return `The strongest one open right now: ${m.title}${agency}${fit}.${more}${link}`;
}

/** A short, plain LinkedIn offer — no call push, no software pitch paragraph. */
function buildLinkedinCta(lead: LeadContext, matchCount: number): string {
    if (!matchCount) {
        return lead.result_url
            ? `Pulled this with our gov-contract matching tool. Full breakdown's here: ${lead.result_url}`
            : `Happy to dig into what's open in your lane — want me to send a short list?`;
    }
    return lead.result_url
        ? `Want the full short-list (deadlines + fit notes)? It's here: ${lead.result_url} — or I can drop it in this chat.`
        : `Want the full short-list — deadlines, fit notes, the rest? I can drop it here or email it over.`;
}

/**
 * One-line past-performance summary from award count + total volume + top agency.
 * Returns "" when there's nothing worth stating.
 */
function buildPastPerfLine(pp: LeadPastPerf): string {
    const count = pp.federal_awards_count;
    const vol = compactUsd(pp.total_award_volume);
    const hasCount = typeof count === "number" && count > 0;
    if (!hasCount && !vol) return "";

    const bits: string[] = [];
    if (hasCount) {
        bits.push(`${count} federal award${count === 1 ? "" : "s"}`);
    }
    if (vol) bits.push(`${vol} in obligated work`);
    let line = `Past performance: ${bits.join(", ")}`;
    if (pp.top_agency) line += ` — top customer ${pp.top_agency}`;
    line += ".";
    return line;
}
