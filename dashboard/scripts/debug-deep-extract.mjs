#!/usr/bin/env node
// Direct standalone test of the deep-extract LLM path.
// Usage:  cd dashboard && node --env-file=.env.vercel.production scripts/debug-deep-extract.mjs <domain>

import { spawn } from "node:child_process";
const domain = process.argv[2] || "smartpipe-com.com";
const RUNNER = `
process.env.NODE_OPTIONS = '';
import("./src/lib/quick-checker/deep-extract.ts").then(async ({ runDeepExtract }) => {
    console.log("OLLAMA_URL =", process.env.OLLAMA_URL ? "present" : "MISSING");
    console.log("OLLAMA_AUTH_TOKEN =", process.env.OLLAMA_AUTH_TOKEN ? "present" : "MISSING");
    console.log("OPENAI_API_KEY =", process.env.OPENAI_API_KEY ? "present" : "MISSING");
    console.log("OLLAMA_DEFAULT_MODEL =", process.env.OLLAMA_DEFAULT_MODEL || "(unset, will default to qwen2.5:7b-instruct)");
    console.log("Testing deep extract on:", "${domain}");
    const start = Date.now();
    try {
        const r = await runDeepExtract({ website: "${domain}" });
        const elapsed = Date.now() - start;
        console.log("--- result ---");
        console.log("crawl_source:", r.crawl_source);
        console.log("llm_provider:", r.llm_provider);
        console.log("llm_model:", r.llm_model);
        console.log("pages_scraped:", r.pages_scraped);
        console.log("duration_ms:", r.duration_ms, "(elapsed:", elapsed + "ms)");
        console.log("errors:", r.errors);
        const ex = r.extraction;
        console.log("--- extraction ---");
        console.log("company_name:", ex.company_name);
        console.log("services count:", ex.services.length);
        console.log("nail_down_keywords:", ex.nail_down_keywords);
        console.log("strengths:", ex.strengths);
        console.log("weaknesses:", ex.weaknesses);
        console.log("pitch_angles:", ex.pitch_angles);
    } catch (err) {
        console.error("EXCEPTION:", err);
    }
});
`;
spawn("npx", ["tsx", "-e", RUNNER], { cwd: process.cwd(), stdio: "inherit", env: process.env });
