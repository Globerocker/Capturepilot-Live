import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { analyzeCompany } from "@/lib/crawler";
import * as cheerio from "cheerio";

export const maxDuration = 90;

/**
 * POST /api/brand — Extract full brand kit + company intelligence from a website.
 *
 * Uses the same crawler as the Quick Checker so we get a rich dataset:
 *   - Logo (dedicated resolution pass over favicon/apple-touch/<img class=logo>)
 *   - Palette (theme-color meta, CSS variables, stylesheet colors)
 *   - Company name, description, services, past clients/customers/projects,
 *     certifications, contacts, locations
 *
 * Body: { website: string, user_profile_id?: string }
 */

type BrandKit = {
    logo_url: string;
    favicon_url: string;
    og_image_url: string;
    colors: {
        primary: string;
        secondary: string;
        accent: string;
        background: string;
        text: string;
    };
    all_colors: string[];
    images: string[];
    company_name: string;
    source_url: string;
    // Crawler-derived fields
    description: string;
    services: string[];
    past_clients: string[];
    past_customers: string[];
    project_portfolio: string[];
    certifications: Array<{ type: string; confidence: number }>;
    contacts: Array<{ email?: string; phone?: string }>;
    locations: Array<{ address?: string; state?: string }>;
    detected_uei: string | null;
    detected_cage_code: string | null;
    gov_experience: boolean;
    pages_crawled: string[];
};

function normalizeUrl(raw: string): string {
    if (!raw.startsWith("http://") && !raw.startsWith("https://")) return "https://" + raw;
    return raw.replace(/\/+$/, "");
}

function absolutize(src: string, base: string): string {
    if (!src) return "";
    if (src.startsWith("data:")) return src;
    if (src.startsWith("http://") || src.startsWith("https://")) return src;
    if (src.startsWith("//")) return "https:" + src;
    try {
        return new URL(src, base).href;
    } catch {
        return "";
    }
}

// ─── Logo detection ──────────────────────────────────────────────────────
function findLogoCandidates(html: string, baseUrl: string): {
    logo: string;
    favicon: string;
    ogImage: string;
    candidates: string[];
} {
    const $ = cheerio.load(html);
    const candidates: string[] = [];

    let ogImage = "";
    $('meta[property="og:image"], meta[name="og:image"], meta[property="og:image:url"]').each((_i, el) => {
        const c = $(el).attr("content");
        if (c && !ogImage) ogImage = absolutize(c, baseUrl);
    });

    let favicon = "";
    $('link[rel~="icon"], link[rel="shortcut icon"]').each((_i, el) => {
        const h = $(el).attr("href");
        if (h) {
            const abs = absolutize(h, baseUrl);
            if (abs && !favicon) favicon = abs;
        }
    });

    let appleTouch = "";
    $('link[rel="apple-touch-icon"], link[rel="apple-touch-icon-precomposed"]').each((_i, el) => {
        const h = $(el).attr("href");
        if (h && !appleTouch) appleTouch = absolutize(h, baseUrl);
    });

    // Dedicated logo <img> candidates
    $("img").each((_i, el) => {
        const $el = $(el);
        const src = $el.attr("src") || $el.attr("data-src") || $el.attr("data-lazy-src") || "";
        if (!src) return;
        const alt = ($el.attr("alt") || "").toLowerCase();
        const cls = ($el.attr("class") || "").toLowerCase();
        const id = ($el.attr("id") || "").toLowerCase();
        const parentClass = ($el.parent().attr("class") || "").toLowerCase();
        const parentId = ($el.parent().attr("id") || "").toLowerCase();

        const isLogo =
            /\blogo\b|\bbrand\b/.test(alt) ||
            /\blogo\b|\bbrand\b/.test(cls) ||
            /\blogo\b|\bbrand\b/.test(id) ||
            /\blogo\b|\bbrand\b/.test(parentClass) ||
            /\blogo\b|\bbrand\b/.test(parentId) ||
            /logo|brand/i.test(src);
        if (isLogo) {
            const abs = absolutize(src, baseUrl);
            if (abs) candidates.push(abs);
        }
    });

    // SVG inline logos: treat as less useful for PDF (can't easily embed)
    // Fallback chain: dedicated logo > apple-touch (usually 180x180 PNG) > favicon > og:image
    const logo = candidates[0] || appleTouch || favicon || ogImage || "";

    return {
        logo,
        favicon: favicon || appleTouch,
        ogImage,
        candidates: [...new Set(candidates)].slice(0, 6),
    };
}

// ─── Color detection ─────────────────────────────────────────────────────
// Filter out noise: near-white, near-black, common grays
function isNoiseColor(hex: string): boolean {
    const h = hex.toLowerCase().replace("#", "");
    if (h.length !== 6) return false;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    // Pure white / near white
    if (r > 245 && g > 245 && b > 245) return true;
    // Pure black / near black
    if (r < 12 && g < 12 && b < 12) return true;
    // Grayscale (channels all within 6 of each other) — likely text/border
    if (Math.max(r, g, b) - Math.min(r, g, b) < 8) return true;
    return false;
}

function normalizeHex(raw: string): string {
    let h = raw.replace("#", "").toLowerCase();
    if (h.length === 3) h = h.split("").map(c => c + c).join("");
    if (h.length === 8) h = h.slice(0, 6); // drop alpha
    if (h.length !== 6) return "";
    return "#" + h;
}

function rgbToHex(r: number, g: number, b: number): string {
    return "#" + [r, g, b].map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("");
}

async function extractColorsFromHtmlAndCss(html: string, baseUrl: string): Promise<string[]> {
    const buckets = new Map<string, number>();

    const tally = (hex: string, weight: number) => {
        const n = normalizeHex(hex);
        if (!n) return;
        if (isNoiseColor(n)) return;
        buckets.set(n, (buckets.get(n) || 0) + weight);
    };

    const scanBody = (body: string, weight: number) => {
        const hexRe = /#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;
        let m: RegExpExecArray | null;
        while ((m = hexRe.exec(body)) !== null) tally(m[0], weight);

        const rgbRe = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/g;
        while ((m = rgbRe.exec(body)) !== null) {
            tally(rgbToHex(+m[1], +m[2], +m[3]), weight);
        }
    };

    // Meta theme-color is typically the most accurate
    const $ = cheerio.load(html);
    const themeColor = $('meta[name="theme-color"]').attr("content");
    if (themeColor) tally(themeColor, 100);
    const msTile = $('meta[name="msapplication-TileColor"]').attr("content");
    if (msTile) tally(msTile, 50);

    // CSS vars matching brand / primary names
    const varRe = /--(?:primary|brand|main|accent|color-primary|color-brand|theme)[-\w]*:\s*([^;}]+)/gi;
    let vm: RegExpExecArray | null;
    while ((vm = varRe.exec(html)) !== null) scanBody(vm[1], 25);

    // Inline styles / <style> blocks on the page
    scanBody(html, 1);

    // Fetch referenced stylesheets (limit to 3, small timeout)
    const stylesheetHrefs: string[] = [];
    $('link[rel="stylesheet"]').each((_i, el) => {
        const h = $(el).attr("href");
        if (h) stylesheetHrefs.push(absolutize(h, baseUrl));
    });

    const cssToFetch = stylesheetHrefs.slice(0, 3).filter(Boolean);
    await Promise.all(
        cssToFetch.map(async href => {
            try {
                const res = await fetch(href, {
                    signal: AbortSignal.timeout(5000),
                    headers: { "User-Agent": "CapturePilot-BrandKit/1.0" },
                });
                if (!res.ok) return;
                const ct = res.headers.get("content-type") || "";
                if (!ct.includes("css") && !ct.includes("text")) return;
                const css = (await res.text()).slice(0, 500_000);

                // Target --primary / --brand variables first
                let m: RegExpExecArray | null;
                const cssVarRe = /--(?:primary|brand|main|accent|color-primary|color-brand|theme)[-\w]*:\s*([^;}]+)/gi;
                while ((m = cssVarRe.exec(css)) !== null) scanBody(m[1], 25);
                scanBody(css, 1);
            } catch { /* skip */ }
        })
    );

    const ranked = [...buckets.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([hex]) => hex);

    return ranked.slice(0, 8);
}

// ─── Main handler ────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
    try {
        const { website, user_profile_id } = await req.json();
        if (!website) return NextResponse.json({ error: "website required" }, { status: 400 });

        const url = normalizeUrl(website);

        // 1) Fetch homepage HTML for brand asset extraction
        let homepageHtml = "";
        try {
            const res = await fetch(url, {
                headers: { "User-Agent": "Mozilla/5.0 (compatible; CapturePilot-Brand/1.0)" },
                signal: AbortSignal.timeout(15000),
                redirect: "follow",
            });
            if (res.ok) homepageHtml = await res.text();
        } catch { /* continue */ }

        // 2) In parallel, run the Quick Checker crawler for deep company data
        const [crawl, logoInfo, colors] = await Promise.all([
            analyzeCompany("", url).catch(() => null),
            Promise.resolve(homepageHtml ? findLogoCandidates(homepageHtml, url) : { logo: "", favicon: "", ogImage: "", candidates: [] }),
            homepageHtml ? extractColorsFromHtmlAndCss(homepageHtml, url) : Promise.resolve([]),
        ]);

        // Harvest hero/product images from homepage (excluding the logo)
        const images: string[] = [];
        if (homepageHtml) {
            const $ = cheerio.load(homepageHtml);
            $("img").each((_i, el) => {
                if (images.length >= 6) return;
                const src = $(el).attr("src") || $(el).attr("data-src") || "";
                if (!src) return;
                const abs = absolutize(src, url);
                if (!abs || abs === logoInfo.logo) return;
                if (/sprite|pixel|1x1|tracking|\.gif$/i.test(abs)) return;
                images.push(abs);
            });
        }

        const crawlData = crawl?.data;
        const companyName = crawlData?.company_name || "";

        // 3) Compose final brand kit
        const brandKit: BrandKit = {
            logo_url: logoInfo.logo,
            favicon_url: logoInfo.favicon,
            og_image_url: logoInfo.ogImage,
            colors: {
                primary: colors[0] || "#0a3d62",
                secondary: colors[1] || colors[0] || "#444444",
                accent: colors[2] || "#2563eb",
                background: "#ffffff",
                text: "#1a1a1a",
            },
            all_colors: colors,
            images: [...new Set(images)].slice(0, 5),
            company_name: companyName,
            source_url: url,
            description: crawlData?.description || "",
            services: crawlData?.services || [],
            past_clients: crawlData?.past_clients || [],
            past_customers: crawlData?.past_customers || [],
            project_portfolio: crawlData?.project_portfolio || [],
            certifications: crawlData?.certifications || [],
            contacts: crawlData?.contacts || [],
            locations: crawlData?.locations || [],
            detected_uei: crawlData?.detected_uei || null,
            detected_cage_code: crawlData?.detected_cage_code || null,
            gov_experience: crawlData?.gov_experience_signals?.has_gov_experience || false,
            pages_crawled: crawlData?.pages_crawled || [],
        };

        // 4) Persist on user profile if requested
        if (user_profile_id) {
            try {
                const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
                const { data: existing } = await db
                    .from("user_profiles")
                    .select("notes")
                    .eq("id", user_profile_id)
                    .single();
                const prev = (existing?.notes && typeof existing.notes === "object") ? existing.notes : {};
                await db
                    .from("user_profiles")
                    .update({ notes: { ...prev, brand_kit: brandKit } })
                    .eq("id", user_profile_id);
            } catch { /* non-fatal */ }
        }

        return NextResponse.json({ success: true, brand: brandKit });
    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
