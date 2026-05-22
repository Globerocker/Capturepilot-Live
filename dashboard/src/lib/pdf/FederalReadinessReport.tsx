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
        position: "absolute",
        bottom: 24,
        left: PAGE.padding,
        right: PAGE.padding,
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingTop: 8,
        borderTopWidth: 0.5,
        borderTopColor: COLOR.line,
        fontSize: 7,
        color: COLOR.muted,
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
    return (
        <View style={s.pageFooter} fixed>
            <Text>Federal Readiness Report · Generated {fmtDate(generatedAt)}</Text>
            <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
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
        const raw = match.description?.trim();
        if (!raw) return null;
        // Skip pure URLs (some SAM rows have description= a noticedesc API URL)
        if (/^https?:\/\//.test(raw)) return null;
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

            {/* Description excerpt — only when we have real text, not a URL */}
            {descSnippet ? (
                <View style={{ marginTop: 6 }}>
                    <Text style={s.label}>From the solicitation</Text>
                    <Text style={[s.body, { fontSize: SIZE.sm, marginTop: 3, color: COLOR.muted }]}>
                        {descSnippet}
                    </Text>
                </View>
            ) : null}

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
                    View full solicitation on SAM.gov →
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

    const matchesA = matches.slice(0, 5);
    const matchesB = matches.slice(5, 10);

    return (
        <Document
            title={`${companyName} — Federal Readiness Report`}
            author="CapturePilot"
            subject="Federal Contracting Readiness Report"
            creator="CapturePilot"
            producer="CapturePilot"
        >
            {/* ── PAGE 1 · COVER + READINESS ──────────────────────────────── */}
            <Page size="A4" style={s.page}>
                <PageHeader companyName={companyName} pageEyebrow="Federal Readiness Report" logoUrl={logoUrl} />

                <View style={s.coverIntro}>
                    <Text style={s.eyebrow}>Federal Readiness Report</Text>
                    <Text style={s.h1}>{companyName}</Text>
                    <Text style={s.muted}>{website.replace(/^https?:\/\//, "")}{state ? ` · ${state}` : ""}{city ? `, ${city}` : ""}</Text>
                </View>

                {/* Hero: score ring + interpretation */}
                <View style={s.coverHero}>
                    <View style={s.coverScoreCol}>
                        <View style={{ position: "relative", width: 140, height: 140 }}>
                            <ScoreRing score={score} />
                            <View style={{
                                position: "absolute", left: 0, top: 0, width: 140, height: 140,
                                alignItems: "center", justifyContent: "center",
                            }}>
                                <Text style={{ fontFamily: FONT.bold, fontSize: 38, color: ringColor }}>
                                    {score.toFixed(1)}
                                </Text>
                                <Text style={{ fontSize: 7, color: COLOR.muted, marginTop: 2, letterSpacing: 1 }}>
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

                {/* Readiness breakdown */}
                <Text style={s.h3}>Readiness breakdown</Text>
                <Text style={{ ...s.muted, marginBottom: 6 }}>{readinessInterpretation}</Text>
                <View>
                    {readinessFactors.slice(0, 8).map((f, i) => (
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

                <PageFooter generatedAt={generatedAt} />
            </Page>

            {/* ── PAGE 2 · TOP MATCHES #1–5 ────────────────────────────────── */}
            {matchesA.length > 0 ? (
                <Page size="A4" style={s.page}>
                    <PageHeader companyName={companyName} pageEyebrow="Top Matching Opportunities" logoUrl={logoUrl} />
                    <Text style={s.eyebrow}>Best Matching Opportunities</Text>
                    <Text style={s.h2}>{matches.length} federal contracts, scored for you</Text>
                    <Text style={{ ...s.muted, marginBottom: 12 }}>
                        Scored against your NAICS codes, certifications, state and company size. Each match
                        includes a personalized fit explanation generated specifically for {companyName}.
                    </Text>
                    {matchesA.map((m, i) => (
                        <MatchCard key={m.opportunity_id} match={m} rank={i + 1} />
                    ))}
                    <PageFooter generatedAt={generatedAt} />
                </Page>
            ) : null}

            {/* ── PAGE 3 · TOP MATCHES #6–10 ───────────────────────────────── */}
            {matchesB.length > 0 ? (
                <Page size="A4" style={s.page}>
                    <PageHeader companyName={companyName} pageEyebrow="Top Matching Opportunities" logoUrl={logoUrl} />
                    <Text style={s.eyebrow}>More Matching Opportunities</Text>
                    <Text style={s.h2}>Matches #6 — #{5 + matchesB.length}</Text>
                    {matchesB.map((m, i) => (
                        <MatchCard key={m.opportunity_id} match={m} rank={6 + i} />
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

            {/* ── PAGE 5 · NEXT STEPS + CTAS ───────────────────────────────── */}
            <Page size="A4" style={s.page}>
                <PageHeader companyName={companyName} pageEyebrow="Next Steps" logoUrl={logoUrl} />

                <Text style={s.eyebrow}>Where to go from here</Text>
                <Text style={s.h2}>Your 30-day action plan</Text>
                <Text style={{ ...s.muted, marginBottom: 14 }}>
                    The fastest path from this report to your first federal contract.
                </Text>

                <View style={s.card}>
                    <Text style={s.h3}>Week 1 — Fundamentals</Text>
                    <Text style={s.body}>
                        {samRegistered
                            ? "• Confirm SAM.gov registration is current (annual renewal)."
                            : "• Start your SAM.gov registration. Allow 7–14 days for activation."}
                    </Text>
                    <Text style={s.body}>• Polish your capability statement — one-page PDF, federal format.</Text>
                    <Text style={s.body}>• Confirm your NAICS codes match what you actually sell.</Text>
                </View>
                <View style={s.card}>
                    <Text style={s.h3}>Week 2 — First responses</Text>
                    <Text style={s.body}>• Pick the top 2 Sources Sought matches from this report.</Text>
                    <Text style={s.body}>• Draft a 1-page response — focus on capability, not pricing.</Text>
                    <Text style={s.body}>• Submit before the deadline. Track in a simple spreadsheet.</Text>
                </View>
                <View style={s.card}>
                    <Text style={s.h3}>Week 3–4 — Build the pipeline</Text>
                    <Text style={s.body}>• Reach out to one Contracting Officer per week.</Text>
                    <Text style={s.body}>• Identify one IDIQ / GWAC vehicle worth pursuing.</Text>
                    <Text style={s.body}>• Sign up for SAM.gov daily alerts on your NAICS codes.</Text>
                </View>

                {/* CTA — Launch Kit */}
                <View style={s.ctaCard}>
                    <Text style={s.ctaEyebrow}>Skip the research — get the toolkit</Text>
                    <Text style={s.ctaHead}>Federal Launch Kit · $70</Text>
                    <Text style={s.ctaBody}>
                        SAM.gov registration walkthrough, capability statement templates, Sources Sought
                        playbook, certification eligibility worksheets, CO outreach scripts, pricing
                        toolkit, internal best-practice library + 30-min founder onboarding call.
                        Instant access, lifetime use, 7-day refund.
                    </Text>
                    <Link src={launchKitUrl} style={s.ctaButton}>
                        Unlock the Launch Kit →
                    </Link>
                </View>

                {/* CTA — Strategy Call */}
                <View style={s.ctaCardLight}>
                    <Text style={{ ...s.eyebrow, color: COLOR.ink }}>Done-for-you</Text>
                    <Text style={{ ...s.h3, marginBottom: 6 }}>Have us run capture for you</Text>
                    <Text style={s.body}>
                        Our managed-capture team handles SAM, response writing, color-team reviews and
                        submission for $4–8k/month. Book a 30-min strategy call and we&apos;ll tell you
                        in 5 minutes whether it&apos;s a fit.
                    </Text>
                    <Link
                        src={strategyCallUrl}
                        style={{ ...s.ctaButton, backgroundColor: COLOR.ink, color: "#fff", marginTop: 10 }}
                    >
                        Book a strategy call →
                    </Link>
                </View>

                <PageFooter generatedAt={generatedAt} />
            </Page>
        </Document>
    );
}
