-- 087: portal_cookies cooldown column
--
-- When the Playwright worker hits a CF challenge it can't pass, it stamps
-- portal_cookies.last_blocked_at so enqueue_backfill stops re-queueing warm +
-- scrape jobs for that host for ~6h. Without this, the queue burns Railway
-- compute hammering strict-Turnstile tenants every cron tick.

alter table portal_cookies add column if not exists last_blocked_at timestamptz;
create index if not exists portal_cookies_last_blocked_idx on portal_cookies (last_blocked_at);
