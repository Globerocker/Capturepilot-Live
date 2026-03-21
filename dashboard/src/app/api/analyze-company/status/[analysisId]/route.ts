import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ analysisId: string }> }
) {
    const { analysisId } = await params;

    if (!analysisId) {
        return NextResponse.json({ error: "Analysis ID required" }, { status: 400 });
    }

    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!
    );

    const { data, error } = await sb
        .from("company_analyses")
        .select("*")
        .eq("id", analysisId)
        .single();

    if (error || !data) {
        return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
    }

    return NextResponse.json({
        id: data.id,
        status: data.status,
        company_name: data.company_name,
        website: data.website,
        company_summary: data.company_summary,
        crawl_data: data.crawl_data,
        sam_data: data.sam_data,
        inferred_naics: data.inferred_naics,
        preview_matches: data.preview_matches,
        inferred_profile: data.inferred_profile,
        error_message: data.error_message,
        created_at: data.created_at,
    });
}
