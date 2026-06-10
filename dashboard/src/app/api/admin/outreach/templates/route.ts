/**
 * GET /api/admin/outreach/templates — list every template (newest first).
 * POST /api/admin/outreach/templates — create a new template.
 *
 * Admin-only. Backs the Templates tab on /admin/outreach.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertAdminWithUser } from "@/lib/auth-admin";

export const runtime = "nodejs";
export const maxDuration = 30;

interface CreateBody {
    name?: string;
    channel?: "email" | "sms";
    subject?: string | null;
    body?: string;
    merge_tags?: string[];
    category?: string | null;
}

function db() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
    );
}

export async function GET(req: NextRequest) {
    const gate = await assertAdminWithUser();
    if (!gate.ok) return gate.response;

    const channel = req.nextUrl.searchParams.get("channel"); // optional filter
    const category = req.nextUrl.searchParams.get("category");
    let q = db()
        .from("outreach_templates")
        .select("*")
        .order("updated_at", { ascending: false });
    if (channel === "email" || channel === "sms") q = q.eq("channel", channel);
    if (category) q = q.eq("category", category);
    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ templates: data || [] });
}

export async function POST(req: NextRequest) {
    const gate = await assertAdminWithUser();
    if (!gate.ok) return gate.response;

    const body = (await req.json().catch(() => null)) as CreateBody | null;
    if (!body || !body.name?.trim() || !body.body?.trim()) {
        return NextResponse.json({ error: "name and body are required" }, { status: 400 });
    }
    if (body.channel !== "email" && body.channel !== "sms") {
        return NextResponse.json({ error: "channel must be 'email' or 'sms'" }, { status: 400 });
    }
    if (body.channel === "email" && !body.subject?.trim()) {
        return NextResponse.json({ error: "subject is required for email templates" }, { status: 400 });
    }

    const { data, error } = await db()
        .from("outreach_templates")
        .insert({
            name: body.name.trim(),
            channel: body.channel,
            subject: body.channel === "email" ? body.subject?.trim() || null : null,
            body: body.body,
            merge_tags: Array.isArray(body.merge_tags) ? body.merge_tags : [],
            category: body.category?.trim() || null,
            created_by: gate.userId,
        })
        .select()
        .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ template: data }, { status: 201 });
}
