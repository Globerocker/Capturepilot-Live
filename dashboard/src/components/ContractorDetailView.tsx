"use client";

import { useEffect, useState } from "react";
import {
    Building2, Mail, Phone, User, MapPin, ExternalLink, Globe, Shield,
    Award, Trophy, Sparkles, Loader2, AlertTriangle, Target,
    CheckCircle2, Briefcase, Calendar, Hash, TrendingUp,
} from "lucide-react";
import { PastAwardsPanel } from "@/components/PastAwardsPanel";

/**
 * Shared rich detail view for contractors / partners / competitors.
 * Mounts on /contract-winners/[uei], /partners/[id], /competitors/[id].
 *
 * Loads in three async waves so the page paints fast:
 *   1. Synchronous header (props passed in by parent)
 *   2. Contractor detail (POC + past-awards summary) from /api/contractors/[uei]
 *   3. AI analysis (strengths/weaknesses) from /api/intelligence/contractor-analysis
 *
 * Each section degrades gracefully — missing data = subtle "not available"
 * rather than blocking the rest of the page.
 */

interface AgencyAward { name: string; amount: number; count: number }
interface NaicsAward { code: string; description: string; amount: number; count: number }

interface ContractorRow {
    uei: string;
    cage_code?: string | null;
    company_name: string;
    dba_name?: string | null;
    state?: string | null;
    city?: string | null;
    naics_codes?: string[] | null;
    primary_naics_code?: string | null;
    email?: string | null;
    direct_phone?: string | null;
    primary_poc_name?: string | null;
    primary_poc_title?: string | null;
    business_url?: string | null;
    certifications?: string[] | null;
    federal_awards_count?: number | null;
    total_award_volume?: number | null;
    last_award_date?: string | null;
    agency_relationships?: AgencyAward[] | null;
    naics_awards?: NaicsAward[] | null;
}

interface IncumbentOpp {
    id: string;
    title: string;
    agency: string | null;
    response_deadline: string | null;
    link: string | null;
    source: string | null;
    estimated_value: number | null;
}

interface DetailResponse {
    ok: boolean;
    contractor: ContractorRow;
    incumbent_on_active_opps: IncumbentOpp[];
}

interface AIAnalysis {
    strengths: string[];
    weaknesses: string[];
    partnership_angle: string;
    ideal_partner_profile: string;
    win_signals: string[];
}

function fmtMoney(n: number | null | undefined): string {
    if (!n) return "—";
    if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
    return `$${Math.round(n)}`;
}

function fmtDate(iso: string | null | undefined): string {
    if (!iso) return "—";
    try { return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }); }
    catch { return iso; }
}

function Section({ label, icon: Icon, children, accent }: {
    label: string; icon: typeof Building2; children: React.ReactNode; accent?: string;
}) {
    return (
        <div className="bg-white border border-stone-200 rounded-2xl p-5">
            <div className={`flex items-center gap-2 mb-3 ${accent || "text-stone-700"}`}>
                <Icon className="w-4 h-4" />
                <h3 className="text-xs font-bold uppercase tracking-wide">{label}</h3>
            </div>
            {children}
        </div>
    );
}

export function ContractorDetailView({ uei, fallbackName }: { uei: string; fallbackName?: string }) {
    const [detail, setDetail] = useState<DetailResponse | null>(null);
    const [analysis, setAnalysis] = useState<AIAnalysis | null>(null);
    const [analysisLoading, setAnalysisLoading] = useState(false);
    const [analysisError, setAnalysisError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                const res = await fetch(`/api/contractors/${encodeURIComponent(uei)}`);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const json = await res.json() as DetailResponse;
                if (cancelled) return;
                setDetail(json);
                // Surface cached AI analysis immediately if we have it.
                const cached = (json.contractor as unknown as Record<string, unknown>).capability_summary_ai as AIAnalysis | null;
                if (cached) setAnalysis(cached);
            } catch (e) {
                if (!cancelled) setError((e as Error).message);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [uei]);

    async function generateAnalysis(force = false) {
        setAnalysisLoading(true);
        setAnalysisError(null);
        try {
            const res = await fetch("/api/intelligence/contractor-analysis", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ uei, force }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            setAnalysis(json.analysis as AIAnalysis);
        } catch (e) {
            setAnalysisError((e as Error).message);
        } finally {
            setAnalysisLoading(false);
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 text-stone-400 animate-spin" />
            </div>
        );
    }
    if (error || !detail) {
        return (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-sm text-amber-900">
                <AlertTriangle className="w-5 h-5 mb-2" />
                {error || "Contractor not found"} — UEI {uei}
            </div>
        );
    }

    const c = detail.contractor;
    const hasAwards = (c.federal_awards_count ?? 0) > 0;
    const displayName = c.company_name || fallbackName || c.uei;

    return (
        <div className="space-y-4">
            {/* Header card — POC + identity */}
            <Section label="Snapshot" icon={Building2}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <div>
                            <div className="text-lg font-bold text-stone-900">{displayName}</div>
                            {c.dba_name && <div className="text-xs text-stone-500">DBA: {c.dba_name}</div>}
                        </div>
                        <div className="flex items-center gap-3 flex-wrap text-xs text-stone-600">
                            {(c.city || c.state) && (
                                <span className="inline-flex items-center gap-1">
                                    <MapPin className="w-3 h-3" />
                                    {[c.city, c.state].filter(Boolean).join(", ")}
                                </span>
                            )}
                            <span className="font-mono text-stone-400">UEI: {c.uei}</span>
                            {c.cage_code && <span className="font-mono text-stone-400">CAGE: {c.cage_code}</span>}
                        </div>
                        {Array.isArray(c.certifications) && c.certifications.length > 0 && (
                            <div className="flex flex-wrap gap-1 pt-1">
                                {c.certifications.map((cert, i) => (
                                    <span key={i} className="text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded">
                                        {cert}
                                    </span>
                                ))}
                            </div>
                        )}
                        {Array.isArray(c.naics_codes) && c.naics_codes.length > 0 && (
                            <div className="flex flex-wrap gap-1 pt-1">
                                {c.naics_codes.slice(0, 8).map((n, i) => (
                                    <span key={i} className="text-[10px] font-mono bg-stone-100 text-stone-600 px-1.5 py-0.5 rounded">
                                        {n}{n === c.primary_naics_code ? "★" : ""}
                                    </span>
                                ))}
                                {c.naics_codes.length > 8 && <span className="text-[10px] text-stone-400">+{c.naics_codes.length - 8}</span>}
                            </div>
                        )}
                    </div>
                    <div className="space-y-1.5 text-sm">
                        {(c.primary_poc_name || c.email || c.direct_phone) ? (
                            <>
                                {c.primary_poc_name && (
                                    <div className="flex items-center gap-2 text-stone-700">
                                        <User className="w-3.5 h-3.5 text-stone-400" />
                                        <span className="font-medium">{c.primary_poc_name}</span>
                                        {c.primary_poc_title && <span className="text-xs text-stone-500">· {c.primary_poc_title}</span>}
                                    </div>
                                )}
                                {c.email && (
                                    <a href={`mailto:${c.email}`} className="flex items-center gap-2 text-blue-600 hover:text-blue-800">
                                        <Mail className="w-3.5 h-3.5" />
                                        <span className="text-sm">{c.email}</span>
                                    </a>
                                )}
                                {c.direct_phone && (
                                    <a href={`tel:${c.direct_phone}`} className="flex items-center gap-2 text-stone-700 hover:text-stone-900">
                                        <Phone className="w-3.5 h-3.5 text-stone-400" />
                                        <span className="text-sm">{c.direct_phone}</span>
                                    </a>
                                )}
                                {c.business_url && (
                                    <a href={c.business_url.startsWith("http") ? c.business_url : `https://${c.business_url}`}
                                        target="_blank" rel="noopener noreferrer"
                                        className="flex items-center gap-2 text-stone-700 hover:text-stone-900">
                                        <Globe className="w-3.5 h-3.5 text-stone-400" />
                                        <span className="text-sm truncate max-w-[260px]">{c.business_url.replace(/^https?:\/\//, "")}</span>
                                        <ExternalLink className="w-3 h-3 text-stone-400" />
                                    </a>
                                )}
                            </>
                        ) : (
                            <div className="text-xs text-stone-400 italic">No POC on file — typically enriched within 24h.</div>
                        )}
                        <a href={`https://sam.gov/entity/${c.uei}/coreData`} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-2 text-xs text-stone-500 hover:text-blue-600 pt-1">
                            <Shield className="w-3 h-3" />
                            View on SAM.gov <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                    </div>
                </div>
            </Section>

            {/* Past awards KPIs */}
            {hasAwards && (
                <Section label="Federal Past Performance" icon={Trophy} accent="text-amber-700">
                    <div className="grid grid-cols-3 gap-3">
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                            <div className="text-[10px] font-bold uppercase tracking-wide text-amber-700">Federal Awards</div>
                            <div className="text-2xl font-bold text-amber-900 mt-1 tabular-nums">{c.federal_awards_count}</div>
                        </div>
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                            <div className="text-[10px] font-bold uppercase tracking-wide text-amber-700">Total Volume</div>
                            <div className="text-2xl font-bold text-amber-900 mt-1 tabular-nums">{fmtMoney(c.total_award_volume)}</div>
                        </div>
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                            <div className="text-[10px] font-bold uppercase tracking-wide text-amber-700">Last Award</div>
                            <div className="text-sm font-bold text-amber-900 mt-1">{fmtDate(c.last_award_date)}</div>
                        </div>
                    </div>

                    {Array.isArray(c.agency_relationships) && c.agency_relationships.length > 0 && (
                        <div className="mt-4">
                            <div className="text-xs font-bold text-stone-600 mb-2">Top Agencies</div>
                            <div className="space-y-1">
                                {c.agency_relationships.slice(0, 5).map((a, i) => (
                                    <div key={i} className="flex items-center justify-between text-sm py-1 border-b border-stone-100 last:border-0">
                                        <span className="text-stone-700">{a.name}</span>
                                        <span className="text-xs text-stone-500 tabular-nums">{fmtMoney(a.amount)} · {a.count}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {Array.isArray(c.naics_awards) && c.naics_awards.length > 0 && (
                        <div className="mt-4">
                            <div className="text-xs font-bold text-stone-600 mb-2">Top NAICS by Award Volume</div>
                            <div className="space-y-1">
                                {c.naics_awards.slice(0, 5).map((n, i) => (
                                    <div key={i} className="flex items-center justify-between text-sm py-1 border-b border-stone-100 last:border-0">
                                        <span className="text-stone-700">
                                            <span className="font-mono text-xs text-stone-500">{n.code}</span> {n.description}
                                        </span>
                                        <span className="text-xs text-stone-500 tabular-nums">{fmtMoney(n.amount)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </Section>
            )}

            {/* Embed PastAwardsPanel — pulls live from USASpending too,
                in case the cached aggregates above are stale. */}
            <PastAwardsPanel name={c.company_name} uei={c.uei} compact />

            {/* AI strengths/weaknesses */}
            <Section label="AI Analysis" icon={Sparkles} accent="text-violet-700">
                {analysis ? (
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 mb-2">
                                    <CheckCircle2 className="w-3 h-3" /> Strengths
                                </div>
                                <ul className="space-y-1">
                                    {analysis.strengths.map((s, i) => (
                                        <li key={i} className="text-xs text-emerald-900 flex items-start gap-1.5 leading-relaxed">
                                            <span className="text-emerald-600 mt-0.5">•</span> {s}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-amber-700 mb-2">
                                    <AlertTriangle className="w-3 h-3" /> Watch-outs
                                </div>
                                <ul className="space-y-1">
                                    {analysis.weaknesses.map((s, i) => (
                                        <li key={i} className="text-xs text-amber-900 flex items-start gap-1.5 leading-relaxed">
                                            <span className="text-amber-600 mt-0.5">•</span> {s}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>

                        {analysis.partnership_angle && (
                            <div className="bg-violet-50 border border-violet-200 rounded-lg p-3">
                                <div className="text-[10px] font-bold uppercase tracking-wide text-violet-700 mb-1.5">Partnership Angle</div>
                                <p className="text-sm text-violet-900 leading-relaxed">{analysis.partnership_angle}</p>
                                {analysis.ideal_partner_profile && (
                                    <p className="text-xs text-violet-700 mt-2 italic">Ideal partner: {analysis.ideal_partner_profile}</p>
                                )}
                            </div>
                        )}

                        {analysis.win_signals && analysis.win_signals.length > 0 && (
                            <div>
                                <div className="text-[10px] font-bold uppercase tracking-wide text-stone-600 mb-2 flex items-center gap-1.5">
                                    <TrendingUp className="w-3 h-3" /> Win Signals
                                </div>
                                <ul className="space-y-1">
                                    {analysis.win_signals.map((s, i) => (
                                        <li key={i} className="text-xs text-stone-700 flex items-start gap-1.5 leading-relaxed">
                                            <span className="text-stone-400 mt-0.5">•</span> {s}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        <div className="pt-2 flex items-center justify-between">
                            <span className="text-[10px] text-stone-400">Generated via Ollama on VPS — free, private.</span>
                            <button
                                type="button"
                                onClick={() => generateAnalysis(true)}
                                disabled={analysisLoading}
                                className="text-[10px] text-stone-500 hover:text-blue-600 underline disabled:opacity-50"
                            >
                                {analysisLoading ? "Regenerating…" : "Regenerate"}
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="text-center py-6">
                        {analysisError ? (
                            <p className="text-xs text-amber-700 mb-2">{analysisError}</p>
                        ) : (
                            <p className="text-xs text-stone-500 mb-3">
                                Generate strengths, weaknesses, and partnership angle from past performance + cert mix.
                            </p>
                        )}
                        <button
                            type="button"
                            onClick={() => generateAnalysis(false)}
                            disabled={analysisLoading}
                            className="inline-flex items-center gap-2 text-xs font-medium bg-violet-100 text-violet-800 hover:bg-violet-200 px-3 py-1.5 rounded-lg disabled:opacity-50"
                        >
                            {analysisLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                            {analysisLoading ? "Analyzing…" : "Generate Analysis"}
                        </button>
                    </div>
                )}
            </Section>

            {/* Active opps where this contractor is the incumbent */}
            {detail.incumbent_on_active_opps.length > 0 && (
                <Section label={`Currently Working On (${detail.incumbent_on_active_opps.length})`} icon={Target} accent="text-blue-700">
                    <div className="space-y-2">
                        {detail.incumbent_on_active_opps.map(opp => (
                            <a key={opp.id} href={`/opportunities/${opp.id}`}
                                className="block p-3 bg-stone-50 hover:bg-blue-50 border border-stone-200 hover:border-blue-300 rounded-lg transition-colors">
                                <div className="text-sm font-medium text-stone-900 line-clamp-1">{opp.title}</div>
                                <div className="text-[11px] text-stone-500 mt-1 flex items-center gap-3 flex-wrap">
                                    {opp.agency && <span className="inline-flex items-center gap-1"><Briefcase className="w-3 h-3" />{opp.agency}</span>}
                                    {opp.response_deadline && <span className="inline-flex items-center gap-1"><Calendar className="w-3 h-3" />Due {fmtDate(opp.response_deadline)}</span>}
                                    {opp.estimated_value && <span>{fmtMoney(opp.estimated_value)}</span>}
                                </div>
                            </a>
                        ))}
                    </div>
                </Section>
            )}
        </div>
    );
}
