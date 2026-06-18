/**
 * website-builder.ts — pure, dependency-free one-pager generator.
 *
 * buildOnePager(input) returns a COMPLETE, self-contained, responsive HTML
 * document (inline <style>, no external JS/CSS, mobile-friendly). The output is
 * meant to be served verbatim from /site/[slug] so a non-technical partner can
 * hand a contractor a link: "here's what your site could look like."
 *
 * Design goals:
 *   - Modern + professional: clean typography, generous whitespace, one accent.
 *   - Degrades gracefully on sparse data (most fields optional).
 *   - Zero external dependencies — system font stack, inline SVG only.
 *   - Every interpolated value is HTML-escaped (no XSS via company data).
 *
 * This module is intentionally framework-free so it can run inside an API route,
 * a cron job, or a test without pulling React/Next in.
 */

import { NAICS_LABELS } from "@/lib/naics-labels";

/** Plain human label for a NAICS code, or "" when we don't recognize it. */
function naicsDescription(code: string): string {
    return NAICS_LABELS[code] || "";
}

export interface OnePagerService {
    name: string;
    description?: string | null;
}

export interface OnePagerInput {
    companyName: string;
    tagline?: string | null;
    /** Long-form about copy. Falls back to findings/strengths/generated blurb. */
    about?: string | null;
    findingsSummary?: string | null;
    strengths?: string[] | null;
    services?: OnePagerService[] | null;
    naicsCodes?: string[] | null;
    certifications?: string[] | null;
    sbaCertifications?: string[] | null;
    uei?: string | null;
    cageCode?: string | null;
    federalAwardsCount?: number | null;
    /** Total obligated federal award volume (USD). Drives the PAST PERFORMANCE section. */
    totalAwardVolume?: number | null;
    /** Top federal customers by obligated amount (name + optional amount). */
    topAgencies?: Array<{ name: string; amount?: number | null }> | null;
    /** Named past/commercial clients → rendered as logos-less name chips. */
    clientList?: string[] | null;
    yearsInBusiness?: number | null;
    employeeCount?: number | null;
    contact?: {
        name?: string | null;
        email?: string | null;
        phone?: string | null;
        city?: string | null;
        state?: string | null;
        website?: string | null;
    } | null;
    /** Hex accent color (e.g. "#1e3a5f"). Defaults to a tasteful navy. */
    brandColor?: string | null;
    /** Optional hero background image URL. If absent → clean gradient hero. */
    heroImageUrl?: string | null;
}

const DEFAULT_ACCENT = "#1e3a5f"; // tasteful navy

// ───────────────────────── helpers ─────────────────────────

/** Escape text for safe HTML interpolation (handles &, <, >, ", '). */
function esc(v: unknown): string {
    if (v == null) return "";
    return String(v)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

/** Escape a string for inclusion inside a CSS value (defensive). */
function escCss(v: string): string {
    return v.replace(/[^#0-9a-zA-Z(),.%\s-]/g, "");
}

/** Normalize and validate a hex color; returns null if unusable. */
function normalizeAccent(raw: string | null | undefined): string | null {
    if (!raw) return null;
    let h = String(raw).trim().toLowerCase();
    if (!h.startsWith("#")) h = "#" + h;
    const body = h.slice(1);
    if (/^[0-9a-f]{3}$/.test(body)) {
        return "#" + body.split("").map((c) => c + c).join("");
    }
    if (/^[0-9a-f]{6}$/.test(body)) return "#" + body;
    if (/^[0-9a-f]{8}$/.test(body)) return "#" + body.slice(0, 6); // drop alpha
    return null;
}

/** Parse a #rrggbb into [r,g,b]. */
function hexToRgb(hex: string): [number, number, number] {
    const b = hex.replace("#", "");
    return [parseInt(b.slice(0, 2), 16), parseInt(b.slice(2, 4), 16), parseInt(b.slice(4, 6), 16)];
}

/** Relative luminance → pick readable foreground (white/dark) over the accent. */
function readableOn(hex: string): string {
    const [r, g, b] = hexToRgb(hex);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum > 0.6 ? "#1a1a1a" : "#ffffff";
}

/** Darken a hex color by a 0-1 factor (for gradient depth). */
function darken(hex: string, factor: number): string {
    const [r, g, b] = hexToRgb(hex);
    const d = (v: number) => Math.max(0, Math.round(v * (1 - factor)));
    return "#" + [d(r), d(g), d(b)].map((v) => v.toString(16).padStart(2, "0")).join("");
}

/** Compact USD for the past-performance strip, e.g. 2400000 → "$2.4M". "" for 0/null. */
function compactUsd(n: number | null | undefined): string {
    if (!n || !Number.isFinite(n) || n <= 0) return "";
    if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
    return `$${Math.round(n).toLocaleString()}`;
}

function uniqStrings(arr: (string | null | undefined)[] | null | undefined): string[] {
    if (!Array.isArray(arr)) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const v of arr) {
        const t = (typeof v === "string" ? v : "").trim();
        if (!t) continue;
        const key = t.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(t);
    }
    return out;
}

/** Initials for the logo monogram (max 2 letters). */
function initials(name: string): string {
    const words = name.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return "?";
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/** Build a clean default "About" blurb when nothing usable is supplied. */
function fallbackAbout(input: OnePagerInput): string {
    const name = input.companyName;
    const loc =
        input.contact?.city && input.contact?.state
            ? `${input.contact.city}, ${input.contact.state}`
            : input.contact?.state || null;
    const certBits = uniqStrings([...(input.sbaCertifications || []), ...(input.certifications || [])]).slice(0, 2);
    const parts: string[] = [];
    parts.push(
        `${name} is a${loc ? ` ${loc}-based` : ""} firm serving government and commercial clients with dependable, results-focused work.`,
    );
    if (certBits.length) {
        parts.push(`As a ${certBits.join(" and ")} business, ${name} brings the credentials agencies look for in a trusted partner.`);
    }
    if ((input.federalAwardsCount || 0) > 0) {
        parts.push(`With a track record of federal performance, the team delivers on contract requirements with discipline and care.`);
    }
    return parts.join(" ");
}

function svcYears(input: OnePagerInput): string | null {
    if (input.yearsInBusiness && input.yearsInBusiness > 0) return `${input.yearsInBusiness}+`;
    return null;
}

// ───────────────────────── builder ─────────────────────────

export function buildOnePager(input: OnePagerInput): string {
    const accent = normalizeAccent(input.brandColor) || DEFAULT_ACCENT;
    const accentDark = darken(accent, 0.35);
    const accentFg = readableOn(accent);
    const company = (input.companyName || "Your Company").trim() || "Your Company";

    const tagline =
        (input.tagline || "").trim() ||
        "Trusted federal and commercial contracting partner.";

    // About: prefer explicit about → findings → strengths sentence → generated.
    let about = (input.about || input.findingsSummary || "").trim();
    if (!about) {
        const strengths = uniqStrings(input.strengths);
        if (strengths.length) {
            about = `${company} stands out for ${strengths.slice(0, 3).join(", ")}.`;
        }
    }
    if (!about) about = fallbackAbout(input);

    const services = (input.services || [])
        .map((s) => ({ name: (s?.name || "").trim(), description: (s?.description || "").trim() }))
        .filter((s) => s.name);

    // If no explicit services, derive cards from NAICS labels.
    const naics = uniqStrings(input.naicsCodes);
    const derivedServices =
        services.length === 0
            ? naics.slice(0, 6).map((code) => ({
                  name: naicsDescription(code) || `NAICS ${code}`,
                  description: "",
              }))
            : services;

    const certs = uniqStrings([...(input.sbaCertifications || []), ...(input.certifications || [])]);
    const awards = input.federalAwardsCount || 0;
    const contact = input.contact || {};
    const locLine = [contact.city, contact.state].filter(Boolean).join(", ");

    // ── Stats strip ──
    const stats: { value: string; label: string }[] = [];
    const yrs = svcYears(input);
    if (yrs) stats.push({ value: yrs, label: "Years in business" });
    if (awards > 0) stats.push({ value: String(awards), label: awards === 1 ? "Federal award" : "Federal awards" });
    if (input.employeeCount && input.employeeCount > 0) stats.push({ value: String(input.employeeCount), label: "Team members" });
    if (certs.length > 0) stats.push({ value: String(certs.length), label: certs.length === 1 ? "Certification" : "Certifications" });

    const heroImage = (input.heroImageUrl || "").trim();
    const hasHeroImage = /^https?:\/\//i.test(heroImage);

    // ── Section fragments ──
    const statsHtml = stats.length
        ? `<div class="stats">${stats
              .map(
                  (s) =>
                      `<div class="stat"><div class="stat-value">${esc(s.value)}</div><div class="stat-label">${esc(
                          s.label,
                      )}</div></div>`,
              )
              .join("")}</div>`
        : "";

    const servicesHtml = derivedServices.length
        ? `<section class="section" id="services">
        <div class="container">
          <div class="section-head">
            <span class="eyebrow">What we do</span>
            <h2>Services</h2>
          </div>
          <div class="cards">
            ${derivedServices
                .slice(0, 9)
                .map(
                    (s) => `<div class="card">
              <div class="card-mark"></div>
              <h3>${esc(s.name)}</h3>
              ${s.description ? `<p>${esc(s.description)}</p>` : ""}
            </div>`,
                )
                .join("")}
          </div>
        </div>
      </section>`
        : "";

    const capBadges: string[] = [];
    for (const c of certs) capBadges.push(`<span class="badge badge-cert">${esc(c)}</span>`);
    for (const code of naics) {
        const label = naicsDescription(code);
        capBadges.push(
            `<span class="badge" title="${esc(label)}">${esc(code)}${label ? ` · ${esc(label)}` : ""}</span>`,
        );
    }

    const idRows: string[] = [];
    if (input.uei) idRows.push(`<div class="id-row"><span>UEI</span><strong>${esc(input.uei)}</strong></div>`);
    if (input.cageCode) idRows.push(`<div class="id-row"><span>CAGE</span><strong>${esc(input.cageCode)}</strong></div>`);

    const capabilitiesHtml =
        capBadges.length || idRows.length
            ? `<section class="section section-alt" id="capabilities">
        <div class="container">
          <div class="section-head">
            <span class="eyebrow">Credentials</span>
            <h2>Capabilities &amp; Codes</h2>
          </div>
          ${capBadges.length ? `<div class="badges">${capBadges.join("")}</div>` : ""}
          ${idRows.length ? `<div class="ids">${idRows.join("")}</div>` : ""}
        </div>
      </section>`
            : "";

    // ── Past performance ──
    // Surfaces award count + compact total obligated volume + top federal
    // customers. Renders when there's ANY signal (count, volume, or agencies);
    // each sub-part is included only when present.
    const awardVolume = compactUsd(input.totalAwardVolume);
    const topAgencies = (Array.isArray(input.topAgencies) ? input.topAgencies : [])
        .map((a) => ({ name: (a?.name || "").trim(), amount: typeof a?.amount === "number" ? a.amount : null }))
        .filter((a) => a.name);
    // Dedupe agencies case-insensitively, keep first (already amount-sorted upstream).
    const seenAgency = new Set<string>();
    const dedupedAgencies = topAgencies.filter((a) => {
        const k = a.name.toLowerCase();
        if (seenAgency.has(k)) return false;
        seenAgency.add(k);
        return true;
    });

    const hasPastPerf = awards > 0 || !!awardVolume || dedupedAgencies.length > 0;

    const perfStatChips: string[] = [];
    if (awards > 0) {
        perfStatChips.push(
            `<div class="perf-stat"><div class="perf-stat-value">${awards}</div><div class="perf-stat-label">Federal award${
                awards === 1 ? "" : "s"
            }</div></div>`,
        );
    }
    if (awardVolume) {
        perfStatChips.push(
            `<div class="perf-stat"><div class="perf-stat-value">${esc(awardVolume)}</div><div class="perf-stat-label">Obligated to date</div></div>`,
        );
    }

    const agencyChips = dedupedAgencies
        .slice(0, 6)
        .map((a) => `<span class="badge">${esc(a.name)}</span>`)
        .join("");

    const perfLead =
        awards > 0
            ? `${esc(company)} has delivered on <strong>${awards}</strong> federal contract${
                  awards === 1 ? "" : "s"
              }${awardVolume ? `, totaling <strong>${esc(awardVolume)}</strong> in obligated work` : ""}, performing to the standard agencies expect.`
            : awardVolume
                ? `${esc(company)} has delivered <strong>${esc(awardVolume)}</strong> in federal work, performing to the standard agencies expect.`
                : `${esc(company)} has a track record of federal performance with the agencies below.`;

    const pastPerfHtml = hasPastPerf
        ? `<section class="section" id="performance">
        <div class="container">
          <div class="perf">
            <div class="perf-icon">${shieldSvg(accent)}</div>
            <div class="perf-body">
              <span class="eyebrow">Past performance</span>
              <h2>Trusted by federal agencies</h2>
              <p>${perfLead}</p>
              ${perfStatChips.length ? `<div class="perf-stats">${perfStatChips.join("")}</div>` : ""}
              ${
                  dedupedAgencies.length
                      ? `<div class="perf-agencies"><span class="perf-agencies-label">Selected customers</span><div class="badges">${agencyChips}</div></div>`
                      : ""
              }
            </div>
          </div>
        </div>
      </section>`
        : "";

    // ── Client list ──
    // Deduped (case-insensitive) named clients rendered as logos-less name chips.
    const clientList = uniqStrings(input.clientList).slice(0, 24);
    const clientListHtml = clientList.length
        ? `<section class="section section-alt" id="clients">
        <div class="container">
          <div class="section-head">
            <span class="eyebrow">Who we serve</span>
            <h2>Client list</h2>
          </div>
          <div class="client-chips">
            ${clientList.map((name) => `<span class="client-chip">${esc(name)}</span>`).join("")}
          </div>
        </div>
      </section>`
        : "";

    const contactRows: string[] = [];
    if (contact.name) contactRows.push(`<li><span class="ct-label">Contact</span><span>${esc(contact.name)}</span></li>`);
    if (contact.email)
        contactRows.push(
            `<li><span class="ct-label">Email</span><a href="mailto:${esc(contact.email)}">${esc(contact.email)}</a></li>`,
        );
    if (contact.phone)
        contactRows.push(
            `<li><span class="ct-label">Phone</span><a href="tel:${esc(contact.phone)}">${esc(contact.phone)}</a></li>`,
        );
    if (locLine) contactRows.push(`<li><span class="ct-label">Location</span><span>${esc(locLine)}</span></li>`);
    if (contact.website) {
        const href = /^https?:\/\//i.test(contact.website) ? contact.website : `https://${contact.website}`;
        contactRows.push(
            `<li><span class="ct-label">Website</span><a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(
                contact.website,
            )}</a></li>`,
        );
    }

    const contactCta = contact.email ? `mailto:${esc(contact.email)}` : "#contact";

    const heroStyle = hasHeroImage
        ? `background-image: linear-gradient(135deg, ${escCss(accent)}e6 0%, ${escCss(
              accentDark,
          )}f2 100%), url('${esc(heroImage)}'); background-size: cover; background-position: center;`
        : `background-image: linear-gradient(135deg, ${escCss(accent)} 0%, ${escCss(accentDark)} 100%);`;

    const year = new Date().getFullYear();

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(company)}</title>
<meta name="description" content="${esc(tagline)}" />
<meta property="og:title" content="${esc(company)}" />
<meta property="og:description" content="${esc(tagline)}" />
<meta property="og:type" content="website" />
<style>
  :root {
    --accent: ${escCss(accent)};
    --accent-dark: ${escCss(accentDark)};
    --accent-fg: ${escCss(accentFg)};
    --ink: #1a1d23;
    --muted: #5b6470;
    --line: #e7e9ee;
    --bg: #ffffff;
    --bg-alt: #f6f7f9;
  }
  * { box-sizing: border-box; }
  html { scroll-behavior: smooth; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji", sans-serif;
    color: var(--ink);
    background: var(--bg);
    line-height: 1.65;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }
  a { color: var(--accent); }
  .container { width: 100%; max-width: 1040px; margin: 0 auto; padding: 0 24px; }
  h1, h2, h3 { line-height: 1.2; margin: 0; letter-spacing: -0.02em; }
  .eyebrow {
    display: inline-block; font-size: 12px; font-weight: 700; letter-spacing: 0.12em;
    text-transform: uppercase; color: var(--accent); margin-bottom: 10px;
  }

  /* ── Top bar ── */
  .topbar {
    position: sticky; top: 0; z-index: 20;
    background: rgba(255,255,255,0.92); backdrop-filter: saturate(180%) blur(10px);
    border-bottom: 1px solid var(--line);
  }
  .topbar .container { display: flex; align-items: center; justify-content: space-between; height: 64px; }
  .brand { display: flex; align-items: center; gap: 10px; font-weight: 800; font-size: 17px; color: var(--ink); }
  .brand .mono {
    width: 34px; height: 34px; border-radius: 9px; background: var(--accent); color: var(--accent-fg);
    display: inline-flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 800; letter-spacing: 0;
  }
  .nav-cta {
    display: inline-flex; align-items: center; gap: 8px; text-decoration: none;
    background: var(--accent); color: var(--accent-fg); font-weight: 700; font-size: 14px;
    padding: 9px 18px; border-radius: 999px; transition: transform .15s ease, opacity .15s ease;
  }
  .nav-cta:hover { opacity: .92; transform: translateY(-1px); }

  /* ── Hero ── */
  .hero {
    color: #fff; padding: 96px 0 88px; ${heroStyle}
  }
  .hero .container { max-width: 820px; }
  .hero h1 { font-size: clamp(34px, 5.2vw, 56px); font-weight: 800; }
  .hero .lead { font-size: clamp(17px, 2.2vw, 21px); margin-top: 18px; opacity: 0.94; max-width: 640px; }
  .hero .hero-cta {
    display: inline-flex; align-items: center; gap: 9px; margin-top: 30px; text-decoration: none;
    background: #fff; color: var(--accent); font-weight: 800; font-size: 15px;
    padding: 14px 28px; border-radius: 999px; transition: transform .15s ease, box-shadow .15s ease;
    box-shadow: 0 8px 24px rgba(0,0,0,0.18);
  }
  .hero .hero-cta:hover { transform: translateY(-2px); box-shadow: 0 12px 30px rgba(0,0,0,0.24); }

  /* ── Stats ── */
  .stats {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 1px;
    background: var(--line); border: 1px solid var(--line); border-radius: 16px; overflow: hidden;
    margin: -44px auto 0; max-width: 1040px; position: relative; z-index: 5;
  }
  .stats .stat { background: #fff; padding: 24px 18px; text-align: center; }
  .stat-value { font-size: 30px; font-weight: 800; color: var(--accent); letter-spacing: -0.03em; }
  .stat-label { font-size: 13px; color: var(--muted); margin-top: 4px; font-weight: 600; }

  /* ── Sections ── */
  .section { padding: 80px 0; }
  .section-alt { background: var(--bg-alt); }
  .section-head { margin-bottom: 40px; }
  .section-head h2 { font-size: clamp(26px, 3.4vw, 36px); font-weight: 800; }

  .about-grid { display: grid; grid-template-columns: 1fr; gap: 24px; }
  .about p { font-size: 17px; color: var(--muted); margin: 0; }
  .about p + p { margin-top: 16px; }

  /* ── Service cards ── */
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 18px; }
  .card {
    background: #fff; border: 1px solid var(--line); border-radius: 16px; padding: 26px 24px;
    transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease;
  }
  .card:hover { transform: translateY(-3px); box-shadow: 0 14px 34px rgba(20,24,33,0.08); border-color: transparent; }
  .card-mark { width: 38px; height: 4px; border-radius: 999px; background: var(--accent); margin-bottom: 16px; }
  .card h3 { font-size: 18px; font-weight: 700; }
  .card p { font-size: 14.5px; color: var(--muted); margin: 10px 0 0; }

  /* ── Badges ── */
  .badges { display: flex; flex-wrap: wrap; gap: 10px; }
  .badge {
    display: inline-flex; align-items: center; background: #fff; border: 1px solid var(--line);
    color: var(--ink); font-size: 13.5px; font-weight: 600; padding: 8px 14px; border-radius: 999px;
  }
  .badge-cert { background: var(--accent); color: var(--accent-fg); border-color: var(--accent); }
  .ids { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 22px; }
  .id-row {
    display: flex; flex-direction: column; gap: 2px; background: #fff; border: 1px solid var(--line);
    border-radius: 12px; padding: 12px 18px;
  }
  .id-row span { font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--muted); font-weight: 700; }
  .id-row strong { font-size: 15px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }

  /* ── Past performance ── */
  .perf { display: flex; gap: 24px; align-items: flex-start; }
  .perf-icon { flex: 0 0 auto; }
  .perf-body { flex: 1 1 auto; min-width: 0; }
  .perf h2 { font-size: clamp(24px, 3.2vw, 32px); font-weight: 800; }
  .perf p { font-size: 17px; color: var(--muted); margin: 12px 0 0; max-width: 640px; }
  .perf-stats { display: flex; flex-wrap: wrap; gap: 28px; margin-top: 22px; }
  .perf-stat { display: flex; flex-direction: column; }
  .perf-stat-value { font-size: 28px; font-weight: 800; color: var(--accent); letter-spacing: -0.03em; }
  .perf-stat-label { font-size: 13px; color: var(--muted); font-weight: 600; margin-top: 2px; }
  .perf-agencies { margin-top: 26px; }
  .perf-agencies-label { display: block; font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--muted); font-weight: 700; margin-bottom: 12px; }

  /* ── Client list ── */
  .client-chips { display: flex; flex-wrap: wrap; gap: 12px; }
  .client-chip {
    display: inline-flex; align-items: center; background: #fff; border: 1px solid var(--line);
    color: var(--ink); font-size: 15px; font-weight: 600; padding: 12px 20px; border-radius: 12px;
  }

  /* ── Contact ── */
  .contact-card {
    background: linear-gradient(135deg, var(--accent) 0%, var(--accent-dark) 100%);
    color: #fff; border-radius: 22px; padding: 48px 40px;
  }
  .contact-card h2 { font-size: clamp(26px, 3.4vw, 34px); font-weight: 800; color: #fff; }
  .contact-card .sub { opacity: 0.9; margin-top: 10px; font-size: 16px; }
  .contact-list { list-style: none; padding: 0; margin: 28px 0 0; display: grid; grid-template-columns: 1fr; gap: 12px; max-width: 480px; }
  .contact-list li { display: flex; align-items: baseline; gap: 14px; font-size: 16px; }
  .contact-list a { color: #fff; text-decoration: underline; text-underline-offset: 3px; word-break: break-word; }
  .ct-label { flex: 0 0 84px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; opacity: 0.7; font-weight: 700; }
  .contact-cta {
    display: inline-flex; align-items: center; gap: 8px; margin-top: 28px; text-decoration: none;
    background: #fff; color: var(--accent); font-weight: 800; font-size: 15px;
    padding: 13px 26px; border-radius: 999px;
  }

  /* ── Footer ── */
  footer { padding: 32px 0; border-top: 1px solid var(--line); }
  footer .container { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: space-between; }
  footer .muted { color: var(--muted); font-size: 13px; }
  footer .made { color: var(--muted); font-size: 12px; }

  @media (max-width: 600px) {
    .hero { padding: 72px 0 64px; }
    .section { padding: 56px 0; }
    .perf { flex-direction: column; }
    .contact-card { padding: 36px 24px; }
  }
</style>
</head>
<body>
  <header class="topbar">
    <div class="container">
      <div class="brand"><span class="mono">${esc(initials(company))}</span><span>${esc(company)}</span></div>
      <a class="nav-cta" href="${contactCta}">Get in touch</a>
    </div>
  </header>

  <main>
    <section class="hero">
      <div class="container">
        <h1>${esc(company)}</h1>
        <p class="lead">${esc(tagline)}</p>
        <a class="hero-cta" href="${contactCta}">Get in touch ${arrowSvg()}</a>
      </div>
    </section>

    ${statsHtml ? `<div class="container" style="padding:0 24px;">${statsHtml}</div>` : ""}

    <section class="section about" id="about">
      <div class="container">
        <div class="section-head">
          <span class="eyebrow">About us</span>
          <h2>Who we are</h2>
        </div>
        <div class="about-grid"><div><p>${esc(about)}</p></div></div>
      </div>
    </section>

    ${servicesHtml}
    ${capabilitiesHtml}
    ${pastPerfHtml}
    ${clientListHtml}

    <section class="section section-alt" id="contact">
      <div class="container">
        <div class="contact-card">
          <h2>Let's work together</h2>
          <p class="sub">Reach out to learn how ${esc(company)} can support your mission.</p>
          ${contactRows.length ? `<ul class="contact-list">${contactRows.join("")}</ul>` : ""}
          ${contact.email ? `<a class="contact-cta" href="mailto:${esc(contact.email)}">Email us ${arrowSvg("var(--accent)")}</a>` : ""}
        </div>
      </div>
    </section>
  </main>

  <footer>
    <div class="container">
      <span class="muted">&copy; ${year} ${esc(company)}. All rights reserved.</span>
      <span class="made">Site preview</span>
    </div>
  </footer>
</body>
</html>`;
}

// ── inline SVG helpers (no external assets) ──

function arrowSvg(stroke = "currentColor"): string {
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${escCss(
        stroke,
    )}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>`;
}

function shieldSvg(color: string): string {
    return `<svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="${escCss(
        color,
    )}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><polyline points="9 12 11 14 15 10"></polyline></svg>`;
}
