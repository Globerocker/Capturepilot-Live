import { NextRequest, NextResponse } from "next/server";
import { upsertHubSpotContact, splitContactName } from "@/lib/hubspot";

/**
 * POST /api/hubspot/sync-contact
 *
 * Fire-and-forget endpoint for syncing CapturePilot contacts into HubSpot.
 * Called from:
 *  - signup page (after account creation — email only)
 *  - /onboard handleSave (after profile saved — full contact details)
 *  - /api/admin/clients (after consulting client created — full contact details)
 *
 * Always returns 200 quickly. HubSpot failures are logged, never surfaced,
 * because the UI caller does not block on the response.
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const {
            email,
            contact_name,
            job_title,
            phone,
            company,
            source,
            user_id,
            account_type,
            company_size,
            employee_count,
            annual_revenue_range,
            years_in_business,
            has_federal_experience,
            naics_codes,
            business_state,
            uei,
        } = body as {
            email?: string;
            contact_name?: string;
            job_title?: string;
            phone?: string;
            company?: string;
            source?: string;
            user_id?: string;
            account_type?: "self_service" | "consulting" | "admin";
            company_size?: "micro" | "small" | "mid" | "large";
            employee_count?: number;
            annual_revenue_range?: string;
            years_in_business?: number;
            has_federal_experience?: boolean;
            naics_codes?: string[] | string;
            business_state?: string;
            uei?: string;
        };

        if (!email) {
            return NextResponse.json({ error: "email required" }, { status: 400 });
        }

        const { firstname, lastname } = splitContactName(contact_name);

        const lifecycle = source === "onboarding_complete" || source === "consulting_client_created"
            ? "customer"
            : "lead";

        const contactId = await upsertHubSpotContact({
            email,
            firstname,
            lastname,
            phone,
            company,
            jobtitle: job_title,
            lifecyclestage: lifecycle,
            extra: {
                capturepilot_user_id: user_id,
                account_type: account_type,
                lead_source_cp: source === "consulting_client_created" ? "manual" : "signup",
                capturepilot_company_size: company_size,
                numberofemployees: typeof employee_count === "number" && !Number.isNaN(employee_count)
                    ? employee_count
                    : undefined,
                annualrevenue_range: annual_revenue_range,
                capturepilot_years_in_business:
                    typeof years_in_business === "number" && !Number.isNaN(years_in_business)
                        ? years_in_business
                        : undefined,
                capturepilot_has_fed_experience:
                    typeof has_federal_experience === "boolean" ? has_federal_experience : undefined,
                naics_codes: Array.isArray(naics_codes)
                    ? naics_codes.join(", ")
                    : (typeof naics_codes === "string" ? naics_codes : undefined),
                business_state,
                uei,
            },
        });

        return NextResponse.json({ success: true, contact_id: contactId });
    } catch (err) {
        console.error("[hubspot/sync-contact] failed:", (err as Error).message);
        // Never block the caller on HubSpot failures.
        return NextResponse.json({ success: false, error: (err as Error).message }, { status: 200 });
    }
}
