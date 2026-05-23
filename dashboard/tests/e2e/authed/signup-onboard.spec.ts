import { test, expect } from "@playwright/test";

/**
 * Authed happy-path: signup → onboarding → first match.
 *
 * Skipped unless TEST_USER_EMAIL + TEST_USER_PASSWORD are set in the env.
 * Use a dedicated test account in staging — these specs create profile
 * data so they shouldn't share an account with anything real.
 *
 * The signup flow uses a per-test email so multiple parallel workers don't
 * collide. Cleanup is handled by the db_cleanup cron — test profiles tagged
 * with "qa@" in the email are explicitly archived after 24h.
 */

const HAVE_CREDS = !!(process.env.TEST_USER_EMAIL && process.env.TEST_USER_PASSWORD);

test.describe("authed flows", () => {
    test.skip(!HAVE_CREDS, "Set TEST_USER_EMAIL + TEST_USER_PASSWORD to run authed E2E");

    test("signup → onboard → dashboard", async ({ page }) => {
        const email = `qa+${Date.now()}@capturepilot.test`;
        const password = "TestPass-" + Date.now();

        await page.goto("/signup");
        await page.locator('input[type="email"]').fill(email);
        await page.locator('input[type="password"]').first().fill(password);
        const submit = page.locator('button[type="submit"]').first();
        await submit.click();

        // Either lands on /onboard (new signup) or /dashboard (auto-login).
        await page.waitForURL(/\/(onboard|dashboard)/, { timeout: 15_000 });
        expect(page.url()).toMatch(/\/(onboard|dashboard)/);
    });

    test("existing user login → dashboard", async ({ page }) => {
        await page.goto("/login");
        await page.locator('input[type="email"]').fill(process.env.TEST_USER_EMAIL!);
        await page.locator('input[type="password"]').fill(process.env.TEST_USER_PASSWORD!);
        await page.locator('button[type="submit"]').first().click();
        await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
        await expect(page.getByText(/opportunities|matches|pipeline/i).first()).toBeVisible();
    });
});
