/**
 * DeepSeek V3.2/V4 wrapper for cheap LLM calls. Also dispatches to Ollama
 * (self-hosted) or OpenAI depending on the `provider` option + env vars.
 *
 * All three providers use the OpenAI Chat Completions wire format, so we only
 * flip the base URL, auth header, and default model.
 *
 * Cost reference (2026-04):
 *   OpenAI gpt-4o-mini  — $0.15/M input  · $0.60/M output
 *   DeepSeek V3.2       — $0.14/M input  · $0.28/M output  (cached: $0.03/M)
 *   Ollama qwen2.5:7b   — $0.00 (self-hosted on Hostinger VPS)
 *
 * Use `callLLM` for non-critical generation (summaries, classification,
 * long-context passes over RFPs). Use OpenAI directly for the high-quality
 * final pass on customer-facing proposal text.
 *
 * Set LLM_PROVIDER=ollama in a dev .env.local to route every callLLM through
 * the self-hosted model — useful for iterating on prompts without burning
 * paid API budget. Production should leave it unset.
 */

export type LLMMessage = {
    role: "system" | "user" | "assistant";
    content: string;
};

export type LLMProvider = "openai" | "deepseek" | "ollama" | "gemini";

export interface LLMOptions {
    model?: string;
    temperature?: number;
    max_tokens?: number;
    response_format?: { type: "json_object" | "text" };
    /** Force provider. Default = auto (LLM_PROVIDER env, then DeepSeek if key, else OpenAI) */
    provider?: LLMProvider | "auto";
}

export interface LLMResponse {
    content: string;
    provider: LLMProvider;
    model: string;
    prompt_tokens?: number;
    completion_tokens?: number;
}

function pickProvider(opts: LLMOptions): LLMProvider {
    if (opts.provider && opts.provider !== "auto") return opts.provider;
    const envOverride = (process.env.LLM_PROVIDER || "").toLowerCase();
    if (["ollama", "deepseek", "openai", "gemini"].includes(envOverride)) {
        return envOverride as LLMProvider;
    }
    // Auto: Gemini Flash first (free tier / cheapest), then DeepSeek, then OpenAI.
    if (process.env.GEMINI_API_KEY) return "gemini";
    return process.env.DEEPSEEK_API_KEY ? "deepseek" : "openai";
}

interface ProviderConfig {
    baseUrl: string;
    authHeader: string | null;
    defaultModel: string;
}

function providerConfig(provider: LLMProvider): ProviderConfig {
    switch (provider) {
        case "openai":
            return {
                baseUrl: "https://api.openai.com/v1/chat/completions",
                authHeader: process.env.OPENAI_API_KEY ? `Bearer ${process.env.OPENAI_API_KEY}` : null,
                defaultModel: "gpt-4o-mini",
            };
        case "deepseek":
            return {
                baseUrl: "https://api.deepseek.com/v1/chat/completions",
                authHeader: process.env.DEEPSEEK_API_KEY ? `Bearer ${process.env.DEEPSEEK_API_KEY}` : null,
                defaultModel: "deepseek-chat",
            };
        case "gemini":
            // Gemini via its OpenAI-compatible endpoint — same wire format.
            return {
                baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
                authHeader: process.env.GEMINI_API_KEY ? `Bearer ${process.env.GEMINI_API_KEY}` : null,
                defaultModel: process.env.GEMINI_MODEL || "gemini-2.5-flash",
            };
        case "ollama": {
            const base = process.env.OLLAMA_URL;
            if (!base) {
                throw new Error("OLLAMA_URL not configured");
            }
            return {
                baseUrl: `${base.replace(/\/$/, "")}/v1/chat/completions`,
                authHeader: process.env.OLLAMA_AUTH_TOKEN ? `Bearer ${process.env.OLLAMA_AUTH_TOKEN}` : null,
                defaultModel: process.env.OLLAMA_DEFAULT_MODEL || "qwen2.5:7b-instruct",
            };
        }
    }
}

async function callOnce(
    provider: LLMProvider,
    messages: LLMMessage[],
    opts: LLMOptions = {}
): Promise<LLMResponse> {
    const config = providerConfig(provider);

    // OpenAI + DeepSeek require an API key; Ollama is open within its network
    // but Traefik enforces a bearer token via OLLAMA_AUTH_TOKEN. If we resolved
    // to a paid provider with no key, fail loudly so we don't silently fall
    // back to a free tier that doesn't exist.
    if (provider !== "ollama" && !config.authHeader) {
        throw new Error(`${provider.toUpperCase()}_API_KEY not configured`);
    }

    const baseUrl = config.baseUrl;
    const model = opts.model || config.defaultModel;

    const payload: Record<string, unknown> = {
        model,
        messages,
        temperature: opts.temperature ?? 0.4,
        max_tokens: opts.max_tokens ?? 2000,
    };
    if (opts.response_format) {
        payload.response_format = opts.response_format;
    }

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (config.authHeader) headers["Authorization"] = config.authHeader;

    const res = await fetch(baseUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
    });

    if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`${provider} LLM call failed (${res.status}): ${body.slice(0, 500)}`);
    }

    const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    const content = data.choices?.[0]?.message?.content || "";
    return {
        content,
        provider,
        model,
        prompt_tokens: data.usage?.prompt_tokens,
        completion_tokens: data.usage?.completion_tokens,
    };
}

/**
 * Public entry point. Routes to the chosen provider (Gemini first by default)
 * and falls back to OpenAI if the primary errors or rate-limits — so a Gemini
 * 429 on the free tier never drops a job. An explicitly forced provider
 * (opts.provider or LLM_PROVIDER) is used as-is with no fallback.
 */
export async function callLLM(
    messages: LLMMessage[],
    opts: LLMOptions = {}
): Promise<LLMResponse> {
    const forced = (opts.provider && opts.provider !== "auto") || !!(process.env.LLM_PROVIDER || "").trim();
    const primary = pickProvider(opts);
    const chain: LLMProvider[] = [primary];
    if (!forced && primary !== "openai" && process.env.OPENAI_API_KEY) chain.push("openai");

    let lastErr: unknown;
    for (const provider of chain) {
        try {
            return await callOnce(provider, messages, opts);
        } catch (e) {
            lastErr = e;
            const isLast = provider === chain[chain.length - 1];
            console.warn(`[llm] ${provider} failed${isLast ? "" : " — falling back to OpenAI"}: ${(e as Error).message?.slice(0, 160)}`);
        }
    }
    throw lastErr;
}

/**
 * JSON-mode helper. Parses the response, throws if malformed.
 * Automatically retries once with a stricter system prompt on parse failure.
 */
export async function callLLMJson<T = unknown>(
    messages: LLMMessage[],
    opts: LLMOptions = {}
): Promise<T> {
    const resp = await callLLM(messages, {
        ...opts,
        response_format: { type: "json_object" },
    });
    try {
        return JSON.parse(resp.content) as T;
    } catch {
        // Retry once with an explicit "return only JSON" instruction
        const retry = await callLLM(
            [
                { role: "system", content: "You must return ONLY valid JSON. No markdown, no commentary." },
                ...messages,
            ],
            { ...opts, response_format: { type: "json_object" } }
        );
        return JSON.parse(retry.content) as T;
    }
}
