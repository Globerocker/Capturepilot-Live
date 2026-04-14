import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
    DEFAULT_EMAIL_SETTINGS,
    invalidateEmailSettingsCache,
    type Audience,
    type EmailCategory,
} from "@/lib/email-settings";

function getAdmin() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!
    );
}

/**
 * GET /api/admin/email-settings
 * Returns merged settings: DB rows override defaults, missing rows use defaults.
 */
export async function GET() {
    try {
        const sb = getAdmin();
        const { data, error } = await sb
            .from("email_settings")
            .select("key, enabled, audience, category, label, description, updated_at");

        if (error) throw error;

        const dbMap = new Map((data || []).map(r => [r.key, r]));
        const merged = Object.entries(DEFAULT_EMAIL_SETTINGS).map(([key, defaults]) => {
            const row = dbMap.get(key);
            return {
                key,
                enabled: row?.enabled ?? defaults.enabled,
                audience: (row?.audience ?? defaults.audience) as Audience[],
                category: (row?.category ?? defaults.category) as EmailCategory,
                label: row?.label ?? defaults.label,
                description: row?.description ?? defaults.description,
                updated_at: row?.updated_at ?? null,
            };
        });

        return NextResponse.json({ settings: merged });
    } catch (e) {
        console.error("email-settings GET error:", e);
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}

/**
 * PATCH /api/admin/email-settings
 * Body: { key, enabled?, audience?, category? }
 * Upserts the row, invalidates cache so next send() picks up the change.
 */
export async function PATCH(req: NextRequest) {
    try {
        const body = await req.json();
        const { key, enabled, audience, category } = body;

        if (!key || !(key in DEFAULT_EMAIL_SETTINGS)) {
            return NextResponse.json({ error: "Invalid or unknown key" }, { status: 400 });
        }

        const defaults = DEFAULT_EMAIL_SETTINGS[key];
        const sb = getAdmin();

        const { error } = await sb.from("email_settings").upsert({
            key,
            enabled: typeof enabled === "boolean" ? enabled : defaults.enabled,
            audience: Array.isArray(audience) ? audience : defaults.audience,
            category: category ?? defaults.category,
            label: defaults.label,
            description: defaults.description,
            updated_at: new Date().toISOString(),
        }, { onConflict: "key" });

        if (error) throw error;

        invalidateEmailSettingsCache();

        return NextResponse.json({ success: true, key });
    } catch (e) {
        console.error("email-settings PATCH error:", e);
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
