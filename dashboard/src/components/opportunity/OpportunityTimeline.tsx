"use client";

import { Calendar } from "lucide-react";
import clsx from "clsx";

interface Props {
    posted_date?: string | null;
    response_deadline?: string | null;
    award_date?: string | null;
    pop_end?: string | null;
}

interface Milestone {
    key: string;
    label: string;
    date: Date;
    color: string;
}

function fmt(d: Date): string {
    return d.toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" });
}

export default function OpportunityTimeline({ posted_date, response_deadline, award_date, pop_end }: Props) {
    const raw: Array<Omit<Milestone, "date"> & { iso: string | null | undefined }> = [
        { key: "posted", label: "Solicitation Date", iso: posted_date, color: "bg-blue-500" },
        { key: "deadline", label: "Response Due", iso: response_deadline, color: "bg-amber-500" },
        { key: "award", label: "Award / Start", iso: award_date, color: "bg-emerald-500" },
        { key: "pop_end", label: "Period End", iso: pop_end, color: "bg-rose-500" },
    ];

    const milestones: Milestone[] = raw
        .map((m) => {
            if (!m.iso) return null;
            const d = new Date(m.iso);
            if (isNaN(d.getTime())) return null;
            return { key: m.key, label: m.label, date: d, color: m.color } as Milestone;
        })
        .filter((m): m is Milestone => m !== null)
        .sort((a, b) => a.date.getTime() - b.date.getTime());

    if (milestones.length < 2) return null;

    const minT = milestones[0].date.getTime();
    const maxT = milestones[milestones.length - 1].date.getTime();
    const span = Math.max(1, maxT - minT);
    const now = Date.now();
    const nowPct = ((now - minT) / span) * 100;
    const showNow = nowPct > 1 && nowPct < 99;

    return (
        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-5 sm:p-7">
            <h3 className="text-sm font-bold text-stone-800 mb-10 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-stone-400" /> Timeline
            </h3>
            <div className="relative h-24 mx-3 sm:mx-6">
                <div className="absolute left-0 right-0 top-1/2 h-px bg-stone-200" />
                {showNow && (
                    <div className="absolute left-0 top-1/2 h-px bg-stone-400" style={{ width: `${nowPct}%` }} />
                )}
                {showNow && (
                    <div
                        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2"
                        style={{ left: `${nowPct}%` }}
                    >
                        <div className="w-px h-3 bg-stone-400 -mt-1.5" />
                        <span className="absolute top-2 left-1/2 -translate-x-1/2 text-[9px] text-stone-400 uppercase tracking-widest whitespace-nowrap">
                            now
                        </span>
                    </div>
                )}
                {milestones.map((m, i) => {
                    const pct = ((m.date.getTime() - minT) / span) * 100;
                    const above = i % 2 === 0;
                    return (
                        <div
                            key={m.key}
                            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2"
                            style={{ left: `${pct}%` }}
                        >
                            <div className={clsx("w-3 h-3 rounded-full ring-2 ring-white shadow", m.color)} />
                            <div
                                className={clsx(
                                    "absolute whitespace-nowrap rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 shadow-sm",
                                    above ? "bottom-6 left-1/2 -translate-x-1/2" : "top-6 left-1/2 -translate-x-1/2",
                                )}
                            >
                                <div className="flex items-center gap-1.5">
                                    <span className={clsx("w-1.5 h-1.5 rounded-full", m.color)} />
                                    <span className="text-[9px] text-stone-400 uppercase tracking-widest">{m.label}</span>
                                </div>
                                <div className="text-xs font-semibold text-stone-700 mt-0.5">{fmt(m.date)}</div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
