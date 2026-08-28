const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: false, // Run serially to avoid SQLite write lock conflicts
  workers: 1,           // Force sequential test execution
  retries: 0,
  reporter: 'html',
  use: {
    baseURL: 'http://127.0.0.1:8788',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    // 1. Internal Mock Server to stub external integrations
    {
      command: 'node tests/mock-server.js',
      port: 8789,
      reuseExistingServer: !process.env.CI,
    },
    // 2. Wrangler Dev Server dynamically served on port 8788
    {
      command: 'npx wrangler pages dev . --port 8788 --compatibility-date=2026-07-01 --d1=DB=omnivibe-db',
      port: 8788,
      reuseExistingServer: !process.env.CI,
      env: {
        GEMINI_BASE_URL: 'http://127.0.0.1:8789',
        YOUTUBE_BASE_URL: 'http://127.0.0.1:8789',
        STRIPE_BASE_URL: 'http://127.0.0.1:8789',
        MAILCHANNELS_BASE_URL: 'http://127.0.0.1:8789',
        BETA_MODE: 'false',
        STRIPE_API_KEY: 'mock_stripe_key' // Triggers verification fetch in stripe-webhook.js
      }
    }
  ]
});
