# CapturePilot Zapier Integration

Zapier Platform CLI app that connects CapturePilot to 7,000+ other tools.

## Setup (one-time)

```bash
cd tools/zapier-app
npm install
npx zapier login           # one-time; paste your zapier.com deploy key
npx zapier register "CapturePilot"   # creates the integration on zapier.com
npx zapier push
```

## Iterating

After any code change:

```bash
npx zapier push
npx zapier logs --type=error    # tail live errors
```

## Promoting to public

Once at least 1 paying user is on the integration:

```bash
npx zapier promote 1.0.0
```

Zapier's review team has a ~7-day SLA. Expect to round-trip 1–2 times before
the integration is listed publicly.

## Files

| File | Purpose |
|---|---|
| `index.js` | Platform module manifest |
| `authentication.js` | Bearer-token auth via `/api/integrations/tokens` |
| `triggers/` | Webhook-hook subscriptions — fires Zaps |
| `creates/` | Actions a Zap can take against CapturePilot |
| `searches/` | Lookup actions |

## Server endpoints it talks to

- `POST /api/integrations/webhooks?zapier=subscribe` — install hook
- `DELETE /api/integrations/webhooks?zapier=unsubscribe&id=` — remove
- `POST /api/pursuits` — (to be implemented) add pursuit action
- `GET /api/opportunities/search` — (to be implemented) find opportunity
