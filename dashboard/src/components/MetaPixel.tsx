/**
 * Meta tracking loader. Fires unconditionally — matches the marketing site's
 * behavior and lets Meta's Event Setup Tool detect the Pixel.
 *
 * Loads (independently, based on which env var is set):
 *   - Meta Pixel (NEXT_PUBLIC_META_PIXEL_ID) — ads / conversion tracking
 *   - Facebook JS SDK (NEXT_PUBLIC_FB_APP_ID) — App Events analytics
 *
 * Uses raw <script dangerouslySetInnerHTML> (not next/script) so the snippet
 * is in the SSR HTML response. next/script with strategy="afterInteractive"
 * only injects after hydration — invisible to Meta's crawler.
 *
 * Server component (no "use client"): renders once at request time, no
 * client-side React lifecycle needed.
 *
 * Conversion events are dispatched via `track()` in `@/lib/analytics`.
 */
export default function MetaPixel() {
  // .trim() guards against `echo "..." | vercel env add` leaving a trailing
  // newline in the value, which would land inside fbq('init', '...') and
  // silently break the Pixel.
  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim();
  const fbAppId = process.env.NEXT_PUBLIC_FB_APP_ID?.trim();

  if (!pixelId && !fbAppId) return null;

  return (
    <>
      {pixelId && (
        <>
          <script
            dangerouslySetInnerHTML={{
              __html: `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${pixelId}');fbq('track','PageView');`,
            }}
          />
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
        <script
          dangerouslySetInnerHTML={{
            __html: `window.fbAsyncInit=function(){FB.init({appId:'${fbAppId}',cookie:true,xfbml:true,version:'v22.0'});FB.AppEvents.logPageView();};(function(d,s,id){var js,fjs=d.getElementsByTagName(s)[0];if(d.getElementById(id))return;js=d.createElement(s);js.id=id;js.src="https://connect.facebook.net/en_US/sdk.js";fjs.parentNode.insertBefore(js,fjs);}(document,'script','facebook-jssdk'));`,
          }}
        />
      )}
    </>
  );
}
