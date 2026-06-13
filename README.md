# CapturePilot 2.0

CapturePilot is a B2G capture-intelligence platform for finding, qualifying, enriching, and pursuing government contracting opportunities. The repository contains the main SaaS dashboard, marketing sites, operational scripts, database schema assets, workflow automations, and deployment references.

## Repository Map

- `dashboard/` - primary Next.js app for the CapturePilot product. Uses Next.js 16, React 19, TypeScript, Tailwind CSS 4, Supabase, Stripe, OpenAI/LLM integrations, Sentry, and Playwright.
- `website/` - marketing/content site for CapturePilot. This directory contains its own `.git` metadata, so treat it as a nested repository until ownership is clarified.
- `americurial/` - separate Americurial agency/brand site. This directory also contains its own `.git` metadata.
- `tools/` - ESM Node utilities for Supabase operations, enrichment, worker jobs, PDF generation, VPS cron helpers, and Zapier app code.
- `dashboard/supabase/` - schema files, migrations, and seed data for the product database.
- `n8n-workflows/` - importable workflow JSON and setup notes for automation workflows.
- `assets/starter-pack/` - source and rebuilt startup-pack assets.
- `docs/` - operational, integration, product, and audit documentation.

## Main Local Commands

```bash
cd dashboard && npm run dev
cd dashboard && npm run build
cd dashboard && npm run lint
cd dashboard && npm run e2e:smoke

cd website && npm run dev
cd website && npm run build

cd americurial && npm run dev
cd americurial && npm run build
cd americurial && npm run lint
```

`tools/` does not define package scripts at the package root. Run individual `.mjs` utilities directly with Node after reading their headers and confirming whether they are dry-run or write-mode scripts.

Useful read-only utility:

```bash
node tools/45_cron_inventory.mjs
node tools/46_enrichment_backfill_ops.mjs
```

## Operational References

- Cron and worker architecture: `CRON.md`
- Latest platform audit and maturity roadmap: `docs/CAPTUREPILOT_DEEP_AUDIT_2026-06-12.md`
- HubSpot setup and integration notes: `docs/HUBSPOT_INTEGRATION.md`, `docs/HUBSPOT_AI_SETUP_GUIDE.md`
- VPS cron deployment notes: `tools/vps-crons/README.md`
- n8n workflow setup: `n8n-workflows/README.md`

## Safety Notes

- Local `.env` files exist and may contain production secrets. Do not print, commit, or copy secret values into documentation.
- `dashboard/vercel.json` currently defines 40 Vercel cron entries, while `dashboard/src/app/api/cron/` contains more route handlers for Vercel, orchestrator, VPS, admin-triggered, webhook-triggered, and deprecated jobs.
- Historical one-off repair scripts such as `fix_*.py` and `rewrite_crawler.py` are archived in `archive/legacy-repair-scripts/`. Current operational tools live in `tools/`.
