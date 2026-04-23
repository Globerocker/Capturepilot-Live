import { NextRequest, NextResponse, after } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { computeStrategicScoring } from "@/lib/strategic-scoring";
import { extractStructuredRequirements } from "@/lib/extract-requirements";
import { createJob, runStep, startJob, completeJob, failJob, requireProfileId } from "@/lib/background-jobs";

export const maxDuration = 300;

const SAM_API_KEY = process.env.SAM_API_KEY || "";
const OPENAI_KEY = process.env.OPENAI_API_KEY || "";

/**
 * POST /api/admin/bulk-enrich
 *
 * Kicks off a bulk enrichment pass across N opportunities. The entire run is
 * represented as ONE background_jobs row (kind=bulk_enrich) so the user can
 * watch overall progress in the Global Jobs Indicator. Per-opp work happens
 * inline in `after()`, iterating a capped batch within 300s.
 *
 * Body:
 *   {
 *     scope: "hot_warm" | "user_matches" | "all_active" | "needs_desc" | "needs_ai",
 *     limit?: number (default 100, max 500),
 *     do_description?: boolean (fetch from SAM if still URL — default true),
 *     do_requirements?: boolean (extract structured_requirements — default true),
 *     do_scoring?: boolean (recompute strategic_scoring — default true),
 *     do_ai_strategy?: boolean (call OpenAI — default true, costs $$),
 *     concurrency?: number (parallel HTTP/LLM calls per tick — default 4, max 8)
 *   }
 *
 * Returns: { jobId }
 */

interface BulkBody {
    scope?: "hot_warm" | "user_matches" | "all_active" | "needs_desc" | "needs_ai";
    limit?: number;
    do_description?: boolean;
    do_requirements?: boolean;
    do_scoring?: boolean;
    do_ai_strategy?: boolean;
    concurrency?: number;
}

function getAdmin() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
    );
}

async function enrichOne(
    admin: ReturnType<typeof getAdmin>,
    openai: OpenAI | null,
    opp: Record<string, unknown>,
    flags: Required<Pick<BulkBody, "do_description" | "do_requirements" | "do_scoring" | "do_ai_strategy">>,
): Promise<{ ok: boolean; steps: string[]; err?: string }> {
    const steps: string[] = [];
    const updates: Record<string, unknown> = {};
    try {
        let description = String(opp.description || "");

        if (flags.do_description && description.startsWith("https://api.sam.gov")) {
            try {
                const r = await fetch(description, {
                    headers: SAM_API_KEY ? { "X-Api-Key": SAM_API_KEY, Accept: "application/json" } : { Accept: "application/json" },
                    signal: AbortSignal.timeout(20_000),
                });
                if (r.ok) {
                    const raw = await r.text();
                    let innerText = raw;
                    try {
                        const parsed = JSON.parse(raw) as { description?: string };
                        if (typeof parsed?.description === "string") innerText = parsed.description;
                    } catch { /* not JSON */ }
                    const text = innerText.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim().slice(0, 12_000);
                    if (text.length > 100) {
                        description = text;
                        updates.description = text;
                        steps.push(`desc:${text.length}`);
                    } else {
                        steps.push("desc:short");
                    }
                } else {
                    steps.push(`desc:${r.status}`);
                }
            } catch {
                steps.push("desc:timeout");
            }
        }

        if (flags.do_requirements && description.length > 100) {
            const reqs = extractStructuredRequirements(description);
            updates.structured_requirements = reqs;
            steps.push(`reqs:${Object.keys(reqs).length}`);
        }

        if (flags.do_scoring) {
            const scoring = computeStrategicScoring({ ...(opp as Record<string, unknown>), description } as never);
            updates.strategic_scoring = scoring;
            steps.push(`scoring:${scoring.win_prob_tier}`);
        }

        if (flags.do_ai_strategy && openai && description.length > 100) {
            // Only regenerate if missing
            const hasStrat = opp.ai_win_strategy && typeof opp.ai_win_strategy === "object" && Object.keys(opp.ai_win_strategy as Record<string, unknown>).length > 0;
            if (!hasStrat) {
                const setAside = (opp.set_aside_code as string) || "None";
                const value = (opp.award_amount as number) || (opp.estimated_value as number);
                const prompt = `Federal contracting capture strategist. Analyze this opportunity.

Title: ${opp.title}
Agency: ${opp.agency || "Unknown"}
NAICS: ${opp.naics_code || "N/A"}  Set-Aside: ${setAside}
Value: ${value ? `$${Number(value).toLocaleString()}` : "N/A"}
Incumbent: ${opp.incumbent_contractor_name || "Unknown"}

DESCRIPTION: ${description.slice(0, 2200)}

Respond in this JSON:
{"summary":"2-3 sentence exec summary","sales_angle":"key differentiator","recommended_profile":"ideal contractor","key_risks":["r1","r2","r3"],"win_probability_factors":{"positive":["f1"],"negative":["f1"]},"next_steps":["s1","s2","s3"],"competitive_positioning":"vs incumbent"}`;
                try {
                    const resp = await openai.chat.completions.create({
                        model: "gpt-4o-mini",
                        messages: [{ role: "user", content: prompt }],
                        temperature: 0.3,
                        max_tokens: 1000,
                        response_format: { type: "json_object" },
                    });
                    const text = (resp.choices[0]?.message?.content || "").trim();
                    const strat = JSON.parse(text);
                    if (strat?.summary) {
                        updates.ai_win_strategy = strat;
                        steps.push("ai:ok");
                    }
                } catch (e) {
                    steps.push(`ai:err:${(e as Error).message.slice(0, 40)}`);
                }
            } else {
                steps.push("ai:cached");
            }
        }

        updates.last_crawled_at = new Date().toISOString();
        if (Object.keys(updates).length > 0) {
            const { error: upErr } = await admin.from("opportunities").update(updates).eq("id", opp.id);
            if (upErr) return { ok: false, steps, err: upErr.message };
        }
        return { ok: true, steps };
    } catch (e) {
        return { ok: false, steps, err: (e as Error).message };
    }
}

export async function POST(req: NextRequest) {
    const cookieStore = await cookies();
    const sb = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll: () => cookieStore.getAll() } },
    );
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = getAdmin();
    const { data: profile } = await admin
        .from("user_profiles")
        .select("id, account_type")
        .eq("auth_user_id", user.id)
        .single();
    if (!profile) return NextResponse.json({ error: "No profile" }, { status: 404 });
    const p = profile as { id: string; account_type: string };
    if (p.account_type !== "admin") {
        return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as BulkBody;
    const scope = body.scope || "needs_ai";
    const limit = Math.min(Math.max(body.limit || 100, 1), 500);
    const flags = {
        do_description: body.do_description !== false,
        do_requirements: body.do_requirements !== false,
        do_scoring: body.do_scoring !== false,
        do_ai_strategy: body.do_ai_strategy !== false,
    };
    const concurrency = Math.min(Math.max(body.concurrency || 4, 1), 8);

    // Build target query
    let queryBuilder = admin
        .from("opportunities")
        .select("id, notice_id, title, description, agency, naics_code, set_aside_code, notice_type, award_amount, estimated_value, response_deadline, place_of_performance_state, place_of_performance_city, incumbent_contractor_name, ai_win_strategy, strategic_scoring, structured_requirements, resource_links")
        .eq("is_archived", false)
        .order("posted_date", { ascending: false, nullsFirst: false })
        .limit(limit);

    switch (scope) {
        case "hot_warm":
            // Opps referenced by any HOT/WARM user_match
            {
                const { data: hw } = await admin
                    .from("user_matches")
                    .select("opportunity_id")
                    .in("classification", ["HOT", "WARM"])
                    .limit(limit);
                const ids = Array.from(new Set((hw || []).map((m: { opportunity_id: string }) => m.opportunity_id)));
                if (ids.length === 0) {
                    return NextResponse.json({ error: "No HOT/WARM matches exist yet" }, { status: 400 });
                }
                queryBuilder = admin
                    .from("opportunities")
                    .select("id, notice_id, title, description, agency, naics_code, set_aside_code, notice_type, award_amount, estimated_value, response_deadline, place_of_performance_state, place_of_performance_city, incumbent_contractor_name, ai_win_strategy, strategic_scoring, structured_requirements, resource_links")
                    .in("id", ids)
                    .limit(limit);
            }
            break;
        case "needs_ai":
            queryBuilder = queryBuilder
                .or("ai_win_strategy.is.null,ai_win_strategy.eq.{}");
            break;
        case "needs_desc":
            queryBuilder = queryBuilder.like("description", "https://api.sam.gov%");
            break;
        case "user_matches":
            {
                const { data: m } = await admin
                    .from("user_matches")
                    .select("opportunity_id")
                    .eq("user_profile_id", p.id)
                    .limit(limit);
                const ids = Array.from(new Set((m || []).map((x: { opportunity_id: string }) => x.opportunity_id)));
                if (ids.length === 0) {
                    return NextResponse.json({ error: "You have no user_matches yet" }, { status: 400 });
                }
                queryBuilder = admin
                    .from("opportunities")
                    .select("id, notice_id, title, description, agency, naics_code, set_aside_code, notice_type, award_amount, estimated_value, response_deadline, place_of_performance_state, place_of_performance_city, incumbent_contractor_name, ai_win_strategy, strategic_scoring, structured_requirements, resource_links")
                    .in("id", ids)
                    .limit(limit);
            }
            break;
        // "all_active" — default queryBuilder is fine
    }

    const { data: targets, error: qErr } = await queryBuilder;
    if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 });
    const rows = (targets || []) as Array<Record<string, unknown>>;
    if (rows.length === 0) {
        return NextResponse.json({ error: "No opportunities match that scope right now" }, { status: 400 });
    }

    const profileId = await requireProfileId(user.id);
    const { jobId } = await createJob(profileId, {
        kind: "bulk_enrich",
        title: `Bulk enrich · ${scope} · ${rows.length} opps`,
        steps: [
            { key: "preflight", label: `Loading ${rows.length} opportunities` },
            { key: "process", label: "Enriching (can take up to 5 min)" },
            { key: "summarize", label: "Summarizing results" },
        ],
    });

    after(async () => {
        await startJob(jobId);
        const start = Date.now();
        try {
            await runStep(jobId, "preflight", async () => `Scope=${scope} flags=${JSON.stringify(flags)} concurrency=${concurrency}`, {
                detailOnDone: (s) => s as string,
            });

            const openai = flags.do_ai_strategy && OPENAI_KEY ? new OpenAI({ apiKey: OPENAI_KEY }) : null;
            const counters = { ok: 0, fail: 0, ai_generated: 0, desc_fetched: 0, budget_exceeded: false };

            await runStep(jobId, "process", async () => {
                // Simple concurrency: chunk array into `concurrency` parallel workers
                const queue = [...rows];
                const workers = new Array(concurrency).fill(0).map(async () => {
                    while (queue.length > 0) {
                        if (Date.now() - start > 260_000) { counters.budget_exceeded = true; return; }
                        const opp = queue.shift();
                        if (!opp) return;
                        const r = await enrichOne(admin, openai, opp, flags);
                        if (r.ok) {
                            counters.ok++;
                            if (r.steps.includes("ai:ok")) counters.ai_generated++;
                            if (r.steps.some(s => s.startsWith("desc:") && /^\d+$/.test(s.slice(5)))) counters.desc_fetched++;
                        } else {
                            counters.fail++;
                        }

                        // Every 5 opps, write a progress heartbeat into the job steps' detail.
                        if ((counters.ok + counters.fail) % 5 === 0) {
                            await admin.from("background_jobs").update({
                                steps: [
                                    { key: "preflight", label: `Loaded ${rows.length} opportunities`, status: "done" },
                                    {
                                        key: "process",
                                        label: "Enriching (can take up to 5 min)",
                                        status: "running",
                                        detail: `${counters.ok}/${rows.length} enriched · ${counters.ai_generated} AI strategies · ${counters.fail} failures`,
                                    },
                                    { key: "summarize", label: "Summarizing results", status: "pending" },
                                ],
                                progress_pct: Math.round(((counters.ok + counters.fail) / rows.length) * 90),
                                completed_steps: 1,
                            }).eq("id", jobId);
                        }
                    }
                });
                await Promise.all(workers);
                return `${counters.ok}/${rows.length} enriched · ${counters.ai_generated} AI strategies · ${counters.desc_fetched} descriptions fetched · ${counters.fail} failures${counters.budget_exceeded ? " · hit time budget" : ""}`;
            }, {
                detailOnDone: (s) => s as string,
            });

            await runStep(jobId, "summarize", async () => counters, {
                detailOnDone: (c) => `Saved ${(c as typeof counters).ok} opps`,
            });

            await completeJob(jobId, {
                scope,
                total: rows.length,
                ...counters,
                elapsed_ms: Date.now() - start,
            });
        } catch (e) {
            await failJob(jobId, (e as Error).message).catch(() => { /* noop */ });
        }
    });

    return NextResponse.json({ jobId, queued: rows.length });
}
