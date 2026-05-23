import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { guardCron } from "@/lib/cron-auth";

export const maxDuration = 300;

/**
 * Cron: discover newly-SAM-registered companies for outreach.
 *
 * Schedule: daily 05:30 UTC (after ingest_sam, before enrich_contractors).
 *
 * Strategy: walks the last 14 days of SAM.gov registrations one day at a
 * time (the Entity API accepts only single-date, not ranges), inserts
 * matching rows into outreach_prospects with status='pending_review' for
 * admin triage. Unique index on UEI handles dedupe automatically so
 * re-running the cron is safe.
 *
 * ICP filter (kept deliberately loose in this first pass — admin tightens
 * via the review queue):
 *   - samRegistered=Yes, active, All Awards purpose
 *   - Registered in US (country code filter applied in code, not the API —
 *     SAM returns foreign entities too and the admin queue filters them out).
 *
 * Query params:
 *   days=14 (default)
 *   date=MM/DD/YYYY (run for one specific day, overrides `days`)
 */
export async function GET(req: NextRequest) {
    const denied = guardCron(req);
    if (denied) return denied;

    const samKey = process.env.SAM_API_KEY;
    if (!samKey) return NextResponse.json({ error: "SAM_API_KEY missing" }, { status: 500 });

    const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );

    const singleDate = req.nextUrl.searchParams.get("date");
    const daysBack = Math.min(30, parseInt(req.nextUrl.searchParams.get("days") || "14", 10));

    const targetDates: string[] = [];
    if (singleDate) {
        targetDates.push(singleDate);
    } else {
        for (let i = 0; i < daysBack; i++) {
            const d = new Date(Date.now() - i * 86400_000);
            const mm = String(d.getMonth() + 1).padStart(2, "0");
            const dd = String(d.getDate()).padStart(2, "0");
            const yy = d.getFullYear();
            targetDates.push(`${mm}/${dd}/${yy}`);
        }
    }

    const stats = {
        dates_checked: targetDates.length,
        upstream_rows: 0,
        inserted: 0,
        skipped_existing: 0,
        skipped_non_us: 0,
        errors: 0,
    };

    for (const date of targetDates) {
        try {
            // SAM pages at 10 entities each by default; bump to 100 via size=100.
            const url = `https://api.sam.gov/entity-information/v3/entities?registrationStatus=A&samRegistered=Yes&registrationDate=${encodeURIComponent(date)}&size=100`;
            const res = await fetch(url, {
                headers: { "X-Api-Key": samKey, Accept: "application/json" },
                signal: AbortSignal.timeout(30_000),
            });
            if (!res.ok) { stats.errors++; continue; }
            const data = await res.json() as { entityData?: unknown[]; totalRecords?: number };
            const entities = (data.entityData || []) as Array<Record<string, unknown>>;
            stats.upstream_rows += entities.length;

            for (const ent of entities) {
                const reg = (ent.entityRegistration || {}) as Record<string, unknown>;
                const core = (ent.coreData || {}) as Record<string, unknown>;
                const addr = (core.physicalAddress || {}) as Record<string, unknown>;
                const country = String(addr.countryCode || "");
                if (country && country !== "USA") { stats.skipped_non_us++; continue; }

                const uei = (reg.ueiSAM as string) || null;
                const companyName = (reg.legalBusinessName as string) || "Unknown";
                const cageCode = (reg.cageCode as string) || null;
                const regDate = (reg.registrationDate as string) || null;
                const entityInfo = (core.entityInformation || {}) as Record<string, unknown>;
                const website = (entityInfo.entityURL as string) || null;
                const state = (addr.stateOrProvinceCode as string) || null;
                const city = (addr.city as string) || null;

                // NAICS: SAM nests under assertions.goodsAndServices.primaryNaics + naicsList
                const assertions = (ent.assertions || {}) as Record<string, unknown>;
                const gs = (assertions.goodsAndServices || {}) as Record<string, unknown>;
                const primary = (gs.primaryNaics as string) || "";
                const naicsList = ((gs.naicsList as Array<Record<string, unknown>>) || [])
                    .map(n => String(n.naicsCode || ""))
                    .filter(Boolean);
                const naicsCodes = [...new Set([primary, ...naicsList].filter(Boolean))];

                // Certifications: reuse the same logic as /api/sam/entity
                const businessTypes = ((reg.businessTypes as string[]) || []).map(String);
                const sbaList = (gs.sbaBusinessTypeList as Array<Record<string, unknown>>) || [];
                const sbaDescs = sbaList.map(s => String(s.sbaBusinessTypeDesc || "").toLowerCase());
                const typeStr = [...businessTypes, ...sbaDescs].join(" ").toLowerCase();
                const certifications: string[] = [];
                if (typeStr.includes("8(a)") || typeStr.includes("8a")) certifications.push("8(a)");
                if (typeStr.includes("hubzone")) certifications.push("HUBZone");
                if (typeStr.includes("service-disabled") || typeStr.includes("sdvosb")) certifications.push("SDVOSB");
                if (typeStr.includes("women-owned") || typeStr.includes("wosb")) certifications.push("WOSB");
                if (typeStr.includes("economically disadvantaged women") || typeStr.includes("edwosb")) certifications.push("EDWOSB");
                if (typeStr.includes("veteran-owned") && !typeStr.includes("service-disabled")) certifications.push("VOSB");

                // Match score — cheap heuristic the admin can overwrite.
                //   +40 if any certifications (set-aside eligible = valuable outreach)
                //   +30 if registered in the last 7 days (freshest leads)
                //   +20 if US-based (already filtered, but keeps formula honest)
                //   +10 if has a website (easier to enrich + more legitimate)
                let score = 20;
                if (certifications.length > 0) score += 40;
                if (regDate && new Date(regDate).getTime() > Date.now() - 7 * 86400_000) score += 30;
                if (website) score += 10;
                if (score > 100) score = 100;

                const { error } = await admin.from("outreach_prospects").insert({
                    uei,
                    cage_code: cageCode,
                    company_name: companyName,
                    website,
                    state,
                    city,
                    naics_codes: naicsCodes,
                    certifications,
                    registration_date: regDate,
                    source: "sam_new_registration",
                    status: "pending_review",
                    match_score: score,
                });
                if (error) {
                    // Unique index on UEI means duplicates return 23505 — that's fine.
                    if (error.code === "23505") stats.skipped_existing++;
                    else stats.errors++;
                } else {
                    stats.inserted++;
                }
            }
        } catch {
            stats.errors++;
        }
    }

    return NextResponse.json({ success: true, ...stats });
}
