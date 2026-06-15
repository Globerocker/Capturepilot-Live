"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Target, Users, Mail, Loader2, ListPlus, Sparkles, FileText, AlertCircle } from "lucide-react";
import OutreachNav from "@/components/outreach/OutreachNav";

interface Segment {
    key: string;
    label: string;
    description: string;
    templateName: string | null;
    total: number;
    emailable: number;
}

export default function OutreachSegmentsPage() {
    const [segments, setSegments] = useState<Segment[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/outreach/segments");
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            setSegments(json.segments || []);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const buildList = async (key: string) => {
        setBusy(key + ":build");
        setNotice(null);
        try {
            const res = await fetch("/api/admin/outreach/segments/build", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ key }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
            setNotice(json.added ? `Built list with ${json.added} contact(s). Find it under Lists.` : (json.message || "No emailable contacts yet — run enrichment first."));
        } catch (e) {
            setNotice(`Build failed: ${(e as Error).message}`);
        } finally {
            setBusy(null);
        }
    };

    const enrich = async (key: string) => {
        setBusy(key + ":enrich");
        setNotice(null);
        try {
            const res = await fetch("/api/admin/outreach/segments/enrich", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ key }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
            setNotice("Website email scrape started — it fetches each contractor's site for a contact email in the background. Re-check counts in a few minutes, then build the list. Yield is modest for this audience (many are big primes or JS-only sites).");
        } catch (e) {
            setNotice(`Enrichment failed: ${(e as Error).message}`);
        } finally {
            setBusy(null);
        }
    };

    return (
        <div className="min-h-screen bg-stone-50">
            <header className="bg-white border-b border-stone-200 px-4 sm:px-6 pt-4">
                <div className="max-w-[1600px] mx-auto">
                    <h1 className="font-bold text-lg flex items-center gap-2 mb-3">
                        <Target className="w-5 h-5" /> Target Groups
                    </h1>
                    <OutreachNav active="segments" />
                </div>
            </header>

            <main className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6">
                {notice && (
                    <div className="mb-4 text-sm bg-stone-900 text-white rounded-lg px-4 py-2.5 flex items-center gap-2">
                        <Sparkles className="w-4 h-4 shrink-0" /> {notice}
                    </div>
                )}
                {error && (
                    <div className="mb-4 text-sm bg-red-50 text-red-700 border border-red-200 rounded-lg px-4 py-2.5 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0" /> {error}
                    </div>
                )}

                {loading ? (
                    <div className="flex items-center gap-2 text-stone-500 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Loading segments…</div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {segments.map((s) => {
                            const needEnrich = s.total - s.emailable;
                            return (
                                <div key={s.key} className="bg-white border border-stone-200 rounded-2xl p-5 flex flex-col">
                                    <h2 className="font-bold text-base">{s.label}</h2>
                                    <p className="text-sm text-stone-500 mt-1 leading-relaxed flex-1">{s.description}</p>

                                    <div className="flex items-center gap-4 mt-4 text-sm">
                                        <span className="inline-flex items-center gap-1.5 text-stone-700"><Users className="w-4 h-4" /> {s.total.toLocaleString()} match</span>
                                        <span className="inline-flex items-center gap-1.5 text-emerald-700"><Mail className="w-4 h-4" /> {s.emailable.toLocaleString()} emailable</span>
                                        {needEnrich > 0 && (
                                            <span className="text-amber-600 text-xs">{needEnrich.toLocaleString()} need emails</span>
                                        )}
                                    </div>

                                    <div className="mt-3 text-xs text-stone-500">
                                        {s.templateName ? (
                                            <span className="inline-flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> Template: <Link href="/admin/outreach/templates" className="underline hover:text-black">{s.templateName}</Link></span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1.5 text-stone-400"><FileText className="w-3.5 h-3.5" /> No template yet</span>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-2 mt-4">
                                        <button
                                            type="button"
                                            onClick={() => buildList(s.key)}
                                            disabled={busy !== null || s.emailable === 0}
                                            className="bg-orange-600 hover:bg-orange-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold px-3.5 py-2 rounded-lg inline-flex items-center gap-2 text-sm"
                                        >
                                            {busy === s.key + ":build" ? <Loader2 className="w-4 h-4 animate-spin" /> : <ListPlus className="w-4 h-4" />} Build sending list
                                        </button>
                                        {needEnrich > 0 && (
                                            <button
                                                type="button"
                                                onClick={() => enrich(s.key)}
                                                disabled={busy !== null}
                                                className="border border-stone-300 hover:bg-stone-50 disabled:opacity-40 text-stone-700 font-medium px-3.5 py-2 rounded-lg inline-flex items-center gap-2 text-sm"
                                            >
                                                {busy === s.key + ":enrich" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Find emails (scrape sites)
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </main>
        </div>
    );
}
