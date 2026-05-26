/**
 * OpenGov Procurement ingest.
 *
 * Pulls open projects from each enabled OpenGov tenant in rss_sources
 * (provider='opengov'). Builds notice_ids prefixed with `opengov-<slug>-`
 * and upserts into opportunities with the standard SLED enrichment.
 *
 * Fetches both list (per-tenant) and detail (per-project) data, so each
 * row arrives with full description + attachments + NIGP or NAICS codes.
 *
 * Operator triggered. Reusing the existing rss_sources table — we identify
 * which tenant a row belongs to by parsing tenant slug from feed_url
 * (e.g. https://procurement.opengov.com/portal/phoenix → "phoenix").
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { guardCron } from "@/lib/cron-auth";
import { extractContacts } from "@/lib/extract-contacts";
import { extractRichFields } from "@/lib/extract-rich-fields";
import { fetchOpenGovProjects, fetchOpenGovProjectDetail } from "@/lib/parsers/opengov";
import crypto from "node:crypto";

export const runtime = "nodejs";
export const maxDuration = 300;

function shortHash(s: string): string {
    return crypto.createHash("sha1").update(s).digest("hex").slice(0, 16);
}

function deriveStatus(closeIso: string | null): string {
    if (!closeIso) return "ACTIVE";
    const d = new Date(closeIso).getTime();
    if (Number.isNaN(d)) return "ACTIVE";
    const days = (d - Date.now()) / 86_400_000;
    if (days < 0) return "EXPIRED";
    if (days < 7) return "EXPIRING_SOON";
    return "ACTIVE";
}

function extractSlug(feedUrl: string): string | null {
    // Accept both portal URLs and bare slugs.
    if (!feedUrl) return null;
    if (!feedUrl.includes("://")) return feedUrl; // already a slug
    const m = feedUrl.match(/\/portal\/([^/?#]+)/);
    return m ? m[1] : null;
}

export async function GET(req: NextRequest) {
    const denied = guardCron(req);
    if (denied) return denied;

    const url = new URL(req.url);
    const limitTenants = Math.min(Math.max(Number(url.searchParams.get("tenants") || 10), 1), 50);
    const perTenant = Math.min(Math.max(Number(url.searchParams.get("per_tenant") || 25), 1), 100);
    const fetchDetails = url.searchParams.get("detail") !== "false";

    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );

    const { data, error } = await sb
        .from("rss_sources")
        .select("id, feed_url, source_prefix, agency_name, agency_type, state, city, website, enabled")
        .eq("provider", "opengov")
        .eq("enabled", true)
        .order("last_fetched_at", { ascending: true, nullsFirst: true })
        .limit(limitTenants);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    type Src = { id: string; feed_url: string; source_prefix: string; agency_name: string | null; agency_type: string | null; state: string | null; city: string | null; website: string | null };
    const sources = (data || []) as Src[];
    if (sources.length === 0) {
        return NextResponse.json({ ok: true, polled: 0, note: "no enabled opengov sources — run /api/admin/opengov/activate to flip them on" });
    }

    const startedAt = Date.now();
    let totalSeen = 0;
    let totalInserted = 0;
    const perSourceResults: Array<{ source: string; items: number; inserted: number; status: string }> = [];

    for (const src of sources) {
        if (Date.now() - startedAt > 270_000) break;
        const slug = extractSlug(src.feed_url) || src.source_prefix.replace(/^opengov-/, "");
        if (!slug) {
            perSourceResults.push({ source: src.source_prefix, items: 0, inserted: 0, status: "no_slug" });
            continue;
        }

        const listings = await fetchOpenGovProjects({ tenantSlug: slug, pageSize: perTenant });
        totalSeen += listings.length;
        if (listings.length === 0) {
            await sb.from("rss_sources").update({
                last_fetched_at: new Date().toISOString(),
                last_status: "ok_empty",
                last_count: 0,
            }).eq("id", src.id);
            perSourceResults.push({ source: src.source_prefix, items: 0, inserted: 0, status: "ok_empty" });
            continue;
        }

        // For each listing, optionally fetch detail for richer fields.
        const details = fetchDetails
            ? await Promise.all(listings.slice(0, perTenant).map((l) => fetchOpenGovProjectDetail({ projectId: l.project_id })))
            : listings.map(() => null);

        const rows = listings.map((l, i) => {
            const det = details[i];
            const description = det?.description || `${l.department || ""}: ${l.title}`;
            const ex = extractContacts(description);
            const rich = extractRichFields(description);
            // Promote OpenGov's structured contact fields.
            if (det?.contact_email && !ex.emails.includes(det.contact_email.toLowerCase())) {
                ex.emails.unshift(det.contact_email.toLowerCase());
            }
            if (det?.contact_phone) {
                const digits = det.contact_phone.replace(/\D/g, "");
                if (!ex.phones.some((p) => p.replace(/\D/g, "") === digits)) {
                    ex.phones.unshift(det.contact_phone);
                }
            }
            const attachmentUrls = det?.attachments?.map((a) => a.url).slice(0, 30) || [];

            return {
                notice_id: `${src.source_prefix}-${shortHash(String(l.project_id))}`,
                title: l.title.slice(0, 500),
                description: description ? description.slice(0, 12000) : null,
                agency: src.agency_name,
                sub_agency: det?.department || l.department,
                place_of_performance_state: src.state,
                place_of_performance_city: src.city,
                notice_type: "RFP",
                posted_date: l.posted_at,
                response_deadline: l.close_at,
                link: `https://procurement.opengov.com/portal/${slug}/projects/${l.project_id}`,
                status: deriveStatus(l.close_at),
                is_archived: false,
                last_crawled_at: new Date().toISOString(),
                source: "sled",
                jurisdiction_level: src.agency_type === "State" ? "state" : (src.agency_type === "County" ? "county" : "city"),
                jurisdiction_code: src.state || null,
                naics_code: det && det.naics_codes.length ? det.naics_codes[0] : null,
                raw_json: {
                    provider: "opengov",
                    source_prefix: src.source_prefix,
                    opengov: {
                        slug,
                        project_id: l.project_id,
                        category_set_id: l.category_set_id,
                        category_id: l.category_id,
                        project_number: l.project_number,
                        nigp_codes: det?.nigp_codes,
                        attachments: det?.attachments?.map((a) => ({ name: a.name, size: a.size_bytes })),
                    },
                } as Record<string, unknown>,
                extracted_emails: ex.emails.length ? ex.emails : null,
                extracted_phones: ex.phones.length ? ex.phones : null,
                extracted_urls: ex.urls.length ? ex.urls : null,
                extracted_at: new Date().toISOString(),
                extracted_attachment_urls: attachmentUrls.length ? attachmentUrls : null,
                estimated_value_min: rich.estimated_value_min,
                estimated_value_max: rich.estimated_value_max,
                estimated_value_text: rich.estimated_value_text,
                is_subcontract: rich.is_subcontract,
                opportunity_class: rich.opportunity_class,
                extracted_offices: rich.government_offices.length ? rich.government_offices : null,
            };
        });

        let upsertErr = (await sb.from("opportunities").upsert(rows, { onConflict: "notice_id" })).error;
        if (upsertErr && /(extracted_|estimated_|opportunity_class|is_subcontract|jurisdiction_)/i.test(upsertErr.message)) {
            const slim = rows.map(({
                extracted_emails, extracted_phones, extracted_urls, extracted_at,
                estimated_value_min, estimated_value_max, estimated_value_text,
                is_subcontract, opportunity_class, extracted_offices, extracted_attachment_urls,
                jurisdiction_level, jurisdiction_code,
                ...rest
            }) => rest);
            upsertErr = (await sb.from("opportunities").upsert(slim, { onConflict: "notice_id" })).error;
        }

        const inserted = upsertErr ? 0 : rows.length;
        totalInserted += inserted;
        await sb.from("rss_sources").update({
            last_fetched_at: new Date().toISOString(),
            last_status: upsertErr ? `upsert_error: ${upsertErr.message.slice(0, 80)}` : "ok",
            last_count: rows.length,
        }).eq("id", src.id);
        perSourceResults.push({ source: src.source_prefix, items: rows.length, inserted, status: upsertErr ? "error" : "ok" });
    }

    return NextResponse.json({
        ok: true,
        polled: sources.length,
        total_items_seen: totalSeen,
        total_inserted: totalInserted,
        per_source: perSourceResults,
        elapsed_ms: Date.now() - startedAt,
    });
}
