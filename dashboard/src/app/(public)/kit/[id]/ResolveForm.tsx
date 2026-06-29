"use client";

import { useState } from "react";
import { Loader2, Mail, CheckCircle2, ArrowRight } from "lucide-react";

/**
 * No-cookie fallback for /kit/<id>. The buyer enters their purchase email; we
 * email them their existing download link (anchored to this item). The token
 * is never shown here — see /api/startup-pack/email-link.
 */
export default function KitResolveForm({ itemId }: { itemId: string }) {
    const [email, setEmail] = useState("");
    const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
    const [msg, setMsg] = useState("");

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        if (status === "sending") return;
        setStatus("sending");
        setMsg("");
        try {
            const res = await fetch("/api/startup-pack/email-link", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, itemId }),
            });
            if (!res.ok) {
                const b = await res.json().catch(() => ({}));
                throw new Error(b.error || "Something went wrong.");
            }
            setStatus("sent");
        } catch (err) {
            setStatus("error");
            setMsg(err instanceof Error ? err.message : "Something went wrong.");
        }
    }

    if (status === "sent") {
        return (
            <div className="flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <div>
                    <p className="font-bold">Check your inbox.</p>
                    <p className="text-emerald-700">If that email has a kit, we just sent the link. It may take a minute to arrive.</p>
                </div>
            </div>
        );
    }

    return (
        <form onSubmit={submit} className="space-y-3">
            <label className="block text-xs font-bold text-stone-500 uppercase tracking-widest">Purchase email</label>
            <div className="flex gap-2">
                <div className="relative flex-1">
                    <Mail className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@company.com"
                        className="w-full pl-9 pr-3 py-3 rounded-xl border border-stone-300 text-sm focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200 outline-none"
                    />
                </div>
                <button
                    type="submit"
                    disabled={status === "sending"}
                    className="inline-flex items-center gap-1.5 bg-emerald-600 text-white font-bold text-sm px-4 py-3 rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-60"
                >
                    {status === "sending" ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Email my link <ArrowRight className="w-4 h-4" /></>}
                </button>
            </div>
            {status === "error" && <p className="text-xs text-red-600">{msg}</p>}
        </form>
    );
}
