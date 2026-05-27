"use client";

import { useEffect } from "react";

/**
 * Capture Meta's `fbclid` URL param into the `_fbc` cookie on landing.
 *
 * Meta's Pixel does this itself once it loads, but capture-on-mount has two
 * upsides:
 *   - If a visitor bounces before fbevents.js finishes loading (ad blocker,
 *     slow connection), we still have fbc for any later server-side CAPI.
 *   - The cookie is set on the root domain (`.capturepilot.com`) so it's
 *     shared between www and app subdomains — clicking an ad → landing on
 *     www → continuing to app preserves attribution.
 *
 * Cookie format per Meta docs:
 *   _fbc = fb.{subdomainIndex}.{creationTimeMs}.{fbclid}
 *
 * subdomainIndex = 1 for "www.capturepilot.com" / "app.capturepilot.com"
 * (one subdomain level under the root).
 *
 * Mount once in the root layout; no per-route logic needed.
 */
export default function FbclidCapture() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fbclid = params.get("fbclid");
    if (!fbclid) return;

    // Already have a non-stale _fbc? Don't overwrite — preserves earlier
    // attribution if the visitor opens a fresh ad-link in the same session.
    const existing = document.cookie.split(";").find((c) => c.trim().startsWith("_fbc="));
    if (existing) return;

    const value = `fb.1.${Date.now()}.${fbclid}`;
    // Set on root domain so app + www share it. 90-day expiry matches Meta's
    // own _fbc default.
    const expires = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toUTCString();
    const rootDomain = window.location.hostname.split(".").slice(-2).join(".");
    document.cookie = `_fbc=${value}; domain=.${rootDomain}; path=/; expires=${expires}; SameSite=Lax; Secure`;
  }, []);

  return null;
}
