import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

/**
 * HubSpot Inbound Webhook Handler
 * POST /api/hubspot/webhook
 *
 * Handles events pushed from HubSpot to CapturePilot:
 *  - contact.creation       → sync to Supabase if from Quick Checker
 *  - contact.propertyChange → mirror suppression + lifecycle stage back to
 *                             outreach_optouts + user_profiles.notes
 *  - deal.propertyChange    → update pipeline stage in our DB
 *  - meeting.created        → log in client_activity_log
 *
 * Setup in HubSpot:
 *   Settings → Integrations → Webhooks → Create subscription
 *   URL: https://app.capturepilot.com/api/hubspot/webhook
 *   Events: contact.creation, contact.propertyChange (hs_email_hard_bounced,
 *           unsubscribed_from_all_email, lifecyclestage),
 *           deal.propertyChange, meeting.created
 */

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
  );
}

/** Verify HubSpot webhook signature (v3).
 *
 * Fail-closed in production: when `HUBSPOT_WEBHOOK_SECRET` is unset we hard-fail
 * (returns false → 401) so a missing env var can't silently turn the webhook
 * into an open ingest endpoint. In dev (NODE_ENV !== 'production') an unset
 * secret is allowed so local curl tests don't need the production HMAC.
 *
 * Buffer length-guard before `timingSafeEqual` — Node throws if the two
 * buffers differ in length, which would convert a benign signature mismatch
 * into an unhandled 500. */
function verifyHubSpotSignature(req: NextRequest, rawBody: string): boolean {
  const secret = process.env.HUBSPOT_WEBHOOK_SECRET;
  if (!secret) {
    // Dev-only bypass — never trust an unset secret in prod.
    return process.env.NODE_ENV !== 'production';
  }

  const signature = req.headers.get('x-hubspot-signature-v3') ||
                    req.headers.get('x-hubspot-signature');
  if (!signature) return false;

  const timestamp = req.headers.get('x-hubspot-request-timestamp') || '';
  const method = 'POST';
  const uri = req.url;

  // v3 signature: HMAC-SHA256 of "METHOD+URI+BODY+TIMESTAMP"
  const toSign = `${method}${uri}${rawBody}${timestamp}`;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(toSign)
    .digest('base64');

  const rawSigBuf = Buffer.from(signature);
  const expectedSigBuf = Buffer.from(expected);
  // timingSafeEqual throws on length mismatch — treat that as "no match".
  if (rawSigBuf.length !== expectedSigBuf.length) return false;
  return crypto.timingSafeEqual(rawSigBuf, expectedSigBuf);
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  // Signature verification — fail-closed in prod (handled inside helper).
  if (!verifyHubSpotSignature(req, rawBody)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let events: Array<Record<string, unknown>>;
  try {
    const parsed = JSON.parse(rawBody);
    // HubSpot sends either an array or a single object
    events = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const db = getDb();
  const results = [];

  for (const event of events) {
    const eventType = (event.subscriptionType || event.eventType || event.type) as string;
    const objectId = event.objectId as string | undefined;

    try {
      switch (eventType) {
        case 'contact.creation':
          results.push(await handleContactCreation(db, event));
          break;

        case 'contact.propertyChange':
          results.push(await handleContactPropertyChange(db, event));
          break;

        case 'deal.propertyChange':
          results.push(await handleDealPropertyChange(db, event));
          break;

        case 'meeting.created':
          results.push(await handleMeetingCreated(db, event));
          break;

        default:
          // Log unknown events for debugging
          console.log(`[HubSpot Webhook] Unknown event type: ${eventType}`, {
            objectId,
            eventType,
          });
          results.push({ event: eventType, status: 'ignored' });
      }
    } catch (err) {
      console.error(`[HubSpot Webhook] Error handling ${eventType}:`, err);
      results.push({ event: eventType, status: 'error', error: (err as Error).message });
    }
  }

  return NextResponse.json({ received: true, processed: results.length, results });
}

// ─── Event Handlers ───────────────────────────────────────────────────────────

async function handleContactCreation(
  db: ReturnType<typeof getDb>,
  event: Record<string, unknown>,
) {
  const contactId = event.objectId as string;
  const propertyName = event.propertyName as string | undefined;
  const propertyValue = event.propertyValue as string | undefined;

  // If this contact came from Quick Checker (lead_source_cp = quick_checker),
  // we may want to log it in our system
  if (propertyName === 'lead_source_cp' && propertyValue === 'quick_checker') {
    await db.from('client_activity_log').insert({
      action: 'hubspot_contact_created',
      description: `HubSpot contact created via Quick Checker (HS contact ID: ${contactId})`,
      metadata: { hubspot_contact_id: contactId, event_type: 'contact.creation' },
    });
  }

  return { event: 'contact.creation', contactId, status: 'processed' };
}

/**
 * HubSpot contact.propertyChange — mirror three flag changes back into
 * CapturePilot so outbound campaigns and per-lifecycle features stay in sync
 * when a sales rep edits a contact directly in HubSpot:
 *
 *   - hs_email_hard_bounced=true       → outreach_optouts (hubspot:hard_bounce)
 *   - unsubscribed_from_all_email=true → outreach_optouts (hubspot:unsubscribed)
 *   - lifecyclestage=<stage>           → user_profiles.notes.lifecycle_stage
 *
 * Email lookup against HubSpot is best-effort. If the API call fails (token
 * expired, contact archived, etc.) we log + return `skipped` rather than 500
 * — losing one mirror beat is fine because the next bounce/unsubscribe webhook
 * will retry.
 */
async function handleContactPropertyChange(
  db: ReturnType<typeof getDb>,
  event: Record<string, unknown>,
) {
  const contactId = event.objectId as string;
  const propertyName = event.propertyName as string | undefined;
  const propertyValue = event.propertyValue as string | undefined;

  // Only three properties matter for now. Anything else returns ignored so
  // HubSpot can keep firing the whole property-change subscription without us
  // logging noise for every dealstage/firstname/lastname edit that flies past.
  const HANDLED = new Set([
    'hs_email_hard_bounced',
    'unsubscribed_from_all_email',
    'lifecyclestage',
  ]);
  if (!propertyName || !HANDLED.has(propertyName)) {
    return { event: 'contact.propertyChange', contactId, property: propertyName, status: 'ignored' };
  }

  // Look up the contact's email — required for outreach_optouts (suppression
  // is keyed by email) and useful for user_profiles match (we don't store
  // hubspot_contact_id on user_profiles, only email).
  let email: string | null = null;
  try {
    const { getContactById } = await import('@/lib/hubspot');
    const props = await getContactById(contactId, ['email', 'lifecyclestage']);
    email = (props?.email || '').trim().toLowerCase() || null;
  } catch (err) {
    console.error('[HubSpot Webhook] getContactById failed:', (err as Error).message);
  }

  if (!email) {
    // No way to mirror without an email anchor — log and skip rather than 500.
    return {
      event: 'contact.propertyChange',
      contactId,
      property: propertyName,
      status: 'skipped',
      reason: 'no email on hubspot contact',
    };
  }

  // Suppression mirrors — only fire when the property flipped to a truthy
  // value (HubSpot sends `false`/empty when a rep un-checks the box).
  const isTrue = propertyValue === 'true' || propertyValue === 'TRUE';

  if (propertyName === 'hs_email_hard_bounced' && isTrue) {
    const { error } = await db
      .from('outreach_optouts')
      .upsert(
        { email, reason: 'hubspot:hard_bounce', source: 'hubspot_webhook' },
        { onConflict: 'email' },
      );
    if (error) console.error('[HubSpot Webhook] optout upsert (bounce) failed:', error.message);
    return { event: 'contact.propertyChange', contactId, property: propertyName, status: 'suppressed' };
  }

  if (propertyName === 'unsubscribed_from_all_email' && isTrue) {
    const { error } = await db
      .from('outreach_optouts')
      .upsert(
        { email, reason: 'hubspot:unsubscribed', source: 'hubspot_webhook' },
        { onConflict: 'email' },
      );
    if (error) console.error('[HubSpot Webhook] optout upsert (unsub) failed:', error.message);
    return { event: 'contact.propertyChange', contactId, property: propertyName, status: 'suppressed' };
  }

  if (propertyName === 'lifecyclestage' && propertyValue) {
    // `notes` is TEXT in Postgres but used as a JSON envelope across the app
    // (pipeline_stages, brand_tokens, quick_check, dashboard_layout, etc.).
    // Parse → mutate the lifecycle_stage key → stringify so we don't trample
    // any sibling keys that are already there.
    const { data: existing, error: readErr } = await db
      .from('user_profiles')
      .select('id, notes')
      .ilike('email', email)
      .limit(1)
      .maybeSingle();
    if (readErr) {
      console.error('[HubSpot Webhook] user_profiles lookup failed:', readErr.message);
      return { event: 'contact.propertyChange', contactId, property: propertyName, status: 'skipped' };
    }
    if (!existing) {
      return {
        event: 'contact.propertyChange',
        contactId,
        property: propertyName,
        status: 'skipped',
        reason: 'no user_profile for email',
      };
    }
    let notesObj: Record<string, unknown> = {};
    const rawNotes = (existing.notes as string | null) || '';
    if (rawNotes.trim().startsWith('{')) {
      try { notesObj = JSON.parse(rawNotes); } catch { notesObj = {}; }
    }
    notesObj.lifecycle_stage = propertyValue;
    const { error: updErr } = await db
      .from('user_profiles')
      .update({ notes: JSON.stringify(notesObj) })
      .eq('id', existing.id);
    if (updErr) console.error('[HubSpot Webhook] user_profiles update failed:', updErr.message);
    return { event: 'contact.propertyChange', contactId, property: propertyName, status: 'lifecycle_synced' };
  }

  return { event: 'contact.propertyChange', contactId, property: propertyName, status: 'ignored' };
}

async function handleDealPropertyChange(
  db: ReturnType<typeof getDb>,
  event: Record<string, unknown>,
) {
  const dealId = event.objectId as string;
  const propertyName = event.propertyName as string | undefined;
  const propertyValue = event.propertyValue as string | undefined;

  if (propertyName === 'dealstage') {
    // Log the stage change in our activity log
    await db.from('client_activity_log').insert({
      action: 'hubspot_stage_changed',
      description: `HubSpot deal ${dealId} moved to stage ${propertyValue}`,
      metadata: {
        hubspot_deal_id: dealId,
        new_stage: propertyValue,
        event_type: 'deal.propertyChange',
      },
    });
  }

  return { event: 'deal.propertyChange', dealId, property: propertyName, status: 'processed' };
}

async function handleMeetingCreated(
  db: ReturnType<typeof getDb>,
  event: Record<string, unknown>,
) {
  const meetingId = event.objectId as string;
  const associations = event.changeSource as string | undefined;

  await db.from('client_activity_log').insert({
    action: 'hubspot_meeting_booked',
    description: `Meeting booked via HubSpot (meeting ID: ${meetingId})`,
    metadata: {
      hubspot_meeting_id: meetingId,
      source: associations,
      event_type: 'meeting.created',
    },
  });

  return { event: 'meeting.created', meetingId, status: 'processed' };
}
