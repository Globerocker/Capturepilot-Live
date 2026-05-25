/**
 * Socrata SODA ingest cron.
 *
 * Walks every enabled row in `socrata_sources`, fetches up to 200 most-recent
 * rows from each dataset, maps Socrata column values to canonical opportunity
 * fields via the per-row `field_map`, runs the contact extractor on the
 * resulting description, and upserts into `opportunities` with a
 * source-prefixed notice_id so we never collide with SAM / Bonfire / etc.
 *
 * Scheduled hourly in vercel.json. Each portal allows ~1000 anonymous req/hr
 * — well within budget for 4-10 seeded datasets.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { guardCron } from "@/lib/cron-auth";
import { extractContacts } from "@/lib/extract-contacts";
import { extractRichFields } from "@/lib/extract-rich-fields";
import { fetchSocrataRows, readField, type SocrataSource, type FieldMap } from "@/lib/socrata";
import crypto from "node:crypto";

export const runtime = "nodejs";
export const maxDuration = 60;

function shortHash(input: string): string {
    return crypto.createHash("sha1").update(input).digest("hex").slice(0, 16);
}

function deriveStatus(deadlineIso: string | null): string {
    if (!deadlineIso) return "ACTIVE";
    const d = new Date(deadlineIso).getTime();
    if (Number.isNaN(d)) return "ACTIVE";
    const days = (d - Date.now()) / (86_400_000);
    if (days < 0) return "EXPIRED";
    if (days < 7) return "EXPIRING_SOON";
    return "ACTIVE";
}

function toIso(value: string | null): string | null {
    if (!value) return null;
    const t = new Date(value).getTime();
    if (Number.isNaN(t)) return null;
    return new Date(t).toISOString();
}

export async function GET(req: NextRequest) {
    const denied = guardCron(req);
    if (denied) return denied;

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );

    const { data: sources, error: sErr } = await supabase
        .from("socrata_sources")
        .select("portal_host, dataset_id, source_prefix, agency_name, state, city, jurisdiction_level, jurisdiction_code, website, field_map, app_token_env, id")
        .eq("enabled", true);

    if (sErr) {
        return NextResponse.json({ ok: false, error: sErr.message }, { status: 500 });
    }

    type DBSrc = SocrataSource & { id: string };
    const enabled = (sources || []) as DBSrc[];
    if (enabled.length === 0) {
        return NextResponse.json({ success: true, polled: 0, inserted: 0, note: "no enabled sources" });
    }

    const perSourceResults: Array<{ source: string; items: number; inserted: number; status: string }> = [];
    let grandInserted = 0;
    let grandSeen = 0;

    for (const src of enabled) {
        let lastStatus = "ok";
        const result = await fetchSocrataRows(src, { limit: 200 });
        if (result.status !== "ok") {
            lastStatus = result.detail || "fetch_error";
            await supabase.from("socrata_sources").update({
                last_fetched_at: new Date().toISOString(),
                last_status: lastStatus,
                consecutive_failures: { increment: 1 } as unknown as number,
                updated_at: new Date().toISOString(),
            }).eq("id", src.id);
            perSourceResults.push({ source: src.source_prefix, items: 0, inserted: 0, status: lastStatus });
            continue;
        }

        const fm = src.field_map as FieldMap;
        grandSeen += result.rows.length;

        const opps = result.rows.map((row) => {
            const key = readField(row, fm.key_field) || readField(row, fm.title) || JSON.stringify(row).slice(0, 200);
            const title = readField(row, fm.title);
            const desc = readField(row, fm.description) || "";
            const agency = readField(row, fm.agency) || src.agency_name;
            const noticeTypeVal = readField(row, fm.notice_type_value);
            const posted = toIso(readField(row, fm.posted_date));
            const deadline = toIso(readField(row, fm.response_deadline));

            // Build an absolute link. If field_map has a `link_field` (e.g. "url.url"
            // for LA) use that. Otherwise build one from `link_pattern` + key. If
            // nothing's configured, fall back to the portal website (Socrata also
            // generates per-dataset row links automatically but they're not
            // stable cross-portal so we don't synthesize those here).
            let link: string | null = null;
            const linkField = fm.link_field;
            if (linkField) {
                const candidate = readField(row, linkField);
                if (candidate && /^https?:\/\//.test(candidate)) link = candidate;
            }
            const linkPattern = fm.link_pattern as string | undefined;
            if (!link && linkPattern && key) {
                link = `${linkPattern}${encodeURIComponent(key)}`;
            }
            if (!link) link = src.website;

            const extracted = extractContacts(desc);
            const rich = extractRichFields(desc);

            // Surface field-mapped contacts (NYC publishes structured POC info)
            // as extracted_* fields too — keeps a single source of truth for
            // the detail page's Contact panel.
            const mappedEmail = readField(row, fm.contact_email);
            const mappedPhone = readField(row, fm.contact_phone);
            if (mappedEmail && !extracted.emails.includes(mappedEmail.toLowerCase())) {
                extracted.emails.unshift(mappedEmail.toLowerCase());
            }
            if (mappedPhone && extracted.phones.findIndex(p => p.replace(/\D/g, "") === mappedPhone.replace(/\D/g, "")) < 0) {
                extracted.phones.unshift(mappedPhone);
            }

            return {
                notice_id: `${src.source_prefix}-${shortHash(String(key))}`,
                title: title ? title.slice(0, 500) : null,
                description: desc.slice(0, 8000) || null,
                agency: agency || null,
                sub_agency: null,
                place_of_performance_state: src.state || null,
                place_of_performance_city: src.city || null,
                notice_type: noticeTypeVal || "Socrata Opportunity",
                posted_date: posted,
                response_deadline: deadline,
                link,
                status: deriveStatus(deadline),
                is_archived: false,
                last_crawled_at: new Date().toISOString(),
                source: "sled",
                jurisdiction_level: src.jurisdiction_level || "city",
                jurisdiction_code: src.jurisdiction_code || null,
                raw_json: { row, src: { provider: "socrata", source_prefix: src.source_prefix, portal_host: src.portal_host, dataset_id: src.dataset_id } } as Record<string, unknown>,
                extracted_emails: extracted.emails.length ? extracted.emails : null,
                extracted_phones: extracted.phones.length ? extracted.phones : null,
                extracted_urls: extracted.urls.length ? extracted.urls : null,
                extracted_at: new Date().toISOString(),
                estimated_value_min: rich.estimated_value_min,
                estimated_value_max: rich.estimated_value_max,
                estimated_value_text: rich.estimated_value_text,
                is_subcontract: rich.is_subcontract,
                opportunity_class: rich.opportunity_class,
                extracted_offices: rich.government_offices.length ? rich.government_offices : null,
            };
        });

        let inserted = 0;
        if (opps.length > 0) {
            // Progressive fallback for the same reasons as ingest_rss.
            let upsertErr = (await supabase.from("opportunities").upsert(opps, { onConflict: "notice_id" })).error;
            if (upsertErr && /extracted_|jurisdiction_/i.test(upsertErr.message)) {
                const slim = opps.map(({ extracted_emails, extracted_phones, extracted_urls, extracted_at, jurisdiction_level, jurisdiction_code, ...rest }) => rest);
                upsertErr = (await supabase.from("opportunities").upsert(slim, { onConflict: "notice_id" })).error;
            }
            if (upsertErr && /source/i.test(upsertErr.message)) {
                const slimmer = opps.map(({ source, ...rest }) => rest);
                upsertErr = (await supabase.from("opportunities").upsert(slimmer, { onConflict: "notice_id" })).error;
            }
            if (upsertErr) {
                lastStatus = `upsert_error: ${upsertErr.message.slice(0, 80)}`;
                console.warn(`[socrata] ${src.source_prefix} ${lastStatus}`);
            } else {
                inserted = opps.length;
                grandInserted += inserted;
            }
        }

        await supabase.from("socrata_sources").update({
            last_fetched_at: new Date().toISOString(),
            last_status: lastStatus,
            last_count: opps.length,
            consecutive_failures: lastStatus === "ok" ? 0 : 1,
            updated_at: new Date().toISOString(),
        }).eq("id", src.id);

        perSourceResults.push({ source: src.source_prefix, items: opps.length, inserted, status: lastStatus });
    }

    return NextResponse.json({
        success: true,
        polled: enabled.length,
        total_items_seen: grandSeen,
        total_inserted: grandInserted,
        per_source: perSourceResults,
    });
}
