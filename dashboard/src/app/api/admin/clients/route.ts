import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendConsultingWelcomeEmail } from "@/lib/email";

function getAdmin() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
    );
}

/**
 * POST /api/admin/clients — Create a new consulting client
 * Creates auth user + profile + sends welcome email
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const {
            email, password, company_name, contact_name, contact_phone,
            website, uei, cage_code, naics_codes, state, city,
            sba_certifications, notes,
        } = body;

        if (!email || !company_name) {
            return NextResponse.json({ error: "Email and company_name required" }, { status: 400 });
        }

        const admin = getAdmin();

        // 1. Create auth user
        const tempPassword = password || `CP-${Math.random().toString(36).slice(2, 10)}!`;
        const { data: authData, error: authError } = await admin.auth.admin.createUser({
            email,
            password: tempPassword,
            email_confirm: true, // skip verification for consulting clients
        });

        if (authError) {
            return NextResponse.json({ error: `Auth error: ${authError.message}` }, { status: 400 });
        }

        const authUserId = authData.user.id;

        // 2. Create user profile (pre-filled, onboarding complete)
        const profile = {
            auth_user_id: authUserId,
            company_name,
            email,
            contact_name: contact_name || null,
            contact_phone: contact_phone || null,
            website: website || null,
            uei: uei || null,
            cage_code: cage_code || null,
            naics_codes: naics_codes || [],
            sba_certifications: sba_certifications || [],
            state: state || null,
            city: city || null,
            notes: notes || null,
            account_type: "consulting",
            client_status: "active",
            client_since: new Date().toISOString(),
            onboarding_complete: true,
            plan_tier: "consulting",
            subscription_status: "active",
        };

        const { data: profileData, error: profileError } = await admin
            .from("user_profiles")
            .upsert(profile, { onConflict: "auth_user_id" })
            .select("id")
            .single();

        if (profileError) {
            return NextResponse.json({ error: `Profile error: ${profileError.message}` }, { status: 500 });
        }

        // 3. Create default onboarding tasks
        const defaultTasks = [
            {
                user_profile_id: profileData.id,
                title: "Provide company email credentials",
                description: "We need a dedicated email account (e.g. govcontracts@yourcompany.com) to operate from on your behalf. Please create the email and share the login credentials securely.",
                priority: "high",
                category: "email_setup",
                status: "waiting_client",
            },
            {
                user_profile_id: profileData.id,
                title: "Upload Capability Statement",
                description: "Upload your company's capability statement (PDF). If you don't have one, we'll create one for you.",
                priority: "high",
                category: "document",
                status: "waiting_client",
            },
            {
                user_profile_id: profileData.id,
                title: "Verify SAM.gov registration",
                description: "Confirm your SAM.gov registration is active and up to date. If not registered, we'll guide you through the process.",
                priority: "high",
                category: "sam_registration",
                status: "pending",
            },
            {
                user_profile_id: profileData.id,
                title: "Share website login credentials",
                description: "We need access to your company website to optimize it for government contracting. Share your CMS/admin login securely.",
                priority: "medium",
                category: "website",
                status: "waiting_client",
            },
        ];

        await admin.from("client_tasks").insert(defaultTasks);

        // 4. Log activity
        await admin.from("client_activity_log").insert({
            user_profile_id: profileData.id,
            action: "client_created",
            description: `Consulting client account created for ${company_name}`,
            metadata: { email, created_by: "admin" },
        });

        // 4b. Auto-crawl opportunities for client's NAICS codes (fire and forget)
        if (naics_codes && naics_codes.length > 0) {
            const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://captiorpilot-v3.vercel.app";
            fetch(`${baseUrl}/api/admin/crawl-opportunities`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    naics_codes,
                    days_back: 90,
                    user_profile_id: profileData.id,
                }),
            }).catch(() => {}); // fire and forget
        }

        // 5. Send welcome email
        await sendConsultingWelcomeEmail(email, company_name, contact_name || "there", tempPassword);

        return NextResponse.json({
            success: true,
            profile_id: profileData.id,
            auth_user_id: authUserId,
            temp_password: tempPassword,
            message: `Client created. Welcome email sent to ${email}.`,
        });

    } catch (error) {
        console.error("Create client error:", error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}

/**
 * GET /api/admin/clients — List all consulting clients
 */
export async function GET() {
    try {
        const admin = getAdmin();

        const { data, error } = await admin
            .from("user_profiles")
            .select(`
                id, auth_user_id, company_name, email, contact_name, contact_phone,
                website, uei, cage_code, naics_codes, sba_certifications,
                state, city, account_type, client_status, client_since,
                onboarding_complete, plan_tier, created_at, notes
            `)
            .eq("account_type", "consulting")
            .order("created_at", { ascending: false });

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Get task counts per client
        const clientsWithStats = await Promise.all(
            (data || []).map(async (client) => {
                const { count: totalTasks } = await admin
                    .from("client_tasks")
                    .select("id", { count: "exact", head: true })
                    .eq("user_profile_id", client.id);

                const { count: pendingTasks } = await admin
                    .from("client_tasks")
                    .select("id", { count: "exact", head: true })
                    .eq("user_profile_id", client.id)
                    .in("status", ["pending", "in_progress", "waiting_client"]);

                const { count: docCount } = await admin
                    .from("client_documents")
                    .select("id", { count: "exact", head: true })
                    .eq("user_profile_id", client.id);

                return {
                    ...client,
                    total_tasks: totalTasks || 0,
                    pending_tasks: pendingTasks || 0,
                    document_count: docCount || 0,
                };
            })
        );

        return NextResponse.json({ clients: clientsWithStats });
    } catch (error) {
        console.error("List clients error:", error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
