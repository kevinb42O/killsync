import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DISTANT_ISLANDS, FriendsDistantIslands } from './FriendsDistantIslands';

describe('distant island scenery budget', () => {
  it('stays outside the playable world with six culled draws and no textures or shadows', () => {
    const islands = new FriendsDistantIslands(), materials = new Set<THREE.Material>();
    let draws = 0, triangles = 0, bytes = 0;
    expect(islands.children).toHaveLength(DISTANT_ISLANDS.length);
    islands.updateMatrixWorld(true);
    islands.traverse(o => {
      if (!(o instanceof THREE.Mesh)) return;
      draws++; triangles += o.geometry.getAttribute('position').count / 3;
      for (const a of Object.values(o.geometry.attributes)) bytes += (a as THREE.BufferAttribute).array.byteLength;
      expect(o.castShadow).toBe(false); expect(o.receiveShadow).toBe(false); expect(o.frustumCulled).toBe(true);
      expect(o.geometry.boundingSphere!.radius).toBeGreaterThan(0);
      const bounds = new THREE.Box3().setFromObject(o);
      expect(bounds.max.x < 0 || bounds.min.x > 48000 || bounds.max.z < 0 || bounds.min.z > 48000).toBe(true);
      for (const value of o.geometry.getAttribute('position').array) expect(Number.isFinite(value)).toBe(true);
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        materials.add(m); expect(m.transparent).toBe(false);
        expect(Object.values(m).some(v => v instanceof THREE.Texture)).toBe(false);
      }
    });
    expect(draws).toBe(6); expect(materials.size).toBe(2);
    expect(triangles).toBeLessThan(15000); expect(bytes).toBeLessThan(1500000);
    islands.dispose(); expect(islands.parent).toBeNull();
  });
});
