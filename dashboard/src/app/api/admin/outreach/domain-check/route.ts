/**
 * GET  /api/admin/outreach/domain-check?domain=capturepilot.com
 *      Returns the most recent check + history.
 *
 * POST /api/admin/outreach/domain-check
 *      Body: { domain }
 *      Runs SPF/DKIM/DMARC DNS lookups via Cloudflare DoH, records the result
 *      in domain_check_history, and returns the same shape as GET.
 *
 * Why Cloudflare DoH instead of node:dns: edge-friendly, no Node dependency,
 * and the lookups work consistently across Vercel regions. The TXT-record
 * presence checks are conservative — we only assert "pass" when the record
 * exists and matches the expected pattern.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertAdminWithUser } from "@/lib/auth-admin";

export const runtime = "nodejs";
export const maxDuration = 30;

interface DohAnswer {
    name: string;
    type: number;
    TTL: number;
    data: string;
}
interface DohResponse {
    Status: number;
    Answer?: DohAnswer[];
}

function db() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
    );
}

async function dohTxt(name: string): Promise<string[]> {
    const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=TXT`;
    const res = await fetch(url, { headers: { Accept: "application/dns-json" } });
    if (!res.ok) return [];
    const json = (await res.json()) as DohResponse;
    const answers = json.Answer || [];
    // Each TXT record arrives as one or more quoted strings; unwrap them.
    return answers.map(a => a.data.replace(/^"|"$/g, "").replace(/" "/g, ""));
}

interface CheckResult {
    domain: string;
    spf_pass: boolean;
    dkim_pass: boolean;
    dmarc_pass: boolean;
    raw_results: {
        spf_records: string[];
        dkim_records: string[];
        dmarc_records: string[];
    };
    sentry_count_7d: number;
}

const DOMAIN_RX = /^[a-z0-9.-]+\.[a-z]{2,}$/i;

async function runCheck(rawDomain: string): Promise<CheckResult | { error: string }> {
    const domain = rawDomain.trim().toLowerCase();
    if (!DOMAIN_RX.test(domain)) return { error: "Invalid domain" };

    // SPF lives on the apex
    const spfRecords = (await dohTxt(domain)).filter(r => r.startsWith("v=spf1"));
    const spfPass = spfRecords.length > 0;

    // DMARC lives at _dmarc.<domain>
    const dmarcRecords = (await dohTxt(`_dmarc.${domain}`)).filter(r => r.startsWith("v=DMARC1"));
    const dmarcPass = dmarcRecords.length > 0;

    // DKIM selectors vary by provider — try the Resend selector first, then
    // a couple of common alternatives. "Pass" if any selector resolves a valid
    // DKIM record.
    const dkimSelectors = ["resend", "selector1", "default", "google"];
    const dkimRecords: string[] = [];
    for (const sel of dkimSelectors) {
        const recs = await dohTxt(`${sel}._domainkey.${domain}`);
        for (const r of recs) {
            if (r.includes("v=DKIM1") || r.includes("k=rsa")) dkimRecords.push(`${sel}: ${r}`);
        }
        if (dkimRecords.length > 0) break;
    }
    const dkimPass = dkimRecords.length > 0;

    // Look up Sentry incidents from the last 7 days touching our outreach
    // recipe names. health_alerts is updated by `@/lib/sentry-alerts.ts`.
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { count } = await db()
        .from("health_alerts")
        .select("id", { count: "exact", head: true })
        .gte("created_at", weekAgo)
        .in("recipe", ["webhook_signature_invalid", "cron_failed", "openai_failure"]);

    return {
        domain,
        spf_pass: spfPass,
        dkim_pass: dkimPass,
        dmarc_pass: dmarcPass,
        raw_results: {
            spf_records: spfRecords,
            dkim_records: dkimRecords,
            dmarc_records: dmarcRecords,
        },
        sentry_count_7d: count || 0,
    };
}

export async function GET(req: NextRequest) {
    const gate = await assertAdminWithUser();
    if (!gate.ok) return gate.response;
    const domain = req.nextUrl.searchParams.get("domain")?.trim().toLowerCase();
    if (!domain) return NextResponse.json({ error: "domain param required" }, { status: 400 });

    const { data } = await db()
        .from("domain_check_history")
        .select("*")
        .eq("domain", domain)
        .order("checked_at", { ascending: false })
        .limit(10);
    return NextResponse.json({ history: data || [], last: (data || [])[0] || null });
}

export async function POST(req: NextRequest) {
    const gate = await assertAdminWithUser();
    if (!gate.ok) return gate.response;
    const body = (await req.json().catch(() => null)) as { domain?: string } | null;
    if (!body?.domain) return NextResponse.json({ error: "domain required" }, { status: 400 });

    const result = await runCheck(body.domain);
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });

    const { data, error } = await db()
        .from("domain_check_history")
        .insert({
            domain: result.domain,
            spf_pass: result.spf_pass,
            dkim_pass: result.dkim_pass,
            dmarc_pass: result.dmarc_pass,
            raw_results: result.raw_results,
            sentry_count_7d: result.sentry_count_7d,
            checked_by: gate.userId,
        })
        .select()
        .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ check: data });
}
