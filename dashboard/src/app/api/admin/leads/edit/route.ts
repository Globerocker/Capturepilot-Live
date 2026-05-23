import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertAdmin } from "@/lib/auth-admin";

export async function POST(req: NextRequest) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;
    try {
        const body = await req.json();
        const { id, lead_email, company_name, contact_name, phone } = body;

        if (!id) {
            return NextResponse.json({ error: "Missing required ID parameter" }, { status: 400 });
        }

        const sb = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_KEY!
        );

        // Fetch current profile to merge inferred_profile cleanly
        const { data: profile, error } = await sb
            .from("company_analyses")
            .select("inferred_profile")
            .eq("id", id)
            .single();

        if (error || !profile) {
            return NextResponse.json({ error: "Lead not found" }, { status: 404 });
        }

        const inferred = profile.inferred_profile || {};
        const contactPerson = inferred.contact_person || {};

        const updatedInferred = {
            ...inferred,
            contact_person: {
                ...contactPerson,
                name: contact_name || contactPerson.name || "",
                phone: phone || contactPerson.phone || ""
            }
        };

        const updatePayload: Record<string, unknown> = {
            inferred_profile: updatedInferred
        };

        if (lead_email !== undefined) updatePayload.lead_email = lead_email;
        if (company_name !== undefined) updatePayload.company_name = company_name;

        await sb.from("company_analyses").update(updatePayload).eq("id", id);

        return NextResponse.json({ success: true });
    } catch (e: any) {
        return NextResponse.json({ error: e.message || "Internal server error" }, { status: 500 });
    }
}
