import { NextRequest, NextResponse, after } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 300;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;

function makeDb() {
    return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

/**
 * POST /api/analyze-company/select-naics
 *
 * Body: { analysis_id: string, naics_codes: string[] }
 *
 * Persists the user's 1-2 NAICS selection and kicks off scoring in the background.
 * Returns immediately so the frontend can poll /status/:id.
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const analysisId = String(body.analysis_id || "").trim();
        const rawCodes = Array.isArray(body.naics_codes) ? body.naics_codes : [];

        if (!analysisId) {
            return NextResponse.json({ error: "analysis_id is required" }, { status: 400 });
        }

        // Validate + clean NAICS codes (6-digit, max 2)
        const cleanCodes = rawCodes
            .map((c: unknown) => String(c || "").trim())
            .filter((c: string) => /^\d{6}$/.test(c))
            .slice(0, 2);

        if (cleanCodes.length === 0) {
            return NextResponse.json(
                { error: "At least one valid 6-digit NAICS code is required" },
                { status: 400 },
            );
        }

        const sb = makeDb();

        // Verify the analysis exists and is in the right state
        const { data: analysis, error: fetchError } = await sb
            .from("company_analyses")
            .select("id, status, inferred_naics")
            .eq("id", analysisId)
            .single();

        if (fetchError || !analysis) {
            return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
        }

        // Only allow selection while the analysis is awaiting it (or has errored and
        // the user wants to retry). Completed analyses cannot re-score via this path.
        const validStates = new Set([
            "awaiting_naics_selection",
            "classifying",
            "error",
        ]);
        if (!validStates.has(analysis.status)) {
            return NextResponse.json(
                { error: `Cannot select NAICS while analysis is in state: ${analysis.status}` },
                { status: 400 },
            );
        }

        // Persist the user's selection and flip to scoring
        await sb
            .from("company_analyses")
            .update({
                selected_naics_codes: cleanCodes,
                status: "scoring",
            })
            .eq("id", analysisId);

        // Kick off scoring in the background by calling the analyze-company endpoint
        // with the analysis_id — it will detect selected_naics_codes is set and resume scoring
        after(async () => {
            try {
                const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.capturepilot.com";
                await fetch(`${baseUrl}/api/analyze-company/resume`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ analysis_id: analysisId, naics_codes: cleanCodes }),
                });
            } catch (e) {
                console.error("Failed to trigger resume:", e);
            }
        });

        return NextResponse.json({
            success: true,
            analysis_id: analysisId,
            selected_naics_codes: cleanCodes,
            status: "scoring",
        });
    } catch (error) {
        console.error("select-naics error:", error);
        return NextResponse.json(
            { error: "Failed to save NAICS selection" },
            { status: 500 },
        );
    }
}
