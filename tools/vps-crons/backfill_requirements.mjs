#!/usr/bin/env node
// Triggers /api/cron/backfill_requirements from the VPS.
// Schedule on VPS: daily 06:00 UTC.
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const r = spawnSync(process.execPath, [join(here, '_runner.mjs'), '/api/cron/backfill_requirements'], {
  stdio: 'inherit',
})
process.exit(r.status ?? 1)
