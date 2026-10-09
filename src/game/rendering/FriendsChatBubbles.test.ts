import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { FriendsChatBubbles, friendsChatDuration, wrapFriendsChatText } from './FriendsChatBubbles';
import type { CoopChatMessage } from '../multiplayer/CoopChat';
import type { CoopOperatorRig } from './coopOperatorVisuals';

const message = (id = '1', text = 'Meet me at the campfire'): CoopChatMessage => ({ id, text, playerId: 'friend', playerLabel: 'Friend', playerColor: '#67e8f9', sentAt: 9999999 });

describe('Friends overhead chat', () => {
  beforeEach(() => {
    const context = { measureText: (text: string) => ({ width: Array.from(text).length * 7 }), scale: vi.fn(), beginPath: vi.fn(), roundRect: vi.fn(), fill: vi.fn(), stroke: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), fillText: vi.fn() };
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => context }) });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('wraps full messages and unbroken Unicode without clipping or splitting surrogate pairs', () => {
    const measure = (value: string) => Array.from(value).length * 10;
    expect(wrapFriendsChatText('Meet me at the campfire after sunset', measure).join(' ')).toBe('Meet me at the campfire after sunset');
    const text = '🔥'.repeat(180);
    const lines = wrapFriendsChatText(text, measure);
    expect(lines.join('')).toBe(text);
    expect(lines.every(line => measure(line) <= 216)).toBe(true);
    const family = '👨‍👩‍👧‍👦';
    expect(wrapFriendsChatText(family.repeat(8), measure).every(line => line === family.repeat(3) || line === family.repeat(2))).toBe(true);
    expect(friendsChatDuration('hi')).toBeGreaterThan(4000);
    expect(friendsChatDuration(text)).toBe(10000);
  });

  it('replaces a speaker’s bubble, ignores repeated delivery, and releases textures and materials', () => {
    const scene = new THREE.Scene(), bubbles = new FriendsChatBubbles(scene);
    bubbles.show(message(), 0);
    const sprite = scene.children[0] as THREE.Sprite;
    const texture = vi.spyOn(sprite.material.map!, 'dispose'), material = vi.spyOn(sprite.material, 'dispose');
    bubbles.show(message(), 100);
    expect(scene.children[0]).toBe(sprite);
    bubbles.show(message('2'), 200);
    expect(scene.children).toHaveLength(1);
    expect(texture).toHaveBeenCalledOnce();
    expect(material).toHaveBeenCalledOnce();
    const replacement = scene.children[0] as THREE.Sprite;
    const replacementTexture = vi.spyOn(replacement.material.map!, 'dispose');
    bubbles.dispose();
    expect(scene.children).toHaveLength(0);
    expect(replacementTexture).toHaveBeenCalledOnce();
  });

  it('tracks the posed nameplate, stays a consistent screen size across FOVs and fades on local time', () => {
    const scene = new THREE.Scene(), bubbles = new FriendsChatBubbles(scene);
    const root = new THREE.Group(), nameplate = new THREE.Sprite();
    root.position.set(10, 20, -250); nameplate.position.y = 47; root.add(nameplate);
    const rigs = new Map([['friend', { root, nameplate } as CoopOperatorRig]]);
    const camera = new THREE.PerspectiveCamera(70, 16 / 9, 1, 2000);
    camera.updateMatrixWorld(true);
    bubbles.show(message(), 0);
    const sprite = scene.children[0] as THREE.Sprite;
    let width = 0;
    for (const fov of [70, 100, 120]) {
      camera.fov = fov; camera.updateProjectionMatrix();
      bubbles.update(camera, 900, rigs, [{ id: 'friend' }], 1000);
      expect(sprite.visible).toBe(true);
      expect(sprite.position.toArray()).toEqual([10, 74, -250]);
      const pixels = sprite.scale.x * camera.projectionMatrix.elements[5] * 900 / 500;
      if (width) expect(pixels).toBeCloseTo(width); else width = pixels;
    }
    expect(sprite.material.depthTest).toBe(true);
    expect(sprite.material.depthWrite).toBe(false);
    bubbles.update(camera, 900, rigs, [{ id: 'friend' }], friendsChatDuration(message().text) - 250);
    expect(sprite.material.opacity).toBeCloseTo(.5);
    bubbles.update(camera, 900, rigs, [{ id: 'friend' }], friendsChatDuration(message().text));
    expect(scene.children).toHaveLength(0);
  });

  it('hides absent first-person rigs and off-camera or distant speakers, and removes departed players', () => {
    const scene = new THREE.Scene(), bubbles = new FriendsChatBubbles(scene);
    const camera = new THREE.PerspectiveCamera(70, 1, 1, 5000); camera.updateMatrixWorld(true);
    bubbles.show(message(), 0);
    const sprite = scene.children[0] as THREE.Sprite;
    bubbles.update(camera, 900, new Map(), [{ id: 'friend' }], 200);
    expect(sprite.visible).toBe(false);
    const root = new THREE.Group(), nameplate = new THREE.Sprite(); root.add(nameplate);
    const rigs = new Map([['friend', { root, nameplate } as CoopOperatorRig]]);
    for (const z of [100, -1500]) {
      root.position.z = z;
      bubbles.update(camera, 900, rigs, [{ id: 'friend' }], 200);
      expect(sprite.visible).toBe(false);
    }
    bubbles.update(camera, 900, rigs, [], 200);
    expect(scene.children).toHaveLength(1);
    bubbles.update(camera, 900, rigs, [], 2000);
    expect(scene.children).toHaveLength(0);
  });
});
