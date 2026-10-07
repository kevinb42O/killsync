import * as THREE from 'three';
import { CAVE_TREASURES } from '../world/FriendsCave';

export class FriendsTreasureVisuals extends THREE.Group {
  private chests: { id: string; root: THREE.Group; lid: THREE.Group; gold: THREE.InstancedMesh; opened: boolean; amount: number }[] = [];
  constructor() {
    super(); this.name = 'cave-treasures';
    const wood = new THREE.MeshStandardMaterial({ color: 0x593522, roughness: .8 });
    const brass = new THREE.MeshStandardMaterial({ color: 0xcba24e, metalness: .7, roughness: .35 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xffca40, metalness: .75, roughness: .27, emissive: 0xb57109, emissiveIntensity: .35 });
    const beacon = new THREE.MeshStandardMaterial({ color: 0xffd575, emissive: 0xffb837, emissiveIntensity: 1.6 });
    for (const material of [wood, brass, gold]) {
      material.onBeforeCompile = shader => {
        shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_begin>', THREE.ShaderChunk.lights_fragment_begin.replace('getDirectionalLightInfo( directionalLight, directLight );', 'getDirectionalLightInfo( directionalLight, directLight ); directLight.color *= 0.;'));
      };
      material.customProgramCacheKey = () => 'cave-treasure';
    }
    const box = new THREE.BoxGeometry(1, 1, 1), coin = new THREE.CylinderGeometry(4, 4, 1.5, 10);
    const addBox = (parent: THREE.Group, x: number, y: number, z: number, sx: number, sy: number, sz: number, material: THREE.Material) => {
      const mesh = new THREE.Mesh(box, material); mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh);
    };
    for (const t of CAVE_TREASURES) {
      const root = new THREE.Group(); root.position.set(t.x, t.z, t.y); root.rotation.y = t.angle; this.add(root);
      addBox(root, 0, 4, 0, 66, 8, 44, wood);
      addBox(root, 0, 20, 20, 66, 32, 5, wood); addBox(root, 0, 20, -20, 66, 32, 5, wood);
      for (const x of [-31, 31]) addBox(root, x, 20, 0, 5, 32, 44, wood);
      for (const x of [-23, 23]) for(const z of [-23,23]) addBox(root, x, 20, z, 5, 32, 2, brass);
      for(const y of [12,24])for(const z of [-23,23])addBox(root,0,y,z,65,1,1,wood);
      const lid = new THREE.Group(); lid.position.set(0, 36, -22); root.add(lid);
      addBox(lid, 0, 4, 22, 68, 8, 46, wood);
      for (const x of [-23, 23]) addBox(lid, x, 9, 22, 5, 2, 46, brass);
      addBox(lid, 0, -1, 46, 10, 14, 3, beacon);
      const pile = new THREE.InstancedMesh(coin, gold, 24);
      const matrix = new THREE.Matrix4();
      for (let i = 0; i < 24; i++) {
        matrix.makeTranslation(Math.sin(i * 2.399) * (8 + i % 4 * 4), 27 + i % 5 * 1.6, Math.cos(i * 2.399) * (5 + i % 3 * 4));
        pile.setMatrixAt(i, matrix);
      }
      pile.computeBoundingSphere(); root.add(pile);
      this.chests.push({ id: t.id, root, lid, gold: pile, opened: false, amount: 0 });
    }
  }
  update(opened: readonly string[], camera: THREE.Camera, time: number) {
    const ids = new Set(opened);
    for (const c of this.chests) {
      c.root.visible = c.root.position.distanceTo(camera.position) < 2000;
      c.opened = ids.has(c.id);
      c.amount += ((c.opened ? 1 : 0) - c.amount) * .14;
      c.lid.rotation.x = -c.amount * 1.85;
      // The last glimmer remains in the empty coffer; the reward goes to the wallet.
      c.gold.scale.setScalar(1 - c.amount * .85);
      c.gold.position.y = Math.sin(time * 2 + c.root.position.x) * .4;
    }
  }
  dispose() {
    const geometry = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    this.traverse(o => { if (o instanceof THREE.Mesh) { geometry.add(o.geometry); for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m); if (o instanceof THREE.InstancedMesh) o.dispose(); } });
    geometry.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); this.removeFromParent();
  }
}
