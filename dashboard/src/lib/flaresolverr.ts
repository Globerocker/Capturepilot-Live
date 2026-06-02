/**
 * FlareSolverr client — bypass Cloudflare challenges by routing requests
 * through the headless-browser proxy running on the Hostinger VPS.
 *
 * FlareSolverr boots a real Chromium instance, solves the JS / browser-check
 * challenges that Cloudflare serves to plain HTTP clients, and returns the
 * resulting response body + cookies. We use it as a fallback when direct
 * fetches return 403/503 — the bypass adds ~5-10s of latency, so we only
 * pay for it when the cheap path fails.
 *
 * Requires env:
 *   FLARESOLVERR_URL         — e.g. https://flaresolverr.srv1113360.hstgr.cloud
 *   FLARESOLVERR_AUTH_TOKEN  — bearer token from the Traefik label
 *
 * Returns null when the env is unset OR FlareSolverr itself errors — caller
 * should treat null as "couldn't bypass, give up gracefully".
 */

export interface FlareResponse {
    status: number;          // HTTP status from the target site
    body: string;            // response body (HTML or JSON text)
    cookies: Array<{ name: string; value: string; domain: string }>;
}

interface FlareApiResponse {
    status: "ok" | "error";
    message?: string;
    solution?: {
        url?: string;
        status?: number;
        response?: string;
        cookies?: Array<{ name: string; value: string; domain: string }>;
    };
}

/**
 * GET via FlareSolverr.
 */
export async function flareGet(targetUrl: string, opts: { timeoutMs?: number } = {}): Promise<FlareResponse | null> {
    return flareRequest({ cmd: "request.get", url: targetUrl, maxTimeout: opts.timeoutMs ?? 60000 });
}

/**
 * POST via FlareSolverr. `body` must be a string the server will accept under
 * the given Content-Type. For JSON endpoints set contentType to "application/json"
 * and stringify the payload yourself.
 *
 * NOTE: FlareSolverr's request.post historically defaulted to form-urlencoded.
 * Recent builds (v3.3+) honor Content-Type via the `headers` field — we set it
 * explicitly. If your VPS runs an older build and JSON POSTs fail, upgrade the
 * Docker image: `docker pull ghcr.io/flaresolverr/flaresolverr:latest`.
 */
export async function flarePost(targetUrl: string, body: string, opts: { contentType?: string; timeoutMs?: number } = {}): Promise<FlareResponse | null> {
    return flareRequest({
        cmd: "request.post",
        url: targetUrl,
        postData: body,
        maxTimeout: opts.timeoutMs ?? 60000,
        headers: { "Content-Type": opts.contentType ?? "application/x-www-form-urlencoded" },
    });
}

async function flareRequest(payload: Record<string, unknown>): Promise<FlareResponse | null> {
    const url = process.env.FLARESOLVERR_URL;
    const tok = process.env.FLARESOLVERR_AUTH_TOKEN;
    if (!url) return null;
    try {
        const res = await fetch(`${url.replace(/\/$/, "")}/v1`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
            },
            body: JSON.stringify(payload),
            // 75s ceiling — FlareSolverr's own maxTimeout is 60s by default
            // and we want headroom for the network round trip.
            signal: AbortSignal.timeout(75_000),
        });
        if (!res.ok) {
            console.warn(`[flaresolverr] HTTP ${res.status} from gateway`);
            return null;
        }
        const data = (await res.json()) as FlareApiResponse;
        if (data.status !== "ok" || !data.solution) {
            console.warn(`[flaresolverr] error response: ${data.message || "no solution"}`);
            return null;
        }
        return {
            status: data.solution.status ?? 0,
            body: data.solution.response ?? "",
            cookies: data.solution.cookies ?? [],
        };
    } catch (e) {
        console.warn(`[flaresolverr] request failed: ${(e as Error).message}`);
        return null;
    }
}

/**
 * FlareSolverr returns the JSON response inside an HTML page (Chromium wraps
 * raw JSON in <html><head></head><body><pre>...</pre></body></html>). This
 * helper strips that wrapping so the caller can JSON.parse cleanly.
 */
export function extractJsonFromFlareBody(html: string): string {
    // Look for <pre>...</pre> first (Chromium's JSON renderer)
    const preMatch = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
    if (preMatch) {
        // Decode minimal entities
        return preMatch[1]
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .trim();
    }
    // Sometimes the body is raw JSON already (when target sets correct Content-Type)
    const trimmed = html.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) return trimmed;
    // Fallback: return whatever we got, let JSON.parse throw upstream
    return html;
}
