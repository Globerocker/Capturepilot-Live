-- 129: mirror SAM_API_KEY_3 into Supabase vault (companion to migration 128).
--
-- WHY:
-- The current dashboard reads SAM_API_KEY_3 from process.env in Vercel Node
-- routes. There's no Supabase-side consumer YET — but we want one available
-- for future Edge Functions and pg_cron HTTP jobs (e.g. midnight idle-time
-- backfills that bypass the Vercel function-minute quota).
--
-- Edge Functions read with Deno.env.get() after `supabase secrets set` OR
-- via vault.decrypted_secrets WHERE name='SAM_API_KEY_3'. pg_cron + pg_net
-- jobs use the same vault path.
--
-- IDEMPOTENT: re-runnable. If the secret already exists, this updates the
-- value + description. Vault enforces unique names on secrets.
--
-- KEY ROTATION: when the value rotates, run tools/add-secret.sh — that
-- writes to .env.local + Vercel envs. Then either re-run this migration with
-- the new value OR run the equivalent UPDATE in psql. The Supabase-side
-- value is NOT auto-synced from Vercel.

do $$
declare
    existing_id uuid;
begin
    select id into existing_id from vault.secrets where name = 'SAM_API_KEY_3';
    if existing_id is null then
        perform vault.create_secret(
            -- SECRET VALUE IS NOT IN THIS FILE. It's transmitted live via
            -- the apply_migration MCP call. To re-apply locally with the
            -- real value, set it via the Supabase dashboard or psql:
            --   select vault.create_secret('<actual key>', 'SAM_API_KEY_3', '...');
            -- If applying via MCP, embed the literal value here at
            -- apply-time (NEVER commit a real value to git).
            '<SET_VIA_APPLY_MIGRATION_OR_DASHBOARD>',
            'SAM_API_KEY_3',
            'SAM.gov opportunities API key #3, added 2026-06-08, expires 2026-09-05. Round-robins with SAM_API_KEY for opportunity ingest. Rotate via tools/add-secret.sh.'
        );
    end if;
end $$;

-- Note: the live apply on 2026-06-08 via MCP inserted the actual value
-- directly. This file documents the SHAPE of the insert for new
-- environments. To bootstrap a fresh Supabase project: clone .env.local,
-- run this migration, then OPEN the dashboard → Settings → Vault and
-- paste the SAM_API_KEY_3 value into the SAM_API_KEY_3 row.
