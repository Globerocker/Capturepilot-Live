#!/usr/bin/env node
/**
 * Seed the "B" variant (subject_b + body_b) for every outreach_templates row,
 * for 50/50 A/B split-testing. Each B tests a genuinely different hook than the
 * A version — not a reworded clone — so the test measures something real.
 *
 * Matched by template `name` so it's safe to re-run across environments.
 * The first UPDATE fires the snapshot trigger (migration 170), so version 1 in
 * outreach_template_versions becomes the pristine pre-B copy.
 *
 * Run:  node --env-file=.env.local tools/49_seed_template_b_variants.mjs
 *       node --env-file=.env.local tools/49_seed_template_b_variants.mjs --dry
 *
 * Voice: HUMANIZER.md — contractions, specifics, no buzzwords. Sergio-signed.
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(__dirname, "..", "dashboard", "package.json"));
const { createClient } = require("@supabase/supabase-js");

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;
if (!URL || !KEY) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_KEY. Use: node --env-file=.env.local tools/49_seed_template_b_variants.mjs");
    process.exit(1);
}
const sb = createClient(URL, KEY, { auth: { persistSession: false } });
const DRY = process.argv.includes("--dry");

// name → { subject_b?, body_b }. subject_b omitted for SMS (no subject).
const B = {
    "Fresh SAM Registration — Free Profile Review": {
        subject_b: "{{company}}'s first 60 days in SAM",
        body_b: `Hi {{first_name}},

Most firms that register on SAM.gov never win a thing. Not because they can't do the work — because their profile is set up so no contracting officer ever finds them.

That's fixable, and it takes about 15 minutes. I'll look at {{company}}'s NAICS, size standard, and capability statement and tell you exactly what's costing you visibility.

Free, no pitch. Want me to run through it?

Sergio
Partner, Americurial

{{unsubscribe_url}}`,
    },
    "Dormant Past-Performer — Commission Pitch": {
        subject_b: "Your federal past performance is just sitting there",
        body_b: `Hi {{first_name}},

You won federal work before. Past performance is the hardest thing to earn in this game, and right now {{company}}'s is sitting idle while newer firms with weaker records keep bidding.

We'd put it back to work. We run the pipeline — find the solicitations, prep the bids — and you only pay when you win. No retainer, 10-15% of awarded value.

Worth a quick call to see what's open in your lane?

Sergio
Partner, Americurial

{{unsubscribe_url}}`,
    },
    "Dormant · Email 1 — Icebreaker + offer": {
        subject_b: "Re-opening {{company}}'s federal pipeline",
        body_b: `Hi {{first_name}},

The contracts {{company}} used to win don't disappear — they come back up for recompete every few years. Firms that show up for those have a real edge, and right now you're not in the room.

We watch the recompetes and sources-sought in your NAICS and bring you the ones that fit, with the bid most of the way done. You pay only when you win.

Can I send you two or three that are open now?

Sergio
Partner, Americurial
{{unsubscribe_url}}`,
    },
    "Dormant · Email 2 — Why you, follow-up": {
        subject_b: "Why firms with past awards win again",
        body_b: `Hi {{first_name}},

Quick one. The data's pretty clear: a firm that's already delivered for an agency wins its next bid at a much higher rate than a first-timer. Lower risk for the buyer, so you start ahead.

{{company}} already cleared that bar. The missing piece is consistent bidding, and that's the part we handle. No cost unless you win.

Want me to pull a couple that fit you right now?

Sergio
Partner, Americurial
{{unsubscribe_url}}`,
    },
    "Dormant · Email 3 — Break-up": {
        subject_b: "Last one from me",
        body_b: `Hi {{first_name}},

I'll leave it here so I'm not crowding your inbox. If getting {{company}} back into federal work lands on the list this year, the offer's open — we bid for you, you pay only when you win.

Wrong time? Just reply "later" and I'll check back down the road.

Sergio
Partner, Americurial
{{unsubscribe_url}}`,
    },
    "Fresh SAM · Email 1 — Icebreaker + free review": {
        subject_b: "Congrats on the SAM registration, {{first_name}}",
        body_b: `Hi {{first_name}},

Welcome to federal contracting — getting active in SAM out of {{state}} is the step most people stall on, so that's real.

Here's what nobody tells you: your NAICS codes and size standard decide whether you even show up when a contracting officer searches. Get them wrong and you're invisible no matter how good you are.

I'll do a free 15-minute pass on your setup and flag the two or three things to fix first. No pitch — we just see this every day.

Want me to look?

Sergio
Partner, Americurial
{{unsubscribe_url}}`,
    },
    "Fresh SAM · Email 2 — NAICS gap follow-up": {
        subject_b: "The NAICS code {{company}} probably missed",
        body_b: `Hi {{first_name}},

Following up. The most common thing I see with new registrations: two or three NAICS codes picked, and the one where the real money is for their kind of work left off. Sometimes a set-aside they qualify for and never claimed.

That's exactly what the free review catches. Fifteen minutes, no slides — just your profile and where the work actually is in {{state}}.

Open to it?

Sergio
Partner, Americurial
{{unsubscribe_url}}`,
    },
    "Fresh SAM · Email 3 — Break-up": {
        subject_b: "I'll stop here",
        body_b: `Hi {{first_name}},

Last one. If you ever want a second set of eyes on {{company}}'s federal setup before you start chasing work, the free review's open — just reply.

Either way, good luck. It's a slow game but the work is real and steady once you're in.

Sergio
Partner, Americurial
{{unsubscribe_url}}`,
    },
    "Backlink · Email 1 — Your listing is live": {
        subject_b: "{{company}} is on our contractor directory",
        body_b: `Hi {{first_name}},

We keep a directory of federal contractors and {{company}} now has a page: {{listing_url}}. It pulls your NAICS, certs, and registration so primes and buyers looking for a teammate can find you.

It's live and free, nothing needed from you. If it's useful, a link back from your site helps both pages rank — and sends more buyers your way, not just ours.

Want me to tweak anything on it first?

Sergio
Partner, Americurial
{{unsubscribe_url}}`,
    },
    "Backlink · Email 2 — Snippet follow-up": {
        subject_b: "Two-minute favor on the {{company}} listing",
        body_b: `Hi {{first_name}},

Circling back on {{company}}'s directory page: {{listing_url}}.

If you're up for linking back, a footer link or a line on your partners page is plenty. I'll send the exact snippet so whoever runs your site can drop it in without thinking about it.

Not interested? No problem at all — say the word and I'll leave the page as-is.

Sergio
Partner, Americurial
{{unsubscribe_url}}`,
    },
    "Quick Checker · Email 1 — We reran your check": {
        subject_b: "3 new federal matches for {{company}} this week",
        body_b: `Hi {{first_name}},

You ran {{company}} through our Quick Checker a while back. I re-ran it against this week's solicitations and three solid fits came up:

1. {{match_1}}
2. {{match_2}}
3. {{match_3}}

These move fast once the deadline's close. Want the full list with dates and links? Two minutes for me to send.

Sergio
Partner, Americurial
{{unsubscribe_url}}`,
    },
    "Janitorial/Facilities · Email 1": {
        subject_b: "{{company}} + recurring federal facilities contracts",
        body_b: `Hi {{first_name}},

Federal facilities and janitorial work is some of the steadiest money in government contracting — agencies rebuy it on a cycle, and they favor firms already in SAM with the right NAICS (561720 and its neighbors).

If {{company}} is registered, the hard part's done. We find the open solicitations in {{state}}, handle the bid paperwork, and you pay only when you win.

Want the current ones?

Sergio
Partner, Americurial
{{unsubscribe_url}}`,
    },
    "Construction/Trades · Email 1": {
        subject_b: "The federal construction work most builders never see",
        body_b: `Hi {{first_name}},

Most of the federal construction money runs through set-asides and IDIQ vehicles that small builders never get visibility into. If {{company}} is in SAM, you've already cleared the part that stops most firms.

We find the right solicitations, run the bid paperwork, and you only pay when you win. No retainer.

Want to see what's open in your area?

Sergio
Partner, Americurial
{{unsubscribe_url}}`,
    },
    "IT/Pro Services · Email 1": {
        subject_b: "{{company}} and the federal IT spend",
        body_b: `Hi {{first_name}},

The government spends a fortune on IT and professional services, and a big chunk is reserved for small businesses. The catch is timing — you have to be in front of the contracting officer when the requirement drops, not after.

That's what we do for firms like {{company}}: watch the right NAICS, bring you the fits, prep the bid. No retainer, commission on wins.

Want a couple of live examples?

Sergio
Partner, Americurial
{{unsubscribe_url}}`,
    },
    "Expiring SAM · Email 1 — Renew before you lapse": {
        subject_b: "{{company}} drops off SAM in a few weeks",
        body_b: `Hi {{first_name}},

Heads up — {{company}}'s SAM.gov registration is coming up on renewal. If it lapses, you vanish from every contracting officer's search and can't be awarded anything until it's active again. That gap costs people real bids.

Renewing is free, but the paperwork trips firms up every year. I'll walk you through it in 15 minutes so you keep your place in line.

Want a hand?

Sergio
Partner, Americurial
{{unsubscribe_url}}`,
    },
    "Teaming · Email 1 — Subcontract with a prime": {
        subject_b: "A faster way into federal work for {{company}}",
        body_b: `Hi {{first_name}},

Most small firms get their first federal past performance not as a prime, but by subcontracting to one who already holds the contract. Faster, lower-risk door in.

We track which primes are winning in your NAICS and which ones need small-business teammates to hit their subcontracting goals. For {{company}}, that's a shortcut worth taking.

Want a couple of primes worth approaching?

Sergio
Partner, Americurial
{{unsubscribe_url}}`,
    },
    "8(a) · Email 1 — Sole-source advantage": {
        subject_b: "$4.5M without a competition — if {{company}} is 8(a)",
        body_b: `Hi {{first_name}},

An 8(a) certification is one of the strongest advantages in federal contracting: agencies can hand you a sole-source award up to $4.5M with no open competition. Most contractors would kill for that.

The catch is the agency has to know you exist and trust you'll deliver. That's where we come in — getting {{company}} in front of the right contracting officers with a clean capability statement.

Worth 15 minutes to map your best agencies?

Sergio
Partner, Americurial
{{unsubscribe_url}}`,
    },
    // ── SMS (body_b only) ──
    "Fresh SAM · SMS 1": {
        body_b: `Hi {{first_name}}, Sergio here. Saw {{company}} went active in SAM — congrats. Free 15-min review so your profile actually shows up in searches. Want it? Reply STOP to opt out.`,
    },
    "Fresh SAM · SMS 2": {
        body_b: `{{first_name}}, quick one — most newly-registered firms are missing a NAICS code or set-aside they qualify for. Want a free check on {{company}}? Reply STOP to opt out.`,
    },
    "Fresh SAM · SMS 3 — Break-up": {
        body_b: `No worries if you're all set, {{first_name}}. The free review on {{company}}'s SAM profile is here whenever you want it. Reply STOP to opt out.`,
    },
    "Dormant · SMS 1": {
        body_b: `{{first_name}}, Sergio from Americurial. We can run {{company}}'s federal bids on commission — you only pay if you win. Worth a quick call? Reply STOP to opt out.`,
    },
    "Dormant · SMS 2": {
        body_b: `{{first_name}}, want me to pull a couple of open solicitations that fit {{company}} so you can see what bidding with us looks like? Reply STOP to opt out.`,
    },
    "Dormant · SMS 3 — Break-up": {
        body_b: `All good if the timing's off, {{first_name}}. Door's open whenever you want back in the federal pipeline — just reply. Reply STOP to opt out.`,
    },
    "Backlink · SMS 1": {
        body_b: `{{first_name}}, Sergio here. {{company}} has a free page on our contractor directory: {{listing_url}}. A quick link back helps it rank — want the snippet? Reply STOP to opt out.`,
    },
    "Generic · SMS — soft intro": {
        body_b: `Hi {{first_name}}, Sergio from Americurial. We help firms like {{company}} win federal contracts and only get paid when you do. Open to a quick look at what fits? Reply STOP to opt out.`,
    },
    "Re-engage · SMS — soft check-in": {
        body_b: `{{first_name}}, Sergio here — still want me to take a look at what federal work fits {{company}}? Happy to send a couple. Reply STOP to opt out.`,
    },
};

let updated = 0, missing = 0;
for (const [name, v] of Object.entries(B)) {
    const patch = { body_b: v.body_b };
    if (v.subject_b) patch.subject_b = v.subject_b;
    if (DRY) { console.log(`DRY  ${name}`); updated++; continue; }
    const { data, error } = await sb
        .from("outreach_templates")
        .update(patch)
        .eq("name", name)
        .select("id");
    if (error) { console.error(`ERR  ${name}: ${error.message}`); continue; }
    if (!data?.length) { console.warn(`MISS ${name} (no row)`); missing++; continue; }
    console.log(`OK   ${name}`);
    updated++;
}
console.log(`\n${DRY ? "[dry] " : ""}${updated} updated, ${missing} not found`);
