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
    const rawUrl = searchParams.get("url");
    const fileName = searchParams.get("name") || "attachment";

    if (!rawUrl) {
        return NextResponse.json({ error: "url parameter required" }, { status: 400 });
    }

    // Only proxy SAM.gov URLs — refuse arbitrary URLs to prevent SSRF.
    let target: URL;
    try {
        target = new URL(rawUrl);
    } catch {
        return NextResponse.json({ error: "Invalid url" }, { status: 400 });
    }
    if (!/(^|\.)sam\.gov$/i.test(target.hostname)) {
        return NextResponse.json({ error: "Only sam.gov URLs may be proxied" }, { status: 400 });
    }

    // Strip any deprecated ?api_key= parameter — we authenticate via header instead.
    target.searchParams.delete("api_key");

    try {
        const upstream = await fetch(target.toString(), {
            headers: { "X-Api-Key": SAM_API_KEY },
            redirect: "follow",
        });

        if (!upstream.ok) {
            return NextResponse.json(
                { error: `SAM.gov returned status ${upstream.status}` },
                { status: upstream.status },
            );
        }

        const contentType = upstream.headers.get("content-type") || "application/octet-stream";
        const upstreamDisposition = upstream.headers.get("content-disposition");

        const headers = new Headers();
        headers.set("Content-Type", contentType);
        headers.set(
            "Content-Disposition",
            upstreamDisposition || `attachment; filename="${fileName.replace(/"/g, "")}"`,
        );
        const contentLength = upstream.headers.get("content-length");
        if (contentLength) headers.set("Content-Length", contentLength);

        return new NextResponse(upstream.body, { status: 200, headers });
    } catch (error) {
        console.error("SAM attachment download error:", error);
        return NextResponse.json({ error: "Failed to download attachment from SAM.gov" }, { status: 500 });
    }
}
