/**
 * Deterministic social-link + CMS/platform extraction for the Quick Checker.
 *
 * The LLM extraction misses social links because the markdown it reads has had
 * every <a href> stripped to plain text — the URLs are gone before the model
 * sees them. This module scans the RAW signals instead (scraped links[], any
 * html, bare URLs in markdown, and — for CMS — a one-shot homepage fetch with
 * response headers). No LLM, no paid API. Pure regex/signature matching.
 */
import type { FirecrawlPage } from "./firecrawl";

export interface SiteSocials {
    linkedin: string | null;        // company page (linkedin.com/company/… or /school/…)
    linkedin_people: string[];      // personal profiles found on-site (linkedin.com/in/…)
    facebook: string | null;
    twitter: string | null;         // twitter.com or x.com
    instagram: string | null;
    youtube: string | null;
    tiktok: string | null;
    other: Record<string, string>;  // platform -> url (github, yelp, pinterest, …)
}

export interface SiteTech {
    socials: SiteSocials;
    cms: string | null;             // detected platform, e.g. "WordPress", "Wix", "Squarespace"
}

const EMPTY_SOCIALS = (): SiteSocials => ({
    linkedin: null, linkedin_people: [], facebook: null, twitter: null,
    instagram: null, youtube: null, tiktok: null, other: {},
});

/** Strip tracking/share/widget noise and normalise a candidate social URL. */
function cleanUrl(raw: string): string | null {
    try {
        const u = new URL(raw.trim(), "https://x.invalid");
        if (u.hostname === "x.invalid") return null; // relative link, not a social
        u.hash = "";
        u.search = "";
        let s = u.toString().replace(/\/$/, "");
        if (s.length > 300) return null;
        return s;
    } catch {
        return null;
    }
}

const SHARE_NOISE = /\/(sharer|share|intent|dialog|plugins|widgets|tr\b|login|signup|home\b)/i;

/** Gather every candidate URL from a set of scraped pages + an optional extra html blob. */
function gatherUrls(pages: FirecrawlPage[], extraHtml?: string): string[] {
    const out: string[] = [];
    const hrefRe = /https?:\/\/[^\s"'<>)\]]+/gi;
    for (const p of pages) {
        for (const l of p.links || []) out.push(l);
        if (p.html) { let m: RegExpExecArray | null; while ((m = hrefRe.exec(p.html)) !== null) out.push(m[0]); }
        if (p.markdown) { let m: RegExpExecArray | null; while ((m = hrefRe.exec(p.markdown)) !== null) out.push(m[0]); }
    }
    if (extraHtml) { let m: RegExpExecArray | null; while ((m = hrefRe.exec(extraHtml)) !== null) out.push(m[0]); }
    return out;
}

/** Classify candidate URLs into the social buckets. First clean match per platform wins. */
export function classifySocials(urls: string[]): SiteSocials {
    const s = EMPTY_SOCIALS();
    const seenPeople = new Set<string>();
    for (const raw of urls) {
        const host = raw.toLowerCase();
        if (SHARE_NOISE.test(host)) continue;
        const url = cleanUrl(raw);
        if (!url) continue;
        const lu = url.toLowerCase();

        if (lu.includes("linkedin.com/in/")) {
            if (!seenPeople.has(url) && s.linkedin_people.length < 10) { s.linkedin_people.push(url); seenPeople.add(url); }
        } else if (lu.includes("linkedin.com/company/") || lu.includes("linkedin.com/school/")) {
            s.linkedin ||= url;
        } else if (/facebook\.com\//.test(lu) && !s.facebook) {
            s.facebook = url;
        } else if (/(?:twitter|x)\.com\//.test(lu) && !/(?:twitter|x)\.com\/(?:intent|share|home)/.test(lu) && !s.twitter) {
            s.twitter = url;
        } else if (/instagram\.com\//.test(lu) && !s.instagram) {
            s.instagram = url;
        } else if (/(?:youtube\.com\/|youtu\.be\/)/.test(lu) && !s.youtube) {
            s.youtube = url;
        } else if (/tiktok\.com\//.test(lu) && !s.tiktok) {
            s.tiktok = url;
        } else {
            for (const [plat, re] of [
                ["github", /github\.com\//], ["yelp", /yelp\.com\/biz\//], ["pinterest", /pinterest\.com\//],
                ["vimeo", /vimeo\.com\//], ["glassdoor", /glassdoor\.com\//],
            ] as Array<[string, RegExp]>) {
                if (re.test(lu) && !s.other[plat]) s.other[plat] = url;
            }
        }
    }
    return s;
}

interface CmsSignature { name: string; html?: RegExp; header?: (h: Headers) => boolean; }

// Ordered by specificity — first match wins. Meta-generator is checked first below.
const CMS_SIGNATURES: CmsSignature[] = [
    { name: "WordPress", html: /\/wp-(content|includes)\/|\/wp-json\/|wp-emoji/i, header: h => /wordpress|wpengine/i.test(h.get("link") || "") },
    { name: "Wix", html: /static\.wixstatic\.com|wix\.com\/|_wixCssRules|X-Wix/i, header: h => !!h.get("x-wix-request-id") },
    { name: "Squarespace", html: /static1\.squarespace\.com|squarespace\.com|sqs-/i, header: h => /squarespace/i.test(h.get("server") || "") },
    { name: "Shopify", html: /cdn\.shopify\.com|myshopify\.com|Shopify\.theme/i, header: h => !!h.get("x-shopify-stage") || /shopify/i.test(h.get("powered-by") || "") },
    { name: "Webflow", html: /assets(-global)?\.website-files\.com|webflow\.(io|com)|data-wf-/i },
    { name: "GoDaddy Website Builder", html: /img1\.wsimg\.com|websitebuilder|wsb-/i },
    { name: "Weebly", html: /weebly\.com|editmysite\.com/i },
    { name: "Duda", html: /irp\.cdn-website\.com|multiscreensite\.com|dudamobile|dudaone/i },
    { name: "HubSpot CMS", html: /hs-scripts\.com|hubspotusercontent|hs-banner\.com/i },
    { name: "Joomla", html: /\/media\/jui\/|com_content|\/templates\/.+joomla/i },
    { name: "Drupal", html: /Drupal\.settings|\/sites\/(all|default)\/|drupal\.js/i },
    { name: "Jimdo", html: /jimdo\.com|jimstatic\.com/i },
    { name: "Webnode", html: /webnode\./i },
    { name: "Next.js", html: /__NEXT_DATA__|\/_next\/static\//i },
    { name: "Gatsby", html: /\/page-data\/|gatsby/i },
];

/** Detect the CMS/platform from html + response headers. */
export function detectCms(html: string | undefined, headers?: Headers): string | null {
    if (html) {
        const gen = /<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)/i.exec(html)?.[1];
        if (gen) {
            const g = gen.toLowerCase();
            if (g.includes("wordpress")) return "WordPress";
            if (g.includes("wix")) return "Wix";
            if (g.includes("squarespace")) return "Squarespace";
            if (g.includes("shopify")) return "Shopify";
            if (g.includes("webflow")) return "Webflow";
            if (g.includes("joomla")) return "Joomla";
            if (g.includes("drupal")) return "Drupal";
            if (g.includes("hubspot")) return "HubSpot CMS";
            if (g.includes("duda")) return "Duda";
            // Use the generator string verbatim (trimmed) when it's a real platform.
            return gen.split(/[0-9]/)[0].trim().slice(0, 40) || null;
        }
    }
    for (const sig of CMS_SIGNATURES) {
        if (sig.html && html && sig.html.test(html)) return sig.name;
        if (sig.header && headers && sig.header(headers)) return sig.name;
    }
    return null;
}

/**
 * Full analysis. Scans the already-scraped pages for socials; if none of them
 * carried raw html (e.g. all came back via Jina), does ONE homepage fetch so
 * CMS detection + a deeper social scan still work.
 */
export async function analyzeSiteTech(baseUrl: string, pages: FirecrawlPage[]): Promise<SiteTech> {
    const url = /^https?:\/\//i.test(baseUrl) ? baseUrl : `https://${baseUrl}`;
    let homeHtml: string | undefined = pages.find(p => p.html)?.html;
    let headers: Headers | undefined;
    if (!homeHtml) {
        try {
            const res = await fetch(url, {
                headers: { "User-Agent": "Mozilla/5.0 (compatible; CapturePilot-QuickChecker/1.0)" },
                signal: AbortSignal.timeout(10000),
                redirect: "follow",
            });
            headers = res.headers;
            if (res.ok) homeHtml = await res.text();
        } catch { /* best-effort */ }
    }
    const socials = classifySocials(gatherUrls(pages, homeHtml));
    const cms = detectCms(homeHtml, headers);
    return { socials, cms };
}
