/**
 * Bonfire JSON-API ingest.
 *
 * Walks rss_sources rows with provider='bonfire' AND use_json_api=true,
 * pulls the undocumented JSON endpoint per tenant, upserts into
 * opportunities. Richer data than the RSS path: stable PrivateProjectID
 * key, department name, status, public open + close dates, IsPublicAward
 * flag.
 *
 * Operator triggered (40/40 cron cap). The default RSS ingest_rss cron
 * continues to handle tenants where use_json_api=false.
 *
 * To migrate a tenant: SET use_json_api=true, bonfire_org_id=<N> on the
 * rss_sources row. Discover the OrgId by calling discoverOrganizationId()
 * or eyeballing the /portal/ HTML.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { guardCron } from "@/lib/cron-auth";
import { extractContacts } from "@/lib/extract-contacts";
import { extractRichFields } from "@/lib/extract-rich-fields";
import { fetchBonfireOpen, discoverOrganizationId } from "@/lib/parsers/bonfire-json";
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

export async function GET(req: NextRequest) {
    const denied = guardCron(req);
    if (denied) return denied;

    const url = new URL(req.url);
    const explicitSlug = url.searchParams.get("source_prefix");
    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );

    let query = sb
        .from("rss_sources")
        .select("id, feed_url, source_prefix, agency_name, agency_type, state, city, website, bonfire_org_id, use_json_api, enabled, provider")
        .eq("provider", "bonfire")
        .eq("enabled", true);
    if (explicitSlug) query = query.eq("source_prefix", explicitSlug);
    else query = query.eq("use_json_api", true);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    type Src = {
        id: string;
        feed_url: string;
        source_prefix: string;
        agency_name: string | null;
        agency_type: string | null;
        state: string | null;
        city: string | null;
        website: string | null;
        bonfire_org_id: number | null;
        use_json_api: boolean;
        provider: string;
    };
    const sources = (data || []) as Src[];
    if (sources.length === 0) return NextResponse.json({ ok: true, polled: 0, note: "no JSON-API-opted-in bonfire sources" });

    const startedAt = Date.now();
    let totalInserted = 0;
    let totalSeen = 0;
    const perSourceResults: Array<{ source: string; items: number; inserted: number; status: string }> = [];

    for (const src of sources) {
        if (Date.now() - startedAt > 270_000) break;
        // Extract host from feed_url (e.g. "https://fairfaxcounty.bonfirehub.com/opportunities/rss")
        let portalHost: string | null = null;
        try {
            portalHost = new URL(src.feed_url).host;
        } catch {
            perSourceResults.push({ source: src.source_prefix, items: 0, inserted: 0, status: "bad_feed_url" });
            continue;
        }

        // Auto-discover OrganizationId on first run.
        let orgId = src.bonfire_org_id;
        if (!orgId) {
            orgId = await discoverOrganizationId({ portalHost });
            if (!orgId) {
                perSourceResults.push({ source: src.source_prefix, items: 0, inserted: 0, status: "no_org_id" });
                continue;
            }
            await sb.from("rss_sources").update({ bonfire_org_id: orgId }).eq("id", src.id);
        }

        const listings = await fetchBonfireOpen({ portalHost, organizationId: orgId });
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

        const rows = listings.map((l) => {
            // Stable key: PrivateProjectID when present, else project_id, else ref+title.
            const stableKey = l.private_project_id || l.project_id?.toString() || l.reference_number || l.title;
            const noticeId = `${src.source_prefix}-${shortHash(String(stableKey))}`;
            const description = l.department_name ? `Department: ${l.department_name}` : "";
            const ex = extractContacts(description);
            const rich = extractRichFields(description);
            return {
                notice_id: noticeId,
                title: l.title.slice(0, 500),
                description: description || null,
                agency: src.agency_name,
                sub_agency: l.department_name,
                place_of_performance_state: src.state,
                place_of_performance_city: src.city,
                notice_type: "RSS Opportunity",
                posted_date: l.public_open,
                response_deadline: l.public_close,
                link: `https://${portalHost}/opportunities/${l.project_id}`,
                status: deriveStatus(l.public_close),
                is_archived: false,
                last_crawled_at: new Date().toISOString(),
                source: "sled",
                jurisdiction_level: src.agency_type === "State" ? "state" : (src.agency_type === "County" ? "county" : "city"),
                jurisdiction_code: src.state || null,
                raw_json: {
                    provider: "bonfire_json",
                    source_prefix: src.source_prefix,
                    bonfire: {
                        organization_id: orgId,
                        project_id: l.project_id,
                        private_project_id: l.private_project_id,
                        status: l.status_name,
                        reference_number: l.reference_number,
                        is_public_award: l.is_public_award,
                    },
                } as Record<string, unknown>,
                extracted_emails: ex.emails.length ? ex.emails : null,
                extracted_phones: ex.phones.length ? ex.phones : null,
                extracted_urls: ex.urls.length ? ex.urls : null,
                extracted_at: new Date().toISOString(),
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
                is_subcontract, opportunity_class, extracted_offices,
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
