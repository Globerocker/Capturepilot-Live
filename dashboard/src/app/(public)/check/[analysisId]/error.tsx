"use client";

import { useEffect } from "react";
import Link from "next/link";

// Per-segment error boundary for the public Quick Checker result page.
// Surfaces the actual error message + a way to retry rendering, so we don't
// have to ask users to copy the browser console.
export default function CheckResultError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        // Log to the browser console (visible if the user opens DevTools)
        // and to Vercel runtime via console.error so we can see the digest
        // server-side.
        console.error("[check/[analysisId]] render error:", error);
    }, [error]);

    return (
        <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4 py-10">
            <div className="max-w-lg w-full bg-white border border-red-200 rounded-2xl shadow-sm p-6">
                <p className="text-[10px] font-bold uppercase tracking-widest text-red-600 mb-2">
                    Render error
                </p>
                <h1 className="font-black text-xl text-stone-900 mb-2">
                    The result page hit an error.
                </h1>
                <p className="text-sm text-stone-600 mb-3">
                    Your analysis ran fine — only the page rendering failed. We&apos;re looking at it.
                </p>
                <pre className="bg-stone-50 border border-stone-200 rounded-lg p-3 text-[11px] text-stone-700 whitespace-pre-wrap break-words max-h-48 overflow-auto">
                    {error?.name || "Error"}: {error?.message || "Unknown error"}
                    {error?.digest ? `\n\ndigest: ${error.digest}` : ""}
                </pre>
                <div className="flex items-center gap-2 mt-4">
                    <button
                        type="button"
                        onClick={() => reset()}
                        className="bg-stone-900 hover:bg-stone-700 text-white text-xs font-bold px-4 py-2 rounded-lg"
                    >
                        Try again
                    </button>
                    <Link
                        href="/check"
                        className="text-xs font-bold text-stone-600 hover:text-stone-900 px-4 py-2"
                    >
                        Start a new check
                    </Link>
                </div>
            </div>
        </div>
    );
}
