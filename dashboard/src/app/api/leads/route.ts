import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { getLeadMagnet, sendLeadMagnetEmail } from "@/lib/lead-magnets";
import { sendCAPIEvent, userDataFromRequest, newEventId } from "@/lib/meta-capi";
import { enrichPersonViaApollo, domainFromEmail } from "@/lib/lead-enrichment";
import { upsertHubSpotContact } from "@/lib/hubspot";
import { enqueueLeadBrief } from "@/lib/lead-brief";

export const runtime = "nodejs";
// Pipeline (insert → Apollo enrich → HubSpot sync → Resend) typically runs
// in ~3s. Bumping `maxDuration` so the worst-case Apollo timeout (8s) plus
// HubSpot (~1s) plus Resend (~1s) all fit before the platform aborts us.
export const maxDuration = 30;

const ALLOWED_ORIGINS = new Set([
  "https://www.capturepilot.com",
  "https://capturepilot.com",
  "https://americurial.com",
  "https://www.americurial.com",
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
    const firstName = body.first_name ? String(body.first_name).trim().slice(0, 80) : null;
    const lastName = body.last_name ? String(body.last_name).trim().slice(0, 80) : null;
    const company = body.company ? String(body.company).trim().slice(0, 200) : null;
    const phone = body.phone ? String(body.phone).trim().slice(0, 40) : null;
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

    const sb = db();

    // 1. Insert the lead row. Two-phase to survive a stale PostgREST schema
    //    cache: first inserts the base columns (always present since the
    //    initial 070 migration), then patches the v2 columns separately and
    //    swallows any "column not in cache" errors. This way a fresh deploy
    //    isn't blocked on a Supabase cache reload that can lag minutes
    //    behind a migration.
    const insertResult = await sb
      .from("marketing_leads")
      .insert({
        email,
        company,
        magnet_key: magnet,
        source,
        utm_source, utm_medium, utm_campaign, utm_content, utm_term,
        ip_hash, user_agent, referrer,
      });

    let isDuplicate = false;
    if (insertResult.error) {
      const code = (insertResult.error as { code?: string }).code;
      const msg = insertResult.error.message || "";
      if (code === "23505" || msg.includes("duplicate key")) {
        isDuplicate = true;
      } else {
        // Real failure — surface in logs with full context so we can diagnose
        // the next 500 quickly instead of guessing at error masks again.
        console.error("[leads] base insert failed", {
          code,
          message: msg,
          details: (insertResult.error as { details?: string }).details,
          hint: (insertResult.error as { hint?: string }).hint,
          email_domain: email.split("@")[1],
        });
        return NextResponse.json({ error: "insert failed", debug: msg }, { status: 500, headers });
      }
    }

    // 1b. Patch v2 columns (first_name, last_name, phone) — swallow the
    //     PGRST204 / "schema cache" error when PostgREST hasn't picked up
    //     the migration yet. The row is already saved with the base data.
    if (firstName || lastName || phone) {
      const v2 = await sb
        .from("marketing_leads")
        .update({
          ...(firstName ? { first_name: firstName } : {}),
          ...(lastName ? { last_name: lastName } : {}),
          ...(phone ? { phone } : {}),
        })
        .eq("email", email)
        .eq("magnet_key", magnet);
      if (v2.error) {
        const msg = v2.error.message || "";
        const cacheStale = msg.includes("schema cache") || (v2.error as { code?: string }).code === "PGRST204";
        if (!cacheStale) {
          console.warn("[leads] v2 patch non-fatal:", msg);
        }
      }
    }

    // If duplicate, also refresh utm + other firmographics so HubSpot syncs
    // the latest values (not the initial submit).
    if (isDuplicate) {
      await sb
        .from("marketing_leads")
        .update({
          company,
          utm_source, utm_medium, utm_campaign, utm_content, utm_term,
        })
        .eq("email", email)
        .eq("magnet_key", magnet);
    }

    // 2. Apollo enrichment — pull title/seniority/linkedin/phone/firmographics
    //    when we can match the contact. Falls back gracefully when the lookup
    //    misses (free-mail domains, unknown people, missing key).
    const apolloEnrichment = await enrichPersonViaApollo({
      firstName,
      lastName,
      email,
      companyName: company,
    });

    if (apolloEnrichment) {
      const apolloUpdate = await sb
        .from("marketing_leads")
        .update({
          apollo_enriched_at: new Date().toISOString(),
          apollo_data: apolloEnrichment as unknown as Record<string, unknown>,
          // Backfill phone from Apollo only when the user didn't provide one.
          phone: phone || apolloEnrichment.phone || null,
        })
        .eq("email", email)
        .eq("magnet_key", magnet);
      // Same stale-cache survivability as the v2 patch above. Apollo data
      // is non-critical for delivery; we still keep enrichment in memory
      // for the HubSpot sync that follows.
      if (apolloUpdate.error) {
        const msg = apolloUpdate.error.message || "";
        const cacheStale = msg.includes("schema cache") || (apolloUpdate.error as { code?: string }).code === "PGRST204";
        if (!cacheStale) {
          console.warn("[leads] apollo patch non-fatal:", msg);
        }
      }
    }

    // 3. HubSpot CRM sync — runs BEFORE email delivery so a contact exists
    //    in CRM the instant the user hits inbox. Source tag = "lead_magnet"
    //    + the magnet key so the marketing team can segment by funnel entry.
    const domain = domainFromEmail(email);
    const hubspotId = await upsertHubSpotContact({
      email,
      firstname: firstName || apolloEnrichment?.first_name || undefined,
      lastname: lastName || apolloEnrichment?.last_name || undefined,
      phone: phone || apolloEnrichment?.phone || undefined,
      company: company || apolloEnrichment?.organization_name || undefined,
      jobtitle: apolloEnrichment?.title || undefined,
      lifecyclestage: "lead",
      extra: {
        // `lead_source_cp` is the LeadSource enum; existing string values are
        // ('quick_checker' | 'signup' | 'contact_form' | ...). We extend with
        // 'lead_magnet' via cast — the HubSpot property is free-text so any
        // string works at the API layer, even if the TS type doesn't list it.
        lead_source_cp: ("lead_magnet" as never),
      },
    }).catch((err) => {
      console.warn("[leads] hubspot sync failed (non-fatal):", (err as Error).message);
      return null;
    });

    if (hubspotId) {
      const hsUpdate = await sb
        .from("marketing_leads")
        .update({
          hubspot_contact_id: hubspotId,
          hubspot_synced_at: new Date().toISOString(),
        })
        .eq("email", email)
        .eq("magnet_key", magnet);
      if (hsUpdate.error) {
        const msg = hsUpdate.error.message || "";
        const cacheStale = msg.includes("schema cache") || (hsUpdate.error as { code?: string }).code === "PGRST204";
        if (!cacheStale) {
          console.warn("[leads] hubspot patch non-fatal:", msg);
        }
      }
    }

    // 4. Resolve magnet and deliver the PDF (last step — by the time the
    //    user opens the inbox, the contact exists in HubSpot with full
    //    Apollo enrichment, so sales can act immediately).
    const leadMagnet = getLeadMagnet(magnet);
    let emailSent = false;
    let emailError: string | undefined;
    if (leadMagnet) {
      const result = await sendLeadMagnetEmail({
        magnet: leadMagnet,
        to: email,
        firstName: firstName || apolloEnrichment?.first_name || undefined,
        company: company || apolloEnrichment?.organization_name || undefined,
      });
      emailSent = result.sent;
      emailError = result.error;
      if (!result.sent) {
        console.error("[leads] resend failed", { magnet, email, error: result.error });
      } else {
        await sb
          .from("marketing_leads")
          .update({
            resend_synced: true,
            ...(result.resendId ? { magnet_resend_id: result.resendId } : {}),
          })
          .eq("email", email)
          .eq("magnet_key", magnet);
      }
    }

    // 5. Fire server-side CAPI Lead event. Hashed email + IP + UA + fbp/fbc
    //    give Meta the best match-quality possible from a server-only fire.
    //    Non-blocking — Meta API can be slow + we'd rather deliver "200 ok"
    //    to the marketing-site form than stall the user.
    const capiEventId = String(body.capi_event_id || newEventId());
    void sendCAPIEvent({
      eventName: "Lead",
      eventId: capiEventId,
      eventSourceUrl: referrer || undefined,
      userData: userDataFromRequest(req, { email, phone: phone || apolloEnrichment?.phone || undefined }),
      customData: {
        content_name: magnet,
        content_category: "lead_magnet",
        source: source || undefined,
        utm_source: utm_source || undefined,
        utm_medium: utm_medium || undefined,
        utm_campaign: utm_campaign || undefined,
        has_enrichment: Boolean(apolloEnrichment),
        has_hubspot: Boolean(hubspotId),
      },
    }).catch(err => console.warn("[leads] CAPI Lead fire failed (non-fatal):", err));

    // 6. Enqueue an AI Lead Brief for Andre's follow-up call. Runs async via
    //    the worker queue — the user already has their 200, this just lands
    //    in americurial@gmail.com a minute or two later with a SAM-resolved
    //    + opportunity-matched + LLM-scored briefing and a phone-call script.
    try {
      const { data: leadRow } = await sb
        .from("marketing_leads")
        .select("id")
        .eq("email", email)
        .eq("magnet_key", magnet)
        .maybeSingle();
      if (leadRow?.id) {
        await enqueueLeadBrief(sb, leadRow.id);
      }
    } catch (e) {
      // Non-fatal — the lead was already saved + the user already got the PDF.
      console.warn("[leads] failed to enqueue lead-brief job (non-fatal):", (e as Error).message);
    }

    return NextResponse.json({
      ok: true,
      duplicate: isDuplicate,
      email_sent: emailSent,
      email_error: emailError,
      enriched: Boolean(apolloEnrichment),
      hubspot_id: hubspotId || null,
      capi_event_id: capiEventId,
    }, { status: 200, headers });
  } catch (err) {
    const msg = (err as Error).message || String(err);
    console.error("[leads] handler error", { msg, stack: (err as Error).stack });
    return NextResponse.json({ error: "internal", debug: msg }, { status: 500, headers });
  }
}

// Documentation for /api/leads contract:
//
//   POST /api/leads
//     {
//       email: string (required, validated)
//       first_name?: string
//       last_name?: string
//       company?: string
//       phone?: string
//       magnet: string (required — must match a key in LEAD_MAGNETS)
//       source?: string (origin pathname, for analytics)
//       utm_source?, utm_medium?, utm_campaign?, utm_content?, utm_term?
//       capi_event_id?: string (client-generated, used for Meta CAPI dedup)
//     }
//
//   Pipeline order (top-to-bottom):
//     1. Insert into marketing_leads (handles duplicate by re-syncing
//        firmographics — same email + same magnet = same lead).
//     2. Apollo enrichment (people/match) when domain or org name is
//        available. Persists to marketing_leads.apollo_data.
//     3. HubSpot CRM upsert as a Lead with all available firmographics
//        AND apollo-enriched fields (title, linkedin, mobile).
//     4. Resend delivery of the magnet PDF via the branded email template.
//     5. Meta CAPI Lead event fired (non-blocking).
//
//   Form requirements per magnet are defined in `src/lib/lead-magnets.ts`.
