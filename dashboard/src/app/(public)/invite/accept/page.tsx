"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseClient } from "@/lib/supabase/client";
import { Loader2, CheckCircle2, AlertTriangle } from "lucide-react";

const supabase = createSupabaseClient();

function AcceptInner() {
    const router = useRouter();
    const params = useSearchParams();
    const token = params.get("token");
    const [status, setStatus] = useState<"loading" | "needs_auth" | "accepting" | "success" | "error">("loading");
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!token) { setStatus("error"); setError("Missing token"); return; }
        (async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                // Send to signup with the token so they can create an account and bounce back.
                router.push(`/signup?invite_token=${encodeURIComponent(token)}`);
                return;
            }
            setStatus("accepting");
            try {
                const res = await fetch("/api/team/invite/accept", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ token }),
                });
                const body = await res.json() as { success?: boolean; error?: string };
                if (res.ok && body.success) {
                    setStatus("success");
                    setTimeout(() => router.push("/dashboard"), 1500);
                } else {
                    setStatus("error");
                    setError(body.error || "Failed to accept invitation");
                }
            } catch (e) {
                setStatus("error");
                setError((e as Error).message);
            }
        })();
    }, [token, router]);

    return (
        <div className="min-h-screen flex items-center justify-center bg-stone-50 px-4">
            <div className="bg-white border border-stone-200 rounded-2xl p-8 max-w-md w-full text-center shadow-sm">
                {status === "loading" || status === "accepting" ? (
                    <>
                        <Loader2 className="w-8 h-8 animate-spin text-stone-400 mx-auto mb-4" />
                        <p className="text-sm text-stone-600">Accepting your invitation…</p>
                    </>
                ) : status === "success" ? (
                    <>
                        <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto mb-3" />
                        <h1 className="font-bold text-xl mb-1">You&apos;re in!</h1>
                        <p className="text-sm text-stone-600">Redirecting to your dashboard…</p>
                    </>
                ) : (
                    <>
                        <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
                        <h1 className="font-bold text-xl mb-2">Couldn&apos;t accept invitation</h1>
                        <p className="text-sm text-stone-600 mb-4">{error || "Unknown error"}</p>
                        <button type="button" onClick={() => router.push("/dashboard")} className="bg-black text-white text-xs font-bold px-4 py-2 rounded-xl">
                            Go to dashboard
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}

export default function InviteAcceptPage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-stone-400" /></div>}>
            <AcceptInner />
        </Suspense>
    );
}
