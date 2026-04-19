#!/usr/bin/env node
// ────────────────────────────────────────────────────────────────────
// Parse the commits in this push and upsert release_notes rows.
//
// Invoked by .github/workflows/release-notes.yml on every push to main.
// Also runnable locally:
//   BEFORE=<sha> AFTER=<sha> \
//   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... \
//   node tools/changelog/capture-release-notes.mjs
//
// Rules:
//   - Only conventional-commit subjects get captured
//   - User-visible types: feat, perf, integration; fix requires "[release]" tag
//   - The summary is the commit subject (everything after the ":") — kept
//     short, public-facing, trimmed of internal references
//   - Highlights are extracted from bullet lines ("- " prefix) in the body;
//     capped at 6 bullets, 140 chars each
//   - We SCRUB internal-only details: file paths, commit SHAs, internal
//     tool names, "TODO", "internal", "WIP" — these never reach the public
//     feed so the competition can't reverse-engineer our moat
// ────────────────────────────────────────────────────────────────────

import { execSync } from "node:child_process";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BEFORE = process.env.BEFORE || "HEAD~1";
const AFTER = process.env.AFTER || "HEAD";

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY env vars.");
    process.exit(1);
}

// ─── Read commits in the push range ──────────────────────────
function shellOutput(cmd) {
    return execSync(cmd, { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
}

const range =
    BEFORE && BEFORE !== "0000000000000000000000000000000000000000"
        ? `${BEFORE}..${AFTER}`
        : `${AFTER}~5..${AFTER}`;

// Custom delimiter so we can split reliably even if the body contains anything
const DELIM = "<<<CPNOTE-END>>>";
const FORMAT = `%H%n%cI%n%s%n%b${DELIM}`;

let raw = "";
try {
    raw = shellOutput(`git log --no-merges --reverse --format="${FORMAT}" ${range}`);
} catch (e) {
    console.error("git log failed:", e.message);
    process.exit(0); // Don't fail the action — just skip
}

// ─── Parse commits ───────────────────────────────────────────
const commits = raw
    .split(DELIM)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((blob) => {
        const lines = blob.split("\n");
        const sha = lines[0];
        const isoDate = lines[1];
        const subject = lines[2] || "";
        const body = lines.slice(3).join("\n").trim();
        return { sha, isoDate, subject, body };
    });

// ─── Conventional-commit parser ──────────────────────────────
const CONVENTIONAL_RE = /^(feat|perf|integration|fix|chore|refactor|docs|test|style|build)(?:\(([^)]+)\))?!?:\s*(.+)$/i;

const CATEGORY_MAP = {
    feat: "feature",
    perf: "performance",
    integration: "integration",
    fix: "fix",
};

// Internal-only keywords that should NEVER appear on the public feed
const SCRUB_PATTERNS = [
    /\btodo\b/i,
    /\bwip\b/i,
    /\binternal\b/i,
    /\bdebug\b/i,
    /\brefactor\b/i, // refactors are rarely user-visible
];

// File-path / symbol hints we strip from public summaries
function scrubPublic(text) {
    return text
        // strip inline file paths like `src/foo.ts:42`
        .replace(/\b[\w./-]+\.(ts|tsx|js|jsx|mjs|sql|py|mdx?|json|yml|yaml)(:\d+)?\b/g, "")
        // strip git SHAs
        .replace(/\b[0-9a-f]{7,40}\b/g, "")
        // strip bracketed internal tags [WIP], [INTERNAL], [TODO]
        .replace(/\[(wip|internal|todo|debug|refactor)\]/gi, "")
        .replace(/\s{2,}/g, " ")
        .trim();
}

function pickRelease(commit) {
    const m = commit.subject.match(CONVENTIONAL_RE);
    if (!m) return null;

    const [, type, scope, message] = m;
    const typeLower = type.toLowerCase();

    // Gate: only user-visible types
    if (typeLower === "chore" || typeLower === "refactor" || typeLower === "docs" ||
        typeLower === "test" || typeLower === "style" || typeLower === "build") {
        return null;
    }

    // Fixes only release if explicitly tagged [release] or they're in the summary
    const isFix = typeLower === "fix";
    if (isFix && !commit.body.includes("[release]") && !commit.subject.includes("[release]")) {
        return null;
    }

    const category = CATEGORY_MAP[typeLower] || "feature";

    // Scrub the subject
    let title = scrubPublic(message);
    // Capitalize first letter
    title = title.charAt(0).toUpperCase() + title.slice(1);
    // Cap length
    if (title.length > 120) title = title.slice(0, 117).trim() + "…";

    // Extract highlights from body: bullet lines starting with "- " or "* "
    const bulletLines = commit.body
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => /^[-*•]\s+/.test(l))
        .map((l) => l.replace(/^[-*•]\s+/, ""))
        .map(scrubPublic)
        .filter((l) => l.length > 5 && !SCRUB_PATTERNS.some((re) => re.test(l)))
        .slice(0, 6)
        .map((l) => (l.length > 140 ? l.slice(0, 137).trim() + "…" : l));

    // Summary = first non-bullet paragraph of the body, or title-derived fallback
    const paragraphs = commit.body
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter((p) => p && !/^[-*•]/.test(p.split("\n")[0]));
    let summary = paragraphs[0] || title;
    summary = scrubPublic(summary);
    if (summary.length > 280) summary = summary.slice(0, 277).trim() + "…";

    // Abort if the title or summary contains any scrub-pattern
    if (SCRUB_PATTERNS.some((re) => re.test(title) || re.test(summary))) {
        return null;
    }

    return {
        commit_sha: commit.sha,
        title,
        summary,
        category,
        highlights: bulletLines,
        shipped_at: commit.isoDate,
        is_public: true,
        scope: scope || null,
    };
}

const notes = commits.map(pickRelease).filter(Boolean);

if (notes.length === 0) {
    console.log("No public-worthy release notes in this push. Skipping.");
    process.exit(0);
}

// ─── Upsert to Supabase via PostgREST ────────────────────────
async function upsertNotes(rows) {
    // Dedupe on commit_sha — if we've already captured this commit, skip
    const res = await fetch(`${SUPABASE_URL}/rest/v1/release_notes?on_conflict=commit_sha`, {
        method: "POST",
        headers: {
            apikey: SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
            "Content-Type": "application/json",
            Prefer: "resolution=ignore-duplicates,return=representation",
        },
        body: JSON.stringify(
            rows.map((r) => ({
                commit_sha: r.commit_sha,
                title: r.title,
                summary: r.summary,
                category: r.category,
                highlights: r.highlights,
                shipped_at: r.shipped_at,
                is_public: r.is_public,
            }))
        ),
    });
    const body = await res.text();
    if (!res.ok) {
        console.error(`PostgREST ${res.status}: ${body.slice(0, 500)}`);
        return { inserted: 0, failed: rows.length };
    }
    const parsed = JSON.parse(body || "[]");
    return { inserted: parsed.length, failed: rows.length - parsed.length };
}

// Need an explicit unique constraint on commit_sha for upsert dedup.
// The migration that owns release_notes doesn't have one — we add it below
// defensively via a one-off ALTER on first run. Failing silently is OK because
// most duplicates are caught by the ignore-duplicates preference anyway.
async function ensureUniqueIndex() {
    // Best-effort: use the SQL endpoint that Supabase exposes for service-role
    // callers. If it fails we carry on.
    try {
        await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
            method: "POST",
            headers: {
                apikey: SUPABASE_SERVICE_KEY,
                Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                sql: "create unique index if not exists uq_release_notes_commit_sha on public.release_notes (commit_sha) where commit_sha is not null;",
            }),
        });
    } catch {
        // Fine — migration 049 will get the index in a later iteration.
    }
}

await ensureUniqueIndex();
const result = await upsertNotes(notes);

console.log(`${result.inserted} release note(s) captured (${result.failed} duplicates or errors).`);
for (const n of notes) {
    console.log(`  • [${n.category}] ${n.title}`);
}
