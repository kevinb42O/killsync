import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { FriendsFrontier, type FrontierTree } from '../multiplayer/FriendsFrontier';
import { FriendsForestLOD, forestWoodLevel } from './FriendsForestLOD';
vi.mock('./FriendsAssets', async () => {
  const actual = await vi.importActual<typeof import('./FriendsAssets')>('./FriendsAssets');
  return { ...actual, loadFriendsAsset: async () => {
    const group = new THREE.Group();
    const bark = new THREE.MeshStandardMaterial(); bark.name = 'Tree_Bark';
    const leaves = new THREE.MeshStandardMaterial({ alphaTest: .45, side: THREE.DoubleSide }); leaves.name = 'Tree_Leaves';
    group.add(new THREE.Mesh(new THREE.BoxGeometry(1, 4, 1), bark), new THREE.Mesh(new THREE.PlaneGeometry(4, 4), leaves));
    return group;
  } };
});
afterEach(() => vi.unstubAllGlobals());
const tree: FrontierTree = { id: 'natural', x: 1000, y: 1000, z: 0, scale: 1, kind: 'pine' };
async function fixture() {
  class WorkerStub {
    static instance: WorkerStub;
    onmessage?: (e: MessageEvent) => void;
    constructor() { WorkerStub.instance = this; }
    postMessage() {}
    terminate() {}
  }
  vi.stubGlobal('Worker', WorkerStub);
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ sourceIndices: 36, sourceVertices: 24, levels: [{ error: .001, indices: [0, 2, 1, 0, 3, 2] }] }) })));
  const scene = new THREE.Scene(), renderer = { getDrawingBufferSize: (v: THREE.Vector2) => v.set(1600, 900) } as THREE.WebGLRenderer;
  const forest = new FriendsForestLOD(scene, renderer);
  WorkerStub.instance.onmessage!({ data: [tree] } as MessageEvent);
  const snapshot = new FriendsFrontier().snapshot(), camera = new THREE.PerspectiveCamera(70, 16 / 9, 2, 100000);
  const ground = vi.fn(() => true);
  camera.position.set(1000, 200, 2000); camera.lookAt(1000, 150, 1000); camera.updateMatrixWorld();
  await vi.waitFor(() => { forest.update(snapshot, ground, new Set(), camera); expect(forest.stats.trees).toBe(1); });
  return { scene, forest, snapshot, camera, ground, renderer };
}
function leaves(scene: THREE.Scene) {
  const list: THREE.InstancedMesh[] = [];
  scene.traverse(o => { if (o instanceof THREE.InstancedMesh && o.name.includes('-leaves-') && o.visible) list.push(o); });
  return list;
}
describe('persistent 3D forest', () => {
  it('reuses only identical visibility inputs and refreshes immediately for motion, optics and world edits', async () => {
    const { forest, camera, snapshot, ground, renderer } = await fixture();
    const pack = vi.spyOn(forest['frustum'], 'setFromProjectionMatrix');
    for(let i=0;i<10;i++)forest.update(snapshot,ground,new Set(),camera);
    expect(pack).not.toHaveBeenCalled();expect(forest.stats.trees).toBe(1);
    camera.position.x+=1e-7;forest.update(snapshot,ground,new Set(),camera);expect(pack).toHaveBeenCalledTimes(1);
    camera.rotation.y+=1e-7;forest.update(snapshot,ground,new Set(),camera);expect(pack).toHaveBeenCalledTimes(2);
    camera.fov+=1e-7;camera.updateProjectionMatrix();forest.update(snapshot,ground,new Set(),camera);expect(pack).toHaveBeenCalledTimes(3);
    vi.spyOn(renderer,'getDrawingBufferSize').mockImplementation(v=>v.set(3200,1800));
    forest.update(snapshot,ground,new Set(),camera);expect(pack).toHaveBeenCalledTimes(4);
    ground.mockReturnValue(false);forest.update(snapshot,ground,new Set(['1,1']),camera);expect(forest.stats.trees).toBe(0);
    ground.mockReturnValue(true);forest.update(snapshot,ground,new Set(['1,1']),camera);expect(forest.stats.trees).toBe(1);
    snapshot.harvested.push(tree.id);snapshot.revision++;forest.update(snapshot,ground,new Set(),camera);expect(forest.stats.trees).toBe(0);
    snapshot.harvested=[];snapshot.revision++;forest.update(snapshot,ground,new Set(),camera);expect(forest.stats.trees).toBe(1);
    forest.update(snapshot,ground,new Set(),camera,false);expect(forest.stats.draws).toBe(0);
    forest.update(snapshot,ground,new Set(),camera,true);expect(forest.stats.trees).toBe(1);expect(forest.stats.draws).toBe(2);
    forest.dispose();
  });
  it('selects opaque wood by projected error while retaining full detail within a pixel', () => {
    expect(forestWoodLevel([0, .5, 2], 1, 2)).toBe(0);
    expect(forestWoodLevel([0, .5, 2], 1, .5)).toBe(1);
    expect(forestWoodLevel([0, .5, 2], 1, .2)).toBe(2);
    expect(forestWoodLevel([0, .5, 2], 3, .2)).toBe(1);
    expect(forestWoodLevel([0, .5], 1, 1.3, 1)).toBe(1); // retain through small camera bob
    expect(forestWoodLevel([0, .5], 1, 1.6, 1)).toBe(0); // promote before reaching a pixel

  });
  it('uses identical real leaf geometry, materials and transforms across the old billboard handoff', async () => {
    const { scene, forest, camera, snapshot, ground } = await fixture();
    const near = leaves(scene)[0], matrix = new THREE.Matrix4(); near.getMatrixAt(0, matrix);
    expect(near.geometry.getAttribute('position').count).toBe(4);
    const version = near.instanceMatrix.version;
    forest.update(snapshot, ground, new Set(), camera);
    expect(near.instanceMatrix.version).toBe(version); // static visibility does not upload matrices
    for (const range of [1300, 2400, 3000, 8000, 30000]) {
      camera.position.z = 1000 + range; camera.lookAt(1000, 150, 1000);
      forest.update(snapshot, ground, new Set(), camera);
      const distant = leaves(scene)[0];
      expect(distant.geometry).toBe(near.geometry); expect(distant.material).toBe(near.material);
      const farMatrix = new THREE.Matrix4(); distant.getMatrixAt(0, farMatrix); expect(farMatrix.elements).toEqual(matrix.elements);
      expect(forest.stats.draws).toBe(2);
    }
    expect((near.material as THREE.MeshStandardMaterial).alphaTest).toBe(.45);
    expect((near.material as THREE.MeshStandardMaterial).alphaToCoverage).toBe(true);
    // Ground sampling happens once at install, not on every animation frame.
    expect(ground).toHaveBeenCalledTimes(1);
    forest.dispose();
  });
  it('culls distant offscreen trees, retains nearby shadow casters and handles harvest and excavation', async () => {
    const { forest, camera, snapshot, ground } = await fixture();
    camera.lookAt(1000, 200, 10000); forest.update(snapshot, ground, new Set(), camera);
    expect(forest.stats.trees).toBe(1); // offscreen but within the shadow radius
    camera.position.z = 6000; camera.lookAt(1000, 200, 10000); forest.update(snapshot, ground, new Set(), camera);
    expect(forest.stats.trees).toBe(0);
    camera.lookAt(1000, 150, 1000); snapshot.harvested.push('natural'); snapshot.revision++;
    forest.update(snapshot, ground, new Set(), camera); expect(forest.stats.trees).toBe(0);
    snapshot.harvested = []; snapshot.revision++; forest.update(snapshot, ground, new Set(), camera); expect(forest.stats.trees).toBe(1);
    ground.mockReturnValue(false); forest.update(snapshot, ground, new Set(['1,1']), camera); expect(forest.stats.trees).toBe(0);
    ground.mockReturnValue(true); forest.update(snapshot, ground, new Set(['1,1']), camera); expect(forest.stats.trees).toBe(1);
    ground.mockReturnValue(false); snapshot.terrain.grades = [[1000, 1000, 100, 256]];
    forest.update(snapshot, ground, new Set(), camera); expect(forest.stats.trees).toBe(0);
    forest.update(snapshot, ground, new Set(), camera, false); expect(forest.stats.draws).toBe(0);
    forest.dispose();
  });
  it('replaces planted trees cleanly without duplicate old instances', async () => {
    const { forest, camera, snapshot, ground } = await fixture();
    snapshot.planted.push({ ...tree, id: 'planted:1', x: 1100 }); snapshot.revision++;
    forest.update(snapshot, ground, new Set(), camera); expect(forest.stats.trees).toBe(2);
    snapshot.planted[0].x = 1150; snapshot.revision++;
    forest.update(snapshot, ground, new Set(), camera); expect(forest.stats.trees).toBe(2);
    snapshot.planted = []; snapshot.revision++;
    forest.update(snapshot, ground, new Set(), camera); expect(forest.stats.trees).toBe(1);
    forest.dispose();
  });
});
