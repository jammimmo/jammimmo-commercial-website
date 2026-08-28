import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const ENV_EXAMPLE = fs.readFileSync(new URL('../../.env.example', import.meta.url), 'utf8');

describe('.env.example privileged credential hygiene', () => {
  it('uses a non-secret placeholder for the admin Supabase key', () => {
    const matches = ENV_EXAMPLE.match(/^ADMIN_SUPABASE_SERVICE_ROLE_KEY=(.*)$/gm) ?? [];

    expect(matches).toEqual([
      'ADMIN_SUPABASE_SERVICE_ROLE_KEY=YOUR_ADMIN_SUPABASE_SERVICE_ROLE_KEY',
    ]);
  });

  it('does not contain a Supabase secret-key shaped value', () => {
    expect(ENV_EXAMPLE).not.toMatch(/\bsb_secret_[A-Za-z0-9_-]+\b/);
  });
});
