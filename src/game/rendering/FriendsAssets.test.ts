import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { FRIENDS_ASSETS, fitFriendsAsset, addFriendsAssetInstances } from './FriendsAssets';

describe('bundled Friends models', () => {
  it('preserves decorative model proportions inside their reserved footprint', () => {
    const source=new THREE.Group();source.add(new THREE.Mesh(new THREE.BoxGeometry(2,4,6),new THREE.MeshStandardMaterial()));
    const fitted=fitFriendsAsset(source,{x:130,y:195,z:130},0,'contain'),bounds=new THREE.Box3().setFromObject(fitted),size=bounds.getSize(new THREE.Vector3());
    expect(size.x/size.y).toBeCloseTo(.5);expect(size.z/size.y).toBeCloseTo(1.5);expect(size.x).toBeLessThanOrEqual(130);expect(size.y).toBeLessThanOrEqual(195);expect(size.z).toBeCloseTo(130);expect(bounds.min.y).toBeCloseTo(0);
  });
  it('shares vegetation GPU geometry and maps across tiles while keeping shader materials independent', async () => {
    const source=new THREE.Group(),texture=new THREE.Texture();source.add(new THREE.Mesh(new THREE.BoxGeometry(1,3,1),new THREE.MeshStandardMaterial({map:texture})));
    const loader=vi.spyOn(GLTFLoader.prototype,'loadAsync').mockResolvedValue({scene:source} as never);
    try {
      const a=new THREE.Group(),b=new THREE.Group();
      await addFriendsAssetInstances(a,'frontierPine',{x:179,y:319,z:179},[{x:0,y:0,z:0}]);
      await addFriendsAssetInstances(b,'frontierPine',{x:179,y:319,z:179},[{x:512,y:0,z:0}]);
      const first=a.children[0] as THREE.InstancedMesh,second=b.children[0] as THREE.InstancedMesh;
      expect(first.geometry).toBe(second.geometry);expect(first.geometry.userData.friendsShared).toBe(true);
      const ma=first.material as THREE.MeshStandardMaterial,mb=second.material as THREE.MeshStandardMaterial;
      expect(ma.map).toBe(mb.map);expect(ma).not.toBe(mb);expect(ma.userData.friendsSharedTextures).toBe(true);
      expect(loader).toHaveBeenCalledTimes(1);
    } finally { loader.mockRestore(); }
  });
  it('ships every model, its external textures and the original CC0 license locally', () => {
    for (const asset of Object.values(FRIENDS_ASSETS)) {
      const path = resolve('public/models/friends', `${asset}.glb`), bytes = readFileSync(path);
      expect(bytes.readUInt32LE(0)).toBe(0x46546c67); expect(bytes.readUInt32LE(4)).toBe(2); expect(bytes.readUInt32LE(8)).toBe(bytes.length);
      const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
      for (const resource of [...(json.images || []), ...(json.buffers || [])]) if (resource.uri && !resource.uri.startsWith('data:')) expect(existsSync(resolve(dirname(path), resource.uri))).toBe(true);
      const licensePath=['License.txt','LICENSE'].map(name=>resolve(dirname(path),name)).find(existsSync);
      expect(licensePath,`Missing asset license: ${path}`).toBeDefined();
      const license = readFileSync(licensePath!, 'utf8'); expect(license).toContain('CC0');
    }
  });
  it('fits source orientations precisely and gives each world independent geometry and materials', () => {
    const source = new THREE.Group(), mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 6), new THREE.MeshStandardMaterial()); source.add(mesh);
    const fitted = fitFriendsAsset(source, { x: 180, y: 129, z: 112 }, -Math.PI / 2);
    const bounds = new THREE.Box3().setFromObject(fitted), size = bounds.getSize(new THREE.Vector3());
    expect(size.x).toBeCloseTo(180); expect(size.y).toBeCloseTo(129); expect(size.z).toBeCloseTo(112); expect(bounds.min.y).toBeCloseTo(0);
    const cloned = (fitted.children[0] as THREE.Group).children[0] as THREE.Mesh;
    expect(cloned.geometry).not.toBe(mesh.geometry); expect(cloned.material).not.toBe(mesh.material);
    expect(mesh.geometry.boundingBox?.getSize(new THREE.Vector3()).x).not.toBe(180);
  });
});
