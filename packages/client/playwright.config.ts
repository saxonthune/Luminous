import { defineConfig, devices } from '@playwright/test'

// Dedicated e2e ports, distinct from the dev stack (5200/4080), so the suite
// always tests THIS checkout. Reusing a running dev server silently tests
// whatever code that server happens to serve — e.g. the main repo while the
// suite runs in a worktree.
const CLIENT_PORT = 5300
const API_PORT = 4380

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${CLIENT_PORT}`,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // The suite serves its own fixture workspace, never the live .luminous —
    // the app writes documents, so live data churns out from under assertions.
    command: `PORT=${API_PORT} pnpm -C ../server exec tsx src/index.ts -- --dir ../client/e2e/fixtures & CLIENT_PORT=${CLIENT_PORT} API_PORT=${API_PORT} pnpm dev`,
    url: `http://localhost:${CLIENT_PORT}`,
    reuseExistingServer: false,
    timeout: 30000,
  },
})
