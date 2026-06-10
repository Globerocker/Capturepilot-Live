import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

interface StepRow {
    id: string;
    campaign_id: string;
    step_number: number;
    channel: string | null;
    subject: string | null;
    variant: string | null;
    body_preview?: string | null;
}

interface MessageRow {
    step_id: string | null;
    status: string | null;
    opened_at?: string | null;
    clicked_at?: string | null;
    replied_at?: string | null;
    bounced_at?: string | null;
    delivered_at?: string | null;
    variant?: string | null;
}

export async function GET(
    _req: NextRequest,
    ctx: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await ctx.params;
        if (!id) {
            return NextResponse.json({ error: "Missing campaign id" }, { status: 400 });
        }

        const sb = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_KEY!
        );

        // Fetch all steps for this campaign
        const { data: stepData, error: stepErr } = await sb
            .from("outreach_steps")
            .select("id, campaign_id, step_number, channel, subject, variant, body_preview")
            .eq("campaign_id", id)
            .order("step_number", { ascending: true });

        if (stepErr) {
            return NextResponse.json({ error: stepErr.message }, { status: 500 });
        }

        const steps = (stepData || []) as StepRow[];
        if (steps.length === 0) {
            return NextResponse.json({ steps: [] });
        }

        const stepIds = steps.map((s) => s.id);

        // Fetch all messages for the campaign's steps
        const { data: msgData, error: msgErr } = await sb
            .from("outreach_messages")
            .select("step_id, status, opened_at, clicked_at, replied_at, bounced_at, delivered_at, variant")
            .in("step_id", stepIds);

        if (msgErr) {
            return NextResponse.json({ error: msgErr.message }, { status: 500 });
        }

        const messages = (msgData || []) as MessageRow[];

        // Bucket by step + variant
        type Bucket = {
            sent: number;
            delivered: number;
            opened: number;
            clicked: number;
            replied: number;
            bounced: number;
        };
        const emptyBucket = (): Bucket => ({ sent: 0, delivered: 0, opened: 0, clicked: 0, replied: 0, bounced: 0 });

        const byStep = new Map<string, { total: Bucket; variants: Map<string, Bucket> }>();
        for (const s of steps) {
            byStep.set(s.id, { total: emptyBucket(), variants: new Map() });
        }

        for (const m of messages) {
            if (!m.step_id) continue;
            const ent = byStep.get(m.step_id);
            if (!ent) continue;
            const variantKey = (m.variant || "A").toString();
            if (!ent.variants.has(variantKey)) ent.variants.set(variantKey, emptyBucket());
            const vb = ent.variants.get(variantKey)!;

            // sent = any row exists
            ent.total.sent += 1;
            vb.sent += 1;

            if (m.delivered_at || m.status === "delivered" || m.status === "opened" || m.status === "clicked" || m.status === "replied") {
                ent.total.delivered += 1;
                vb.delivered += 1;
            }
            if (m.opened_at) { ent.total.opened += 1; vb.opened += 1; }
            if (m.clicked_at) { ent.total.clicked += 1; vb.clicked += 1; }
            if (m.replied_at) { ent.total.replied += 1; vb.replied += 1; }
            if (m.bounced_at || m.status === "bounced") { ent.total.bounced += 1; vb.bounced += 1; }
        }

        const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 10000) / 100 : 0);

        const result = steps.map((s) => {
            const ent = byStep.get(s.id)!;
            const t = ent.total;
            const variants = Array.from(ent.variants.entries()).map(([key, v]) => ({
                variant: key,
                sent: v.sent,
                delivered: v.delivered,
                opened: v.opened,
                clicked: v.clicked,
                replied: v.replied,
                bounced: v.bounced,
                delivered_rate: pct(v.delivered, v.sent),
                open_rate: pct(v.opened, v.delivered || v.sent),
                click_rate: pct(v.clicked, v.delivered || v.sent),
                reply_rate: pct(v.replied, v.delivered || v.sent),
                bounce_rate: pct(v.bounced, v.sent),
            }));

            return {
                step_id: s.id,
                step_number: s.step_number,
                channel: s.channel,
                subject: s.subject,
                sent: t.sent,
                delivered: t.delivered,
                opened: t.opened,
                clicked: t.clicked,
                replied: t.replied,
                bounced: t.bounced,
                delivered_rate: pct(t.delivered, t.sent),
                open_rate: pct(t.opened, t.delivered || t.sent),
                click_rate: pct(t.clicked, t.delivered || t.sent),
                reply_rate: pct(t.replied, t.delivered || t.sent),
                bounce_rate: pct(t.bounced, t.sent),
                variants,
            };
        });

        return NextResponse.json({ steps: result });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Internal server error";
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
