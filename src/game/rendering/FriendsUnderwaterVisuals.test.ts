import { describe,expect,it,vi } from 'vitest';
import * as THREE from 'three';
import { FriendsUnderwaterVisuals } from './FriendsUnderwaterVisuals';
import { FriendsTerrain } from '../world/FriendsTerrain';

const camera=()=>{const c=new THREE.PerspectiveCamera();c.position.set(12128,90,23600);return c;};
describe('underwater scene lifecycle and bounded effects',()=>{
 it('prepares world shaders and hidden bed scenery before the first dive',()=>{
  const scene=new THREE.Scene(),effect=new FriendsUnderwaterVisuals(scene);
  // The production world is built after the effect's constructor.
  const material=new THREE.MeshStandardMaterial(),mesh=new THREE.Mesh(new THREE.BoxGeometry(),material);scene.add(mesh);
  const original=material.onBeforeCompile;
  effect.prepare();const hook=material.onBeforeCompile,version=material.version,key=material.customProgramCacheKey();
  expect(hook).not.toBe(original);
  const dressing=scene.getObjectByName('submerged-bed-dressing')!;
  expect(dressing.visible).toBe(false);
  const floor=vi.spyOn(FriendsTerrain.prototype,'floor');
  try{
   const terrain=new FriendsTerrain(),c=camera();c.position.y=220;effect.beginFrame();effect.update(c,0,true,1,terrain);
   expect(floor).not.toHaveBeenCalled();
   c.position.y=90;effect.beginFrame();effect.update(c,1000,true,1,terrain);
   expect(material.onBeforeCompile).toBe(hook);expect(material.version).toBe(version);expect(material.customProgramCacheKey()).toBe(key);
   expect(scene.getObjectByName('submerged-bed-dressing')).toBe(dressing);
  }finally{floor.mockRestore();effect.dispose();mesh.geometry.dispose();material.dispose();}
 });
 it('discovers streamed materials on land in bounded batches without scanning at dive entry',()=>{
  const scene=new THREE.Scene(),effect=new FriendsUnderwaterVisuals(scene),geometry=new THREE.BoxGeometry();
  const materials=Array.from({length:400},()=>new THREE.MeshStandardMaterial());
  for(const material of materials)scene.add(new THREE.Mesh(geometry,material));
  const originals=materials.map(m=>m.onBeforeCompile),bound=()=>materials.filter((m,i)=>m.onBeforeCompile!==originals[i]).length;
  const clock=vi.spyOn(performance,'now').mockReturnValue(0);
  try{
   effect.beginFrame();expect(bound()).toBeGreaterThan(0);expect(bound()).toBeLessThanOrEqual(128);
   const before=bound();effect.update(camera(),1000);expect(bound()).toBe(before);
   for(let frame=0;frame<10;frame++)effect.beginFrame();
   expect(bound()).toBe(400);
  }finally{clock.mockRestore();effect.dispose();geometry.dispose();materials.forEach(m=>m.dispose());}
 });
 it('restores fog, background and atmospheric visibility when surfacing',()=>{
  const scene=new THREE.Scene(),fog=new THREE.FogExp2('#b5cccf',.000015),background=new THREE.Color('#b5cccf');scene.fog=fog;scene.background=background;
  const sky=new THREE.Group();sky.name='frontier-day-night-sky';scene.add(sky);const clouds=new THREE.Group();clouds.name='frontier-volumetric-cumulus';clouds.visible=false;scene.add(clouds);
  const effect=new FriendsUnderwaterVisuals(scene),c=camera();effect.update(c,1000);expect(scene.fog).not.toBe(fog);expect(sky.visible).toBe(false);expect(effect.motes.visible).toBe(true);
  effect.beginFrame();c.position.y=220;effect.update(c,1016);expect(scene.fog).toBe(fog);expect(scene.background).toBe(background);expect(sky.visible).toBe(true);expect(clouds.visible).toBe(false);expect(effect.motes.visible).toBe(false);expect(effect.shafts.visible).toBe(false);effect.dispose();
 });
 it('suppresses sunlight beneath a solid roof and at night',()=>{
  const scene=new THREE.Scene(),terrain=new FriendsTerrain(),c=camera(),vx=Math.floor(c.position.x/32),vy=Math.floor(c.position.z/32);
  for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)terrain.set(vx+x,vy+y,6,1);
  const effect=new FriendsUnderwaterVisuals(scene);effect.update(c,1000,true,1,terrain);expect(effect.overlay.visible).toBe(true);expect(effect.shafts.visible).toBe(false);
  effect.beginFrame();effect.update(c,1500,true,0);expect(effect.shafts.visible).toBe(false);effect.dispose();
 });
 it('reuses fixed particle/shaft geometry and releases material hooks on disposal',()=>{
  const scene=new THREE.Scene(),material=new THREE.MeshStandardMaterial(),mesh=new THREE.Mesh(new THREE.BoxGeometry(),material);scene.add(mesh);
  const hook=material.onBeforeCompile,key=material.customProgramCacheKey,effect=new FriendsUnderwaterVisuals(scene),c=camera(),points=effect.motes.geometry,shafts=effect.shafts.geometry;
  expect(material.onBeforeCompile).not.toBe(hook);expect(effect.motes.geometry.getAttribute('position').count).toBe(192);expect(effect.shafts.count).toBe(9);
  for(let i=0;i<100;i++){effect.beginFrame();effect.update(c,1000+i*16);}
  expect(effect.motes.geometry).toBe(points);expect(effect.shafts.geometry).toBe(shafts);expect(scene.children.filter(o=>o.name.startsWith('underwater-'))).toHaveLength(3);
  effect.dispose();expect(material.onBeforeCompile).toBe(hook);expect(material.customProgramCacheKey).toBe(key);expect(scene.children.filter(o=>o.name.startsWith('underwater-'))).toHaveLength(0);mesh.geometry.dispose();material.dispose();
 });
 it('continues darkening the water and motes beyond the old 900-unit plateau',()=>{
  const scene=new THREE.Scene(),terrain=new FriendsTerrain(),effect=new FriendsUnderwaterVisuals(scene),c=camera(),brightness:number[]=[],motes:number[]=[];
  c.position.x=44000;c.position.z=23852;
  for(const depth of [40,300,900,1800,3200]){
   effect.beginFrame();c.position.y=-168.5-depth;effect.update(c,1000+depth,true,1,terrain);
   const color=(scene.fog as THREE.FogExp2).color;brightness.push(color.r*.2126+color.g*.7152+color.b*.0722);motes.push(effect.motes.material.uniforms.light.value);
  }
  for(let i=1;i<brightness.length;i++){expect(brightness[i]).toBeLessThan(brightness[i-1]);expect(motes[i]).toBeLessThan(motes[i-1]);}
  expect(brightness[4]).toBeLessThan(brightness[3]*.4);effect.dispose();
 });
 it('keeps lighting uniform ownership separate between scenes',()=>{
  const a=new THREE.Scene(),b=new THREE.Scene(),m=new THREE.MeshStandardMaterial();a.add(new THREE.Mesh(new THREE.BoxGeometry(),m));const n=m.clone();b.add(new THREE.Mesh(new THREE.BoxGeometry(),n));
  const ea=new FriendsUnderwaterVisuals(a),eb=new FriendsUnderwaterVisuals(b),c=camera();ea.update(c,1000);expect(a.fog).not.toBeNull();expect(b.fog).toBeNull();ea.beginFrame();eb.update(c,2000,true,0);expect(a.fog).toBeNull();expect(b.fog).not.toBeNull();ea.dispose();eb.dispose();a.children.forEach(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});b.children.forEach(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});m.dispose();n.dispose();
 });
});
