/**
 * Phone + email validation + deduplication helpers.
 *
 * Replaces the bare regex-only extraction in src/lib/crawler/config.ts —
 * libphonenumber-js parses real numbers instead of every 10-digit string,
 * and email-addresses enforces RFC 5322 instead of a naive pattern.
 */

import { parsePhoneNumberFromString, AsYouType } from "libphonenumber-js";
import { parseOneAddress } from "email-addresses";

const JUNK_EMAIL_DOMAINS = new Set([
    "example.com", "example.org", "test.com", "domain.com", "yourdomain.com",
    "email.com", "sentry.io", "sentry-next.wixpress.com", "wixpress.com",
    "wix.com", "cloudflare.com", "google-analytics.com", "googletagmanager.com",
    "facebook.com", "fbcdn.net", "sentry.wixpress.com", "intercom.io",
    "hubspot.com", "mailchimp.com", "constantcontact.com",
]);

// Patterns that look like phone numbers but usually aren't — invoice #s, part #s, etc.
const PHONE_PATTERN = /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}(?:\s*(?:ext|x|extension)\.?\s*\d+)?/gi;
// Emails without surrounding HTML entities
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

export interface ValidPhone {
    raw: string;
    e164: string;
    national: string;
    country: string;
    type?: "fixed_line" | "mobile" | "toll_free" | "voip" | "other";
}

export interface ValidEmail {
    raw: string;
    normalized: string;
    local: string;
    domain: string;
}

/** Pull all valid E.164 phones out of text, dedup, and tag by inferred type. */
export function extractPhones(text: string, defaultCountry: "US" | "DE" | "GB" = "US"): ValidPhone[] {
    if (!text) return [];
    const seen = new Map<string, ValidPhone>();
    const matches = text.match(PHONE_PATTERN) || [];

    for (const raw of matches) {
        const trimmed = raw.trim();
        // Skip clearly-not-phone strings
        if (trimmed.length < 10) continue;
        if (/^\d{4,}-\d{4,}$/.test(trimmed) && trimmed.length > 14) continue; // invoice / part no
        // libphonenumber's min build throws "Cannot read 'hasOwnProperty' of undefined"
        // when the input is exotic (mixed unicode, special chars). Wrap so the whole
        // extractor doesn't take the runDeepExtract pipeline down with it.
        let parsed;
        try {
            parsed = parsePhoneNumberFromString(trimmed, defaultCountry);
        } catch {
            continue;
        }
        if (!parsed || !parsed.isValid()) continue;
        const e164 = parsed.number;
        if (seen.has(e164)) continue;
        // libphonenumber types: FIXED_LINE, MOBILE, FIXED_LINE_OR_MOBILE, TOLL_FREE, VOIP, ...
        const nt = parsed.getType();
        const type: ValidPhone["type"] =
            nt === "MOBILE" ? "mobile" :
            nt === "FIXED_LINE" || nt === "FIXED_LINE_OR_MOBILE" ? "fixed_line" :
            nt === "TOLL_FREE" ? "toll_free" :
            nt === "VOIP" ? "voip" : "other";
        seen.set(e164, {
            raw: trimmed,
            e164,
            national: parsed.formatNational(),
            country: parsed.country || defaultCountry,
            type,
        });
    }
    return [...seen.values()];
}

/** Pull all RFC-5322-valid emails out of text, dedup, and filter out tracker/library noise. */
export function extractEmails(text: string): ValidEmail[] {
    if (!text) return [];
    const seen = new Map<string, ValidEmail>();
    const matches = text.match(EMAIL_PATTERN) || [];

    for (const raw of matches) {
        const parsed = parseOneAddress(raw) as { local?: string; domain?: string; address?: string } | null;
        if (!parsed || !parsed.address) continue;
        const addr = parsed.address.toLowerCase();
        const domain = (parsed.domain || "").toLowerCase();
        if (!domain || JUNK_EMAIL_DOMAINS.has(domain)) continue;
        // Filter out long hash-like local parts (tracker pixels, JWTs embedded in URLs)
        const local = (parsed.local || "").toLowerCase();
        if (local.length > 40) continue;
        if (/^[a-f0-9]{16,}$/.test(local)) continue;
        if (seen.has(addr)) continue;
        seen.set(addr, { raw: raw.trim(), normalized: addr, local, domain });
    }
    return [...seen.values()];
}

/** Format a phone number for human display. Falls back to the raw input if parsing fails. */
export function formatPhone(raw: string, defaultCountry: "US" | "DE" | "GB" = "US"): string {
    if (!raw) return "";
    const parsed = parsePhoneNumberFromString(raw, defaultCountry);
    if (parsed && parsed.isValid()) return parsed.formatNational();
    return new AsYouType(defaultCountry).input(raw);
}
