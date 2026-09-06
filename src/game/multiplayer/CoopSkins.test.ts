import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COOP_SKINS, COOP_SKIN_STORAGE_KEY, DEFAULT_COOP_SKIN_ID, normalizeCoopSkinId, readCoopSkinId, writeCoopSkinId } from './CoopSkins';

describe('co-op skins', () => {
  const values = new Map<string, string>();
  beforeEach(() => {
    values.clear();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('defines four standard and two premium cosmetics with unique ids', () => {
    expect(COOP_SKINS).toHaveLength(6);
    expect(new Set(COOP_SKINS.map(skin => skin.id)).size).toBe(6);
    expect(COOP_SKINS.filter(skin => skin.tier === 'standard')).toHaveLength(4);
    expect(COOP_SKINS.filter(skin => skin.tier === 'premium')).toHaveLength(2);
  });

  it('normalizes untrusted values to the default skin', () => {
    expect(normalizeCoopSkinId('black_ice')).toBe('black_ice');
    expect(normalizeCoopSkinId('custom-hacked-material')).toBe(DEFAULT_COOP_SKIN_ID);
    expect(normalizeCoopSkinId(null)).toBe(DEFAULT_COOP_SKIN_ID);
  });

  it('persists a normalized local preference', () => {
    expect(writeCoopSkinId('royal_inferno')).toBe('royal_inferno');
    expect(readCoopSkinId()).toBe('royal_inferno');
    localStorage.setItem(COOP_SKIN_STORAGE_KEY, 'corrupt');
    expect(readCoopSkinId()).toBe(DEFAULT_COOP_SKIN_ID);
  });
});
