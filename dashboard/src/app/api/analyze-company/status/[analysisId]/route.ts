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

    // Compute crawler confidence from stored data
    let crawlerConfidence = 0;
    const crawlData = data.crawl_data || {};
    const samData = data.sam_data;
    if (data.status === "complete") {
        let score = 0;
        let total = 10;
        const desc = (crawlData.description as string) || "";
        if (desc.length > 200) score += 2; else if (desc.length > 50) score += 1;
        const services = (crawlData.services as string[]) || [];
        if (services.length >= 5) score += 2; else if (services.length >= 2) score += 1;
        const states = (crawlData.detected_states as string[]) || [];
        if (states.length >= 1) score += 1.5;
        const contacts = (crawlData.contacts as { email?: string; phone?: string }[]) || [];
        if (contacts.some((c: { email?: string }) => c.email)) score += 0.5;
        if (contacts.some((c: { phone?: string }) => c.phone)) score += 0.5;
        const leadership = (crawlData.leadership as { name: string }[]) || [];
        if (leadership.length >= 1) score += 1;
        const certs = (crawlData.certifications as { type: string }[]) || [];
        if (certs.length >= 1) score += 1;
        if (samData && Object.keys(samData).length > 0) score += 1.5;
        crawlerConfidence = Math.round((score / total) * 100) / 100;
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
        cert_recommendations: data.cert_recommendations || [],
        easy_wins: data.easy_wins || [],
        crawler_confidence: crawlerConfidence,
        error_message: data.error_message,
        created_at: data.created_at,
    });
}
