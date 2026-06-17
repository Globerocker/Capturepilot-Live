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

interface LeadContext {
    company_name: string;
    first_name: string | null;
    state: string | null;
    certifications: string[];
    top_matches: Array<{ title: string; agency: string | null; deadline: string | null; pwin: number | null }>;
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

    // ── Build the prompt ──────────────────────────────────────────────────────
    const matchLines = lead.top_matches.slice(0, 3).map((m, i) => {
        const agency = m.agency ? ` — ${m.agency}` : "";
        const dl = m.deadline ? `, responses due ${formatDeadline(m.deadline)}` : "";
        const fit = typeof m.pwin === "number" ? ` (~${m.pwin}% fit)` : "";
        return `${i + 1}. ${m.title}${agency}${dl}${fit}`;
    });

    const leadContext = `
LEAD:
Company: ${lead.company_name}
First name (use in greeting if present): ${lead.first_name || "unknown — use a plain opener, no name"}
State: ${lead.state || "unknown"}
Certifications: ${lead.certifications.length ? lead.certifications.join(", ") : "none found"}

LIVE OPPORTUNITY MATCHES (real, currently open — reference the TOP one by name):
${matchLines.length ? matchLines.join("\n") : "No live matches found — do NOT invent one. Lead with the site gap instead."}

THE ONE GAP WE CAN FIX (reference this, phrased plainly):
${lead.gap_hook || "No specific gap captured — keep the lead-in about the live match only."}

${lead.findings_summary ? `INTERNAL BRIEFING (context only, do not quote verbatim):\n${lead.findings_summary}` : ""}
${lead.result_url ? `\nFull results page we can point them to: ${lead.result_url}` : ""}`.trim();

    const system = `You are the founder of CapturePilot, a federal-contracting platform built for small, often veteran-owned firms. You write the first cold email yourself — vet-owned IT-firm CEO talking to his cousin over coffee, not a marketer. Your job here: one short, specific, non-salesy lead-in to ONE contractor that proves you actually looked at their business.

Hard rules:
- Reference the single strongest live opportunity by its real title. Do not invent opportunities, awards, or certifications not given to you.
- Name the one gap we can fix, in one clause, as an observation — never a pitch.
- No marketing fluff, no "I hope this finds you well", no calendar links unless the tone calls for it.
- Plain, direct, a little weary. It should read like a real person typed it.
- Always return JSON with keys "subject" and "body".`;

    const user = `Write a cold lead-in email to this contractor.

TONE/STYLE: ${TONE_GUIDE[tone]}

${leadContext}

Requirements:
- Subject: short and specific (under ~7 words). Reference the match or their company, not a generic hook. No clickbait, no emoji.
- Greeting uses the first name when one is given; otherwise a plain opener with no placeholder.
- Reference the top live match by its actual title (shorten it naturally if it's long).
- Mention the one gap as a quick observation, not a sales line.
- Sign off as the CapturePilot founder (first name only is fine). Do not invent a fake signature block with phone/address.
- Output MUST be JSON: {"subject": "...", "body": "..."} — body is plain text with real newlines (\\n).`;

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

        return NextResponse.json({ ok: true, subject: parsed.subject, body: parsed.body });
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

async function loadContractor(db: any, id: string): Promise<LeadContext> {
    const { data, error } = await db
        .from("contractors")
        .select(
            "id, company_name, primary_poc_name, state, certifications, sba_certifications, capability_summary_ai",
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
        top_matches: top.slice(0, 3).map((m: any) => ({
            title: String(m?.title || "Untitled opportunity"),
            agency: m?.agency ?? null,
            deadline: m?.deadline ?? null,
            pwin: typeof m?.pwin === "number" ? m.pwin : typeof m?.score === "number" ? Math.round(m.score * 100) : null,
        })),
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
        top_matches: preview.slice(0, 3).map((m: any) => ({
            title: String(m?.title || "Untitled opportunity"),
            agency: m?.agency ?? null,
            deadline: m?.response_deadline ?? m?.deadline ?? null,
            pwin:
                typeof m?.pwin === "number"
                    ? m.pwin
                    : typeof m?.score === "number"
                        ? Math.round(m.score * 100)
                        : null,
        })),
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
