import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Unit-test runner for the vitrine's PURE logic (formatting, reference parsing,
// price estimation, risk scoring, budget matching, place filtering…). Astro
// components and React islands are covered by the Playwright e2e + visual
// suites; Vitest stays focused on the deterministic, network-free functions in
// src/lib and the islands' extracted logic modules.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@catalogue-public?raw': fileURLToPath(new URL('./src/data/public-catalogue-20261031.json', import.meta.url)) + '?raw',
      '@catalogue-public': fileURLToPath(new URL('./src/data/public-catalogue-20261031.json', import.meta.url)),
      '@catalogue-facts': fileURLToPath(new URL('./src/data/public-property-facts-20261031.json', import.meta.url)),
      '@catalogue-approval': fileURLToPath(new URL('./src/data/public-catalogue-approval.json', import.meta.url)),
    },
  },
  test: {
    // Default to Node; DOM-touching specs opt in with a
    // `// @vitest-environment happy-dom` header comment.
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/unit/**/*.test.ts'],
    globals: false,
    clearMocks: true,
  },
});
