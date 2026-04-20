"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createBrowserClient } from "@supabase/ssr";
import {
    ArrowLeft, RefreshCcw, Loader2, Save, Plus, X, Check,
    Building2, Users, Phone, Mail, MapPin, Award, Target, Globe, AlertTriangle,
    ChevronRight, Sparkles,
} from "lucide-react";
import clsx from "clsx";

const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

interface QuickCheckData {
    ran_at: string;
    source: "firecrawl" | "fetch-fallback" | "mixed";
    website: string;
    pages_scraped: string[];
    duration_ms: number;
    extraction: {
        company_name: string;
        tagline: string | null;
        short_description: string;
        long_description: string;
        industries_served: string[];
        services: Array<{ name: string; description: string }>;
        products: string[];
        differentiators: string[];
        capability_keywords: Array<{ keyword: string; tier: "primary" | "secondary" }>;
        leadership: Array<{ name: string; title: string; email: string | null; phone: string | null; linkedin_url: string | null; is_decision_maker: boolean }>;
        contacts: Array<{ email: string | null; phone: string | null; phone_type: string | null }>;
        headquarters_city: string | null;
        headquarters_state: string | null;
        service_areas: string[];
        founded_year: number | null;
        employee_count_estimate: number | null;
        certifications: Array<{ type: string; evidence: string; confidence: number }>;
        partnerships: Array<{ partner: string; kind: string }>;
        past_customers: string[];
        awards: string[];
        has_gov_experience: boolean;
        gov_experience_evidence: string[];
        social_links: { linkedin: string | null; facebook: string | null; twitter: string | null; youtube: string | null };
    };
    naics_suggestions: Array<{ code: string; label: string; confidence: number; matched_keywords: string[]; source: string }>;
    sam_data: Record<string, unknown> | null;
    usaspending: { award_count: number; total_value: number; agencies: string[]; naics_codes: string[] } | null;
    errors: string[];
}

interface Profile {
    id: string;
    company_name: string;
    website: string | null;
    naics_codes: string[];
    primary_keywords: string[] | null;
    secondary_keywords: string[] | null;
    contact_name: string | null;
    contact_phone: string | null;
    state: string | null;
    notes: { quick_check?: QuickCheckData } | null;
}

export default function AdminQuickCheckerPage() {
    const params = useParams();
    const clientId = params.id as string;
    const [profile, setProfile] = useState<Profile | null>(null);
    const [loading, setLoading] = useState(true);
    const [running, setRunning] = useState(false);
    const [saving, setSaving] = useState(false);
    const [savedFlash, setSavedFlash] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const [naics, setNaics] = useState<string[]>([]);
    const [primary, setPrimary] = useState<string[]>([]);
    const [secondary, setSecondary] = useState<string[]>([]);
    const [contactName, setContactName] = useState("");
    const [contactPhone, setContactPhone] = useState("");

    const loadProfile = useCallback(async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from("user_profiles")
            .select("id, company_name, website, naics_codes, primary_keywords, secondary_keywords, contact_name, contact_phone, state, notes")
            .eq("id", clientId)
            .single();
        if (error) { setErr(error.message); setLoading(false); return; }
        const p = data as unknown as Profile;
        setProfile(p);
        setNaics(p.naics_codes || []);
        setPrimary(p.primary_keywords || []);
        setSecondary(p.secondary_keywords || []);
        setContactName(p.contact_name || "");
        setContactPhone(p.contact_phone || "");
        setLoading(false);
    }, [clientId]);

    useEffect(() => { loadProfile(); }, [loadProfile]);

    async function runQuickCheck() {
        setRunning(true);
        setErr(null);
        try {
            const res = await fetch("/api/admin/enrich-profile", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ user_profile_id: clientId, force: true }),
            });
            const payload = await res.json();
            if (!res.ok) throw new Error(payload.error || "Quick Check failed");
            await loadProfile();
        } catch (e) {
            setErr((e as Error).message);
        } finally {
            setRunning(false);
        }
    }

    async function saveEdits() {
        setSaving(true);
        setErr(null);
        try {
            const res = await fetch("/api/admin/clients", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    user_profile_id: clientId,
                    naics_codes: naics,
                    primary_keywords: primary,
                    secondary_keywords: secondary,
                    contact_name: contactName || null,
                    contact_phone: contactPhone || null,
                }),
            });
            const payload = await res.json();
            if (!res.ok) throw new Error(payload.error || "Save failed");
            setSavedFlash(true);
            setTimeout(() => setSavedFlash(false), 2000);
            await loadProfile();
        } catch (e) {
            setErr((e as Error).message);
        } finally {
            setSaving(false);
        }
    }

    function acceptNaics(code: string) {
        setNaics(prev => prev.includes(code) ? prev : [...prev, code]);
    }
    function removeNaics(code: string) {
        setNaics(prev => prev.filter(c => c !== code));
    }
    function addKeyword(tier: "primary" | "secondary", kw: string) {
        const clean = kw.trim().toLowerCase();
        if (!clean) return;
        if (tier === "primary") setPrimary(prev => prev.includes(clean) ? prev : [...prev, clean]);
        else setSecondary(prev => prev.includes(clean) ? prev : [...prev, clean]);
    }
    function removeKeyword(tier: "primary" | "secondary", kw: string) {
        if (tier === "primary") setPrimary(prev => prev.filter(k => k !== kw));
        else setSecondary(prev => prev.filter(k => k !== kw));
    }

    if (loading) {
        return <div className="p-8"><Loader2 className="w-6 h-6 animate-spin" /></div>;
    }
    if (!profile) {
        return <div className="p-8 text-red-600">Profile not found{err ? `: ${err}` : ""}</div>;
    }

    const qc = profile.notes?.quick_check;

    return (
        <div className="max-w-6xl mx-auto p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Link href={`/admin/clients/${clientId}`} className="p-2 rounded hover:bg-gray-100">
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <div>
                        <h1 className="text-2xl font-semibold flex items-center gap-2">
                            <Sparkles className="w-6 h-6 text-indigo-600" />
                            Quick Checker — {profile.company_name}
                        </h1>
                        <p className="text-sm text-gray-600">
                            {profile.website ? (
                                <a href={profile.website} target="_blank" rel="noopener" className="hover:underline">
                                    {profile.website}
                                </a>
                            ) : <span className="text-orange-600">No website on profile</span>}
                        </p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={runQuickCheck}
                        disabled={running || !profile.website}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-indigo-600 text-white text-sm hover:bg-indigo-700 disabled:opacity-50"
                    >
                        {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
                        {running ? "Running…" : qc ? "Re-run Quick Check" : "Run Quick Check"}
                    </button>
                    <button
                        onClick={saveEdits}
                        disabled={saving}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-emerald-600 text-white text-sm hover:bg-emerald-700 disabled:opacity-50"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Save changes
                    </button>
                </div>
            </div>

            {err && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" /> {err}
                </div>
            )}
            {savedFlash && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded flex items-center gap-2">
                    <Check className="w-4 h-4" /> Changes saved.
                </div>
            )}

            {!qc && (
                <div className="p-6 border-2 border-dashed border-gray-300 rounded-lg text-center text-gray-500">
                    No Quick Check has been run for this client yet. Click <strong>Run Quick Check</strong> above.
                </div>
            )}

            {qc && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
                    <Metric label="Source" value={qc.source} />
                    <Metric label="Pages scraped" value={String(qc.pages_scraped.length)} />
                    <Metric label="Duration" value={`${Math.round(qc.duration_ms / 100) / 10}s`} />
                    <Metric label="Ran at" value={new Date(qc.ran_at).toLocaleString()} />
                </div>
            )}

            {qc && (
                <>
                    {/* Extraction summary */}
                    <Card title="Company Profile" icon={Building2}>
                        <dl className="grid grid-cols-2 gap-4 text-sm">
                            <Field label="Detected name" value={qc.extraction.company_name} />
                            <Field label="Tagline" value={qc.extraction.tagline || "—"} />
                            <Field label="Founded" value={qc.extraction.founded_year?.toString() || "—"} />
                            <Field label="Employees" value={qc.extraction.employee_count_estimate?.toString() || "—"} />
                            <Field label="HQ" value={[qc.extraction.headquarters_city, qc.extraction.headquarters_state].filter(Boolean).join(", ") || "—"} />
                            <Field label="Gov experience?" value={qc.extraction.has_gov_experience ? "Yes" : "No"} />
                        </dl>
                        <div className="mt-4">
                            <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">Description</div>
                            <p className="text-sm text-gray-800 whitespace-pre-wrap">{qc.extraction.long_description || qc.extraction.short_description}</p>
                        </div>
                    </Card>

                    {/* NAICS Suggestions (editable) */}
                    <Card title="NAICS Codes" icon={Target}>
                        <p className="text-xs text-gray-500 mb-3">
                            Click <kbd className="px-1 bg-gray-100 rounded">+</kbd> to accept a suggestion, <kbd className="px-1 bg-gray-100 rounded">×</kbd> to remove.
                            Profile currently has: <strong>{naics.length}</strong>.
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {qc.naics_suggestions.map(s => {
                                const isAccepted = naics.includes(s.code);
                                return (
                                    <div key={s.code} className={clsx(
                                        "flex items-start justify-between gap-3 p-3 rounded border text-sm",
                                        isAccepted ? "bg-emerald-50 border-emerald-200" : "bg-white border-gray-200",
                                    )}>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="font-mono font-semibold">{s.code}</span>
                                                <span className="text-gray-800">{s.label}</span>
                                                <span className={clsx(
                                                    "text-xs px-1.5 py-0.5 rounded",
                                                    s.source === "sam" ? "bg-blue-100 text-blue-800" :
                                                    s.source === "usaspending" ? "bg-violet-100 text-violet-800" :
                                                    s.source === "ai" ? "bg-indigo-100 text-indigo-800" :
                                                    "bg-gray-100 text-gray-700",
                                                )}>{s.source}</span>
                                                <span className="text-xs text-gray-500">{Math.round(s.confidence * 100)}%</span>
                                            </div>
                                            <p className="text-xs text-gray-600 mt-1 truncate">{s.matched_keywords[0] || ""}</p>
                                        </div>
                                        <button
                                            onClick={() => isAccepted ? removeNaics(s.code) : acceptNaics(s.code)}
                                            className={clsx(
                                                "shrink-0 w-7 h-7 rounded-full flex items-center justify-center",
                                                isAccepted ? "bg-emerald-600 text-white hover:bg-red-600" : "bg-gray-200 hover:bg-indigo-600 hover:text-white",
                                            )}
                                            title={isAccepted ? "Remove from profile" : "Add to profile"}
                                        >
                                            {isAccepted ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="mt-4">
                            <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">Manually add NAICS</div>
                            <ChipAdder placeholder="6-digit NAICS code" onAdd={(v) => /^\d{6}$/.test(v) && acceptNaics(v)} />
                        </div>
                    </Card>

                    {/* Keywords */}
                    <Card title="Capability Keywords" icon={Sparkles}>
                        <p className="text-xs text-gray-500 mb-3">
                            Primary keywords get full match weight; secondary get 40%. Edit the lists to tune the matcher.
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <KeywordList
                                title="Primary"
                                tone="indigo"
                                keywords={primary}
                                suggestions={qc.extraction.capability_keywords.filter(k => k.tier === "primary").map(k => k.keyword)}
                                onAdd={(k) => addKeyword("primary", k)}
                                onRemove={(k) => removeKeyword("primary", k)}
                            />
                            <KeywordList
                                title="Secondary"
                                tone="slate"
                                keywords={secondary}
                                suggestions={qc.extraction.capability_keywords.filter(k => k.tier === "secondary").map(k => k.keyword)}
                                onAdd={(k) => addKeyword("secondary", k)}
                                onRemove={(k) => removeKeyword("secondary", k)}
                            />
                        </div>
                    </Card>

                    {/* Decision Maker + Leadership */}
                    <Card title="Decision-Maker + Leadership" icon={Users}>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            <div>
                                <label className="text-xs uppercase tracking-wide text-gray-500 mb-1 block">Primary contact name</label>
                                <input
                                    type="text"
                                    value={contactName}
                                    onChange={e => setContactName(e.target.value)}
                                    className="w-full border rounded px-3 py-2 text-sm"
                                    placeholder="Jane Doe"
                                />
                            </div>
                            <div>
                                <label className="text-xs uppercase tracking-wide text-gray-500 mb-1 block">Primary contact phone</label>
                                <input
                                    type="text"
                                    value={contactPhone}
                                    onChange={e => setContactPhone(e.target.value)}
                                    className="w-full border rounded px-3 py-2 text-sm"
                                    placeholder="(555) 555-1234"
                                />
                            </div>
                        </div>
                        <div className="border-t pt-4">
                            <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">Leadership detected on site</div>
                            {qc.extraction.leadership.length === 0 ? (
                                <p className="text-sm text-gray-500">No leadership extracted.</p>
                            ) : (
                                <ul className="divide-y divide-gray-100 text-sm">
                                    {qc.extraction.leadership.map((l, i) => (
                                        <li key={i} className="py-2 flex items-start justify-between gap-3">
                                            <div>
                                                <div className="font-medium">
                                                    {l.name}
                                                    {l.is_decision_maker && (
                                                        <span className="ml-2 text-xs bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">decision maker</span>
                                                    )}
                                                </div>
                                                <div className="text-xs text-gray-600">{l.title}</div>
                                                <div className="text-xs text-gray-500 mt-0.5 flex flex-wrap gap-3">
                                                    {l.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{l.phone}</span>}
                                                    {l.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{l.email}</span>}
                                                    {l.linkedin_url && <a href={l.linkedin_url} target="_blank" rel="noopener" className="flex items-center gap-1 text-blue-600 hover:underline"><Globe className="w-3 h-3" />LinkedIn</a>}
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => { setContactName(l.name); if (l.phone) setContactPhone(l.phone); }}
                                                className="text-xs text-indigo-600 hover:underline"
                                            >
                                                Set as primary
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </Card>

                    {/* Industries + Services */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Card title="Industries Served" icon={MapPin}>
                            {qc.extraction.industries_served.length === 0 ? <p className="text-sm text-gray-500">None detected.</p> : (
                                <div className="flex flex-wrap gap-2">
                                    {qc.extraction.industries_served.map(i => (
                                        <span key={i} className="px-2 py-1 bg-blue-50 text-blue-800 rounded text-xs">{i}</span>
                                    ))}
                                </div>
                            )}
                        </Card>

                        <Card title="Certifications" icon={Award}>
                            {qc.extraction.certifications.length === 0 ? <p className="text-sm text-gray-500">None detected.</p> : (
                                <ul className="space-y-2 text-sm">
                                    {qc.extraction.certifications.map((c, i) => (
                                        <li key={i} className="flex items-start justify-between gap-3">
                                            <div>
                                                <div className="font-medium">{c.type}</div>
                                                <div className="text-xs text-gray-500 italic">&quot;{c.evidence}&quot;</div>
                                            </div>
                                            <span className="text-xs text-gray-600">{Math.round(c.confidence * 100)}%</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </Card>
                    </div>

                    <Card title="Services" icon={ChevronRight}>
                        {qc.extraction.services.length === 0 ? <p className="text-sm text-gray-500">None detected.</p> : (
                            <ul className="divide-y divide-gray-100 text-sm">
                                {qc.extraction.services.map((s, i) => (
                                    <li key={i} className="py-2">
                                        <div className="font-medium">{s.name}</div>
                                        <div className="text-xs text-gray-600">{s.description}</div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Card>

                    {(qc.extraction.past_customers.length > 0 || qc.extraction.partnerships.length > 0) && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {qc.extraction.past_customers.length > 0 && (
                                <Card title="Past Customers" icon={Users}>
                                    <div className="flex flex-wrap gap-2">
                                        {qc.extraction.past_customers.map(c => (
                                            <span key={c} className="px-2 py-1 bg-emerald-50 text-emerald-800 rounded text-xs">{c}</span>
                                        ))}
                                    </div>
                                </Card>
                            )}
                            {qc.extraction.partnerships.length > 0 && (
                                <Card title="Partnerships" icon={Award}>
                                    <ul className="text-sm space-y-1">
                                        {qc.extraction.partnerships.map((p, i) => (
                                            <li key={i} className="flex items-center gap-2">
                                                <span className="font-medium">{p.partner}</span>
                                                <span className="text-xs text-gray-500">({p.kind})</span>
                                            </li>
                                        ))}
                                    </ul>
                                </Card>
                            )}
                        </div>
                    )}

                    {qc.errors.length > 0 && (
                        <Card title="Pipeline Notices" icon={AlertTriangle}>
                            <ul className="text-xs text-amber-800 space-y-1">
                                {qc.errors.map((e, i) => <li key={i}>• {e}</li>)}
                            </ul>
                        </Card>
                    )}
                </>
            )}
        </div>
    );
}

function Card({ title, icon: Icon, children }: { title: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
    return (
        <section className="bg-white border border-gray-200 rounded-lg p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-4">
                <Icon className="w-4 h-4 text-gray-500" />
                {title}
            </h2>
            {children}
        </section>
    );
}

function Field({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <dt className="text-xs uppercase tracking-wide text-gray-500">{label}</dt>
            <dd className="text-gray-900">{value}</dd>
        </div>
    );
}

function Metric({ label, value }: { label: string; value: string }) {
    return (
        <div className="bg-white border border-gray-200 rounded p-3">
            <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
            <div className="text-sm font-medium mt-0.5">{value}</div>
        </div>
    );
}

function ChipAdder({ placeholder, onAdd }: { placeholder: string; onAdd: (v: string) => void }) {
    const [v, setV] = useState("");
    return (
        <form
            onSubmit={(e) => { e.preventDefault(); if (v.trim()) { onAdd(v.trim()); setV(""); } }}
            className="flex gap-2"
        >
            <input
                type="text"
                value={v}
                onChange={(e) => setV(e.target.value)}
                placeholder={placeholder}
                className="flex-1 border rounded px-3 py-1.5 text-sm"
            />
            <button type="submit" className="px-3 py-1.5 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700">
                <Plus className="w-4 h-4" />
            </button>
        </form>
    );
}

function KeywordList({ title, tone, keywords, suggestions, onAdd, onRemove }: {
    title: string;
    tone: "indigo" | "slate";
    keywords: string[];
    suggestions: string[];
    onAdd: (k: string) => void;
    onRemove: (k: string) => void;
}) {
    const active = new Set(keywords.map(k => k.toLowerCase()));
    const missing = suggestions.filter(s => !active.has(s.toLowerCase()));
    const pillBg = tone === "indigo" ? "bg-indigo-100 text-indigo-800" : "bg-slate-100 text-slate-800";
    return (
        <div>
            <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">{title} ({keywords.length})</div>
            <div className="flex flex-wrap gap-1 mb-3">
                {keywords.length === 0 && <span className="text-xs text-gray-400 italic">None.</span>}
                {keywords.map(k => (
                    <span key={k} className={clsx("inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs", pillBg)}>
                        {k}
                        <button onClick={() => onRemove(k)} className="hover:text-red-600"><X className="w-3 h-3" /></button>
                    </span>
                ))}
            </div>
            <ChipAdder placeholder={`Add ${title.toLowerCase()} keyword`} onAdd={onAdd} />
            {missing.length > 0 && (
                <div className="mt-3">
                    <div className="text-xs text-gray-500 mb-1">Suggestions from Quick Check:</div>
                    <div className="flex flex-wrap gap-1">
                        {missing.map(s => (
                            <button key={s} onClick={() => onAdd(s)} className="text-xs px-2 py-0.5 rounded bg-gray-50 text-gray-700 border border-gray-200 hover:bg-indigo-50 hover:text-indigo-800 hover:border-indigo-200">
                                + {s}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
