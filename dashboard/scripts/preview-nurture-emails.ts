/**
 * Preview every nurture template by sending all 13 to a single inbox so the
 * recipient can verify look-and-feel + check that they actually render +
 * land in the inbox (not spam).
 *
 * Sends 13 emails total:
 *   - nurture_01_qc_welcome (Quick Checker variant — Day 0)
 *   - nurture_01_welcome    (Facebook download variant — Day 0)
 *   - nurture_02 through nurture_12 (shared days 3-90)
 *
 * Each subject is prefixed with [PREVIEW Day N · qc|fb|both] so it's
 * obvious which variant + position you're looking at in the inbox.
 *
 * Sends are throttled 1.5s apart to stay polite under Resend's 2/sec
 * free-tier ceiling and to keep the inbox arrival order obvious.
 *
 * Usage:
 *   cd dashboard
 *   set -a; source .env.vercel.production; set +a
 *   npx tsx scripts/preview-nurture-emails.ts                       # → info@fillcart.de
 *   npx tsx scripts/preview-nurture-emails.ts --to someone@x.com    # any inbox
 *   npx tsx scripts/preview-nurture-emails.ts --only nurture_05     # one template
 */

import { Resend } from "resend";
import { NURTURE_TEMPLATES, NURTURE_SEQUENCE, NURTURE_SEQUENCE_QC } from "../src/lib/email-nurture-templates";

const DEFAULT_TO = "info@fillcart.de";
const DEFAULT_NAME = "André Schüler";
const FROM = process.env.EMAIL_FROM || "André @ CapturePilot <hello@capturepilot.com>";

interface PreviewItem {
    templateKey: string;
    dayOffset: number;
    variant: "qc" | "fb" | "both";
    label: string;
}

function buildPreviewList(): PreviewItem[] {
    // Index every nurture key by which sequence(s) it belongs to.
    const fbKeys = new Set(NURTURE_SEQUENCE.map(s => s.key));
    const qcKeys = new Set(NURTURE_SEQUENCE_QC.map(s => s.key));
    const dayByKey = new Map<string, number>();
    for (const s of NURTURE_SEQUENCE) dayByKey.set(s.key, s.day_offset);
    for (const s of NURTURE_SEQUENCE_QC) dayByKey.set(s.key, s.day_offset);

    const items: PreviewItem[] = [];
    // Send Day 0 variants first so they show up at the top of the inbox.
    for (const key of Object.keys(NURTURE_TEMPLATES)) {
        const day = dayByKey.get(key) ?? -1;
        if (day !== 0) continue;
        const variant: PreviewItem["variant"] = qcKeys.has(key) && !fbKeys.has(key)
            ? "qc"
            : (fbKeys.has(key) && !qcKeys.has(key) ? "fb" : "both");
        items.push({ templateKey: key, dayOffset: 0, variant, label: variant === "qc" ? "Quick Checker welcome" : "FB download welcome" });
    }
    // Then send days 3 → 90 (shared between both sequences).
    for (const s of NURTURE_SEQUENCE.slice(1)) {
        if (!NURTURE_TEMPLATES[s.key]) continue;
        items.push({ templateKey: s.key, dayOffset: s.day_offset, variant: "both", label: s.key });
    }
    return items;
}

async function main() {
    const args = process.argv.slice(2);
    const toArg = args.indexOf("--to");
    const to = toArg >= 0 ? args[toArg + 1] : DEFAULT_TO;
    const onlyArg = args.indexOf("--only");
    const onlyKey = onlyArg >= 0 ? args[onlyArg + 1] : null;

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
        console.error("RESEND_API_KEY not set in env");
        process.exit(1);
    }
    const resend = new Resend(apiKey);

    let items = buildPreviewList();
    if (onlyKey) items = items.filter(i => i.templateKey === onlyKey);

    console.log(`Sending ${items.length} preview email(s) to ${to}`);
    console.log(`From: ${FROM}`);
    console.log("");

    let sent = 0, failed = 0;
    for (const item of items) {
        const tmpl = NURTURE_TEMPLATES[item.templateKey];
        if (!tmpl) {
            console.log(`  ✗ ${item.templateKey} — template not found`);
            failed++;
            continue;
        }
        const firstName = DEFAULT_NAME.split(" ")[0];
        const html = tmpl.html
            .replace(/\{\{\s*first_name\s*\}\}/g, firstName)
            .replace(/\{\{\s*unsubscribe_url\s*\}\}/g, "https://app.capturepilot.com/unsubscribe?token=preview");
        const subject = `[PREVIEW Day ${item.dayOffset} · ${item.variant}] ${tmpl.subject}`;

        try {
            const res = await resend.emails.send({
                from: FROM,
                to,
                subject,
                html,
            });
            if (res.error) {
                console.log(`  ✗ ${item.templateKey} — ${res.error.message}`);
                failed++;
            } else {
                console.log(`  ✓ Day ${String(item.dayOffset).padStart(2)} · ${item.variant.padEnd(4)} · ${item.templateKey.padEnd(35)} → ${res.data?.id || "(no id)"}`);
                sent++;
            }
        } catch (err) {
            console.log(`  ✗ ${item.templateKey} — exception: ${(err as Error).message}`);
            failed++;
        }
        // Polite throttle: 1.5s between sends stays well under Resend's
        // 2/sec ceiling and preserves visible inbox order.
        await new Promise(r => setTimeout(r, 1500));
    }

    console.log("");
    console.log(`Done — ${sent} sent, ${failed} failed.`);
}

main().catch(e => { console.error(e); process.exit(1); });
