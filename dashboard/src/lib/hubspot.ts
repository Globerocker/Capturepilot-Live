/**
 * HubSpot CRM Client — CapturePilot
 * Americurial LLC
 *
 * Central library for syncing leads, contacts, and deals into HubSpot.
 * All functions are fire-and-forget safe (errors are logged, never thrown).
 */

const HUBSPOT_TOKEN =
  process.env.HUBSPOT_API_KEY ||
  process.env.HUBSPOT_ACCESS_TOKEN ||
  process.env.HUBSPOT_PRIVATE_APP_TOKEN ||
  '';

const BASE = 'https://api.hubapi.com';

// ─── Pipeline + Stage IDs (populated after setup-hubspot-account.mjs is run) ─
export const PIPELINES = {
  saas: {
    id: process.env.HUBSPOT_SAAS_PIPELINE_ID || '',
    stages: {
      quickCheckLead:     process.env.HUBSPOT_SAAS_STAGE_QUICK_CHECK      || '',
      emailCaptured:      process.env.HUBSPOT_SAAS_STAGE_EMAIL_CAPTURED   || '',
      signedUp:           process.env.HUBSPOT_SAAS_STAGE_SIGNED_UP        || '',
      onboardingComplete: process.env.HUBSPOT_SAAS_STAGE_ONBOARDING_DONE  || '',
      engaged:            process.env.HUBSPOT_SAAS_STAGE_ENGAGED           || '',
      trialActive:        process.env.HUBSPOT_SAAS_STAGE_TRIAL             || '',
      subscribed:         process.env.HUBSPOT_SAAS_STAGE_SUBSCRIBED        || '',
      churned:            process.env.HUBSPOT_SAAS_STAGE_CHURNED           || '',
    },
  },
  agency: {
    id: process.env.HUBSPOT_AGENCY_PIPELINE_ID || '',
    stages: {
      inquiry:           process.env.HUBSPOT_AGENCY_STAGE_INQUIRY           || '',
      discoveryBooked:   process.env.HUBSPOT_AGENCY_STAGE_DISCOVERY_BOOKED  || '',
      discoveryDone:     process.env.HUBSPOT_AGENCY_STAGE_DISCOVERY_DONE    || '',
      proposalSent:      process.env.HUBSPOT_AGENCY_STAGE_PROPOSAL          || '',
      contractSigned:    process.env.HUBSPOT_AGENCY_STAGE_CONTRACT          || '',
      onboarding:        process.env.HUBSPOT_AGENCY_STAGE_ONBOARDING        || '',
      activeClient:      process.env.HUBSPOT_AGENCY_STAGE_ACTIVE_CLIENT     || '',
      closedLost:        process.env.HUBSPOT_AGENCY_STAGE_CLOSED_LOST       || '',
    },
  },
  capture: {
    id: process.env.HUBSPOT_CAPTURE_PIPELINE_ID || '',
  },
} as const;

// ─── Types ────────────────────────────────────────────────────────────────────
export type LeadSource =
  | 'quick_checker'
  | 'signup'
  | 'contact_form'
  | 'americurial_form'
  | 'calendly'
  | 'manual';

export type AccountType = 'self_service' | 'consulting' | 'admin';

export type SubscriptionStatus =
  | 'free'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled';

export interface ContactProperties {
  // Standard HubSpot
  email?: string;
  firstname?: string;
  lastname?: string;
  company?: string;
  phone?: string;
  jobtitle?: string;
  lifecyclestage?: string;
  // Custom CapturePilot properties
  capturepilot_user_id?: string;
  account_type?: AccountType;
  subscription_status?: SubscriptionStatus;
  readiness_score?: number;
  naics_codes?: string;
  sam_registered?: boolean;
  uei?: string;
  business_state?: string;
  quick_checker_url?: string;
  lead_source_cp?: LeadSource;
  beta_feedback_given?: boolean;
  matched_opportunities_count?: number;
  veteran_owned?: boolean;
  // Firmographics collected in onboarding Step 3 (crawler can't know these)
  capturepilot_company_size?: 'micro' | 'small' | 'mid' | 'large';
  numberofemployees?: number; // HubSpot standard property
  annualrevenue_range?: string;
  capturepilot_years_in_business?: number;
  capturepilot_has_fed_experience?: boolean;
}

/**
 * Split a single "contact_name" style full name into first/last parts.
 * Keeps middle names on the last-name bucket so nothing is lost.
 */
export function splitContactName(fullName?: string | null): { firstname?: string; lastname?: string } {
  if (!fullName) return {};
  const trimmed = fullName.trim();
  if (!trimmed) return {};
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { firstname: parts[0] };
  return { firstname: parts[0], lastname: parts.slice(1).join(' ') };
}

/**
 * Upsert a HubSpot contact by email.
 * Searches by email first; PATCHes when found, POSTs otherwise.
 *
 * Fire-and-forget safe — all errors are swallowed and logged.
 * Returns the HubSpot contact ID or null when sync is skipped / fails.
 */
export async function upsertHubSpotContact(params: {
  email: string;
  firstname?: string;
  lastname?: string;
  phone?: string;
  company?: string;
  jobtitle?: string;
  lifecyclestage?: string;
  // passthrough for any additional CapturePilot custom properties
  extra?: Omit<ContactProperties, 'email' | 'firstname' | 'lastname' | 'phone' | 'company' | 'jobtitle' | 'lifecyclestage'>;
}): Promise<string | null> {
  const { email, extra, ...base } = params;
  if (!email) return null;
  if (!HUBSPOT_TOKEN) {
    console.warn('[HubSpot] No token configured — skipping upsertHubSpotContact');
    return null;
  }

  const properties: ContactProperties = { ...base, ...(extra || {}) };

  try {
    // 1. Search by email
    const existingId = await getContactByEmail(email);
    if (existingId) {
      const ok = await updateContactById(existingId, properties);
      return ok ? existingId : null;
    }
    // 2. Create new
    const result = await hsApi('POST', '/crm/v3/objects/contacts', {
      properties: { email, ...toHsPropertiesV3(properties) },
    });
    return (result.id as string) || null;
  } catch (err) {
    console.error('[HubSpot] upsertHubSpotContact failed:', (err as Error).message);
    return null;
  }
}

// ─── Internal API Wrapper ─────────────────────────────────────────────────────
async function hsApi(
  method: 'GET' | 'POST' | 'PATCH' | 'PUT',
  endpoint: string,
  body?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (!HUBSPOT_TOKEN) {
    console.warn('[HubSpot] No token configured — skipping API call');
    return {};
  }
  const res = await fetch(`${BASE}${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${HUBSPOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HubSpot ${res.status} ${method} ${endpoint}: ${text}`);
  }
  return res.json();
}

/** Converts ContactProperties object to HubSpot properties array format */
function toHsProperties(props: ContactProperties): Array<{ property: string; value: string }> {
  return Object.entries(props)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => ({
      property: k,
      value: String(v),
    }));
}

/** Converts ContactProperties to key-value format for v3 API */
function toHsPropertiesV3(props: ContactProperties): Record<string, string> {
  return Object.fromEntries(
    Object.entries(props)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => [k, String(v)]),
  );
}

// ─── Core Functions ───────────────────────────────────────────────────────────

/**
 * Create or update a HubSpot contact by email.
 * Uses upsert — safe to call multiple times.
 * Returns the HubSpot contact ID or null on error.
 */
export async function syncContactToHubspot(
  email: string,
  properties: Omit<ContactProperties, 'email'>,
): Promise<string | null> {
  if (!email) return null;
  try {
    const result = await hsApi('POST', '/crm/v3/objects/contacts', {
      properties: {
        email,
        ...toHsPropertiesV3(properties),
      },
    });
    return (result.id as string) || null;
  } catch (err: unknown) {
    // If contact already exists (409), update instead
    const msg = (err as Error).message || '';
    if (msg.includes('409') || msg.includes('CONTACT_EXISTS')) {
      const id = extractExistingContactId(msg);
      if (id) {
        await updateContactById(id, { email, ...properties });
        return id;
      }
      // Fallback: search by email then update
      return updateContactByEmail(email, properties);
    }
    console.error('[HubSpot] syncContactToHubspot failed:', (err as Error).message);
    return null;
  }
}

function extractExistingContactId(errorMessage: string): string | null {
  // HubSpot returns "existing object id" in 409 message
  const match = errorMessage.match(/existing object id:\s*(\d+)/i) ||
                errorMessage.match(/"id"\s*:\s*"?(\d+)"?/);
  return match?.[1] || null;
}

export async function updateContactByEmail(
  email: string,
  properties: Omit<ContactProperties, 'email'>,
): Promise<string | null> {
  try {
    const result = await hsApi('PATCH', `/crm/v3/objects/contacts/${encodeURIComponent(email)}?idProperty=email`, {
      properties: toHsPropertiesV3(properties),
    });
    return (result.id as string) || null;
  } catch (err) {
    console.error('[HubSpot] updateContactByEmail failed:', (err as Error).message);
    return null;
  }
}

export async function updateContactById(
  contactId: string,
  properties: ContactProperties,
): Promise<boolean> {
  try {
    await hsApi('PATCH', `/crm/v3/objects/contacts/${contactId}`, {
      properties: toHsPropertiesV3(properties),
    });
    return true;
  } catch (err) {
    console.error('[HubSpot] updateContactById failed:', (err as Error).message);
    return false;
  }
}

/**
 * Get HubSpot contact ID by email address.
 */
export async function getContactByEmail(email: string): Promise<string | null> {
  try {
    const result = await hsApi('POST', '/crm/v3/objects/contacts/search', {
      filterGroups: [{
        filters: [{ propertyName: 'email', operator: 'EQ', value: email }],
      }],
      properties: ['email'],
      limit: 1,
    });
    const contacts = (result.results as Array<{ id: string }>) || [];
    return contacts[0]?.id || null;
  } catch (err) {
    console.error('[HubSpot] getContactByEmail failed:', (err as Error).message);
    return null;
  }
}

/**
 * Create a deal in a HubSpot pipeline and associate it with a contact.
 * Returns the deal ID or null on error.
 */
export async function createDealInHubspot(params: {
  contactId: string;
  dealName: string;
  pipelineId: string;
  stageId: string;
  amount?: number;
  closeDate?: string; // ISO date string
}): Promise<string | null> {
  try {
    // Create deal
    const deal = await hsApi('POST', '/crm/v3/objects/deals', {
      properties: {
        dealname: params.dealName,
        pipeline: params.pipelineId,
        dealstage: params.stageId,
        ...(params.amount ? { amount: String(params.amount) } : {}),
        ...(params.closeDate ? { closedate: params.closeDate } : {}),
      },
    });
    const dealId = deal.id as string;

    // Associate deal with contact
    if (dealId && params.contactId) {
      await hsApi(
        'PUT',
        `/crm/v3/objects/deals/${dealId}/associations/contacts/${params.contactId}/deal_to_contact`,
        {}
      ).catch(e => console.error('[HubSpot] association failed:', e.message));
    }

    return dealId || null;
  } catch (err) {
    console.error('[HubSpot] createDealInHubspot failed:', (err as Error).message);
    return null;
  }
}

/**
 * Move an existing deal to a new pipeline stage.
 */
export async function updateDealStage(dealId: string, stageId: string): Promise<boolean> {
  try {
    await hsApi('PATCH', `/crm/v3/objects/deals/${dealId}`, {
      properties: { dealstage: stageId },
    });
    return true;
  } catch (err) {
    console.error('[HubSpot] updateDealStage failed:', (err as Error).message);
    return false;
  }
}

/**
 * Create or update a HubSpot company by domain or name.
 */
export async function createOrUpdateCompanyInHubspot(companyName: string, domain?: string): Promise<string | null> {
  if (!companyName) return null;
  try {
    const properties: Record<string, string> = { name: companyName };
    if (domain) properties.domain = domain;
    const result = await hsApi('POST', '/crm/v3/objects/companies', { properties });
    return (result.id as string) || null;
  } catch (err: unknown) {
    const msg = (err as Error).message || '';
    if (msg.includes('409') || msg.includes('already exists') || msg.includes('CONFLICT')) {
      const match = msg.match(/existing object id:\s*(\d+)/i) ||
                    msg.match(/Existing ID:\s*(\d+)/i) ||
                    msg.match(/"id"\s*:\s*"?(\d+)"?/);
      return match?.[1] || null;
    }
    console.error('[HubSpot] createOrUpdateCompanyInHubspot failed:', msg);
    return null;
  }
}

/**
 * Associate a contact to a company.
 */
export async function associateContactToCompany(contactId: string, companyId: string): Promise<boolean> {
  try {
    await hsApi(
      'PUT',
      `/crm/v3/objects/companies/${companyId}/associations/contacts/${contactId}/company_to_contact`
    );
    return true;
  } catch (err: unknown) {
    console.error('[HubSpot] associateContactToCompany failed:', (err as Error).message);
    return false;
  }
}

/**
 * Search for an open deal for a contact in a specific pipeline.
 */
export async function findOpenDealForContact(
  contactId: string,
  pipelineId: string,
): Promise<string | null> {
  try {
    const result = await hsApi('POST', '/crm/v3/objects/deals/search', {
      filterGroups: [{
        filters: [
          { propertyName: 'pipeline', operator: 'EQ', value: pipelineId },
          { propertyName: 'associations.contact', operator: 'EQ', value: contactId },
        ],
      }],
      properties: ['dealname', 'dealstage', 'pipeline'],
      limit: 1,
    });
    const deals = (result.results as Array<{ id: string }>) || [];
    return deals[0]?.id || null;
  } catch (err) {
    console.error('[HubSpot] findOpenDealForContact failed:', (err as Error).message);
    return null;
  }
}

// ─── High-Level Event Handlers ────────────────────────────────────────────────
// These are called by app events (Quick Checker, Stripe, signup, etc.)

/**
 * Called when a user completes the Quick Checker (with or without email).
 */
export async function onQuickCheckerComplete(params: {
  email?: string;
  company?: string;
  readinessScore: number;
  naicsCodes: string[];
  samRegistered: boolean;
  veteranOwned?: boolean;
  businessState?: string;
  uei?: string;
  quickCheckerUrl?: string;
  phone?: string;
}): Promise<void> {
  if (!params.email) return; // No email = can't sync to HubSpot

  const contactId = await syncContactToHubspot(params.email, {
    company: params.company,
    phone: params.phone,
    readiness_score: params.readinessScore,
    naics_codes: params.naicsCodes.join(', '),
    sam_registered: params.samRegistered,
    veteran_owned: params.veteranOwned,
    business_state: params.businessState,
    uei: params.uei,
    quick_checker_url: params.quickCheckerUrl,
    lead_source_cp: 'quick_checker',
    subscription_status: 'free',
  });

  if (contactId && PIPELINES.saas.id && PIPELINES.saas.stages.quickCheckLead) {
    // Check if deal already exists
    const existingDeal = await findOpenDealForContact(contactId, PIPELINES.saas.id);
    if (!existingDeal) {
      await createDealInHubspot({
        contactId,
        dealName: `${params.company || params.email} — Quick Check Lead`,
        pipelineId: PIPELINES.saas.id,
        stageId: PIPELINES.saas.stages.quickCheckLead,
      });
    }
  }
}

/**
 * Called when a user provides their email on the Quick Checker results page.
 */
export async function onQuickCheckerEmailCaptured(email: string, company?: string): Promise<void> {
  const contactId = await syncContactToHubspot(email, {
    company,
    lead_source_cp: 'quick_checker',
  });

  if (contactId && PIPELINES.saas.id && PIPELINES.saas.stages.emailCaptured) {
    const existingDeal = await findOpenDealForContact(contactId, PIPELINES.saas.id);
    if (existingDeal) {
      await updateDealStage(existingDeal, PIPELINES.saas.stages.emailCaptured);
    } else {
      await createDealInHubspot({
        contactId,
        dealName: `${company || email} — Email Captured`,
        pipelineId: PIPELINES.saas.id,
        stageId: PIPELINES.saas.stages.emailCaptured,
      });
    }
  }
}

/**
 * Called when a new user signs up to CapturePilot.
 */
export async function onUserSignup(params: {
  email: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  userId: string;
  accountType?: AccountType;
}): Promise<void> {
  const contactId = await syncContactToHubspot(params.email, {
    firstname: params.firstName,
    lastname: params.lastName,
    company: params.company,
    capturepilot_user_id: params.userId,
    account_type: params.accountType || 'self_service',
    subscription_status: 'free',
    lead_source_cp: 'signup',
  });

  if (contactId && PIPELINES.saas.id && PIPELINES.saas.stages.signedUp) {
    const existingDeal = await findOpenDealForContact(contactId, PIPELINES.saas.id);
    if (existingDeal) {
      await updateDealStage(existingDeal, PIPELINES.saas.stages.signedUp);
    } else {
      await createDealInHubspot({
        contactId,
        dealName: `${params.company || params.email} — Signed Up`,
        pipelineId: PIPELINES.saas.id,
        stageId: PIPELINES.saas.stages.signedUp,
      });
    }
  }
}

/**
 * Called when onboarding is complete.
 */
export async function onOnboardingComplete(params: {
  email: string;
  matchedOpportunitiesCount: number;
}): Promise<void> {
  const contactId = await updateContactByEmail(params.email, {
    matched_opportunities_count: params.matchedOpportunitiesCount,
  });

  if (contactId && PIPELINES.saas.id && PIPELINES.saas.stages.onboardingComplete) {
    const deal = await findOpenDealForContact(contactId, PIPELINES.saas.id);
    if (deal) await updateDealStage(deal, PIPELINES.saas.stages.onboardingComplete);
  }
}

/**
 * Called when a Stripe trial starts.
 */
export async function onTrialStarted(params: {
  email: string;
  stripeCustomerId: string;
}): Promise<void> {
  const contactId = await updateContactByEmail(params.email, {
    subscription_status: 'trialing',
  });

  if (contactId && PIPELINES.saas.id && PIPELINES.saas.stages.trialActive) {
    const deal = await findOpenDealForContact(contactId, PIPELINES.saas.id);
    if (deal) {
      await updateDealStage(deal, PIPELINES.saas.stages.trialActive);
    } else {
      await createDealInHubspot({
        contactId,
        dealName: `${params.email} — Trial Active`,
        pipelineId: PIPELINES.saas.id,
        stageId: PIPELINES.saas.stages.trialActive,
      });
    }
  }
}

/**
 * Called when subscription becomes active (paid).
 */
export async function onSubscriptionActivated(params: {
  email: string;
  amount?: number;
}): Promise<void> {
  const contactId = await updateContactByEmail(params.email, {
    subscription_status: 'active',
  });

  if (contactId && PIPELINES.saas.id && PIPELINES.saas.stages.subscribed) {
    const deal = await findOpenDealForContact(contactId, PIPELINES.saas.id);
    if (deal) {
      await updateDealStage(deal, PIPELINES.saas.stages.subscribed);
    }
  }
}

/**
 * Called when subscription is canceled.
 */
export async function onSubscriptionCanceled(email: string): Promise<void> {
  const contactId = await updateContactByEmail(email, {
    subscription_status: 'canceled',
  });

  if (contactId && PIPELINES.saas.id && PIPELINES.saas.stages.churned) {
    const deal = await findOpenDealForContact(contactId, PIPELINES.saas.id);
    if (deal) await updateDealStage(deal, PIPELINES.saas.stages.churned);
  }
}

/**
 * Called when payment fails.
 */
export async function onPaymentFailed(email: string): Promise<void> {
  await updateContactByEmail(email, { subscription_status: 'past_due' });
}

/**
 * Called when admin creates a consulting client.
 */
export async function onConsultingClientCreated(params: {
  email: string;
  company?: string;
  contactName?: string;
  userId: string;
}): Promise<void> {
  const nameParts = (params.contactName || '').split(' ');
  const contactId = await syncContactToHubspot(params.email, {
    firstname: nameParts[0],
    lastname: nameParts.slice(1).join(' '),
    company: params.company,
    capturepilot_user_id: params.userId,
    account_type: 'consulting',
    lead_source_cp: 'manual',
  });

  if (contactId && PIPELINES.agency.id && PIPELINES.agency.stages.onboarding) {
    await createDealInHubspot({
      contactId,
      dealName: `${params.company || params.email} — Consulting Client`,
      pipelineId: PIPELINES.agency.id,
      stageId: PIPELINES.agency.stages.onboarding,
    });
  }
}

/**
 * Called when americurial.com contact form is submitted.
 */
export async function onAmericurialContactForm(params: {
  email: string;
  name: string;
  company?: string;
  message?: string;
}): Promise<void> {
  const nameParts = params.name.split(' ');
  const contactId = await syncContactToHubspot(params.email, {
    firstname: nameParts[0],
    lastname: nameParts.slice(1).join(' '),
    company: params.company,
    lead_source_cp: 'americurial_form',
  });

  if (contactId && PIPELINES.agency.id && PIPELINES.agency.stages.inquiry) {
    const existing = await findOpenDealForContact(contactId, PIPELINES.agency.id);
    if (!existing) {
      await createDealInHubspot({
        contactId,
        dealName: `${params.company || params.name} — Agency Inquiry`,
        pipelineId: PIPELINES.agency.id,
        stageId: PIPELINES.agency.stages.inquiry,
      });
    }
  }
}

// ─── Backlink contact discovery ──────────────────────────────────────────────

export interface HubspotContactSummary {
  hubspot_id: string;
  email: string;
  full_name: string | null;
  job_title: string | null;
  linkedin_url: string | null;
}

/**
 * Find existing HubSpot contacts whose email-domain matches the given site.
 *
 * Powers the backlink_contact_enrichment cron: if a prospect's domain has
 * already been touched by sales (e.g. an editor we emailed once via
 * Americurial), we surface that contact first instead of starting cold.
 * Falls back gracefully when no token is configured or no contacts match.
 *
 * Important: HubSpot's `email` property doesn't support "ends with" — we
 * use CONTAINS_TOKEN with "@domain.com" which matches the email-domain part.
 */
export async function findContactsByDomain(
  domain: string,
  limit = 10,
): Promise<HubspotContactSummary[]> {
  if (!HUBSPOT_TOKEN) return [];
  const clean = domain.toLowerCase().replace(/^www\./, "");
  try {
    const result = await hsApi("POST", "/crm/v3/objects/contacts/search", {
      filterGroups: [{
        filters: [{ propertyName: "email", operator: "CONTAINS_TOKEN", value: `@${clean}` }],
      }],
      properties: ["email", "firstname", "lastname", "jobtitle", "linkedinbio", "hs_linkedin_url"],
      limit,
    });
    const rows = (result.results as Array<{ id: string; properties: Record<string, string | null> }>) || [];
    return rows
      .filter(r => {
        const email = r.properties.email?.toLowerCase();
        return email && email.endsWith(`@${clean}`);
      })
      .map(r => {
        const first = r.properties.firstname || "";
        const last = r.properties.lastname || "";
        const full = `${first} ${last}`.trim();
        return {
          hubspot_id: r.id,
          email: (r.properties.email || "").toLowerCase(),
          full_name: full || null,
          job_title: r.properties.jobtitle || null,
          linkedin_url: r.properties.hs_linkedin_url || r.properties.linkedinbio || null,
        };
      });
  } catch (err) {
    console.warn(`[HubSpot] findContactsByDomain(${clean}) failed:`, (err as Error).message);
    return [];
  }
}

export type BacklinkContactRole = "marketing" | "seo" | "editor" | "pr" | "unknown";

/** Map a HubSpot job-title string onto our backlink_contacts.role enum.
 *
 * For contractor_profile outreach we want marketing / SEO leads (they
 * own the website + brand mentions). For editorial / press sites we
 * still want editor + pr. The drafter's contact-priority list changes
 * based on pitch_angle.
 */
export function roleFromJobTitle(title: string | null): BacklinkContactRole {
  if (!title) return "unknown";
  const t = title.toLowerCase();
  // SEO check first — many SEOs have "marketing" in the title too
  // (e.g. "Marketing Manager - SEO") and the SEO label is more specific.
  if (/\bseo\b|search engine|link build|organic growth|growth marketing/.test(t)) return "seo";
  // Marketing — VP/Director/Head/Manager of Marketing, Brand, Demand Gen,
  // Content. Most likely owners of "where backlinks live on our site".
  if (/marketing|brand|demand gen|\bcmo\b|growth\b|content/.test(t)) return "marketing";
  if (/editor|editorial|writer|journalist|reporter|contributor/.test(t)) return "editor";
  if (/press|public relations|\bpr\b|spokes/.test(t)) return "pr";
  // "Communications" usually = corporate comms which is closer to PR.
  if (/communications?\b|comms\b/.test(t)) return "pr";
  return "unknown";
}
