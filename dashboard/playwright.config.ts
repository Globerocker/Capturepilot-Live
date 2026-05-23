import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E config — runs against either a local dev server or the
 * deployed production URL, configurable via PLAYWRIGHT_BASE_URL.
 *
 * Two test scopes:
 *   - tests/e2e/smoke/*    — public surface, no auth needed
 *   - tests/e2e/authed/*   — requires a test user; set TEST_USER_EMAIL +
 *                            TEST_USER_PASSWORD in the env
 *
 * Local dev:
 *   npm run dev (in another terminal)
 *   PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test
 *
 * CI / staging:
 *   PLAYWRIGHT_BASE_URL=https://app.capturepilot.com npx playwright test --grep @smoke
 */
export default defineConfig({
    testDir: "./tests/e2e",
    timeout: 30_000,
    expect: { timeout: 5_000 },
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 2 : undefined,
    reporter: process.env.CI ? "github" : "list",

    use: {
        baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000",
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
        actionTimeout: 8_000,
        navigationTimeout: 15_000,
    },

    projects: [
        {
            name: "chromium",
            use: { ...devices["Desktop Chrome"] },
        },
        // Mobile project so the Pipeline Kanban + Opps Table mobile passes
        // can be regression-tested against a real viewport.
        {
            name: "mobile-chrome",
            use: { ...devices["Pixel 7"] },
            testMatch: /.*mobile\.spec\.ts/,
        },
    ],
});
