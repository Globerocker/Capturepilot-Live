import { runDeepExtract } from "../src/lib/quick-checker/deep-extract";

async function main() {
    const domain = process.argv[2] || "smartpipe-com.com";

    console.log("OLLAMA_URL =", process.env.OLLAMA_URL ? `present (${process.env.OLLAMA_URL.length} chars)` : "MISSING/empty");
    console.log("OPENAI_API_KEY =", process.env.OPENAI_API_KEY ? `present (${process.env.OPENAI_API_KEY.length} chars)` : "MISSING");
    console.log("Testing deep extract on:", domain);

    const start = Date.now();
    try {
        const r = await runDeepExtract({ website: domain });
        console.log("--- result ---");
        console.log("crawl_source:", r.crawl_source);
        console.log("llm_provider:", r.llm_provider);
        console.log("llm_model:", r.llm_model);
        console.log("pages_scraped:", r.pages_scraped);
        console.log("duration_ms:", r.duration_ms, "(elapsed:", Date.now() - start, "ms)");
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
}
main();
