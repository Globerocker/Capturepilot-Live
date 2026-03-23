import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/prospects/save
 * Marks a company_analyses record as saved for the admin prospect dashboard.
 * Uses is_saved column if available, falls back to inferred_profile.is_saved.
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { analysis_id } = body;

        if (!analysis_id) {
            return NextResponse.json({ error: "analysis_id is required" }, { status: 400 });
        }

        const sb = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_KEY!,
        );

        // Store is_saved flag in inferred_profile JSONB
        const { data: current } = await sb
            .from("company_analyses")
            .select("inferred_profile")
            .eq("id", analysis_id)
            .single();

        if (!current) {
            return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
        }

        const profile = (current.inferred_profile || {}) as Record<string, unknown>;
        profile.is_saved = true;

        const { error } = await sb
            .from("company_analyses")
            .update({ inferred_profile: profile })
            .eq("id", analysis_id);

        if (error) {
            return NextResponse.json({ error: "Failed to save" }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch {
        return NextResponse.json({ error: "Save failed" }, { status: 500 });
    }
}
