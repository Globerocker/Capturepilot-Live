import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";

export const runtime = "nodejs";

const ALLOWED_ORIGINS = new Set([
  "https://www.capturepilot.com",
  "https://capturepilot.com",
  "http://localhost:3000",
]);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    { auth: { persistSession: false } },
  );
}

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://www.capturepilot.com";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  const headers = corsHeaders(origin);

  try {
    const body = await req.json();
    const email = String(body.email ?? "").trim().toLowerCase();
    const company = body.company ? String(body.company).trim().slice(0, 200) : null;
    const magnet = String(body.magnet ?? body.magnet_key ?? "").trim().slice(0, 80);
    const source = body.source ? String(body.source).slice(0, 200) : null;

    if (!email || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "invalid email" }, { status: 400, headers });
    }
    if (!magnet) {
      return NextResponse.json({ error: "missing magnet" }, { status: 400, headers });
    }

    const url = new URL(req.url);
    const utm_source = url.searchParams.get("utm_source") || body.utm_source || null;
    const utm_medium = url.searchParams.get("utm_medium") || body.utm_medium || null;
    const utm_campaign = url.searchParams.get("utm_campaign") || body.utm_campaign || null;
    const utm_content = url.searchParams.get("utm_content") || body.utm_content || null;
    const utm_term = url.searchParams.get("utm_term") || body.utm_term || null;

    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
    const ip_hash = ip ? createHash("sha256").update(ip).digest("hex").slice(0, 32) : null;
    const user_agent = req.headers.get("user-agent")?.slice(0, 400) ?? null;
    const referrer = req.headers.get("referer")?.slice(0, 400) ?? null;

    const { error } = await db()
      .from("marketing_leads")
      .upsert({
        email,
        company,
        magnet_key: magnet,
        source,
        utm_source, utm_medium, utm_campaign, utm_content, utm_term,
        ip_hash, user_agent, referrer,
      }, { onConflict: "email,magnet_key" });

    // 409 (already captured) is fine — caller still gets the download URL.
    if (error && !String(error.message).includes("duplicate")) {
      console.error("[leads] insert failed", error);
      return NextResponse.json({ error: "insert failed" }, { status: 500, headers });
    }

    return NextResponse.json({ ok: true }, { status: 200, headers });
  } catch (err) {
    console.error("[leads] handler error", err);
    return NextResponse.json({ error: "internal" }, { status: 500, headers });
  }
}
