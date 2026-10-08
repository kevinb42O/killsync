import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { FriendsMarshmallowVisuals, createMarshmallowGeometry } from './FriendsMarshmallowVisuals';
import { CAMPFIRE_SEATS } from '../multiplayer/FriendsCampfireSeats';
import { FRIENDS_CAMPFIRE } from '../world/FriendsRegion';
import type { CoopPlayerSnapshot } from '../multiplayer/CoopSimulation';
import type { CampfireSnapshot } from '../multiplayer/FriendsCampfireSimulation';

vi.mock('./FriendsAssets',()=>({loadFriendsAsset:vi.fn(async()=>{const g=new THREE.Group();g.add(new THREE.Mesh(new THREE.BoxGeometry(.1,.06,.2)));return g;})}));
vi.mock('./FriendsHeldEquipment',()=>({loadFriendsGrip:vi.fn(async()=>new THREE.Mesh(new THREE.BoxGeometry(.08,.08,.5)))}));
const loaded=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();};
const player=(id='local',seat=2)=>({id,...CAMPFIRE_SEATS[seat],lifeState:'alive',friendsSeat:{vehicleId:FRIENDS_CAMPFIRE.id,index:seat}} as CoopPlayerSnapshot);
const state=(toast=0,roasting=false,charred=false):CampfireSnapshot=>({fuelSeconds:100,roasts:{local:{toast,roasting,charred,heat:0,burningMs:0,serial:1}}});
function fixture(){const scene=new THREE.Scene(),p=player(),camera=new THREE.PerspectiveCamera(110,1.5,2,10000);camera.position.set(p.x,p.z+45,p.y);camera.lookAt(FRIENDS_CAMPFIRE.x,FRIENDS_CAMPFIRE.z+35,FRIENDS_CAMPFIRE.y);const visuals=new FriendsMarshmallowVisuals(scene);return {scene,p,camera,visuals};}
const mesh=(root:THREE.Object3D,name:string)=>root.getObjectByName(name) as THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>;

describe('Campfire marshmallow presentation',()=>{
  it('brings the marshmallow to the mouth, hides the bite and returns with a fresh one',()=>{
    const {p,camera,visuals}=fixture(),eating=state(.6);
    eating.roasts.local.eatingMs=1000;
    visuals.update([p],eating,'local',camera,0,2000);visuals.group.updateMatrixWorld(true);
    const root=visuals.group.children[0],food=mesh(root,'toasting-marshmallow');
    const mouth=new THREE.Vector3(0,-5,-7).applyQuaternion(camera.quaternion).add(camera.position);
    expect(food.getWorldPosition(new THREE.Vector3()).distanceTo(mouth)).toBeLessThan(.001);
    expect(food.visible).toBe(true);
    eating.roasts.local.eatingMs=400;visuals.update([p],eating,'local',camera,.6,100);expect(food.visible).toBe(false);
    delete eating.roasts.local.eatingMs;eating.roasts.local.refillMs=5000;
    visuals.update([p],eating,'local',camera,1,2000);expect(food.visible).toBe(false);
    visuals.group.updateMatrixWorld(true);expect(food.getWorldPosition(new THREE.Vector3()).distanceTo(mouth)).toBeGreaterThan(40);
    eating.roasts.local.refillMs=100;visuals.update([p],eating,'local',camera,5.9,100);expect(food.visible).toBe(false);
    visuals.update([p],state(),'local',camera,6,100);expect(food.visible).toBe(true);
    visuals.dispose();
  });
  it('has rolled edges, smooth finite normals and a modest shared mesh',()=>{
    const geometry=createMarshmallowGeometry();geometry.computeBoundingBox();expect(geometry.boundingBox!.getSize(new THREE.Vector3()).y).toBeCloseTo(10.5,1);
    expect(geometry.index!.count/3).toBeLessThan(650);expect([...geometry.getAttribute('normal').array].every(Number.isFinite)).toBe(true);
    const p=geometry.getAttribute('position');const radii=[];for(let i=0;i<p.count;i++)if(Math.abs(p.getY(i))>4.9)radii.push(Math.hypot(p.getX(i),p.getZ(i)));
    expect(Math.max(...radii)).toBeLessThan(4.5);geometry.dispose();
  });
  it('keeps the grip at the same screen position at high FOV, narrow aspect and with a parented camera',async()=>{
    const {scene,p,camera,visuals}=fixture();const parent=new THREE.Group();parent.position.set(20,5,-15);scene.add(parent);parent.attach(camera);
    for(const [fov,aspect] of [[75,1.5],[120,2.4],[110,.75]]){
      camera.fov=fov;camera.aspect=aspect;camera.updateProjectionMatrix();scene.updateMatrixWorld(true);
      visuals.update([p],state(),'local',camera,0,16);await loaded();const root=visuals.group.children[0];scene.updateMatrixWorld(true);
      const screen=root.getWorldPosition(new THREE.Vector3()).project(camera);expect(screen.x).toBeCloseTo(.48);expect(screen.y).toBeCloseTo(-.64);expect(root.visible).toBe(true);
      expect(mesh(root,'long-roasting-stick').quaternion.angleTo(mesh(root,'marshmallow-holding-hand').quaternion)).toBeCloseTo(0);
    }
    visuals.dispose();
  });
  it('reaches the real fire, shares geometry and updates cooking uniforms without rebuilding meshes',async()=>{
    const {p,camera,visuals}=fixture(),remote=player('remote',3);visuals.update([p,remote],state(.5,true),'local',camera,0,2000);await loaded();visuals.update([p,remote],state(.5,true),'local',camera,0,2000);
    const root=visuals.group.children[0],food=mesh(root,'toasting-marshmallow'),rod=mesh(root,'long-roasting-stick');visuals.group.updateMatrixWorld(true);
    expect(food.getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(FRIENDS_CAMPFIRE.x,FRIENDS_CAMPFIRE.z+48,FRIENDS_CAMPFIRE.y))).toBeLessThan(.001);
    expect(food.geometry).toBe(mesh(visuals.group.children[1],'toasting-marshmallow').geometry);expect(rod.geometry).toBe(mesh(visuals.group.children[1],'long-roasting-stick').geometry);
    const shader={uniforms:{},vertexShader:'#include <begin_vertex>',fragmentShader:'#include <color_fragment>\n#include <roughnessmap_fragment>'} as unknown as Parameters<typeof food.material.onBeforeCompile>[0];food.material.onBeforeCompile(shader,undefined as unknown as THREE.WebGLRenderer);
    expect(shader.uniforms.roastToast.value).toBe(.5);visuals.update([p,remote],state(1,false,true),'local',camera,5,16);
    expect(shader.uniforms.roastChar.value).toBe(1);expect(food.scale.x).toBe(1.1);expect(mesh(root,'toasting-marshmallow')).toBe(food);
    visuals.update([remote],state(),'local',camera,6,16);expect(root.parent).toBeNull();visuals.dispose();expect(visuals.group.parent).toBeNull();
  });
  it('does not resurrect asynchronous models after disposal',async()=>{
    const {p,camera,visuals}=fixture();visuals.update([p],state(),'local',camera,0,16);const root=visuals.group.children[0];visuals.dispose();await loaded();expect(root.getObjectByName('marshmallow-holding-hand')).toBeUndefined();
  });
});
