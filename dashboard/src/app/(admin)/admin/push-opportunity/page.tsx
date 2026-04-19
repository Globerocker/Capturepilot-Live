"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import {
    Send, Loader2, CheckCircle2, AlertTriangle, Search, User, Calendar, Building2,
} from "lucide-react";
import clsx from "clsx";

const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Client {
    id: string;
    contact_name: string | null;
    company_name: string | null;
    email: string | null;
    account_type: string;
}

interface OppPreview {
    id: string;
    notice_id: string;
    title: string | null;
    department: string | null;
    response_deadline: string | null;
    typeOfSetAsideDescription: string | null;
}

const DEFAULT_NEXT_STEPS = [
    "We'll generate a Capture Brief in the next 24 hours.",
    "Expect a 20-minute strategy call this week to align on approach.",
    "Any documents (capability statement, past performance) we need from you — we'll flag here.",
];

export default function AdminPushOpportunityPage() {
    const [clients, setClients] = useState<Client[]>([]);
    const [selectedClient, setSelectedClient] = useState<string>("");
    const [noticeIdInput, setNoticeIdInput] = useState("");
    const [oppSearch, setOppSearch] = useState("");
    const [oppResults, setOppResults] = useState<OppPreview[]>([]);
    const [selectedOpp, setSelectedOpp] = useState<OppPreview | null>(null);
    const [stage, setStage] = useState("researching");
    const [priority, setPriority] = useState("high");
    const [customerMessage, setCustomerMessage] = useState(
        "We flagged this because it matches your NAICS + set-aside perfectly. Worth a serious look.",
    );
    const [internalNotes, setInternalNotes] = useState("");
    const [nextStepsText, setNextStepsText] = useState(DEFAULT_NEXT_STEPS.join("\n"));
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

    // Load consulting clients on mount
    useEffect(() => {
        async function load() {
            const { data } = await supabase
                .from("user_profiles")
                .select("id, contact_name, company_name, email, account_type")
                .in("account_type", ["consulting", "self_service"])
                .order("company_name", { ascending: true });
            setClients((data || []) as Client[]);
        }
        load();
    }, []);

    // Auto-search opportunities as the user types
    useEffect(() => {
        if (oppSearch.trim().length < 3) {
            setOppResults([]);
            return;
        }
        let cancelled = false;
        (async () => {
            const { data } = await supabase
                .from("opportunities")
                .select("id, notice_id, title, department, response_deadline, typeOfSetAsideDescription")
                .or(`title.ilike.%${oppSearch}%,notice_id.ilike.%${oppSearch}%`)
                .in("status", ["ACTIVE", "EXPIRING_SOON", "DISCOVERED"])
                .order("response_deadline", { ascending: true, nullsFirst: false })
                .limit(10);
            if (!cancelled) setOppResults((data || []) as OppPreview[]);
        })();
        return () => { cancelled = true; };
    }, [oppSearch]);

    async function resolveByNoticeId() {
        if (!noticeIdInput.trim()) return;
        const { data } = await supabase
            .from("opportunities")
            .select("id, notice_id, title, department, response_deadline, typeOfSetAsideDescription")
            .eq("notice_id", noticeIdInput.trim())
            .single();
        if (data) setSelectedOpp(data as OppPreview);
    }

    async function submit() {
        if (!selectedClient || !selectedOpp) return;
        setBusy(true);
        setResult(null);
        try {
            const nextSteps = nextStepsText
                .split(/\n+/)
                .map((s) => s.trim())
                .filter(Boolean)
                .slice(0, 10);
            const res = await fetch("/api/admin/push-opportunity", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    user_profile_id: selectedClient,
                    notice_id: selectedOpp.notice_id,
                    stage,
                    priority,
                    customer_message: customerMessage,
                    internal_notes: internalNotes,
                    next_steps: nextSteps,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                setResult({ ok: false, message: data.error || "Push failed" });
            } else {
                const clientObj = clients.find((c) => c.id === selectedClient);
                setResult({
                    ok: true,
                    message: `${data.created ? "Created" : "Updated"} pursuit for ${clientObj?.company_name || "client"}. ${data.emailed ? "Email sent." : "Email not sent (no address on file)."}`,
                });
                setSelectedOpp(null);
                setOppSearch("");
                setOppResults([]);
            }
        } catch (e) {
            setResult({ ok: false, message: e instanceof Error ? e.message : "Network error" });
        } finally {
            setBusy(false);
        }
    }

    const selectedClientObj = clients.find((c) => c.id === selectedClient);

    return (
        <div className="max-w-4xl mx-auto pb-16 px-1 animate-in fade-in duration-500">
            <header className="mb-8">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-black flex items-center gap-2">
                    <Send className="w-7 h-7" />
                    Push Opportunity to Client
                </h1>
                <p className="text-stone-500 mt-1 text-sm">
                    Hand-pick a federal opportunity and push it straight into a managed client&apos;s pipeline. The
                    client gets a branded email: <em>&ldquo;{`{You}`} spotted a new opportunity and is actively pursuing it.&rdquo;</em>
                </p>
            </header>

            {/* Step 1 — Client */}
            <section className="bg-white rounded-2xl border border-stone-200 p-5 mb-5">
                <p className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-3 flex items-center gap-1.5">
                    <User className="w-3 h-3" />
                    Step 1 — Client
                </p>
                <select
                    value={selectedClient}
                    onChange={(e) => setSelectedClient(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
                >
                    <option value="">Select a client…</option>
                    {clients.map((c) => (
                        <option key={c.id} value={c.id}>
                            {c.company_name || "(no company)"} — {c.contact_name || "?"}{c.email ? ` · ${c.email}` : " · (no email)"}{c.account_type === "consulting" ? " · Consulting" : ""}
                        </option>
                    ))}
                </select>
                {selectedClientObj && !selectedClientObj.email && (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2 mt-2 inline-flex items-center gap-1.5">
                        <AlertTriangle className="w-3 h-3" />
                        No email on file — push will still happen but the client won&apos;t get the notification.
                    </p>
                )}
            </section>

            {/* Step 2 — Opportunity */}
            <section className="bg-white rounded-2xl border border-stone-200 p-5 mb-5">
                <p className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-3 flex items-center gap-1.5">
                    <Search className="w-3 h-3" />
                    Step 2 — Opportunity
                </p>

                <div className="grid sm:grid-cols-2 gap-3 mb-3">
                    <div>
                        <label className="block text-[10px] text-stone-500 uppercase font-bold mb-1">
                            Search by title / notice
                        </label>
                        <input
                            type="text"
                            placeholder="e.g. Fort Bragg logistics"
                            value={oppSearch}
                            onChange={(e) => setOppSearch(e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] text-stone-500 uppercase font-bold mb-1">
                            Or paste notice ID
                        </label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                placeholder="NOTICE_12345..."
                                value={noticeIdInput}
                                onChange={(e) => setNoticeIdInput(e.target.value)}
                                className="flex-1 px-3 py-2 text-sm border border-stone-300 rounded-lg font-mono"
                            />
                            <button
                                type="button"
                                onClick={resolveByNoticeId}
                                className="px-3 py-2 bg-stone-900 text-white text-xs font-bold rounded-lg hover:bg-stone-700"
                            >
                                Load
                            </button>
                        </div>
                    </div>
                </div>

                {oppResults.length > 0 && !selectedOpp && (
                    <div className="border border-stone-200 rounded-xl overflow-hidden">
                        {oppResults.map((o) => (
                            <button
                                type="button"
                                key={o.id}
                                onClick={() => {
                                    setSelectedOpp(o);
                                    setOppResults([]);
                                    setOppSearch("");
                                }}
                                className="w-full text-left p-3 hover:bg-emerald-50 border-b border-stone-100 last:border-b-0 flex items-start justify-between gap-3"
                            >
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-bold text-stone-900 truncate">{o.title || "(no title)"}</p>
                                    <p className="text-xs text-stone-500 truncate mt-0.5">
                                        {o.department || "?"}
                                        {o.typeOfSetAsideDescription && ` · ${o.typeOfSetAsideDescription}`}
                                    </p>
                                </div>
                                <span className="text-[10px] text-stone-400 flex-shrink-0">
                                    {o.response_deadline
                                        ? new Date(o.response_deadline).toLocaleDateString()
                                        : "—"}
                                </span>
                            </button>
                        ))}
                    </div>
                )}

                {selectedOpp && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-emerald-900 truncate">{selectedOpp.title}</p>
                            <p className="text-xs text-emerald-700 flex items-center gap-3 mt-0.5">
                                <span className="inline-flex items-center gap-1">
                                    <Building2 className="w-3 h-3" />
                                    {selectedOpp.department || "?"}
                                </span>
                                {selectedOpp.response_deadline && (
                                    <span className="inline-flex items-center gap-1">
                                        <Calendar className="w-3 h-3" />
                                        {new Date(selectedOpp.response_deadline).toLocaleDateString()}
                                    </span>
                                )}
                            </p>
                            <p className="text-[10px] text-emerald-600 font-mono mt-1">Notice: {selectedOpp.notice_id}</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setSelectedOpp(null)}
                            className="text-xs text-emerald-800 underline"
                        >
                            change
                        </button>
                    </div>
                )}
            </section>

            {/* Step 3 — Stage + message */}
            <section className="bg-white rounded-2xl border border-stone-200 p-5 mb-5">
                <p className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-3">
                    Step 3 — Pipeline + Customer Message
                </p>
                <div className="grid sm:grid-cols-2 gap-3 mb-3">
                    <div>
                        <label className="block text-[10px] text-stone-500 uppercase font-bold mb-1">Stage</label>
                        <select
                            value={stage}
                            onChange={(e) => setStage(e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
                        >
                            <option value="discovered">Discovered</option>
                            <option value="researching">Researching</option>
                            <option value="preparing">Preparing</option>
                            <option value="submitted">Submitted</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-[10px] text-stone-500 uppercase font-bold mb-1">Priority</label>
                        <select
                            value={priority}
                            onChange={(e) => setPriority(e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
                        >
                            <option value="high">High</option>
                            <option value="medium">Medium</option>
                            <option value="low">Low</option>
                        </select>
                    </div>
                </div>
                <div className="mb-3">
                    <label className="block text-[10px] text-stone-500 uppercase font-bold mb-1">
                        Customer message (shown as a quote in the email)
                    </label>
                    <textarea
                        value={customerMessage}
                        onChange={(e) => setCustomerMessage(e.target.value)}
                        rows={2}
                        className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
                    />
                </div>
                <div className="mb-3">
                    <label className="block text-[10px] text-stone-500 uppercase font-bold mb-1">
                        Next steps (one per line — appears as a bullet list in the email)
                    </label>
                    <textarea
                        value={nextStepsText}
                        onChange={(e) => setNextStepsText(e.target.value)}
                        rows={4}
                        className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg font-mono"
                    />
                </div>
                <div>
                    <label className="block text-[10px] text-stone-500 uppercase font-bold mb-1">
                        Internal notes (not sent to client)
                    </label>
                    <input
                        type="text"
                        value={internalNotes}
                        onChange={(e) => setInternalNotes(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
                    />
                </div>
            </section>

            <div className="flex items-center gap-3">
                <button
                    type="button"
                    onClick={submit}
                    disabled={!selectedClient || !selectedOpp || busy}
                    className={clsx(
                        "inline-flex items-center gap-2 px-6 py-3 rounded-full text-sm font-bold transition-all",
                        !selectedClient || !selectedOpp || busy
                            ? "bg-stone-200 text-stone-400 cursor-not-allowed"
                            : "bg-emerald-600 text-white hover:bg-emerald-700 shadow-md",
                    )}
                >
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Push to Pipeline + Email Client
                </button>
                {result && (
                    <p
                        className={clsx(
                            "text-xs font-medium inline-flex items-center gap-1.5",
                            result.ok ? "text-emerald-700" : "text-red-600",
                        )}
                    >
                        {result.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                        {result.message}
                    </p>
                )}
            </div>
        </div>
    );
}
