"use client";

import { useMemo, useRef, useState } from "react";
import {
    X, Upload, FileText, Database, Building2, Search, Loader2,
    CheckCircle2, AlertTriangle, ChevronDown,
} from "lucide-react";
import clsx from "clsx";

type Tab = "csv" | "hubspot" | "sam" | "apollo";

interface Props {
    onClose: () => void;
    onImported: () => void;
}

const ALLOWED_FIELDS = [
    { value: "", label: "— skip —" },
    { value: "email", label: "Email" },
    { value: "phone", label: "Phone" },
    { value: "first_name", label: "First name" },
    { value: "last_name", label: "Last name" },
    { value: "company_name", label: "Company" },
    { value: "title", label: "Title" },
    { value: "state", label: "State" },
    { value: "naics_codes", label: "NAICS codes" },
    { value: "tags", label: "Tags" },
    { value: "source_id", label: "Source ID" },
];

/** Tiny CSV parser — handles quoted commas + escaped quotes. No deps. */
function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
    const lines = text.replace(/\r\n?/g, "\n").split("\n").filter(l => l.length > 0);
    if (!lines.length) return { headers: [], rows: [] };
    const splitLine = (line: string): string[] => {
        const out: string[] = [];
        let buf = "";
        let inQuote = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (inQuote) {
                if (ch === '"' && line[i + 1] === '"') { buf += '"'; i++; }
                else if (ch === '"') inQuote = false;
                else buf += ch;
            } else {
                if (ch === ",") { out.push(buf); buf = ""; }
                else if (ch === '"') inQuote = true;
                else buf += ch;
            }
        }
        out.push(buf);
        return out.map(s => s.trim());
    };
    const headers = splitLine(lines[0]);
    const rows = lines.slice(1).map(l => {
        const cells = splitLine(l);
        const obj: Record<string, string> = {};
        headers.forEach((h, i) => { obj[h] = cells[i] || ""; });
        return obj;
    });
    return { headers, rows };
}

function guessField(header: string): string {
    const h = header.toLowerCase().trim();
    if (/^e[-_ ]?mail/.test(h) || h === "email" || h === "email address") return "email";
    if (/phone|mobile|cell/.test(h)) return "phone";
    if (h === "first" || h === "firstname" || h === "first name" || h === "first_name") return "first_name";
    if (h === "last" || h === "lastname" || h === "last name" || h === "last_name") return "last_name";
    if (/^comp(any)?|account|organization/.test(h)) return "company_name";
    if (h === "title" || h === "job title" || h === "jobtitle" || h === "role") return "title";
    if (h === "state" || h === "region") return "state";
    if (/naics/.test(h)) return "naics_codes";
    if (/^tag/.test(h)) return "tags";
    return "";
}

export default function ImportContactsModal({ onClose, onImported }: Props) {
    const [tab, setTab] = useState<Tab>("csv");
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // CSV state
    const [csvText, setCsvText] = useState("");
    const [columnMap, setColumnMap] = useState<Record<string, string>>({});
    const [overwrite, setOverwrite] = useState(false);
    const [defaultTagsCsv, setDefaultTagsCsv] = useState("");
    const fileRef = useRef<HTMLInputElement>(null);

    // HubSpot state
    const [hsLifecyclestage, setHsLifecyclestage] = useState("");
    const [hsLimit, setHsLimit] = useState(500);
    const [hsPreview, setHsPreview] = useState<any[] | null>(null);

    // SAM state
    const [samNaics, setSamNaics] = useState("");
    const [samAgencies, setSamAgencies] = useState("");
    const [samStates, setSamStates] = useState("");
    const [samLimit, setSamLimit] = useState(500);
    const [samPreview, setSamPreview] = useState<any[] | null>(null);

    // Apollo state
    const [apolloNaics, setApolloNaics] = useState("");
    const [apolloStates, setApolloStates] = useState("");
    const [apolloPerPage, setApolloPerPage] = useState(25);
    const [apolloPreview, setApolloPreview] = useState<any[] | null>(null);

    const parsed = useMemo(() => csvText ? parseCsv(csvText) : { headers: [], rows: [] }, [csvText]);

    const onFile = async (f: File) => {
        const text = await f.text();
        setCsvText(text);
        // Auto-map columns once on file load.
        const { headers } = parseCsv(text);
        const m: Record<string, string> = {};
        for (const h of headers) m[h] = guessField(h);
        setColumnMap(m);
        setResult(null);
        setError(null);
    };

    const importCsv = async () => {
        if (!parsed.rows.length) return setError("No rows to import");
        if (!Object.values(columnMap).includes("email")) return setError("At least one column must map to Email");
        setBusy(true); setError(null); setResult(null);
        try {
            const res = await fetch("/api/admin/outreach/contacts/import-csv", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    rows: parsed.rows,
                    column_map: columnMap,
                    overwrite,
                    default_tags: defaultTagsCsv.split(/[,;]/).map(s => s.trim()).filter(Boolean),
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Import failed");
            setResult(`Inserted ${data.inserted}, updated ${data.updated}, skipped ${data.skipped} of ${data.total_processed}.`);
            onImported();
        } catch (e: any) {
            setError(e.message);
        } finally {
            setBusy(false);
        }
    };

    const runHubspot = async (dryRun: boolean) => {
        setBusy(true); setError(null); setResult(null);
        try {
            const res = await fetch("/api/admin/outreach/contacts/sync-hubspot", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    lifecyclestage: hsLifecyclestage || undefined,
                    limit: hsLimit,
                    dry_run: dryRun,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "HubSpot sync failed");
            if (dryRun) {
                setHsPreview(data.preview || []);
                setResult(`Preview: ${data.total_available} contacts available.`);
            } else {
                setResult(`Inserted ${data.inserted}, updated ${data.updated} of ${data.total_processed}.`);
                onImported();
            }
        } catch (e: any) {
            setError(e.message);
        } finally {
            setBusy(false);
        }
    };

    const runSam = async (dryRun: boolean) => {
        setBusy(true); setError(null); setResult(null);
        try {
            const res = await fetch("/api/admin/outreach/contacts/import-sam-poc", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    naics: samNaics.split(/[,;\s]+/).filter(Boolean),
                    agencies: samAgencies.split(/[,;]+/).map(s => s.trim()).filter(Boolean),
                    states: samStates.split(/[,;\s]+/).map(s => s.toUpperCase()).filter(Boolean),
                    limit: samLimit,
                    dry_run: dryRun,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "SAM import failed");
            if (dryRun) {
                setSamPreview(data.preview || []);
                setResult(`Preview: ${data.total_available} SAM POCs found.`);
            } else {
                setResult(`Inserted ${data.inserted}, updated ${data.updated} of ${data.total_processed}.`);
                onImported();
            }
        } catch (e: any) {
            setError(e.message);
        } finally {
            setBusy(false);
        }
    };

    const runApollo = async (dryRun: boolean) => {
        setBusy(true); setError(null); setResult(null);
        try {
            const res = await fetch("/api/admin/outreach/contacts/search-apollo", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    naics: apolloNaics.split(/[,;\s]+/).filter(Boolean),
                    states: apolloStates.split(/[,;\s]+/).map(s => s.toUpperCase()).filter(Boolean),
                    per_page: apolloPerPage,
                    dry_run: dryRun,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Apollo search failed");
            if (dryRun) {
                setApolloPreview(data.preview || []);
                setResult(`Preview: ${data.total_available} companies found. 1 Apollo credit used.`);
            } else {
                setResult(`Inserted ${data.inserted}, updated ${data.updated} of ${data.total_processed}.`);
                onImported();
            }
        } catch (e: any) {
            setError(e.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
                <header className="flex items-center justify-between p-5 border-b border-stone-200">
                    <h2 className="font-bold text-base inline-flex items-center gap-2"><Upload className="w-4 h-4" /> Import Contacts</h2>
                    <button onClick={onClose} className="text-stone-400 hover:text-black"><X className="w-5 h-5" /></button>
                </header>

                <div className="border-b border-stone-200 px-5 flex gap-1 overflow-x-auto">
                    {[
                        { id: "csv", label: "CSV upload", Icon: FileText },
                        { id: "hubspot", label: "HubSpot sync", Icon: Database },
                        { id: "sam", label: "SAM.gov POCs", Icon: Building2 },
                        { id: "apollo", label: "Apollo search", Icon: Search },
                    ].map(t => (
                        <button
                            key={t.id}
                            type="button"
                            onClick={() => { setTab(t.id as Tab); setResult(null); setError(null); }}
                            className={clsx(
                                "px-4 py-3 text-sm font-bold inline-flex items-center gap-2 border-b-2 transition-colors",
                                tab === t.id ? "border-orange-600 text-black" : "border-transparent text-stone-500 hover:text-black"
                            )}
                        >
                            <t.Icon className="w-4 h-4" /> {t.label}
                        </button>
                    ))}
                </div>

                <div className="overflow-auto p-5 space-y-4 flex-1">
                    {error && (
                        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg px-3 py-2 flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {error}
                        </div>
                    )}
                    {result && (
                        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-lg px-3 py-2 flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> {result}
                        </div>
                    )}

                    {tab === "csv" && (
                        <div className="space-y-4">
                            <div>
                                <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); }} className="hidden" />
                                <button
                                    type="button"
                                    onClick={() => fileRef.current?.click()}
                                    className="w-full border-2 border-dashed border-stone-300 hover:border-orange-400 rounded-xl p-8 text-center transition-colors"
                                >
                                    <Upload className="w-8 h-8 text-stone-400 mx-auto mb-2" />
                                    <p className="text-sm font-bold text-stone-700">{parsed.rows.length > 0 ? `${parsed.rows.length} rows loaded` : "Drop CSV or click to upload"}</p>
                                    <p className="text-xs text-stone-500 mt-1">First row is the header. Columns get auto-mapped below.</p>
                                </button>
                            </div>

                            {parsed.headers.length > 0 && (
                                <>
                                    <div>
                                        <h3 className="text-xs font-bold uppercase tracking-wide text-stone-500 mb-2">Column mapping</h3>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                            {parsed.headers.map(h => (
                                                <div key={h} className="flex items-center gap-2">
                                                    <span className="text-xs text-stone-700 flex-1 truncate" title={h}>{h}</span>
                                                    <ChevronDown className="w-3 h-3 text-stone-400" />
                                                    <select
                                                        value={columnMap[h] || ""}
                                                        onChange={e => setColumnMap(m => ({ ...m, [h]: e.target.value }))}
                                                        className="px-2 py-1.5 text-xs rounded border border-stone-200 bg-white focus:outline-none focus:border-stone-400 min-w-[140px]"
                                                    >
                                                        {ALLOWED_FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                                                    </select>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div>
                                        <h3 className="text-xs font-bold uppercase tracking-wide text-stone-500 mb-2">Preview (first 10)</h3>
                                        <div className="overflow-auto border border-stone-200 rounded-lg max-h-60">
                                            <table className="w-full text-[10px]">
                                                <thead className="bg-stone-50 text-stone-500"><tr>
                                                    {parsed.headers.map(h => <th key={h} className="px-2 py-1.5 text-left">{h}<br /><span className="text-[9px] font-normal text-stone-400">{columnMap[h] || "—"}</span></th>)}
                                                </tr></thead>
                                                <tbody>
                                                    {parsed.rows.slice(0, 10).map((r, i) => (
                                                        <tr key={i} className="border-b border-stone-100">
                                                            {parsed.headers.map(h => <td key={h} className="px-2 py-1 truncate max-w-[120px]">{r[h]}</td>)}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-4">
                                        <label className="text-xs text-stone-700 inline-flex items-center gap-2">
                                            <input type="checkbox" checked={overwrite} onChange={e => setOverwrite(e.target.checked)} className="rounded border-stone-300" />
                                            Overwrite existing contacts (match by email)
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="Default tags (comma-separated)"
                                            value={defaultTagsCsv}
                                            onChange={e => setDefaultTagsCsv(e.target.value)}
                                            className="px-2 py-1.5 text-xs rounded border border-stone-200 focus:outline-none focus:border-stone-400 flex-1"
                                        />
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {tab === "hubspot" && (
                        <div className="space-y-4">
                            <p className="text-xs text-stone-500">Pulls contacts from HubSpot via the CRM v3 search API. Free-tier safe: capped at 1,000 per call.</p>
                            <div className="grid grid-cols-2 gap-3">
                                <label className="block">
                                    <span className="text-[10px] font-bold uppercase text-stone-500">Lifecycle stage filter (optional)</span>
                                    <input
                                        type="text"
                                        placeholder="e.g. salesqualifiedlead"
                                        value={hsLifecyclestage}
                                        onChange={e => setHsLifecyclestage(e.target.value)}
                                        className="w-full mt-1 px-2 py-2 text-xs rounded-lg border border-stone-200 focus:outline-none focus:border-stone-400"
                                    />
                                </label>
                                <label className="block">
                                    <span className="text-[10px] font-bold uppercase text-stone-500">Limit</span>
                                    <input
                                        type="number"
                                        min={1}
                                        max={1000}
                                        value={hsLimit}
                                        onChange={e => setHsLimit(Number(e.target.value))}
                                        className="w-full mt-1 px-2 py-2 text-xs rounded-lg border border-stone-200 focus:outline-none focus:border-stone-400"
                                    />
                                </label>
                            </div>
                            <PreviewGrid rows={hsPreview} />
                        </div>
                    )}

                    {tab === "sam" && (
                        <div className="space-y-4">
                            <p className="text-xs text-stone-500">Pulls POC contacts from the SAM.gov ingested opportunities you already have. Filter by NAICS / agency / state.</p>
                            <div className="grid grid-cols-2 gap-3">
                                <label className="block">
                                    <span className="text-[10px] font-bold uppercase text-stone-500">NAICS prefixes</span>
                                    <input value={samNaics} onChange={e => setSamNaics(e.target.value)} placeholder="e.g. 5413, 541330" className="w-full mt-1 px-2 py-2 text-xs rounded-lg border border-stone-200" />
                                </label>
                                <label className="block">
                                    <span className="text-[10px] font-bold uppercase text-stone-500">Agencies</span>
                                    <input value={samAgencies} onChange={e => setSamAgencies(e.target.value)} placeholder="e.g. DEPT OF DEFENSE" className="w-full mt-1 px-2 py-2 text-xs rounded-lg border border-stone-200" />
                                </label>
                                <label className="block">
                                    <span className="text-[10px] font-bold uppercase text-stone-500">States</span>
                                    <input value={samStates} onChange={e => setSamStates(e.target.value)} placeholder="e.g. VA, DC, MD" className="w-full mt-1 px-2 py-2 text-xs rounded-lg border border-stone-200" />
                                </label>
                                <label className="block">
                                    <span className="text-[10px] font-bold uppercase text-stone-500">Limit</span>
                                    <input type="number" min={1} max={5000} value={samLimit} onChange={e => setSamLimit(Number(e.target.value))} className="w-full mt-1 px-2 py-2 text-xs rounded-lg border border-stone-200" />
                                </label>
                            </div>
                            <PreviewGrid rows={samPreview} />
                        </div>
                    )}

                    {tab === "apollo" && (
                        <div className="space-y-4">
                            <p className="text-xs text-stone-500">Uses Apollo&apos;s <code>mixed_companies/search</code> (free tier). Counts against the monthly Apollo quota — start with a small page.</p>
                            <div className="grid grid-cols-2 gap-3">
                                <label className="block">
                                    <span className="text-[10px] font-bold uppercase text-stone-500">NAICS / industry keywords</span>
                                    <input value={apolloNaics} onChange={e => setApolloNaics(e.target.value)} placeholder="e.g. 5413, 541330" className="w-full mt-1 px-2 py-2 text-xs rounded-lg border border-stone-200" />
                                </label>
                                <label className="block">
                                    <span className="text-[10px] font-bold uppercase text-stone-500">States</span>
                                    <input value={apolloStates} onChange={e => setApolloStates(e.target.value)} placeholder="e.g. VA, DC" className="w-full mt-1 px-2 py-2 text-xs rounded-lg border border-stone-200" />
                                </label>
                                <label className="block">
                                    <span className="text-[10px] font-bold uppercase text-stone-500">Per page</span>
                                    <input type="number" min={1} max={25} value={apolloPerPage} onChange={e => setApolloPerPage(Number(e.target.value))} className="w-full mt-1 px-2 py-2 text-xs rounded-lg border border-stone-200" />
                                </label>
                            </div>
                            <PreviewGrid rows={apolloPreview} />
                        </div>
                    )}
                </div>

                <footer className="border-t border-stone-200 p-4 flex justify-end gap-2">
                    <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-stone-600 hover:text-black">Cancel</button>
                    {tab === "csv" && (
                        <button type="button" disabled={busy || !parsed.rows.length} onClick={importCsv} className="bg-orange-600 hover:bg-orange-700 disabled:opacity-40 text-white font-bold px-4 py-2 rounded-lg inline-flex items-center gap-2 text-sm">
                            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Import {parsed.rows.length} rows
                        </button>
                    )}
                    {tab === "hubspot" && (
                        <>
                            <button type="button" disabled={busy} onClick={() => runHubspot(true)} className="px-4 py-2 text-sm border border-stone-200 rounded-lg disabled:opacity-40">Preview</button>
                            <button type="button" disabled={busy} onClick={() => runHubspot(false)} className="bg-orange-600 hover:bg-orange-700 disabled:opacity-40 text-white font-bold px-4 py-2 rounded-lg inline-flex items-center gap-2 text-sm">
                                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />} Sync from HubSpot
                            </button>
                        </>
                    )}
                    {tab === "sam" && (
                        <>
                            <button type="button" disabled={busy} onClick={() => runSam(true)} className="px-4 py-2 text-sm border border-stone-200 rounded-lg disabled:opacity-40">Preview</button>
                            <button type="button" disabled={busy} onClick={() => runSam(false)} className="bg-orange-600 hover:bg-orange-700 disabled:opacity-40 text-white font-bold px-4 py-2 rounded-lg inline-flex items-center gap-2 text-sm">
                                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Building2 className="w-4 h-4" />} Import POCs
                            </button>
                        </>
                    )}
                    {tab === "apollo" && (
                        <>
                            <button type="button" disabled={busy} onClick={() => runApollo(true)} className="px-4 py-2 text-sm border border-stone-200 rounded-lg disabled:opacity-40">Preview (1 credit)</button>
                            <button type="button" disabled={busy} onClick={() => runApollo(false)} className="bg-orange-600 hover:bg-orange-700 disabled:opacity-40 text-white font-bold px-4 py-2 rounded-lg inline-flex items-center gap-2 text-sm">
                                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Search + add
                            </button>
                        </>
                    )}
                </footer>
            </div>
        </div>
    );
}

function PreviewGrid({ rows }: { rows: any[] | null }) {
    if (!rows || rows.length === 0) return null;
    return (
        <div className="border border-stone-200 rounded-lg overflow-auto max-h-60">
            <table className="w-full text-[10px]">
                <thead className="bg-stone-50 text-stone-500"><tr>
                    <th className="px-2 py-1.5 text-left">Email</th>
                    <th className="px-2 py-1.5 text-left">Name</th>
                    <th className="px-2 py-1.5 text-left">Company</th>
                    <th className="px-2 py-1.5 text-left">Title</th>
                    <th className="px-2 py-1.5 text-left">State</th>
                </tr></thead>
                <tbody>
                    {rows.slice(0, 30).map((r, i) => (
                        <tr key={i} className="border-b border-stone-100">
                            <td className="px-2 py-1 truncate max-w-[160px]">{r.email || "—"}</td>
                            <td className="px-2 py-1">{[r.first_name, r.last_name].filter(Boolean).join(" ") || "—"}</td>
                            <td className="px-2 py-1 truncate max-w-[140px]">{r.company_name || "—"}</td>
                            <td className="px-2 py-1 truncate max-w-[140px]">{r.title || "—"}</td>
                            <td className="px-2 py-1">{r.state || "—"}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
