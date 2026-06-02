import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { scoreOpportunity, type ProfileForScoring, type OpportunityForScoring, type ScoredMatch } from "@/lib/match-scoring";

export const maxDuration = 300;

const MAX_MATCHES_PER_USER = 500;
// Lowered from 1000 — Supabase statement timeout (~30s) was hitting on the
// first page when the table grew past ~25k rows because each opp row carries
// a multi-KB `description` and JSONB `structured_requirements` column. At
// batch=200 each round-trip is small enough to clear comfortably; total
// wall-time across pages is still well inside the cron's 250s budget.
const OPP_BATCH = 200;

function getDb() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );
}

async function loadKeywordEntries(
    db: ReturnType<typeof getDb>,
    canonical: string[],
): Promise<{ keyword: string; aliases: string[] }[]> {
    if (!canonical || canonical.length === 0) return [];
    const { data } = await db
        .from("gov_keywords")
        .select("keyword, aliases")
        .in("keyword", canonical);
    const byKw = new Map<string, string[]>();
    for (const row of (data || []) as { keyword: string; aliases: string[] | null }[]) {
        byKw.set(row.keyword, row.aliases || []);
    }
    return canonical.map((kw) => ({ keyword: kw, aliases: byKw.get(kw) || [] }));
}

export async function GET(req: NextRequest) {
    // Dual auth: Vercel cron OR Supabase pg_cron service-key bearer
    const authHeader = req.headers.get("authorization");
    const serviceKey = process.env.SUPABASE_SERVICE_KEY;
    const expectedCron = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : null;
    const expectedSvc = serviceKey ? `Bearer ${serviceKey}` : null;
    if ((expectedCron || expectedSvc) && authHeader !== expectedCron && authHeader !== expectedSvc) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = getDb();
    const startTime = Date.now();
    const stats = { users: 0, opps: 0, written: 0, hot: 0, warm: 0 };

    interface UserRow {
        id: string;
        company_name: string | null;
        naics_codes: string[] | null;
        sba_certifications: string[] | null;
        state: string | null;
        target_states: string[] | null;
        revenue: number | null;
        federal_awards_count: number | null;
        target_psc_codes: string[] | null;
        preferred_agencies: string[] | null;
        primary_keywords: string[] | null;
        secondary_keywords: string[] | null;
        is_veteran_owned: boolean | null;
        veteran_cert_type: string | null;
    }

    try {
        // Onboarded users only
        const { data: usersData, error: userErr } = await db
            .from("user_profiles")
            .select(
                "id, company_name, naics_codes, sba_certifications, state, " +
                "target_states, revenue, federal_awards_count, " +
                "target_psc_codes, preferred_agencies, " +
                "primary_keywords, secondary_keywords, " +
                "is_veteran_owned, veteran_cert_type"
            )
            .eq("onboarding_complete", true);
        if (userErr) throw userErr;
        const users = (usersData || []) as unknown as UserRow[];
        if (users.length === 0) {
            return NextResponse.json({ success: true, message: "No onboarded users", ...stats });
        }
        stats.users = users.length;

        // All active opportunities — KEYSET pagination by id (not OFFSET/LIMIT)
        // because OFFSET on a 65k+ table takes 30s+ as the offset grows.
        // Also: we DROP description + structured_requirements from this select.
        // They're 5-30KB per row and were responsible for the Supabase statement
        // timeout. Keyword scoring degrades to title-only — acceptable; we can
        // do a 2-pass full-fidelity rescoring later if matchcount drops too far.
        const seenOppIds = new Set<string>();
        const opps: OpportunityForScoring[] = [];
        let lastId: string | null = null;
        while (true) {
            if (Date.now() - startTime > 250_000) break;
            let q = db
                .from("opportunities")
                .select(
                    "id, naics_code, psc_code, notice_type, agency, " +
                    "set_aside_code, place_of_performance_state, " +
                    "award_amount, response_deadline, title"
                )
                .eq("is_archived", false)
                .neq("status", "EXPIRED")
                .order("id", { ascending: true })
                .limit(OPP_BATCH);
            if (lastId) q = q.gt("id", lastId);
            const { data: batch, error: oppErr } = await q;
            if (oppErr) throw oppErr;
            if (!batch || batch.length === 0) break;
            for (const row of (batch as unknown) as OpportunityForScoring[]) {
                if (!seenOppIds.has(row.id)) {
                    seenOppIds.add(row.id);
                    opps.push(row);
                }
            }
            lastId = (batch[batch.length - 1] as unknown as { id: string }).id;
            if (batch.length < OPP_BATCH) break;
        }
        stats.opps = opps.length;
        if (opps.length === 0) {
            return NextResponse.json({ success: true, message: "No opportunities", ...stats });
        }

        for (const user of users) {
            if (Date.now() - startTime > 260_000) break;

            const primaryEntries = await loadKeywordEntries(db, user.primary_keywords || []);
            const secondaryEntries = await loadKeywordEntries(db, user.secondary_keywords || []);

            const profile: ProfileForScoring = {
                naics_codes: user.naics_codes || [],
                sba_certifications: user.sba_certifications || [],
                state: user.state || "",
                target_states: user.target_states || [],
                revenue: user.revenue,
                federal_awards_count: user.federal_awards_count || 0,
                target_psc_codes: user.target_psc_codes || [],
                preferred_agencies: user.preferred_agencies || [],
                primary_keywords: primaryEntries as unknown as ProfileForScoring["primary_keywords"],
                secondary_keywords: secondaryEntries as unknown as ProfileForScoring["secondary_keywords"],
                is_veteran_owned: user.is_veteran_owned === true,
                veteran_cert_type: user.veteran_cert_type || null,
            };

            const scored: ScoredMatch[] = [];
            for (const opp of opps) {
                const result = scoreOpportunity(profile, opp);
                if (result) scored.push(result);
            }

            scored.sort((a, b) => b.score - a.score);
            const top = scored.slice(0, MAX_MATCHES_PER_USER);
            if (top.length === 0) continue;

            // Wipe this user's rows first, then re-insert. Avoids NOT-IN-with-500ids.
            const { error: delErr } = await db.from("user_matches").delete().eq("user_profile_id", user.id);
            if (delErr) {
                console.error(`[score_matches] delete failed user=${user.id}: ${delErr.message}`);
                continue;
            }

            const rows = top.map((m) => ({
                user_profile_id: user.id,
                opportunity_id: m.opportunity_id,
                score: m.score,
                classification: m.classification,
                score_breakdown: m.score_breakdown,
            }));
            let userWritten = 0;
            for (let i = 0; i < rows.length; i += 200) {
                const chunk = rows.slice(i, i + 200);
                const { error: insErr, count } = await db.from("user_matches").insert(chunk, { count: "exact" });
                if (insErr) {
                    console.error(`[score_matches] insert chunk=${i}..${i + chunk.length} user=${user.id}: ${insErr.message}`);
                    continue;
                }
                userWritten += count ?? chunk.length;
            }
            stats.written += userWritten;
            stats.hot += rows.slice(0, userWritten).filter((r) => r.classification === "HOT").length;
            stats.warm += rows.slice(0, userWritten).filter((r) => r.classification === "WARM").length;
        }

        return NextResponse.json({ success: true, ...stats, elapsed_ms: Date.now() - startTime });
    } catch (e) {
        // Supabase errors come through as plain objects with .message / .code /
        // .details / .hint — not Error instances. Without explicit handling
        // the catch reads "Unknown error" and hides the real cause.
        let msg = "Unknown error";
        let code: string | undefined;
        let details: string | undefined;
        let hint: string | undefined;
        if (e instanceof Error) {
            msg = e.message;
        } else if (e && typeof e === "object") {
            const obj = e as { message?: string; code?: string; details?: string; hint?: string };
            msg = obj.message || JSON.stringify(e).slice(0, 200);
            code = obj.code;
            details = obj.details;
            hint = obj.hint;
        }
        console.error("score_matches error:", { msg, code, details, hint, stats });
        return NextResponse.json({ error: msg, code, details, hint, ...stats }, { status: 500 });
    }
}
