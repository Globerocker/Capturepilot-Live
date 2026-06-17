/**
 * GET  /api/admin/outreach/contacts — filtered + paginated list
 * POST /api/admin/outreach/contacts — create a single contact
 *
 * Filters (all optional, all repeatable unless noted):
 *   ?source=apollo&source=sam_gov
 *   ?tag=cold-outreach&tag=fy25
 *   ?naics=541330                (prefix match, repeatable — ICP)
 *   ?state=VA&state=DC           (ICP)
 *   ?cert=8(a)&cert=WOSB         (ICP set-aside / SBA cert — matched via contractor join)
 *   ?psc=R425&psc=D302           (matched via contractor join — contacts with no
 *                                 contractor match are excluded while a PSC filter is active)
 *   ?has_email=1                 (only rows with a non-null email; OFF by default —
 *                                 pass has_email=1 to hide phone-only / email-less rows)
 *   ?engagement=7d|30d|never
 *   ?status=subscribed|unsubscribed|bounced
 *   ?q=foo                       (matches email, name, company)
 *   ?list_id=<uuid>              (members of a saved list)
 *   ?sort=company_name&dir=asc   (sort key + direction; default created_at desc)
 *   ?limit=50&offset=0
 *
 * Sort keys:
 *   - Direct columns sorted in SQL: company_name, email, state, created_at, engagement_score
 *   - Derived (contractor-join) keys sorted in-memory before pagination:
 *       past_awards (federal_awards_count), last_award (last_award_date), years_on_sam
 *
 * Each returned contact is augmented with a `contractor` block holding
 * best-effort SAM.gov intelligence (past awards, last award date, years on SAM,
 * matched PSCs/certs, and whether a public listing page exists). `contractor`
 * is null when no match is found.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, getServiceClient } from "@/lib/admin-auth";

interface ContractorIntel {
    uei: string | null;
    federal_awards_count: number | null;
    last_award_date: string | null;
    activation_date: string | null;
    years_on_sam: number | null;
    psc_codes: string[];
    certifications: string[];
    has_listing_page: boolean;
    listing_slug: string | null;
}

/** Normalize a company name for fuzzy contractor matching (lowercase, strip punctuation). */
function normalizeCompany(name: string | null | undefined): string {
    return (name || "")
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

/** Whole years between a date and now, or null if the date is missing/invalid. */
function yearsSince(dateStr: string | null | undefined): number | null {
    if (!dateStr) return null;
    const then = new Date(dateStr).getTime();
    if (Number.isNaN(then)) return null;
    const years = (Date.now() - then) / (365.25 * 86400000);
    return years < 0 ? 0 : Math.floor(years);
}

export async function GET(req: NextRequest) {
    const { unauth } = await requireAdmin();
    if (unauth) return unauth;

    const sp = req.nextUrl.searchParams;
    const limit = Math.min(Number(sp.get("limit") || 50), 200);
    const offset = Math.max(Number(sp.get("offset") || 0), 0);

    const sources = sp.getAll("source").filter(Boolean);
    const tags = sp.getAll("tag").filter(Boolean);
    const naicsList = sp.getAll("naics").filter(Boolean);
    const states = sp.getAll("state").filter(Boolean);
    const certs = sp.getAll("cert").filter(Boolean);
    const pscList = sp.getAll("psc").map(p => p.trim().toUpperCase()).filter(Boolean);
    // Has-email is OFF by default so SMS-only / email-less contacts are visible.
    // Pass has_email=1 (the UI "Has email only" toggle) to hide rows with no email.
    const hasEmail = sp.get("has_email") === "1";
    const engagement = sp.get("engagement");
    const status = sp.get("status");
    const q = sp.get("q")?.trim();
    const listId = sp.get("list_id");

    // Sorting. Direct columns map to a real DB column for SQL .order(); derived
    // keys sort the assembled result array in-memory (they come off the
    // contractor join, which PostgREST can't order on here).
    const DIRECT_SORT_COLUMNS: Record<string, string> = {
        company_name: "company_name",
        email: "email",
        state: "state",
        created_at: "created_at",
        engagement_score: "engagement_score",
    };
    const DERIVED_SORT_KEYS = new Set(["past_awards", "last_award", "years_on_sam"]);
    const sortKeyRaw = sp.get("sort") || "created_at";
    const sortKey =
        sortKeyRaw in DIRECT_SORT_COLUMNS || DERIVED_SORT_KEYS.has(sortKeyRaw)
            ? sortKeyRaw
            : "created_at";
    const dirAsc = sp.get("dir") === "asc";
    const isDerivedSort = DERIVED_SORT_KEYS.has(sortKey);

    const sb = getServiceClient();

    // List membership filter first — fetches matching contact_ids, then we join.
    let listMemberIds: string[] | null = null;
    if (listId) {
        const { data: members } = await sb
            .from("outreach_list_members")
            .select("contact_id")
            .eq("list_id", listId)
            .limit(5000);
        listMemberIds = (members || []).map(m => m.contact_id);
        if (listMemberIds.length === 0) {
            return NextResponse.json({ contacts: [], total: 0, limit, offset, capped: false });
        }
    }

    // PSC + cert filters resolve through the contractor join. We pre-fetch the
    // set of contractor company-names / UEIs that satisfy them, then constrain
    // the contacts query to rows whose company_name or source_id matches.
    let intelMatchNames: Set<string> | null = null; // normalized company names
    let intelMatchUeis: Set<string> | null = null;
    if (pscList.length || certs.length) {
        let cq = sb
            .from("contractors")
            .select("uei, company_name")
            .limit(50000);
        if (pscList.length) cq = cq.overlaps("psc_codes", pscList);
        if (certs.length) {
            // Match either the SAM cert array or the generic certifications array.
            const orClause = certs
                .flatMap(c => [`sba_certifications.cs.{${c}}`, `certifications.cs.{${c}}`])
                .join(",");
            cq = cq.or(orClause);
        }
        const { data: matched, error: cErr } = await cq;
        if (cErr) {
            return NextResponse.json({ error: cErr.message }, { status: 500 });
        }
        intelMatchNames = new Set<string>();
        intelMatchUeis = new Set<string>();
        for (const m of matched || []) {
            const n = normalizeCompany(m.company_name);
            if (n) intelMatchNames.add(n);
            if (m.uei) intelMatchUeis.add(m.uei);
        }
        if (intelMatchNames.size === 0 && intelMatchUeis.size === 0) {
            // Nothing in the contractor set satisfies the filter → no contacts can.
            return NextResponse.json({ contacts: [], total: 0, limit, offset, capped: false });
        }
    }

    // A PSC/cert filter resolves through the contractor join, which PostgREST
    // can't express as a normalized join. In that mode we fetch a bounded window,
    // filter it in-memory against the matched contractor set, then paginate the
    // result locally so `total` stays consistent with the rendered rows. A
    // derived sort (past_awards / last_award / years_on_sam) likewise needs the
    // contractor join attached before we can order, so it forces the same
    // bounded-window + in-memory path. Without either we paginate normally in SQL.
    const intelFilterActive = !!(intelMatchNames || intelMatchUeis);
    const inMemoryMode = intelFilterActive || isDerivedSort;
    // Bounded window for the in-memory filter/sort path. Raised from 5k → 50k so
    // we no longer SILENTLY truncate large result sets when a derived-sort /
    // PSC / cert filter is active. If the DB returns exactly this many rows the
    // window is (likely) full and we surface a `capped` flag to the UI instead
    // of pretending the page is complete.
    const IN_MEMORY_WINDOW = 50000;
    const SELECT_COLS =
        "id, email, phone, first_name, last_name, company_name, title, naics_codes, state, source, source_id, tags, custom_fields, engagement_score, last_engagement_at, last_bounced_at, opted_out_at, created_at";

    // Skip the DB count while we're in in-memory mode — we compute the true
    // total in-memory after the contractor-match / sort pass below.
    const selectOpts: { count?: "estimated" } = inMemoryMode ? {} : { count: "estimated" };
    let query = sb
        .from("outreach_contacts")
        .select(SELECT_COLS, selectOpts);

    // Direct-column sort happens in SQL; derived sort is applied in-memory below.
    if (!isDerivedSort) {
        query = query.order(DIRECT_SORT_COLUMNS[sortKey], {
            ascending: dirAsc,
            nullsFirst: false,
        });
    } else {
        // Stable secondary order for the window we then re-sort in-memory.
        query = query.order("created_at", { ascending: false, nullsFirst: false });
    }

    if (!inMemoryMode) {
        query = query.range(offset, offset + limit - 1);
    } else {
        // Bounded window for the in-memory filter/sort. See IN_MEMORY_WINDOW.
        query = query.range(0, IN_MEMORY_WINDOW - 1);
    }

    if (sources.length) query = query.in("source", sources);
    if (states.length) query = query.in("state", states);
    if (tags.length) query = query.overlaps("tags", tags);
    if (listMemberIds) query = query.in("id", listMemberIds);
    if (hasEmail) query = query.not("email", "is", null);

    // NAICS prefix match — fan out OR clauses that match any element starting
    // with the prefix. (Postgres array prefix isn't expressible directly in PostgREST.)
    if (naicsList.length) {
        const orClauses = naicsList.map(p => `naics_codes.cs.{${p}}`).join(",");
        query = query.or(orClauses);
    }

    if (engagement === "7d") {
        const cutoff = new Date(Date.now() - 7 * 86400000).toISOString();
        query = query.gte("last_engagement_at", cutoff);
    } else if (engagement === "30d") {
        const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
        query = query.gte("last_engagement_at", cutoff);
    } else if (engagement === "never") {
        query = query.is("last_engagement_at", null);
    }

    if (status === "subscribed") {
        query = query.is("opted_out_at", null).is("last_bounced_at", null);
    } else if (status === "unsubscribed") {
        query = query.not("opted_out_at", "is", null);
    } else if (status === "bounced") {
        query = query.not("last_bounced_at", "is", null);
    }

    if (q) {
        const safe = q.replace(/[%,]/g, "");
        query = query.or(
            `email.ilike.%${safe}%,first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,company_name.ilike.%${safe}%`
        );
    }

    const { data, error, count } = await query;
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let contacts = data || [];
    let total = count ?? 0;
    // In in-memory mode the bounded window may have clipped the true result set.
    // If the raw DB rows came back at exactly the window size there are (almost
    // certainly) more rows we didn't see, so the in-memory `total` and any
    // derived sort are computed over a partial set. Flag it so the UI can warn
    // the user to narrow filters rather than silently truncating.
    const capped = inMemoryMode && (data?.length || 0) >= IN_MEMORY_WINDOW;

    if (intelFilterActive) {
        // Drop rows with no matching contractor (in-memory pass covers the
        // normalized company-name path PostgREST can't express).
        contacts = contacts.filter(c => {
            const byUei = !!(c.source === "sam_gov" && c.source_id && intelMatchUeis?.has(c.source_id));
            const byName = !!intelMatchNames?.has(normalizeCompany(c.company_name));
            return byUei || byName;
        });
    }

    // When sorting on a derived (contractor-join) key we must enrich the whole
    // bounded window, sort it, then paginate locally so `total` and the rendered
    // page agree. Attach intel to the window, sort, slice.
    if (isDerivedSort) {
        const intelForWindow = await buildContractorIntel(sb, contacts);
        const windowEnriched = contacts.map(c => ({
            ...c,
            contractor: intelForWindow.get(c.id) || null,
        }));

        const valueOf = (row: (typeof windowEnriched)[number]): number => {
            const ctr = row.contractor;
            if (sortKey === "past_awards") return ctr?.federal_awards_count ?? -1;
            if (sortKey === "years_on_sam") return ctr?.years_on_sam ?? -1;
            // last_award → epoch ms (missing dates sort to the bottom).
            const t = ctr?.last_award_date ? new Date(ctr.last_award_date).getTime() : NaN;
            return Number.isNaN(t) ? -1 : t;
        };
        windowEnriched.sort((a, b) => {
            const diff = valueOf(a) - valueOf(b);
            return dirAsc ? diff : -diff;
        });

        total = windowEnriched.length;
        const enriched = windowEnriched.slice(offset, offset + limit);
        return NextResponse.json({ contacts: enriched, total, limit, offset, capped });
    }

    if (intelFilterActive) {
        total = contacts.length;
        contacts = contacts.slice(offset, offset + limit);
    }

    // Attach contractor intelligence to the page of contacts. Batch the lookup:
    //   - sam_gov rows match contractors by uei (= source_id)
    //   - everything else matches by normalized company_name (ILIKE-ish equality)
    const intelByContactId = await buildContractorIntel(sb, contacts);
    const enriched = contacts.map(c => ({ ...c, contractor: intelByContactId.get(c.id) || null }));

    return NextResponse.json({ contacts: enriched, total, limit, offset, capped });
}

/**
 * Best-effort join of a page of contacts to the `contractors` table + the
 * `contractor_profile_pages` listing table. Bounded by the page size (≤200),
 * so this is at most a couple of indexed lookups.
 */
async function buildContractorIntel(
    sb: ReturnType<typeof getServiceClient>,
    contacts: Array<{ id: string; source: string | null; source_id: string | null; company_name: string | null }>
): Promise<Map<string, ContractorIntel>> {
    const out = new Map<string, ContractorIntel>();
    if (!contacts.length) return out;

    const ueis = Array.from(
        new Set(contacts.filter(c => c.source === "sam_gov" && c.source_id).map(c => c.source_id as string))
    );
    // Distinct normalized names → original sample (for an ILIKE lookup).
    const nameMap = new Map<string, string>(); // normalized -> first raw name seen
    for (const c of contacts) {
        const n = normalizeCompany(c.company_name);
        if (n && !nameMap.has(n)) nameMap.set(n, (c.company_name || "").trim());
    }

    const COLS =
        "uei, company_name, federal_awards_count, last_award_date, activation_date, psc_codes, certifications, sba_certifications";

    type ContractorRow = {
        uei: string | null;
        company_name: string | null;
        federal_awards_count: number | null;
        last_award_date: string | null;
        activation_date: string | null;
        psc_codes: string[] | null;
        certifications: string[] | null;
        sba_certifications: string[] | null;
    };

    const byUei = new Map<string, ContractorRow>();
    const byName = new Map<string, ContractorRow>(); // normalized name -> row

    // 1) UEI lookups (sam_gov rows).
    if (ueis.length) {
        const { data } = await sb
            .from("contractors")
            .select(COLS)
            .in("uei", ueis.slice(0, 500));
        for (const row of (data || []) as ContractorRow[]) {
            if (row.uei) byUei.set(row.uei, row);
        }
    }

    // 2) Company-name lookups (everything else). One ILIKE-OR query against the
    //    distinct names on this page keeps it to a single round trip.
    const names = Array.from(nameMap.values()).filter(Boolean).slice(0, 200);
    if (names.length) {
        const orClause = names
            .map(n => `company_name.ilike.${n.replace(/[%,()]/g, " ").trim()}%`)
            .filter(s => s.length > "company_name.ilike.%".length)
            .join(",");
        if (orClause) {
            const { data } = await sb
                .from("contractors")
                .select(COLS)
                .or(orClause)
                .limit(500);
            for (const row of (data || []) as ContractorRow[]) {
                const n = normalizeCompany(row.company_name);
                // Keep the first match per normalized name (prefer one with awards).
                const existing = byName.get(n);
                if (!existing || (row.federal_awards_count || 0) > (existing.federal_awards_count || 0)) {
                    byName.set(n, row);
                }
            }
        }
    }

    // 3) Listing-page lookup for all matched UEIs.
    const matchedUeis = new Set<string>();
    for (const r of byUei.values()) if (r.uei) matchedUeis.add(r.uei);
    for (const r of byName.values()) if (r.uei) matchedUeis.add(r.uei);
    const listingByUei = new Map<string, string>(); // uei -> slug
    if (matchedUeis.size) {
        const { data: pages } = await sb
            .from("contractor_profile_pages")
            .select("contractor_uei, slug")
            .eq("is_published", true)
            .in("contractor_uei", Array.from(matchedUeis).slice(0, 500));
        for (const p of pages || []) {
            if (p.contractor_uei) listingByUei.set(p.contractor_uei, p.slug);
        }
    }

    const toIntel = (row: ContractorRow): ContractorIntel => {
        const certs = [
            ...(row.sba_certifications || []),
            ...(row.certifications || []),
        ].filter(Boolean);
        const slug = row.uei ? listingByUei.get(row.uei) || null : null;
        return {
            uei: row.uei,
            federal_awards_count: row.federal_awards_count ?? null,
            last_award_date: row.last_award_date ?? null,
            activation_date: row.activation_date ?? null,
            years_on_sam: yearsSince(row.activation_date),
            psc_codes: row.psc_codes || [],
            certifications: Array.from(new Set(certs)),
            has_listing_page: !!slug,
            listing_slug: slug,
        };
    };

    for (const c of contacts) {
        let row: ContractorRow | undefined;
        if (c.source === "sam_gov" && c.source_id) row = byUei.get(c.source_id);
        if (!row) row = byName.get(normalizeCompany(c.company_name));
        if (row) out.set(c.id, toIntel(row));
    }

    return out;
}

export async function POST(req: NextRequest) {
    const { unauth } = await requireAdmin();
    if (unauth) return unauth;

    const body = await req.json().catch(() => ({}));
    const {
        email, phone, first_name, last_name, company_name, title,
        naics_codes, state, source, source_id, tags, custom_fields
    } = body || {};

    if (!email && !phone) {
        return NextResponse.json({ error: "email or phone required" }, { status: 400 });
    }

    const sb = getServiceClient();
    const row = {
        email: email ? String(email).toLowerCase() : null,
        phone: phone || null,
        first_name: first_name || null,
        last_name: last_name || null,
        company_name: company_name || null,
        title: title || null,
        naics_codes: Array.isArray(naics_codes) ? naics_codes : [],
        state: state || null,
        source: source || "manual_import",
        source_id: source_id || null,
        tags: Array.isArray(tags) ? tags : [],
        custom_fields: custom_fields || {},
    };

    const { data, error } = await sb
        .from("outreach_contacts")
        .upsert(row, { onConflict: "email", ignoreDuplicates: false })
        .select()
        .single();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ contact: data });
}
