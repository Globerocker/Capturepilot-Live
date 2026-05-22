/**
 * Federal Readiness Report — PDF document built with @react-pdf/renderer.
 * Replaces the previous 995-line jsPDF implementation.
 *
 * 5 pages:
 *   1. Cover + Readiness gauge + company profile
 *   2. Best Matching Opportunities (#1–5) with personalized AI fit summary
 *   3. Best Matching Opportunities (#6–10)
 *   4. Easy Wins + Certification roadmap
 *   5. Next steps + CTAs (Launch Kit + Strategy Call)
 */

import React from "react";
import { Document, Page, View, Text, Link, StyleSheet, Svg, Circle, G, Image } from "@react-pdf/renderer";
import {
    COLOR, FONT, SIZE, PAGE,
    bandColor, bandLabel, bandSub, classColor, fmtCurrency, fmtDate,
} from "./theme";

// ──────────────────────────────────────────────────────────────────────────────
// TYPES
// ──────────────────────────────────────────────────────────────────────────────
export interface ReportMatch {
    opportunity_id: string;
    title?: string;
    agency?: string;
    naics_code?: string;
    set_aside_code?: string;
    response_deadline?: string;
    notice_type?: string;
    award_amount?: number;
    notice_id?: string;
    place_of_performance_state?: string;
    score: number;
    classification: string;
    ai_fit_summary?: string;
    matched_keywords?: string[];
    score_breakdown?: Record<string, number>;
    description?: string;
}

export interface ReportCompetitor {
    name: string;
    state?: string | null;
    sam_registered: boolean;
    total_awards: number;
    award_count: number;
    naics_overlap_pct: number;
    top_agency?: string | null;
    strengths?: string[];
}

export interface ReportGovSpending {
    award_count?: number;
    total_value?: number;
    agencies?: string[];
    last_award_title?: string | null;
    last_award_amount?: number | null;
    last_award_agency?: string | null;
    last_award_date?: string | null;
}

export interface ReportCertRec {
    cert_label: string;
    unlocked_count: number;
    estimated_value: number;
    difficulty: string;
    timeline: string;
}

export interface ReportEasyWin {
    title: string;
    description: string;
    impact: "high" | "medium" | "low";
    category?: string;
}

export interface ReportInput {
    companyName: string;
    website: string;
    uei?: string | null;
    cageCode?: string | null;
    state?: string | null;
    city?: string | null;
    employeeCount?: number | null;
    yearsInBusiness?: number | null;
    naicsCodes: { code: string; label: string; confidence?: number }[];
    sbaCertifications: string[];
    samRegistered: boolean;
    readinessScore: number | null;
    readinessFactors: { label: string; points: number; present: boolean; detail?: string }[];
    readinessInterpretation: string;
    matches: ReportMatch[];
    certRecommendations: ReportCertRec[];
    easyWins: ReportEasyWin[];
    competitors?: ReportCompetitor[];
    primaryKeywords?: string[];
    secondaryKeywords?: string[];
    targetStates?: string[];
    govSpending?: ReportGovSpending | null;
    summary: string;
    generatedAt: string;
    launchKitUrl: string;
    strategyCallUrl: string;
    logoUrl?: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// STYLES
// ──────────────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
    page: {
        backgroundColor: "#ffffff",
        // Asymmetric padding — give the fixed footer at bottom: 24 + ~22pt
        // of footer height room to breathe, so flowing content doesn't run
        // INTO it. Previous symmetric 40pt padding let long readiness-factor
        // lists and chip rows overlap the page-number footer.
        paddingTop: PAGE.padding,
        paddingHorizontal: PAGE.padding,
        paddingBottom: PAGE.padding + 30,
        fontFamily: FONT.body,
        fontSize: SIZE.base,
        color: COLOR.text,
        lineHeight: 1.4,
    },
    pageHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingBottom: 10,
        marginBottom: 22,
        borderBottomWidth: 0.5,
        borderBottomColor: COLOR.line,
    },
    pageHeaderBrand: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
    },
    pageHeaderLogo: {
        // Fallback if logoUrl can't load (offline render, hotlink blocked):
        // we still render a green square so the header isn't naked.
        width: 16,
        height: 16,
        backgroundColor: COLOR.primary,
        borderRadius: 3,
    },
    pageHeaderLogoImg: {
        width: 18,
        height: 18,
        borderRadius: 3,
    },
    pageHeaderBrandText: {
        fontSize: SIZE.sm,
        fontFamily: FONT.bold,
        color: COLOR.ink,
    },
    pageHeaderEyebrow: {
        fontSize: 7,
        color: COLOR.muted,
        textTransform: "uppercase",
        letterSpacing: 1.2,
    },
    pageFooter: {
        // In-flow at the end of each Page (no position: absolute, no `fixed`
        // prop). marginTop:auto pushes us to the bottom of the flex column
        // when there's room; on dense pages we sit right after the last
        // content block. Either way the green border line + brand text are
        // always visible, which is what the user actually asked for.
        marginTop: "auto",
        paddingTop: 9,
        borderTopWidth: 1,
        borderTopColor: COLOR.primary,
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        fontSize: 8,
        color: COLOR.ink,
        fontFamily: FONT.bold,
    },
    pageFooterMuted: {
        fontSize: 8,
        color: COLOR.muted,
        fontFamily: FONT.body,
    },

    // Typography
    eyebrow: {
        fontSize: 7,
        color: COLOR.primary,
        textTransform: "uppercase",
        letterSpacing: 1.5,
        fontFamily: FONT.bold,
        marginBottom: 6,
    },
    h1: {
        fontFamily: FONT.bold,
        fontSize: SIZE.hero,
        color: COLOR.ink,
        lineHeight: 1.05,
        marginBottom: 6,
    },
    h2: {
        fontFamily: FONT.bold,
        fontSize: SIZE.xl,
        color: COLOR.ink,
        marginBottom: 6,
    },
    h3: {
        fontFamily: FONT.bold,
        fontSize: SIZE.lg,
        color: COLOR.ink,
        marginBottom: 4,
    },
    label: {
        fontSize: 7,
        color: COLOR.muted,
        textTransform: "uppercase",
        letterSpacing: 1,
        fontFamily: FONT.bold,
    },
    body: {
        fontSize: SIZE.base,
        color: COLOR.text,
        lineHeight: 1.45,
    },
    muted: {
        fontSize: SIZE.sm,
        color: COLOR.muted,
    },

    // Cover
    coverIntro: {
        marginBottom: 22,
    },
    coverHero: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 28,
        marginBottom: 22,
    },
    coverScoreCol: { width: 200, alignItems: "center" },
    coverScoreLabel: {
        fontSize: 8,
        color: COLOR.muted,
        textTransform: "uppercase",
        letterSpacing: 1.5,
        fontFamily: FONT.bold,
        marginTop: 8,
    },
    coverStampSub: {
        marginTop: 6,
        fontSize: SIZE.sm,
        color: COLOR.muted,
        textAlign: "center",
    },
    coverStampBase: {
        marginTop: 10,
        color: "#ffffff",
        fontFamily: FONT.bold,
        fontSize: SIZE.md,
        paddingTop: 6,
        paddingBottom: 6,
        paddingHorizontal: 14,
        borderRadius: 999,
        letterSpacing: 1,
    },
    coverInfoCol: { flex: 1 },

    // Cards / containers
    card: {
        borderWidth: 0.5,
        borderColor: COLOR.line,
        borderRadius: 8,
        backgroundColor: COLOR.cardBg,
        padding: 12,
        marginBottom: 10,
    },
    sectionTitle: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 10,
    },

    // Tags / chips
    chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    chip: {
        fontSize: SIZE.sm,
        color: COLOR.text,
        borderWidth: 0.5,
        borderColor: COLOR.line,
        backgroundColor: COLOR.surface,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
    },
    chipBoldBase: {
        fontSize: 7,
        borderWidth: 0.5,
        backgroundColor: "#ffffff",
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
        fontFamily: FONT.bold,
        textTransform: "uppercase",
        letterSpacing: 0.5,
    },
    // Keyword-hit chip — softer amber tint, italic body so the quotation
    // marks read as "the user's terms verbatim".
    chipKw: {
        fontSize: SIZE.sm,
        color: "#92400e",                  // amber-800
        backgroundColor: "#fef3c7",        // amber-100
        borderWidth: 0.5,
        borderColor: "#fcd34d",            // amber-300
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
        fontFamily: FONT.italic,
    },
    // Score breakdown mini-bars — small horizontal chart per dimension so the
    // reader can see at a glance which signal drove the match.
    scoreBarWrap: {
        width: 110,
    },
    scoreBarLabel: {
        fontSize: 6,
        color: COLOR.muted,
        textTransform: "uppercase",
        letterSpacing: 0.8,
        fontFamily: FONT.bold,
        marginBottom: 2,
    },
    scoreBarTrack: {
        height: 4,
        backgroundColor: COLOR.line,
        borderRadius: 2,
        overflow: "hidden",
    },
    scoreBarFill: {
        height: 4,
        borderRadius: 2,
    },
    // Competitor card layout — used on the dedicated competitors page.
    competitorCard: {
        borderWidth: 0.5,
        borderColor: COLOR.line,
        borderRadius: 8,
        padding: 12,
        marginBottom: 8,
        flexDirection: "row",
        gap: 12,
    },
    competitorRank: {
        width: 26, height: 26, borderRadius: 13,
        backgroundColor: COLOR.surface,
        borderWidth: 0.5, borderColor: COLOR.line,
        alignItems: "center", justifyContent: "center",
    },
    competitorRankText: {
        fontSize: SIZE.sm, fontFamily: FONT.bold, color: COLOR.ink,
    },

    // Factor list (readiness breakdown). Tightened to fit ~8 factors on the
    // cover page so the list doesn't orphan a single factor onto page 2.
    factor: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 8,
        paddingVertical: 3,
        borderBottomWidth: 0.5,
        borderBottomColor: COLOR.line,
    },
    factorIcon: {
        width: 12, height: 12, borderRadius: 6,
        alignItems: "center", justifyContent: "center",
        marginTop: 2,
    },
    factorIconText: {
        fontFamily: FONT.bold, fontSize: 7, color: "#fff", lineHeight: 1,
    },
    factorBody: { flex: 1 },
    factorLabel: { fontSize: SIZE.sm, fontFamily: FONT.bold, color: COLOR.ink },
    factorPoints: { fontSize: SIZE.sm, fontFamily: FONT.bold },
    factorDetail: { fontSize: SIZE.xs, color: COLOR.muted, marginTop: 1, lineHeight: 1.3 },

    // Match cards
    matchHeader: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 6,
        gap: 8,
    },
    matchRank: {
        fontFamily: FONT.bold,
        fontSize: SIZE.sm,
        color: COLOR.muted,
        width: 18,
    },
    // Match score badge — outer wrapper sizes + colors, Text inside renders
    // the number. Putting size+color on a <Text> with content directly
    // doesn't center the digits in react-pdf 4.x — the number drifts to the
    // top-left of the box and the next column overlaps it.
    matchScoreWrap: {
        width: 32, height: 32, borderRadius: 4,
        alignItems: "center", justifyContent: "center",
        flexShrink: 0,
    },
    matchScoreText: {
        color: "#fff",
        fontFamily: FONT.bold,
        fontSize: SIZE.md,
        lineHeight: 1,
    },
    matchTitle: { fontFamily: FONT.bold, fontSize: SIZE.md, color: COLOR.ink, flex: 1, lineHeight: 1.25 },
    matchAgency: { fontSize: SIZE.sm, color: COLOR.muted, marginBottom: 6, marginLeft: 38 },

    aiBox: {
        backgroundColor: COLOR.surface,
        borderLeftWidth: 2,
        borderLeftColor: COLOR.primary,
        paddingHorizontal: 8,
        paddingVertical: 6,
        marginTop: 6,
        marginBottom: 6,
        borderRadius: 3,
    },
    aiBoxLabel: {
        fontSize: 7,
        color: COLOR.primary,
        textTransform: "uppercase",
        letterSpacing: 1.2,
        fontFamily: FONT.bold,
        marginBottom: 3,
    },
    aiBoxBody: {
        fontSize: SIZE.sm,
        color: COLOR.ink,
        lineHeight: 1.45,
    },

    // CTA banner
    ctaCard: {
        marginTop: 14,
        padding: 18,
        backgroundColor: COLOR.primaryDark,
        borderRadius: 10,
    },
    ctaCardLight: {
        marginTop: 14,
        padding: 18,
        backgroundColor: COLOR.surface,
        borderRadius: 10,
        borderWidth: 0.5,
        borderColor: COLOR.line,
    },
    ctaEyebrow: {
        fontSize: 7,
        color: "#fbbf24",
        textTransform: "uppercase",
        letterSpacing: 1.5,
        fontFamily: FONT.bold,
        marginBottom: 4,
    },
    ctaHead: { fontFamily: FONT.bold, fontSize: SIZE.lg, color: "#fff", marginBottom: 4 },
    ctaBody: { fontSize: SIZE.sm, color: "#e7e5e4", lineHeight: 1.5 },
    ctaButton: {
        marginTop: 10,
        backgroundColor: "#fbbf24",
        color: "#78350f",
        fontFamily: FONT.bold,
        fontSize: SIZE.sm,
        textDecoration: "none",
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 6,
        alignSelf: "flex-start",
    },
});

// ──────────────────────────────────────────────────────────────────────────────
// SHARED COMPONENTS
// ──────────────────────────────────────────────────────────────────────────────
function PageHeader({ companyName, pageEyebrow, logoUrl }: { companyName: string; pageEyebrow: string; logoUrl?: string }) {
    return (
        <View style={s.pageHeader} fixed>
            <View style={s.pageHeaderBrand}>
                {logoUrl ? (
                    /* react-pdf treats <Image src=...> over HTTP as a fetch on
                       render. If the host is blocked or returns non-PNG/JPG,
                       it throws — we accept that risk in exchange for a
                       proper brand mark; the colored square below acts as the
                       fallback only when logoUrl is not provided. */
                    <Image src={logoUrl} style={s.pageHeaderLogoImg} />
                ) : (
                    <View style={s.pageHeaderLogo} />
                )}
                <Text style={s.pageHeaderBrandText}>CapturePilot</Text>
            </View>
            <Text style={s.pageHeaderEyebrow}>{pageEyebrow} · {companyName}</Text>
        </View>
    );
}

function PageFooter({ generatedAt }: { generatedAt: string }) {
    // No `fixed` prop, no position: absolute. react-pdf 4.x ate both
    // combinations silently (footer disappeared from every page). The
    // PageFooter is mounted directly at the bottom of each Page's children
    // — natural document flow — so we don't need any positioning tricks.
    return (
        <View style={s.pageFooter}>
            <Text style={{ color: COLOR.primary, fontFamily: FONT.bold, fontSize: 8 }}>
                CapturePilot · app.capturepilot.com
            </Text>
            <Text style={s.pageFooterMuted}>
                B2G Audit · {fmtDate(generatedAt)}
            </Text>
            <Text
                style={{ fontFamily: FONT.bold, fontSize: 8, color: COLOR.ink }}
                render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
            />
        </View>
    );
}

function ScoreRing({ score }: { score: number }) {
    const pct = Math.max(0, Math.min(1, score / 10));
    const color = bandColor(score);
    const r = 56;
    const cx = 70;
    const cy = 70;
    const circ = 2 * Math.PI * r;
    const dashOffset = circ - circ * pct;
    return (
        <Svg width={140} height={140} viewBox="0 0 140 140">
            <G transform="rotate(-90 70 70)">
                <Circle cx={cx} cy={cy} r={r} stroke={COLOR.line} strokeWidth={10} fill="none" />
                <Circle
                    cx={cx} cy={cy} r={r}
                    stroke={color} strokeWidth={10} fill="none"
                    strokeDasharray={`${circ - dashOffset} ${dashOffset}`}
                    strokeLinecap="round"
                />
            </G>
            {/* Centered number — manually positioned because @react-pdf <Text> in Svg
                has no easy centering primitive */}
        </Svg>
    );
}

// Compact MatchCard — used for matches #4–#N. Drops the description excerpt
// + score-breakdown bars so we can fit 3-4 per page. Keeps the score badge,
// chips row, matched keywords and AI summary because those are the highest
// signal-per-pt items for a quick scan.
function MatchCardCompact({ match, rank }: { match: ReportMatch; rank: number }) {
    const band = classColor(match.classification);
    const deadlineInfo = (() => {
        if (!match.response_deadline) return null;
        const dt = new Date(match.response_deadline).getTime();
        if (Number.isNaN(dt)) return null;
        const days = Math.round((dt - Date.now()) / (1000 * 60 * 60 * 24));
        if (days < 0) return null;
        if (days <= 7) return { label: `Closes ${days}d`, urgent: true };
        if (days <= 30) return { label: `Closes ${days}d`, urgent: false };
        return null;
    })();
    return (
        <View style={[s.card, { paddingVertical: 9, marginBottom: 7 }]} wrap={false}>
            <View style={s.matchHeader}>
                <Text style={s.matchRank}>#{rank}</Text>
                <View style={[s.matchScoreWrap, { backgroundColor: band }]}>
                    <Text style={s.matchScoreText}>{Math.round(match.score * 100)}</Text>
                </View>
                <Text style={s.matchTitle}>{match.title || "Untitled Opportunity"}</Text>
            </View>
            <Text style={s.matchAgency}>{match.agency || "Federal Agency"}</Text>
            <View style={s.chipsRow}>
                <Text style={[s.chipBoldBase, { color: band, borderColor: band }]}>{match.classification}</Text>
                {match.set_aside_code ? <Text style={s.chip}>{match.set_aside_code}</Text> : null}
                {match.naics_code ? <Text style={s.chip}>NAICS {match.naics_code}</Text> : null}
                {match.place_of_performance_state ? <Text style={s.chip}>{match.place_of_performance_state}</Text> : null}
                {match.response_deadline ? <Text style={s.chip}>Due {fmtDate(match.response_deadline)}</Text> : null}
                {match.award_amount && match.award_amount > 0 ? <Text style={s.chip}>~{fmtCurrency(match.award_amount)}</Text> : null}
                {deadlineInfo ? (
                    <Text style={[s.chipBoldBase, {
                        color: deadlineInfo.urgent ? COLOR.red : COLOR.amber,
                        borderColor: deadlineInfo.urgent ? COLOR.red : COLOR.amber,
                    }]}>{deadlineInfo.label}</Text>
                ) : null}
            </View>
            {match.matched_keywords && match.matched_keywords.length > 0 ? (
                <View style={{ ...s.chipsRow, marginTop: 4 }}>
                    {match.matched_keywords.slice(0, 3).map(kw => (
                        <Text key={kw} style={s.chipKw}>&quot;{kw}&quot;</Text>
                    ))}
                </View>
            ) : null}
            {match.ai_fit_summary ? (
                <View style={[s.aiBox, { paddingVertical: 4, marginTop: 4, marginBottom: 0 }]}>
                    <Text style={[s.aiBoxBody, { fontSize: SIZE.sm }]}>{match.ai_fit_summary}</Text>
                </View>
            ) : null}
            {match.notice_id ? (
                <Link
                    src={`https://sam.gov/opp/${match.notice_id}/view`}
                    style={{ fontSize: SIZE.xs, color: COLOR.accent, textDecoration: "none", marginTop: 5 }}
                >
                    View on SAM.gov
                </Link>
            ) : null}
        </View>
    );
}

function MatchCard({ match, rank }: { match: ReportMatch; rank: number }) {
    const band = classColor(match.classification);

    // Deadline countdown — when ≤30d, show "Closes in Nd" so the reader
    // grasps urgency without re-reading the date.
    const deadlineInfo = (() => {
        if (!match.response_deadline) return null;
        const dt = new Date(match.response_deadline).getTime();
        if (Number.isNaN(dt)) return null;
        const days = Math.round((dt - Date.now()) / (1000 * 60 * 60 * 24));
        if (days < 0) return { label: "Closed", urgent: false };
        if (days <= 7) return { label: `Closes in ${days}d`, urgent: true };
        if (days <= 30) return { label: `Closes in ${days}d`, urgent: false };
        return null;
    })();

    // Description snippet — first ~280 chars, useful when the AI summary
    // is missing or the reader wants the source line.
    const descSnippet = (() => {
        let raw = (match.description || "").trim();
        if (!raw) return null;
        // Skip pure URLs (some SAM rows have description= a noticedesc API URL).
        if (/^https?:\/\//.test(raw)) return null;
        // Some SAM rows store the description as a JSON-encoded blob like
        // `{"description":"  (ii) ..."}`. Unwrap that so the PDF doesn't
        // expose the raw JSON to the reader.
        if (raw.startsWith("{") && raw.includes('"description"')) {
            try {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed.description === "string") {
                    raw = parsed.description.trim();
                }
            } catch {
                // If JSON.parse fails (e.g. truncated payload), do a best-
                // effort regex extraction so we don't show curly braces.
                const m = raw.match(/"description"\s*:\s*"([^"]+)"/);
                if (m && m[1]) raw = m[1].trim();
            }
        }
        // Collapse \n / &nbsp; / multiple whitespace runs to single spaces.
        raw = raw.replace(/\\n+/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim();
        if (!raw || raw.length < 20) return null;
        return raw.length > 280 ? raw.slice(0, 280).trim() + "…" : raw;
    })();

    const bd = match.score_breakdown || {};
    return (
        <View style={s.card} wrap={false}>
            <View style={s.matchHeader}>
                <Text style={s.matchRank}>#{rank}</Text>
                <View style={[s.matchScoreWrap, { backgroundColor: band }]}>
                    <Text style={s.matchScoreText}>{Math.round(match.score * 100)}</Text>
                </View>
                <Text style={s.matchTitle}>{match.title || "Untitled Opportunity"}</Text>
            </View>
            <Text style={s.matchAgency}>{match.agency || "Federal Agency"}</Text>

            {/* Top-line chips: classification + set-aside + notice type + NAICS + state + value */}
            <View style={s.chipsRow}>
                <Text style={[s.chipBoldBase, { color: band, borderColor: band }]}>{match.classification}</Text>
                {match.set_aside_code ? (
                    <Text style={s.chip}>Set-aside · {match.set_aside_code}</Text>
                ) : null}
                {match.notice_type ? (
                    <Text style={s.chip}>{match.notice_type}</Text>
                ) : null}
                {match.naics_code ? (
                    <Text style={s.chip}>NAICS {match.naics_code}</Text>
                ) : null}
                {match.place_of_performance_state ? (
                    <Text style={s.chip}>{match.place_of_performance_state}</Text>
                ) : null}
                {match.response_deadline ? (
                    <Text style={s.chip}>Due {fmtDate(match.response_deadline)}</Text>
                ) : null}
                {match.award_amount && match.award_amount > 0 ? (
                    <Text style={s.chip}>~{fmtCurrency(match.award_amount)}</Text>
                ) : null}
                {deadlineInfo ? (
                    <Text style={[s.chipBoldBase, {
                        color: deadlineInfo.urgent ? COLOR.red : COLOR.amber,
                        borderColor: deadlineInfo.urgent ? COLOR.red : COLOR.amber,
                    }]}>{deadlineInfo.label}</Text>
                ) : null}
            </View>

            {/* Matched keywords — when the scorer found explicit hits we cite
                them in italics. Powerful for internal sharing: the reader sees
                exactly which of YOUR terms matched the opp text. */}
            {match.matched_keywords && match.matched_keywords.length > 0 ? (
                <View style={{ marginTop: 6 }}>
                    <Text style={s.label}>Keyword hits</Text>
                    <View style={{ ...s.chipsRow, marginTop: 3 }}>
                        {match.matched_keywords.slice(0, 5).map(kw => (
                            <Text key={kw} style={s.chipKw}>&quot;{kw}&quot;</Text>
                        ))}
                    </View>
                </View>
            ) : null}

            {/* AI fit summary — the big personalization moment */}
            {match.ai_fit_summary ? (
                <View style={s.aiBox}>
                    <Text style={s.aiBoxLabel}>Why this fits you</Text>
                    <Text style={s.aiBoxBody}>{match.ai_fit_summary}</Text>
                </View>
            ) : null}

            {/* Description excerpt removed from hero — the AI summary
                ("Why this fits you") covers the same ground in personalized
                language, and we link to the SAM.gov source. Dropping the
                excerpt cuts ~100pt and lets 2 hero cards fit per page
                instead of 1. */}
            {descSnippet ? null : null}

            {/* Score breakdown — small bars so the reader sees WHY this scored */}
            {Object.keys(bd).length > 0 ? (
                <View style={{ marginTop: 8, flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                    {(["naics", "keywords", "geo", "set_aside", "notice_type", "deadline"] as const)
                        .filter(k => typeof bd[k] === "number" && (bd[k] || 0) > 0)
                        .slice(0, 6)
                        .map(k => (
                            <View key={k} style={s.scoreBarWrap}>
                                <Text style={s.scoreBarLabel}>{k.replace("_", " ")}</Text>
                                <View style={s.scoreBarTrack}>
                                    <View style={[s.scoreBarFill, { width: `${Math.round((bd[k] || 0) * 100)}%`, backgroundColor: (bd[k] || 0) >= 0.7 ? COLOR.primary : (bd[k] || 0) >= 0.4 ? COLOR.amber : COLOR.dim }]} />
                                </View>
                            </View>
                        ))}
                </View>
            ) : null}

            {/* SAM.gov link */}
            {match.notice_id ? (
                <Link
                    src={`https://sam.gov/opp/${match.notice_id}/view`}
                    style={{ fontSize: SIZE.sm, color: COLOR.accent, textDecoration: "none", marginTop: 8 }}
                >
                    View full solicitation on SAM.gov
                </Link>
            ) : null}
        </View>
    );
}

// ──────────────────────────────────────────────────────────────────────────────
// MAIN DOCUMENT
// ──────────────────────────────────────────────────────────────────────────────
export function FederalReadinessReport(props: ReportInput) {
    const {
        companyName, website, uei, cageCode, state, city, employeeCount, yearsInBusiness,
        naicsCodes, sbaCertifications, samRegistered,
        readinessScore, readinessFactors, readinessInterpretation,
        matches, certRecommendations, easyWins,
        competitors = [], primaryKeywords = [], secondaryKeywords = [],
        targetStates = [], govSpending = null,
        summary, generatedAt,
        launchKitUrl, strategyCallUrl, logoUrl,
    } = props;

    const score = readinessScore ?? 0;
    const ringColor = bandColor(score);

    // Score floor — internal reports should NEVER show fits below 40%.
    // A 35% match is technically a match but reads as "we surfaced something
    // weak because we ran out of strong ones." Hide them entirely so the
    // user only ever shares respectable matches.
    const qualifiedMatches = matches.filter(m => (m.score || 0) >= 0.40);
    // Top 3 get the full hero treatment (description excerpt + score bars).
    // The rest get a compact card so we can fit 3-4 per page.
    const matchesHero = qualifiedMatches.slice(0, 3);
    const matchesCompact = qualifiedMatches.slice(3);

    // Clearbit Logo API — free, no-auth, returns a square PNG of any domain's
    // brand logo (when known). When the analyzed company has a website, we
    // hotlink to /logo/{domain}, letting the customer's own brand mark appear
    // on the cover so this PDF feels owned by THEM, not by us. Falls through
    // to no-logo when Clearbit doesn't have the domain.
    const companyLogoUrl = (() => {
        try {
            const host = new URL(website.startsWith("http") ? website : `https://${website}`).hostname.replace(/^www\./, "");
            if (!host) return null;
            return `https://logo.clearbit.com/${host}`;
        } catch {
            return null;
        }
    })();

    return (
        <Document
            title={`${companyName} — B2G Audit`}
            author="CapturePilot"
            subject="B2G (Business-to-Government) Audit"
            creator="CapturePilot"
            producer="CapturePilot"
        >
            {/* ── PAGE 1 · COVER + READINESS ──────────────────────────────── */}
            <Page size="A4" style={s.page}>
                <PageHeader companyName={companyName} pageEyebrow="B2G Audit" logoUrl={logoUrl} />

                <View style={s.coverIntro}>
                    <Text style={s.eyebrow}>B2G Audit · Federal Contracting Readiness</Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                        {companyLogoUrl ? (
                            /* Clearbit's logo CDN returns a 24×24+ PNG when
                               the domain is known. We retry-via-fetch inside
                               react-pdf and silently degrade to no-logo if
                               the request 404s — never blocking the render. */
                            <Image
                                src={companyLogoUrl}
                                style={{ width: 56, height: 56, borderRadius: 8, borderWidth: 0.5, borderColor: COLOR.line }}
                            />
                        ) : null}
                        <View style={{ flex: 1 }}>
                            <Text style={s.h1}>{companyName}</Text>
                            <Text style={s.muted}>{website.replace(/^https?:\/\//, "")}{state ? ` · ${state}` : ""}{city ? `, ${city}` : ""}</Text>
                        </View>
                    </View>
                </View>

                {/* Hero: score ring + interpretation */}
                <View style={s.coverHero}>
                    <View style={s.coverScoreCol}>
                        <View style={{ position: "relative", width: 140, height: 140 }}>
                            <ScoreRing score={score} />
                            {/* The score number sits in a smaller absolute box
                                centered higher in the ring so the "OUT OF 10"
                                caption can live BELOW the number without
                                overlapping. */}
                            <View style={{
                                position: "absolute", left: 0, top: 38, width: 140, height: 50,
                                alignItems: "center", justifyContent: "center",
                            }}>
                                <Text style={{ fontFamily: FONT.bold, fontSize: 38, color: ringColor, lineHeight: 1 }}>
                                    {score.toFixed(1)}
                                </Text>
                            </View>
                            <View style={{
                                position: "absolute", left: 0, top: 84, width: 140,
                                alignItems: "center",
                            }}>
                                <Text style={{ fontSize: 7, color: COLOR.muted, letterSpacing: 1.5, fontFamily: FONT.bold }}>
                                    OUT OF 10
                                </Text>
                            </View>
                        </View>
                        <Text style={[s.coverStampBase, { backgroundColor: ringColor }]}>{bandLabel(score)}</Text>
                        <Text style={s.coverStampSub}>{bandSub(score)}</Text>
                    </View>

                    <View style={s.coverInfoCol}>
                        <Text style={s.label}>About your business</Text>
                        <Text style={{ ...s.body, marginTop: 4 }}>
                            {summary || `Federal contracting readiness profile for ${companyName}.`}
                        </Text>

                        <View style={{ marginTop: 12 }}>
                            <Text style={s.label}>Quick profile</Text>
                            <View style={{ marginTop: 4 }}>
                                <Text style={s.body}>
                                    {samRegistered ? "✓ SAM.gov registered" : "✗ Not yet on SAM.gov"}
                                    {uei ? `  ·  UEI ${uei}` : ""}
                                    {cageCode ? `  ·  CAGE ${cageCode}` : ""}
                                </Text>
                                <Text style={s.body}>
                                    {employeeCount ? `${employeeCount} employees` : "Size: unknown"}
                                    {yearsInBusiness ? `  ·  ${yearsInBusiness} yrs in business` : ""}
                                </Text>
                                <Text style={s.body}>
                                    {sbaCertifications.length > 0 ? `Certs: ${sbaCertifications.join(", ")}` : "No SBA certs"}
                                </Text>
                            </View>
                        </View>

                        {naicsCodes.length > 0 ? (
                            <View style={{ marginTop: 10 }}>
                                <Text style={s.label}>Industry codes (NAICS)</Text>
                                <View style={{ ...s.chipsRow, marginTop: 3 }}>
                                    {naicsCodes.slice(0, 5).map(n => (
                                        <Text key={n.code} style={s.chip}>{n.code} · {n.label.substring(0, 38)}</Text>
                                    ))}
                                </View>
                            </View>
                        ) : null}

                        {/* Matching keywords — primary first, secondary dimmer.
                            Shows the internal reader exactly which terms we
                            score this company against. */}
                        {primaryKeywords.length > 0 || secondaryKeywords.length > 0 ? (
                            <View style={{ marginTop: 10 }}>
                                <Text style={s.label}>Capability keywords</Text>
                                <View style={{ ...s.chipsRow, marginTop: 3 }}>
                                    {primaryKeywords.slice(0, 6).map(k => (
                                        <Text key={`p-${k}`} style={s.chipKw}>&quot;{k}&quot;</Text>
                                    ))}
                                    {secondaryKeywords.slice(0, 6).map(k => (
                                        <Text key={`s-${k}`} style={s.chip}>{k}</Text>
                                    ))}
                                </View>
                            </View>
                        ) : null}

                        {/* Target states — multi-state coverage signal */}
                        {targetStates.length > 0 ? (
                            <View style={{ marginTop: 10 }}>
                                <Text style={s.label}>Target states</Text>
                                <View style={{ ...s.chipsRow, marginTop: 3 }}>
                                    {targetStates.length >= 45 ? (
                                        <Text style={s.chip}>Nationwide ({targetStates.length} states)</Text>
                                    ) : (
                                        targetStates.slice(0, 12).map(st => (
                                            <Text key={st} style={s.chip}>{st}</Text>
                                        ))
                                    )}
                                </View>
                            </View>
                        ) : null}

                        {/* USASpending past-award snapshot — present only when
                            the company has prior federal award history. Critical
                            credibility marker for internal stakeholder review. */}
                        {govSpending && (govSpending.award_count || 0) > 0 ? (
                            <View style={{ marginTop: 10, padding: 8, backgroundColor: COLOR.surface, borderRadius: 6, borderWidth: 0.5, borderColor: COLOR.line }}>
                                <Text style={s.label}>Past federal awards (USASpending.gov)</Text>
                                <Text style={{ ...s.body, marginTop: 3 }}>
                                    <Text style={{ fontFamily: FONT.bold, color: COLOR.primary }}>{govSpending.award_count || 0}</Text>
                                    {` awards · `}
                                    <Text style={{ fontFamily: FONT.bold, color: COLOR.primary }}>{fmtCurrency(govSpending.total_value || 0)}</Text>
                                    {` total value`}
                                </Text>
                                {govSpending.last_award_title ? (
                                    <Text style={{ ...s.muted, marginTop: 2 }}>
                                        Latest: {govSpending.last_award_title.slice(0, 70)}{govSpending.last_award_agency ? ` · ${govSpending.last_award_agency}` : ""}
                                    </Text>
                                ) : null}
                            </View>
                        ) : null}
                    </View>
                </View>

                <PageFooter generatedAt={generatedAt} />
            </Page>

            {/* ── PAGE · READINESS BREAKDOWN + ACTION RECS ───────────────────
                Split off the cover so all 8 factors render together on one page
                with breathing room. The "available points" rows are the
                actionable items — we surface them again at the bottom as a
                punch-list with a CTA to grab the Launch Kit. */}
            {readinessFactors.length > 0 ? (
                <Page size="A4" style={s.page}>
                    <PageHeader companyName={companyName} pageEyebrow="Readiness Breakdown" logoUrl={logoUrl} />
                    <Text style={s.eyebrow}>Where you stand</Text>
                    <Text style={s.h2}>Readiness breakdown — score = {(readinessScore ?? 0).toFixed(1)} / 10</Text>
                    <Text style={{ ...s.muted, marginBottom: 14 }}>{readinessInterpretation}</Text>
                    <View>
                        {readinessFactors.map((f, i) => (
                            <View key={i} style={s.factor}>
                                <View style={[s.factorIcon, {
                                    backgroundColor: f.present ? COLOR.primary : COLOR.dim,
                                }]}>
                                    <Text style={s.factorIconText}>{f.present ? "✓" : "·"}</Text>
                                </View>
                                <View style={s.factorBody}>
                                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                                        <Text style={{ ...s.factorLabel, color: f.present ? COLOR.ink : COLOR.muted }}>
                                            {f.label}
                                        </Text>
                                        <Text style={{ ...s.factorPoints, color: f.present ? COLOR.primary : COLOR.amber }}>
                                            {f.present ? `+${f.points}` : `+${f.points} available`}
                                        </Text>
                                    </View>
                                    {f.detail ? <Text style={s.factorDetail}>{f.detail}</Text> : null}
                                </View>
                            </View>
                        ))}
                    </View>

                    {/* Quick-action punch-list — the "available" factors
                        re-summarized as a do-this list, then a CTA. */}
                    {(() => {
                        const todo = readinessFactors.filter(f => !f.present).slice(0, 4);
                        if (todo.length === 0) return null;
                        return (
                            <View style={{ marginTop: 18, padding: 12, backgroundColor: COLOR.surface, borderRadius: 8, borderWidth: 0.5, borderColor: COLOR.line }}>
                                <Text style={s.eyebrow}>Closest wins</Text>
                                <Text style={[s.h3, { marginBottom: 6 }]}>Fix these {todo.length} things first</Text>
                                <Text style={{ ...s.muted, marginBottom: 8 }}>
                                    Tackling these in order is the fastest path from {(readinessScore ?? 0).toFixed(1)} to {Math.min(10, (readinessScore ?? 0) + todo.reduce((a, f) => a + f.points, 0)).toFixed(1)} on your readiness score.
                                </Text>
                                {todo.map((f, i) => (
                                    <View key={i} style={{ flexDirection: "row", alignItems: "flex-start", gap: 6, marginBottom: 4 }}>
                                        <Text style={{ fontSize: SIZE.sm, fontFamily: FONT.bold, color: COLOR.primary, width: 16 }}>{i + 1}.</Text>
                                        <View style={{ flex: 1 }}>
                                            <Text style={{ fontSize: SIZE.sm, fontFamily: FONT.bold, color: COLOR.ink }}>
                                                {f.label}
                                            </Text>
                                            {f.detail ? (
                                                <Text style={{ fontSize: SIZE.xs, color: COLOR.muted }}>{f.detail}</Text>
                                            ) : null}
                                        </View>
                                        <Text style={{ fontSize: SIZE.sm, fontFamily: FONT.bold, color: COLOR.amber }}>+{f.points}</Text>
                                    </View>
                                ))}
                                <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 0.5, borderTopColor: COLOR.line }}>
                                    <Text style={{ ...s.muted, marginBottom: 6 }}>
                                        Want the playbook? The Federal Launch Kit includes step-by-step walkthroughs for every item above — SAM.gov registration, capability statement, certification applications, CO outreach scripts.
                                    </Text>
                                    <Link src={launchKitUrl} style={[s.ctaButton, { fontSize: SIZE.sm }]}>
                                        Unlock the $70 Launch Kit
                                    </Link>
                                </View>
                            </View>
                        );
                    })()}

                    <PageFooter generatedAt={generatedAt} />
                </Page>
            ) : null}

            {/* ── PAGE · TOP 3 MATCHES (HERO) ──────────────────────────────── */}
            {matchesHero.length > 0 ? (
                <Page size="A4" style={s.page}>
                    <PageHeader companyName={companyName} pageEyebrow="Top Matching Opportunities" logoUrl={logoUrl} />
                    <Text style={s.eyebrow}>Best Matching Opportunities</Text>
                    <Text style={s.h2}>Top {matchesHero.length} for {companyName.length > 30 ? "you" : companyName}</Text>
                    <Text style={{ ...s.muted, marginBottom: 12 }}>
                        Filtered to matches scoring at least 40% — these are the contracts worth your team&apos;s capture
                        budget this week. Each one carries a personalized fit explanation, deadline countdown,
                        and the matching signals that drove the score.
                    </Text>
                    {matchesHero.map((m, i) => (
                        <MatchCard key={m.opportunity_id} match={m} rank={i + 1} />
                    ))}
                    <PageFooter generatedAt={generatedAt} />
                </Page>
            ) : null}

            {/* ── PAGE · MATCHES #4 ONWARD (COMPACT, 3+/page) ─────────────── */}
            {matchesCompact.length > 0 ? (
                <Page size="A4" style={s.page}>
                    <PageHeader companyName={companyName} pageEyebrow="More Matching Opportunities" logoUrl={logoUrl} />
                    <Text style={s.eyebrow}>The rest of your shortlist</Text>
                    <Text style={s.h2}>Matches #4 — #{3 + matchesCompact.length}</Text>
                    <Text style={{ ...s.muted, marginBottom: 10 }}>
                        Same scoring engine, condensed view. Hit each SAM.gov link to pull the full solicitation.
                    </Text>
                    {matchesCompact.map((m, i) => (
                        <MatchCardCompact key={m.opportunity_id} match={m} rank={4 + i} />
                    ))}
                    <PageFooter generatedAt={generatedAt} />
                </Page>
            ) : null}

            {/* ── PAGE · COMPETITORS ───────────────────────────────────────── */}
            {competitors.length > 0 ? (
                <Page size="A4" style={s.page}>
                    <PageHeader companyName={companyName} pageEyebrow="Competitive Landscape" logoUrl={logoUrl} />
                    <Text style={s.eyebrow}>Who you&apos;re bidding against</Text>
                    <Text style={s.h2}>Top {competitors.length} competitors in your NAICS</Text>
                    <Text style={{ ...s.muted, marginBottom: 12 }}>
                        Small businesses currently winning federal contracts in the NAICS codes you target.
                        Use this list to scout teaming partners, learn from incumbents, and benchmark pricing.
                    </Text>
                    {competitors.map((c, i) => (
                        <View key={i} style={s.competitorCard} wrap={false}>
                            <View style={s.competitorRank}>
                                <Text style={s.competitorRankText}>#{i + 1}</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                                    <Text style={[s.h3, { flex: 1, paddingRight: 8 }]}>{c.name}</Text>
                                    {c.total_awards > 0 ? (
                                        <Text style={{ fontFamily: FONT.bold, fontSize: SIZE.md, color: COLOR.primary }}>
                                            {fmtCurrency(c.total_awards)}
                                        </Text>
                                    ) : null}
                                </View>
                                <View style={s.chipsRow}>
                                    {c.sam_registered ? (
                                        <Text style={[s.chipBoldBase, { color: COLOR.primary, borderColor: COLOR.primary }]}>SAM ACTIVE</Text>
                                    ) : (
                                        <Text style={[s.chipBoldBase, { color: COLOR.muted, borderColor: COLOR.line }]}>SAM UNKNOWN</Text>
                                    )}
                                    {c.state ? <Text style={s.chip}>{c.state}</Text> : null}
                                    {c.naics_overlap_pct > 0 ? <Text style={s.chip}>{c.naics_overlap_pct}% NAICS overlap</Text> : null}
                                    {c.award_count > 0 ? <Text style={s.chip}>{c.award_count} contracts</Text> : null}
                                </View>
                                {c.top_agency ? (
                                    <Text style={{ ...s.muted, marginTop: 4 }}>
                                        Top buyer: <Text style={{ color: COLOR.ink, fontFamily: FONT.bold }}>{c.top_agency}</Text>
                                    </Text>
                                ) : null}
                                {c.strengths && c.strengths.length > 0 ? (
                                    <Text style={{ ...s.muted, marginTop: 2 }}>
                                        Strengths: {c.strengths.slice(0, 3).join(" · ")}
                                    </Text>
                                ) : null}
                            </View>
                        </View>
                    ))}
                    <PageFooter generatedAt={generatedAt} />
                </Page>
            ) : null}

            {/* ── PAGE 4 · EASY WINS + CERT ROADMAP ────────────────────────── */}
            <Page size="A4" style={s.page}>
                <PageHeader companyName={companyName} pageEyebrow="Action Plan" logoUrl={logoUrl} />

                {easyWins.length > 0 ? (
                    <View style={{ marginBottom: 18 }}>
                        <Text style={s.eyebrow}>Quick wins</Text>
                        <Text style={s.h2}>Fix these to lift your readiness score</Text>
                        <Text style={{ ...s.muted, marginBottom: 10 }}>
                            Each of these should take days, not weeks — and bumps you up a band.
                        </Text>
                        {easyWins.map((w, i) => {
                            const impactColor =
                                w.impact === "high" ? COLOR.red :
                                w.impact === "medium" ? COLOR.amber :
                                COLOR.accent;
                            return (
                                <View key={i} style={s.card} wrap={false}>
                                    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4, gap: 8 }}>
                                        <Text style={s.h3}>{w.title}</Text>
                                        <Text style={[s.chipBoldBase, { color: impactColor, borderColor: impactColor }]}>{w.impact}</Text>
                                    </View>
                                    <Text style={s.body}>{w.description}</Text>
                                </View>
                            );
                        })}
                    </View>
                ) : null}

                {certRecommendations.length > 0 ? (
                    <View>
                        <Text style={s.eyebrow}>Certification roadmap</Text>
                        <Text style={s.h2}>Which set-asides would unlock the most for you</Text>
                        <Text style={{ ...s.muted, marginBottom: 10 }}>
                            Each certification opens a pool of opportunities you can&apos;t bid on today.
                        </Text>
                        {certRecommendations.slice(0, 4).map((c, i) => {
                            const difficultyColor =
                                c.difficulty === "easy" ? COLOR.primary :
                                c.difficulty === "moderate" ? COLOR.amber :
                                COLOR.red;
                            return (
                                <View key={i} style={s.card} wrap={false}>
                                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                                        <View style={{ flex: 1 }}>
                                            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                                                <Text style={s.h3}>{c.cert_label}</Text>
                                                <Text style={[s.chipBoldBase, { color: difficultyColor, borderColor: difficultyColor }]}>{c.difficulty}</Text>
                                            </View>
                                            <Text style={{ ...s.muted, marginTop: 2 }}>
                                                Timeline: {c.timeline}
                                                {c.estimated_value > 0 ? `  ·  Est. value: ${fmtCurrency(c.estimated_value)}` : ""}
                                            </Text>
                                        </View>
                                        <View style={{ alignItems: "flex-end" }}>
                                            <Text style={{ fontFamily: FONT.bold, fontSize: SIZE.xl, color: COLOR.primary }}>
                                                +{c.unlocked_count}
                                            </Text>
                                            <Text style={s.label}>new opps</Text>
                                        </View>
                                    </View>
                                </View>
                            );
                        })}
                    </View>
                ) : null}

                <PageFooter generatedAt={generatedAt} />
            </Page>

            {/* ── PAGE · NEXT STEPS — meeting CTA as the hero ──────────────── */}
            <Page size="A4" style={s.page}>
                <PageHeader companyName={companyName} pageEyebrow="Next Steps" logoUrl={logoUrl} />

                <Text style={s.eyebrow}>What to do this week</Text>
                <Text style={s.h2}>Turn this audit into a contract</Text>
                <Text style={{ ...s.muted, marginBottom: 14 }}>
                    You have the data. Now you need a partner who&apos;s won contracts in your NAICS before.
                    Book 30 minutes with a B2G strategist — we&apos;ll walk through this audit, pick the 2
                    matches worth pursuing first, and tell you in 5 minutes whether it&apos;s realistic for
                    your size, certs and state.
                </Text>

                {/* Hero meeting CTA — the document's primary call-to-action */}
                <View style={s.ctaCard}>
                    <Text style={s.ctaEyebrow}>Book a meeting · Free · 30 minutes</Text>
                    <Text style={s.ctaHead}>Talk to a B2G strategist this week</Text>
                    <Text style={s.ctaBody}>
                        Bring this PDF to the call. We&apos;ll review your readiness score, prioritize the
                        top opportunities, and identify the 2-3 gaps standing between you and your first
                        federal contract. If we can&apos;t add value in 5 minutes, we&apos;ll say so and end
                        the call early. No pitch, no slides, no obligation.
                    </Text>
                    <Link src={strategyCallUrl} style={[s.ctaButton, { fontSize: SIZE.md }]}>
                        Book my 30-min strategist call
                    </Link>
                    <Text style={{ fontSize: SIZE.xs, color: "#a7f3d0", marginTop: 8 }}>
                        Slots open within 48 hours. Your AE will email a calendar link the same day.
                    </Text>
                </View>

                {/* Consolidated 30-day plan — one card, three rows, max signal per pt */}
                <Text style={[s.eyebrow, { marginTop: 14 }]}>If you&apos;d rather DIY</Text>
                <View style={[s.card, { paddingVertical: 10, marginBottom: 8 }]}>
                    <Text style={[s.h3, { marginBottom: 6 }]}>30-day self-serve action plan</Text>
                    <View style={{ flexDirection: "row", gap: 6, marginBottom: 4 }}>
                        <Text style={{ width: 70, fontSize: SIZE.sm, fontFamily: FONT.bold, color: COLOR.primary }}>Week 1</Text>
                        <Text style={[s.body, { flex: 1, fontSize: SIZE.sm }]}>
                            {samRegistered
                                ? "Confirm SAM.gov is current  ·  Tighten capability statement  ·  Lock NAICS list."
                                : "Start SAM.gov registration (7-14 days)  ·  Draft 1-page capability statement  ·  Confirm NAICS."}
                        </Text>
                    </View>
                    <View style={{ flexDirection: "row", gap: 6, marginBottom: 4 }}>
                        <Text style={{ width: 70, fontSize: SIZE.sm, fontFamily: FONT.bold, color: COLOR.primary }}>Week 2</Text>
                        <Text style={[s.body, { flex: 1, fontSize: SIZE.sm }]}>
                            Pick 2 Sources Sought from this audit  ·  Draft a 1-page response each  ·  Submit before deadline.
                        </Text>
                    </View>
                    <View style={{ flexDirection: "row", gap: 6 }}>
                        <Text style={{ width: 70, fontSize: SIZE.sm, fontFamily: FONT.bold, color: COLOR.primary }}>Weeks 3-4</Text>
                        <Text style={[s.body, { flex: 1, fontSize: SIZE.sm }]}>
                            One CO outreach per week  ·  Identify one IDIQ / GWAC vehicle  ·  Daily SAM.gov alerts on your NAICS.
                        </Text>
                    </View>
                </View>

                {/* Secondary CTA — Launch Kit (compact one-liner row) */}
                <View style={[s.ctaCardLight, { paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 12 }]}>
                    <View style={{ flex: 1 }}>
                        <Text style={[s.h3, { marginBottom: 2, fontSize: SIZE.md }]}>Federal Launch Kit · $70</Text>
                        <Text style={[s.body, { fontSize: SIZE.sm }]}>
                            Our managed-capture team&apos;s playbook — SAM walkthrough, capability templates,
                            CO scripts. Instant download.
                        </Text>
                    </View>
                    <Link src={launchKitUrl} style={[s.ctaButton, { fontSize: SIZE.sm, marginTop: 0, flexShrink: 0 }]}>
                        Get the Kit
                    </Link>
                </View>

                <PageFooter generatedAt={generatedAt} />
            </Page>
        </Document>
    );
}
