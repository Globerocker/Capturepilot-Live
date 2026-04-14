import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { 
    syncContactToHubspot, 
    createOrUpdateCompanyInHubspot, 
    associateContactToCompany, 
    createDealInHubspot, 
    PIPELINES 
} from "@/lib/hubspot";

export async function POST(req: NextRequest) {
    try {
        const { id } = await req.json();
        if (!id) return NextResponse.json({ error: "Missing ID" }, { status: 400 });

        const sb = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_KEY!
        );

        const { data: profile, error } = await sb
            .from("company_analyses")
            .select("*")
            .eq("id", id)
            .single();

        if (error || !profile) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

        const inferred = profile.inferred_profile || {};
        const contactPerson = inferred.contact_person || {};
        
        const email = profile.lead_email || contactPerson.email;
        if (!email) {
            return NextResponse.json({ error: "Lead must have an email to sync to HubSpot" }, { status: 400 });
        }

        const nameParts = (contactPerson.name || "").trim().split(/\s+/);
        
        // 1. Sync Contact
        const properties = {
            firstname: nameParts[0] || "",
            lastname: nameParts.slice(1).join(" ") || "",
            company: profile.company_name || "",
            phone: contactPerson.phone || "",
            capturepilot_user_id: profile.id,
            account_type: 'self_service' as const,
            subscription_status: 'free' as const,
            sam_registered: !!profile.uei,
            uei: profile.uei || "",
            business_state: profile.state || "",
            naics_codes: (profile.inferred_naics || []).map((n: any) => n.code).join(", "),
            lead_source_cp: 'manual' as const,
            readiness_score: profile.readiness_score || 0
        };

        const contactId = await syncContactToHubspot(email, properties);
        if (!contactId) {
            return NextResponse.json({ error: "Failed to create/update contact in HubSpot" }, { status: 500 });
        }

        // 2. Sync Company & Associate
        if (profile.company_name) {
            const domain = profile.website ? profile.website.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] : "";
            const companyId = await createOrUpdateCompanyInHubspot(profile.company_name, domain);
            if (companyId) {
                await associateContactToCompany(contactId, companyId);
            }
        }

        // 3. Sync Deal
        const dealName = `${profile.company_name || email} — Quick Check Lead`;
        await createDealInHubspot({
            contactId,
            dealName,
            pipelineId: PIPELINES.saas.id,
            stageId: PIPELINES.saas.stages.quickCheckLead
        });

        // 4. Update the Database
        const updatedInferred = { ...inferred, synced_to_hubspot: true };
        await sb.from("company_analyses").update({ inferred_profile: updatedInferred }).eq("id", id);

        return NextResponse.json({ success: true });
    } catch (e: any) {
        return NextResponse.json({ error: e.message || "Internal server error" }, { status: 500 });
    }
}
