import { defineConfig } from '@playwright/test';
import { selection, origin } from './qa/public-qualification/selection.mjs';

const selected = selection();
const quoted = (value: string) => "'" + value.replace(/'/g, "'\\''") + "'";
export default defineConfig({
  testDir: './tests/public-qualification', testMatch: 'selected.spec.ts',
  fullyParallel: false, workers: 1, retries: 0, maxFailures: 1, timeout: 90_000,
  outputDir: selected.output + '/browser/' + selected.profile,
  reporter: [['list'], ['json', { outputFile: selected.output + '/' + selected.profile + '-results.json' }]],
  use: { baseURL: origin, colorScheme: 'light', contextOptions: { reducedMotion: 'no-preference' },
    video: { mode: 'on', size: { width: selected.width, height: selected.height } },
    screenshot: 'on', trace: 'off', serviceWorkers: 'block', },
  projects: [{ name: selected.profile, use: { browserName: selected.browserName,
    viewport: { width: selected.width, height: selected.height } } }],
  // Compile is a separate root-owned step. This serves only the compiled local
  // HTML; it cannot run an Astro API route or acquire a Cloudflare binding.
  webServer: { command: 'python3 qa/public-qualification/serve.py --directory ' + quoted(selected.output + '/html'),
    url: origin + '/contact/', reuseExistingServer: false, timeout: 30_000 },
});
