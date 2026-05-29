/**
 * Ollama-driven contractor strengths/weaknesses analyzer.
 *
 * POST /api/intelligence/contractor-analysis
 *   { uei: "ABC123", force?: boolean }
 *
 * Pulls everything we know about the contractor (POC, certs, NAICS, past
 * awards aggregates) → prompts Ollama → returns JSON {strengths[],
 * weaknesses[], partnership_angle, ideal_partner_profile}.
 *
 * Caches the result on contractors.capability_summary_ai with a 30-day
 * TTL. Pass force=true to bypass the cache (admin/debug).
 *
 * Why Ollama: runs on our VPS, $0 marginal cost, no API key rotation,
 * private (contractor data doesn't leave our infra).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { callLLMJson } from "@/lib/llm/deepseek";
import { HUMAN_VOICE_RULES } from "@/lib/llm/humanizer";

export const runtime = "nodejs";
export const maxDuration = 60;

const CACHE_TTL_DAYS = 30;

interface AnalysisResult {
    strengths: string[];          // 3-5 short bullets
    weaknesses: string[];          // 2-4 short bullets
    partnership_angle: string;     // 1-2 sentences — why a small biz would team
    ideal_partner_profile: string; // 1 sentence — what kind of partner complements them
    win_signals: string[];          // 2-4 short bullets — proof of past performance
}

export async function POST(req: NextRequest) {
    const body = await req.json().catch(() => ({}));
    const uei = String(body.uei || "").trim();
    const force = Boolean(body.force);
    if (!uei) return NextResponse.json({ error: "uei required" }, { status: 400 });

    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );

    const { data: contractor, error } = await sb
        .from("contractors")
        .select(
            `uei, company_name, dba_name, state, city, naics_codes, primary_naics_code,
             certifications, primary_poc_title, business_url, entity_structure,
             federal_awards_count, total_award_volume, last_award_date,
             agency_relationships, naics_awards,
             capability_summary_ai, capability_summary_refreshed_at`
        )
        .eq("uei", uei)
        .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!contractor) return NextResponse.json({ error: "not found" }, { status: 404 });

    // Cache check — return existing if fresh enough.
    const cachedAt = contractor.capability_summary_refreshed_at as string | null;
    const cached = contractor.capability_summary_ai as AnalysisResult | null;
    if (!force && cached && cachedAt) {
        const ageMs = Date.now() - new Date(cachedAt).getTime();
        if (ageMs < CACHE_TTL_DAYS * 86_400_000) {
            return NextResponse.json({ ok: true, source: "cache", analysis: cached });
        }
    }

    // Build the dossier we hand to Ollama. Compact — Ollama 7B handles
    // ~4K tokens of context comfortably, and we want to leave room for
    // the JSON response.
    const agencyTop3 = Array.isArray(contractor.agency_relationships)
        ? (contractor.agency_relationships as Array<{ name: string; amount: number; count: number }>)
            .slice(0, 3)
            .map(a => `${a.name} ($${Math.round(a.amount / 1000)}K across ${a.count} awards)`)
            .join("; ")
        : "(none)";
    const naicsTop3 = Array.isArray(contractor.naics_awards)
        ? (contractor.naics_awards as Array<{ code: string; description: string; amount: number; count: number }>)
            .slice(0, 3)
            .map(n => `${n.code} ${n.description}`)
            .join("; ")
        : "(none)";

    const dossier = [
        `CONTRACTOR DOSSIER`,
        `Name: ${contractor.company_name}${contractor.dba_name ? ` (DBA ${contractor.dba_name})` : ""}`,
        `UEI: ${contractor.uei}`,
        `Location: ${contractor.city || "?"}, ${contractor.state || "?"}`,
        `Primary NAICS: ${contractor.primary_naics_code || "?"}`,
        `All NAICS: ${(contractor.naics_codes as string[] | null)?.slice(0, 10).join(", ") || "?"}`,
        `Certifications: ${(contractor.certifications as string[] | null)?.join(", ") || "none on file"}`,
        `Entity structure: ${contractor.entity_structure || "?"}`,
        `Website: ${contractor.business_url || "(none)"}`,
        ``,
        `PAST FEDERAL PERFORMANCE (USASpending)`,
        `Federal awards count: ${contractor.federal_awards_count ?? 0}`,
        `Total award volume: $${Math.round((Number(contractor.total_award_volume) || 0) / 1000)}K`,
        `Last award: ${contractor.last_award_date || "(no data)"}`,
        `Top 3 agencies: ${agencyTop3}`,
        `Top 3 NAICS: ${naicsTop3}`,
    ].join("\n");

    const systemPrompt = `${HUMAN_VOICE_RULES}

ROLE: You are briefing a federal contractor (small business) on a potential PARTNER they're evaluating. Your output drives the "Strengths/Weaknesses" panel on the partner detail page. Be concise, specific, and honest — vague generic bullets are worse than no answer.

Return STRICT JSON with this exact schema:
{
  "strengths": ["3-5 short bullets, each 6-12 words"],
  "weaknesses": ["2-4 short bullets, each 6-12 words — concrete gaps, not vague concerns"],
  "partnership_angle": "1-2 sentences explaining when a small biz should team with this contractor",
  "ideal_partner_profile": "1 sentence describing what kind of partner COMPLEMENTS this contractor (set-aside type, NAICS gap, geography, etc)",
  "win_signals": ["2-4 short bullets citing proof of past performance — specific agencies, recent awards, NAICS concentration"]
}

RULES:
- "strengths" comes from past awards + cert mix + NAICS concentration. NEVER make up data — if win_signals is empty, say so.
- "weaknesses" is honest: no certs → say so; no past awards → say so; narrow NAICS → say so. Don't soften.
- "partnership_angle" should be ACTIONABLE: "Teaming-eligible for X agency RFPs requiring Y NAICS" not "Could be a good partner".
- If federal_awards_count = 0, weaknesses must include "No federal past performance on record" and strengths must come only from certs/structure.
- JSON ONLY. No markdown. No commentary.`;

    const analysis = await callLLMJson<AnalysisResult>([
        { role: "system", content: systemPrompt },
        { role: "user", content: dossier },
    ], { temperature: 0.3, max_tokens: 1000 });

    // Persist the analysis for next time. Non-fatal if it fails.
    await sb.from("contractors").update({
        capability_summary_ai: analysis as unknown as Record<string, unknown>,
        capability_summary_refreshed_at: new Date().toISOString(),
        capability_summary_source: "ollama",
    }).eq("uei", uei);

    return NextResponse.json({ ok: true, source: "live", analysis });
}
