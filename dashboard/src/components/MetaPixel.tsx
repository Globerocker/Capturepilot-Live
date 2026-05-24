"use client";

import Script from "next/script";
import { useEffect, useState } from "react";
import { getCookieConsent } from "./CookieConsent";

/**
 * Meta tracking loader. Respects the cookie consent banner — only fires
 * when the user has chosen "accepted_all".
 *
 * Loads (independently, based on which env var is set):
 *   - Meta Pixel (NEXT_PUBLIC_META_PIXEL_ID) — ads / conversion tracking
 *   - Facebook JS SDK (NEXT_PUBLIC_FB_APP_ID) — App Events analytics
 *
 * Conversion events are dispatched via `track()` in `@/lib/analytics`.
 */
export default function MetaPixel() {
  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  const fbAppId = process.env.NEXT_PUBLIC_FB_APP_ID;
  const [consented, setConsented] = useState(false);

  useEffect(() => {
    const refresh = () => setConsented(getCookieConsent() === "accepted_all");
    refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener("cp:consent-changed", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("cp:consent-changed", refresh);
    };
  }, []);

  if (!consented) return null;
  if (!pixelId && !fbAppId) return null;

  return (
    <>
      {pixelId && (
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
      )}

      {fbAppId && (
        <Script id="fb-sdk" strategy="afterInteractive">{`
          window.fbAsyncInit = function() {
            FB.init({ appId: '${fbAppId}', cookie: true, xfbml: true, version: 'v22.0' });
            FB.AppEvents.logPageView();
          };
          (function(d, s, id){
            var js, fjs = d.getElementsByTagName(s)[0];
            if (d.getElementById(id)) return;
            js = d.createElement(s); js.id = id;
            js.src = "https://connect.facebook.net/en_US/sdk.js";
            fjs.parentNode.insertBefore(js, fjs);
          }(document, 'script', 'facebook-jssdk'));
        `}</Script>
      )}
    </>
  );
}
