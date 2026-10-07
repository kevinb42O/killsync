import * as THREE from 'three';
import { ISLAND_VOLCANO } from '../world/FriendsIsland';
import { baseTerrainHeight } from '../world/FriendsTerrain';

/** Molten rock illuminates nearby terrain independently of the sun. */
export class FriendsVolcanoGlow extends THREE.Group {
  private readonly sources: { light: THREE.PointLight; intensity: number; phase: number }[] = [];
  constructor() {
    super(); this.name = 'ember-caldera-lava-light';
    const v = ISLAND_VOLCANO;
    this.addSource(v.x, v.lavaLevel + 420, v.y, 14000000, 5400, 0);
    for (const [index, t] of [.25, .72].entries()) {
      const radius = 700 + t * 2800;
      const angle = 1.05 + .045 * Math.sin(t * 8) + .025 * Math.sin(t * 17);
      const x = v.x + Math.cos(angle) * radius, z = v.y + Math.sin(angle) * radius;
      this.addSource(x, baseTerrainHeight(x, z) + 140, z, 1400000, 1800, index + 1);
    }
  }
  private addSource(x: number, y: number, z: number, intensity: number, distance: number, phase: number) {
    const light = new THREE.PointLight('#ff6b21', intensity, distance, 2);
    light.position.set(x, y, z);
    this.add(light); this.sources.push({ light, intensity, phase });
  }
  update(seconds: number) {
    for (const { light, intensity, phase } of this.sources) {
      light.intensity = intensity * (1 + .045 * Math.sin(seconds * .7 + phase) + .02 * Math.sin(seconds * 1.3 + phase * 2));
    }
  }
  dispose() { this.sources.forEach(({ light }) => light.dispose()); this.clear(); this.removeFromParent(); }
}
