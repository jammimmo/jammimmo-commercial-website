import { describe, it, expect } from 'vitest';
import { parseInternalRef, isInternalRef, formatPublicRef, refToSlug, slugToRef } from './reference';

describe('parseInternalRef', () => {
  it('parses the legacy VILLE-QUARTIER-YEAR-NNNNN form', () => {
    expect(parseInternalRef('DKR-MERM-2026-00019')).toEqual({
      city: 'DKR',
      quartier: 'MERM',
      year: 2026,
      serial: '00019',
    });
  });
  it('returns null for non-matching refs', () => {
    expect(parseInternalRef('JI-RCH-DKR-2606-0304')).toBeNull();
    expect(parseInternalRef('garbage')).toBeNull();
    expect(parseInternalRef('')).toBeNull();
  });
});

describe('isInternalRef', () => {
  it('is true only for the strict legacy form', () => {
    expect(isInternalRef('DKR-MERM-2026-00019')).toBe(true);
    expect(isInternalRef('JI-RCH-DKR-2606-0304')).toBe(false);
  });
});

describe('formatPublicRef', () => {
  it('uses the parsed serial for legacy refs', () => {
    expect(formatPublicRef('DKR-MERM-2026-00019')).toBe('Ref #00019');
  });
  it('falls back to the trailing numeric block for new 5-segment refs', () => {
    expect(formatPublicRef('JI-RCH-DKR-2606-0304')).toBe('Ref #0304');
  });
  it('shows the ref as-is when there is no trailing number', () => {
    expect(formatPublicRef('ABC')).toBe('Ref ABC');
  });
  it('never returns "#—": empty ref yields empty string so callers can hide the chip', () => {
    expect(formatPublicRef('')).toBe('');
    expect(formatPublicRef(null)).toBe('');
    expect(formatPublicRef(undefined)).toBe('');
  });
});

describe('refToSlug / slugToRef', () => {
  it('round-trips through lower/upper case', () => {
    const ref = 'DKR-MERM-2026-00019';
    expect(refToSlug(ref)).toBe('dkr-merm-2026-00019');
    expect(slugToRef(refToSlug(ref))).toBe(ref);
  });
});
