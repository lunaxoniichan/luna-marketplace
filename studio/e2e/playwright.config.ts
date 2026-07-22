import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright smoke config for Luna Studio.
 * Runs against a production build (`next build && next start`) so client hydration is
 * stable and interactive clicks (tab switches, panel renders) actually fire — the dev
 * server under headless Playwright has flaky HMR/hydration. Production builds are
 * unblocked by the vendored plugin libs (T14; scripts/vendor-studio.mjs).
 *
 * Prereqs (browser env): `npx playwright install chromium`.
 * Run: `npm run test:e2e` (from studio/) — builds then starts on :3900 automatically.
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
    // Production build+serve — stable hydration for interactive assertions.
    // LUNA_STUDIO_FIXTURES gives a deterministic vault; LUNA_PLUGIN_ROOT resolves it.
    command: "LUNA_PLUGIN_ROOT=.. npm run build && LUNA_STUDIO_FIXTURES=1 LUNA_PLUGIN_ROOT=.. npm run start",
    url: "http://127.0.0.1:3900",
    timeout: 240_000,
    reuseExistingServer: !process.env.CI,
  },
});
