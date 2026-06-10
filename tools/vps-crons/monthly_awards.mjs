#!/usr/bin/env node
// Triggers /api/cron/monthly_awards from the VPS.
// Schedule on VPS: 1st of month at 00:00 UTC (matches old vercel.json entry).
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const r = spawnSync(process.execPath, [join(here, '_runner.mjs'), '/api/cron/monthly_awards'], {
  stdio: 'inherit',
})
process.exit(r.status ?? 1)
