# CapturePilot VPS Crons

Vercel is at the Pro-plan ceiling of 40 cron entries. Low-frequency, write-light
crons live on the Hostinger VPS (`srv1113360.hstgr.cloud`) as systemd timers that
hit the same Vercel HTTP endpoints with the shared `CRON_SECRET`. The handler
logic stays on Vercel — only the schedule moves.

## What lives here

| Timer | Schedule (UTC) | Hits |
|---|---|---|
| `cp-monthly-awards.timer` | 1st of month, 00:00 | `POST /api/cron/monthly_awards` |
| `cp-competitor-monitor.timer` | Sunday 07:00 | `POST /api/cron/competitor_monitor` |
| `cp-db-cleanup.timer` | Sunday 04:00 | `POST /api/cron/db_cleanup` |
| `cp-ingest-grants.timer` | Daily 02:30 | `POST /api/cron/ingest_grants` |
| `cp-backfill-requirements.timer` | Daily 06:00 | `POST /api/cron/backfill_requirements` |
| `cp-beta-deadline.timer` | Daily 12:00 | `POST /api/cron/beta_deadline` |
| `cp-refresh-sam-registration.timer` | Every 10 min | `POST /api/cron/refresh_sam_registration?limit=40` |

> **`refresh_sam_registration` is a continuous-drain lane**, not low-frequency: ~40 contractors/run × 6 runs/hr ≈ 240 SAM Entity calls/hr (under the throttle). It lives on the VPS because the Vercel 40-cron ceiling is full. Keep it **VPS-only** — adding it to `vercel.json` would double-run and burn the SAM quota.

> **POST alias required:** `_runner.mjs` POSTs, but App Router routes default to GET-only and 405 a POST. Every route above must `export const POST = GET;`. (This was a live bug — all six lanes 405'd silently until it was fixed; if you add a lane, alias POST.)

Each `.service` is a `Type=oneshot` that runs `node <name>.mjs`. Every `.mjs`
shells into `_runner.mjs`, which does the actual `fetch` with bearer auth.

## Install (run once on the VPS)

```bash
# From the project root on your laptop:
scp -i ~/.ssh/cp_vps -r tools/vps-crons root@srv1113360.hstgr.cloud:/opt/capturepilot/

# Then on the VPS:
ssh -i ~/.ssh/cp_vps root@srv1113360.hstgr.cloud
cd /opt/capturepilot/vps-crons
bash install.sh

# Edit the env file the installer created and put your CRON_SECRET in:
nano /etc/capturepilot/cron.env
# Then restart any timer that ran with the stub secret:
systemctl restart cp-*.timer
```

`install.sh`:
1. Copies the `*.mjs` runners to `/opt/capturepilot/vps-crons/`
2. Creates `/etc/capturepilot/cron.env` (mode 0600) with a stub `CRON_SECRET`
3. Copies every `cp-*.service` and `cp-*.timer` to `/etc/systemd/system/`
4. Reloads systemd and enables + starts every timer
5. Prints `systemctl list-timers cp-*.timer`

## Monitor

```bash
# Live tail one cron's output:
journalctl -u cp-monthly-awards.service -f

# Last 50 lines for everything:
journalctl -u 'cp-*.service' -n 50 --no-pager

# When does each timer fire next?
systemctl list-timers 'cp-*.timer' --no-pager

# Was the last run a success?
systemctl status cp-ingest-grants.service
```

## Manual trigger

```bash
systemctl start cp-ingest-grants.service
journalctl -u cp-ingest-grants.service -f
```

## Add a new cron

1. Drop a new `<name>.mjs` next to the existing ones, pointing at the Vercel
   path.
2. Add a matching `cp-<name>.service` + `cp-<name>.timer`.
3. Re-run `bash install.sh` on the VPS.

## Removing a Vercel cron at the same time

Once a timer is healthy on the VPS, delete the matching entry from
`dashboard/vercel.json` and ship a deploy. Otherwise both schedulers will fire
the endpoint and you'll double-run the work.
