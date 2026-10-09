import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_GAME_PREFERENCES, neutralizeMenuInput, normalizeGamePreferences, readGamePreferences, saveGamePreferences } from './LocalGamePreferences';
import type { MultiplayerInputFrame } from './multiplayer/protocol';

describe('local game menu preferences', () => {
  it('preserves existing quality defaults and rejects unsupported graphics values', () => {
    expect(normalizeGamePreferences({}).antialiasing).toBe('auto');
    expect(normalizeGamePreferences({}).frameLimit).toBe(0);
    const corrupt = { antialiasing: 'off', frameLimit: 45 } as unknown as Parameters<typeof normalizeGamePreferences>[0];
    expect(normalizeGamePreferences(corrupt)).toEqual(DEFAULT_GAME_PREFERENCES);
    expect(normalizeGamePreferences({ antialiasing: 0, frameLimit: 30 })).toMatchObject({ antialiasing: 0, frameLimit: 30 });
  });
  it('saves graphics independently on this device and restores them alongside other preferences', () => {
    const stored = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => stored.set(key, value) });
    try {
      const settings = { ...DEFAULT_GAME_PREFERENCES, renderScale: .7, antialiasing: 0 as const, frameLimit: 30 as const, fieldOfView: 120 };
      saveGamePreferences(settings); expect(readGamePreferences()).toEqual(settings);
      saveGamePreferences({ ...settings, antialiasing: 4, frameLimit: 120 });
      expect(readGamePreferences()).toMatchObject({ antialiasing: 4, frameLimit: 120, renderScale: .7 });
    } finally { vi.unstubAllGlobals(); }
  });
  it('rejects corrupt rendering preferences and bounds look sensitivity', () => {
    expect(normalizeGamePreferences({ renderScale: NaN, lookSensitivity: Infinity })).toEqual(DEFAULT_GAME_PREFERENCES);
    expect(normalizeGamePreferences({ renderScale: .7, shadows: false, lookSensitivity: 99 })).toEqual({ ...DEFAULT_GAME_PREFERENCES, renderScale: .7, shadows: false, lookSensitivity: 2 });
    expect(normalizeGamePreferences({ lookSensitivity: -20 }).lookSensitivity).toBe(.4);
  });
  it('preserves the existing FOV for old saves and clamps saved values to 90–140', () => {
    expect(normalizeGamePreferences({}).fieldOfView).toBe(108);
    expect(normalizeGamePreferences({ fieldOfView: NaN }).fieldOfView).toBe(108);
    expect(normalizeGamePreferences({ fieldOfView: Infinity }).fieldOfView).toBe(108);
    expect(normalizeGamePreferences({ fieldOfView: 80 }).fieldOfView).toBe(90);
    expect(normalizeGamePreferences({ fieldOfView: 150 }).fieldOfView).toBe(140);
    expect(normalizeGamePreferences({ fieldOfView: 125 }).fieldOfView).toBe(125);
  });
  it('restores the saved FOV on the next session', () => {
    const stored = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value),
    });
    try {
      saveGamePreferences({ ...DEFAULT_GAME_PREFERENCES, fieldOfView: 140 });
      expect(readGamePreferences().fieldOfView).toBe(140);
    } finally { vi.unstubAllGlobals(); }
  });
  it('releases every held gameplay action without changing network identity or tool selection', () => {
    const input = { movement: 15, firing: true, aiming: true, sprinting: true, sliding: true, reviving: true, jumpPressed: true, jetHeld: true,
      reloadPressed: true, dashPressed: true, friendsDevFlightDown: true, selectedSlot: 2, friendsTool: 3, sequence: 80, fireActionId: 29, aimAngle: .8 } as MultiplayerInputFrame;
    const neutral = neutralizeMenuInput(input);
    for (const key of ['firing', 'aiming', 'sprinting', 'sliding', 'reviving', 'jumpPressed', 'jetHeld', 'reloadPressed', 'dashPressed', 'friendsDevFlightDown']) expect(neutral[key]).toBe(false);
    expect(neutral.movement).toBe(0);
    expect(neutral.sequence).toBe(80); expect(neutral.fireActionId).toBe(29); expect(neutral.friendsTool).toBe(3); expect(neutral.selectedSlot).toBe(2);
    expect(input.firing).toBe(true);
  });
});
