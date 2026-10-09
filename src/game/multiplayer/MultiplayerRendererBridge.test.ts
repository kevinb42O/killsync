import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { MultiplayerRendererBridge, shouldPresentGroundJump, shouldRenderPlayerRig } from './MultiplayerRendererBridge';
import { DEFAULT_GAME_PREFERENCES } from '../LocalGamePreferences';

describe('Friends lighting preferences', () => {
  it('disables sun shadows while retaining the renderer needed by both flashlight directions', () => {
    const sun = new THREE.DirectionalLight();
    const renderer = { setPixelRatio: vi.fn(), shadowMap: { enabled: true, needsUpdate: false } };
    const bridge = Object.assign(Object.create(MultiplayerRendererBridge.prototype), {
      worldId: 'friends_frontier', nativePixelRatio: 1,
      renderer: { renderer, dirLight: sun },
    }) as MultiplayerRendererBridge;
    bridge.setLocalPreferences({ ...DEFAULT_GAME_PREFERENCES, shadows: false });
    expect(sun.castShadow).toBe(false);
    expect(renderer.shadowMap.enabled).toBe(true);
    bridge.setLocalPreferences(DEFAULT_GAME_PREFERENCES);
    expect(sun.castShadow).toBe(true);
    expect(sun.shadow.needsUpdate).toBe(true);
    expect(renderer.shadowMap.enabled).toBe(true);
  });
});

describe('MultiplayerRendererBridge operator visibility', () => {
  it('renders the local body while its camera is spectating a teammate', () => {
    expect(shouldRenderPlayerRig('host', 'host', true, false)).toBe(true);
  });

  it('keeps the local world rig hidden during normal first-person play', () => {
    expect(shouldRenderPlayerRig('host', 'host', false, false)).toBe(false);
    expect(shouldRenderPlayerRig('guest', 'host', false, false)).toBe(true);
  });
});

describe('MultiplayerRendererBridge jump presentation', () => {
  it('presents each normal ground-launch sequence once while airborne', () => {
    expect(shouldPresentGroundJump(false, false, 12, 14, 13)).toBe(true);
    expect(shouldPresentGroundJump(false, false, 12, 14, 14)).toBe(false);
  });

  it('does not play a local launch cue while spectating, falling, or grounded', () => {
    expect(shouldPresentGroundJump(true, false, 12, 14, 13)).toBe(false);
    expect(shouldPresentGroundJump(false, true, 12, 14, 13)).toBe(false);
    expect(shouldPresentGroundJump(false, false, 0, 14, 13)).toBe(false);
  });
});
