import { defineConfig } from '@playwright/test';

// Opt in only when the serial browser acceptance slot is available.
const webkit = process.env.CHAT_UI_WEBKIT === 'true';

export default defineConfig({
  testDir: './tests/chatbot', fullyParallel: false, workers: 1, retries: 0, maxFailures: 1,
  outputDir: './test-results/chatbot', reporter: [['list'], ['html', { outputFolder: 'playwright-report/chatbot', open: 'never' }]],
  timeout: 45_000,
  use: { baseURL: 'http://127.0.0.1:4324', reducedMotion: 'reduce', video: 'on', screenshot: 'on', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1366, height: 850 } } },
    { name: 'portrait', use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: 'landscape', use: { browserName: 'chromium', viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true } },
    ...(webkit ? [
      { name: 'webkit-portrait', use: { browserName: 'webkit' as const, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 } },
      { name: 'webkit-landscape', use: { browserName: 'webkit' as const, viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 } },
    ] : []),
  ],
  webServer: {
    command: 'pnpm dev --port 4324 --host 127.0.0.1', port: 4324, reuseExistingServer: false, timeout: 120_000,
    env: { PUBLIC_CHAT_UI_QA: 'true', ADMIN_SUPABASE_URL: '', ADMIN_SUPABASE_SERVICE_ROLE_KEY: '', PUBLIC_ANALYTICS_ENDPOINT: '', PUBLIC_CLARITY_PROJECT_ID: '' },
  },
});
