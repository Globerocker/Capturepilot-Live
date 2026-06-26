"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

/**
 * Route-level error boundary for the Sales Cockpit. A single bad lead record
 * used to white-screen the whole page; now the crash is contained, the exact
 * error is shown (so we can fix the offending field), and the rest of the admin
 * keeps working.
 */
export default function CockpitError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surfaces in the browser console + Vercel logs so the root field is fixable.
    console.error("[cockpit] render error:", error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-lg w-full bg-white border border-red-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-red-600" />
          </div>
          <h2 className="font-black text-stone-900 text-lg">Sales Cockpit hit an error</h2>
        </div>
        <p className="text-sm text-stone-600 mb-3">
          One record in the queue rendered badly and stopped the page. The rest of the admin is fine.
          Try again, or reload. If it keeps happening, send us this message:
        </p>
        <pre className="text-xs bg-stone-50 border border-stone-200 rounded-lg p-3 text-red-700 whitespace-pre-wrap break-words mb-4">
{error?.message || "Unknown error"}{error?.digest ? `\n\ndigest: ${error.digest}` : ""}
        </pre>
        <div className="flex gap-3">
          <button onClick={reset} className="inline-flex items-center gap-2 bg-stone-900 hover:bg-black text-white font-bold text-sm px-5 py-2.5 rounded-xl transition-colors">
            <RotateCcw className="w-4 h-4" /> Try again
          </button>
          <a href="/admin/cockpit" className="inline-flex items-center gap-2 bg-white border border-stone-200 hover:bg-stone-50 text-stone-700 font-bold text-sm px-5 py-2.5 rounded-xl transition-colors">
            Reload
          </a>
        </div>
      </div>
    </div>
  );
}
