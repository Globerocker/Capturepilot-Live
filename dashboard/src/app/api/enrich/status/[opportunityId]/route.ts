import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!
    );
}

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ opportunityId: string }> }
) {
    const { opportunityId } = await params;
    const supabase = getSupabase();

    // Latest enrichment job for this opportunity
    const { data: job } = await supabase
        .from("enrichment_jobs")
        .select("*")
        .eq("opportunity_id", opportunityId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

    // Count enriched contractors
    const { count: enrichedCount } = await supabase
        .from("opportunity_contractors")
        .select("*", { count: "exact", head: true })
        .eq("opportunity_id", opportunityId)
        .eq("enrichment_status", "enriched");

    // Count total discovered
    const { count: totalCount } = await supabase
        .from("opportunity_contractors")
        .select("*", { count: "exact", head: true })
        .eq("opportunity_id", opportunityId);

    return NextResponse.json({
        job: job || null,
        enriched_contractors: enrichedCount || 0,
        total_contractors: totalCount || 0,
    });
}
