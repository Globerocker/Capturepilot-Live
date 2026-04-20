/**
 * Company website crawler — unified-pipeline version.
 *
 * Historical context: this file used to drive a Crawlee/Cheerio crawler that
 * couldn't see JS-rendered sites and ran bare regex over raw HTML, giving bad
 * results on modern SPAs (see `src/lib/quick-checker/` for the audit).
 *
 * It now delegates to the unified Quick Checker pipeline (Firecrawl-rendered
 * markdown → OpenAI Structured Outputs → validated phones/emails →
 * whitelist-constrained NAICS). We still expose the original `CrawlResult`
 * shape so every existing consumer keeps working — the adapter lives in
 * `quick-checker/index.ts::toLegacyCrawlData`.
 */

import type { CrawlResult } from "./types";
import { emptyData } from "./types";
import { runQuickCheck, toLegacyCrawlData } from "@/lib/quick-checker";
import type { CrawlData } from "./types";

export async function analyzeCompany(
    companyName: string,
    website: string,
): Promise<CrawlResult> {
    const started = Date.now();

    if (!website) {
        return { success: false, data: emptyData(), errors: ["Missing website"] };
    }

    try {
        const result = await runQuickCheck(website, {
            companyName: companyName || undefined,
            maxPages: 5,
        });
        const legacy = toLegacyCrawlData(result) as unknown as CrawlData;
        const success = (result.raw_pages.length > 0) && (
            legacy.description.length > 0 ||
            legacy.services.length > 0 ||
            legacy.company_name.length > 0
        );
        return {
            success,
            data: legacy,
            errors: result.errors,
        };
    } catch (err) {
        return {
            success: false,
            data: {
                ...emptyData(),
                crawl_duration_ms: Date.now() - started,
            },
            errors: [(err as Error).message || "Quick Checker pipeline failed"],
        };
    }
}
