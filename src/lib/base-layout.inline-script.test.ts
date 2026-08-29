import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../layouts/BaseLayout.astro', import.meta.url), 'utf8');
const analyticsScript = source.match(
  /\{analyticsEndpoint\s*&&\s*\(\s*<script>([\s\S]*?)<\/script>\s*\)\}/,
)?.[1];

describe('BaseLayout analytics bootstrap', () => {
  it('keeps the conditional inline script discoverable', () => {
    expect(analyticsScript).toBeTruthy();
  });

  it('is valid browser JavaScript without uncompiled TypeScript syntax', () => {
    expect(() => Function(analyticsScript ?? '')).not.toThrow();
  });

  it('schedules replay through the browser idle callback when available', () => {
    expect(analyticsScript).toContain("if ('requestIdleCallback' in window) window.requestIdleCallback(start);");
  });
});
