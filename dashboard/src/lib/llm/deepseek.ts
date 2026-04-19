/**
 * DeepSeek V3.2/V4 wrapper for cheap LLM calls.
 *
 * DeepSeek's REST API is OpenAI-Chat-Completions-compatible, so we use the
 * same shape and only flip the base URL + model when DEEPSEEK_API_KEY is set.
 *
 * Cost reference (2026-04):
 *   OpenAI gpt-4o-mini  — $0.15/M input  · $0.60/M output
 *   DeepSeek V3.2       — $0.14/M input  · $0.28/M output  (cached: $0.03/M)
 *
 * Use `callLLM` for non-critical generation (summaries, classification,
 * long-context passes over RFPs). Use OpenAI directly for the high-quality
 * final pass on customer-facing proposal text.
 */

export type LLMMessage = {
    role: "system" | "user" | "assistant";
    content: string;
};

export interface LLMOptions {
    model?: string;
    temperature?: number;
    max_tokens?: number;
    response_format?: { type: "json_object" | "text" };
    /** Force provider. Default = auto (DeepSeek if key available, else OpenAI) */
    provider?: "openai" | "deepseek" | "auto";
}

export interface LLMResponse {
    content: string;
    provider: "openai" | "deepseek";
    model: string;
    prompt_tokens?: number;
    completion_tokens?: number;
}

function pickProvider(opts: LLMOptions): "openai" | "deepseek" {
    if (opts.provider === "openai") return "openai";
    if (opts.provider === "deepseek") return "deepseek";
    return process.env.DEEPSEEK_API_KEY ? "deepseek" : "openai";
}

export async function callLLM(
    messages: LLMMessage[],
    opts: LLMOptions = {}
): Promise<LLMResponse> {
    const provider = pickProvider(opts);

    const baseUrl =
        provider === "deepseek"
            ? "https://api.deepseek.com/v1/chat/completions"
            : "https://api.openai.com/v1/chat/completions";

    const apiKey =
        provider === "deepseek"
            ? process.env.DEEPSEEK_API_KEY
            : process.env.OPENAI_API_KEY;

    if (!apiKey) {
        throw new Error(`${provider.toUpperCase()}_API_KEY not configured`);
    }

    const model =
        opts.model ||
        (provider === "deepseek" ? "deepseek-chat" : "gpt-4o-mini");

    const payload: Record<string, unknown> = {
        model,
        messages,
        temperature: opts.temperature ?? 0.4,
        max_tokens: opts.max_tokens ?? 2000,
    };
    if (opts.response_format) {
        payload.response_format = opts.response_format;
    }

    const res = await fetch(baseUrl, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
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
