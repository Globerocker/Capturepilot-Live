/**
 * Spam trigger word list + scoring rules for outreach deliverability.
 *
 * Each word/phrase carries a weight. The total spam score is the sum of
 * weights for every hit (case-insensitive, whole-word boundary), capped at
 * 100. The list is curated from SpamAssassin's well-known SPAM_GENERIC
 * rules + the Mailchimp / Hubspot trigger-word advisories — focused on the
 * words most likely to filter B2G cold outreach.
 *
 * Categories:
 *   - money:      cash-grab / price-bait phrases ("free money", "save big")
 *   - urgency:    high-pressure CTAs ("act now", "limited time")
 *   - shady:      sketch keywords ("no risk", "guarantee", "miracle")
 *   - financial:  loan / refi / debt phrases (gov-relevant since prospects
 *                 may run small businesses)
 *   - regulatory: words flagged by CAN-SPAM / GDPR ("this is not spam")
 *   - generic:    other high-frequency filter triggers
 *
 * Weights are tuned so a clean B2G outreach email (3-5 unintentional hits)
 * stays well under the 60 threshold, while a typical spam template
 * ("FREE!!! ACT NOW!!! Limited offer!") clears 60 easily.
 */

export type SpamCategory =
  | "money"
  | "urgency"
  | "shady"
  | "financial"
  | "regulatory"
  | "generic";

export interface SpamTriggerWord {
  word: string;
  weight: number;
  category: SpamCategory;
}

/**
 * Full trigger-word list. ~150 entries.
 * Words are matched case-insensitive, on whole-word boundary
 * (so "freedom" does NOT match "free", but "FREE!" does).
 */
export const SPAM_TRIGGER_WORDS: readonly SpamTriggerWord[] = [
  // money / price (weight 4-6)
  { word: "free money", weight: 8, category: "money" },
  { word: "extra cash", weight: 6, category: "money" },
  { word: "get paid", weight: 5, category: "money" },
  { word: "fast cash", weight: 6, category: "money" },
  { word: "easy money", weight: 7, category: "money" },
  { word: "make money", weight: 5, category: "money" },
  { word: "no cost", weight: 4, category: "money" },
  { word: "no fees", weight: 4, category: "money" },
  { word: "no investment", weight: 5, category: "money" },
  { word: "free quote", weight: 3, category: "money" },
  { word: "free trial", weight: 3, category: "money" },
  { word: "save big", weight: 4, category: "money" },
  { word: "save up to", weight: 4, category: "money" },
  { word: "lowest price", weight: 3, category: "money" },
  { word: "best price", weight: 3, category: "money" },
  { word: "discount", weight: 2, category: "money" },
  { word: "cheap", weight: 3, category: "money" },
  { word: "deal", weight: 1, category: "money" },
  { word: "double your income", weight: 7, category: "money" },
  { word: "earn extra", weight: 5, category: "money" },
  { word: "earn from home", weight: 7, category: "money" },
  { word: "income from home", weight: 7, category: "money" },
  { word: "potential earnings", weight: 5, category: "money" },
  { word: "while you sleep", weight: 6, category: "money" },
  { word: "millions", weight: 4, category: "money" },
  { word: "billion", weight: 3, category: "money" },
  { word: "cash bonus", weight: 5, category: "money" },
  { word: "$$$", weight: 6, category: "money" },

  // urgency (weight 4-7)
  { word: "act now", weight: 7, category: "urgency" },
  { word: "act fast", weight: 7, category: "urgency" },
  { word: "apply now", weight: 4, category: "urgency" },
  { word: "buy now", weight: 5, category: "urgency" },
  { word: "call now", weight: 5, category: "urgency" },
  { word: "click here", weight: 4, category: "urgency" },
  { word: "click below", weight: 4, category: "urgency" },
  { word: "do it today", weight: 5, category: "urgency" },
  { word: "don't delete", weight: 6, category: "urgency" },
  { word: "don't miss", weight: 4, category: "urgency" },
  { word: "expires", weight: 3, category: "urgency" },
  { word: "expiring", weight: 3, category: "urgency" },
  { word: "for only", weight: 3, category: "urgency" },
  { word: "get it now", weight: 5, category: "urgency" },
  { word: "hurry", weight: 4, category: "urgency" },
  { word: "instant", weight: 3, category: "urgency" },
  { word: "limited time", weight: 5, category: "urgency" },
  { word: "limited offer", weight: 5, category: "urgency" },
  { word: "now only", weight: 4, category: "urgency" },
  { word: "offer expires", weight: 5, category: "urgency" },
  { word: "only today", weight: 5, category: "urgency" },
  { word: "order now", weight: 5, category: "urgency" },
  { word: "today only", weight: 5, category: "urgency" },
  { word: "while supplies last", weight: 5, category: "urgency" },
  { word: "urgent", weight: 4, category: "urgency" },
  { word: "you have been selected", weight: 6, category: "urgency" },

  // shady (weight 5-8)
  { word: "100% free", weight: 6, category: "shady" },
  { word: "100% guaranteed", weight: 7, category: "shady" },
  { word: "100% off", weight: 7, category: "shady" },
  { word: "100% satisfied", weight: 5, category: "shady" },
  { word: "all natural", weight: 4, category: "shady" },
  { word: "amazing", weight: 2, category: "shady" },
  { word: "be amazed", weight: 3, category: "shady" },
  { word: "believe me", weight: 3, category: "shady" },
  { word: "best deal", weight: 3, category: "shady" },
  { word: "congratulations", weight: 5, category: "shady" },
  { word: "guarantee", weight: 4, category: "shady" },
  { word: "guaranteed", weight: 4, category: "shady" },
  { word: "incredible deal", weight: 5, category: "shady" },
  { word: "miracle", weight: 6, category: "shady" },
  { word: "no catch", weight: 5, category: "shady" },
  { word: "no gimmick", weight: 5, category: "shady" },
  { word: "no obligation", weight: 4, category: "shady" },
  { word: "no purchase necessary", weight: 5, category: "shady" },
  { word: "no questions asked", weight: 6, category: "shady" },
  { word: "no risk", weight: 5, category: "shady" },
  { word: "no strings attached", weight: 5, category: "shady" },
  { word: "once in a lifetime", weight: 6, category: "shady" },
  { word: "prize", weight: 4, category: "shady" },
  { word: "promise you", weight: 4, category: "shady" },
  { word: "risk free", weight: 5, category: "shady" },
  { word: "risk-free", weight: 5, category: "shady" },
  { word: "satisfaction guaranteed", weight: 5, category: "shady" },
  { word: "winner", weight: 5, category: "shady" },
  { word: "won't believe", weight: 4, category: "shady" },
  { word: "you've been selected", weight: 6, category: "shady" },
  { word: "snake oil", weight: 7, category: "shady" },
  { word: "weight loss", weight: 6, category: "shady" },
  { word: "lose weight", weight: 6, category: "shady" },
  { word: "viagra", weight: 10, category: "shady" },
  { word: "cialis", weight: 10, category: "shady" },
  { word: "pharmacy", weight: 5, category: "shady" },

  // financial (weight 4-7)
  { word: "bad credit", weight: 6, category: "financial" },
  { word: "credit check", weight: 4, category: "financial" },
  { word: "credit repair", weight: 6, category: "financial" },
  { word: "debt", weight: 3, category: "financial" },
  { word: "eliminate debt", weight: 6, category: "financial" },
  { word: "financial freedom", weight: 6, category: "financial" },
  { word: "get out of debt", weight: 6, category: "financial" },
  { word: "loan approved", weight: 6, category: "financial" },
  { word: "lower interest rate", weight: 5, category: "financial" },
  { word: "lower monthly payment", weight: 5, category: "financial" },
  { word: "no credit check", weight: 7, category: "financial" },
  { word: "pre-approved", weight: 5, category: "financial" },
  { word: "pre-qualified", weight: 5, category: "financial" },
  { word: "refinance", weight: 4, category: "financial" },
  { word: "stop foreclosure", weight: 7, category: "financial" },
  { word: "mortgage rates", weight: 5, category: "financial" },
  { word: "lowest insurance rates", weight: 5, category: "financial" },

  // regulatory triggers (weight 5-8)
  { word: "this is not spam", weight: 8, category: "regulatory" },
  { word: "this is not a scam", weight: 8, category: "regulatory" },
  { word: "not junk", weight: 6, category: "regulatory" },
  { word: "remove subject", weight: 5, category: "regulatory" },
  { word: "remove in subject", weight: 5, category: "regulatory" },
  { word: "as seen on", weight: 4, category: "regulatory" },
  { word: "as seen on tv", weight: 5, category: "regulatory" },
  { word: "bulk email", weight: 6, category: "regulatory" },
  { word: "mass email", weight: 6, category: "regulatory" },
  { word: "direct email", weight: 4, category: "regulatory" },
  { word: "direct marketing", weight: 4, category: "regulatory" },
  { word: "opt in", weight: 3, category: "regulatory" },
  { word: "opt-in", weight: 3, category: "regulatory" },
  { word: "removal instructions", weight: 4, category: "regulatory" },
  { word: "subscribe now", weight: 3, category: "regulatory" },

  // generic high-frequency triggers (weight 1-3)
  { word: "free", weight: 2, category: "generic" },
  { word: "cash", weight: 2, category: "generic" },
  { word: "buy", weight: 1, category: "generic" },
  { word: "offer", weight: 1, category: "generic" },
  { word: "promo", weight: 2, category: "generic" },
  { word: "promotion", weight: 1, category: "generic" },
  { word: "sale", weight: 1, category: "generic" },
  { word: "savings", weight: 1, category: "generic" },
  { word: "winner", weight: 4, category: "generic" },
  { word: "consolidate", weight: 3, category: "generic" },
  { word: "increase sales", weight: 3, category: "generic" },
  { word: "increase traffic", weight: 3, category: "generic" },
  { word: "marketing solutions", weight: 3, category: "generic" },
  { word: "more internet traffic", weight: 4, category: "generic" },
  { word: "performance", weight: 1, category: "generic" },
  { word: "potential customers", weight: 2, category: "generic" },
  { word: "search engine optimization", weight: 3, category: "generic" },
  { word: "social security number", weight: 6, category: "generic" },
  { word: "your bills", weight: 3, category: "generic" },
  { word: "casino", weight: 6, category: "generic" },
  { word: "lottery", weight: 6, category: "generic" },
  { word: "winner!", weight: 5, category: "generic" },
  { word: "porn", weight: 10, category: "generic" },
  { word: "xxx", weight: 8, category: "generic" },
  { word: "cure", weight: 4, category: "generic" },
  { word: "diet", weight: 3, category: "generic" },
  { word: "supplement", weight: 3, category: "generic" },
];

/**
 * Subject-line patterns that aggressively trip filters even when no
 * individual word does. Matched as case-insensitive substrings.
 */
export const SUBJECT_RED_FLAGS: readonly { pattern: RegExp; weight: number; reason: string }[] = [
  { pattern: /^\s*re:\s*re:/i, weight: 8, reason: "Fake 'Re: Re:' prefix" },
  { pattern: /^\s*fwd?:\s*fwd?:/i, weight: 7, reason: "Fake 'Fwd: Fwd:' prefix" },
  { pattern: /\$\$+/, weight: 6, reason: "Multiple dollar signs in subject" },
  { pattern: /!{2,}/, weight: 6, reason: "Multiple exclamation marks in subject" },
  { pattern: /\?{2,}/, weight: 4, reason: "Multiple question marks in subject" },
  { pattern: /\*{2,}/, weight: 5, reason: "Wrapped in asterisks" },
];

/**
 * Body-level structural rules. Run AFTER word scan.
 */
export interface BodyRuleResult {
  weight: number;
  reason: string;
}

export function bodyStructuralRules(body: string): BodyRuleResult[] {
  const hits: BodyRuleResult[] = [];
  const trimmed = body.trim();
  if (!trimmed) return hits;

  // 1. excessive caps (ignoring whitespace/punctuation)
  const letters = trimmed.replace(/[^A-Za-z]/g, "");
  if (letters.length >= 40) {
    const upper = letters.replace(/[^A-Z]/g, "").length;
    const ratio = upper / letters.length;
    if (ratio > 0.45) {
      hits.push({
        weight: Math.round((ratio - 0.4) * 60),
        reason: `Body is ${Math.round(ratio * 100)}% capital letters`,
      });
    }
  }

  // 2. excessive exclamation marks
  const bangs = (trimmed.match(/!/g) || []).length;
  if (bangs >= 5) {
    hits.push({
      weight: Math.min(10, bangs - 2),
      reason: `Body contains ${bangs} exclamation marks`,
    });
  }

  // 3. all caps "shouting" lines
  const lines = trimmed.split(/\n+/);
  const shoutingLines = lines.filter(
    (l) => l.length >= 12 && l === l.toUpperCase() && /[A-Z]/.test(l)
  ).length;
  if (shoutingLines >= 2) {
    hits.push({
      weight: Math.min(15, shoutingLines * 3),
      reason: `${shoutingLines} lines in ALL CAPS`,
    });
  }

  // 4. missing unsubscribe link — CAN-SPAM requirement for commercial email
  const lower = trimmed.toLowerCase();
  const hasUnsub =
    /\bunsubscribe\b/.test(lower) ||
    /\bopt[-\s]?out\b/.test(lower) ||
    /\bremove me\b/.test(lower) ||
    /\bemail preferences\b/.test(lower) ||
    /\bmanage preferences\b/.test(lower);
  if (!hasUnsub) {
    hits.push({
      weight: 12,
      reason: "Missing unsubscribe link (CAN-SPAM violation)",
    });
  }

  // 5. missing physical mailing address — CAN-SPAM also requires this
  // We look for any line that smells like an address (digits + state-ish suffix
  // or a zip code), since the merge tag is filled in at send time.
  const hasAddress =
    /\b\d{1,5}\s+\w+(?:\s+\w+){0,5}\s+(?:street|st\b|avenue|ave\b|road|rd\b|blvd\b|drive|dr\b|suite|ste\b|po box)/i.test(
      trimmed
    ) ||
    /\b[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/.test(trimmed) ||
    /\{\{\s*sender_address\s*\}\}/i.test(trimmed) ||
    /\{\{\s*company_address\s*\}\}/i.test(trimmed);
  if (!hasAddress) {
    hits.push({
      weight: 10,
      reason: "Missing physical mailing address (CAN-SPAM violation)",
    });
  }

  // 6. suspicious link patterns — bit.ly etc + raw IPs + .ru / .tk hosts
  const links = trimmed.match(/https?:\/\/[^\s)]+/gi) || [];
  for (const link of links) {
    if (/https?:\/\/(?:bit\.ly|tinyurl\.com|t\.co|goo\.gl|ow\.ly|buff\.ly)/i.test(link)) {
      hits.push({
        weight: 6,
        reason: `Shortened URL (${link.split("/")[2]}) — shortened links hide destination`,
      });
      break; // one mention is enough
    }
    if (/https?:\/\/\d+\.\d+\.\d+\.\d+/.test(link)) {
      hits.push({ weight: 12, reason: "Raw IP address as link" });
      break;
    }
    if (/\.(?:ru|tk|ml|ga|cf|gq)\b/i.test(link)) {
      hits.push({ weight: 8, reason: "Link to high-spam TLD" });
      break;
    }
  }

  // 7. too many links
  if (links.length > 6) {
    hits.push({
      weight: Math.min(10, links.length - 4),
      reason: `${links.length} links — keep cold outreach under 4`,
    });
  }

  // 8. image-only / very short body
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  if (wordCount < 20) {
    hits.push({
      weight: 6,
      reason: `Body is only ${wordCount} words — too short, looks like an image-only spam payload`,
    });
  }

  return hits;
}
