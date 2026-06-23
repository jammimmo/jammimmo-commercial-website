// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { readCompare, writeCompare, clearCompare, COMPARE_KEY, MAX_COMPARE } from './compare';

beforeEach(() => window.localStorage.clear());

describe('compare store', () => {
  it('reads an empty list when nothing is stored', () => {
    expect(readCompare()).toEqual([]);
  });

  it('writes and reads back entries', () => {
    writeCompare([{ reference: 'A', title: 'Bien A' }]);
    expect(readCompare()).toEqual([{ reference: 'A', title: 'Bien A' }]);
  });

  it('caps the stored list at MAX_COMPARE', () => {
    writeCompare(Array.from({ length: MAX_COMPARE + 5 }, (_, i) => ({ reference: `R${i}`, title: `T${i}` })));
    expect(readCompare()).toHaveLength(MAX_COMPARE);
  });

  it('rejects malformed entries on read', () => {
    window.localStorage.setItem(
      COMPARE_KEY,
      JSON.stringify([{ reference: 'A' }, { title: 'x' }, { reference: 'B', title: 'Bien B' }, 42, null]),
    );
    expect(readCompare()).toEqual([{ reference: 'B', title: 'Bien B' }]);
  });

  it('returns [] on invalid JSON', () => {
    window.localStorage.setItem(COMPARE_KEY, 'not json');
    expect(readCompare()).toEqual([]);
  });

  it('clears the list', () => {
    writeCompare([{ reference: 'A', title: 'Bien A' }]);
    clearCompare();
    expect(readCompare()).toEqual([]);
  });

  it('dispatches an update event on write', () => {
    let fired = false;
    window.addEventListener(`${COMPARE_KEY}:update`, () => {
      fired = true;
    });
    writeCompare([{ reference: 'A', title: 'Bien A' }]);
    expect(fired).toBe(true);
  });
});
