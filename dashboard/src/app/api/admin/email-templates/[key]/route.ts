import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { invalidateCustomTemplateCache } from "@/lib/email-custom-template";
import { DEFAULT_EMAIL_SETTINGS } from "@/lib/email-settings";
import { NURTURE_TEMPLATES } from "@/lib/email-nurture-templates";
import { assertAdmin } from "@/lib/auth-admin";

function getAdmin() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!
    );
}

/**
 * GET /api/admin/email-templates/:key
 * Returns the saved design_json, html, subject, published status.
 * Returns 404 if no custom version exists yet.
 */
export async function GET(_req: NextRequest, context: { params: Promise<{ key: string }> }) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;
    try {
        const { key } = await context.params;
        if (!(key in DEFAULT_EMAIL_SETTINGS)) {
            return NextResponse.json({ error: "Unknown template key" }, { status: 400 });
        }

        const sb = getAdmin();
        const { data, error } = await sb
            .from("email_templates")
            .select("design_json, html, subject, published, updated_at")
            .eq("template_key", key)
            .maybeSingle();

        if (error) throw error;
        if (!data) {
            // Nurture-sequence templates ship with built-in HTML + subject —
            // serve those as defaults so the editor loads ready-made content
            // on first open. The user can then edit + save, which creates the
            // DB row and supersedes this fallback.
            const fallback = NURTURE_TEMPLATES[key];
            if (fallback) {
                return NextResponse.json({
                    exists: false,
                    key,
                    html: fallback.html,
                    subject: fallback.subject,
                    design_json: null,
                    published: false,
                    is_default: true,
                });
            }
            return NextResponse.json({ exists: false, key });
        }
        return NextResponse.json({ exists: true, key, ...data });
    } catch (e) {
        console.error("email-template GET error:", e);
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}

/**
 * PATCH /api/admin/email-templates/:key
 * Body: { design_json?, html?, subject?, published? }
 * Upserts the row and invalidates the cache.
 */
export async function PATCH(req: NextRequest, context: { params: Promise<{ key: string }> }) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;
    try {
        const { key } = await context.params;
        if (!(key in DEFAULT_EMAIL_SETTINGS)) {
            return NextResponse.json({ error: "Unknown template key" }, { status: 400 });
        }

        const body = await req.json();
        const { design_json, html, subject, published } = body;

        const sb = getAdmin();
        const { error } = await sb.from("email_templates").upsert({
            template_key: key,
            design_json: design_json ?? null,
            html: html ?? null,
            subject: subject ?? null,
            published: published ?? false,
            updated_at: new Date().toISOString(),
        }, { onConflict: "template_key" });

        if (error) throw error;

        invalidateCustomTemplateCache();
        return NextResponse.json({ success: true, key });
    } catch (e) {
        console.error("email-template PATCH error:", e);
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}

/**
 * DELETE /api/admin/email-templates/:key
 * Removes the custom template — send logic falls back to code template.
 */
export async function DELETE(_req: NextRequest, context: { params: Promise<{ key: string }> }) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;
    try {
        const { key } = await context.params;
        const sb = getAdmin();
        const { error } = await sb.from("email_templates").delete().eq("template_key", key);
        if (error) throw error;
        invalidateCustomTemplateCache();
        return NextResponse.json({ success: true, key });
    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
