import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const SAM_API_KEY = process.env.SAM_API_KEY || "";

export async function GET(request: NextRequest) {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!SAM_API_KEY) {
        return NextResponse.json({ error: "SAM API key not configured" }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const noticeId = searchParams.get("noticeId");

    if (!noticeId) {
        return NextResponse.json({ error: "noticeId parameter required" }, { status: 400 });
    }

    try {
        // SAM.gov notice description endpoint
        const descUrl = `https://api.sam.gov/prod/opportunities/v1/noticedesc?noticeid=${encodeURIComponent(noticeId)}`;
        const response = await fetch(descUrl, {
            headers: { "X-Api-Key": SAM_API_KEY },
        });

        if (response.status === 429) {
            return NextResponse.json(
                { error: "Rate limited by SAM.gov. Please wait and try again." },
                { status: 429 }
            );
        }

        if (!response.ok) {
            return NextResponse.json(
                { error: `SAM.gov returned status ${response.status}` },
                { status: response.status }
            );
        }

        // The description endpoint returns HTML content
        const contentType = response.headers.get("content-type") || "";
        let description = "";

        if (contentType.includes("application/json")) {
            const data = await response.json();
            description = data.description || data.content || JSON.stringify(data);
        } else {
            description = await response.text();
        }

        return NextResponse.json({ description, noticeId });
    } catch (error) {
        console.error("SAM description fetch error:", error);
        return NextResponse.json({ error: "Failed to fetch description from SAM.gov" }, { status: 500 });
    }
}
