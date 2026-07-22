import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright smoke config for Luna Studio.
 * Runs against the dev server so the interactive VaultWorkspace + Phase-4 tabs are
 * exercised, not just overview render. Dev is the primary Studio mode (`npm run studio`);
 * production `next build` has a known external-module limitation (see next.config.ts).
 *
 * Prereqs (browser env): `npx playwright install chromium`.
 * Run: `npm run test:e2e` (from studio/) — boots the dev server on :3900 automatically.
 */
export default defineConfig({
  testDir: ".",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3900",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Dev server (Turbopack dev resolves external plugin .mjs, unlike prod build).
    // LUNA_STUDIO_FIXTURES gives a deterministic vault for the smoke.
    command: "LUNA_STUDIO_FIXTURES=1 LUNA_PLUGIN_ROOT=.. npm run dev",
    url: "http://127.0.0.1:3900",
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
  },
});
