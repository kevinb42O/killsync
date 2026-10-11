import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createFrontierStarCatalog, FRONTIER_STAR_COUNT } from './FriendsStarField';
import { FriendsDayNightCycle } from './FriendsDayNightCycle';

describe('Independent random star field', () => {
  it('reproduces the same sky on every client without repeating positions', () => {
    const a = createFrontierStarCatalog(), b = createFrontierStarCatalog();
    expect(a.positions).toEqual(b.positions); expect(a.appearance).toEqual(b.appearance);
    expect(a.positions.byteLength + a.appearance.byteLength).toBeLessThan(320 * 1024);
    const unique = new Set<string>();
    for (let i = 0; i < a.positions.length; i += 3) unique.add(`${a.positions[i]},${a.positions[i + 1]},${a.positions[i + 2]}`);
    expect(unique.size).toBe(FRONTIER_STAR_COUNT);
  });
  it('covers the sphere evenly and has no former cube-cell center restriction', () => {
    const { positions } = createFrontierStarCatalog();
    const sums = [0, 0, 0], squares = [0, 0, 0], bins = Array(10).fill(0);
    let above = 0;
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i], y = positions[i + 1], z = positions[i + 2];
      expect(x * x + y * y + z * z).toBeCloseTo(1, 6);
      if (y > 0) above++;
      for (let j = 0; j < 3; j++) { sums[j] += positions[i + j]; squares[j] += positions[i + j] ** 2; }
      const dominant = Math.max(Math.abs(x), Math.abs(y), Math.abs(z));
      const faceU = dominant === Math.abs(x) ? y / dominant : x / dominant;
      const formerGrid = faceU * 340, fraction = formerGrid - Math.floor(formerGrid);
      bins[Math.floor(fraction * 10)]++;
    }
    for (let j = 0; j < 3; j++) {
      expect(Math.abs(sums[j] / FRONTIER_STAR_COUNT)).toBeLessThan(.02);
      expect(squares[j] / FRONTIER_STAR_COUNT).toBeCloseTo(1 / 3, 1);
    }
    expect(above / FRONTIER_STAR_COUNT).toBeGreaterThan(.48);
    expect(above / FRONTIER_STAR_COUNT).toBeLessThan(.52);
    // The old stars existed only in the middle half of each cell, exposing
    // rows/diagonals. Every tenth of a former cell must now be populated.
    for (const count of bins) {
      expect(count / FRONTIER_STAR_COUNT).toBeGreaterThan(.08);
      expect(count / FRONTIER_STAR_COUNT).toBeLessThan(.12);
    }
  });
  it('uses one static batch, follows the camera and shared clock, hides at noon, and disposes', () => {
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
    const renderer = { shadowMap: { needsUpdate: false }, toneMappingExposure: 1 } as THREE.WebGLRenderer;
    const cycle = new FriendsDayNightCycle(scene, renderer, camera, {
      sun: new THREE.DirectionalLight(), ambient: new THREE.AmbientLight(), fill: new THREE.HemisphereLight(),
    });
    const points = scene.getObjectByName('frontier-random-stars') as THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
    const geometry = points.geometry;
    camera.position.set(7000, 300, 2000); cycle.update(900000, 1000);
    expect(points.visible).toBe(true); expect(points.position.equals(camera.position)).toBe(true);
    expect(geometry.getAttribute('position').count).toBe(FRONTIER_STAR_COUNT);
    expect(points.material.uniforms.time).toBe(cycle.sky.material.uniforms.time);
    expect(points.material.depthTest).toBe(true); expect(points.material.depthWrite).toBe(false);
    cycle.update(180000, 2000); expect(points.visible).toBe(false); expect(points.geometry).toBe(geometry);
    cycle.update(900000, 3000); expect(points.visible).toBe(true); expect(points.geometry).toBe(geometry);
    let geometryDisposed = false, materialDisposed = false;
    geometry.addEventListener('dispose', () => { geometryDisposed = true; });
    points.material.addEventListener('dispose', () => { materialDisposed = true; });
    cycle.dispose();
    expect(geometryDisposed && materialDisposed).toBe(true);
    expect(scene.getObjectByName('frontier-random-stars')).toBeUndefined();
  });
});
