import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/env-health
 * Returns which production secrets are set + quick reachability checks for the
 * external APIs we depend on. Admin-only.
 *
 * Does NOT return secret values. Only booleans + last-known status per service.
 */

type ServiceStatus = {
    key: string;
    env_var: string;
    configured: boolean;
    reachable: "unknown" | "ok" | "error";
    detail?: string;
    last_check: string;
};

async function probe(url: string, init?: RequestInit): Promise<"ok" | "error" | "unknown"> {
    try {
        const res = await fetch(url, { ...init, signal: AbortSignal.timeout(6000) });
        if (res.status === 401 || res.status === 403) return "error";
        return res.ok ? "ok" : "error";
    } catch {
        return "error";
    }
}

export async function GET(_req: NextRequest) {
    const cookieStore = await cookies();
    const sb = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll: () => cookieStore.getAll() } },
    );
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
    const { data: profile } = await admin.from("user_profiles").select("account_type").eq("auth_user_id", user.id).single();
    if ((profile as { account_type: string } | null)?.account_type !== "admin") {
        return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }

    const now = new Date().toISOString();
    const checks: ServiceStatus[] = [];

    // OpenAI
    {
        const configured = !!process.env.OPENAI_API_KEY;
        let reachable: ServiceStatus["reachable"] = "unknown";
        if (configured) {
            const res = await probe("https://api.openai.com/v1/models", {
                headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
            });
            reachable = res;
        }
        checks.push({ key: "OpenAI", env_var: "OPENAI_API_KEY", configured, reachable, last_check: now });
    }

    // DeepSeek
    {
        const configured = !!process.env.DEEPSEEK_API_KEY;
        let reachable: ServiceStatus["reachable"] = "unknown";
        if (configured) {
            reachable = await probe("https://api.deepseek.com/v1/models", {
                headers: { Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` },
            });
        }
        checks.push({ key: "DeepSeek", env_var: "DEEPSEEK_API_KEY", configured, reachable, last_check: now });
    }

    // SAM.gov — no free "ping" endpoint, just check key is present
    {
        const configured = !!process.env.SAM_API_KEY;
        let reachable: ServiceStatus["reachable"] = "unknown";
        if (configured) {
            const today = new Date();
            const toStr = `${String(today.getMonth() + 1).padStart(2, "0")}/${String(today.getDate()).padStart(2, "0")}/${today.getFullYear()}`;
            const fromStr = toStr;
            reachable = await probe(
                `https://api.sam.gov/opportunities/v2/search?postedFrom=${fromStr}&postedTo=${toStr}&limit=1`,
                { headers: { "X-Api-Key": process.env.SAM_API_KEY! } },
            );
        }
        checks.push({ key: "SAM.gov", env_var: "SAM_API_KEY", configured, reachable, last_check: now });
    }

    // Apollo
    {
        const configured = !!process.env.APOLLO_API_KEY;
        let reachable: ServiceStatus["reachable"] = "unknown";
        if (configured) {
            reachable = await probe("https://api.apollo.io/api/v1/auth/health", {
                headers: { "X-Api-Key": process.env.APOLLO_API_KEY! },
            });
        }
        checks.push({ key: "Apollo.io", env_var: "APOLLO_API_KEY", configured, reachable, last_check: now });
    }

    // Mistral (OCR)
    {
        const configured = !!process.env.MISTRAL_API_KEY;
        let reachable: ServiceStatus["reachable"] = "unknown";
        if (configured) {
            reachable = await probe("https://api.mistral.ai/v1/models", {
                headers: { Authorization: `Bearer ${process.env.MISTRAL_API_KEY}` },
            });
        }
        checks.push({ key: "Mistral OCR", env_var: "MISTRAL_API_KEY", configured, reachable, last_check: now });
    }

    // Firecrawl
    {
        const configured = !!process.env.FIRECRAWL_API_KEY;
        let reachable: ServiceStatus["reachable"] = "unknown";
        if (configured) {
            reachable = await probe("https://api.firecrawl.dev/v1/scrape", {
                method: "POST",
                headers: { Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}`, "Content-Type": "application/json" },
                body: JSON.stringify({ url: "https://example.com", formats: ["markdown"] }),
            });
        }
        checks.push({ key: "Firecrawl", env_var: "FIRECRAWL_API_KEY", configured, reachable, last_check: now });
    }

    // Resend
    {
        const configured = !!process.env.RESEND_API_KEY;
        checks.push({ key: "Resend (email)", env_var: "RESEND_API_KEY", configured, reachable: "unknown", last_check: now });
    }

    // Stripe
    {
        const configured = !!process.env.STRIPE_SECRET_KEY;
        checks.push({ key: "Stripe", env_var: "STRIPE_SECRET_KEY", configured, reachable: "unknown", last_check: now });
    }

    // CRON_SECRET (if set, cron routes require it)
    {
        const configured = !!process.env.CRON_SECRET;
        checks.push({
            key: "Cron Secret",
            env_var: "CRON_SECRET",
            configured,
            reachable: "unknown",
            detail: configured ? "Vercel crons must Bearer this" : "Not set — cron routes run unauthenticated",
            last_check: now,
        });
    }

    return NextResponse.json({ checks });
}
