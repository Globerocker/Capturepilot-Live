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

export type LLMProvider = "openai" | "deepseek" | "ollama";

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
    if (envOverride === "ollama" || envOverride === "deepseek" || envOverride === "openai") {
        return envOverride as LLMProvider;
    }
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

export async function callLLM(
    messages: LLMMessage[],
    opts: LLMOptions = {}
): Promise<LLMResponse> {
    const provider = pickProvider(opts);
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
