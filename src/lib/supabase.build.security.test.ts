import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

/**
 * Regression guard for the cross-repo security fix: PUBLIC_COLUMNS (the build
 * reader's SELECT list) must never re-include the sensitive admin columns that
 * `maskRow` drops — they are what estate-flow needs to REVOKE from the `anon`
 * role. A source-level assertion is the right tool here: the constant is a
 * module-private template literal, and this catches an accidental re-add in PR.
 */
const SRC = fs.readFileSync(new URL('./supabase.build.ts', import.meta.url), 'utf8');
const cols = (SRC.match(/const PUBLIC_COLUMNS = `([\s\S]*?)`/)?.[1] ?? '').toLowerCase();

describe('PUBLIC_COLUMNS leaks no sensitive admin column', () => {
  it('defines the PUBLIC_COLUMNS literal', () => {
    expect(cols.length).toBeGreaterThan(0);
  });

  it.each(['commission_amount', 'negotiable_price', 'caution', 'avance', 'accessibility'])(
    'excludes %s',
    (sensitive) => {
      expect(cols).not.toContain(sensitive);
    },
  );

  it('still selects the columns the public site renders', () => {
    for (const needed of ['reference', 'title', 'price', 'quartier', 'surface', 'images']) {
      expect(cols).toContain(needed);
    }
  });
});
