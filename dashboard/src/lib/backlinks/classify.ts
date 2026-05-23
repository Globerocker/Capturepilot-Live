/**
 * Tier + category + spam classification for a referring domain.
 *
 * We don't want junk in the pipeline (Moldova directory farms, "all-aged-
 * domains.com", honeypot blogspots), AND we don't want to over-promise on
 * unreachable press (yahoo.com, nytimes.com). Both ends get filtered out
 * before a human sees the prospect.
 */

import type { RefDomainRow } from "./semrush";

export type Category =
  | "editorial"
  | "directory"
  | "association"
  | "comparison"
  | "asset"
  | "press_unreachable"
  | "spam"
  | "unknown";

export interface Classification {
  tier: 1 | 2 | 3 | 4 | 5;
  category: Category;
  reason: string;
  isSpam: boolean;
}

// ----- spam patterns we've actually seen on capturepilot.com refdomains ---
const SPAM_IPS = new Set([
  "195.20.19.178", // Moldova directory-farm host (>15 of our 90 refdomains)
]);

const SPAM_DOMAIN_PATTERNS = [
  /\.shop$/,
  /\.top$/,
  /\.cloud$/,
  /\.party$/,
  /\.cyou$/,
  /\.click$/,
  /\.xyz$/,
  /^all-aged-domains\./,
  /^all[a-z]*directory\./,
  /^[a-z]+websites?\./,
  /^check[a-z]*backlinks?\./,
  /^backlinks-checker\./,
  /^website[a-z]*stats?\./,
  /^getwebsiteworth\./,
  /^domainanalysis\./,
  /^domainsc?\./,
  /^seoflox\./,
  /^anchorurl\./,
  /^analyticshaven\./,
  /^optimizeflow\./,
  /^dailymusings\./,
  /^metamagic\./,
  /^cheapsmm/,
  /^fiverr-/,
  /^free[a-z]*backlinks?\./,
  /\.blogspot\.com$/,
  /\.pages\.dev$/,
  /freemyip\.com$/,
  /loseyourip\.net$/,
  /bounceme\.net$/,
];

// Press domains we'll never realistically pitch — they only link if they
// scrape us or we land a wire release. Filter so the team doesn't waste cycles.
const UNREACHABLE_PRESS = new Set([
  "yahoo.com", "bbc.com", "bbc.co.uk", "nytimes.com", "wikipedia.org",
  "cnn.com", "theguardian.com", "forbes.com", "wired.com", "reuters.com",
  "washingtonpost.com", "independent.co.uk", "cbsnews.com", "nature.com",
  "axios.com", "nasa.gov", "stackoverflow.com", "github.com", "google.com",
  "microsoft.com", "amazon.com", "rollingstone.com", "newsweek.com",
  "time.com", "nbcnews.com", "abcnews.com", "abcnews.go.com", "businessinsider.com",
  "ouest-france.fr", "uol.com.br", "rbc.ru", "rambler.ru", "namu.wiki",
  "yandex.com", "yandex.ru", "ya.ru", "alibaba.com", "amazonaws.com",
  "substack.com", // root substack only — individual newsletters are editorial
  "medium.com",   // root medium — individual publications are editorial
  "linktr.ee", "bit.ly", "bing.com", "duckduckgo.com",
  "xnxx.com", "pornhub.com", // adult — never want a backlink
]);

// Editorial / niche GovCon allowlist — these get auto Tier-1.
const TIER1_EDITORIAL = new Set([
  "federalnewsnetwork.com", "fedscoop.com", "nextgov.com",
  "washingtontechnology.com", "executivebiz.com", "govconwire.com",
  "govconexec.com", "smallgovcon.com", "govology.com",
  "setasidealert.com", "bgov.com", "govexec.com",
  "fcw.com", "meritalk.com", "federalsoup.com",
  "federalcomputerweek.com", "homelandsecuritynewswire.com",
  "defenseone.com", "breakingdefense.com", "thedrive.com",
  "fedhealthit.com", "gcn.com", "govloop.com",
  "thefederalist.com", "fedweek.com", "federaltimes.com",
]);

// Industry associations — Tier 2.
const TIER2_ASSOCIATIONS = new Set([
  "ndia.org", "afcea.org", "ncmahq.org", "apexaccelerators.us",
  "sba.gov", "gsa.gov", "acquisitioninnovation.gov", "ptac-us.org",
  "wipp.org", "nawbo.org", "nvbdc.org", "vetbiz.va.gov",
  "govevents.com", "actiac.org", "psc.org",
]);

// SaaS comparison / directories — Tier 3.
const TIER3_COMPARISON = new Set([
  "g2.com", "capterra.com", "getapp.com", "softwareadvice.com",
  "sourceforge.net", "producthunt.com", "alternativeto.net",
  "slashdot.org", "theresanaiforthat.com", "futurepedia.io",
  "aitools.fyi", "saashub.com", "stackshare.io",
]);

function matchesAny(haystack: string, patterns: RegExp[]): boolean {
  return patterns.some(p => p.test(haystack));
}

export function classify(row: RefDomainRow): Classification {
  const d = row.domain.toLowerCase();

  // Spam — IP-based
  if (row.ip && SPAM_IPS.has(row.ip)) {
    return { tier: 5, category: "spam", reason: `Moldova directory-farm IP ${row.ip}`, isSpam: true };
  }
  // Spam — pattern-based
  if (matchesAny(d, SPAM_DOMAIN_PATTERNS)) {
    return { tier: 5, category: "spam", reason: `Domain matches spam pattern`, isSpam: true };
  }
  // Spam — extremely low authority + non-real TLD combo
  if (row.domain_score < 5 && /\.(info|biz|in|cn|ru|md)$/.test(d) && row.domain_trust_score < 5) {
    return { tier: 5, category: "spam", reason: `AS<5 + trust<5 + low-trust TLD`, isSpam: true };
  }

  // Unreachable press — filtered, not chased
  if (UNREACHABLE_PRESS.has(d)) {
    return {
      tier: 4,
      category: "press_unreachable",
      reason: `Major press / scraped — never reply to cold pitches`,
      isSpam: false,
    };
  }

  // Tier 1 — niche editorial
  if (TIER1_EDITORIAL.has(d)) {
    return { tier: 1, category: "editorial", reason: `Allowlist: gov-contracting niche editorial`, isSpam: false };
  }
  // Tier 2 — associations & gov sites
  if (TIER2_ASSOCIATIONS.has(d) || d.endsWith(".gov") || d.endsWith(".mil")) {
    return { tier: 2, category: "association", reason: `Industry assoc / government domain`, isSpam: false };
  }
  // Tier 3 — comparison sites
  if (TIER3_COMPARISON.has(d)) {
    return { tier: 3, category: "comparison", reason: `SaaS comparison / review directory`, isSpam: false };
  }
  // Tier 3 — university press, generally editorial-friendly + high AS
  if (d.endsWith(".edu") && row.domain_score >= 60) {
    return { tier: 3, category: "editorial", reason: `.edu w/ AS≥60`, isSpam: false };
  }

  // Heuristic catch-all by authority score
  if (row.domain_score >= 60) {
    return { tier: 2, category: "unknown", reason: `Unclassified high-authority (AS ${row.domain_score})`, isSpam: false };
  }
  if (row.domain_score >= 30) {
    return { tier: 3, category: "unknown", reason: `Mid-authority (AS ${row.domain_score})`, isSpam: false };
  }
  return { tier: 4, category: "unknown", reason: `Low-authority (AS ${row.domain_score}) — long tail`, isSpam: false };
}
