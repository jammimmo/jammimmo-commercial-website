import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { PROPERTY_SELECT } from '../../scripts/catalogue-artifact.mjs';

/**
 * Keep the original cross-repo sensitive-column regression guard on the actual
 * preparation SELECT. The renderer now consumes only a validated public file.
 */
const SRC = fs.readFileSync(new URL('./supabase.build.ts', import.meta.url), 'utf8');
const cols = PROPERTY_SELECT.toLowerCase();

describe('catalogue preparation leaks no sensitive admin column', () => {
  it('has an explicit SELECT and no database client or credential path in the renderer', () => {
    expect(cols.length).toBeGreaterThan(0);
    expect(SRC).not.toMatch(/createClient|ADMIN_SUPABASE_|\.from\(['"]properties/);
  });

  it.each(['commission_amount', 'negotiable_price', 'caution', 'avance', 'accessibility'])(
    'excludes %s',
    (sensitive) => {
      expect(cols).not.toContain(sensitive);
    },
  );

  // #724972: the exact `gps` must never be selected into the public build — the
  // privacy-safe fuzzed zone comes from the `properties_public_geo` view. If
  // this regresses, the exact coordinate leaks into the static bundle again.
  it('excludes the exact gps column (#724972)', () => {
    expect(cols).not.toMatch(/\bgps\b/);
  });

  it('never selects whole private metadata bags', () => {
    expect(cols.split(',')).not.toContain('attributes');
    expect(cols.split(',')).not.toContain('documents');
  });

  it('still selects the columns the public site renders', () => {
    for (const needed of ['reference', 'title', 'price', 'quartier', 'surface', 'images']) {
      expect(cols).toContain(needed);
    }
  });
});
