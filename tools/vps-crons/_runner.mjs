#!/usr/bin/env node
// Shared VPS cron runner. Hits a Vercel cron endpoint with the CRON_SECRET
// bearer token and exits non-zero on failure so systemd records the result.
//
// Usage: node _runner.mjs <path>
//   <path> = /api/cron/<route> (e.g. /api/cron/monthly_awards)
//
// Env:
//   CRON_SECRET   required — matches Vercel CRON_SECRET
//   CRON_BASE_URL optional — defaults to https://app.capturepilot.com
//   CRON_TIMEOUT_MS optional — defaults to 270000 (4.5 min, under Vercel's 300s cap)

const path = process.argv[2]
if (!path || !path.startsWith('/api/cron/')) {
  console.error('[vps-cron] usage: node _runner.mjs /api/cron/<route>')
  process.exit(2)
}

const secret = process.env.CRON_SECRET
if (!secret) {
  console.error('[vps-cron] CRON_SECRET env var is required')
  process.exit(2)
}

const base = (process.env.CRON_BASE_URL || 'https://app.capturepilot.com').replace(/\/+$/, '')
const timeoutMs = Number(process.env.CRON_TIMEOUT_MS || 270_000)
const url = `${base}${path}`
const startedAt = Date.now()

console.log(`[vps-cron] POST ${url} (timeout ${timeoutMs}ms)`)

const controller = new AbortController()
const timer = setTimeout(() => controller.abort(), timeoutMs)

try {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'User-Agent': 'capturepilot-vps-cron/1.0',
    },
    signal: controller.signal,
  })
  const elapsed = Date.now() - startedAt
  const text = await res.text().catch(() => '')
  const snippet = text.length > 500 ? `${text.slice(0, 500)}...` : text
  if (!res.ok) {
    console.error(`[vps-cron] FAIL ${res.status} after ${elapsed}ms: ${snippet}`)
    process.exit(1)
  }
  console.log(`[vps-cron] OK ${res.status} in ${elapsed}ms: ${snippet}`)
  process.exit(0)
} catch (err) {
  const elapsed = Date.now() - startedAt
  const msg = err instanceof Error ? err.message : String(err)
  console.error(`[vps-cron] ERROR after ${elapsed}ms: ${msg}`)
  process.exit(1)
} finally {
  clearTimeout(timer)
}
