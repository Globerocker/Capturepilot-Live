import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertAdmin } from "@/lib/auth-admin";

/**
 * POST /api/admin/leads/apollo
 * Enriches a lead using Apollo AI 'people/match'.
 */
export async function POST(req: NextRequest) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;
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
        const companyName = profile.company_name;
        const website = profile.website;
        const contactName = contactPerson.name || "";

        if (!contactName || !website || !companyName) {
            return NextResponse.json({ error: "Missing required contact/website details for enrichment" }, { status: 400 });
        }

        const nameParts = contactName.trim().split(/\s+/);
        const firstName = nameParts[0];
        const lastName = nameParts.slice(1).join(" ");
        const domain = website.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
        const apolloKey = process.env.APOLLO_API_KEY;

        if (!apolloKey) {
            return NextResponse.json({ error: "Missing Apollo API Key" }, { status: 500 });
        }

        const res = await fetch("https://api.apollo.io/api/v1/people/match", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Api-Key": apolloKey },
            body: JSON.stringify({ first_name: firstName, last_name: lastName, domain, organization_name: companyName }),
            signal: AbortSignal.timeout(10000),
        });

        if (!res.ok) {
            return NextResponse.json({ error: "Apollo match failed" }, { status: res.status });
        }

        const data = await res.json();
        const person = data.person;

        if (person && person.phone_numbers) {
            const mobile = person.phone_numbers.find((p: any) => p.type === 'mobile')?.sanitized_number;
            if (mobile) {
                const updatedContact = { ...contactPerson, phone: mobile };
                const updatedInferred = { ...inferred, contact_person: updatedContact };

                await sb.from("company_analyses").update({ inferred_profile: updatedInferred }).eq("id", id);
                return NextResponse.json({ success: true, phone: mobile });
            }
        }

        return NextResponse.json({ success: false, error: "No personal mobile found" });
    } catch (e: any) {
        return NextResponse.json({ error: e.message || "Internal server error" }, { status: 500 });
    }
}
