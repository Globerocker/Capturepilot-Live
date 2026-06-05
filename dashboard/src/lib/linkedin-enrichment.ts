/**
 * LinkedIn OIDC enrichment
 * ------------------------
 *
 * When a user signs in (or links an account) via LinkedIn OAuth (OIDC), Supabase
 * persists the standard OIDC claims onto `user.user_metadata` and a corresponding
 * row in `user.identities` with `provider = "linkedin_oidc"`. This helper:
 *
 *   1. Pulls the verified claims off the Supabase user.
 *   2. Upserts them onto the matching `user_profiles` row (keyed on
 *      `auth_user_id`), flipping `linkedin_verified = true` so we can
 *      distinguish OIDC-sourced data from Apollo / manual entry.
 *   3. Mirrors the same payload onto any `marketing_leads` row that shares the
 *      contact email (one user can have both: a top-of-funnel lead row from a
 *      magnet grab, and a real signed-up user record).
 *   4. Pushes the LinkedIn fields up to HubSpot via
 *      `pushQuickCheckerBriefToHubSpot` so the sales rep sees the verified
 *      profile photo / locale / headline next to the contact card.
 *
 * LIMITATIONS — LinkedIn OIDC's default scopes (`openid profile email`) do NOT
 * expose the public profile URL. Capturing `https://www.linkedin.com/in/<handle>`
 * requires either an extra `/v2/me` API call with the `r_liteprofile` scope,
 * or asking the user to paste it manually. For now we store `linkedin_url` as
 * NULL and rely on Apollo enrichment / manual entry to fill it later.
 *
 * Fire-and-forget — every failure here is logged + swallowed. We never block
 * the auth callback on an enrichment hiccup.
 */

import type { User } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";

/** Shape of the OIDC claims LinkedIn ships in `user_metadata`. */
export interface LinkedInOidcClaims {
  sub: string;
  email?: string | null;
  email_verified?: boolean | null;
  name?: string | null;
  given_name?: string | null;
  family_name?: string | null;
  picture?: string | null;
  locale?: string | null;
}

/** Subset of LinkedIn fields we persist to the DB + push to HubSpot. */
export interface LinkedInProfilePayload {
  linkedin_url: string | null;
  linkedin_handle: string | null;
  linkedin_headline: string | null;
  linkedin_picture_url: string | null;
  linkedin_locale: string | null;
  linkedin_email_verified: boolean;
  linkedin_verified: true;
  linkedin_synced_at: string;
}

/**
 * Extract LinkedIn OIDC claims off the Supabase user object. Looks first at
 * `user.identities[provider=linkedin_oidc].identity_data`, falls back to
 * `user_metadata` when the identities array is empty (e.g. signInWithIdToken
 * paths or pre-link sessions).
 *
 * Returns null when no LinkedIn identity is present — callers should treat
 * this as "nothing to sync" and short-circuit.
 */
export function extractLinkedInClaims(user: User): LinkedInOidcClaims | null {
  if (!user) return null;

  // Prefer identities[] — that's the canonical OIDC payload per identity link.
  const identities = (user.identities || []) as Array<{
    provider?: string;
    identity_data?: Record<string, unknown> | null;
  }>;
  const liId = identities.find((i) => i.provider === "linkedin_oidc");
  const raw = (liId?.identity_data ||
    user.user_metadata ||
    {}) as Record<string, unknown>;

  // The user_metadata path is only valid when the *current* sign-in was
  // LinkedIn. If we fell back to it but there's no linkedin identity at all,
  // bail — we don't want to over-write profiles for users who signed in via
  // email/password and happen to have a "name" field in user_metadata.
  if (!liId && !raw.sub && !raw.picture) return null;

  const get = (k: string): string | null => {
    const v = raw[k];
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };

  return {
    sub: get("sub") || user.id,
    email: get("email") || user.email || null,
    email_verified: raw.email_verified === true,
    name: get("name"),
    given_name: get("given_name"),
    family_name: get("family_name"),
    picture: get("picture"),
    locale: get("locale"),
  };
}

/** Convert raw OIDC claims into the column shape we store. */
export function buildLinkedInProfilePayload(
  claims: LinkedInOidcClaims,
): LinkedInProfilePayload {
  return {
    // OIDC standard claims don't include the public profile URL. Leave null
    // and let a downstream /v2/me call or Apollo enrichment fill it in.
    linkedin_url: null,
    linkedin_handle: null,
    // Default-scope OIDC doesn't ship headline either. Apollo can hydrate.
    linkedin_headline: null,
    linkedin_picture_url: claims.picture || null,
    linkedin_locale: claims.locale || null,
    linkedin_email_verified: claims.email_verified === true,
    linkedin_verified: true,
    linkedin_synced_at: new Date().toISOString(),
  };
}

/**
 * Lazy service-role Supabase client. We need to bypass RLS to update
 * `marketing_leads` (caller is the authenticated user, but the lead row may
 * have been created anonymously by a Meta webhook before sign-up).
 */
function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/**
 * Main entry point — called from the OAuth callback after
 * `exchangeCodeForSession`. Idempotent: safe to call on every sign-in.
 *
 * Returns a small summary you can log for observability. Never throws.
 */
export async function syncLinkedInProfile(user: User): Promise<{
  synced: boolean;
  reason?: string;
  user_profile_updated?: boolean;
  marketing_lead_updated?: boolean;
  hubspot_contact_id?: string | null;
}> {
  try {
    const claims = extractLinkedInClaims(user);
    if (!claims) {
      return { synced: false, reason: "no LinkedIn identity on user" };
    }

    const payload = buildLinkedInProfilePayload(claims);
    const sb = serviceClient();
    const email = (claims.email || user.email || "").toLowerCase() || null;

    // ── user_profiles ───────────────────────────────────────────────────
    let userProfileUpdated = false;
    {
      const { error, count } = await sb
        .from("user_profiles")
        .update(payload, { count: "exact" })
        .eq("auth_user_id", user.id);
      if (error) {
        console.warn(
          "[linkedin-enrichment] user_profiles update failed:",
          error.message,
        );
      } else if ((count ?? 0) > 0) {
        userProfileUpdated = true;
      } else {
        // No matching profile row yet (e.g. user just landed in the callback
        // and the onboarding flow hasn't inserted the profile). The
        // onboarding step will copy from user_metadata; we'll re-sync the
        // LinkedIn columns on the next sign-in.
      }
    }

    // ── marketing_leads (email-keyed) ───────────────────────────────────
    let marketingLeadUpdated = false;
    if (email) {
      const { error, count } = await sb
        .from("marketing_leads")
        .update(payload, { count: "exact" })
        .eq("email", email);
      if (error) {
        const msg = error.message || "";
        const cacheStale =
          msg.includes("schema cache") ||
          (error as { code?: string }).code === "PGRST204";
        if (!cacheStale) {
          console.warn(
            "[linkedin-enrichment] marketing_leads update failed:",
            msg,
          );
        }
      } else if ((count ?? 0) > 0) {
        marketingLeadUpdated = true;
      }
    }

    // ── HubSpot push ────────────────────────────────────────────────────
    // Reuse the strategic-brief pusher even though we only have LinkedIn
    // fields — it handles upsert-by-email + custom property mapping in one
    // place. We pass the minimum required fields (email, companyName) plus
    // the LinkedIn-specific payload via the dedicated `linkedin` slot we
    // added to QuickCheckerBriefInput. Sales reps see the verified
    // photo + locale next to the contact card.
    let hubspotContactId: string | null = null;
    if (email) {
      try {
        const { pushQuickCheckerBriefToHubSpot } = await import(
          "@/lib/hubspot-brief"
        );
        // Pull existing user_profiles fields to feed companyName / phone, so
        // the HubSpot upsert doesn't blank them out on re-sync.
        const { data: profile } = await sb
          .from("user_profiles")
          .select("company_name, contact_name, contact_phone, website")
          .eq("auth_user_id", user.id)
          .single();

        const fullName =
          claims.name ||
          [claims.given_name, claims.family_name].filter(Boolean).join(" ") ||
          profile?.contact_name ||
          null;

        const result = await pushQuickCheckerBriefToHubSpot({
          email,
          companyName: profile?.company_name || email.split("@")[1] || "Unknown",
          contactName: fullName,
          contactPhone: profile?.contact_phone || null,
          website: profile?.website || null,
          linkedin: {
            linkedin_url: payload.linkedin_url,
            linkedin_picture_url: payload.linkedin_picture_url,
            linkedin_headline: payload.linkedin_headline,
            linkedin_verified: true,
          },
        });
        hubspotContactId = result.contact_id || null;
      } catch (err) {
        console.warn(
          "[linkedin-enrichment] HubSpot push failed:",
          err instanceof Error ? err.message : err,
        );
      }
    }

    return {
      synced: true,
      user_profile_updated: userProfileUpdated,
      marketing_lead_updated: marketingLeadUpdated,
      hubspot_contact_id: hubspotContactId,
    };
  } catch (err) {
    console.warn(
      "[linkedin-enrichment] syncLinkedInProfile fatal:",
      err instanceof Error ? err.message : err,
    );
    return {
      synced: false,
      reason:
        err instanceof Error ? err.message : "unknown enrichment error",
    };
  }
}
