import type { MultiplayerInputFrame } from './multiplayer/protocol';

export type FriendsAntialiasing = 'auto' | 0 | 2 | 4;
export type FriendsFrameLimit = 0 | 30 | 60 | 120;
export type LocalGamePreferences = { renderScale: number; shadows: boolean; lookSensitivity: number; fieldOfView: number; miningProgress?: boolean; antialiasing?: FriendsAntialiasing; frameLimit?: FriendsFrameLimit };
export const DEFAULT_GAME_PREFERENCES: LocalGamePreferences = { renderScale: 1, shadows: true, lookSensitivity: 1, fieldOfView: 108, antialiasing: 'auto', frameLimit: 0 };
export const FRIENDS_FOV_MIN = 90;
export const FRIENDS_FOV_MAX = 140;
const KEY = 'sunline.preferences.v1';
export function normalizeGamePreferences(value: Partial<LocalGamePreferences> = {}): LocalGamePreferences {
  return {
    ...(value.miningProgress !== undefined ? {miningProgress:value.miningProgress === true} : {}),
    renderScale: [1, .85, .7, .5].includes(value.renderScale) ? value.renderScale : 1,
    shadows: value.shadows !== false,
    antialiasing: ['auto', 0, 2, 4].includes(value.antialiasing) ? value.antialiasing : 'auto',
    frameLimit: [0, 30, 60, 120].includes(value.frameLimit) ? value.frameLimit : 0,
    fieldOfView: Number.isFinite(value.fieldOfView) ? Math.max(FRIENDS_FOV_MIN, Math.min(FRIENDS_FOV_MAX, value.fieldOfView)) : DEFAULT_GAME_PREFERENCES.fieldOfView,
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
  return { ...input, friendsAircraftWinch:0,friendsAircraftHookHeld:false,friendsArms: 0, movement: 0, firing: false, aiming: false, sprinting: false, sliding: false, reviving: false,
    jumpPressed: false, jetHeld: false, reloadPressed: false, dashPressed: false, friendsDevFlightDown: false };
}
