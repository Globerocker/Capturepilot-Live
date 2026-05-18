# Git hooks

Versioned git hooks for this repo. One-time setup per developer machine:

```bash
git config core.hooksPath .githooks
```

After that, hooks in this directory run on the usual git events.

## What's enabled

- **pre-commit** — Runs `tsc --noEmit` against `dashboard/`, `website/`, and `americurial/`, but only for subprojects that have staged `.ts` / `.tsx` files. Uses an incremental cache (`.tsc-precommit.tsbuildinfo`) so subsequent runs are fast.

## Bypass

In a genuine hot-fix where the type error is being fixed in the next commit:

```bash
git commit --no-verify -m "wip"
```

Use sparingly — CI will still catch the error.
