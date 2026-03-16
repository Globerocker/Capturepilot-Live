import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const SAM_API_KEY = process.env.SAM_API_KEY || "";

interface SamAttachment {
    name: string;
    type: string;
    postedDate: string;
    url: string;
    size: string;
}

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
        // SAM.gov opportunity resources endpoint
        const resourcesUrl = `https://api.sam.gov/prod/opportunities/v1/resources?noticeid=${encodeURIComponent(noticeId)}&api_key=${SAM_API_KEY}`;
        const response = await fetch(resourcesUrl, {
            headers: { "X-Api-Key": SAM_API_KEY },
        });

        if (response.status === 429) {
            return NextResponse.json(
                { error: "Rate limited by SAM.gov. Please wait and try again." },
                { status: 429 }
            );
        }

        if (!response.ok) {
            // Some opportunities may not have resources
            if (response.status === 404) {
                return NextResponse.json({ attachments: [], noticeId });
            }
            return NextResponse.json(
                { error: `SAM.gov returned status ${response.status}` },
                { status: response.status }
            );
        }

        const contentType = response.headers.get("content-type") || "";
        const attachments: SamAttachment[] = [];

        if (contentType.includes("application/json")) {
            const data = await response.json();

            // SAM.gov returns resources in various formats
            const resources = data.resources || data._embedded?.opportunityAttachmentList || [];

            for (const res of resources) {
                attachments.push({
                    name: res.name || res.resourceName || res.fileName || "Unknown File",
                    type: res.type || res.mimeType || res.typeOfResource || "",
                    postedDate: res.postedDate || res.uploadDate || "",
                    url: res.downloadUrl || res.accessUrl || res.resourceUrl || res.url || "",
                    size: res.size ? formatFileSize(res.size) : "",
                });
            }
        }

        return NextResponse.json({ attachments, noticeId });
    } catch (error) {
        console.error("SAM attachments fetch error:", error);
        return NextResponse.json({ error: "Failed to fetch attachments from SAM.gov" }, { status: 500 });
    }
}

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
