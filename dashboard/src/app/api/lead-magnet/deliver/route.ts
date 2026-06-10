/**
 * POST /api/lead-magnet/deliver
 *
 * LinkedIn-OAuth shortcut path for the /downloads/* magnets on
 * www.capturepilot.com. Bypasses the normal /api/leads form (no captcha,
 * no manual email typing — LinkedIn already verified identity).
 *
 * Called by /auth/callback after a successful linkedin_oidc exchange. The
 * user is signed in with Supabase at this point but the row written here
 * lives in `marketing_leads` (top-of-funnel), not `user_profiles`. The
 * downstream pipeline (HubSpot sync, Apollo enrichment, lead-brief job)
 * mirrors /api/leads so a LinkedIn-grabbed magnet looks identical to an
 * email-form magnet in the CRM.
 *
 * Request body:
 *   {
 *     magnet: string              // required, must match LEAD_MAGNETS key
 *     email: string | null        // from supabase.auth.getUser()
 *     user_metadata: object       // raw user.user_metadata from supabase
 *     source?: string             // e.g. "linkedin_oauth"
 *     return_to?: string          // the marketing-site URL we'll bounce to (for UTM passthrough only)
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { getLeadMagnet, sendLeadMagnetEmail } from "@/lib/lead-magnets";
import { upsertHubSpotContact } from "@/lib/hubspot";
import { enqueueLeadBrief } from "@/lib/lead-brief";
import { enrichPersonViaApollo } from "@/lib/lead-enrichment";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { enqueueDripSequence } from "@/lib/email";

export const runtime = "nodejs";
// Same envelope as /api/leads — Apollo (8s) + HubSpot (~1s) + Resend (~1s)
// must all complete before the platform aborts us.
export const maxDuration = 30;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function db() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );
}

interface LinkedInMeta {
    full_name?: string;
    name?: string;
    given_name?: string;
    first_name?: string;
    family_name?: string;
    last_name?: string;
    email?: string;
    email_verified?: boolean;
    headline?: string;
    picture?: string;
    avatar_url?: string;
    picture_url?: string;
    locale?: string | { language?: string };
    profile?: string;
    linkedin_url?: string;
    sub?: string;
}

function parseLinkedInMeta(meta: Record<string, unknown>): {
    first_name?: string;
    last_name?: string;
    email?: string;
    linkedin_url?: string;
    linkedin_headline?: string;
    linkedin_picture_url?: string;
    linkedin_locale?: string;
    linkedin_email_verified?: boolean;
} {
    const m = meta as LinkedInMeta;
    const fullName = String(m.full_name || m.name || "").trim();
    const parts = fullName.split(/\s+/).filter(Boolean);
    const firstName = String(m.given_name || m.first_name || (parts.length > 0 ? parts[0] : "")).trim();
    const lastName = String(m.family_name || m.last_name || (parts.length > 1 ? parts.slice(1).join(" ") : "")).trim();
    const email = String(m.email || "").trim().toLowerCase();
    const linkedinUrl = String(m.linkedin_url || m.profile || m.sub || "").trim();
    const headline = String(m.headline || "").trim();
    const picture = String(m.picture || m.avatar_url || m.picture_url || "").trim();
    const locale = typeof m.locale === "string"
        ? m.locale
        : (m.locale && typeof m.locale === "object" && "language" in m.locale
            ? String(m.locale.language || "")
            : "");
    const emailVerified = typeof m.email_verified === "boolean" ? m.email_verified : undefined;

    return {
        first_name: firstName || undefined,
        last_name: lastName || undefined,
        email: email || undefined,
        linkedin_url: linkedinUrl && /^https?:\/\//i.test(linkedinUrl) ? linkedinUrl : undefined,
        linkedin_headline: headline || undefined,
        linkedin_picture_url: picture || undefined,
        linkedin_locale: locale || undefined,
        linkedin_email_verified: emailVerified,
    };
}

export async function POST(req: NextRequest) {
    try {
        // Authenticate the caller. /auth/callback exchanges the LinkedIn OIDC
        // code first and ONLY then POSTs here. The body's email + user_metadata
        // must match the session, otherwise anyone with a magnet key could
        // self-deliver to arbitrary addresses + impersonate any LinkedIn user
        // in HubSpot / marketing_leads.
        const sbAuth = await createSupabaseServerClient();
        const { data: { user } } = await sbAuth.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: "unauthorized" }, { status: 401 });
        }

        const body = (await req.json()) as {
            magnet?: string;
            email?: string | null;
            user_metadata?: Record<string, unknown>;
            source?: string;
            return_to?: string;
        };

        const magnetKey = (body.magnet || "").trim();
        const magnet = getLeadMagnet(magnetKey);
        if (!magnet) {
            return NextResponse.json({ error: "unknown magnet" }, { status: 400 });
        }

        const meta = body.user_metadata || {};
        const parsed = parseLinkedInMeta(meta);
        const email = (body.email || parsed.email || "").trim().toLowerCase();
        if (!email || !EMAIL_RE.test(email)) {
            return NextResponse.json({ error: "missing linkedin email" }, { status: 400 });
        }

        // Bind the request to the session: claimed email must match the
        // authenticated user, and the auth provider must be LinkedIn OIDC
        // (this route is only for the LinkedIn shortcut path).
        const sessionEmail = (user.email || "").trim().toLowerCase();
        if (sessionEmail && sessionEmail !== email) {
            return NextResponse.json({ error: "email mismatch" }, { status: 403 });
        }
        const provider = (user.app_metadata as { provider?: string } | null)?.provider;
        if (provider !== "linkedin_oidc") {
            return NextResponse.json({ error: "provider mismatch" }, { status: 403 });
        }

        const firstName = parsed.first_name;
        const lastName = parsed.last_name;
        const source = body.source || "linkedin_oauth";

        // Carry UTM through from the return_to URL (the marketing site sets
        // them server-side or via query). Best-effort — no UTMs is fine.
        let utm_source: string | null = null;
        let utm_medium: string | null = null;
        let utm_campaign: string | null = null;
        let utm_content: string | null = null;
        let utm_term: string | null = null;
        if (body.return_to) {
            try {
                const r = new URL(body.return_to);
                utm_source = r.searchParams.get("utm_source");
                utm_medium = r.searchParams.get("utm_medium");
                utm_campaign = r.searchParams.get("utm_campaign");
                utm_content = r.searchParams.get("utm_content");
                utm_term = r.searchParams.get("utm_term");
            } catch {
                /* ignore — bad URL */
            }
        }

        const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
        const ip_hash = ip ? createHash("sha256").update(ip).digest("hex").slice(0, 32) : null;
        const user_agent = req.headers.get("user-agent")?.slice(0, 400) ?? null;
        const referrer = req.headers.get("referer")?.slice(0, 400) ?? null;

        const sb = db();

        // 1. Insert (or recognise duplicate) — mirrors /api/leads two-phase
        //    pattern so a stale PostgREST schema cache doesn't block the row.
        const insertResult = await sb
            .from("marketing_leads")
            .insert({
                email,
                magnet_key: magnetKey,
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
                console.error("[lead-magnet/deliver] base insert failed", {
                    code,
                    message: msg,
                    email_domain: email.split("@")[1],
                });
                return NextResponse.json({ error: "insert failed", debug: msg }, { status: 500 });
            }
        }

        // 2. Patch the v2 + LinkedIn columns. Same stale-cache survivability
        //    as the v2 patch in /api/leads — non-fatal if columns are not yet
        //    in the PostgREST cache after a fresh migration.
        const liUpdate: Record<string, unknown> = {
            linkedin_verified: true,
            linkedin_synced_at: new Date().toISOString(),
        };
        if (firstName) liUpdate.first_name = firstName;
        if (lastName) liUpdate.last_name = lastName;
        if (parsed.linkedin_url) liUpdate.linkedin_url = parsed.linkedin_url;
        if (parsed.linkedin_headline) liUpdate.linkedin_headline = parsed.linkedin_headline;
        if (parsed.linkedin_picture_url) liUpdate.linkedin_picture_url = parsed.linkedin_picture_url;
        if (parsed.linkedin_locale) liUpdate.linkedin_locale = parsed.linkedin_locale;
        if (typeof parsed.linkedin_email_verified === "boolean") liUpdate.linkedin_email_verified = parsed.linkedin_email_verified;

        const v2 = await sb
            .from("marketing_leads")
            .update(liUpdate)
            .eq("email", email)
            .eq("magnet_key", magnetKey);
        if (v2.error) {
            const msg = v2.error.message || "";
            const cacheStale = msg.includes("schema cache") || (v2.error as { code?: string }).code === "PGRST204";
            if (!cacheStale) {
                console.warn("[lead-magnet/deliver] v2 patch non-fatal:", msg);
            }
        }

        // 3. Apollo enrichment (same as /api/leads). LinkedIn gives us name
        //    + email but not company / title / phone — Apollo fills the gap.
        const apolloEnrichment = await enrichPersonViaApollo({
            firstName: firstName || null,
            lastName: lastName || null,
            email,
            companyName: null,
        });
        if (apolloEnrichment) {
            const apolloUpdate = await sb
                .from("marketing_leads")
                .update({
                    apollo_enriched_at: new Date().toISOString(),
                    apollo_data: apolloEnrichment as unknown as Record<string, unknown>,
                    phone: apolloEnrichment.phone || null,
                    company: apolloEnrichment.organization_name || null,
                })
                .eq("email", email)
                .eq("magnet_key", magnetKey);
            if (apolloUpdate.error) {
                const msg = apolloUpdate.error.message || "";
                const cacheStale = msg.includes("schema cache") || (apolloUpdate.error as { code?: string }).code === "PGRST204";
                if (!cacheStale) {
                    console.warn("[lead-magnet/deliver] apollo patch non-fatal:", msg);
                }
            }
        }

        // 4. HubSpot sync — tag with lead_source_cp=lead_magnet so sales
        //    can segment LinkedIn-verified magnet grabs from generic
        //    form-fills. Non-blocking.
        const hubspotId = await upsertHubSpotContact({
            email,
            firstname: firstName || apolloEnrichment?.first_name || undefined,
            lastname: lastName || apolloEnrichment?.last_name || undefined,
            phone: apolloEnrichment?.phone || undefined,
            company: apolloEnrichment?.organization_name || undefined,
            jobtitle: apolloEnrichment?.title || undefined,
            lifecyclestage: "lead",
            extra: {
                lead_source_cp: ("lead_magnet" as never),
            },
        }).catch((err) => {
            console.warn("[lead-magnet/deliver] hubspot sync failed (non-fatal):", (err as Error).message);
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
                .eq("magnet_key", magnetKey);
            if (hsUpdate.error) {
                const msg = hsUpdate.error.message || "";
                const cacheStale = msg.includes("schema cache") || (hsUpdate.error as { code?: string }).code === "PGRST204";
                if (!cacheStale) {
                    console.warn("[lead-magnet/deliver] hubspot patch non-fatal:", msg);
                }
            }
        }

        // 5. Send the PDF via Resend. LinkedIn-verified path means we
        //    already know the email is valid (no captcha needed), so we
        //    fire the magnet immediately. Failure is non-fatal — the row
        //    is in marketing_leads + HubSpot, sales can recover.
        let emailSent = false;
        let emailError: string | undefined;
        const result = await sendLeadMagnetEmail({
            magnet,
            to: email,
            firstName: firstName || apolloEnrichment?.first_name || undefined,
            company: apolloEnrichment?.organization_name || undefined,
        });
        emailSent = result.sent;
        emailError = result.error;
        if (!result.sent) {
            console.error("[lead-magnet/deliver] resend failed", {
                magnet: magnetKey,
                email,
                error: result.error,
            });
        } else {
            await sb
                .from("marketing_leads")
                .update({
                    resend_synced: true,
                    ...(result.resendId ? { magnet_resend_id: result.resendId } : {}),
                })
                .eq("email", email)
                .eq("magnet_key", magnetKey);
        }

        // 6. Enqueue an AI Lead Brief for Andre's follow-up. Same pipeline
        //    /api/leads uses — keeps LinkedIn-grabbed magnets indistinguishable
        //    from form-grabbed magnets downstream.
        try {
            const { data: leadRow } = await sb
                .from("marketing_leads")
                .select("id")
                .eq("email", email)
                .eq("magnet_key", magnetKey)
                .maybeSingle();
            if (leadRow?.id) {
                await enqueueLeadBrief(sb, leadRow.id);
            }
        } catch (e) {
            console.warn("[lead-magnet/deliver] enqueue lead-brief failed (non-fatal):", (e as Error).message);
        }

        // 7. Enroll in the 7-day lead-magnet nurture (Day 1/3/5/7 follow-ups).
        //    Skipped on duplicate so a downloader who comes back through
        //    LinkedIn a second time doesn't get the sequence twice. The send()
        //    wrapper in lib/email.ts respects outreach_optouts automatically.
        if (!isDuplicate) {
            enqueueDripSequence({
                sequenceKey: "lead_magnet_nurture",
                email,
                contactName: [firstName, lastName].filter(Boolean).join(" ").trim() || undefined,
            }).catch((err) => console.warn("[lead-magnet/deliver] enqueue lead_magnet_nurture failed (non-fatal):", err));
        }

        return NextResponse.json({
            ok: true,
            duplicate: isDuplicate,
            email_sent: emailSent,
            email_error: emailError,
            linkedin_verified: true,
            // No captcha required for the LinkedIn shortcut — the OAuth
            // exchange already proved identity.
            captcha_required: false,
            enriched: Boolean(apolloEnrichment),
            hubspot_id: hubspotId || null,
        });
    } catch (err) {
        const msg = (err as Error).message || String(err);
        console.error("[lead-magnet/deliver] handler error", { msg });
        return NextResponse.json({ error: "internal", debug: msg }, { status: 500 });
    }
}
