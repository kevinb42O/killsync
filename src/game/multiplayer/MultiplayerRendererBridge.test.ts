import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { MultiplayerRendererBridge, shouldPlayResurfaceBreath, shouldPresentGroundJump, shouldRenderPlayerRig, shouldShowFriendsGestureHands } from './MultiplayerRendererBridge';
import { RETREAT_SITES } from '../world/FriendsRetreatSites';
import { ROWBOAT_ID, OPPOSITE_ROWBOAT_ID } from '../world/FriendsFishingDock';
import { DEFAULT_GAME_PREFERENCES } from '../LocalGamePreferences';

describe('Friends lighting preferences', () => {
  it('applies anti-aliasing with matching foliage coverage and keeps native resolution available', () => {
    const setPixelRatio = vi.fn(), setFriendsAntialiasing = vi.fn((quality: unknown) => quality === 'auto' ? 2 : Number(quality)), setMultisampled = vi.fn();
    const bridge = Object.assign(Object.create(MultiplayerRendererBridge.prototype), {
      worldId: 'friends_frontier', nativePixelRatio: 2,
      renderer: { renderer: { setPixelRatio, shadowMap: {} }, dirLight: new THREE.DirectionalLight(), setFriendsAntialiasing },
      frontierVisuals: { setMultisampled },
    }) as MultiplayerRendererBridge;
    bridge.setLocalPreferences({ ...DEFAULT_GAME_PREFERENCES, renderScale: .7, antialiasing: 0 });
    expect(setPixelRatio).toHaveBeenLastCalledWith(1.4); expect(setFriendsAntialiasing).toHaveBeenLastCalledWith(0);
    expect(setMultisampled).toHaveBeenLastCalledWith(false);
    bridge.setLocalPreferences({ ...DEFAULT_GAME_PREFERENCES, antialiasing: 4 });
    expect(setPixelRatio).toHaveBeenLastCalledWith(2); expect(setFriendsAntialiasing).toHaveBeenLastCalledWith(4);
    expect(setMultisampled).toHaveBeenLastCalledWith(true);
  });
  it('applies the saved FOV only to the Friends world', () => {
    const presentation = { renderer: { setPixelRatio: vi.fn(), shadowMap: {} }, dirLight: new THREE.DirectionalLight(), friendsFieldOfView: 108, setFriendsAntialiasing: vi.fn(() => 2) };
    const bridge = Object.assign(Object.create(MultiplayerRendererBridge.prototype), {
      worldId: 'friends_frontier', nativePixelRatio: 1, renderer: presentation,
    }) as MultiplayerRendererBridge;
    bridge.setLocalPreferences({ ...DEFAULT_GAME_PREFERENCES, fieldOfView: 135 });
    expect(presentation.friendsFieldOfView).toBe(135);
    bridge.setLocalPreferences({ ...DEFAULT_GAME_PREFERENCES, fieldOfView: 200 });
    expect(presentation.friendsFieldOfView).toBe(140);
    Object.assign(bridge, { worldId: 'coop' });
    bridge.setLocalPreferences({ ...DEFAULT_GAME_PREFERENCES, fieldOfView: 90 });
    expect(presentation.friendsFieldOfView).toBe(140);
  });
  it('disables sun shadows while retaining the renderer needed by both flashlight directions', () => {
    const sun = new THREE.DirectionalLight();
    const renderer = { setPixelRatio: vi.fn(), shadowMap: { enabled: true, needsUpdate: false } };
    const bridge = Object.assign(Object.create(MultiplayerRendererBridge.prototype), {
      worldId: 'friends_frontier', nativePixelRatio: 1,
      renderer: { renderer, dirLight: sun, setFriendsAntialiasing: vi.fn(() => 2) },
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

describe('MultiplayerRendererBridge resurfacing audio', () => {
  it('plays the breath when an alive local player surfaces, even if swimming ends on that frame', () => {
    expect(shouldPlayResurfaceBreath(true, true, false, true)).toBe(true);
    expect(shouldPlayResurfaceBreath(false, true, false, true)).toBe(false);
    expect(shouldPlayResurfaceBreath(true, true, false, false)).toBe(false);
    expect(shouldPlayResurfaceBreath(true, true, true, true)).toBe(false);
    expect(shouldPlayResurfaceBreath(true, false, false, true)).toBe(false);
  });
});


describe('seated confetti hand visibility', () => {
  it.each(['commons-campfire', ...RETREAT_SITES.map(site => site.id), ROWBOAT_ID, OPPOSITE_ROWBOAT_ID])(
    'keeps the confetti hand visible in %s', vehicleId => {
      const seat = { vehicleId, index: 0 };
      expect(shouldShowFriendsGestureHands(11, seat)).toBe(true);
      expect(shouldShowFriendsGestureHands(6, seat)).toBe(false);
      expect(shouldShowFriendsGestureHands(1, seat)).toBe(false);
      expect(shouldShowFriendsGestureHands(0, seat)).toBe(false);
    },
  );
  it('shows confetti and empty hands while standing or sitting in transport', () => {
    for (const seat of [undefined, { vehicleId: 'train', index: 1 }]) {
      expect(shouldShowFriendsGestureHands(11, seat)).toBe(true);
      expect(shouldShowFriendsGestureHands(6, seat)).toBe(true);
      expect(shouldShowFriendsGestureHands(3, seat)).toBe(false);
    }
  });
});
