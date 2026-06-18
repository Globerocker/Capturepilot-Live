import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { HUMAN_VOICE_RULES } from "@/lib/llm/humanizer";
import { assertAdmin } from "@/lib/auth-admin";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const maxDuration = 60;

/**
 * POST /api/admin/cockpit/message
 *
 * Generate a SHORT, specific, non-salesy cold lead-in email tailored to ONE
 * contractor (or inbound Quick Checker lead). The message references a real
 * live opportunity match and the single sharpest data gap we can fix, written
 * in the CapturePilot founder voice (veteran-to-veteran, plain — see
 * HUMAN_VOICE_RULES).
 *
 * This is the AI-writer half of the outreach cockpit. It does NOT send anything
 * — it returns { ok, subject, body } the admin reviews before pushing into a
 * cadence or HubSpot task.
 *
 * Body: {
 *   contractor_id?: string,   // contractors.id  (one of these two required)
 *   analysis_id?: string,     // company_analyses.id (inbound website lead)
 *   tone?: "warm_intro" | "short" | "call_heads_up"   // default warm_intro
 * }
 *
 * Returns: { ok: true, subject, body } | { ok: false, error }
 *
 * Mirrors the structure of /api/ai/draft-email/route.ts.
 */

type Tone = "warm_intro" | "short" | "call_heads_up";
const VALID_TONES: Tone[] = ["warm_intro", "short", "call_heads_up"];

interface LeadMatch {
    title: string;
    agency: string | null;
    deadline: string | null;
    /** Our fit/pwin %, 0-100. Prefer pwin, fall back to score_pct. */
    fit_pct: number | null;
    /** opportunities.id — when present we can build a real sam.gov link. */
    opp_id: string | null;
}

interface LeadPastPerf {
    federal_awards_count: number | null;
    total_award_volume: number | null;
    top_agency: string | null;
}

interface LeadContext {
    company_name: string;
    first_name: string | null;
    state: string | null;
    certifications: string[];
    top_matches: LeadMatch[];
    past_perf: LeadPastPerf;
    gap_hook: string | null;
    findings_summary: string | null;
    result_url: string | null; // /check/[id] for inbound leads
}

const TONE_GUIDE: Record<Tone, string> = {
    warm_intro:
        "First-time cold lead-in. Open with the one live opportunity that fits them by name. Mention the single site gap we can fix in one clause. Offer to send the full match list. No hard ask, no calendar link. 90-130 words.",
    short:
        "Ultra-brief. Two or three sentences total. Name one live match, name the one gap, end with a soft question. Under 60 words. No sign-off paragraph — just a name.",
    call_heads_up:
        "Lead-in that suggests a quick 10-minute call. Reference the live match and the gap, then ask if they want to walk through the full list on a short call this week. Stay low-pressure. 90-120 words.",
};

export async function POST(req: NextRequest) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;

    const OPENAI_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_KEY) {
        console.error("[cockpit/message] OPENAI_API_KEY not set");
        return NextResponse.json({ ok: false, error: "OpenAI not configured" }, { status: 500 });
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

    // ── Build the deterministic matches block (links + fit %) ────────────────
    // This block is appended VERBATIM after the AI intro so the SAM.gov links and
    // fit percentages are exact (never paraphrased / hallucinated by the model).
    const topMatches = lead.top_matches.slice(0, 3);
    const matchesBlock = buildMatchesBlock(topMatches);
    const pastPerfLine = buildPastPerfLine(lead.past_perf);

    // The AI writes ONLY the short human intro (greeting + 1-2 sentences + soft
    // setup) — the structured match list and CTA are appended by code below.
    const matchSummaryForPrompt = topMatches.length
        ? topMatches
              .map((m, i) => {
                  const agency = m.agency ? ` — ${m.agency}` : "";
                  const fit = typeof m.fit_pct === "number" ? ` (~${m.fit_pct}% fit)` : "";
                  return `${i + 1}. ${m.title}${agency}${fit}`;
              })
              .join("\n")
        : "No live matches found.";

    const leadContext = `
LEAD:
Company: ${lead.company_name}
First name (use in greeting if present): ${lead.first_name || "unknown — use a plain opener, no name"}
State: ${lead.state || "unknown"}
Certifications: ${lead.certifications.length ? lead.certifications.join(", ") : "none found"}

LIVE OPPORTUNITY MATCHES (reference the TOP one by name in the intro — the full list is appended after your text by our system, so DO NOT list them all yourself):
${matchSummaryForPrompt}

THE ONE GAP WE CAN FIX (reference this, phrased plainly):
${lead.gap_hook || "No specific gap captured — keep the lead-in about the live match only."}

PAST PERFORMANCE (for context — a one-line summary is appended by our system, don't restate the numbers):
${pastPerfLine || "No federal award history on file."}

${lead.findings_summary ? `INTERNAL BRIEFING (context only, do not quote verbatim):\n${lead.findings_summary}` : ""}
${lead.result_url ? `\nFull results page we can point them to: ${lead.result_url}` : ""}`.trim();

    const system = `You are the founder of CapturePilot, a federal-contracting platform built for small, often veteran-owned firms. You write the first cold email yourself — vet-owned IT-firm CEO talking to his cousin over coffee, not a marketer. Your job here: one short, specific, non-salesy INTRO to ONE contractor that proves you actually looked at their business.

IMPORTANT — you write ONLY the intro paragraph(s). Our system appends the formatted match list (with SAM.gov links and fit %) and a soft call-to-action after your text. So:
- Greet them, then in 1-3 plain sentences explain that you pulled a few live federal opportunities that fit their shop and that the specifics are below.
- Reference the single strongest live opportunity by its real title to prove you looked. Do not list all three — the list is appended after you.
- Do NOT write the match list yourself, do NOT write SAM.gov links, do NOT write a closing CTA — those are appended.

Hard rules:
- Do not invent opportunities, awards, certifications, or numbers not given to you.
- Name the one gap we can fix, in one clause, as an observation — never a pitch.
- No marketing fluff, no "I hope this finds you well", no calendar links unless the tone calls for it.
- Plain, direct, a little weary. It should read like a real person typed it.
- Always return JSON with keys "subject" and "body".`;

    const user = `Write the cold INTRO for an email to this contractor.

TONE/STYLE: ${TONE_GUIDE[tone]}

${leadContext}

Requirements:
- Subject: short and specific (under ~7 words). Reference the match or their company, not a generic hook. No clickbait, no emoji.
- Greeting uses the first name when one is given; otherwise a plain opener with no placeholder.
- Reference the top live match by its actual title (shorten it naturally if it's long).
- Mention the one gap as a quick observation, not a sales line.
- The intro should END right before the match list — do NOT add a sign-off, the list, or a CTA. We append all of that.
- Output MUST be JSON: {"subject": "...", "body": "..."} — body is plain text with real newlines (\\n) and is JUST the intro.`;

    try {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${OPENAI_KEY}`,
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                temperature: 0.5,
                response_format: { type: "json_object" },
                messages: [
                    { role: "system", content: `${HUMAN_VOICE_RULES}\n\n${system}` },
                    { role: "user", content: user },
                ],
            }),
        });

        if (!res.ok) {
            const errText = await res.text();
            console.error("[cockpit/message] OpenAI error:", res.status, errText);
            return NextResponse.json(
                { ok: false, error: `OpenAI request failed: ${res.status}` },
                { status: 502 },
            );
        }

        const json = await res.json();
        const content = json.choices?.[0]?.message?.content || "{}";
        let parsed: { subject?: string; body?: string };
        try {
            parsed = JSON.parse(content);
        } catch (e) {
            console.error("[cockpit/message] JSON parse failed:", e, content);
            return NextResponse.json({ ok: false, error: "Invalid AI response" }, { status: 502 });
        }

        if (!parsed.subject || !parsed.body) {
            console.error("[cockpit/message] missing subject/body in response:", parsed);
            return NextResponse.json(
                { ok: false, error: "AI returned incomplete message" },
                { status: 502 },
            );
        }

        // ── Assemble the ready-to-send email ────────────────────────────────
        // AI intro → deterministic matches block (titles + SAM.gov links + fit %)
        // → one-line past-performance → soft CTA. The structured parts are built
        // by code (never the model) so links and percentages are always exact.
        const intro = String(parsed.body).trim();
        const ctaTarget = lead.result_url ? lead.result_url : null;
        const cta = topMatches.length
            ? ctaTarget
                ? `Want the full breakdown — deadlines, fit notes, and the rest of the list? It's here: ${ctaTarget}\nOr just reply and I'll send it over.`
                : `Want the full breakdown — deadlines, fit notes, and the rest of the list? Reply and I'll send it over.`
            : ctaTarget
                ? `Happy to walk you through what we found: ${ctaTarget}`
                : `Happy to send over what we found — just reply.`;

        const sections: string[] = [intro];
        if (matchesBlock) sections.push(matchesBlock);
        if (pastPerfLine) sections.push(pastPerfLine);
        sections.push(cta);

        const finalBody = sections.join("\n\n");

        return NextResponse.json({ ok: true, subject: parsed.subject, body: finalBody });
    } catch (err) {
        console.error("[cockpit/message] fatal:", err);
        return NextResponse.json({ ok: false, error: "Generation failed" }, { status: 500 });
    }
}

// ── Lead loaders ──────────────────────────────────────────────────────────────

function firstNameOf(fullName: string | null | undefined): string | null {
    const t = (fullName || "").trim();
    if (!t) return null;
    return t.split(/\s+/)[0] || null;
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

/**
 * Normalize one capability_summary_ai.top_matches entry into a LeadMatch.
 * Handles legacy (notice_id/score) + richer (opp_id/score(0-1)/pwin/deadline)
 * shapes. fit_pct prefers pwin, then score_pct, coerced to a 0-100 integer.
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
        opp_id: (m?.opp_id ?? m?.notice_id ?? null) || null,
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
            "id, company_name, primary_poc_name, state, certifications, sba_certifications, " +
            "federal_awards_count, total_federal_awards, total_award_volume, revenue, " +
            "agency_relationships, capability_summary_ai",
        )
        .eq("id", id)
        .maybeSingle();
    if (error) throw new Error(`contractor lookup failed: ${error.message}`);
    if (!data) throw new Error("contractor not found");

    const blob = (data.capability_summary_ai || {}) as any;
    const top = Array.isArray(blob.top_matches) ? blob.top_matches : [];

    return {
        company_name: data.company_name || "your company",
        first_name: firstNameOf(data.primary_poc_name),
        state: data.state || null,
        certifications: normalizeCerts(data.certifications, data.sba_certifications, blob.certifications),
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
        gap_hook: blob.gap_hook || (Array.isArray(blob.data_gaps) ? blob.data_gaps[0] : null) || null,
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

    // Inbound leads carry their gaps in readiness_breakdown; fall back to the
    // inferred profile if a dedicated gap_hook isn't present.
    const gapHook =
        breakdown.gap_hook ||
        (Array.isArray(breakdown.gaps) ? breakdown.gaps[0]?.hook || breakdown.gaps[0] : null) ||
        null;

    const appBase = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "").replace(/\/$/, "");

    return {
        company_name: data.company_name || "your company",
        first_name: firstNameOf(inferred.contact_person),
        state: inferred.state || null,
        certifications: normalizeCerts(inferred.sba_certifications, inferred.certifications),
        top_matches: preview.slice(0, 3).map(normalizeMatch),
        // Inbound (company_analyses) carries no SAM award columns — no past perf.
        past_perf: {
            federal_awards_count:
                typeof inferred.federal_awards_count === "number" ? inferred.federal_awards_count : null,
            total_award_volume: null,
            top_agency: null,
        },
        gap_hook: typeof gapHook === "string" ? gapHook : null,
        findings_summary: breakdown.findings_summary || null,
        result_url: appBase ? `${appBase}/check/${data.id}` : `/check/${data.id}`,
    };
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

// ── Email-block builders (deterministic — never paraphrased by the model) ──────

/** Compact USD, e.g. 2400000 → "$2.4M". Empty string for null/0. */
function compactUsd(n: number | null | undefined): string {
    if (!n || !Number.isFinite(n)) return "";
    if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
    return `$${Math.round(n).toLocaleString()}`;
}

/** sam.gov opportunity link when we have an opp_id, else null. */
function samOppLink(oppId: string | null): string | null {
    const id = (oppId || "").trim();
    if (!id) return null;
    return `https://sam.gov/opp/${id}/view`;
}

/**
 * The TOP-3 matches block. Each match:
 *   <title> — <agency> · <fit %> fit
 *   <sam.gov link>      (omitted when no opp_id)
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
        const link = samOppLink(m.opp_id);
        if (link) lines.push(link);
    }
    return lines.join("\n");
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
