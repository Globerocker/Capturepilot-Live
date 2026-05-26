# CapturePilot Playwright Worker

Headless-Chromium worker that fills SLED opportunity descriptions for SPA portals (Bonfire, OpenGov, TX SmartBuy, Cleveland, eMaryland, NC eVP, etc.) which Vercel's serverless can't crawl because they require a real JavaScript runtime / CF cookie jar.

Runs as a long-lived process; polls Supabase for rows with empty descriptions matching SPA host patterns, scrapes via Chromium, writes back. **Not part of the Vercel deployment** — runs on Railway / Fly / Render.

---

## Deploy to Railway (recommended, $5/mo Hobby plan)

You need:
- A Railway account (https://railway.app — free signup; $5/mo when worker is live)
- `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_KEY` from the existing Vercel env

**5 steps:**

1. **Sign in to Railway**, click **New Project** → **Deploy from GitHub repo** → pick the `Capturepilot-Live` (or `CaptiorpilotV3`) repo.

2. **Set the root directory** in the project's Settings → Build → set **Root Directory** to `tools/playwright-worker`. This tells Railway to ignore the rest of the repo and only build this folder's `Dockerfile`.

3. **Add the two environment variables** in Settings → Variables:
   - `NEXT_PUBLIC_SUPABASE_URL` — paste the same value as in Vercel (`https://ryxgjzehoijjvczqkhwr.supabase.co`)
   - `SUPABASE_SERVICE_KEY` — same as Vercel (the long `eyJ…` service-role JWT)
   - *(optional)* `WORKER_BATCH_SIZE=8`, `WORKER_POLL_INTERVAL_MS=60000` — defaults are fine.

4. **Deploy**. Railway will detect the Dockerfile, build the Playwright image (~3 min first time, cached after), and start the worker. Watch the **Logs** tab — you should see `[worker] starting Playwright worker` then `[worker] batch of N rows`.

5. **Verify it's enriching**: open Supabase SQL Editor and run:
   ```sql
   select count(*) from opportunities
   where source = 'sled' and length(description) >= 200
     and last_crawled_at > now() - interval '15 minutes';
   ```
   Should grow by ~5-15 every minute after the first batch.

That's it. Railway runs the worker 24/7 in a 1 vCPU / 1 GB container — about $5/mo at sustained load.

---

## Alternative: Fly.io (slightly cheaper, more setup)

Fly has a free allowance that covers ~720 hrs/mo of a `shared-cpu-1x` VM with 256 MB RAM. Playwright needs more than 256 MB to launch Chromium reliably; you'll want to upgrade to `shared-cpu-1x@512MB` which is ~$2.30/mo.

```bash
brew install flyctl
fly auth login
cd tools/playwright-worker
fly launch --no-deploy   # accept defaults, no Postgres, no Redis
fly secrets set NEXT_PUBLIC_SUPABASE_URL='https://ryx...' SUPABASE_SERVICE_KEY='eyJ...'
fly deploy
fly logs
```

---

## What it does (the code in one paragraph)

`worker.js` runs an infinite loop. Every 60s it queries Supabase for SLED rows where `description IS NULL OR length(description) = 0` AND `link` matches one of the SPA host patterns (Bonfire, OpenGov, TX SmartBuy, eMaryland, NC eVP, etc). For each batch (default 8 rows), it launches a single Chromium context (cookies persist within the batch — cuts Cloudflare friction ~3x), navigates page-by-page, waits for content selectors, extracts the bid body via `innerText`, and writes it back. Failures bump `last_crawled_at` so the same dead-end rows don't dominate every tick.

## Tuning

- **Going too fast?** Increase the 1500 ms inter-page sleep in `worker.js`. Some portals (Bonfire especially) start CF-challenging us if we hit >4 pages/sec.
- **Worker keeps restarting?** Check Railway logs for `out of memory`. Bump to 2 GB.
- **Cloudflare blocks everything?** Add a real `cookie` from a manual Chrome session in `WORKER_USER_AGENT` + a static cookie env var. Bonfire's CF cookie persists ~2 hrs.

## What this does NOT enrich

- ProcureWare / BidExpress / DemandStar — these are full vendor logins. You'd need a paid account per portal.
- NY-SCR — requires a NYS vendor account login.
- ~150 rows in our DB are behind these and stay unenrichable without operator-provided credentials.
