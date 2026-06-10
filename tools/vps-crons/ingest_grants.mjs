#!/usr/bin/env node
// Triggers /api/cron/ingest_grants from the VPS.
// Schedule on VPS: daily 02:30 UTC.
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const r = spawnSync(process.execPath, [join(here, '_runner.mjs'), '/api/cron/ingest_grants'], {
  stdio: 'inherit',
})
process.exit(r.status ?? 1)
