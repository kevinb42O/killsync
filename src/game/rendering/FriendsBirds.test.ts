import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { frontierTrees, type FrontierSnapshot } from '../multiplayer/FriendsFrontier';
import { birdCallVolume, birdHabitat, FRIENDS_BIRD_HEARING_RANGE, FRIENDS_BIRD_LIMIT, FriendsBirds, sampleBirdFlight } from './FriendsBirds';

const ordinaryTree = frontierTrees(11, 11).find(tree => tree.id === 'starter:cedar')!;
const tree = Array.from({ length: 100 }, (_, i) => ({ ...ordinaryTree, id: 'planted:1', x: ordinaryTree.x + i * 4 })).find(birdHabitat)!;
const frontier = { harvested: [], planted: [tree] } as unknown as FrontierSnapshot;
describe('bounded island bird population', () => {
  it('uses one small instanced geometry, without shadow passes or individual bird objects', () => {
    const birds = new FriendsBirds();
    expect(birds.mesh).toBeInstanceOf(THREE.InstancedMesh);
    expect(birds.mesh.instanceMatrix.count).toBe(FRIENDS_BIRD_LIMIT);
    expect(birds.mesh.geometry.getAttribute('position').count).toBeLessThan(100);
    expect(birds.mesh.castShadow).toBe(false); expect(birds.mesh.children).toHaveLength(0);
    birds.dispose();
  });
  it('shares deterministic flight and perch positions between clients', () => {
    const a = sampleBirdFlight(tree, 2, 24), b = sampleBirdFlight(tree, 2, 24);
    expect(a).toEqual(b); expect(a.flight).toBeGreaterThanOrEqual(0); expect(a.flight).toBeLessThanOrEqual(1);
    expect(a.z).toBeGreaterThan(tree.z); expect(Math.hypot(a.x - tree.x, a.y - tree.y)).toBeLessThan(400);
  });
  it('waits for tree geometry and perches at its measured canopy height', () => {
    const birds = new FriendsBirds(), camera = new THREE.Vector3(tree.x, tree.z + 300, tree.y - 250);
    birds.update(frontier, camera, 20, 1, false, candidate => candidate.id === tree.id, () => undefined);
    expect(birds.mesh.count).toBe(0);
    birds.update(frontier, camera, 22, 1, false, candidate => candidate.id === tree.id, () => 420);
    expect(birds.mesh.count).toBe(2);
    const perchedAt = Array.from({ length: 50 }, (_, i) => i).find(i => sampleBirdFlight(tree, 0, i).flight === 0)!;
    expect(sampleBirdFlight(tree, 0, perchedAt, 420).z).toBe(tree.z + 420 * tree.scale + 8);
    birds.dispose();
  });
  it('only provides audio for actual nearby rendered birds and removes populations at night, underground, or after harvest', () => {
    const birds = new FriendsBirds(), camera = new THREE.Vector3(tree.x, tree.z + 300, tree.y - 250);
    expect(birds.closestCall(camera, 0, 1).volume).toBe(0);
    birds.update(frontier, camera, 20, 1, false, candidate => candidate.id === tree.id);
    expect(birds.mesh.count).toBe(2); expect(birds.mesh.count).toBeLessThanOrEqual(FRIENDS_BIRD_LIMIT);
    const matrix = new THREE.Matrix4(); birds.mesh.getMatrixAt(0, matrix);
    const besideBird = new THREE.Vector3().setFromMatrixPosition(matrix);
    expect(birds.closestCall(besideBird, 0, 1).volume).toBeGreaterThan(0);
    expect(birds.closestCall(besideBird.clone().add(new THREE.Vector3(600, 0, 0)), 0, 1).volume).toBe(0);
    expect(birds.closestCall(besideBird.clone().add(new THREE.Vector3(0, 600, 0)), 0, 1).volume).toBe(0);
    birds.update(frontier, camera, 21, 0, false, () => true);
    expect(birds.closestCall(camera, 0, 0).volume).toBe(0);
    birds.update(frontier, camera, 22, 1, true, () => true);
    expect(birds.mesh.visible).toBe(false);
    birds.update({ ...frontier, harvested: [tree.id] }, camera, 23, 1, false, candidate => candidate.id === tree.id);
    expect(birds.mesh.count).toBe(0); expect(birds.closestCall(camera, 0, 1).volume).toBe(0);
    expect(birdCallVolume(FRIENDS_BIRD_HEARING_RANGE, 1)).toBe(0);
    expect(birdCallVolume(0, 0)).toBe(0); birds.dispose();
  });
  it('does not create a flock at an ordinary nearby tree just to fill local bird slots', () => {
    expect(birdHabitat(ordinaryTree)).toBe(false);
    const birds = new FriendsBirds(), camera = new THREE.Vector3(ordinaryTree.x, ordinaryTree.z + 100, ordinaryTree.y);
    birds.update({ ...frontier, planted: [ordinaryTree] }, camera, 20, 1, false, candidate => candidate.id === ordinaryTree.id);
    expect(birds.mesh.count).toBe(0);
    expect(birds.closestCall(camera, 0, 1).volume).toBe(0);
    birds.dispose();
  });
});
