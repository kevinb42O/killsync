import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createFriendsBuildGeometry, createFriendsBuildMaterial, prepareFriendsBuildGeometry } from './FriendsBuildVisuals';
import { FRIENDS_TERRAIN_SURFACES } from '../world/FriendsTerrainAppearance';
afterEach(() => vi.restoreAllMocks());
describe('terrain-matched construction appearance', () => {
  it('renders a one-block cube with the same face shades as the terrain mesh', () => {
    const geometry = prepareFriendsBuildGeometry(createFriendsBuildGeometry('block'), 'block');
    geometry.computeBoundingBox();
    expect(geometry.boundingBox!.getSize(new THREE.Vector3()).toArray()).toEqual([32, 32, 32]);
    const normals = geometry.getAttribute('normal'), colors = geometry.getAttribute('color');
    for (let i = 0; i < normals.count; i++) {
      expect(colors.getX(i)).toBeCloseTo(normals.getY(i) > .5 ? 1 : normals.getY(i) < -.5 ? .55 : Math.abs(normals.getX(i)) > .5 ? .84 : .92);
    }
    expect(new Set(geometry.groups.map(g => g.materialIndex))).toEqual(new Set([0, 1]));
    geometry.dispose();
  });
  it('gives natural pieces the world textures and grass a separate soil underside', () => {
    const load = vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(url => {
      const texture = new THREE.Texture<HTMLImageElement>(); texture.name = url; return texture;
    });
    const materials = createFriendsBuildMaterial('block', 'grass') as THREE.MeshStandardMaterial[];
    expect(materials).toHaveLength(2);
    expect(materials[0].color.getHexString()).toBe(FRIENDS_TERRAIN_SURFACES.grass.color.slice(1));
    expect(materials[1].color.getHexString()).toBe(FRIENDS_TERRAIN_SURFACES.soil.color.slice(1));
    expect(load).toHaveBeenCalledWith(expect.stringContaining('Ground037_1K-JPG_Color.jpg'));
    expect(materials.every(m => m.vertexColors && m.map?.wrapS === THREE.RepeatWrapping && m.normalMap && m.roughnessMap)).toBe(true);
    materials.forEach(m => m.dispose());
  });
  it('keeps flat ramp normals and independent steel/wood railway coloring', () => {
    const ramp = prepareFriendsBuildGeometry(createFriendsBuildGeometry('voxel_ramp'), 'voxel_ramp');
    expect(ramp.getIndex()).toBeNull(); expect(ramp.getAttribute('uv')).toBeDefined();
    const track = prepareFriendsBuildGeometry(createFriendsBuildGeometry('rail_straight'), 'rail_straight');
    const material = createFriendsBuildMaterial('rail_straight', 'grass') as THREE.MeshStandardMaterial;
    expect(material.map).toBeNull(); expect(material.vertexColors).toBe(true);
    expect(track.getAttribute('color')).toBeDefined();
    ramp.dispose(); track.dispose(); material.dispose();
  });
});
