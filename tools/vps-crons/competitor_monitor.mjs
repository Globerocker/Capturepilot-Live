#!/usr/bin/env node
// Triggers /api/cron/competitor_monitor from the VPS.
// Schedule on VPS: weekly Sunday 07:00 UTC.
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const r = spawnSync(process.execPath, [join(here, '_runner.mjs'), '/api/cron/competitor_monitor'], {
  stdio: 'inherit',
})
process.exit(r.status ?? 1)
