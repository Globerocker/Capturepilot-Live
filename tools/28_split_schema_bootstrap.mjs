#!/usr/bin/env node
// Splits the pg_dump live_schema.sql into 4 consolidated bootstrap files
// Reads: /tmp/capturepilot-schema/live_schema.sql
// Writes: dashboard/supabase/schema/01..04_*.sql
// Excludes: dead tables (locations, outreach_drafts, competitors, competitor_intelligence)
// Strips: dead columns from opportunities (per migration 012 intent)

import fs from 'fs';
import path from 'path';

const INPUT = '/tmp/capturepilot-schema/live_schema.sql';
const OUTDIR = process.argv[2] || '/Users/andreschuler/Caturepilot 2.0/dashboard/supabase/schema';

const DEAD_TABLES = new Set(['locations', 'outreach_drafts', 'competitors', 'competitor_intelligence']);

const DEAD_OPPORTUNITY_COLUMNS = new Set([
  'agency_id', 'set_aside_id', 'opportunity_type_id',
  'additional_info_link', 'place_of_performance_country',
  'ai_analysis', 'active',
  'past_performance_score', 'notice_type_score',
  'incumbent_risk_score', 'competitive_position_score',
  'enrichment_status', 'enrichment_completed_at',
  'requirements_extracted', 'set_aside_types',
]);

// bucket name → ordered list of tables (and special markers for enums/functions)
const BUCKETS = {
  '01_core_schema': {
    title: 'Core schema — foundation tables, enums, trigger functions',
    description: 'Reference data, user auth, core opportunity/contractor/match tables',
    preludeSymbols: ['opportunity_status', 'sba_certification_type', 'rls_auto_enable',
      'sync_is_archived_from_status', 'sync_status_from_archived'],
    tables: [
      'naics_codes', 'psc_codes', 'set_asides', 'agencies', 'archive_types', 'opportunity_types',
      'opportunities', 'contractors', 'contacts', 'matches',
      'opportunity_attachments', 'opportunity_contractors', 'contractor_contacts',
      'user_profiles', 'user_matches', 'user_action_items', 'user_notifications',
      'user_pursuits', 'service_requests',
      'agency_intelligence_logs', 'enrichment_jobs', 'capture_outcomes',
    ],
  },
  '02_application_features': {
    title: 'Application features — consulting portal, pipeline, docs, proposals',
    description: 'User-facing SaaS + consulting features',
    preludeSymbols: ['touch_proposal_jobs_updated_at'],
    tables: [
      'client_tasks', 'client_documents', 'client_competitors', 'client_activity_log',
      'client_messages', 'client_partners',
      'call_logs', 'email_drafts',
      'saved_searches', 'proposal_jobs', 'pipeline_activity', 'cancellation_feedback',
      'attachment_analysis_jobs',
      'user_documents', 'user_feedback', 'user_views',
      'profile_members', 'profile_invitations',
      'capability_matrices', 'compliance_matrices', 'capture_briefs',
      'recompete_candidates', 'past_perf_ratings',
    ],
  },
  '03_intelligence_reference': {
    title: 'Intelligence & reference data — market intel, teaming, forecasts',
    description: 'Curated reference tables for scoring, teaming, market analysis',
    preludeSymbols: [],
    tables: [
      'company_analyses',
      'naics_market_stats', 'gov_keywords',
      'tribal_contractors', 'prime_sblos', 'agency_spend_forecast',
      'labor_rates', 'daily_dod_awards', 'bid_protests',
      'far_clauses_cache', 'federal_hierarchy',
      'market_watch_searches',
      'agency_forecast_sources', 'agency_forecast_changes', 'fpds_awards',
    ],
  },
  '04_admin_integrations': {
    title: 'Admin & integrations — email, webhooks, outreach, academy',
    description: 'Admin-facing + third-party integrations',
    preludeSymbols: [],
    tables: [
      'email_settings', 'scheduled_emails', 'email_templates',
      'api_tokens', 'webhook_endpoints', 'webhook_deliveries',
      'slack_installations',
      'outreach_prospects', 'outreach_optouts', 'outreach_sequence_state',
      'academy_articles', 'release_notes', 'admin_opportunity_pushes',
      'veteran_verifications', 'beta_invites',
    ],
  },
};

// === Parse pg_dump into sections ===
const raw = fs.readFileSync(INPUT, 'utf8');
const lines = raw.split('\n');

// A section in pg_dump looks like:
// --
// -- Name: <symbol>; Type: <TYPE>; Schema: <schema>; Owner: -
// --
// <SQL>
// [blank lines]
// --
// -- Name: ...
//
// We split on the `-- Name:` header.

const sections = [];
let current = null;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  // pg_dump v17+ trailer noise — never carry into bootstrap
  if (/^\\(un)?restrict\b/.test(line)) continue;
  if (/^-- PostgreSQL database dump (complete|start)/.test(line)) continue;
  const m = line.match(/^-- Name: (.+?); Type: (.+?); Schema: (.+?); Owner: (.+)$/);
  if (m) {
    if (current) sections.push(current);
    current = {
      name: m[1].trim(),
      type: m[2].trim(),
      schema: m[3].trim(),
      header: line,
      body: [],
    };
  } else if (current) {
    current.body.push(line);
  } else {
    // pre-first-section header lines (pg_dump preamble)
  }
}
if (current) sections.push(current);

// Classify each section by the table it belongs to (if any)
function tableOfSection(sec) {
  const { name, type } = sec;
  // DEFAULT / PRIMARY KEY / INDEX / TRIGGER / CONSTRAINT / POLICY / ROW SECURITY
  // all reference the table name explicitly in the body.
  const body = sec.body.join('\n');
  // Try to find a "public.<table>" reference
  const bodyMatch = body.match(/public\.([a-z_][a-z0-9_]*)/);
  if (type === 'TABLE') return name;
  if (type.startsWith('SEQUENCE') && name.endsWith('_id_seq')) {
    return name.replace(/_id_seq$/, '');
  }
  if (type === 'DEFAULT' && bodyMatch) return bodyMatch[1];
  if (type === 'INDEX' && bodyMatch) return bodyMatch[1];
  if (type === 'TRIGGER' && bodyMatch) return bodyMatch[1];
  if (type === 'CONSTRAINT' && bodyMatch) return bodyMatch[1];
  if (type === 'FK CONSTRAINT' && bodyMatch) return bodyMatch[1];
  if (type === 'POLICY' && bodyMatch) return bodyMatch[1];
  if (type === 'ROW SECURITY' && bodyMatch) return bodyMatch[1];
  if (type === 'COMMENT') {
    // Comments can be on tables, columns, schemas
    const colMatch = name.match(/^(?:TABLE |COLUMN )?([a-z_][a-z0-9_]*)/);
    if (colMatch) return colMatch[1].split('.')[0];
  }
  return null;
}

// Build a reverse lookup: table → bucket
const tableToBucket = {};
for (const [bucket, cfg] of Object.entries(BUCKETS)) {
  for (const t of cfg.tables) tableToBucket[t] = bucket;
}

// Symbol (non-table) → bucket for enums/functions
const symbolToBucket = {};
for (const [bucket, cfg] of Object.entries(BUCKETS)) {
  for (const s of cfg.preludeSymbols) {
    symbolToBucket[s] = bucket;
    // Function names end with `()` in dump headers
    symbolToBucket[s + '()'] = bucket;
  }
}

// === Strip dead opportunities columns from CREATE TABLE body ===
function stripDeadOpportunitiesColumns(sec) {
  if (sec.type !== 'TABLE' || sec.name !== 'opportunities') return sec;
  const body = sec.body;
  const out = [];
  let skipping = false;
  let closed = false;
  for (let i = 0; i < body.length; i++) {
    const line = body[i];
    if (closed) { out.push(line); continue; }
    // Inside CREATE TABLE (...);
    // Detect a column line: starts with "    <colname> ..."
    const colMatch = line.match(/^    ([a-z_][a-z0-9_]*) /);
    if (colMatch && DEAD_OPPORTUNITY_COLUMNS.has(colMatch[1])) {
      continue; // drop this column line
    }
    if (line.trim() === ');') closed = true;
    out.push(line);
  }
  // Need to make sure the last remaining column line doesn't end with a stray comma
  // before `);`
  for (let i = out.length - 1; i >= 0; i--) {
    if (out[i].trim() === ');') {
      // find previous non-blank line
      for (let j = i - 1; j >= 0; j--) {
        if (out[j].trim() === '') continue;
        if (out[j].endsWith(',')) out[j] = out[j].replace(/,$/, '');
        break;
      }
      break;
    }
  }
  return { ...sec, body: out };
}

// === Drop dead FK constraint sections (FKs on opportunities pointing to dropped columns) ===
function isDeadFKConstraint(sec) {
  if (sec.type !== 'FK CONSTRAINT') return false;
  const body = sec.body.join('\n');
  // Match: ALTER TABLE ONLY public.opportunities ... FOREIGN KEY (col_name) ...
  const fkMatch = body.match(/FOREIGN KEY \(([a-z_]+)\)/);
  if (!fkMatch) return false;
  const col = fkMatch[1];
  // If the FK is on opportunities and the source column is dead → drop
  if (body.includes('ALTER TABLE ONLY public.opportunities') && DEAD_OPPORTUNITY_COLUMNS.has(col)) {
    return true;
  }
  return false;
}

// === Route sections into bucket → list ===
const buckets = Object.fromEntries(Object.keys(BUCKETS).map(k => [k, []]));
const skipped = [];
const unrouted = [];

for (const sec of sections) {
  // Skip schema/extensions/comments-on-schema
  if (sec.type === 'SCHEMA') continue;
  if (sec.type === 'COMMENT' && sec.name === 'SCHEMA public') continue;
  // Skip dead tables entirely
  const tbl = tableOfSection(sec);
  if (tbl && DEAD_TABLES.has(tbl)) { skipped.push(sec); continue; }
  // Skip dead FK constraints
  if (isDeadFKConstraint(sec)) { skipped.push(sec); continue; }
  // Skip "SEQUENCE OWNED BY" that references the SEQUENCE we've already owned
  // (these are kept if the parent table is kept)

  // Route enums & functions by symbol
  if (sec.type === 'TYPE' || sec.type === 'FUNCTION') {
    // For FUNCTION, name includes "()"
    const key = sec.name;
    const bucket = symbolToBucket[key];
    if (bucket) {
      buckets[bucket].push(sec);
    } else {
      unrouted.push(sec);
    }
    continue;
  }

  // Route by table name
  if (tbl && tableToBucket[tbl]) {
    let processedSec = sec;
    if (sec.type === 'TABLE' && sec.name === 'opportunities') {
      processedSec = stripDeadOpportunitiesColumns(sec);
    }
    buckets[tableToBucket[tbl]].push(processedSec);
  } else {
    unrouted.push(sec);
  }
}

// === Render each bucket to file ===
const preamble = `SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET search_path = public, extensions, pg_catalog;

-- Extensions required for defaults like uuid_generate_v4() and GIN indexes
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS btree_gin WITH SCHEMA extensions;
`;

for (const [name, cfg] of Object.entries(BUCKETS)) {
  const parts = [];
  parts.push(`-- ${cfg.title}
-- ${cfg.description}
-- Generated from live_schema.sql (pg_dump v17.6) on ${new Date().toISOString().slice(0,10)}
-- DO NOT EDIT directly: regenerate via tools/28_split_schema_bootstrap.mjs if schema changes.
`);
  if (name === '01_core_schema') parts.push(preamble);
  for (const sec of buckets[name]) {
    parts.push('--');
    parts.push(`-- Name: ${sec.name}; Type: ${sec.type}; Schema: ${sec.schema}`);
    parts.push('--');
    parts.push('');
    parts.push(sec.body.join('\n'));
  }
  const outFile = path.join(OUTDIR, `${name}.sql`);
  fs.writeFileSync(outFile, parts.join('\n'));
  console.log(`Wrote ${outFile}  (${buckets[name].length} sections, ${parts.join('\n').length} bytes)`);
}

// Report unrouted sections
if (unrouted.length) {
  console.log(`\n=== UNROUTED (${unrouted.length}) — review these ===`);
  for (const sec of unrouted) {
    console.log(`  [${sec.type}] ${sec.name}`);
  }
}
if (skipped.length) {
  console.log(`\n=== SKIPPED dead sections (${skipped.length}) ===`);
  for (const sec of skipped) {
    console.log(`  [${sec.type}] ${sec.name}`);
  }
}
