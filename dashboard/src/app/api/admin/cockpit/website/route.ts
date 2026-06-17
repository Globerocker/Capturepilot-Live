/**
 * POST /api/admin/cockpit/website
 *
 * "Build website" — turns a contractor (especially one with NO website) into a
 * clean, professional, SHAREABLE one-pager a partner can send: "here's what your
 * site could look like."
 *
 * Flow:
 *   1. Load the contractor row (service client).
 *   2. Derive an accent color:
 *        - if the contractor HAS a website → best-effort fetch the homepage and
 *          pull a brand color (theme-color meta / --primary CSS vars / palette).
 *        - else → tasteful default navy (#1e3a5f), handled by buildOnePager.
 *   3. Best-effort Brave IMAGE search for a tasteful hero image (graceful null if
 *      BRAVE_SEARCH_API_KEY unset or the call fails).
 *   4. Build the self-contained HTML via buildOnePager().
 *   5. Upsert into contractor_websites keyed by a STABLE slug
 *      (slugify(company_name) + '-' + short(contractor_id)) so re-runs overwrite.
 *
 * Returns: { ok: true, slug, url: '/site/<slug>' } | { ok: false, error }
 *
 * Admin-gated via assertAdmin(). Service client for the read + upsert.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertAdmin } from "@/lib/auth-admin";
import { buildOnePager, type OnePagerInput, type OnePagerService } from "@/lib/website-builder";
import { getNaicsDescription } from "@/lib/naics-labels";
import { assertSafePublicUrl } from "@/lib/ssrf-guard";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const maxDuration = 120;
export const dynamic = "force-dynamic";

function svc() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );
}

// ───────────────────────── helpers ─────────────────────────

/** Stable, URL-safe slug = slugify(company) + '-' + first 8 of the contractor id. */
function makeSlug(companyName: string | null | undefined, contractorId: string): string {
    const base = (companyName || "company")
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48) || "company";
    const short = contractorId.replace(/-/g, "").slice(0, 8);
    return `${base}-${short}`;
}

function toStrArray(v: unknown): string[] {
    if (!Array.isArray(v)) return [];
    return v
        .map((x) =>
            typeof x === "string"
                ? x
                : x && typeof x === "object"
                    ? String((x as any).type || (x as any).name || "")
                    : "",
        )
        .filter(Boolean);
}

/** Normalize capability_summary_ai.services into {name, description} cards. */
function toServices(v: unknown): OnePagerService[] {
    if (!Array.isArray(v)) return [];
    const out: OnePagerService[] = [];
    for (const s of v) {
        if (typeof s === "string") {
            if (s.trim()) out.push({ name: s.trim() });
        } else if (s && typeof s === "object") {
            const name = String((s as any).name || (s as any).title || (s as any).service || "").trim();
            const description = String((s as any).description || (s as any).detail || "").trim();
            if (name) out.push({ name, description: description || null });
        }
    }
    return out;
}

function normalizeUrl(raw: string): string {
    const t = raw.trim();
    if (!/^https?:\/\//i.test(t)) return "https://" + t.replace(/^\/+/, "");
    return t;
}

// ── Light brand-color extraction (cheap path of /api/brand) ──
// Single homepage fetch; pull the strongest signal: theme-color meta, then
// --primary/--brand CSS vars, then the most frequent non-noise hex. Returns null
// on any failure so the builder falls back to its default navy.

function isNoiseColor(hex: string): boolean {
    const h = hex.toLowerCase().replace("#", "");
    if (h.length !== 6) return true;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    if (r > 245 && g > 245 && b > 245) return true; // near-white
    if (r < 12 && g < 12 && b < 12) return true; // near-black
    if (Math.max(r, g, b) - Math.min(r, g, b) < 8) return true; // grayscale
    return false;
}

function normalizeHex(raw: string): string {
    let h = raw.replace("#", "").toLowerCase().trim();
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    if (h.length === 8) h = h.slice(0, 6);
    if (h.length !== 6 || /[^0-9a-f]/.test(h)) return "";
    return "#" + h;
}

async function extractBrandColor(website: string): Promise<string | null> {
    let url: string;
    try {
        url = normalizeUrl(website);
        await assertSafePublicUrl(url); // SSRF guard before any fetch
    } catch {
        return null;
    }
    let html = "";
    try {
        const res = await fetch(url, {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; CapturePilot-SiteBuilder/1.0)" },
            signal: AbortSignal.timeout(12000),
            redirect: "follow",
        });
        if (!res.ok) return null;
        html = (await res.text()).slice(0, 600_000);
    } catch {
        return null;
    }

    // 1) theme-color meta — most accurate brand signal.
    const theme = html.match(/<meta[^>]+name=["']theme-color["'][^>]+content=["']([^"']+)["']/i);
    if (theme) {
        const n = normalizeHex(theme[1]);
        if (n && !isNoiseColor(n)) return n;
    }

    // 2) --primary / --brand CSS variable values.
    const varRe = /--(?:primary|brand|main|accent|color-primary|color-brand|theme)[-\w]*:\s*(#[0-9a-fA-F]{3,8})/gi;
    let vm: RegExpExecArray | null;
    while ((vm = varRe.exec(html)) !== null) {
        const n = normalizeHex(vm[1]);
        if (n && !isNoiseColor(n)) return n;
    }

    // 3) Most frequent non-noise hex on the page.
    const counts = new Map<string, number>();
    const hexRe = /#([0-9a-fA-F]{6})\b/g;
    let m: RegExpExecArray | null;
    while ((m = hexRe.exec(html)) !== null) {
        const n = normalizeHex(m[0]);
        if (!n || isNoiseColor(n)) continue;
        counts.set(n, (counts.get(n) || 0) + 1);
    }
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    return ranked.length ? ranked[0][0] : null;
}

// ── Brave image search → a hero image url (graceful null) ──
async function findHeroImage(query: string): Promise<string | null> {
    const key = process.env.BRAVE_SEARCH_API_KEY;
    if (!key) return null;
    try {
        const u = new URL("https://api.search.brave.com/res/v1/images/search");
        u.searchParams.set("q", query);
        u.searchParams.set("count", "5");
        const res = await fetch(u.toString(), {
            headers: { "X-Subscription-Token": key, Accept: "application/json" },
            signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) return null;
        const data: any = await res.json().catch(() => null);
        const results: any[] = Array.isArray(data?.results) ? data.results : [];
        for (const r of results) {
            const candidate: string | undefined = r?.properties?.url || r?.thumbnail?.src;
            if (typeof candidate === "string" && /^https:\/\//i.test(candidate)) {
                return candidate;
            }
        }
        return null;
    } catch {
        return null;
    }
}

// ───────────────────────── handler ─────────────────────────

const CONTRACTOR_COLS =
    "id, uei, cage_code, company_name, website, business_url, email, primary_poc_name, primary_poc_email, " +
    "primary_poc_title, phone, naics_codes, certifications, sba_certifications, state, city, employee_count, " +
    "years_in_business, federal_awards_count, capability_summary_ai";

export async function POST(req: NextRequest) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;

    let body: Record<string, unknown>;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }
    const contractor_id = typeof body.contractor_id === "string" ? body.contractor_id : "";
    if (!contractor_id) {
        return NextResponse.json({ ok: false, error: "contractor_id required" }, { status: 400 });
    }

    const db = svc();

    // 1) Load the contractor.
    let c: any;
    try {
        const { data, error } = await db
            .from("contractors")
            .select(CONTRACTOR_COLS)
            .eq("id", contractor_id)
            .maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) return NextResponse.json({ ok: false, error: "contractor not found" }, { status: 404 });
        c = data;
    } catch (e: any) {
        console.error("[cockpit/website] load failed:", e?.message);
        return NextResponse.json({ ok: false, error: e?.message || "load failed" }, { status: 500 });
    }

    const blob = (c.capability_summary_ai || {}) as any;
    const companyName: string = c.company_name || "Your Company";
    const website: string | null = c.website || c.business_url || null;

    // 2) Brand color — extract if they have a site, else builder defaults to navy.
    let brandColor: string | null = null;
    if (website) {
        brandColor = await extractBrandColor(website).catch(() => null);
    }

    // 3) Hero image — best-effort Brave image search (graceful null).
    const services = toServices(blob.services);
    const firstNaics = toStrArray(c.naics_codes)[0] || "";
    const naicsDesc = firstNaics ? getNaicsDescription(firstNaics) : "";
    const primaryService =
        services[0]?.name ||
        toStrArray(blob.strengths)[0] ||
        (naicsDesc && naicsDesc !== "Unknown NAICS Code" ? naicsDesc : "") ||
        "professional services";
    const heroQuery = `${companyName} ${primaryService} office team`.trim().slice(0, 120);
    const heroImageUrl = await findHeroImage(heroQuery).catch(() => null);

    // 4) Build the HTML.
    const tagline =
        (typeof blob.tagline === "string" && blob.tagline.trim()) ||
        (toStrArray(blob.strengths).length
            ? `${companyName} — ${toStrArray(blob.strengths).slice(0, 2).join(", ")}.`
            : null);

    const input: OnePagerInput = {
        companyName,
        tagline,
        about: typeof blob.about === "string" ? blob.about : null,
        findingsSummary: typeof blob.findings_summary === "string" ? blob.findings_summary : null,
        strengths: toStrArray(blob.strengths),
        services,
        naicsCodes: toStrArray(c.naics_codes),
        certifications: toStrArray(c.certifications),
        sbaCertifications: toStrArray(c.sba_certifications),
        uei: c.uei || null,
        cageCode: c.cage_code || null,
        federalAwardsCount: typeof c.federal_awards_count === "number" ? c.federal_awards_count : null,
        yearsInBusiness: typeof c.years_in_business === "number" ? c.years_in_business : null,
        employeeCount: typeof c.employee_count === "number" ? c.employee_count : null,
        contact: {
            name: c.primary_poc_name || null,
            email: c.email || c.primary_poc_email || null,
            phone: c.phone || null,
            city: c.city || null,
            state: c.state || null,
            website,
        },
        brandColor,
        heroImageUrl,
    };

    let html: string;
    try {
        html = buildOnePager(input);
    } catch (e: any) {
        console.error("[cockpit/website] build failed:", e?.message);
        return NextResponse.json({ ok: false, error: "Could not build the site" }, { status: 500 });
    }

    // 5) Upsert keyed by contractor_id (idempotent). Stable slug.
    const slug = makeSlug(companyName, contractor_id);
    try {
        const { error } = await db
            .from("contractor_websites")
            .upsert(
                {
                    contractor_id,
                    slug,
                    html,
                    accent_color: brandColor,
                    hero_image_url: heroImageUrl,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: "contractor_id" },
            );
        if (error) throw new Error(error.message);
    } catch (e: any) {
        // contractor_id isn't a unique constraint by default — fall back to a
        // delete-then-insert keyed by contractor_id so re-runs stay idempotent.
        if (/no unique|on conflict|constraint/i.test(e?.message || "")) {
            try {
                await db.from("contractor_websites").delete().eq("contractor_id", contractor_id);
                const { error: insErr } = await db.from("contractor_websites").insert({
                    contractor_id,
                    slug,
                    html,
                    accent_color: brandColor,
                    hero_image_url: heroImageUrl,
                });
                if (insErr) throw new Error(insErr.message);
            } catch (e2: any) {
                console.error("[cockpit/website] upsert+fallback failed:", e2?.message);
                return NextResponse.json({ ok: false, error: e2?.message || "save failed" }, { status: 500 });
            }
        } else {
            console.error("[cockpit/website] upsert failed:", e?.message);
            return NextResponse.json({ ok: false, error: e?.message || "save failed" }, { status: 500 });
        }
    }

    return NextResponse.json({ ok: true, slug, url: `/site/${slug}` });
}
