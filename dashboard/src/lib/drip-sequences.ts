/**
 * Drip sequence definitions — scheduled educational email series.
 *
 * Each sequence is enrolled via enqueueDripSequence() after a triggering event
 * (signup, onboarding, Facebook lead intake). The process_scheduled_emails
 * cron picks up due rows and sends them.
 */

import { NURTURE_SEQUENCE, NURTURE_SEQUENCE_QC, LEAD_MAGNET_NURTURE_SEQUENCE } from "./email-nurture-templates";

export interface DripStep {
    /** Days after enrollment to send this email */
    dayOffset: number;
    /** Template key — must match a send function in email.ts */
    templateKey: string;
}

export interface DripSequence {
    key: string;
    name: string;
    description: string;
    steps: DripStep[];
}

export const DRIP_SEQUENCES: Record<string, DripSequence> = {
    consulting_onboarding: {
        key: "consulting_onboarding",
        name: "Consulting Onboarding Drip",
        description: "3-email educational series for new consulting clients in their first 2 weeks.",
        steps: [
            { dayOffset: 1, templateKey: "edu_contracting_101" },
            { dayOffset: 4, templateKey: "edu_set_asides" },
            { dayOffset: 8, templateKey: "edu_capability_statement" },
        ],
    },
    self_service_onboarding: {
        key: "self_service_onboarding",
        name: "Self-Service Onboarding Drip",
        description: "2-email educational series for new SaaS users.",
        steps: [
            { dayOffset: 1, templateKey: "edu_naics_codes" },
            { dayOffset: 4, templateKey: "edu_set_asides" },
        ],
    },
    /**
     * 90-day Facebook-lead nurture — 12 emails, 70% value / 30% conversion.
     * Defined in NURTURE_SEQUENCE (lib/email-nurture-templates.ts); we just
     * mirror those keys + day_offsets into the generic drip mechanism so
     * /api/cron/process_scheduled_emails picks them up automatically.
     * Enrolled from /api/meta/leadgen-webhook on every fresh FB lead.
     */
    fb_nurture: {
        key: "fb_nurture",
        name: "Facebook Lead 90-Day Nurture",
        description: "12-email warm-up sequence for Meta lead-ad submissions.",
        steps: NURTURE_SEQUENCE.map(s => ({ dayOffset: s.day_offset, templateKey: s.key })),
    },
    /**
     * Quick-Checker variant of fb_nurture — same 12-email cadence, but the
     * day-0 welcome references the user's Quick Check scan instead of the
     * Field Manual PDF (which they never downloaded). Enrolled from
     * /api/lead-magnet/confirm right after the score is computed and the
     * report email goes out.
     */
    qc_nurture: {
        key: "qc_nurture",
        name: "Quick Checker 90-Day Nurture",
        description: "12-email nurture for Quick Checker submissions (shares days 3-90 with fb_nurture).",
        steps: NURTURE_SEQUENCE_QC.map(s => ({ dayOffset: s.day_offset, templateKey: s.key })),
    },
    /**
     * Short 7-day drip that fires when a downloadable lead magnet (Field
     * Manual etc.) is delivered. Four emails — Day 1/3/5/7 — designed to
     * convert downloaders to a free signup or 14-day Pro trial. Sits
     * alongside the longer fb_nurture, which continues as a 12-email
     * follow-on after Day 7. Enrolled from /api/leads and
     * /api/lead-magnet/deliver immediately after PDF send.
     */
    lead_magnet_nurture: {
        key: "lead_magnet_nurture",
        name: "Lead Magnet 7-Day Nurture",
        description: "4-email follow-up (Day 1/3/5/7) for PDF downloaders — drives free signup or Pro trial.",
        steps: LEAD_MAGNET_NURTURE_SEQUENCE.map(s => ({ dayOffset: s.day_offset, templateKey: s.key })),
    },
};

export function getDripSequence(key: string): DripSequence | null {
    return DRIP_SEQUENCES[key] ?? null;
}
