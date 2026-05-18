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
import { Document, Page, View, Text, Link, StyleSheet, Svg, Circle, G } from "@react-pdf/renderer";
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
    summary: string;
    generatedAt: string;
    launchKitUrl: string;
    strategyCallUrl: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// STYLES
// ──────────────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
    page: {
        backgroundColor: "#ffffff",
        padding: PAGE.padding,
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
        width: 14,
        height: 14,
        backgroundColor: COLOR.primary,
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

    // Factor list (readiness breakdown)
    factor: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 8,
        paddingVertical: 5,
        borderBottomWidth: 0.5,
        borderBottomColor: COLOR.line,
    },
    factorIcon: {
        width: 14, height: 14, borderRadius: 7,
        alignItems: "center", justifyContent: "center",
        fontFamily: FONT.bold, fontSize: 8, color: "#fff",
    },
    factorBody: { flex: 1 },
    factorLabel: { fontSize: SIZE.sm, fontFamily: FONT.bold, color: COLOR.ink },
    factorPoints: { fontSize: SIZE.sm, fontFamily: FONT.bold },
    factorDetail: { fontSize: SIZE.xs, color: COLOR.muted, marginTop: 1, lineHeight: 1.35 },

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
    matchScoreBase: {
        width: 28, height: 28, borderRadius: 4,
        alignItems: "center", justifyContent: "center",
        color: "#fff",
        fontFamily: FONT.bold, fontSize: SIZE.md,
    },
    matchTitle: { fontFamily: FONT.bold, fontSize: SIZE.md, color: COLOR.ink, flex: 1, lineHeight: 1.25 },
    matchAgency: { fontSize: SIZE.sm, color: COLOR.muted, marginBottom: 6 },

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
function PageHeader({ companyName, pageEyebrow }: { companyName: string; pageEyebrow: string }) {
    return (
        <View style={s.pageHeader} fixed>
            <View style={s.pageHeaderBrand}>
                <View style={s.pageHeaderLogo} />
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
    return (
        <View style={s.card} wrap={false}>
            <View style={s.matchHeader}>
                <Text style={s.matchRank}>#{rank}</Text>
                <Text style={[s.matchScoreBase, { backgroundColor: band }]}>{Math.round(match.score * 100)}</Text>
                <Text style={s.matchTitle}>{match.title || "Untitled Opportunity"}</Text>
            </View>
            <Text style={s.matchAgency}>{match.agency || "Federal Agency"}</Text>

            {/* Chips: classification, set-aside, NAICS, deadline, value */}
            <View style={s.chipsRow}>
                <Text style={[s.chipBoldBase, { color: band, borderColor: band }]}>{match.classification}</Text>
                {match.set_aside_code ? (
                    <Text style={s.chip}>Set-Aside · {match.set_aside_code}</Text>
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
            </View>

            {/* AI fit summary — the big personalization moment */}
            {match.ai_fit_summary ? (
                <View style={s.aiBox}>
                    <Text style={s.aiBoxLabel}>Why this fits you</Text>
                    <Text style={s.aiBoxBody}>{match.ai_fit_summary}</Text>
                </View>
            ) : null}

            {/* SAM.gov link */}
            {match.notice_id ? (
                <Link
                    src={`https://sam.gov/opp/${match.notice_id}/view`}
                    style={{ fontSize: SIZE.sm, color: COLOR.accent, textDecoration: "none", marginTop: 2 }}
                >
                    View on SAM.gov →
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
        matches, certRecommendations, easyWins, summary, generatedAt,
        launchKitUrl, strategyCallUrl,
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
                <PageHeader companyName={companyName} pageEyebrow="Federal Readiness Report" />

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
                            <View style={{ marginTop: 12 }}>
                                <Text style={s.label}>Industry codes (NAICS)</Text>
                                <View style={{ ...s.chipsRow, marginTop: 4 }}>
                                    {naicsCodes.slice(0, 5).map(n => (
                                        <Text key={n.code} style={s.chip}>{n.code} · {n.label.substring(0, 38)}</Text>
                                    ))}
                                </View>
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
                            <View style={{
                                ...s.factorIcon,
                                backgroundColor: f.present ? COLOR.primary : COLOR.dim,
                            }}>
                                <Text>{f.present ? "✓" : "·"}</Text>
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
                    <PageHeader companyName={companyName} pageEyebrow="Top Matching Opportunities" />
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
                    <PageHeader companyName={companyName} pageEyebrow="Top Matching Opportunities" />
                    <Text style={s.eyebrow}>More Matching Opportunities</Text>
                    <Text style={s.h2}>Matches #6 — #{5 + matchesB.length}</Text>
                    {matchesB.map((m, i) => (
                        <MatchCard key={m.opportunity_id} match={m} rank={6 + i} />
                    ))}
                    <PageFooter generatedAt={generatedAt} />
                </Page>
            ) : null}

            {/* ── PAGE 4 · EASY WINS + CERT ROADMAP ────────────────────────── */}
            <Page size="A4" style={s.page}>
                <PageHeader companyName={companyName} pageEyebrow="Action Plan" />

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
                <PageHeader companyName={companyName} pageEyebrow="Next Steps" />

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
