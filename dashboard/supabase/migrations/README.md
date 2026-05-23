# Migrations — Naming Convention

Each migration filename **must** be unique by leading number. Pick the next free number; do not double-up.

```
NNN_short_kebab_description.sql
```

## Known historical conflicts

Four pairs of migrations share a leading number. They've already shipped to prod, so renaming them in-place would force Supabase to re-apply them (or break the migration-name hash check). Leave them alone — the convention applies from this point forward.

| Number | Files | Resolution |
|---|---|---|
| 019 | `019_quick_checker_competitors.sql`, `019_quick_checker_enhancements.sql` | Both applied. Frozen. |
| 039 | `039_beta_invites.sql`, `039_contractors_usaspending.sql` | Both applied. Frozen. |
| 060 | `060_academy_videos.sql`, `060_opportunities_attachable_view.sql` | Both applied. Frozen. |
| 062 | `062_govtribe_cache.sql`, `062_quick_checker_lead_capture_and_startup_pack.sql` | Both applied. Frozen. |

Apply-order for duplicates is alphabetical by suffix — that's the order PostgreSQL's migration tooling reads the directory in. The current ordering happens to work; if you find that one of these dependency-on-the-other matters and the order's wrong, address it with a **new** migration that fixes the state.

## Going forward

Before adding a migration:

```bash
ls dashboard/supabase/migrations/ | tail -3
# Pick the next free number, no exceptions.
```

If two engineers reach for the same number, the second to merge bumps to the next available.

## Why this matters

Supabase tracks applied migrations in `supabase_migrations.schema_migrations` by filename + content hash. Renaming an already-applied file flips its hash and Supabase will either:

1. Re-apply the SQL (breaks idempotency-unsafe migrations), or
2. Error out with "migration already applied but contents changed"

Either way, fixing the mess requires manual DB intervention. Prevent it at the filename level.
