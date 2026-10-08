import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { FriendsBuildVisuals, createFriendsBuildGeometry, createFriendsBuildMaterial, prepareFriendsBuildGeometry } from './FriendsBuildVisuals';
import { FRIENDS_TERRAIN_SURFACES } from '../world/FriendsTerrainAppearance';
afterEach(() => vi.restoreAllMocks());
describe('terrain-matched construction appearance', () => {
  it('preserves unaffected GPU batches and details when one shape is edited, and bounds confirmation pulses',()=>{
    vi.spyOn(THREE.TextureLoader.prototype,'load').mockImplementation(()=>new THREE.Texture());
    const scene=new THREE.Scene(),visuals=new FriendsBuildVisuals(scene);
    const pieces=[{id:1,shape:'block' as const,finish:'stone' as const,author:'Host',revision:1,x:8000,y:8000,z:0,rotation:0},{id:2,shape:'workbench' as const,finish:'timber' as const,author:'Host',revision:1,x:8200,y:8000,z:0,rotation:0}];
    visuals.update({revision:1,guestsCanBuild:true,pieces});
    const block=scene.getObjectByName('creation:block:stone:world') as THREE.InstancedMesh,bench=scene.getObjectByName('creation:workbench:timber:world') as THREE.InstancedMesh;
    const version=bench.instanceMatrix.version,details=scene.children[0].children.filter(o=>o.userData.detailShape==='workbench');
    visuals.update({revision:2,guestsCanBuild:true,pieces:[{...pieces[0],revision:2,x:8032},pieces[1]]});
    expect(bench.instanceMatrix.version).toBe(version);expect(block.instanceMatrix.version).toBeGreaterThan(version);
    expect(scene.children[0].children.filter(o=>o.userData.detailShape==='workbench')).toEqual(details);
    for(let i=0;i<64;i++)visuals.confirm(pieces[0],0);
    expect(visuals['pulses']).toHaveLength(3);visuals.animate(350);expect(visuals['pulses'].every(p=>!p.line.visible)).toBe(true);visuals.dispose();
  });
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
