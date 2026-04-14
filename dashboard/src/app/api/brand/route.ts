import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 60;

/**
 * POST /api/brand — Extract brand kit from website
 * Crawls website for: logo URL, brand colors, favicon, social images, description
 *
 * Body: { website: string, user_profile_id?: string }
 */

// ---------- Color helpers ----------

function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
    const clean = hex.replace(/^#/, "");
    if (clean.length !== 6) return null;
    const r = parseInt(clean.slice(0, 2), 16) / 255;
    const g = parseInt(clean.slice(2, 4), 16) / 255;
    const b = parseInt(clean.slice(4, 6), 16) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    let h = 0;
    let s = 0;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
        else if (max === g) h = ((b - r) / d + 2) * 60;
        else h = ((r - g) / d + 4) * 60;
    }
    return { h, s, l };
}

function normalizeHex(color: string): string | null {
    let c = color.trim().toLowerCase();
    if (c.startsWith("rgb")) {
        const m = c.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
        if (!m) return null;
        c = `#${[m[1], m[2], m[3]].map(n => parseInt(n).toString(16).padStart(2, "0")).join("")}`;
    }
    if (!c.startsWith("#")) c = `#${c}`;
    const m = c.match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/);
    if (!m) return null;
    let hex = m[1];
    if (hex.length === 3) hex = hex.split("").map(x => x + x).join("");
    if (hex.length === 8) hex = hex.slice(0, 6); // drop alpha
    return `#${hex}`;
}

function isBrandWorthy(hex: string): boolean {
    const hsl = hexToHsl(hex);
    if (!hsl) return false;
    // Reject near-white, near-black, and desaturated grays — these dominate CSS noise but aren't brand colors.
    if (hsl.l > 0.96) return false;
    if (hsl.l < 0.05) return false;
    if (hsl.s < 0.15 && (hsl.l > 0.85 || hsl.l < 0.15)) return false;
    if (hsl.s < 0.08) return false;
    return true;
}

// ---------- Main handler ----------

export async function POST(req: NextRequest) {
    try {
        const { website, user_profile_id } = await req.json();
        if (!website) return NextResponse.json({ error: "website required" }, { status: 400 });

        const url = website.startsWith("http") ? website : `https://${website}`;

        const res = await fetch(url, {
            headers: { "User-Agent": "CapturePilot-BrandKit/1.0" },
            signal: AbortSignal.timeout(15000),
            redirect: "follow",
        });
        if (!res.ok) return NextResponse.json({ error: `Failed to fetch website: ${res.status}` }, { status: 400 });
        const html = await res.text();

        // ---------- Logo extraction (richer patterns + SVG support) ----------
        const logoPatterns = [
            // PNG/JPG logos
            /< *img[^>]*class="[^"]*logo[^"]*"[^>]*src="([^"]+\.(?:png|jpe?g|webp|svg)[^"]*)"/i,
            /< *img[^>]*id="[^"]*logo[^"]*"[^>]*src="([^"]+)"/i,
            /< *img[^>]*alt="[^"]*logo[^"]*"[^>]*src="([^"]+)"/i,
            /< *img[^>]*src="([^"]+)"[^>]*class="[^"]*logo[^"]*"/i,
            /< *img[^>]*src="([^"]+)"[^>]*alt="[^"]*logo[^"]*"/i,
            // Inline SVG with class="logo" — report the tag itself
            // Brandfetch-style meta
            /<meta[^>]*property="brandfetch:logo"[^>]*content="([^"]+)"/i,
        ];

        let logoUrl = "";
        for (const pattern of logoPatterns) {
            const match = html.match(pattern);
            if (match?.[1]) {
                const found = match[1];
                logoUrl = found.startsWith("http") ? found : found.startsWith("//") ? `https:${found}` : new URL(found, url).href;
                break;
            }
        }

        // Favicon / apple-touch-icon / og:image as fallbacks for logo
        let faviconUrl = "";
        let ogImageUrl = "";
        const faviconMatch = html.match(/<link[^>]*rel="(?:icon|shortcut icon|apple-touch-icon)"[^>]*href="([^"]+)"/i);
        if (faviconMatch?.[1]) {
            faviconUrl = faviconMatch[1].startsWith("http") ? faviconMatch[1] : new URL(faviconMatch[1], url).href;
        }
        const ogImageMatch = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i);
        if (ogImageMatch?.[1]) {
            ogImageUrl = ogImageMatch[1].startsWith("http") ? ogImageMatch[1] : new URL(ogImageMatch[1], url).href;
        }
        if (!logoUrl) logoUrl = faviconUrl || ogImageUrl;

        // ---------- Color extraction with weighting ----------
        // Strategy: collect all colors, then score each by "brand-likelihood" signals:
        // - appears in theme-color or meta → +5
        // - appears in CSS variable named --primary/--brand/--accent → +4
        // - appears in class="...primary/brand..." → +2
        // - appears in inline style on hero/header elements → +2
        // - raw frequency → +1 per occurrence (capped)
        const colorScores = new Map<string, number>();
        const bump = (hex: string, weight: number) => {
            const norm = normalizeHex(hex);
            if (!norm) return;
            if (!isBrandWorthy(norm)) return;
            colorScores.set(norm, (colorScores.get(norm) || 0) + weight);
        };

        // theme-color meta — strongest signal
        const themeColorMatch = html.match(/<meta[^>]*name="theme-color"[^>]*content="([^"]+)"/i);
        if (themeColorMatch?.[1]) bump(themeColorMatch[1], 5);

        // msapplication-TileColor — also a strong signal
        const tileColorMatch = html.match(/<meta[^>]*name="msapplication-TileColor"[^>]*content="([^"]+)"/i);
        if (tileColorMatch?.[1]) bump(tileColorMatch[1], 4);

        // CSS variables like --primary, --brand, --accent
        const cssVarMatches = html.matchAll(/--(?:primary|brand|main|accent|color|theme)[^:{}]*:\s*([^;}\n]+)/gi);
        for (const m of cssVarMatches) {
            const value = m[1];
            const hex = value.match(/#[0-9a-fA-F]{3,8}/)?.[0] || value.match(/rgba?\([^)]+\)/)?.[0];
            if (hex) bump(hex, 4);
        }

        // Every raw hex color in the HTML — low weight (frequency signal)
        const rawHex = html.matchAll(/#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g);
        const hexFreq = new Map<string, number>();
        for (const m of rawHex) {
            const norm = normalizeHex(`#${m[1]}`);
            if (!norm) continue;
            hexFreq.set(norm, (hexFreq.get(norm) || 0) + 1);
        }
        for (const [hex, count] of hexFreq) bump(hex, Math.min(count, 8));

        // Raw rgb() colors
        const rawRgb = html.matchAll(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/g);
        const rgbFreq = new Map<string, number>();
        for (const m of rawRgb) {
            const hex = `#${[m[1], m[2], m[3]].map(n => parseInt(n).toString(16).padStart(2, "0")).join("")}`;
            rgbFreq.set(hex, (rgbFreq.get(hex) || 0) + 1);
        }
        for (const [hex, count] of rgbFreq) bump(hex, Math.min(count, 8));

        // Rank colors by score, take top 5 unique
        const rankedColors = Array.from(colorScores.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([hex]) => hex);

        const uniqueColors = rankedColors.slice(0, 5);
        const colors = {
            primary: uniqueColors[0] || "#000000",
            secondary: uniqueColors[1] || "#666666",
            accent: uniqueColors[2] || "#2563eb",
            background: "#ffffff",
            text: "#1a1a1a",
        };

        // ---------- Company name ----------
        let companyName = "";
        const ogSiteName = html.match(/<meta[^>]*property="og:site_name"[^>]*content="([^"]+)"/i);
        if (ogSiteName?.[1]) companyName = ogSiteName[1].trim();
        if (!companyName) {
            const title = html.match(/<title>([^<]+)<\/title>/i);
            if (title?.[1]) companyName = title[1].replace(/\s*[-–—|].*/g, "").trim();
        }

        // ---------- Company description ----------
        // Prefer meta description, fall back to og:description. If OpenAI is configured and
        // the description is short/missing, extract a better one from page text.
        let description = "";
        const metaDesc = html.match(/<meta[^>]*name="description"[^>]*content="([^"]+)"/i);
        if (metaDesc?.[1]) description = metaDesc[1].trim();
        if (!description) {
            const ogDesc = html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]+)"/i);
            if (ogDesc?.[1]) description = ogDesc[1].trim();
        }

        // Strip HTML to get plaintext for optional LLM extraction
        const plainText = html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .substring(0, 6000);

        // Structured services extraction via OpenAI (if key is configured).
        let extractedServices: string[] = [];
        let extractedDifferentiators: string = "";
        const OPENAI_KEY = process.env.OPENAI_API_KEY;
        if (OPENAI_KEY && plainText.length > 200) {
            try {
                const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${OPENAI_KEY}` },
                    body: JSON.stringify({
                        model: "gpt-4o-mini",
                        response_format: { type: "json_object" },
                        messages: [
                            {
                                role: "system",
                                content: "You extract structured brand intelligence from website text for federal-contracting prospect research. Return ONLY JSON with keys: company_description (1-2 concise sentences), services (array of 3-8 specific service names), differentiators (1-2 sentences on what makes them stand out).",
                            },
                            {
                                role: "user",
                                content: `Website: ${url}\nCompany name hint: ${companyName}\n\nPAGE TEXT:\n${plainText}`,
                            },
                        ],
                        max_tokens: 500,
                        temperature: 0.2,
                    }),
                    signal: AbortSignal.timeout(25000),
                });
                if (aiRes.ok) {
                    const aiData = await aiRes.json();
                    const raw = aiData.choices?.[0]?.message?.content;
                    if (raw) {
                        try {
                            const parsed = JSON.parse(raw);
                            if (parsed.company_description && !description) {
                                description = String(parsed.company_description).trim();
                            }
                            if (Array.isArray(parsed.services)) {
                                extractedServices = parsed.services.filter((s: unknown) => typeof s === "string" && s.length > 0).slice(0, 8);
                            }
                            if (parsed.differentiators) {
                                extractedDifferentiators = String(parsed.differentiators).trim();
                            }
                        } catch { /* bad JSON, ignore */ }
                    }
                }
            } catch (err) {
                console.error("[brand] OpenAI extraction failed:", err);
            }
        }

        // ---------- Hero images ----------
        const images: string[] = [];
        const imgRegex = /<img[^>]*src="([^"]+)"[^>]*>/gi;
        let imgMatch: RegExpExecArray | null;
        while ((imgMatch = imgRegex.exec(html)) !== null && images.length < 5) {
            const src = imgMatch[1];
            const absUrl = src.startsWith("http") ? src : src.startsWith("//") ? `https:${src}` : new URL(src, url).href;
            if (!absUrl.includes("1x1") && !absUrl.includes("pixel") && !absUrl.includes("tracking") && absUrl.length < 500) {
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
            company_description: description,
            services: extractedServices,
            differentiators: extractedDifferentiators,
            source_url: url,
        };

        if (user_profile_id) {
            const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
            const prev = await db.from("user_profiles").select("notes").eq("id", user_profile_id).single();
            let notesObj: Record<string, unknown> = {};
            const prevNotes = (prev.data as { notes?: unknown } | null)?.notes;
            if (typeof prevNotes === "string") {
                try { notesObj = JSON.parse(prevNotes); } catch { notesObj = {}; }
            } else if (prevNotes && typeof prevNotes === "object") {
                notesObj = prevNotes as Record<string, unknown>;
            }
            await db.from("user_profiles").update({
                notes: JSON.stringify({ ...notesObj, brand_kit: brandKit }),
            }).eq("id", user_profile_id);
        }

        return NextResponse.json({ success: true, brand: brandKit });

    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
