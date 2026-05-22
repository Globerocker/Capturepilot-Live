import { NextRequest, NextResponse, after } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { runPostConfirmationPipeline } from "@/lib/quick-checker-finish";

export const maxDuration = 60;

/**
 * POST /api/analyze-company/confirm
 *
 * Body: {
 *   analysis_id: string,
 *   company_name?: string,
 *   state?: string,
 *   naics_codes?: string[],
 *   sba_certifications?: string[],
 *   employee_count?: number,
 *   years_in_business?: number,
 *   annual_revenue_band?: string,
 *   target_states?: string[],
 * }
 *
 * Called from the ConfirmFoundDataStep on /check/[id] after the user reviews
 * what the crawler found. Persists the corrections, then kicks off the
 * background pipeline (scoring + competitors + readiness + finalize).
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const {
            analysis_id,
            company_name,
            state,
            naics_codes,
            sba_certifications,
            employee_count,
            years_in_business,
            annual_revenue_band,
            target_states,
            primary_keywords,
            secondary_keywords,
        } = body as {
            analysis_id?: string;
            company_name?: string;
            state?: string;
            naics_codes?: string[];
            sba_certifications?: string[];
            employee_count?: number;
            years_in_business?: number;
            annual_revenue_band?: string;
            target_states?: string[];
            primary_keywords?: Array<{ keyword: string; aliases?: string[] }>;
            secondary_keywords?: Array<{ keyword: string; aliases?: string[] }>;
        };

        if (!analysis_id) {
            return NextResponse.json({ error: "analysis_id is required" }, { status: 400 });
        }
        if (!Array.isArray(naics_codes) || naics_codes.length === 0) {
            return NextResponse.json({ error: "At least one NAICS code is required" }, { status: 400 });
        }

        const cleanCodes = naics_codes
            .map(c => String(c).trim())
            .filter(c => /^\d{6}$/.test(c))
            .slice(0, 5);
        if (cleanCodes.length === 0) {
            return NextResponse.json({ error: "Invalid NAICS codes — must be 6 digits" }, { status: 400 });
        }

        const sb = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_KEY!,
        );

        const { data: analysis } = await sb
            .from("company_analyses")
            .select("id, inferred_profile, status")
            .eq("id", analysis_id)
            .maybeSingle();

        if (!analysis) {
            return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
        }

        // Allow re-running confirmation even after the pipeline is past
        // awaiting_confirmation — supports "Edit & re-score" from the result
        // page. If status is "scoring" or later, we still re-run the pipeline.
        if (!["awaiting_confirmation", "scoring", "finding_opportunities", "finding_competitors", "generating", "complete", "error"].includes(analysis.status as string)) {
            return NextResponse.json({ error: `Cannot confirm in status ${analysis.status}` }, { status: 409 });
        }

        const existingProfile = (analysis.inferred_profile || {}) as Record<string, unknown>;

        // Sanitize keyword input — lowercase, trim, dedup, length-limited
        const cleanKeywords = (kws: Array<{ keyword: string; aliases?: string[] }> | undefined): Array<{ keyword: string; aliases?: string[] }> => {
            if (!Array.isArray(kws)) return [];
            const seen = new Set<string>();
            const out: Array<{ keyword: string; aliases?: string[] }> = [];
            for (const k of kws) {
                const kw = String(k?.keyword || "").trim().toLowerCase();
                if (!kw || kw.length < 2 || kw.length > 60) continue;
                if (seen.has(kw)) continue;
                seen.add(kw);
                const aliases = Array.isArray(k.aliases)
                    ? k.aliases.map(a => String(a).trim().toLowerCase()).filter(a => a.length >= 2 && a.length <= 60)
                    : undefined;
                out.push(aliases?.length ? { keyword: kw, aliases } : { keyword: kw });
                if (out.length >= 25) break;
            }
            return out;
        };
        const cleanPrimaryKeywords = cleanKeywords(primary_keywords);
        const cleanSecondaryKeywords = cleanKeywords(secondary_keywords);

        // Merge user corrections into the inferred profile
        const updatedProfile: Record<string, unknown> = {
            ...existingProfile,
            company_name: company_name?.trim() || existingProfile.company_name,
            state: state || existingProfile.state,
            naics_codes: cleanCodes,
            sba_certifications: Array.isArray(sba_certifications) ? sba_certifications : (existingProfile.sba_certifications || []),
            target_states: Array.isArray(target_states) && target_states.length > 0
                ? target_states
                : (existingProfile.target_states || (state ? [state] : [])),
            ...(typeof employee_count === "number" && employee_count > 0 ? { employee_count } : {}),
            ...(typeof years_in_business === "number" && years_in_business >= 0 ? { years_in_business } : {}),
            ...(annual_revenue_band ? { annual_revenue_band } : {}),
            primary_keywords: cleanPrimaryKeywords,
            secondary_keywords: cleanSecondaryKeywords,
        };

        // Grow our shared keyword library — anything the user typed that we don't
        // already track gets inserted into gov_keywords for future profiles.
        // Best-effort; never block the confirm flow on failure.
        // We use source='manual' because the CHECK constraint on gov_keywords
        // only allows ('mined','ai','manual') — 'user' would be rejected.
        if (cleanPrimaryKeywords.length > 0) {
            const userKeywords = cleanPrimaryKeywords.map(k => k.keyword);
            (async () => {
                try {
                    const { data: existingRows } = await sb
                        .from("gov_keywords")
                        .select("keyword")
                        .in("keyword", userKeywords);
                    const existingSet = new Set((existingRows || []).map((r: { keyword: string }) => r.keyword));
                    const newRows = userKeywords
                        .filter(k => !existingSet.has(k))
                        .map(k => ({
                            keyword: k,
                            // display_label is NOT NULL; cheap human-cased version.
                            display_label: k.replace(/\b\w/g, c => c.toUpperCase()),
                            aliases: [] as string[],
                            source: "manual",
                        }));
                    if (newRows.length > 0) {
                        const { error: insErr } = await sb.from("gov_keywords").upsert(newRows, { onConflict: "keyword", ignoreDuplicates: true });
                        if (insErr) console.warn("gov_keywords upsert:", insErr.message);
                    }
                } catch (e) {
                    console.warn("gov_keywords upsert (best-effort) failed:", e instanceof Error ? e.message : e);
                }
            })();
        }

        const updatePayload: Record<string, unknown> = {
            status: "scoring",
            inferred_profile: updatedProfile,
            ...(company_name?.trim() ? { company_name: company_name.trim() } : {}),
            ...(typeof employee_count === "number" && employee_count > 0 ? { employee_count } : {}),
            ...(typeof years_in_business === "number" && years_in_business >= 0 ? { years_in_business } : {}),
            ...(annual_revenue_band ? { annual_revenue_band } : {}),
        };

        // Persist the corrections + flip status to "scoring"
        const { error: updateError } = await sb
            .from("company_analyses")
            .update(updatePayload)
            .eq("id", analysis_id);

        if (updateError) {
            console.error("confirm: update failed", updateError);
            return NextResponse.json({ error: "Could not persist corrections" }, { status: 500 });
        }

        // Resume the pipeline in the background
        after(async () => {
            await runPostConfirmationPipeline(analysis_id);
        });

        return NextResponse.json({ success: true, status: "scoring" });
    } catch (e) {
        console.error("confirm endpoint error:", e);
        return NextResponse.json({ error: (e as Error).message || "Confirm failed" }, { status: 500 });
    }
}
