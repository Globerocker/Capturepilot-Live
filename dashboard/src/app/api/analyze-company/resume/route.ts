import { NextRequest, NextResponse } from "next/server";
import { runScoringPipeline } from "../route";

export const maxDuration = 300;

/**
 * POST /api/analyze-company/resume
 *
 * Body: { analysis_id: string, naics_codes: string[] }
 *
 * Internal endpoint called by select-naics to actually run the scoring pipeline.
 * This is a separate route so the select-naics endpoint can return immediately
 * and let this one handle the long-running work.
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const analysisId = String(body.analysis_id || "").trim();
        const naicsCodes = Array.isArray(body.naics_codes) ? body.naics_codes.map((c: unknown) => String(c)) : [];

        if (!analysisId || naicsCodes.length === 0) {
            return NextResponse.json({ error: "analysis_id and naics_codes required" }, { status: 400 });
        }

        // Run the scoring pipeline (this is the long-running work)
        await runScoringPipeline(analysisId, naicsCodes);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("resume pipeline error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Resume failed" },
            { status: 500 },
        );
    }
}
