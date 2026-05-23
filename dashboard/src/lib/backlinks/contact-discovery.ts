/**
 * Scrape contact pages for a prospect domain — the no-Apollo fallback.
 *
 * Strategy:
 *   1. Fetch homepage + /contact + /about + /team (whichever return 200)
 *   2. Run the existing crawler's email/phone regex on the combined HTML
 *   3. Filter out junk addresses (noreply@, info@, marketing@ — keep them
 *      separately as "general inbox" tier, not editor tier)
 *   4. If LinkedIn /company/<slug> link is in the page, store it for the
 *      human to handle (LinkedIn outreach is manual)
 */

import { EMAIL_RE, JUNK_EMAIL_DOMAINS } from "@/lib/crawler/config";

const PATHS_TO_TRY = ["", "/contact", "/contact-us", "/about", "/about-us", "/team", "/staff", "/editorial-team", "/contributors"];
const HTTP_TIMEOUT_MS = 8000;

const GENERAL_INBOX_LOCAL_PARTS = new Set([
  "info", "hello", "contact", "support", "help", "admin",
  "press", "media", "pr", "marketing", "team", "office",
  "noreply", "no-reply", "donotreply",
]);

const EDITOR_KEYWORDS = ["editor", "editorial", "writer", "contributor", "journalist", "reporter"];
const PR_KEYWORDS = ["press", "media", "pr@", "publicrelations"];

export interface DiscoveredContact {
  email: string;
  full_name: string | null;
  role: "editor" | "pr" | "general_inbox" | "unknown";
  source: string;
}

interface PageFetch {
  url: string;
  html: string;
}

async function fetchPage(url: string): Promise<PageFetch | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), HTTP_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0 (CapturePilot Backlink Bot; +https://capturepilot.com/bot)",
        "accept": "text/html,application/xhtml+xml",
      },
      signal: ctrl.signal,
      redirect: "follow",
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("text/html") && !ct.includes("application/xhtml")) return null;
    const text = await res.text();
    return { url, html: text.slice(0, 250_000) };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function classifyEmail(email: string): DiscoveredContact["role"] {
  const local = email.split("@")[0]?.toLowerCase() ?? "";
  if (EDITOR_KEYWORDS.some(k => local.includes(k))) return "editor";
  if (PR_KEYWORDS.some(k => local.includes(k))) return "pr";
  if (GENERAL_INBOX_LOCAL_PARTS.has(local)) return "general_inbox";
  // First.last or first-initial.last patterns are usually real humans.
  if (/^[a-z]+[._-][a-z]+$/.test(local)) return "unknown";
  return "unknown";
}

function isJunkEmail(email: string): boolean {
  const dom = email.split("@")[1]?.toLowerCase();
  if (!dom) return true;
  return JUNK_EMAIL_DOMAINS.has(dom);
}

function nearbyName(html: string, email: string): string | null {
  // Best-effort: grab 80 chars before the email match and pull the rightmost
  // Capitalized Word + Word sequence (likely the person's name).
  const idx = html.toLowerCase().indexOf(email.toLowerCase());
  if (idx <= 0) return null;
  const window = html.slice(Math.max(0, idx - 200), idx).replace(/<[^>]+>/g, " ");
  const matches = [...window.matchAll(/([A-Z][a-z]+(?:\s+[A-Z][a-z'-]+){1,2})/g)];
  if (matches.length === 0) return null;
  return matches[matches.length - 1][1];
}

export async function discoverContacts(domain: string): Promise<DiscoveredContact[]> {
  const base = domain.startsWith("http") ? domain.replace(/\/$/, "") : `https://${domain}`;
  const pages = await Promise.all(PATHS_TO_TRY.map(p => fetchPage(base + p)));

  const found = new Map<string, DiscoveredContact>();
  for (const page of pages) {
    if (!page) continue;
    const matches = [...page.html.matchAll(EMAIL_RE)];
    for (const m of matches) {
      const raw = m[0].toLowerCase();
      // Domain-mismatch filter: only keep emails whose domain matches the
      // prospect (or a subdomain of it). Otherwise we'd grab every third-
      // party email mentioned on the page.
      const emailDom = raw.split("@")[1];
      if (!emailDom) continue;
      if (!emailDom.endsWith(domain.replace(/^www\./, ""))) continue;
      if (isJunkEmail(raw)) continue;
      if (found.has(raw)) continue;

      found.set(raw, {
        email: raw,
        full_name: nearbyName(page.html, raw),
        role: classifyEmail(raw),
        source: page.url,
      });
    }
  }

  // Sort: editor > pr > unknown > general_inbox
  const order: Record<DiscoveredContact["role"], number> = { editor: 0, pr: 1, unknown: 2, general_inbox: 3 };
  return [...found.values()].sort((a, b) => order[a.role] - order[b.role]);
}

/**
 * Guess plausible emails when scraping returns nothing.
 * Returns up to 3 candidates flagged email_confidence='guessed' so the human
 * knows to verify before sending.
 */
export function guessEmailPatterns(domain: string): string[] {
  const clean = domain.replace(/^www\./, "");
  return [
    `editor@${clean}`,
    `editorial@${clean}`,
    `tips@${clean}`,
  ];
}
