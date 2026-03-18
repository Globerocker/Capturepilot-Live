import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 300;

function getSupabase() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!
    );
}

// Keyword patterns for requirements extraction
const BONDING_RE = /bond(ing|ed|s)?|surety/i;
const INSURANCE_RE = /insurance|liability|workers.?comp|general liability/i;
const CLEARANCE_RE = /clearance|secret|top.?secret|ts\/sci|confidential|public.?trust/i;
const EXPERIENCE_RE = /(\d+)\s*(?:years?|yrs?)\s*(?:of\s+)?(?:experience|exp)/i;
const WORKFORCE_RE = /minimum\s*(?:of\s+)?(\d+)\s*(?:employees?|workers?|personnel|staff|fte)/i;
const EQUIPMENT_RE = /equipment|vehicle|fleet|machinery|tools|supplies/i;
const CERT_RE = /iso\s*\d+|cmmi|certified|certification|licensed/i;

function extractEstimatedValue(raw: Record<string, unknown>): number | null {
    // Path 1: award.amount
    const award = raw.award;
    if (award && typeof award === "object") {
        const a = award as Record<string, unknown>;
        if (a.amount != null) {
            const val = Number(a.amount);
            if (!isNaN(val) && val > 0) return val;
        }
    }

    // Path 2: direct fields
    for (const field of ["awardAmount", "estimatedTotalAwardAmount", "baseAndAllOptionsValue"]) {
        if (raw[field] != null) {
            const val = Number(raw[field]);
            if (!isNaN(val) && val > 0) return val;
        }
    }

    // Path 3: archive.amount
    const archive = raw.archive;
    if (archive && typeof archive === "object") {
        const a = archive as Record<string, unknown>;
        if (a.amount != null) {
            const val = Number(a.amount);
            if (!isNaN(val) && val > 0) return val;
        }
    }

    return null;
}

function extractDepartment(raw: Record<string, unknown>): string | null {
    const parentPath = raw.fullParentPathName;
    if (parentPath && typeof parentPath === "string") {
        const parts = parentPath.split(".").map(p => p.trim()).filter(Boolean);
        if (parts.length > 0) return parts[0];
    }
    for (const field of ["departmentName", "department"]) {
        const val = raw[field];
        if (val && typeof val === "string" && val.trim()) return val.trim();
    }
    return null;
}

interface Contact {
    notice_id: string;
    fullname: string | null;
    email: string | null;
    phone: string | null;
    title: string | null;
    fax: string | null;
    is_primary: boolean;
}

function extractContacts(raw: Record<string, unknown>, noticeId: string): Contact[] {
    const contacts: Contact[] = [];
    const pocData = raw.pointOfContact;
    if (!pocData) return contacts;

    const pocList = Array.isArray(pocData) ? pocData : [pocData];

    for (let i = 0; i < pocList.length; i++) {
        const poc = pocList[i];
        if (!poc || typeof poc !== "object") continue;

        const p = poc as Record<string, unknown>;
        const name = (p.fullName as string) || "";
        const email = (p.email as string) || "";
        const phone = (p.phone as string) || "";
        const title = (p.title as string) || "";
        const fax = (p.fax as string) || "";
        const pocType = (p.type as string) || "";

        if (!name && !email && !phone) continue;

        contacts.push({
            notice_id: noticeId,
            fullname: name.trim() || null,
            email: email.trim() || null,
            phone: phone.trim() || null,
            title: title.trim() || null,
            fax: fax.trim() || null,
            is_primary: i === 0 || pocType.toLowerCase() === "primary",
        });
    }
    return contacts;
}

function extractRequirements(description: string): Record<string, unknown> {
    const text = description || "";
    const reqs: Record<string, unknown> = {};

    if (BONDING_RE.test(text)) reqs.bonding = "Required";
    else reqs.bonding = "Not Spec.";

    if (INSURANCE_RE.test(text)) reqs.insurance = "Required";
    else reqs.insurance = "Not Spec.";

    const clearanceMatch = text.match(CLEARANCE_RE);
    if (clearanceMatch) {
        const cl = clearanceMatch[0].toLowerCase();
        if (cl.includes("ts/sci") || cl.includes("top secret")) reqs.clearance_level = "Top Secret/SCI";
        else if (cl.includes("secret")) reqs.clearance_level = "Secret";
        else if (cl.includes("confidential")) reqs.clearance_level = "Confidential";
        else if (cl.includes("public trust")) reqs.clearance_level = "Public Trust";
        else reqs.clearance_level = "Required";
    } else {
        reqs.clearance_level = "Not Spec.";
    }

    const expMatch = text.match(EXPERIENCE_RE);
    reqs.min_experience_years = expMatch ? parseInt(expMatch[1]) : "Not Spec.";

    const workforceMatch = text.match(WORKFORCE_RE);
    reqs.min_workforce = workforceMatch ? parseInt(workforceMatch[1]) : "Not Spec.";

    if (EQUIPMENT_RE.test(text)) reqs.equipment = "Required";
    else reqs.equipment = "Not Spec.";

    if (CERT_RE.test(text)) reqs.certifications_required = "Yes";
    else reqs.certifications_required = "Not Spec.";

    return reqs;
}

export async function GET(req: NextRequest) {
    const authHeader = req.headers.get("authorization");
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const supabase = getSupabase();
        console.log("Starting requirements backfill...");

        // Fetch opportunities with raw_json that need backfill
        const { data: opps, error: fetchError } = await supabase
            .from("opportunities")
            .select("id, notice_id, award_amount, department, description, raw_json, structured_requirements")
            .not("raw_json", "is", null)
            .or("structured_requirements.is.null,structured_requirements.eq.{}")
            .limit(100);

        if (fetchError) {
            console.error("Fetch error:", fetchError);
            return NextResponse.json({ error: fetchError.message }, { status: 500 });
        }

        if (!opps || opps.length === 0) {
            return NextResponse.json({ success: true, message: "No opportunities need backfill", processed: 0 });
        }

        console.log(`Found ${opps.length} opportunities to backfill`);

        let valueUpdates = 0;
        let deptUpdates = 0;
        let reqsUpdates = 0;
        let contactsInserted = 0;
        let errors = 0;

        for (let i = 0; i < opps.length; i++) {
            const opp = opps[i];
            const raw = opp.raw_json as Record<string, unknown> | null;
            if (!raw || typeof raw !== "object") continue;

            const updatePayload: Record<string, unknown> = {};

            // 1. Backfill award_amount from raw_json
            if (!opp.award_amount) {
                const val = extractEstimatedValue(raw);
                if (val) {
                    updatePayload.award_amount = val;
                    valueUpdates++;
                }
            }

            // 2. Backfill department
            if (!opp.department) {
                const dept = extractDepartment(raw);
                if (dept) {
                    updatePayload.department = dept;
                    deptUpdates++;
                }
            }

            // 3. Extract structured requirements from description
            const desc = opp.description || (raw.description as string) || "";
            if (desc) {
                const reqs = extractRequirements(desc);
                updatePayload.structured_requirements = reqs;
                reqsUpdates++;
            }

            // Apply updates
            if (Object.keys(updatePayload).length > 0) {
                try {
                    await supabase
                        .from("opportunities")
                        .update(updatePayload)
                        .eq("id", opp.id);
                } catch (e: unknown) {
                    errors++;
                    if (errors <= 5) {
                        const msg = e instanceof Error ? e.message : String(e);
                        console.error(`Error updating opp ${opp.id}: ${msg}`);
                    }
                }
            }

            // 4. Extract and upsert contacts
            if (opp.notice_id) {
                const contacts = extractContacts(raw, opp.notice_id);
                for (const contact of contacts) {
                    try {
                        await supabase
                            .from("contacts")
                            .upsert(contact, { onConflict: "notice_id,email,fullname" });
                        contactsInserted++;
                    } catch {
                        // Skip duplicates silently
                    }
                }
            }

            // Progress
            if ((i + 1) % 25 === 0) {
                console.log(`[${i + 1}/${opps.length}] values=${valueUpdates} depts=${deptUpdates} reqs=${reqsUpdates} contacts=${contactsInserted}`);
            }
        }

        console.log(`Done. Values: ${valueUpdates}, Depts: ${deptUpdates}, Reqs: ${reqsUpdates}, Contacts: ${contactsInserted}, Errors: ${errors}`);
        return NextResponse.json({
            success: true,
            processed: opps.length,
            valueUpdates, deptUpdates, reqsUpdates, contactsInserted, errors
        });

    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Unknown error";
        console.error("Fatal backfill error:", message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
