/**
 * Outreach Sequence Preset Library (R3-M5.3)
 *
 * Ready-to-use cold-outreach sequence templates an admin can clone into a new
 * campaign from the M3.2 step builder. Each preset is a self-contained recipe:
 * channel mix, total length, and ordered steps with delay/subject/body.
 *
 * Merge tags follow the same {{tag}} convention used by email-custom-template.ts
 * (renderMergeTags). Supported tags:
 *   {{contact_first_name}}, {{contact_last_name}}, {{contact_title}},
 *   {{contact_agency}}, {{contact_company}}, {{opportunity_title}},
 *   {{opportunity_naics}}, {{opportunity_deadline}}, {{sender_first_name}},
 *   {{sender_company}}, {{sender_capability_url}}, {{sender_calendar_url}}
 *
 * Voice: HUMANIZER.md rules — contractions, federal-contractor-fluent,
 * specific numbers over fluff, no buzzwords ("synergy", "leverage", "best-in-class"),
 * direct asks.
 */

export type OutreachChannel = "email" | "sms" | "mixed";

export interface OutreachPresetStep {
    /** 1-indexed order in the sequence */
    order: number;
    /** Channel for this specific step */
    channel: "email" | "sms";
    /**
     * Days to wait AFTER the previous step (or after enrollment if order === 1).
     * Step 1 typically uses delay: 0 (send immediately).
     */
    delay_days: number;
    /** Subject line — required for email, omitted for sms */
    subject?: string;
    /** Body with {{merge_tags}}. Plain text. */
    body_template: string;
}

export interface OutreachSequencePreset {
    id: string;
    name: string;
    description: string;
    channel: OutreachChannel;
    use_case: string;
    industry: string;
    days_duration: number;
    steps: OutreachPresetStep[];
}

export const OUTREACH_SEQUENCE_PRESETS: OutreachSequencePreset[] = [
    // -------------------------------------------------------------------
    // 1. Federal Contracting Officer Intro — 5 steps, 15 days, email-only
    // -------------------------------------------------------------------
    {
        id: "federal_co_intro",
        name: "Federal contracting officer intro",
        description:
            "5-step, 15-day, email-only intro for COs at federal agencies. Soft intro → value prop → case study → ask → breakup.",
        channel: "email",
        use_case: "Cold outreach to federal contracting officers",
        industry: "Federal government / agency contracting offices",
        days_duration: 15,
        steps: [
            {
                order: 1,
                channel: "email",
                delay_days: 0,
                subject: "Quick question on {{contact_agency}} {{opportunity_naics}} work",
                body_template:
`Hi {{contact_first_name}},

I'm {{sender_first_name}} at {{sender_company}}. We work with small businesses chasing {{opportunity_naics}} work at agencies like {{contact_agency}}, and I noticed you're the CO on a few of those.

I'm not pitching anything today — just wondering if it's worth a short intro so you have us on file the next time a sources sought goes out in this space.

If yes, I'll send a one-pager and stay out of your inbox otherwise.

Thanks for your time,
{{sender_first_name}}`,
            },
            {
                order: 2,
                channel: "email",
                delay_days: 3,
                subject: "Re: {{contact_agency}} {{opportunity_naics}} work",
                body_template:
`{{contact_first_name}},

Following up on my note from earlier this week. Quick context on why I reached out:

We help small businesses respond to sources sought and presolicitations in the {{opportunity_naics}} space. Most of our clients hadn't sold to the federal government before working with us.

If your team is fielding RFIs that small businesses keep no-bidding, we usually know why — happy to share what we're seeing.

Worth a 15-minute call?

{{sender_first_name}}`,
            },
            {
                order: 3,
                channel: "email",
                delay_days: 4,
                subject: "How a 4-person team won a {{opportunity_naics}} BPA at {{contact_agency}}",
                body_template:
`Hi {{contact_first_name}},

Sharing a quick case study in case it's useful for your shop:

A 4-person small business we coached responded to a {{opportunity_naics}} sources sought from a sister agency last fall. They had no prior federal awards. Six months later they're the prime on a $1.4M BPA.

Two things made the difference:
- A capability statement that actually addressed the CO's stated objectives
- A teaming arrangement with an 8(a) firm before the solicitation dropped

I'm happy to send the redacted version if you'd like to see what "good" looks like — sometimes it's helpful when you're evaluating who responds to your own RFIs.

{{sender_first_name}}`,
            },
            {
                order: 4,
                channel: "email",
                delay_days: 4,
                subject: "Worth 15 minutes?",
                body_template:
`{{contact_first_name}},

Last note from me on this thread.

Two things I can offer if you ever want them:
1. A short list of small businesses ready to respond to {{opportunity_naics}} sources sought at {{contact_agency}} (I curate this anyway)
2. A 15-minute call to walk through what we're hearing from the small business side of the market

Either is fine. Calendar's here if you want to grab a slot: {{sender_calendar_url}}

Thanks for reading this far,
{{sender_first_name}}`,
            },
            {
                order: 5,
                channel: "email",
                delay_days: 4,
                subject: "Closing the loop",
                body_template:
`{{contact_first_name}},

Closing this thread so I'm not cluttering your inbox.

If something in the {{opportunity_naics}} space comes up where talking to a small business advisor would help, my contact info's below. No follow-up from me after this.

Wishing you a smooth FY end,
{{sender_first_name}}
{{sender_company}}
{{sender_capability_url}}`,
            },
        ],
    },

    // -------------------------------------------------------------------
    // 2. Prime Contractor Partner Outreach — 4 steps, 10 days, email + SMS
    // -------------------------------------------------------------------
    {
        id: "prime_partner_teaming",
        name: "Prime contractor partner outreach",
        description:
            "4-step, 10-day, email + SMS outreach to primes about teaming on a specific opportunity. Email intro → SMS nudge → email with past-perf → close.",
        channel: "mixed",
        use_case: "Teaming partnership pitch to a large prime on a specific opportunity",
        industry: "Federal prime contractors (small-business liaison officers)",
        days_duration: 10,
        steps: [
            {
                order: 1,
                channel: "email",
                delay_days: 0,
                subject: "Teaming on {{opportunity_title}}?",
                body_template:
`Hi {{contact_first_name}},

I'm {{sender_first_name}} at {{sender_company}}. We're a small business with a relevant past-performance record on {{opportunity_naics}}, and we're putting together a response to {{opportunity_title}} (closes {{opportunity_deadline}}).

We'd like to team with {{contact_company}} on this one, either as a sub on your bid or with you as a sub on ours, whichever makes more sense given your pursuit posture.

Are you the right person to talk to about this opportunity, or should I reach someone else on the SBLO team?

Thanks,
{{sender_first_name}}`,
            },
            {
                order: 2,
                channel: "sms",
                delay_days: 2,
                body_template:
`Hi {{contact_first_name}}, {{sender_first_name}} from {{sender_company}} — sent you an email Monday about teaming on {{opportunity_title}} (closes {{opportunity_deadline}}). Worth a quick call this week?`,
            },
            {
                order: 3,
                channel: "email",
                delay_days: 4,
                subject: "Past-perf doc + structure proposal — {{opportunity_title}}",
                body_template:
`{{contact_first_name}},

Following up. Attaching (or linking, depending on what works): our capability statement and a one-page past-performance summary for {{opportunity_naics}} work.

{{sender_capability_url}}

A few options on how this could work:
- We sub to you, 25-40% scope, NAICS small-business credit goes to your team
- You sub to us, we prime, you take the technical lead — works well if our size standard fits the set-aside
- Joint mentor-protégé structure if we're not already in the MPP database

Happy to talk through any of these. 15 minutes this week?

{{sender_first_name}}`,
            },
            {
                order: 4,
                channel: "email",
                delay_days: 4,
                subject: "Last note on {{opportunity_title}}",
                body_template:
`Hi {{contact_first_name}},

Closing the loop before {{opportunity_deadline}}.

If teaming on this one isn't a fit, no worries — we'll move on the response solo. Would still appreciate knowing whether {{contact_company}} pursues opportunities like this so we can flag the right ones to you proactively.

A two-line reply ("yes, send these" / "not our space") is all I need.

{{sender_first_name}}
{{sender_company}}`,
            },
        ],
    },

    // -------------------------------------------------------------------
    // 3. SMB Recompete Alert — 3 steps, 7 days, email-only
    // -------------------------------------------------------------------
    {
        id: "smb_recompete_alert",
        name: "SMB recompete alert",
        description:
            "3-step, 7-day, email-only outreach to incumbents whose contract is expiring soon. Heads-up → strategy offer → partnership pitch.",
        channel: "email",
        use_case: "Reach incumbents whose contract is up for recompete in the next 12 months",
        industry: "Small-business federal contractors with expiring awards",
        days_duration: 7,
        steps: [
            {
                order: 1,
                channel: "email",
                delay_days: 0,
                subject: "Heads up on your {{contact_agency}} recompete",
                body_template:
`Hi {{contact_first_name}},

I'm {{sender_first_name}} at {{sender_company}}. We track recompete windows for small-business contractors, and your {{contact_agency}} contract under NAICS {{opportunity_naics}} is showing a recompete window opening in the next 6-12 months.

Two questions, if you've got 30 seconds:
1. Are you planning to bid again?
2. Have you heard anything from the CO about set-aside changes or scope shifts on the recompete?

I ask because we've watched several incumbents lose recompetes they assumed were locked. Usually traces back to one of three things — happy to share what we see.

{{sender_first_name}}`,
            },
            {
                order: 2,
                channel: "email",
                delay_days: 3,
                subject: "The 3 things that sink recompete incumbents",
                body_template:
`{{contact_first_name}},

Quick follow-up. The three things we see kill incumbent recompetes:

1. Set-aside change — agency moves from full-and-open to 8(a) or SDVOSB, incumbent isn't certified
2. Scope expansion — new requirements added that the incumbent didn't bid on originally, opening the door for a multi-discipline competitor
3. Past-performance gap — incumbent has CPARS ratings but didn't document the wins narratively in a way that survives a new source-selection team

If any of those are showing up in your recompete, an outside read on the draft RFP usually catches them in time.

15 minutes to compare notes?

{{sender_first_name}}`,
            },
            {
                order: 3,
                channel: "email",
                delay_days: 4,
                subject: "Partner on the recompete?",
                body_template:
`Hi {{contact_first_name}},

Last note from me. Two ways we could help if your recompete looks competitive:

- A draft-RFP read with set-aside, eval-criteria, and scope-shift analysis (we do these in 5-7 business days)
- A teaming arrangement if a sub partner would round out your past performance for the new scope

If neither makes sense, no problem — best of luck with the recompete either way.

Calendar's here if you want to grab 15 min: {{sender_calendar_url}}

{{sender_first_name}}
{{sender_company}}`,
            },
        ],
    },

    // -------------------------------------------------------------------
    // 4. Re-engage cold leads — 4 steps, 14 days, email-only
    // -------------------------------------------------------------------
    {
        id: "reengage_cold_leads",
        name: "Re-engage cold leads",
        description:
            "4-step, 14-day, email-only sequence to wake up leads dormant 90+ days. Friendly check-in → value-add resource → case study → soft CTA.",
        channel: "email",
        use_case: "Warm leads that went silent 90+ days ago",
        industry: "Lapsed small-business federal contractor leads",
        days_duration: 14,
        steps: [
            {
                order: 1,
                channel: "email",
                delay_days: 0,
                subject: "Still chasing {{opportunity_naics}} work?",
                body_template:
`Hi {{contact_first_name}},

It's been a few months since we last talked. No agenda — just checking in.

Last time you mentioned you were looking at {{opportunity_naics}} opportunities. Did anything land, or are you still circling that space?

If it's still on your list, I've got a few new things I could send your way. If you've pivoted, I'd like to update my notes so I'm not pinging you about the wrong stuff.

{{sender_first_name}}`,
            },
            {
                order: 2,
                channel: "email",
                delay_days: 4,
                subject: "FY26 budget shifts in {{opportunity_naics}}",
                body_template:
`{{contact_first_name}},

Came across something I think you'd find useful.

We pulled FY26 obligation data for {{opportunity_naics}} across the top 10 buying agencies. A few takeaways:

- Two agencies cut spend 15%+ year-over-year (worth deprioritizing)
- One agency posted 3x more sources sought than FY25 in this NAICS (worth getting in front of)
- Average award size dropped 22% — set-asides are fragmenting into smaller pieces

Happy to send the full breakdown if you want it. No call required — just a PDF.

{{sender_first_name}}`,
            },
            {
                order: 3,
                channel: "email",
                delay_days: 5,
                subject: "How a similar company won 3 awards in 9 months",
                body_template:
`Hi {{contact_first_name}},

One more thing in case it's relevant.

A client of ours in {{opportunity_naics}} went from zero federal awards to three (totaling $2.1M) in nine months. Their playbook wasn't complicated:

1. Stopped responding to solicitations cold — only bid where they'd talked to the CO during sources sought
2. Built one teaming relationship with an 8(a) prime instead of trying to prime everything themselves
3. Reused their first proposal as a template — cut writing time on bids 2 and 3 by ~60%

If you want to talk through how that maps to your shop, I've got time on the calendar this week.

{{sender_first_name}}`,
            },
            {
                order: 4,
                channel: "email",
                delay_days: 5,
                subject: "Anything I can help with?",
                body_template:
`{{contact_first_name}},

Wrapping up this thread.

If anything from the last couple of emails was useful, reply and I'll send more. If federal isn't a priority right now, that's a fine answer too — I'll back off and circle back in a few months.

Either way, glad we crossed paths.

{{sender_first_name}}
{{sender_company}}
{{sender_capability_url}}`,
            },
        ],
    },

    // -------------------------------------------------------------------
    // 5. Demo-request follow-up — 3 steps, 5 days, email + SMS
    // -------------------------------------------------------------------
    {
        id: "demo_request_followup",
        name: "Demo-request follow-up",
        description:
            "3-step, 5-day, email + SMS sequence for inbound demo requests that ghosted. Reminder → value bump → breakup.",
        channel: "mixed",
        use_case: "Inbound demo requests that didn't show up or didn't book",
        industry: "Inbound SaaS / consulting demo pipeline",
        days_duration: 5,
        steps: [
            {
                order: 1,
                channel: "email",
                delay_days: 0,
                subject: "Still want that {{sender_company}} demo?",
                body_template:
`Hi {{contact_first_name}},

You signed up for a demo of {{sender_company}} but didn't pick a time yet. Totally fine — I know calendars move.

Grab 20 minutes here whenever it works: {{sender_calendar_url}}

I'll walk through how we'd find the next 5-10 opportunities for {{contact_company}} on day one — no slide deck, just your actual NAICS in the tool.

{{sender_first_name}}`,
            },
            {
                order: 2,
                channel: "sms",
                delay_days: 2,
                body_template:
`Hi {{contact_first_name}}, {{sender_first_name}} from {{sender_company}}. Saw you signed up for a demo — want me to send a 3-min recorded walkthrough instead of a live call? Just reply YES.`,
            },
            {
                order: 3,
                channel: "email",
                delay_days: 3,
                subject: "Closing your demo request",
                body_template:
`{{contact_first_name}},

Closing your demo request unless I hear otherwise.

If something changed and federal work isn't on your roadmap, no problem — happy to drop you from the list.

If you still want to see it, this link stays live: {{sender_calendar_url}}

Either way, thanks for the interest.

{{sender_first_name}}
{{sender_company}}`,
            },
        ],
    },
];

/**
 * Look up a preset by id. Returns null if not found so callers can fall back.
 */
export function getOutreachPreset(id: string): OutreachSequencePreset | null {
    return OUTREACH_SEQUENCE_PRESETS.find((p) => p.id === id) ?? null;
}

/**
 * Clone a preset's steps into the shape the M3.2 step builder expects when
 * saving a new campaign. Strips the preset metadata and returns just the
 * ordered step recipes so the caller can attach campaign_id / created_at /
 * etc. before insert.
 */
export function clonePresetSteps(id: string): OutreachPresetStep[] {
    const preset = getOutreachPreset(id);
    if (!preset) return [];
    // Deep-copy so consumers can mutate freely without polluting the source array
    return preset.steps.map((s) => ({ ...s }));
}

/**
 * Light-weight summary list for the picker UI — keeps the modal payload small
 * and avoids shipping every body_template until the user clicks "Preview".
 */
export function listPresetSummaries(): Array<
    Pick<
        OutreachSequencePreset,
        "id" | "name" | "description" | "channel" | "days_duration" | "use_case"
    > & { step_count: number }
> {
    return OUTREACH_SEQUENCE_PRESETS.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        channel: p.channel,
        days_duration: p.days_duration,
        use_case: p.use_case,
        step_count: p.steps.length,
    }));
}
