/**
 * One-click unsubscribe links for the outreach_contacts cadence.
 *
 * The legacy prospect path used a per-row unsubscribe_token. The contacts
 * engine has no token, so we sign the recipient's email with an HMAC and embed
 * email+sig in the link. The handler verifies the signature before opting out,
 * so a link can't be forged to unsubscribe an arbitrary address you don't know
 * the email of — and opting out is the only thing it can do anyway.
 */
import { createHmac } from "node:crypto";

const SECRET =
    process.env.OUTREACH_UNSUB_SECRET ||
    process.env.CRON_SECRET ||
    process.env.SUPABASE_SERVICE_KEY ||
    "dev-unsub-secret";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.capturepilot.com";

export function signEmail(email: string): string {
    return createHmac("sha256", SECRET)
        .update(email.toLowerCase().trim())
        .digest("hex")
        .slice(0, 32);
}

export function verifyEmailSig(email: string, sig: string): boolean {
    if (!email || !sig) return false;
    return signEmail(email) === sig;
}

export function unsubscribeUrl(email: string): string {
    const e = (email || "").toLowerCase().trim();
    if (!e) return `${APP_URL}/unsubscribed`;
    return `${APP_URL}/api/outreach/unsubscribe?email=${encodeURIComponent(e)}&sig=${signEmail(e)}`;
}
