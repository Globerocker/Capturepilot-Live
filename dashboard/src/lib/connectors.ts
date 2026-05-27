/**
 * Connector registry — pairs each row in `api_connectors` with a probe
 * function that the hourly health_monitor cron runs to check reachability.
 *
 * To wire a new API:
 *   1. Add a row to `api_connectors` in a migration (or via /admin/connectors).
 *   2. Add a `probes` entry below keyed by the same slug.
 *   3. The next cron tick will probe + alert + render in /admin/health.
 *
 * Each probe returns `{ status, detail }`. Probes MUST timeout fast (≤ 6s)
 * and MUST swallow exceptions — the health monitor itself can't crash on
 * a misbehaving upstream.
 */

export type ProbeResult = {
    status: "ok" | "error" | "unknown" | "disabled";
    detail?: string;
};

async function safeFetch(url: string, init?: RequestInit, timeoutMs = 6000): Promise<Response | null> {
    try {
        return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch {
        return null;
    }
}

async function probeBearer(url: string, token: string | undefined): Promise<ProbeResult> {
    if (!token) return { status: "disabled", detail: "env var unset" };
    const res = await safeFetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res) return { status: "error", detail: "network/timeout" };
    if (res.status === 401 || res.status === 403) return { status: "error", detail: `auth failed (HTTP ${res.status})` };
    return { status: res.ok ? "ok" : "error", detail: res.ok ? undefined : `HTTP ${res.status}` };
}

async function probeApiKeyHeader(url: string, header: string, key: string | undefined): Promise<ProbeResult> {
    if (!key) return { status: "disabled", detail: "env var unset" };
    const res = await safeFetch(url, { headers: { [header]: key } });
    if (!res) return { status: "error", detail: "network/timeout" };
    if (res.status === 401 || res.status === 403) return { status: "error", detail: `auth failed (HTTP ${res.status})` };
    return { status: res.ok ? "ok" : "error", detail: res.ok ? undefined : `HTTP ${res.status}` };
}

export const probes: Record<string, () => Promise<ProbeResult>> = {
    "sam-gov": async () => {
        const k = process.env.SAM_API_KEY;
        if (!k) return { status: "disabled", detail: "SAM_API_KEY unset" };
        const today = new Date();
        const mm = String(today.getMonth() + 1).padStart(2, "0");
        const dd = String(today.getDate()).padStart(2, "0");
        const date = `${mm}/${dd}/${today.getFullYear()}`;
        return probeApiKeyHeader(
            `https://api.sam.gov/opportunities/v2/search?postedFrom=${date}&postedTo=${date}&limit=1`,
            "X-Api-Key",
            k,
        );
    },
    "apollo": async () => probeApiKeyHeader("https://api.apollo.io/api/v1/auth/health", "X-Api-Key", process.env.APOLLO_API_KEY),
    "resend": async () => probeBearer("https://api.resend.com/domains", process.env.RESEND_API_KEY),
    "stripe": async () => probeBearer("https://api.stripe.com/v1/balance", process.env.STRIPE_SECRET_KEY),
    "openai": async () => probeBearer("https://api.openai.com/v1/models", process.env.OPENAI_API_KEY),
    "deepseek": async () => probeBearer("https://api.deepseek.com/v1/models", process.env.DEEPSEEK_API_KEY),
    "mistral": async () => probeBearer("https://api.mistral.ai/v1/models", process.env.MISTRAL_API_KEY),
    "firecrawl": async () => {
        const k = process.env.FIRECRAWL_API_KEY;
        if (!k) return { status: "disabled", detail: "FIRECRAWL_API_KEY unset" };
        const res = await safeFetch("https://api.firecrawl.dev/v1/scrape", {
            method: "POST",
            headers: { Authorization: `Bearer ${k}`, "Content-Type": "application/json" },
            body: JSON.stringify({ url: "https://example.com", formats: ["markdown"] }),
        });
        if (!res) return { status: "error", detail: "network/timeout" };
        return { status: res.ok ? "ok" : "error", detail: res.ok ? undefined : `HTTP ${res.status}` };
    },
    "hubspot": async () => {
        const token = process.env.HUBSPOT_API_KEY
            || process.env.HUBSPOT_ACCESS_TOKEN
            || process.env.HUBSPOT_PRIVATE_APP_TOKEN;
        if (!token) return { status: "disabled", detail: "HubSpot token unset" };
        return probeBearer("https://api.hubapi.com/account-info/v3/details", token);
    },
    "supabase": async () => {
        // Verified by the health_monitor caller directly (it already has a
        // Supabase client) — return unknown here so the orchestrator does
        // the actual probe with the existing connection.
        return { status: "unknown", detail: "checked inline by health_monitor" };
    },
    "meta-capi": async () => {
        const token = process.env.META_CAPI_TOKEN || process.env.META_ACCESS_TOKEN;
        if (!token) return { status: "disabled", detail: "META_CAPI_TOKEN unset" };
        return probeBearer("https://graph.facebook.com/v21.0/me", token);
    },
    "meta-webhook": async () => {
        return process.env.META_APP_SECRET
            ? { status: "ok", detail: "secret configured" }
            : { status: "disabled", detail: "META_APP_SECRET unset" };
    },
    "vercel": async () => probeBearer("https://api.vercel.com/v9/user", process.env.VERCEL_TOKEN),

    // PDL — added 2026-05-27 as Apollo people/match fallback.
    "pdl": async () => {
        const k = process.env.PDL_API_KEY;
        if (!k) return { status: "disabled", detail: "PDL_API_KEY unset" };
        // /v5/company/enrich is the cheapest 2xx probe (1 credit but only on
        // success; 404 doesn't charge). Use a known company.
        return probeApiKeyHeader("https://api.peopledatalabs.com/v5/company/enrich?website=apple.com", "X-Api-Key", k);
    },

    // SAM.gov KEY 2 (contractor scope) — added 2026-05-27 with the key split.
    // Probes the entity-information endpoint that this key actually serves.
    "sam-gov-contractors": async () => {
        const k = process.env.SAM_API_KEY_2;
        if (!k) return { status: "disabled", detail: "SAM_API_KEY_2 unset" };
        return probeApiKeyHeader("https://api.sam.gov/entity-information/v3/entities?registrationStatus=A&size=1", "X-Api-Key", k);
    },

    // Hostinger-VPS hosted services. Each is reached through Traefik with a
    // bearer token; the URL constants and tokens live in *_URL / *_AUTH_TOKEN
    // env vars. If the URL is unset the connector reports disabled (which is
    // fine — these services are optional integrations).
    "flaresolverr": async () => {
        const url = process.env.FLARESOLVERR_URL;
        const tok = process.env.FLARESOLVERR_AUTH_TOKEN;
        if (!url) return { status: "disabled", detail: "FLARESOLVERR_URL unset" };
        const res = await safeFetch(`${url}/`, { headers: tok ? { Authorization: `Bearer ${tok}` } : {} });
        if (!res) return { status: "error", detail: "network/timeout" };
        return { status: res.ok ? "ok" : "error", detail: res.ok ? undefined : `HTTP ${res.status}` };
    },
    "tika": async () => {
        const url = process.env.TIKA_URL;
        const tok = process.env.TIKA_AUTH_TOKEN;
        if (!url) return { status: "disabled", detail: "TIKA_URL unset" };
        const res = await safeFetch(`${url}/version`, { headers: tok ? { Authorization: `Bearer ${tok}` } : {} });
        if (!res) return { status: "error", detail: "network/timeout" };
        return { status: res.ok ? "ok" : "error", detail: res.ok ? undefined : `HTTP ${res.status}` };
    },
    "ollama": async () => {
        const url = process.env.OLLAMA_URL;
        const tok = process.env.OLLAMA_AUTH_TOKEN;
        if (!url) return { status: "disabled", detail: "OLLAMA_URL unset" };
        const res = await safeFetch(`${url}/api/version`, { headers: tok ? { Authorization: `Bearer ${tok}` } : {} });
        if (!res) return { status: "error", detail: "network/timeout" };
        return { status: res.ok ? "ok" : "error", detail: res.ok ? undefined : `HTTP ${res.status}` };
    },
    "searxng": async () => {
        const url = process.env.SEARXNG_URL;
        const tok = process.env.SEARXNG_AUTH_TOKEN;
        if (!url) return { status: "disabled", detail: "SEARXNG_URL unset" };
        const res = await safeFetch(`${url}/`, { headers: tok ? { Authorization: `Bearer ${tok}` } : {} });
        if (!res) return { status: "error", detail: "network/timeout" };
        return { status: res.ok ? "ok" : "error", detail: res.ok ? undefined : `HTTP ${res.status}` };
    },
    "crawl4ai": async () => {
        const url = process.env.CRAWL4AI_URL;
        const tok = process.env.CRAWL4AI_AUTH_TOKEN;
        if (!url) return { status: "disabled", detail: "CRAWL4AI_URL unset" };
        const res = await safeFetch(`${url}/health`, { headers: tok ? { Authorization: `Bearer ${tok}` } : {} });
        if (!res) return { status: "error", detail: "network/timeout" };
        return { status: res.ok ? "ok" : "error", detail: res.ok ? undefined : `HTTP ${res.status}` };
    },
};

/** Days until expiry (negative = already expired, null = no expiry tracked). */
export function daysUntilExpiry(expiresAt: string | null | undefined): number | null {
    if (!expiresAt) return null;
    const ms = new Date(expiresAt).getTime() - Date.now();
    return Math.ceil(ms / 86_400_000);
}

/** Standard threshold — warn when key expires inside this window. */
export const EXPIRY_WARN_DAYS = 14;
