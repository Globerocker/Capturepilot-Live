import { NextRequest, NextResponse } from "next/server";
import { expectedCaptchaToken, validateCrawlUrl } from "@/lib/crawl-guard";

/**
 * Returns the captcha_response token the client must POST back to
 * `/api/analyze-company`. Token is day-bucketed HMAC(website, today) so a
 * scraped token expires within 24h.
 *
 * Note: this is not a real captcha. It's a "must speak to the front door
 * first" handshake that filters scripted bulk scrapes. The hard rate-limit
 * + RLS policy in migration 035 are the durable defenses.
 */
export async function GET(request: NextRequest) {
    const url = new URL(request.url);
    const website = url.searchParams.get("website") || "";
    const check = validateCrawlUrl(website);
    if (check instanceof NextResponse) return check;

    const token = expectedCaptchaToken(check.url);
    return NextResponse.json({ captcha_response: token });
}
