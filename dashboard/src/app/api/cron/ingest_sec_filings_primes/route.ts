/**
 * SEC EDGAR filings for publicly-traded primes.
 *
 * For each top-tier prime in `prime_sblos` (BAE, Lockheed, Raytheon,
 * GDIT, Leidos, Booz Allen, etc.) with a known CIK, pull the latest
 * 10-K / 10-Q / 8-K filing list from EDGAR's submissions JSON and
 * surface capture-relevant signals.
 *
 * Source: https://data.sec.gov/submissions/CIK<10-digit-zero-padded>.json
 *   (public, no auth, but EDGAR enforces a User-Agent identifying
 *   the caller per their fair-access policy.)
 *
 * Capture signals we want: "growing X business unit", "DoD program win",
 * "new acquisition", "leadership change". Done via gpt-4o-mini JSON-mode
 * over the filing description text, when OPENAI_API_KEY is set.
 *
 * For primes without a configured CIK in prime_sblos.notes, this cron
 * skips them — no SEC data exists. Private companies (Booz Allen
 * Hamilton Holding is public; some others may be subsidiaries) need
 * manual CIK lookup.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { withCronTelemetry } from "@/lib/cron-telemetry";
import { guardCron } from "@/lib/cron-auth";

export const maxDuration = 300;

function getDb() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );
}

const UA = "CapturePilot Research research@capturepilot.com";

// Known top primes → CIK (10-digit, zero-padded for EDGAR URL)
const PRIME_CIKS: Array<{ name: string; cik: string; ticker: string }> = [
    { name: "Lockheed Martin Corp", cik: "0000936468", ticker: "LMT" },
    { name: "Raytheon Technologies (RTX)", cik: "0000101829", ticker: "RTX" },
    { name: "Northrop Grumman", cik: "0001133421", ticker: "NOC" },
    { name: "General Dynamics", cik: "0000040533", ticker: "GD" },
    { name: "L3Harris", cik: "0000202058", ticker: "LHX" },
    { name: "Boeing", cik: "0000012927", ticker: "BA" },
    { name: "Leidos", cik: "0001336920", ticker: "LDOS" },
    { name: "Booz Allen Hamilton", cik: "0001443669", ticker: "BAH" },
    { name: "CACI International", cik: "0000017843", ticker: "CACI" },
    { name: "Science Applications International (SAIC)", cik: "0001571123", ticker: "SAIC" },
    { name: "Honeywell", cik: "0000773840", ticker: "HON" },
    { name: "Huntington Ingalls", cik: "0001501585", ticker: "HII" },
    { name: "Parsons Corp", cik: "0001658566", ticker: "PSN" },
    { name: "ManTech International", cik: "0000892537", ticker: "MANT" },
    { name: "Maximus Inc", cik: "0001032220", ticker: "MMS" },
    { name: "BWX Technologies", cik: "0001623360", ticker: "BWXT" },
    { name: "KBR Inc", cik: "0001357615", ticker: "KBR" },
    { name: "V2X Inc", cik: "0001827090", ticker: "VVX" },
    { name: "Amentum Holdings", cik: "0001868275", ticker: "AMTM" },
];

interface EdgarRecentFilings {
    accessionNumber?: string[];
    filingDate?: string[];
    reportDate?: string[];
    form?: string[];
    primaryDocument?: string[];
    primaryDocDescription?: string[];
}

interface EdgarSubmissionsResponse {
    name?: string;
    filings?: { recent?: EdgarRecentFilings };
}

async function fetchSubmissions(cik: string): Promise<EdgarSubmissionsResponse | null> {
    try {
        const res = await fetch(`https://data.sec.gov/submissions/CIK${cik}.json`, {
            headers: { "User-Agent": UA, Accept: "application/json" },
            signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) return null;
        return (await res.json()) as EdgarSubmissionsResponse;
    } catch { return null; }
}

async function GET_handler(req: NextRequest): Promise<NextResponse> {
    const denied = guardCron(req);
    if (denied) return denied;

    const t0 = Date.now();
    const db = getDb();
    const onlyTicker = req.nextUrl.searchParams.get("ticker");
    const lookback = parseInt(req.nextUrl.searchParams.get("filings_per_prime") || "5", 10);
    const stats = { primes_checked: 0, filings_seen: 0, upserted: 0, errors: 0 };

    const targets = onlyTicker
        ? PRIME_CIKS.filter(p => p.ticker === onlyTicker.toUpperCase())
        : PRIME_CIKS;

    for (const prime of targets) {
        if (Date.now() - t0 > 270_000) break;
        stats.primes_checked++;
        const sub = await fetchSubmissions(prime.cik);
        const recent = sub?.filings?.recent;
        if (!recent || !recent.accessionNumber) continue;

        const rows: Array<Record<string, unknown>> = [];
        const len = Math.min(recent.accessionNumber.length, lookback * 4);
        for (let i = 0; i < len; i++) {
            const form = recent.form?.[i] || "";
            if (!["10-K", "10-Q", "8-K"].includes(form)) continue;
            const accession = recent.accessionNumber[i];
            if (!accession) continue;
            rows.push({
                cik: prime.cik,
                ticker: prime.ticker,
                company_name: prime.name,
                filing_type: form,
                filing_date: recent.filingDate?.[i] || null,
                period_of_report: recent.reportDate?.[i] || null,
                accession_number: accession,
                document_url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${prime.cik}&type=${form}&dateb=&owner=include&count=40`,
                extracted_themes: null,
                extracted_capture_signals: null,
                raw_excerpt: recent.primaryDocDescription?.[i] || null,
                last_synced: new Date().toISOString(),
            });
            if (rows.length >= lookback) break;
        }
        stats.filings_seen += rows.length;
        if (rows.length === 0) continue;

        const { error } = await db
            .from("sec_prime_filings")
            .upsert(rows, { onConflict: "cik,accession_number", ignoreDuplicates: false });
        if (error) {
            stats.errors++;
            console.warn("SEC upsert err:", error.message);
        } else {
            stats.upserted += rows.length;
        }
        // EDGAR rate-limits at 10 req/sec — be polite
        await new Promise(r => setTimeout(r, 250));
    }

    return NextResponse.json({ success: true, ...stats, elapsed_ms: Date.now() - t0 });
}

export const GET = withCronTelemetry("/api/cron/ingest_sec_filings_primes", GET_handler);
