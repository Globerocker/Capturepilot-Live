"use client";

import Script from "next/script";

/**
 * Microsoft Clarity — session replay + heatmaps. Free, no sampling, no row limits.
 * Defaults to the production project ID; override per-env via NEXT_PUBLIC_CLARITY_ID.
 * Loaded `afterInteractive` so it doesn't block FCP.
 */
export default function ClarityScript() {
  const clarityId = process.env.NEXT_PUBLIC_CLARITY_ID?.trim() || "x2icimnnsi";
  if (!clarityId) return null;

  return (
    <Script id="ms-clarity" strategy="afterInteractive">{`
      (function(c,l,a,r,i,t,y){
          c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
          t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
          y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
      })(window, document, "clarity", "script", "${clarityId}");
    `}</Script>
  );
}
