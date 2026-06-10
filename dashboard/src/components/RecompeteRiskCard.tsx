import { ShieldAlert, AlertTriangle, TrendingUp, Info } from "lucide-react";
import clsx from "clsx";
import { createClient } from "@supabase/supabase-js";
import { getRecompeteRisk, getFlipCandidates } from "@/lib/pp-graph";
import { InfoTooltip } from "@/components/ui/InfoTooltip";

interface Props {
    oppId: string;
}

function bandClasses(band: "LOW" | "MODERATE" | "HIGH") {
    if (band === "HIGH") return "bg-rose-50 text-rose-800 border-rose-300";
    if (band === "MODERATE") return "bg-amber-50 text-amber-800 border-amber-300";
    return "bg-emerald-50 text-emerald-800 border-emerald-300";
}

/**
 * Server component. Reads the past-performance graph to estimate how likely
 * the incumbent on this opportunity gets unseated, plus the top primes who
 * have historically beaten them.
 *
 * Returns null when there's no incumbent on the opp or the graph is cold —
 * a flat "no data" panel would be noisy in the detail view.
 */
export default async function RecompeteRiskCard({ oppId }: Props) {
    const db = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );

    const { data: opp } = await db
        .from("opportunities")
        .select("id, agency, incumbent_contractor_uei, incumbent_contractor_name")
        .eq("id", oppId)
        .single();

    if (!opp || !opp.incumbent_contractor_uei) return null;

    const { data: incumbent } = await db
        .from("contractors")
        .select("id, legal_business_name")
        .eq("uei", opp.incumbent_contractor_uei)
        .maybeSingle();

    const incumbentId = (incumbent?.id as string) ?? null;
    if (!incumbentId) return null;

    const [risk, candidates] = await Promise.all([
        getRecompeteRisk(db, incumbentId, oppId),
        getFlipCandidates(db, incumbentId, (opp.agency as string) ?? null, 5),
    ]);

    // Stay quiet when the graph has nothing to say.
    if (risk.sample_size === 0 && candidates.length === 0) return null;

    const pct = Math.round(risk.risk_score * 100);
    const incumbentName = (incumbent?.legal_business_name as string)
        ?? (opp.incumbent_contractor_name as string)
        ?? "the incumbent";

    return (
        <div className="bg-white rounded-2xl sm:rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
            <div className="bg-rose-50/60 border-b border-rose-100 px-4 sm:px-8 py-4 sm:py-5 flex items-center justify-between">
                <h2 className="text-base sm:text-lg font-bold flex items-center text-rose-900">
                    <TrendingUp className="w-5 h-5 mr-2 sm:mr-3 text-rose-600" />
                    Recompete Risk
                    <InfoTooltip text="How likely the incumbent gets unseated on this recompete, based on their past wins and losses in the same agency / NAICS." />
                </h2>
                <span className={clsx("text-xs font-bold px-3 py-1 rounded-full border", bandClasses(risk.risk_band))}>
                    {risk.risk_band}
                </span>
            </div>

            <div className="p-4 sm:p-8 space-y-5">
                <div className="flex items-baseline gap-3">
                    <span className="text-4xl font-bold text-stone-900">{pct}%</span>
                    <span className="text-sm text-stone-500">
                        flip likelihood for {incumbentName}
                    </span>
                </div>

                <div className="w-full h-2 bg-stone-100 rounded-full overflow-hidden">
                    <div
                        className={clsx(
                            "h-full transition-all",
                            risk.risk_band === "HIGH" && "bg-rose-500",
                            risk.risk_band === "MODERATE" && "bg-amber-500",
                            risk.risk_band === "LOW" && "bg-emerald-500",
                        )}
                        style={{ width: `${pct}%` }}
                    />
                </div>

                <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="bg-stone-50 rounded-lg p-3 border border-stone-100">
                        <div className="text-xs text-stone-500 uppercase tracking-wider">Held</div>
                        <div className="text-xl font-bold text-stone-900 mt-1">{risk.incumbent_win_count}</div>
                    </div>
                    <div className="bg-stone-50 rounded-lg p-3 border border-stone-100">
                        <div className="text-xs text-stone-500 uppercase tracking-wider">Lost</div>
                        <div className="text-xl font-bold text-stone-900 mt-1">{risk.incumbent_loss_count}</div>
                    </div>
                    <div className="bg-stone-50 rounded-lg p-3 border border-stone-100">
                        <div className="text-xs text-stone-500 uppercase tracking-wider">Beaten by</div>
                        <div className="text-xl font-bold text-stone-900 mt-1">{risk.competing_primes}</div>
                    </div>
                </div>

                {candidates.length > 0 && (
                    <div className="border-t border-stone-100 pt-4">
                        <div className="text-xs font-semibold text-stone-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                            <ShieldAlert className="w-3.5 h-3.5 text-rose-500" />
                            Primes who beat this incumbent
                        </div>
                        <ul className="space-y-2">
                            {candidates.map((c) => (
                                <li key={c.contractor_id} className="flex items-center justify-between text-sm bg-stone-50 rounded-lg px-3 py-2 border border-stone-100">
                                    <span className="font-medium text-stone-800 truncate pr-3">
                                        {c.name ?? c.uei ?? "Unknown contractor"}
                                    </span>
                                    <span className="text-xs text-stone-500 whitespace-nowrap">
                                        {c.wins_vs_target} {c.wins_vs_target === 1 ? "win" : "wins"}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {risk.notes.length > 0 && (
                    <div className="border-t border-stone-100 pt-4 space-y-1.5">
                        {risk.notes.map((note, i) => (
                            <div key={i} className="flex items-start gap-2 text-xs text-stone-500">
                                <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-stone-400" />
                                <span>{note}</span>
                            </div>
                        ))}
                    </div>
                )}

                {risk.risk_band === "HIGH" && (
                    <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-rose-600 mt-0.5 flex-shrink-0" />
                        <div className="text-xs text-rose-900">
                            <span className="font-semibold">Worth chasing.</span>{" "}
                            The incumbent has lost more than they've held in this lane. Talk to the primes above about teaming.
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
