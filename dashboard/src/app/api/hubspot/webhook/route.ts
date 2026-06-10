import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

/**
 * HubSpot Inbound Webhook Handler
 * POST /api/hubspot/webhook
 *
 * Handles events pushed from HubSpot to CapturePilot:
 *  - contact.creation       → sync to Supabase if from Quick Checker
 *  - deal.propertyChange    → update pipeline stage in our DB
 *  - meeting.created        → log in client_activity_log
 *
 * Setup in HubSpot:
 *   Settings → Integrations → Webhooks → Create subscription
 *   URL: https://app.capturepilot.com/api/hubspot/webhook
 *   Events: contact.creation, deal.propertyChange, meeting.created
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
