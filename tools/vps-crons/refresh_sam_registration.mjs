#!/usr/bin/env node
// Triggers /api/cron/refresh_sam_registration from the VPS.
// Continuous-drain lane: every 10 min, ?limit=40 contractors per run. Placed on
// the VPS (not Vercel) because the Vercel 40-cron ceiling is full. Keep it
// VPS-ONLY — adding it to vercel.json would double-run and burn the SAM quota.
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const r = spawnSync(process.execPath, [join(here, '_runner.mjs'), '/api/cron/refresh_sam_registration?limit=40'], {
  stdio: 'inherit',
})
process.exit(r.status ?? 1)
