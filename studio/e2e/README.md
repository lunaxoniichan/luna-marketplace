# Studio E2E smoke (Playwright)

Interactive smoke for the **write path** (edit → sync preview → apply) and Phase-4 tabs,
which unit tests cover at the gateway but not end-to-end through the wired UI.

## Run (needs a browser env)

```bash
cd studio
npm install                 # pulls @playwright/test (devDependency)
npx playwright install chromium
npm run test:e2e            # boots `next start` on :3900 via the config webServer
```

`test:e2e` runs `playwright test -c e2e/playwright.config.ts`. The config starts the
Studio with `LUNA_STUDIO_FIXTURES=1` for a deterministic vault.

## Status

Scaffold only — **not executed in the build sandbox** (no browser/download available there).
Wire into CI where chromium can be installed. Not a Phase-4 gate blocker (carry-along).
