# PDF / Document Scraping for State & Local Opportunities

Plan doc — follow-up to `STATE_LOCAL_INTEGRATION_PLAN.md`. State / county / city RFP portals frequently link to PDF / DOCX / XLSX attachments that contain the **scope of work, pricing schedule, evaluation criteria** — i.e. everything you need to write a winning proposal. We already have a SAM.gov attachment pipeline (`/api/admin/analyze-match-attachments`); this doc plans the equivalent for SLED sources.

## Current state

- SAM.gov: attachments downloaded by deep_enrich cron, cached in Supabase Storage bucket `opportunity-attachments`, AI-analyzed for `structured_requirements` per opportunity.
- SLED (Bonfire, OpenGov, Socrata): **no attachment ingestion at all**. The detail page shows the original portal link in the new source-aware button, but documents linked from there are not pulled, not cached, not analyzed.

## What's missing

For every SLED row we want to:

1. **Discover document URLs** — scrape the linked portal page (or RSS-item description) for PDF / DOC / DOCX / XLSX links.
2. **Download + cache** — pull each document via plain HTTPS (no proxy needed; SLED portals are public). Store in `opportunity-attachments` under a key like `sled/<source_prefix>/<notice_id>/<filename>`.
3. **Surface in detail page** — same component as SAM attachments (`OpportunityAttachments`).
4. **Feed structured requirements** — pass combined text to gpt-4o-mini for `structured_requirements` extraction. Same flow as SAM.

## Why we didn't ship this in the contact-extraction pass

Three reasons it's a separate, bigger lift:

1. **Per-portal extraction logic** — Bonfire embeds links in the RSS description's HTML. OpenGov is a React SPA. Socrata sometimes has a `link.url` column, sometimes not. Each has its own attachment-discovery shape.
2. **Background-job architecture** — downloading a multi-MB PDF inside a sync cron is a non-starter at 30+ portals × N attachments per opp. Needs a queue (existing pattern: `attachment_analysis_jobs` table).
3. **Vendor-account caveats** — Bonfire / OpenGov public listings expose metadata but some attachments require a free vendor account login. We need a per-portal probe to find out which ones gate behind auth.

## Proposed phasing

### Phase A — Bonfire PDF links from RSS (1-2 days)
Bonfire RSS `<description>` HTML often includes inline `<a href="...">` to public attachment URLs. A regex pass on the description (similar to the contact extractor) can pull `extracted_attachment_urls text[]` without any per-portal scraping. Cheap, immediate win.

### Phase B — Detail-page scraper for SLED rows (3-5 days)
Background job (`/api/cron/scrape_sled_attachments`) that:
- Queues unscraped SLED opps in a new `sled_attachment_jobs` table.
- Workers fetch `opp.link`, extract attachment URLs with cheerio + per-provider rules (separate modules `bonfire-parser.ts`, `opengov-parser.ts`).
- For each attachment URL, downloads to Supabase Storage with a 25MB cap.
- Records `opportunities.sled_attachments jsonb` with `[{name, url, cached_url, size, content_type}]`.

### Phase C — Vendor-account portals (5-7 days, optional)
For portals that gate attachments behind a free vendor login (some Bonfire + OpenGov tenants), use a single-session cookie jar reused across requests. Higher risk of ToS friction — defer until Phases A+B prove value.

### Phase D — Structured-requirement extraction (existing pattern)
Once attachments are cached, reuse `/api/admin/analyze-match-attachments` end-to-end so every SLED opp also gets `structured_requirements` populated. Zero new infra needed.

## Recommended order

**Phase A first** (cheap, ~1 day). Then watch ingestion logs for ~1 week to see what % of SLED opps actually have inline PDFs in their RSS descriptions vs. require Phase-B page scraping. That data drives whether Phase B is worth building.

## Open question for the user

Do you want me to ship **Phase A** in this session? It would:
- Add `extracted_attachment_urls text[]` to `opportunities` (migration 079).
- Extend `extract-rich-fields.ts` with a PDF-URL extractor.
- Wire into ingest_rss + ingest_socrata + the backfill route.
- Re-run the backfill so the existing 56K rows get any inline-PDF URLs they may have.

Phase B (per-portal scrapers) takes 3-5 days and would land in a follow-up session.
