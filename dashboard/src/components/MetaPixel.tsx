"use client";

import Script from "next/script";

/**
 * Meta tracking loader. Fires unconditionally — matches the marketing site's
 * behavior and lets Meta's Event Setup Tool detect the Pixel. If a stricter
 * consent posture is required later, re-add the cookie-consent gate that
 * lived here previously (commit history).
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
