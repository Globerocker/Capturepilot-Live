/**
 * Drip sequence definitions — scheduled educational email series.
 *
 * Each sequence is enrolled via enqueueDripSequence() after a triggering event
 * (signup, onboarding, etc.). The process_scheduled_emails cron then picks up
 * due rows and sends them.
 */

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
};

export function getDripSequence(key: string): DripSequence | null {
    return DRIP_SEQUENCES[key] ?? null;
}
