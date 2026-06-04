"use client";

/**
 * HubSpot Conversations chat widget loader.
 *
 * Drops the HubSpot Messages script into the page so visitors get a chat
 * bubble bottom-right. The bot is configured in HubSpot itself (
 * Marketing → Chatflows) — start with a simple "Hi! How can we help?"
 * flow that branches into:
 *   - "I want a demo" → routes to sales (creates an email-based deal)
 *   - "I have a feature request" → routes to support (creates a ticket
 *     tagged 48hr_sla)
 *   - "Pricing question" → bot replies with link to /pricing
 *
 * The widget identifies the visitor when they're logged in, so we get
 * per-user chat history in HubSpot CRM. For anonymous visitors it just
 * cookies them.
 *
 * Loads only after the React tree mounts (no SSR) to avoid hydration
 * warnings about the injected DOM.
 */

import { useEffect } from "react";

const PORTAL_ID = process.env.NEXT_PUBLIC_HUBSPOT_PORTAL_ID;

interface Props {
    /** When set, identifies the logged-in user to HubSpot Conversations
     *  so chat history shows up in CRM under that contact. */
    userEmail?: string | null;
    /** Optional contact ID to pre-populate (when known). */
    hubspotContactId?: string | null;
}

export default function HubSpotChat({ userEmail, hubspotContactId }: Props) {
    useEffect(() => {
        if (!PORTAL_ID) {
            console.warn("[HubSpotChat] NEXT_PUBLIC_HUBSPOT_PORTAL_ID unset — chat widget disabled.");
            return;
        }
        // Avoid loading twice (e.g. across nav transitions in App Router).
        if (document.getElementById("hs-script-loader")) return;

        // Identify visitor BEFORE the script loads so the first chat events
        // already carry the user context.
        if (userEmail) {
            (window as unknown as Record<string, unknown>)._hsq = (window as unknown as { _hsq?: unknown[] })._hsq || [];
            const hsq = (window as unknown as { _hsq: unknown[][] })._hsq;
            hsq.push(["identify", { email: userEmail, ...(hubspotContactId ? { id: hubspotContactId } : {}) }]);
        }

        const s = document.createElement("script");
        s.id = "hs-script-loader";
        s.async = true;
        s.defer = true;
        s.src = `https://js-na1.hs-scripts.com/${PORTAL_ID}.js`;
        document.body.appendChild(s);
    }, [userEmail, hubspotContactId]);

    return null; // renders nothing — widget is HubSpot-injected
}
