import { test, expect } from "@playwright/test";

/**
 * Public-surface smoke tests. Don't require auth, run on every deploy.
 *
 * Tagged @smoke so CI can do a fast run (`--grep @smoke`) without spinning
 * up authenticated flows. Catches the most common deploy-blocking regression
 * class: a page that 500s or 404s.
 */

test.describe("public pages @smoke", () => {
    test("home redirects somewhere reasonable", async ({ page }) => {
        const res = await page.goto("/");
        expect(res?.status() ?? 0).toBeLessThan(500);
    });

    test("/login renders the login form", async ({ page }) => {
        await page.goto("/login");
        await expect(page.locator('input[type="email"]')).toBeVisible();
    });

    test("/signup renders the signup form", async ({ page }) => {
        await page.goto("/signup");
        await expect(page.locator('input[type="email"]')).toBeVisible();
    });

    test("/check renders the Quick Checker form", async ({ page }) => {
        await page.goto("/check");
        // The page has a "Run check" or similar CTA + a website input.
        await expect(page.locator('input[type="url"], input[name="website"], input[placeholder*="website" i]').first()).toBeVisible({ timeout: 10_000 });
    });

    test("/pricing lists at least one paid tier", async ({ page }) => {
        const res = await page.goto("/pricing");
        // Some installs don't expose /pricing publicly — accept 200 or 404.
        if (res && res.status() === 404) return;
        await expect(page.getByText(/pro|starter|plan/i).first()).toBeVisible();
    });

    test("/privacy reachable", async ({ page }) => {
        const res = await page.goto("/privacy");
        expect(res?.status() ?? 0).toBeLessThan(500);
    });
});

test.describe("admin gates @smoke", () => {
    // These pages MUST redirect unauth'd users away. No 500s, no leaked
    // admin chrome. Mirrors what tools/30_smoke_admin.mjs already enforces
    // at the route level, but uses a real browser to also catch
    // client-side guards that fail silently in pure-fetch land.
    const ADMIN_PAGES = [
        "/admin/overview",
        "/admin/clients",
        "/admin/leads",
        "/admin/opportunities",
        "/admin/crons",
        "/admin/tools",
        "/admin/health",
    ];

    for (const path of ADMIN_PAGES) {
        test(`${path} redirects unauth'd users`, async ({ page }) => {
            const res = await page.goto(path);
            // Three valid outcomes:
            //   - 302/307 redirect to /login
            //   - 200 page that does a client-side redirect (we land on /login)
            //   - 401 if the layout SSR'd a JSON error (rare)
            expect(res?.status() ?? 0).toBeLessThan(500);
            // Should not see the admin chrome.
            await expect(page.getByText(/admin console/i)).not.toBeVisible({ timeout: 3_000 });
        });
    }
});
