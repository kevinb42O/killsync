import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createFriendsFishingBoat, updateFriendsFishingBoat } from './FriendsFishingBoatVisuals';
import { FRIENDS_COASTAL_PIER as dock } from '../world/FriendsCoastalPier';
import { FISHING_BOAT_MOORINGS } from '../world/FriendsFishingBoat';
import { ISLAND_SEA_LEVEL } from '../world/FriendsWaterBodies';
vi.mock('./FriendsAssets', async importOriginal => {
  const original = await importOriginal<typeof import('./FriendsAssets')>();
  return { ...original, loadFriendsAsset: async () => {
    const source = new THREE.Group(); source.add(new THREE.Mesh(new THREE.BoxGeometry(8.713,4.135,3.481),new THREE.MeshStandardMaterial()));return source;
  } };
});
describe('moored coastal fishing boat', () => {
  it('keeps the rocking hull clear of the T head, limits bobbing, and updates moorings', async () => {
    const boat = createFriendsFishingBoat(); await Promise.resolve();
    expect(boat.userData.modelReady).toBe(true);
    const body = boat.getObjectByName('fishing-boat-floating-body')!;
    const bounds = new THREE.Box3();
    let min = Infinity, max = -Infinity;
    for(let t=0;t<120;t+=.25){
      updateFriendsFishingBoat(boat,t,boat.position);boat.updateMatrixWorld(true);
      bounds.setFromObject(body);
      expect(bounds.max.x).toBeLessThan(dock.x-dock.sections*dock.sectionLength-5);
      min=Math.min(min,body.position.y);max=Math.max(max,body.position.y);
      expect(Math.abs(body.rotation.x)).toBeLessThanOrEqual(.012);
      expect(Math.abs(body.rotation.z)).toBeLessThanOrEqual(.018);
      for(const [i,rope] of boat.userData.boatMotion.ropes.entries()){
        const attribute=rope.geometry.attributes.position,centre=new THREE.Vector3();
        for(let side=0;side<5;side++)centre.add(new THREE.Vector3().fromBufferAttribute(attribute,side));
        centre.divideScalar(5);rope.localToWorld(centre);
        const fixed=FISHING_BOAT_MOORINGS[i].dock;
        expect(centre.distanceTo(new THREE.Vector3(fixed.x,fixed.z,fixed.y))).toBeLessThan(.001);
      }
    }
    expect(max-min).toBeGreaterThan(3);expect(min).toBeGreaterThanOrEqual(-5);expect(max).toBeLessThanOrEqual(5);
    expect(boat.position.y).toBe(ISLAND_SEA_LEVEL+27);
    updateFriendsFishingBoat(boat,0,new THREE.Vector3(40000,0,0));expect(boat.visible).toBe(false);
    updateFriendsFishingBoat(boat,0,boat.position);expect(boat.visible).toBe(true);
  });
  it('ships a self-contained model with a bounded geometry and draw budget',()=>{
    const bytes=readFileSync('public/models/friends/fishing-boat/boat.glb');
    const g=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
    const primitives=g.meshes.flatMap((m:any)=>m.primitives);
    expect(primitives.length).toBeLessThanOrEqual(11);
    expect(primitives.some((p:any)=>g.materials[p.material]?.name?.includes('glazing'))).toBe(false);
    expect(primitives.reduce((s:number,p:any)=>s+g.accessors[p.indices].count/3,0)).toBeLessThan(50000);
    expect(bytes.length).toBeLessThan(2000000);
    expect(g.extensionsUsed).not.toContain('KHR_materials_transmission');
    expect(g.nodes.some((n:any)=>/Peripheral_rail|side_grabrail|grabrail_seat|Working_gantry|Gantry_load_roller/.test(n.name))).toBe(false);
    for(const i of g.images)expect(i.uri).toBeUndefined();
  });
});
