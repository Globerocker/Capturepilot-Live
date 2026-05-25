"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { getCookieConsent } from "./CookieConsent";
import { track } from "@/lib/analytics";

/**
 * Maximum-data Meta Pixel instrumentation. Mounts once globally (via root
 * layout) and:
 *
 *   1. Fires PageView on every Next.js route change (the bare fbq init only
 *      fires once on initial load — SPA navigation needs this).
 *   2. Tracks button/link clicks with the visible button label as
 *      `content_name`. Helps Meta correlate which CTAs drive conversion.
 *   3. Fires scroll-depth milestones (25 / 50 / 75 / 100 %) as ViewContent
 *      custom events. Soft-conversion signal for low-intent visitors.
 *   4. Fires a `TimeOnPage` custom event after 30 s + 60 s + 120 s. Another
 *      soft-conversion signal.
 *
 * All of this is GATED on cookie consent. Without consent the component
 * is inert — no listeners attached, no requests fired.
 *
 * The script tag itself lives in MetaPixel.tsx (this component does NOT
 * load the SDK — it only instruments it once it's loaded).
 */
export default function PixelInstrumentation() {
    const pathname = usePathname();
    const searchParams = useSearchParams();

    // ─── 1. Route-change PageView ──────────────────────────────────────────
    useEffect(() => {
        if (typeof window === "undefined") return;
        if (getCookieConsent() !== "accepted_all") return;
        const fbq = (window as unknown as { fbq?: (...args: unknown[]) => void }).fbq;
        if (!fbq) return;
        // Skip the first fire because the inline init already did PageView.
        // We track every subsequent route change here.
        const isFirstFire = (window as unknown as { __cp_pv_fired?: boolean }).__cp_pv_fired !== true;
        if (isFirstFire) {
            (window as unknown as { __cp_pv_fired?: boolean }).__cp_pv_fired = true;
            return;
        }
        fbq("track", "PageView", {
            page_path: pathname,
            page_search: searchParams?.toString() || "",
        });
    }, [pathname, searchParams]);

    // ─── 2. Click delegation, 3. Scroll depth, 4. Time on page, 5. Engagement threshold ──
    useEffect(() => {
        if (typeof window === "undefined") return;
        if (getCookieConsent() !== "accepted_all") return;
        const fbq = (window as unknown as { fbq?: (...args: unknown[]) => void }).fbq;
        if (!fbq) return;

        // Engagement threshold: 5+ button-clicks in a single browser session
        // → emit "EngagedUser" custom event ONCE. Strong soft-conversion
        // signal — these visitors are far more likely to come back and convert.
        const SESSION_KEY = "cp_click_count";
        const ENGAGED_KEY = "cp_engaged_fired";
        const ENGAGEMENT_THRESHOLD = 5;
        const getCount = () => parseInt(sessionStorage.getItem(SESSION_KEY) || "0", 10);

        // Click delegation — any <button>, <a>, or element with data-cp-track
        // fires a custom "ButtonClick" trackCustom. We capture the visible
        // text + role + href so Meta sees which CTA drove the action.
        const onClick = (e: MouseEvent) => {
            const target = (e.target as HTMLElement | null)?.closest?.(
                "button, a, [data-cp-track]",
            ) as HTMLElement | null;
            if (!target) return;
            const tag = target.tagName.toLowerCase();
            const label = (target.getAttribute("data-cp-track")
                || target.getAttribute("aria-label")
                || target.textContent
                || "")
                .trim()
                .slice(0, 80);
            const href = (target as HTMLAnchorElement).href || "";

            // Special-case: any link to /contact or labeled "Contact" →
            // emit Standard Event "Contact". Helps the ad account
            // optimize on this specific intent signal.
            if (/^\/?contact(\/|$)/i.test(href.replace(/^https?:\/\/[^/]+/, ""))
                || /^contact/i.test(label)) {
                fbq("track", "Contact", { source: window.location.pathname, content_name: label });
            }

            fbq("trackCustom", "ButtonClick", {
                content_name: label,
                element: tag,
                href,
                page_path: window.location.pathname,
            });

            // Engagement counter — fires "EngagedUser" once when the
            // threshold is crossed, never refires within the session.
            const next = getCount() + 1;
            sessionStorage.setItem(SESSION_KEY, String(next));
            if (next === ENGAGEMENT_THRESHOLD && !sessionStorage.getItem(ENGAGED_KEY)) {
                sessionStorage.setItem(ENGAGED_KEY, "1");
                fbq("trackCustom", "EngagedUser", {
                    click_count: next,
                    page_path: window.location.pathname,
                });
            }
        };

        // Scroll-depth — emit ViewContent at 25/50/75/100. One fire per
        // page-load, gated by the `__cp_scroll` set on window.
        const fireScrollMilestone = (pct: number) => {
            const w = window as unknown as { __cp_scroll?: Set<number> };
            if (!w.__cp_scroll) w.__cp_scroll = new Set<number>();
            if (w.__cp_scroll.has(pct)) return;
            w.__cp_scroll.add(pct);
            fbq("trackCustom", "ScrollDepth", {
                depth_pct: pct,
                page_path: window.location.pathname,
            });
        };
        const onScroll = () => {
            const doc = document.documentElement;
            const scrollable = doc.scrollHeight - doc.clientHeight;
            if (scrollable <= 0) return;
            const pct = Math.round((doc.scrollTop / scrollable) * 100);
            if (pct >= 25) fireScrollMilestone(25);
            if (pct >= 50) fireScrollMilestone(50);
            if (pct >= 75) fireScrollMilestone(75);
            if (pct >= 95) fireScrollMilestone(100);
        };

        // Time-on-page milestones — 30 s, 60 s, 120 s. Skipped if the user
        // navigates away first (cleanup on unmount).
        const timers: ReturnType<typeof setTimeout>[] = [];
        const fireDwell = (secs: number) => () => {
            fbq("trackCustom", "TimeOnPage", {
                seconds: secs,
                page_path: window.location.pathname,
            });
        };
        timers.push(setTimeout(fireDwell(30), 30_000));
        timers.push(setTimeout(fireDwell(60), 60_000));
        timers.push(setTimeout(fireDwell(120), 120_000));

        // Soft-conversion: any <form> submission. fbq fires Lead so even
        // forms we haven't explicitly wired report to Meta.
        const onSubmit = (e: SubmitEvent) => {
            const form = e.target as HTMLFormElement | null;
            if (!form) return;
            // Skip the dashboard sign-out form / impersonation form — they're
            // session-management, not conversions.
            const formId = form.getAttribute("id") || "";
            const formName = form.getAttribute("name") || "";
            if (/signout|impersonat/i.test(formId + formName)) return;
            fbq("trackCustom", "FormSubmit", {
                form_id: formId,
                form_name: formName,
                page_path: window.location.pathname,
            });
        };

        document.addEventListener("click", onClick, { passive: true });
        document.addEventListener("submit", onSubmit, { passive: true });
        window.addEventListener("scroll", onScroll, { passive: true });

        return () => {
            document.removeEventListener("click", onClick);
            document.removeEventListener("submit", onSubmit);
            window.removeEventListener("scroll", onScroll);
            timers.forEach(clearTimeout);
        };
    }, [pathname]); // re-bind on route change so scroll/time counters reset

    return null;
}

// Re-export track so callers can: `import { track } from "@/components/PixelInstrumentation"`.
// The actual implementation stays in @/lib/analytics so server code can import
// from there without dragging the "use client" boundary.
export { track };
