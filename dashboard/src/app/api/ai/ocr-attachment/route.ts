import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { extractFromUrl, isMistralConfigured } from "@/lib/llm/mistral-ocr";

export const maxDuration = 180;

/**
 * POST /api/ai/ocr-attachment
 *   body: { attachment_url: string }
 *
 * Runs Mistral OCR on a publicly-reachable attachment URL and returns
 * structured Markdown + page count. If MISTRAL_API_KEY is missing we
 * return 501 so the caller can fall back to the existing GPT-4o-vision
 * pipeline in attachment_intelligence.
 *
 * This is the endpoint that will eventually replace the OpenAI-vision path
 * inside the deep-enrich cron once we've validated output quality on a few
 * hundred solicitations.
 */
export async function POST(req: NextRequest) {
    const cookieStore = await cookies();
    const sb = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll: () => cookieStore.getAll() } }
    );
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (!isMistralConfigured()) {
        return NextResponse.json(
            { error: "MISTRAL_API_KEY not configured. Falling back to OpenAI vision pipeline is handled by the deep-enrich cron." },
            { status: 501 }
        );
    }

    const body = await req.json().catch(() => ({}));
    const url = (body.attachment_url as string) || "";
    if (!/^https?:\/\//.test(url)) {
        return NextResponse.json({ error: "attachment_url must be an http(s) URL" }, { status: 400 });
    }

    try {
        const result = await extractFromUrl(url);
        return NextResponse.json({
            model: result.model,
            page_count: result.page_count,
            full_markdown: result.full_markdown,
            pages: result.pages.map((p) => ({ index: p.index, length: p.markdown.length })),
        });
    } catch (e) {
        const msg = e instanceof Error ? e.message : "OCR failed";
        return NextResponse.json({ error: msg }, { status: 502 });
    }
}
