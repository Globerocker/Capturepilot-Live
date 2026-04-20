import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

export const metadata = { title: "Unsubscribed — CapturePilot" };

/**
 * Confirmation page shown after a one-click outreach unsubscribe.
 * Kept static (no data fetch) so the redirect is instant and the page works
 * even if the API route later fails — the recipient shouldn't see a spinner
 * on what is essentially an "we heard you, no more emails" acknowledgement.
 */
export default function UnsubscribedPage() {
    return (
        <main className="min-h-screen flex items-center justify-center bg-stone-50 px-4">
            <div className="bg-white border border-stone-200 rounded-2xl shadow-sm p-8 max-w-lg w-full text-center">
                <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto mb-4" />
                <h1 className="text-2xl font-bold tracking-tight text-black mb-2">You&apos;re unsubscribed</h1>
                <p className="text-sm text-stone-600 leading-relaxed mb-6">
                    We&apos;ve removed you from future CapturePilot outreach.
                    You won&apos;t receive additional emails from us, and we&apos;ve logged this
                    across our systems so it sticks.
                </p>
                <p className="text-xs text-stone-400 mb-6">
                    If you changed your mind later and want to check matching federal
                    contracts for your company, you can always run a free capability
                    check — we don&apos;t need your email for that.
                </p>
                <Link
                    href="/check"
                    className="inline-flex items-center gap-2 text-sm font-bold bg-black text-white px-5 py-2.5 rounded-full hover:bg-stone-800 transition-colors"
                >
                    Try a free capability check
                </Link>
            </div>
        </main>
    );
}
