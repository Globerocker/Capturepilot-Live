/**
 * GET /site/[slug] — PUBLIC, no-chrome one-pager serving.
 *
 * A route handler (not a page) so we return the raw, self-contained HTML built
 * by buildOnePager() with ZERO Next.js app shell around it — exactly the clean
 * preview a partner shares: "here's what your site could look like."
 *
 * Reads contractor_websites by slug. The table has an anon SELECT policy
 * (migration 182) so either the anon key or the service key works; we use the
 * service key here to be robust regardless of RLS evaluation in the route.
 *
 * Excluded from the auth middleware matcher (see middleware.ts) so it is NOT
 * 307'd to /login. 404s with a tiny styled page when the slug is unknown.
 */
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function db() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );
}

const NOT_FOUND_HTML = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>Page not found</title><style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f6f7f9;color:#1a1d23}.box{text-align:center;padding:40px}h1{font-size:48px;margin:0;color:#1e3a5f}p{color:#5b6470;margin-top:8px}</style></head><body><div class="box"><h1>404</h1><p>This page isn't available.</p></div></body></html>`;

export async function GET(
    _req: Request,
    ctx: { params: Promise<{ slug: string }> },
) {
    const { slug } = await ctx.params;
    if (!slug) {
        return new Response(NOT_FOUND_HTML, {
            status: 404,
            headers: { "content-type": "text/html; charset=utf-8" },
        });
    }

    try {
        const { data, error } = await db()
            .from("contractor_websites")
            .select("html")
            .eq("slug", slug)
            .maybeSingle();

        if (error || !data?.html) {
            return new Response(NOT_FOUND_HTML, {
                status: 404,
                headers: { "content-type": "text/html; charset=utf-8" },
            });
        }

        return new Response(data.html, {
            status: 200,
            headers: {
                "content-type": "text/html; charset=utf-8",
                // Short edge cache; partners re-share, contractors re-open.
                "cache-control": "public, max-age=60, s-maxage=300",
            },
        });
    } catch {
        return new Response(NOT_FOUND_HTML, {
            status: 500,
            headers: { "content-type": "text/html; charset=utf-8" },
        });
    }
}
