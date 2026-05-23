import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendTaskNotification } from "@/lib/email";
import { assertAdmin } from "@/lib/auth-admin";

function getAdmin() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
    );
}

/**
 * POST /api/admin/tasks — Create a task for a client
 */
export async function POST(req: NextRequest) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;
    try {
        const body = await req.json();
        const { user_profile_id, title, description, priority, category, due_date, notify } = body;

        if (!user_profile_id || !title) {
            return NextResponse.json({ error: "user_profile_id and title required" }, { status: 400 });
        }

        const admin = getAdmin();

        const { data: task, error } = await admin
            .from("client_tasks")
            .insert({
                user_profile_id,
                title,
                description: description || null,
                priority: priority || "medium",
                category: category || "general",
                due_date: due_date || null,
                status: "waiting_client",
            })
            .select("id")
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Log activity
        await admin.from("client_activity_log").insert({
            user_profile_id,
            action: "task_created",
            description: `Task assigned: ${title}`,
        });

        // Send email notification if requested
        if (notify) {
            const { data: profile } = await admin
                .from("user_profiles")
                .select("email, contact_name")
                .eq("id", user_profile_id)
                .single();

            if (profile?.email) {
                await sendTaskNotification(
                    profile.email,
                    profile.contact_name || "there",
                    title,
                    description || "",
                    due_date,
                );
            }
        }

        return NextResponse.json({ success: true, task_id: task.id });
    } catch (error) {
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}

/**
 * GET /api/admin/tasks?user_profile_id=xxx — List tasks for a client
 */
export async function GET(req: NextRequest) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;
    try {
        const profileId = req.nextUrl.searchParams.get("user_profile_id");
        const admin = getAdmin();

        let query = admin
            .from("client_tasks")
            .select("*")
            .order("created_at", { ascending: false });

        if (profileId) {
            query = query.eq("user_profile_id", profileId);
        }

        const { data, error } = await query.limit(100);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        return NextResponse.json({ tasks: data || [] });
    } catch (error) {
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}

/**
 * PATCH /api/admin/tasks — Update task status
 */
export async function PATCH(req: NextRequest) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;
    try {
        const body = await req.json();
        const { task_id, status, completed_at } = body;

        if (!task_id) {
            return NextResponse.json({ error: "task_id required" }, { status: 400 });
        }

        const admin = getAdmin();
        const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (status) update.status = status;
        if (status === "completed") update.completed_at = completed_at || new Date().toISOString();

        const { error } = await admin.from("client_tasks").update(update).eq("id", task_id);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
