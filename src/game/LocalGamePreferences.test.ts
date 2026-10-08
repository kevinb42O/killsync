import { describe, expect, it } from 'vitest';
import { DEFAULT_GAME_PREFERENCES, neutralizeMenuInput, normalizeGamePreferences } from './LocalGamePreferences';
import type { MultiplayerInputFrame } from './multiplayer/protocol';

describe('local game menu preferences', () => {
  it('rejects corrupt rendering preferences and bounds look sensitivity', () => {
    expect(normalizeGamePreferences({ renderScale: NaN, lookSensitivity: Infinity })).toEqual(DEFAULT_GAME_PREFERENCES);
    expect(normalizeGamePreferences({ renderScale: .7, shadows: false, lookSensitivity: 99 })).toEqual({ renderScale: .7, shadows: false, lookSensitivity: 2 });
    expect(normalizeGamePreferences({ lookSensitivity: -20 }).lookSensitivity).toBe(.4);
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
