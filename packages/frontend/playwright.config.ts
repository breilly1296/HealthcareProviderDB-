import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E Test Configuration
 * See https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  // Test directory
  testDir: './e2e',

  // Run tests in parallel
  fullyParallel: true,

  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,

  // Retry on CI only
  retries: process.env.CI ? 2 : 0,

  // Opt out of parallel tests on CI
  workers: process.env.CI ? 1 : undefined,

  // Reporter to use
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
  ],

  // Shared settings for all the projects below
  use: {
    // Base URL for tests
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',

    // Collect trace when retrying the failed test
    trace: 'on-first-retry',

    // Take screenshot on failure
    screenshot: 'only-on-failure',

    // Video recording
    video: 'on-first-retry',
  },

  // Timeout settings
  timeout: 30000, // 30 seconds per test
  expect: {
    timeout: 5000, // 5 seconds for assertions
  },

  // Configure projects for major browsers
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Run servers before starting the tests
  webServer: [
    // Mock API server (port 3001) — provides canned responses so tests
    // don't require the real backend.  Always started; in local dev you can
    // stop it and point NEXT_PUBLIC_API_URL at a real backend instead.
    {
      command: 'node e2e/mock-api.mjs',
      url: 'http://localhost:3001/health',
      reuseExistingServer: !process.env.CI,
      timeout: 10000,
    },
    // Frontend Next.js server (port 3000)
    {
      command: process.env.CI ? 'npm run start' : 'npm run dev',
      url: 'http://localhost:3000',
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
  ],
});
