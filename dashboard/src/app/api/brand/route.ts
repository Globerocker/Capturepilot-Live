import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 60;

/**
 * POST /api/brand — Extract brand kit from website
 * Crawls website for: logo URL, brand colors, favicon, social images, fonts
 *
 * Body: { website: string, user_profile_id?: string }
 *
 * Returns: {
 *   logo_url, favicon_url, og_image_url,
 *   colors: { primary, secondary, accent, background, text },
 *   images: string[],
 *   company_name
 * }
 */
export async function POST(req: NextRequest) {
    try {
        const { website, user_profile_id } = await req.json();
        if (!website) return NextResponse.json({ error: "website required" }, { status: 400 });

        const url = website.startsWith("http") ? website : `https://${website}`;

        // Fetch the website HTML
        const res = await fetch(url, {
            headers: { "User-Agent": "CapturePilot-BrandKit/1.0" },
            signal: AbortSignal.timeout(15000),
            redirect: "follow",
        });

        if (!res.ok) return NextResponse.json({ error: `Failed to fetch website: ${res.status}` }, { status: 400 });

        const html = await res.text();

        // Extract logo
        const logoPatterns = [
            /< *img[^>]*class="[^"]*logo[^"]*"[^>]*src="([^"]+)"/i,
            /< *img[^>]*id="[^"]*logo[^"]*"[^>]*src="([^"]+)"/i,
            /< *img[^>]*alt="[^"]*logo[^"]*"[^>]*src="([^"]+)"/i,
            /< *img[^>]*src="([^"]+)"[^>]*class="[^"]*logo[^"]*"/i,
            /< *img[^>]*src="([^"]+)"[^>]*alt="[^"]*logo[^"]*"/i,
            /< *link[^>]*rel="icon"[^>]*href="([^"]+)"/i,
            /<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i,
        ];

        let logoUrl = "";
        let faviconUrl = "";
        let ogImageUrl = "";

        for (const pattern of logoPatterns) {
            const match = html.match(pattern);
            if (match?.[1]) {
                const found = match[1];
                const absUrl = found.startsWith("http") ? found : found.startsWith("//") ? `https:${found}` : new URL(found, url).href;

                if (pattern.source.includes("icon")) {
                    faviconUrl = absUrl;
                } else if (pattern.source.includes("og:image")) {
                    ogImageUrl = absUrl;
                } else if (!logoUrl) {
                    logoUrl = absUrl;
                }
            }
        }

        // Also check for apple-touch-icon (usually high-res logo)
        const appleIcon = html.match(/<link[^>]*rel="apple-touch-icon"[^>]*href="([^"]+)"/i);
        if (appleIcon?.[1]) {
            const absUrl = appleIcon[1].startsWith("http") ? appleIcon[1] : new URL(appleIcon[1], url).href;
            if (!logoUrl) logoUrl = absUrl;
        }

        // Extract colors from inline styles and CSS
        const colorRegex = /#([0-9a-fA-F]{3,8})\b/g;
        const rgbRegex = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/g;
        const foundColors: string[] = [];

        let match;
        while ((match = colorRegex.exec(html)) !== null) {
            const hex = match[1];
            if (hex.length === 3 || hex.length === 6) {
                const fullHex = hex.length === 3 ? hex.split("").map(c => c + c).join("") : hex;
                // Skip white, black, very light grays
                if (!["ffffff", "000000", "f5f5f5", "e5e5e5", "cccccc", "999999", "666666", "333333"].includes(fullHex.toLowerCase())) {
                    foundColors.push(`#${fullHex}`);
                }
            }
        }

        while ((match = rgbRegex.exec(html)) !== null) {
            const r = parseInt(match[1]);
            const g = parseInt(match[2]);
            const b = parseInt(match[3]);
            const hex = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
            if (!["#ffffff", "#000000"].includes(hex.toLowerCase())) {
                foundColors.push(hex);
            }
        }

        // Also extract from meta theme-color
        const themeColor = html.match(/<meta[^>]*name="theme-color"[^>]*content="([^"]+)"/i);
        if (themeColor?.[1]) foundColors.unshift(themeColor[1]);

        // Also extract from CSS variables and common patterns
        const cssVarColors = html.match(/--(?:primary|brand|main|accent|color)[^:]*:\s*(#[0-9a-fA-F]{3,8})/gi);
        if (cssVarColors) {
            for (const c of cssVarColors) {
                const colorMatch = c.match(/#[0-9a-fA-F]{3,8}/);
                if (colorMatch) foundColors.unshift(colorMatch[0]);
            }
        }

        // Deduplicate and take top 5
        const uniqueColors = [...new Set(foundColors.map(c => c.toLowerCase()))].slice(0, 10);

        // Assign color roles
        const colors = {
            primary: uniqueColors[0] || "#000000",
            secondary: uniqueColors[1] || "#666666",
            accent: uniqueColors[2] || "#2563eb",
            background: "#ffffff",
            text: "#1a1a1a",
        };

        // Extract company name from og:site_name or title
        let companyName = "";
        const ogSiteName = html.match(/<meta[^>]*property="og:site_name"[^>]*content="([^"]+)"/i);
        if (ogSiteName?.[1]) companyName = ogSiteName[1].trim();
        if (!companyName) {
            const title = html.match(/<title>([^<]+)<\/title>/i);
            if (title?.[1]) companyName = title[1].replace(/\s*[-–—|].*/g, "").trim();
        }

        // Extract hero/banner images
        const images: string[] = [];
        const imgRegex = /<img[^>]*src="([^"]+)"[^>]*>/gi;
        let imgMatch;
        while ((imgMatch = imgRegex.exec(html)) !== null && images.length < 5) {
            const src = imgMatch[1];
            const absUrl = src.startsWith("http") ? src : src.startsWith("//") ? `https:${src}` : new URL(src, url).href;
            // Skip tiny images, icons, tracking pixels
            if (!absUrl.includes("1x1") && !absUrl.includes("pixel") && !absUrl.includes("tracking") && !absUrl.includes(".svg") && absUrl.length < 500) {
                images.push(absUrl);
            }
        }

        const brandKit = {
            logo_url: logoUrl,
            favicon_url: faviconUrl,
            og_image_url: ogImageUrl,
            colors,
            all_colors: uniqueColors,
            images: images.slice(0, 5),
            company_name: companyName,
            source_url: url,
        };

        // Save to profile if user_profile_id provided
        if (user_profile_id) {
            const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
            await db.from("user_profiles").update({
                notes: JSON.stringify({ ...(await db.from("user_profiles").select("notes").eq("id", user_profile_id).single()).data?.notes, brand_kit: brandKit }),
            }).eq("id", user_profile_id);
        }

        return NextResponse.json({ success: true, brand: brandKit });

    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
