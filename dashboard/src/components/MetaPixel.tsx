"use client";

import Script from "next/script";
import { useEffect, useState } from "react";
import { getCookieConsent } from "./CookieConsent";

/**
 * Meta (Facebook) Pixel loader. Respects the cookie consent banner — only
 * fires when the user has chosen "accepted_all". Reads the pixel ID from
 * NEXT_PUBLIC_META_PIXEL_ID; renders nothing if unset.
 *
 * Fires PageView on mount. Standard conversion events (Lead, CompleteRegistration,
 * Purchase, etc.) are dispatched via `track()` in `@/lib/analytics`.
 */
export default function MetaPixel() {
  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  const [consented, setConsented] = useState(false);

  useEffect(() => {
    // Re-check on mount + whenever localStorage changes (consent banner action).
    const refresh = () => setConsented(getCookieConsent() === "accepted_all");
    refresh();
    window.addEventListener("storage", refresh);
    // Custom event the consent banner can dispatch after accept.
    window.addEventListener("cp:consent-changed", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("cp:consent-changed", refresh);
    };
  }, []);

  if (!pixelId || !consented) return null;

  return (
    <>
      <Script id="meta-pixel" strategy="afterInteractive">{`
        !function(f,b,e,v,n,t,s)
        {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
        n.callMethod.apply(n,arguments):n.queue.push(arguments)};
        if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
        n.queue=[];t=b.createElement(e);t.async=!0;
        t.src=v;s=b.getElementsByTagName(e)[0];
        s.parentNode.insertBefore(t,s)}(window,document,'script',
        'https://connect.facebook.net/en_US/fbevents.js');
        fbq('init', '${pixelId}');
        fbq('track', 'PageView');
      `}</Script>
      <noscript>
        <img
          height="1"
          width="1"
          style={{ display: "none" }}
          src={`https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1`}
          alt=""
        />
      </noscript>
    </>
  );
}
