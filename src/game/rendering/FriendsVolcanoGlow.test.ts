import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { FriendsVolcanoGlow } from './FriendsVolcanoGlow';
import { ISLAND_VOLCANO } from '../world/FriendsIsland';

describe('volcano lava lighting', () => {
  it('lights the crater rim and downhill lava flow with real local lights', () => {
    const glow = new FriendsVolcanoGlow();
    const lights = glow.children as THREE.PointLight[];
    expect(lights).toHaveLength(3);
    expect(lights[0].position.x).toBe(ISLAND_VOLCANO.x);
    expect(lights[0].position.z).toBe(ISLAND_VOLCANO.y);
    expect(lights[0].position.y).toBeGreaterThan(ISLAND_VOLCANO.lavaLevel);
    expect(lights[0].distance).toBeGreaterThan(ISLAND_VOLCANO.craterRadius);
    for (const seconds of [0, 24, 180]) {
      glow.update(seconds);
      for (const light of lights) {
        expect(light).toBeInstanceOf(THREE.PointLight);
        expect(light.intensity).toBeGreaterThan(1000000);
        expect(light.visible).toBe(true);
      }
    }
    glow.dispose(); expect(glow.children).toHaveLength(0);
  });
});
