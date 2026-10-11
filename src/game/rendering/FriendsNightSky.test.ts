import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createNightNebulaTexture, updateNightMeteor } from './FriendsNightSky';

describe('Night sky meteor clock', () => {
  it('bakes deterministic cloud detail in a bounded seamless texture', () => {
    const a = createNightNebulaTexture(), b = createNightNebulaTexture();
    expect(a.image.data.byteLength).toBe(64 * 1024);
    expect(a.image.data).toEqual(b.image.data);
    expect(a.wrapS).toBe(THREE.RepeatWrapping); expect(a.wrapT).toBe(THREE.RepeatWrapping);
    expect(a.generateMipmaps).toBe(true); expect(a.minFilter).toBe(THREE.LinearMipmapLinearFilter);
    const data = a.image.data;
    let edgeDifference = 0;
    for (let i = 0; i < 256; i++) {
      edgeDifference += Math.abs(data[i * 256] - data[i * 256 + 255]);
      edgeDifference += Math.abs(data[i] - data[255 * 256 + i]);
    }
    expect(edgeDifference / 512).toBeLessThan(8);
    a.dispose(); b.dispose();
  });
  it('keeps streaks finite, above the horizon, brief and separated by quiet intervals', () => {
    const head = new THREE.Vector3(), tail = new THREE.Vector3();
    let active = 0, events = 0, previous = false;
    for (let seconds = 0; seconds < 180; seconds += .02) {
      const strength = updateNightMeteor(seconds, head, tail);
      expect(strength).toBeGreaterThanOrEqual(0); expect(strength).toBeLessThanOrEqual(1);
      if (strength > 0) {
        active++;
        if (!previous) events++;
        expect(head.length()).toBeCloseTo(1, 12); expect(tail.length()).toBeCloseTo(1, 12);
        expect(head.y).toBeGreaterThan(.25); expect(tail.y).toBeGreaterThan(head.y);
        expect(head.distanceTo(tail)).toBeGreaterThan(.05);
      }
      previous = strength > 0;
    }
    expect(events).toBe(10);
    expect(active * .02).toBeCloseTo(14, 0);
  });
  it('reproduces paused and scrubbed times without accumulated simulation state', () => {
    const head = new THREE.Vector3(), tail = new THREE.Vector3();
    let seconds = 5;
    while (updateNightMeteor(seconds, head, tail) < .9) seconds += .01;
    const expectedHead = head.clone(), expectedTail = tail.clone();
    const strength = updateNightMeteor(seconds, head, tail);
    updateNightMeteor(90000, head, tail);
    expect(updateNightMeteor(seconds, head, tail)).toBe(strength);
    expect(head.equals(expectedHead)).toBe(true); expect(tail.equals(expectedTail)).toBe(true);
    for (const invalid of [NaN, Infinity, -100]) expect(updateNightMeteor(invalid, head, tail)).toBe(0);
    expect(Number.isFinite(updateNightMeteor(1e9 + seconds, head, tail))).toBe(true);
  });
});
