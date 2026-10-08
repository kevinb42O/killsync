import type { MultiplayerInputFrame } from './multiplayer/protocol';

export type LocalGamePreferences = { renderScale: number; shadows: boolean; lookSensitivity: number; miningProgress?: boolean };
export const DEFAULT_GAME_PREFERENCES: LocalGamePreferences = { renderScale: 1, shadows: true, lookSensitivity: 1 };
const KEY = 'sunline.preferences.v1';
export function normalizeGamePreferences(value: Partial<LocalGamePreferences> = {}): LocalGamePreferences {
  return {
    ...(value.miningProgress !== undefined ? {miningProgress:value.miningProgress === true} : {}),
    renderScale: [1, .85, .7, .5].includes(value.renderScale) ? value.renderScale : 1,
    shadows: value.shadows !== false,
    lookSensitivity: Number.isFinite(value.lookSensitivity) ? Math.max(.4, Math.min(2, value.lookSensitivity)) : 1,
  };
}
export function readGamePreferences(): LocalGamePreferences {
  try { return normalizeGamePreferences(JSON.parse(localStorage.getItem(KEY) || '{}') || {}); } catch { return { ...DEFAULT_GAME_PREFERENCES }; }
}
export function saveGamePreferences(preferences: LocalGamePreferences) {
  try { localStorage.setItem(KEY, JSON.stringify(normalizeGamePreferences(preferences))); } catch { /* Optional browser storage. */ }
}
export function neutralizeMenuInput(input: MultiplayerInputFrame): MultiplayerInputFrame {
  return { ...input, movement: 0, firing: false, aiming: false, sprinting: false, sliding: false, reviving: false,
    jumpPressed: false, jetHeld: false, reloadPressed: false, dashPressed: false, friendsDevFlightDown: false };
}
