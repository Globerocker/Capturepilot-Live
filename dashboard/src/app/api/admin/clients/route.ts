import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendConsultingWelcomeEmail, enqueueDripSequence } from "@/lib/email";
import { notifyNewClient } from "@/lib/slack";
import { upsertHubSpotContact, splitContactName } from "@/lib/hubspot";
import { assertAdmin } from "@/lib/auth-admin";

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
    const unauth = await assertAdmin();
    if (unauth) return unauth;
    try {
        const body = await req.json();
        const {
            email, password, company_name, contact_name, contact_phone,
            website, uei, cage_code, naics_codes, state, city,
            sba_certifications, notes, job_title,
            primary_keywords, secondary_keywords, company_description,
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
            job_title: job_title || null,
            website: website || null,
            uei: uei || null,
            cage_code: cage_code || null,
            naics_codes: naics_codes || [],
            sba_certifications: sba_certifications || [],
            state: state || null,
            city: city || null,
            notes: notes || null,
            company_description: company_description || null,
            primary_keywords: Array.isArray(primary_keywords) ? primary_keywords : [],
            secondary_keywords: Array.isArray(secondary_keywords) ? secondary_keywords : [],
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

        // 3. Create default onboarding action items (10 standard tasks)
        const pid = profileData.id;
        const defaultTasks = [
            // HIGH PRIORITY — immediate needs
            {
                user_profile_id: pid, priority: "urgent", category: "sam_registration", status: "waiting_client",
                title: "Verify or complete SAM.gov registration",
                description: "SAM.gov registration is REQUIRED before you can bid on any federal contract. Check if your registration is active at sam.gov. If not registered, we will guide you through the process (takes 7-10 business days). Share your UEI number once registered.",
            },
            {
                user_profile_id: pid, priority: "high", category: "email_setup", status: "waiting_client",
                title: "Create a dedicated government contracting email",
                description: "Create a dedicated email address for government contracting communications (e.g. govcontracts@yourcompany.com or federal@yourcompany.com). We will use this email to communicate with contracting officers on your behalf. Share the login credentials securely via the portal.",
            },
            {
                user_profile_id: pid, priority: "high", category: "document", status: "waiting_client",
                title: "Upload your Capability Statement",
                description: "Upload your company capability statement (PDF, 1-2 pages). This is the #1 document contracting officers request. It should include: company overview, core competencies, past performance, NAICS codes, certifications, and contact info. If you don't have one, let us know and we'll create one for you.",
            },
            {
                user_profile_id: pid, priority: "high", category: "website", status: "waiting_client",
                title: "Share website admin login credentials",
                description: "We need access to your company website to optimize it for government contracting. This includes adding past performance, certifications, NAICS codes, and government-focused content. Share your CMS/admin login (WordPress, Squarespace, Wix, etc.) securely via the portal.",
            },
            // MEDIUM PRIORITY — important but not blocking
            {
                user_profile_id: pid, priority: "medium", category: "document", status: "waiting_client",
                title: "Provide past performance references",
                description: "List 3-5 past projects (government or commercial) relevant to your target contracts. For each: client name, project description, contract value, dates, and a reference contact. Past performance is the #2 evaluation factor in government proposals.",
            },
            {
                user_profile_id: pid, priority: "medium", category: "compliance", status: "waiting_client",
                title: "Confirm insurance and bonding status",
                description: "Many federal contracts require specific insurance (general liability, workers comp, professional liability) and bonding (bid bonds, performance bonds). Share your current coverage details and limits. If you need bonding, we can recommend surety companies.",
            },
            {
                user_profile_id: pid, priority: "medium", category: "registration", status: "pending",
                title: "Review and confirm NAICS codes",
                description: "Review the NAICS codes we've assigned to your profile. These determine which opportunities you see. Confirm they accurately represent your services, or suggest additions. You can find your official codes on your SAM.gov registration.",
            },
            {
                user_profile_id: pid, priority: "medium", category: "document", status: "waiting_client",
                title: "Upload company logo (high resolution)",
                description: "Upload your company logo in high resolution (PNG or SVG, minimum 500x500px). We'll use this for capability statements, proposals, and marketing materials.",
            },
            // LOWER PRIORITY — nice to have early
            {
                user_profile_id: pid, priority: "low", category: "general", status: "waiting_client",
                title: "Share social media profiles",
                description: "Share links to your company's LinkedIn, Facebook, Twitter/X, and any other social media profiles. Government contracting officers increasingly check social media as part of their evaluation. We may help optimize these profiles.",
            },
            {
                user_profile_id: pid, priority: "low", category: "general", status: "waiting_client",
                title: "Provide team bios for key personnel",
                description: "Share brief bios (3-5 sentences) for key team members who would work on government contracts. Include: name, title, years of experience, relevant certifications, and notable projects. Key personnel bios are required in most proposals.",
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

        // 4b. Immediate website crawl + enrichment (fire-and-forget).
        // Apr 20 review: "matching algorithm must immediately crawl websites
        // upon sending an invitation email" — previously we only queued
        // opportunity crawl, not the profile enrichment, so the customer saw
        // a cold dashboard at first login.
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.capturepilot.com";
        if (website) {
            fetch(`${baseUrl}/api/admin/enrich-profile`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ user_profile_id: profileData.id }),
            }).catch(() => {});
        }
        if (naics_codes && naics_codes.length > 0) {
            fetch(`${baseUrl}/api/admin/crawl-opportunities`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    naics_codes,
                    days_back: 90,
                    user_profile_id: profileData.id,
                }),
            }).catch(() => {});
        }

        // 5. Send welcome email + Slack notification
        await sendConsultingWelcomeEmail(email, company_name, contact_name || "there", tempPassword);
        notifyNewClient(company_name, email).catch(() => {});

        // 6. Enroll in consulting onboarding drip sequence (fire-and-forget)
        enqueueDripSequence({
            sequenceKey: "consulting_onboarding",
            email,
            contactName: contact_name || company_name,
            userProfileId: profileData.id,
        }).catch(err => console.error("Drip enrollment failed:", err));

        // 7. Sync to HubSpot (fire-and-forget — never block client creation)
        (async () => {
            try {
                const { firstname, lastname } = splitContactName(contact_name);
                await upsertHubSpotContact({
                    email,
                    firstname,
                    lastname,
                    phone: contact_phone,
                    company: company_name,
                    jobtitle: job_title,
                    lifecyclestage: "customer",
                    extra: {
                        capturepilot_user_id: authUserId,
                        account_type: "consulting",
                        lead_source_cp: "manual",
                        uei: uei || undefined,
                        business_state: state || undefined,
                        naics_codes: Array.isArray(naics_codes) ? naics_codes.join(", ") : undefined,
                    },
                });
            } catch (err) {
                console.error("[admin/clients] HubSpot sync failed:", (err as Error).message);
            }
        })();

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
 * GET /api/admin/clients — List user_profiles.
 *
 * Backward-compatible: default behaviour (no query params) still returns
 * consulting clients only, so existing callers keep working. Pass
 * ?account_type=all to include self_service + admin profiles too — used
 * by the merged People view.
 */
export async function GET(req: NextRequest) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;
    try {
        const admin = getAdmin();
        const { searchParams } = new URL(req.url);
        const accountType = searchParams.get("account_type") || "consulting";

        let query = admin
            .from("user_profiles")
            .select(`
                id, auth_user_id, company_name, email, contact_name, contact_phone,
                website, uei, cage_code, naics_codes, sba_certifications,
                state, city, account_type, client_status, client_since,
                onboarding_complete, plan_tier, created_at, notes
            `)
            .order("created_at", { ascending: false });

        if (accountType !== "all") {
            query = query.eq("account_type", accountType);
        }

        const { data, error } = await query;
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        // Get last login from auth users (single list call + map lookup — no N+1).
        const loginMap = new Map<string, string>();
        const { data: authUsers } = await admin.auth.admin.listUsers({ page: 1, perPage: 500 });
        for (const u of authUsers?.users || []) {
            if (u.last_sign_in_at) loginMap.set(u.id, u.last_sign_in_at);
        }

        // Activity-score buckets feed the 1-10 score below. All weights are
        // declarative + sum to 100 so it's easy to tweak.
        const SCORE = {
            login_7d: 30, login_30d: 20, login_90d: 10,
            saved_matches_max: 20,                              // cap at 5 saves
            pursuit_active: 20, pursuit_any: 10,
            documents_3plus: 15, documents_some: 7,
            tasks_engaged: 15,
        } as const;

        const clientsWithStats = await Promise.all(
            (data || []).map(async (client) => {
                // Per-row counts: consulting clients use the full set; self-service
                // users get the lightweight set (matches + pursuits + last_login).
                // Admins get nothing — the score is meaningless for staff.
                const isConsulting = client.account_type === "consulting";
                const isStaff = client.account_type === "admin";
                const lastLogin = loginMap.get(client.auth_user_id) || null;

                if (isStaff) {
                    return {
                        ...client,
                        total_tasks: 0, pending_tasks: 0, document_count: 0,
                        match_count: 0, saved_match_count: 0, pursuit_count: 0,
                        active_pursuit_count: 0, competitor_count: 0, activity_count: 0,
                        last_login: lastLogin, activity_score: null as number | null,
                    };
                }

                const queries = [
                    admin.from("user_matches").select("id", { count: "exact", head: true }).eq("user_profile_id", client.id),
                    admin.from("user_matches").select("id", { count: "exact", head: true }).eq("user_profile_id", client.id).eq("is_saved", true),
                    admin.from("user_pursuits").select("id", { count: "exact", head: true }).eq("user_profile_id", client.id),
                    admin.from("user_pursuits").select("id", { count: "exact", head: true }).eq("user_profile_id", client.id).in("stage", ["discovered", "researching", "preparing", "submitted"]),
                ];
                if (isConsulting) {
                    queries.push(
                        admin.from("client_tasks").select("id", { count: "exact", head: true }).eq("user_profile_id", client.id),
                        admin.from("client_tasks").select("id", { count: "exact", head: true }).eq("user_profile_id", client.id).in("status", ["pending", "in_progress", "waiting_client"]),
                        admin.from("client_documents").select("id", { count: "exact", head: true }).eq("user_profile_id", client.id),
                        admin.from("client_competitors").select("id", { count: "exact", head: true }).eq("user_profile_id", client.id),
                        admin.from("client_activity_log").select("id", { count: "exact", head: true }).eq("user_profile_id", client.id),
                    );
                }
                const results = await Promise.all(queries);
                const matchCount = results[0].count || 0;
                const savedMatchCount = results[1].count || 0;
                const pursuitCount = results[2].count || 0;
                const activePursuitCount = results[3].count || 0;
                const totalTasks = isConsulting ? results[4].count || 0 : 0;
                const pendingTasks = isConsulting ? results[5].count || 0 : 0;
                const documentCount = isConsulting ? results[6].count || 0 : 0;
                const competitorCount = isConsulting ? results[7].count || 0 : 0;
                const activityCount = isConsulting ? results[8].count || 0 : 0;

                // 1-10 score. Each component contributes proportionally; capped at 10.
                let raw = 0;
                if (lastLogin) {
                    const days = (Date.now() - new Date(lastLogin).getTime()) / 86400_000;
                    if (days <= 7) raw += SCORE.login_7d;
                    else if (days <= 30) raw += SCORE.login_30d;
                    else if (days <= 90) raw += SCORE.login_90d;
                }
                raw += Math.min(SCORE.saved_matches_max, savedMatchCount * (SCORE.saved_matches_max / 5));
                if (activePursuitCount > 0) raw += SCORE.pursuit_active;
                else if (pursuitCount > 0) raw += SCORE.pursuit_any;
                if (isConsulting) {
                    if (documentCount >= 3) raw += SCORE.documents_3plus;
                    else if (documentCount > 0) raw += SCORE.documents_some;
                    if (totalTasks > 0) raw += SCORE.tasks_engaged;
                } else {
                    // Self-service has no docs/tasks — scale the remaining buckets up.
                    raw = raw * 1.4;
                }
                const activityScore = Math.max(1, Math.min(10, Math.round(raw / 10)));

                return {
                    ...client,
                    total_tasks: totalTasks,
                    pending_tasks: pendingTasks,
                    document_count: documentCount,
                    match_count: matchCount,
                    saved_match_count: savedMatchCount,
                    pursuit_count: pursuitCount,
                    active_pursuit_count: activePursuitCount,
                    competitor_count: competitorCount,
                    activity_count: activityCount,
                    last_login: lastLogin,
                    activity_score: activityScore,
                };
            })
        );

        return NextResponse.json({ clients: clientsWithStats });
    } catch (error) {
        console.error("List clients error:", error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}

/**
 * PATCH /api/admin/clients — Update an existing client
 * Body: { user_profile_id, ...fields }
 */
export async function PATCH(req: NextRequest) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;
    try {
        const body = await req.json();
        const { user_profile_id, ...updates } = body;
        if (!user_profile_id) return NextResponse.json({ error: "user_profile_id required" }, { status: 400 });

        const admin = getAdmin();

        // Whitelist allowed update fields
        const allowed = ["company_name", "contact_name", "contact_phone", "job_title", "email", "website",
            "uei", "cage_code", "naics_codes", "sba_certifications", "state", "city",
            "notes", "client_status", "account_type", "company_description",
            "employee_count", "revenue", "target_states", "address_line_1", "zip_code",
            "primary_keywords", "secondary_keywords"];

        const safeUpdates: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(updates)) {
            if (allowed.includes(k)) safeUpdates[k] = v;
        }

        if (Object.keys(safeUpdates).length === 0) {
            return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
        }

        const { error } = await admin.from("user_profiles").update(safeUpdates).eq("id", user_profile_id);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        await admin.from("client_activity_log").insert({
            user_profile_id,
            action: "client_updated",
            description: `Updated: ${Object.keys(safeUpdates).join(", ")}`,
            metadata: { fields: Object.keys(safeUpdates) },
        });

        return NextResponse.json({ success: true, updated: Object.keys(safeUpdates) });
    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}

/**
 * DELETE /api/admin/clients — Deactivate (not delete) a client
 */
export async function DELETE(req: NextRequest) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;
    try {
        const { user_profile_id } = await req.json();
        if (!user_profile_id) return NextResponse.json({ error: "user_profile_id required" }, { status: 400 });

        const admin = getAdmin();
        await admin.from("user_profiles").update({ client_status: "churned" }).eq("id", user_profile_id);

        await admin.from("client_activity_log").insert({
            user_profile_id,
            action: "client_deactivated",
            description: "Client status set to churned",
        });

        return NextResponse.json({ success: true });
    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
