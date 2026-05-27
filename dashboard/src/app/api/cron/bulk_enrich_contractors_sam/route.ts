/**
 * Cron: bulk SAM-entity enrichment for contractors.
 *
 * 2026-05-27 audit: 80,585 contractors in the table but 99% have NULL
 * email / phone / website. The SAM.gov entity-information API has all of
 * this (POCs, business types, capability via NAICS, address, website),
 * we just never bulk-pulled it — only on-demand via Quick Checker.
 *
 * DSBS (Dynamic Small Business Search) used to serve this data on a
 * separate portal — SBA decommissioned that in 2022 and folded everything
 * into SAM. The fields we want are in entity v3 with includeSections
 * `coreData,assertions,pointsOfContact,entityRegistration`.
 *
 * Uses SAM_API_KEY_2 (the dedicated contractor-scope key) so it doesn't
 * starve the ingest_sam opportunities pipeline.
 *
 * Rate budget: 60% of the 1000 req/h quota = 600/h = 50 per 5-min run.
 * Priority queue: federal_awards_count > 0 first, then by created_at desc.
 *
 * Schedule: every 5 min via vercel.json. Cycles full audience in ~4h,
 * full 80k table in ~6 days.
 *
 * Query params:
 *   ?batch=N    override (default 50, max 100)
 *   ?uei=...    one-shot for a specific UEI (testing)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { guardCron } from "@/lib/cron-auth";
import { SAM_CONTRACTOR_KEY } from "@/lib/sam-keys";

export const runtime = "nodejs";
export const maxDuration = 300;

const DEFAULT_BATCH = 50;
const MAX_BATCH = 100;
const SAM_ENTITY_URL = "https://api.sam.gov/entity-information/v3/entities";

interface SamEntity {
    entityRegistration?: {
        ueiSAM?: string;
        legalBusinessName?: string;
        cageCode?: string;
        registrationStatus?: string;
        registrationExpirationDate?: string;
        purposeOfRegistrationDesc?: string;
        businessTypes?: { businessTypeList?: Array<{ businessTypeCode?: string; businessTypeDesc?: string }> };
    };
    coreData?: {
        entityInformation?: { entityURL?: string; entityStartDate?: string };
        physicalAddress?: { addressLine1?: string; city?: string; stateOrProvinceCode?: string; zipCode?: string };
        mailingAddress?: { addressLine1?: string; city?: string; stateOrProvinceCode?: string; zipCode?: string };
        generalInformation?: { entityStructureDesc?: string };
    };
    assertions?: {
        goodsAndServices?: {
            naicsList?: Array<{ naicsCode?: string; naicsDesc?: string; isPrimary?: string }>;
            sbaBusinessTypeList?: Array<{ sbaBusinessTypeDesc?: string }>;
        };
    };
    pointsOfContact?: {
        governmentBusinessPOC?: { firstName?: string; lastName?: string; title?: string; email?: string; usPhoneNumber?: string };
        electronicBusinessPOC?: { firstName?: string; lastName?: string; title?: string; email?: string; usPhoneNumber?: string };
        pastPerformancePOC?: { firstName?: string; lastName?: string; title?: string; email?: string; usPhoneNumber?: string };
    };
}

/** Extract SBA certifications from the entity's business type list. */
function certsFromEntity(e: SamEntity): string[] {
    const types = e.entityRegistration?.businessTypes?.businessTypeList || [];
    const sbaList = e.assertions?.goodsAndServices?.sbaBusinessTypeList || [];
    const joined = [
        ...types.map(t => `${t.businessTypeCode || ""} ${t.businessTypeDesc || ""}`),
        ...sbaList.map(s => s.sbaBusinessTypeDesc || ""),
    ].join(" ").toLowerCase();
    const out: string[] = [];
    if (/\b8\(?a\)?/.test(joined)) out.push("8(a)");
    if (joined.includes("hubzone")) out.push("HUBZone");
    if (joined.includes("service-disabled") || joined.includes("sdvosb")) out.push("SDVOSB");
    else if (joined.includes("veteran-owned") || joined.includes("vosb")) out.push("VOSB");
    if (joined.includes("women-owned") || joined.includes("wosb")) out.push("WOSB");
    if (joined.includes("economically disadvantaged women") || joined.includes("edwosb")) out.push("EDWOSB");
    if (joined.includes("small disadvantaged business") || joined.includes("sdb")) out.push("SDB");
    return [...new Set(out)];
}

/** Pick the best POC for outreach. Priority: electronic business > government > past performance.
 *  electronicBusinessPOC tends to be a real human in the company (marketing/biz dev); the
 *  governmentBusinessPOC is sometimes the same but sometimes the registrar of record. */
function bestPoc(e: SamEntity): { name: string | null; title: string | null; email: string | null; phone: string | null } {
    const order = [
        e.pointsOfContact?.electronicBusinessPOC,
        e.pointsOfContact?.governmentBusinessPOC,
        e.pointsOfContact?.pastPerformancePOC,
    ];
    for (const p of order) {
        if (!p) continue;
        const email = (p.email || "").trim();
        if (!email) continue;
        const name = [p.firstName, p.lastName].filter(Boolean).join(" ").trim();
        return { name: name || null, title: p.title || null, email, phone: p.usPhoneNumber || null };
    }
    return { name: null, title: null, email: null, phone: null };
}

async function fetchEntity(uei: string, apiKey: string): Promise<SamEntity | null> {
    const params = new URLSearchParams({
        ueiSAM: uei.toUpperCase(),
        registrationStatus: "A",
        includeSections: "entityRegistration,coreData,assertions,pointsOfContact",
    });
    const res = await fetch(`${SAM_ENTITY_URL}?${params}`, {
        headers: { "X-Api-Key": apiKey },
        signal: AbortSignal.timeout(20_000),
    });
    if (res.status === 429) throw new Error("SAM 429 — quota exhausted");
    if (!res.ok) return null;
    const data = (await res.json()) as { entityData?: SamEntity[] };
    return data.entityData?.[0] ?? null;
}

export async function GET(req: NextRequest) {
    const denied = guardCron(req);
    if (denied) return denied;

    const apiKey = SAM_CONTRACTOR_KEY;
    if (!apiKey) return NextResponse.json({ error: "SAM_API_KEY/SAM_API_KEY_2 missing" }, { status: 500 });

    const url = new URL(req.url);
    const oneShotUei = url.searchParams.get("uei");
    const requestedBatch = Number(url.searchParams.get("batch") || "");
    const batchSize = oneShotUei ? 1 : Math.min(MAX_BATCH, Math.max(1, Number.isFinite(requestedBatch) && requestedBatch > 0 ? Math.floor(requestedBatch) : DEFAULT_BATCH));

    const db = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );

    // Pick targets: prefer federal_awards_count > 0 (audience), then anything
    // still missing email. Skip rows already enriched_sam=true.
    let q = db.from("contractors")
        .select("id, uei, company_name, federal_awards_count")
        .not("uei", "is", null)
        .is("email", null)
        .order("federal_awards_count", { ascending: false, nullsFirst: false })
        .limit(batchSize);
    if (oneShotUei) {
        q = db.from("contractors")
            .select("id, uei, company_name, federal_awards_count")
            .eq("uei", oneShotUei.toUpperCase())
            .limit(1);
    }
    const { data: targets, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!targets || targets.length === 0) {
        return NextResponse.json({ ok: true, processed: 0, message: "no eligible rows" });
    }

    const stats = {
        processed: 0,
        matched: 0,
        emails_added: 0,
        phones_added: 0,
        websites_added: 0,
        certs_added: 0,
        not_found: 0,
        rate_limited: false,
        errors: 0,
    };
    const startedAt = Date.now();

    for (const c of targets as Array<{ id: string; uei: string; company_name: string | null; federal_awards_count: number | null }>) {
        stats.processed++;
        // Stop early on rate limit to avoid further damage.
        if (stats.rate_limited) break;
        // Budget guard: leave 30s of headroom for the final UPDATE batch.
        if (Date.now() - startedAt > 270_000) break;

        let entity: SamEntity | null = null;
        try {
            entity = await fetchEntity(c.uei, apiKey);
        } catch (e) {
            if ((e as Error).message.includes("429")) {
                stats.rate_limited = true;
                break;
            }
            stats.errors++;
            continue;
        }
        if (!entity) { stats.not_found++; continue; }
        stats.matched++;

        const poc = bestPoc(entity);
        const website = (entity.coreData?.entityInformation?.entityURL || "").trim() || null;
        const certs = certsFromEntity(entity);
        const expDate = entity.entityRegistration?.registrationExpirationDate || null;

        const update: Record<string, unknown> = {
            enrichment_source: "sam_entity",
        };
        if (poc.email) { update.email = poc.email; stats.emails_added++; }
        if (poc.phone) { update.direct_phone = poc.phone; stats.phones_added++; }
        if (poc.name && !update.primary_poc_name) update.primary_poc_name = poc.name;
        if (poc.title) update.primary_poc_title = poc.title;
        if (website) { update.business_url = website; stats.websites_added++; }
        if (certs.length > 0) { update.certifications = certs; stats.certs_added++; }
        if (expDate) update.expiration_date = expDate;

        const { error: upErr } = await db.from("contractors").update(update).eq("id", c.id);
        if (upErr) stats.errors++;
    }

    return NextResponse.json({
        ok: true,
        batch_size: batchSize,
        elapsed_ms: Date.now() - startedAt,
        ...stats,
    });
}
