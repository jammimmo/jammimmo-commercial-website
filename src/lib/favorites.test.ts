// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { readFavorites, writeFavorites, clearFavorites, FAVORITES_KEY, MAX_FAVORITES } from './favorites';

const entry = (ref: string) => ({ reference: ref, title: `Bien ${ref}`, addedAt: '2026-06-23T00:00:00.000Z' });

beforeEach(() => window.localStorage.clear());

describe('favorites store', () => {
  it('reads an empty list when nothing is stored', () => {
    expect(readFavorites()).toEqual([]);
  });

  it('writes and reads back entries', () => {
    writeFavorites([entry('A')]);
    expect(readFavorites()).toEqual([entry('A')]);
  });

  it('caps the stored list at MAX_FAVORITES', () => {
    writeFavorites(Array.from({ length: MAX_FAVORITES + 5 }, (_, i) => entry(`R${i}`)));
    expect(readFavorites()).toHaveLength(MAX_FAVORITES);
  });

  it('rejects entries missing addedAt', () => {
    window.localStorage.setItem(
      FAVORITES_KEY,
      JSON.stringify([{ reference: 'A', title: 'no date' }, entry('B')]),
    );
    expect(readFavorites()).toEqual([entry('B')]);
  });

  it('returns [] on invalid JSON', () => {
    window.localStorage.setItem(FAVORITES_KEY, '{bad');
    expect(readFavorites()).toEqual([]);
  });

  it('clears the list', () => {
    writeFavorites([entry('A')]);
    clearFavorites();
    expect(readFavorites()).toEqual([]);
  });
});
