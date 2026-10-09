import * as THREE from 'three';
import { meshIslandRuins, type RuinMeshData } from '../world/FriendsIslandRuinMesh';

/** Immutable castle boundary shared across the menu, joins and respawns.
 * Generate it off-thread; individual scenes own and dispose their GPU buffers. */
let cached: RuinMeshData | undefined;
let worker: Worker | undefined;
let fallback: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<(mesh: RuinMeshData) => void>();

function complete(mesh: RuinMeshData) {
  cached = mesh;
  worker?.terminate(); worker = undefined;
  for (const listener of listeners) listener(mesh);
  listeners.clear();
}

function load(listener: (mesh: RuinMeshData) => void) {
  if (cached) { listener(cached); return () => {}; }
  listeners.add(listener);
  if (!worker && fallback === undefined) {
    const fail = () => {
      worker?.terminate(); worker = undefined;
      // A browser that disallows workers still gets the same castle. Defer
      // this bounded fallback so constructing an arena can finish first.
      if (fallback === undefined) fallback = setTimeout(() => {
        fallback = undefined; complete(meshIslandRuins());
      }, 0);
    };
    try {
      worker = new Worker(new URL('./friendsIslandMasonry.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (event: MessageEvent<RuinMeshData>) => complete(event.data);
      worker.onerror = fail;
      worker.postMessage(null);
    } catch { fail(); }
  }
  return () => { listeners.delete(listener); };
}

export class FriendsIslandMasonry extends THREE.Mesh<THREE.BufferGeometry, THREE.Material[]> {
  private cancel: () => void;

  constructor(materials: THREE.Material[]) {
    super(new THREE.BufferGeometry(), materials);
    this.name = 'unified-voxel-masonry';
    this.receiveShadow = this.castShadow = true;
    this.visible = false;
    this.cancel = load(mesh => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
      geometry.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3));
      geometry.setAttribute('uv', new THREE.BufferAttribute(mesh.uv, 2));
      for (const group of mesh.groups) geometry.addGroup(group.start, group.count, group.materialIndex);
      geometry.computeBoundingSphere();
      this.geometry.dispose(); this.geometry = geometry; this.visible = true;
    });
  }

  dispose() { this.cancel(); }
}
