/**
 * Cron-specific status pills layered on top of the generic StatusBadge.
 *
 * Two badges, two vocabularies:
 *
 *   - <RunStatusBadge status="ok|error|partial|running|null">
 *     Maps the `cron_runs.status` enum onto the shared StatusBadge tones.
 *
 *   - <HealthBadge health="green|amber|red|unknown">
 *     Maps the computed "freshness vs expected interval" bucket onto a
 *     consistent palette ("fresh / stale / down / unknown").
 *
 * Kept in components/admin/health/ so any future category (db, queue, email)
 * that needs to surface run-status or health-freshness can pull these in
 * without re-deriving the mapping.
 */
"use client";

import { StatusBadge, type StatusTone } from "./StatusBadge";

export function RunStatusBadge({ status }: { status: string | null }) {
    // cron_runs status enum → shared StatusBadge tone
    let tone: StatusTone = "unknown";
    let label = "—";
    if (status === "ok") { tone = "ok"; label = "ok"; }
    else if (status === "error") { tone = "error"; label = "error"; }
    else if (status === "partial") { tone = "warn"; label = "partial"; }
    else if (status === "running") { tone = "unknown"; label = "running"; }
    else if (status) { label = status; }
    return <StatusBadge tone={tone} label={label} />;
}

export type HealthLevel = "green" | "amber" | "red" | "unknown";

export function HealthBadge({ health }: { health: HealthLevel }) {
    // "fresh / stale / down / unknown" — using the shared tone palette
    if (health === "green") return <StatusBadge tone="ok" label="fresh" />;
    if (health === "amber") return <StatusBadge tone="warn" label="stale" />;
    if (health === "red") return <StatusBadge tone="error" label="down" />;
    return <StatusBadge tone="unknown" label="unknown" />;
}
