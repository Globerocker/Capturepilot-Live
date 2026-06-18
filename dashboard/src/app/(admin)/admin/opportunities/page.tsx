"use client";

import { fmtCurrency } from "@/lib/display-helpers";
import { useCallback, useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import {
    Briefcase, Search, Loader2, ExternalLink, Send, X,
    AlertTriangle, CheckCircle2, User, Calendar, Building2,
    Users, ShieldCheck, Lock, MapPin,
} from "lucide-react";
import clsx from "clsx";

const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Opp {
    notice_id: string;
    solicitation_number: string | null;
    title: string;
    agency: string;
    naics_code: string;
    set_aside_code: string;
    notice_type: string;
    response_deadline: string;
    estimated_value: number;
    place_of_performance_state: string;
    status: string;
    veteran_relevance_flag: boolean;
    small_business_relevance_flag: boolean;
    wosb_relevance_flag: boolean;
    sources_sought_flag: boolean;
}

interface Client {
    id: string;
    contact_name: string | null;
    company_name: string | null;
    email: string | null;
    account_type: string;
}

const DEFAULT_NEXT_STEPS = [
    "We'll generate a Capture Brief in the next 24 hours.",
    "Expect a 20-minute strategy call this week to align on approach.",
    "Any documents (capability statement, past performance) we need from you — we'll flag here.",
];

export default function AdminOpportunities() {
    const [opps, setOpps] = useState<Opp[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("ACTIVE");
    const [naicsFilter, setNaicsFilter] = useState("");
    const [setAsideFilter, setSetAsideFilter] = useState("");
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(0);
    const PAGE_SIZE = 50;

    // Push-to-client modal state. Folded in from the legacy
    // /admin/push-opportunity page so the action lives where the data is.
    const [pushTarget, setPushTarget] = useState<Opp | null>(null);
    // Reverse-match modal: find the contractors eligible for this opportunity.
    const [matchTarget, setMatchTarget] = useState<Opp | null>(null);

    const loadOpps = useCallback(async () => {
        setLoading(true);
        let query = supabase.from("opportunities")
            .select("notice_id, solicitation_number, title, agency, naics_code, set_aside_code, notice_type, response_deadline, estimated_value, place_of_performance_state, status, veteran_relevance_flag, small_business_relevance_flag, wosb_relevance_flag, sources_sought_flag", { count: "exact" })
            .order("posted_date", { ascending: false, nullsFirst: false })
            .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

        if (statusFilter) query = query.eq("status", statusFilter);
        if (naicsFilter) query = query.eq("naics_code", naicsFilter);
        if (search) query = query.ilike("title", `%${search}%`);
        if (setAsideFilter === "veteran") query = query.eq("veteran_relevance_flag", true);
        else if (setAsideFilter === "wosb") query = query.eq("wosb_relevance_flag", true);
        else if (setAsideFilter === "sb") query = query.eq("small_business_relevance_flag", true);
        else if (setAsideFilter === "sources_sought") query = query.eq("sources_sought_flag", true);

        const { data, count } = await query;
        setOpps((data || []) as Opp[]);
        setTotal(count || 0);
        setLoading(false);
    }, [page, statusFilter, naicsFilter, setAsideFilter, search]);

    useEffect(() => { loadOpps(); }, [statusFilter, naicsFilter, setAsideFilter, page, loadOpps]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        loadOpps();
    };

    const statusColors: Record<string, string> = {
        ACTIVE: "bg-emerald-100 text-emerald-700",
        EXPIRING_SOON: "bg-red-100 text-red-700",
        EXPIRED: "bg-stone-200 text-stone-600",
        MARKET_RESEARCH: "bg-violet-100 text-violet-700",
        INTELLIGENCE: "bg-blue-100 text-blue-700",
        AWARDED: "bg-amber-100 text-amber-700",
        DISCOVERED: "bg-stone-100 text-stone-500",
    };

    return (
        <div className="w-full space-y-5">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-bold flex items-center gap-2">
                        <Briefcase className="w-5 h-5" /> Opportunities
                    </h1>
                    <p className="text-sm text-stone-500">{total.toLocaleString()} total</p>
                </div>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-3">
                <form onSubmit={handleSearch} className="flex-1 min-w-[200px] relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                    <input value={search} onChange={e => setSearch(e.target.value)}
                        placeholder="Search by title..."
                        className="w-full pl-9 pr-3 py-2 border border-stone-300 rounded-lg text-sm bg-white" />
                </form>
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                    className="border border-stone-300 rounded-lg px-3 py-2 text-sm bg-white">
                    <option value="">All Statuses</option>
                    <option value="ACTIVE">Active</option>
                    <option value="EXPIRING_SOON">Expiring Soon</option>
                    <option value="MARKET_RESEARCH">Market Research</option>
                    <option value="INTELLIGENCE">Intelligence</option>
                    <option value="AWARDED">Awarded</option>
                    <option value="EXPIRED">Expired</option>
                </select>
                <input value={naicsFilter} onChange={e => setNaicsFilter(e.target.value)}
                    placeholder="NAICS code"
                    className="w-28 border border-stone-300 rounded-lg px-3 py-2 text-sm bg-white" />
                <select value={setAsideFilter} onChange={e => setSetAsideFilter(e.target.value)}
                    className="border border-stone-300 rounded-lg px-3 py-2 text-sm bg-white">
                    <option value="">All Set-Asides</option>
                    <option value="veteran">Veteran (SDVOSB/VOSB)</option>
                    <option value="wosb">Women-Owned (WOSB)</option>
                    <option value="sb">Small Business</option>
                    <option value="sources_sought">Sources Sought</option>
                </select>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between text-xs text-stone-500">
                <span>Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total.toLocaleString()}</span>
                <div className="flex gap-2">
                    <button type="button" onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}
                        className="px-3 py-1 border border-stone-300 rounded-lg disabled:opacity-30 hover:bg-stone-50">Prev</button>
                    <button type="button" onClick={() => setPage(page + 1)} disabled={(page + 1) * PAGE_SIZE >= total}
                        className="px-3 py-1 border border-stone-300 rounded-lg disabled:opacity-30 hover:bg-stone-50">Next</button>
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-stone-400" /></div>
            ) : (
                <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-stone-100 text-[10px] text-stone-400 uppercase">
                                    <th className="text-left px-4 py-2.5">Opportunity</th>
                                    <th className="text-center px-3 py-2.5">Status</th>
                                    <th className="text-center px-3 py-2.5">NAICS</th>
                                    <th className="text-center px-3 py-2.5">Set-Aside</th>
                                    <th className="text-center px-3 py-2.5">Value</th>
                                    <th className="text-center px-3 py-2.5">Deadline</th>
                                    <th className="text-center px-3 py-2.5">State</th>
                                    <th className="text-center px-3 py-2.5">Flags</th>
                                    <th className="text-right px-3 py-2.5">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-stone-50">
                                {opps.map(o => (
                                    <tr key={o.notice_id} className="hover:bg-stone-50/50">
                                        <td className="px-4 py-2.5 max-w-xs">
                                            <p className="font-medium text-stone-900 truncate">{o.title}</p>
                                            <p className="text-[10px] text-stone-400 truncate">
                                                {o.agency}
                                                {o.solicitation_number && <span className="ml-2 font-mono text-stone-500">{o.solicitation_number}</span>}
                                            </p>
                                        </td>
                                        <td className="text-center px-3">
                                            <span className={clsx("text-[9px] font-bold px-2 py-0.5 rounded uppercase", statusColors[o.status] || "bg-stone-100 text-stone-500")}>
                                                {o.status}
                                            </span>
                                        </td>
                                        <td className="text-center px-3 text-xs font-mono text-stone-600">{o.naics_code || "—"}</td>
                                        <td className="text-center px-3 text-[10px] text-stone-600 max-w-[120px] truncate">{o.set_aside_code || "—"}</td>
                                        <td className="text-center px-3 text-xs font-bold text-emerald-600">{fmtCurrency(o.estimated_value)}</td>
                                        <td className="text-center px-3 text-xs text-stone-500">
                                            {o.response_deadline ? new Date(o.response_deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
                                        </td>
                                        <td className="text-center px-3 text-xs text-stone-500">{o.place_of_performance_state || "—"}</td>
                                        <td className="text-center px-3">
                                            <div className="flex gap-0.5 justify-center">
                                                {o.veteran_relevance_flag && <span className="text-[8px] bg-emerald-100 text-emerald-700 px-1 rounded">VET</span>}
                                                {o.wosb_relevance_flag && <span className="text-[8px] bg-pink-100 text-pink-700 px-1 rounded">WOSB</span>}
                                                {o.small_business_relevance_flag && !o.veteran_relevance_flag && !o.wosb_relevance_flag && <span className="text-[8px] bg-blue-100 text-blue-700 px-1 rounded">SB</span>}
                                                {o.sources_sought_flag && <span className="text-[8px] bg-violet-100 text-violet-700 px-1 rounded">SS</span>}
                                            </div>
                                        </td>
                                        <td className="px-3 py-2">
                                            <div className="flex items-center justify-end gap-1.5">
                                                <button
                                                    type="button"
                                                    onClick={() => setPushTarget(o)}
                                                    title="Push to a client's pipeline + email them"
                                                    className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                                                >
                                                    <Send className="w-3 h-3" />
                                                    Send
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setMatchTarget(o)}
                                                    title="Find the contractors eligible for this opportunity"
                                                    className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100"
                                                >
                                                    <Users className="w-3 h-3" />
                                                    Vendors
                                                </button>
                                                <a href={`https://sam.gov/opp/${o.notice_id}/view`} target="_blank" rel="noopener noreferrer"
                                                    title="Open on SAM.gov"
                                                    className="text-blue-600 hover:text-blue-800 p-1"><ExternalLink className="w-3.5 h-3.5" /></a>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {pushTarget && (
                <PushOpportunityModal
                    opp={pushTarget}
                    onClose={() => setPushTarget(null)}
                />
            )}

            {matchTarget && (
                <ReverseMatchModal
                    opp={matchTarget}
                    onClose={() => setMatchTarget(null)}
                />
            )}
        </div>
    );
}

// ── Reverse match: contractors eligible for THIS opportunity ─────────────────
interface ReverseLead {
    contractor_id: string;
    company_name: string | null;
    uei: string | null;
    state: string | null;
    sba_certifications: string[];
    total_federal_awards: number | null;
    registration_status: string | null;
    score: number;
    classification: "HOT" | "WARM" | "COLD";
    score_breakdown: Record<string, number>;
}

const TIER_BADGE: Record<string, string> = {
    HOT: "bg-emerald-100 text-emerald-700",
    WARM: "bg-amber-100 text-amber-700",
    COLD: "bg-stone-100 text-stone-500",
};

function ReverseMatchModal({ opp, onClose }: { opp: Opp; onClose: () => void }) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [leads, setLeads] = useState<ReverseLead[]>([]);
    const [requiredLabel, setRequiredLabel] = useState<string | null>(null);
    const [gated, setGated] = useState(false);
    const [gatedReason, setGatedReason] = useState<string | null>(null);
    const [eligibleCount, setEligibleCount] = useState(0);

    useEffect(() => {
        let alive = true;
        setLoading(true);
        setError(null);
        fetch(`/api/admin/reverse-match?opportunity_id=${encodeURIComponent(opp.notice_id)}&top_n=50`)
            .then(async (r) => {
                const d = await r.json();
                if (!r.ok || !d.ok) throw new Error(d?.error || `Failed (${r.status})`);
                return d;
            })
            .then((d) => {
                if (!alive) return;
                setLeads(Array.isArray(d.leads) ? d.leads : []);
                setRequiredLabel(d.required_label ?? null);
                setGated(!!d.gated);
                setGatedReason(d.gated_reason ?? null);
                setEligibleCount(d.eligible_count ?? 0);
            })
            .catch((e) => { if (alive) setError(e instanceof Error ? e.message : "Could not load vendors"); })
            .finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
    }, [opp.notice_id]);

    return (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl my-8" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-start justify-between p-5 border-b border-stone-200">
                    <div className="min-w-0">
                        <h3 className="font-bold text-stone-900 inline-flex items-center gap-2"><Users className="w-5 h-5 text-indigo-600" /> Eligible contractors</h3>
                        <p className="text-xs text-stone-500 mt-0.5 truncate">{opp.title}</p>
                        <p className="text-[11px] text-stone-400 mt-0.5">
                            {opp.naics_code && <span className="font-mono">{opp.naics_code}</span>}
                            {opp.set_aside_code && <span className="ml-2">· {opp.set_aside_code}</span>}
                        </p>
                    </div>
                    <button type="button" aria-label="Close" onClick={onClose} className="text-stone-400 hover:text-black p-1"><X className="w-5 h-5" /></button>
                </div>

                {/* Eligibility banner — always honest about the gate. */}
                <div className="px-5 pt-4">
                    {requiredLabel ? (
                        <div className="flex items-start gap-2 text-xs bg-indigo-50 border border-indigo-200 text-indigo-800 rounded-xl p-3">
                            <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>Set-aside gate active: only firms whose <span className="font-bold">SAM.gov registration</span> shows <span className="font-bold">{requiredLabel}</span> are shown — the same source a contracting officer checks. Firms without it are excluded entirely. Confirm current certification status before you rely on it.</span>
                        </div>
                    ) : !gated ? (
                        <div className="flex items-start gap-2 text-xs bg-stone-50 border border-stone-200 text-stone-600 rounded-xl p-3">
                            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-stone-400" />
                            <span>Open competition (no certification set-aside) — ranked by fit.</span>
                        </div>
                    ) : null}
                </div>

                <div className="p-5">
                    {loading ? (
                        <div className="py-12 text-center text-stone-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /><p className="text-sm mt-2">Finding eligible contractors…</p></div>
                    ) : error ? (
                        <p className="text-sm text-rose-600 inline-flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> {error}</p>
                    ) : gated ? (
                        <div className="flex items-start gap-2 text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-4">
                            <Lock className="w-5 h-5 shrink-0 mt-0.5" />
                            <span>{gatedReason}</span>
                        </div>
                    ) : leads.length === 0 ? (
                        <p className="text-sm text-stone-400">No eligible contractors found in our database for this opportunity{requiredLabel ? ` with ${requiredLabel} certification` : ""}.</p>
                    ) : (
                        <>
                            <p className="text-xs text-stone-500 mb-2">{eligibleCount} eligible · showing top {leads.length}</p>
                            <ul className="space-y-2">
                                {leads.map((l) => (
                                    <li key={l.contractor_id} className="border border-stone-200 rounded-xl p-3 flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-bold text-stone-800 text-sm truncate">{l.company_name || "Unnamed"}</span>
                                                <span className={clsx("text-[9px] font-bold px-1.5 py-0.5 rounded uppercase", TIER_BADGE[l.classification])}>{l.classification} · {l.score}</span>
                                            </div>
                                            <div className="flex items-center gap-3 text-[11px] text-stone-500 mt-1 flex-wrap">
                                                {l.state && <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" /> {l.state}</span>}
                                                {typeof l.total_federal_awards === "number" && l.total_federal_awards > 0 && <span>{l.total_federal_awards} fed awards</span>}
                                                {l.registration_status && <span>SAM: {l.registration_status}</span>}
                                                {l.sba_certifications.length > 0 && <span className="truncate">{l.sba_certifications.slice(0, 4).join(", ")}</span>}
                                            </div>
                                        </div>
                                        {l.uei && (
                                            <a href={`https://sam.gov/search/?q=${encodeURIComponent(l.uei)}&index=ei`} target="_blank" rel="noopener noreferrer"
                                                title="Open on SAM.gov" className="text-blue-600 hover:text-blue-800 p-1 shrink-0"><ExternalLink className="w-4 h-4" /></a>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

function PushOpportunityModal({ opp, onClose }: { opp: Opp; onClose: () => void }) {
    const [clients, setClients] = useState<Client[]>([]);
    const [loadingClients, setLoadingClients] = useState(true);
    const [selectedClient, setSelectedClient] = useState<string>("");
    const [stage, setStage] = useState("researching");
    const [priority, setPriority] = useState("high");
    const [customerMessage, setCustomerMessage] = useState(
        "We flagged this because it matches your NAICS + set-aside perfectly. Worth a serious look.",
    );
    const [internalNotes, setInternalNotes] = useState("");
    const [nextStepsText, setNextStepsText] = useState(DEFAULT_NEXT_STEPS.join("\n"));
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

    useEffect(() => {
        (async () => {
            const { data } = await supabase
                .from("user_profiles")
                .select("id, contact_name, company_name, email, account_type")
                .in("account_type", ["consulting", "self_service"])
                .order("company_name", { ascending: true });
            setClients((data || []) as Client[]);
            setLoadingClients(false);
        })();
    }, []);

    const selectedClientObj = clients.find((c) => c.id === selectedClient);

    async function submit() {
        if (!selectedClient) return;
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
                    notice_id: opp.notice_id,
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
                setResult({
                    ok: true,
                    message: `${data.created ? "Created" : "Updated"} pursuit for ${selectedClientObj?.company_name || "client"}. ${data.emailed ? "Email sent." : "Email not sent (no address on file)."}`,
                });
                // Auto-close on success after a short delay so the admin sees the confirmation.
                setTimeout(onClose, 1500);
            }
        } catch (e) {
            setResult({ ok: false, message: e instanceof Error ? e.message : "Network error" });
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
            <div
                className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-stone-100 px-5 py-3 sticky top-0 bg-white">
                    <h2 className="font-bold text-base flex items-center gap-2">
                        <Send className="w-4 h-4" />
                        Push Opportunity to Client
                    </h2>
                    <button type="button" onClick={onClose} className="p-1 text-stone-400 hover:text-stone-700" title="Close">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="p-5 space-y-4">
                    {/* Selected opportunity preview */}
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                        <p className="text-sm font-bold text-emerald-900 line-clamp-2">{opp.title}</p>
                        <p className="text-xs text-emerald-700 flex items-center gap-3 mt-0.5 flex-wrap">
                            <span className="inline-flex items-center gap-1">
                                <Building2 className="w-3 h-3" />
                                {opp.agency || "?"}
                            </span>
                            {opp.response_deadline && (
                                <span className="inline-flex items-center gap-1">
                                    <Calendar className="w-3 h-3" />
                                    {new Date(opp.response_deadline).toLocaleDateString()}
                                </span>
                            )}
                            {opp.naics_code && <span className="font-mono">NAICS {opp.naics_code}</span>}
                        </p>
                        <p className="text-[10px] text-emerald-600 font-mono mt-1">Notice: {opp.notice_id}</p>
                    </div>

                    {/* Client selector */}
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-stone-500 mb-1.5 flex items-center gap-1.5">
                            <User className="w-3 h-3" />
                            Client
                        </p>
                        <select
                            value={selectedClient}
                            onChange={(e) => setSelectedClient(e.target.value)}
                            disabled={loadingClients}
                            className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
                        >
                            <option value="">{loadingClients ? "Loading…" : "Select a client…"}</option>
                            {clients.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.company_name || "(no company)"} — {c.contact_name || "?"}{c.email ? ` · ${c.email}` : " · (no email)"}{c.account_type === "consulting" ? " · Consulting" : ""}
                                </option>
                            ))}
                        </select>
                        {selectedClientObj && !selectedClientObj.email && (
                            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2 mt-2 inline-flex items-center gap-1.5">
                                <AlertTriangle className="w-3 h-3" />
                                No email on file — push happens, but the client won&apos;t get the notification.
                            </p>
                        )}
                    </div>

                    {/* Stage + priority */}
                    <div className="grid sm:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-[10px] text-stone-500 uppercase font-bold mb-1">Stage</label>
                            <select value={stage} onChange={(e) => setStage(e.target.value)}
                                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg">
                                <option value="discovered">Discovered</option>
                                <option value="researching">Researching</option>
                                <option value="preparing">Preparing</option>
                                <option value="submitted">Submitted</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] text-stone-500 uppercase font-bold mb-1">Priority</label>
                            <select value={priority} onChange={(e) => setPriority(e.target.value)}
                                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg">
                                <option value="high">High</option>
                                <option value="medium">Medium</option>
                                <option value="low">Low</option>
                            </select>
                        </div>
                    </div>

                    {/* Customer message */}
                    <div>
                        <label className="block text-[10px] text-stone-500 uppercase font-bold mb-1">
                            Customer message (shown as a quote in the email)
                        </label>
                        <textarea value={customerMessage} onChange={(e) => setCustomerMessage(e.target.value)}
                            rows={2} className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg" />
                    </div>

                    {/* Next steps */}
                    <div>
                        <label className="block text-[10px] text-stone-500 uppercase font-bold mb-1">
                            Next steps (one per line — bullet list in the email)
                        </label>
                        <textarea value={nextStepsText} onChange={(e) => setNextStepsText(e.target.value)}
                            rows={4} className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg font-mono" />
                    </div>

                    {/* Internal notes */}
                    <div>
                        <label className="block text-[10px] text-stone-500 uppercase font-bold mb-1">
                            Internal notes (not sent to client)
                        </label>
                        <input type="text" value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg" />
                    </div>
                </div>

                {/* Footer */}
                <div className="border-t border-stone-100 px-5 py-3 flex items-center justify-between gap-3 sticky bottom-0 bg-white">
                    {result ? (
                        <p className={clsx(
                            "text-xs font-medium inline-flex items-center gap-1.5",
                            result.ok ? "text-emerald-700" : "text-red-600",
                        )}>
                            {result.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                            {result.message}
                        </p>
                    ) : <span />}
                    <div className="flex gap-2">
                        <button type="button" onClick={onClose}
                            className="px-4 py-2 text-xs font-bold text-stone-600 hover:bg-stone-100 rounded-lg">
                            Cancel
                        </button>
                        <button type="button" onClick={submit} disabled={!selectedClient || busy}
                            className={clsx(
                                "inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg",
                                !selectedClient || busy
                                    ? "bg-stone-200 text-stone-400 cursor-not-allowed"
                                    : "bg-emerald-600 text-white hover:bg-emerald-700"
                            )}>
                            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                            Push to Pipeline + Email
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
