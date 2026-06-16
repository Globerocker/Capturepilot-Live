/**
 * One-off maintenance endpoint: make the 100%-off test promo code FLKTEST1
 * valid again (used to run end-to-end startup-pack buyer tests without paying).
 *
 * Stripe promotion codes can only be toggled active/inactive after creation
 * (max_redemptions / expires_at are immutable). So:
 *   - active code already exists      -> nothing to do
 *   - inactive but still usable       -> reactivate (active:true)
 *   - expired / fully redeemed / gone -> create a fresh FLKTEST1 on the same
 *                                        100%-off coupon (or make one)
 *
 * Guarded by CRON_SECRET (guardCron). Trigger once:
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://app.capturepilot.com/api/cron/fix_flktest
 */
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { guardCron } from "@/lib/cron-auth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
    const denied = guardCron(req);
    if (denied) return denied;

    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) return NextResponse.json({ error: "STRIPE_SECRET_KEY not set" }, { status: 500 });
    const stripe = new Stripe(key, { apiVersion: "2026-02-25.clover" });

    try {
        // Stripe's pinned-apiVersion types lag the runtime API (PromotionCode.coupon
        // exists at runtime), so treat promo-code objects as any.
        const list = await stripe.promotionCodes.list({ code: "FLKTEST1", limit: 100 });
        const codes: any[] = list.data || [];
        const now = Math.floor(Date.now() / 1000);

        const already = codes.find(pc => pc.active);
        if (already) {
            return NextResponse.json({ ok: true, action: "already_active", id: already.id, coupon: already.coupon?.id });
        }

        // An inactive code we can simply switch back on (still valid coupon, not expired, redemptions left).
        const reusable = codes.find((pc: any) => {
            const notExpired = !pc.expires_at || pc.expires_at > now;
            const hasLeft = pc.max_redemptions == null || pc.times_redeemed < pc.max_redemptions;
            return pc.coupon && pc.coupon.valid && notExpired && hasLeft;
        });
        if (reusable) {
            const upd: any = await stripe.promotionCodes.update(reusable.id, { active: true });
            return NextResponse.json({ ok: true, action: "reactivated", id: upd.id, coupon: upd.coupon?.id });
        }

        // Otherwise recreate. Find a usable 100%-off coupon, reusing the old one if still valid.
        let couponId: string | undefined = codes[0]?.coupon?.id;
        let couponOk = false;
        if (couponId) {
            try { const c = await stripe.coupons.retrieve(couponId); couponOk = !!c.valid && c.percent_off === 100; } catch { couponOk = false; }
        }
        if (!couponOk) {
            const coupons = await stripe.coupons.list({ limit: 100 });
            const c100 = coupons.data.find(c => c.percent_off === 100 && c.valid);
            if (c100) couponId = c100.id;
            else {
                const nc = await stripe.coupons.create({ percent_off: 100, duration: "once", name: "FLKTEST – 100% off (test)" });
                couponId = nc.id;
            }
        }

        const created: any = await stripe.promotionCodes.create({ coupon: couponId!, code: "FLKTEST1", active: true, max_redemptions: 100 } as any);
        return NextResponse.json({ ok: true, action: "recreated", id: created.id, coupon: couponId, max_redemptions: 100 });
    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
