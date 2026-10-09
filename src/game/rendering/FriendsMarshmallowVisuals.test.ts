import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { FriendsMarshmallowVisuals, createMarshmallowGeometry } from './FriendsMarshmallowVisuals';
import { CAMPFIRE_SEATS } from '../multiplayer/FriendsCampfireSeats';
import { FRIENDS_CAMPFIRE } from '../world/FriendsRegion';
import type { CoopPlayerSnapshot } from '../multiplayer/CoopSimulation';
import type { CampfireSnapshot } from '../multiplayer/FriendsCampfireSimulation';

vi.mock('./FriendsAssets',()=>({loadFriendsAsset:vi.fn(async()=>{const g=new THREE.Group();g.add(new THREE.Mesh(new THREE.BoxGeometry(.1,.06,.2)));return g;})}));
vi.mock('./FriendsHeldEquipment',()=>({acquireEquipmentLighting:()=>({setVisible:vi.fn(),dispose:vi.fn()}),loadFriendsGrip:vi.fn(async()=>new THREE.Mesh(new THREE.BoxGeometry(.08,.08,.5)))}));
const loaded=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();};
const player=(id='local',seat=2)=>({id,...CAMPFIRE_SEATS[seat],lifeState:'alive',friendsSeat:{vehicleId:FRIENDS_CAMPFIRE.id,index:seat}} as CoopPlayerSnapshot);
const state=(toast=0,roasting=false,charred=false):CampfireSnapshot=>({fuelSeconds:100,roasts:{local:{toast,roasting,charred,heat:0,burningMs:0,serial:1}}});
function fixture(){const scene=new THREE.Scene(),p=player(),camera=new THREE.PerspectiveCamera(110,1.5,2,10000);camera.position.set(p.x,p.z+45,p.y);camera.lookAt(FRIENDS_CAMPFIRE.x,FRIENDS_CAMPFIRE.z+35,FRIENDS_CAMPFIRE.y);const visuals=new FriendsMarshmallowVisuals(scene);return {scene,p,camera,visuals};}
const mesh=(root:THREE.Object3D,name:string)=>root.getObjectByName(name) as THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>;
const fireSpot=(seat:number)=>new THREE.Vector3(FRIENDS_CAMPFIRE.x+Math.cos(CAMPFIRE_SEATS[seat].angle)*23,FRIENDS_CAMPFIRE.z+48,FRIENDS_CAMPFIRE.y+Math.sin(CAMPFIRE_SEATS[seat].angle)*23);

describe('Campfire marshmallow presentation',()=>{
  it('projects the local stick into the foreground pass without moving its fire target or grip on screen',async()=>{
    const scene=new THREE.Scene(),viewmodel=new THREE.Scene(),p=player(),remote=player('remote');
    const worldCamera=new THREE.PerspectiveCamera(120,1.6,2,10000),viewCamera=new THREE.PerspectiveCamera(98,1.6,.025,1000);
    scene.add(worldCamera);viewmodel.add(viewCamera);worldCamera.position.set(p.x,p.z+45,p.y);worldCamera.lookAt(FRIENDS_CAMPFIRE.x,FRIENDS_CAMPFIRE.z+35,FRIENDS_CAMPFIRE.y);
    viewCamera.position.copy(worldCamera.position);viewCamera.quaternion.copy(worldCamera.quaternion);
    const visuals=new FriendsMarshmallowVisuals(scene,viewmodel);
    visuals.update([p,remote],{...state(.6,true),equipped:['local','remote']},'local',worldCamera,0,2000);await loaded();scene.updateMatrixWorld(true);viewmodel.updateMatrixWorld(true);
    const local=visuals.held.children[0],peer=visuals.group.children[0];
    expect(local.name).toBe('marshmallow-stick-local');expect(peer.name).toBe('marshmallow-stick-remote');
    const grip=local.getWorldPosition(new THREE.Vector3()).project(viewCamera);expect(grip.x).toBeCloseTo(.48);expect(grip.y).toBeCloseTo(-.64);
    const tip=mesh(local,'toasting-marshmallow').getWorldPosition(new THREE.Vector3()).project(viewCamera);
    const fire=fireSpot(p.friendsSeat!.index).project(worldCamera);
    expect(tip.x).toBeCloseTo(fire.x);expect(tip.y).toBeCloseTo(fire.y);
    expect(mesh(peer,'toasting-marshmallow').material.depthTest).toBe(true);
    visuals.update([p,remote],{...state(),equipped:['local','remote']},'local',worldCamera,1,16,false);
    expect(visuals.held.visible).toBe(false);expect(local.parent).toBe(visuals.group);visuals.dispose();expect(visuals.held.parent).toBeNull();
  });
  it('keeps the equipped stick visible while standing and walking and hides it for other Fun slots',async()=>{
    const {p,camera,visuals}=fixture(),held={...state(.6),equipped:['local']};
    visuals.update([p],held,'local',camera,0,16);await loaded();const root=visuals.group.children[0];
    delete p.friendsSeat;p.x+=200;camera.position.x+=200;
    visuals.update([p],held,'local',camera,1,16);expect(root.parent).toBe(visuals.group);expect(root.visible).toBe(true);
    const food=mesh(root,'toasting-marshmallow');expect(root.getObjectByName('marshmallow-holding-hand')).toBeDefined();
    visuals.update([p],{...held,equipped:[]},'local',camera,2,16);expect(root.visible).toBe(false);
    visuals.update([p],held,'local',camera,3,16);expect(root.visible).toBe(true);expect(mesh(root,'toasting-marshmallow')).toBe(food);
    visuals.dispose();
  });
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
    expect(food.getWorldPosition(new THREE.Vector3()).distanceTo(fireSpot(p.friendsSeat!.index))).toBeLessThan(.001);
    expect(food.geometry).toBe(mesh(visuals.group.children[1],'toasting-marshmallow').geometry);expect(rod.geometry).toBe(mesh(visuals.group.children[1],'long-roasting-stick').geometry);
    const shader={uniforms:{},vertexShader:'#include <begin_vertex>',fragmentShader:'#include <color_fragment>\n#include <roughnessmap_fragment>'} as unknown as Parameters<typeof food.material.onBeforeCompile>[0];food.material.onBeforeCompile(shader,undefined as unknown as THREE.WebGLRenderer);
    expect(shader.uniforms.roastToast.value).toBe(.5);visuals.update([p,remote],state(1,false,true),'local',camera,5,16);
    expect(shader.uniforms.roastChar.value).toBe(1);expect(food.scale.x).toBe(1.1);expect(mesh(root,'toasting-marshmallow')).toBe(food);
    visuals.update([remote],state(),'local',camera,6,16);expect(root.parent).toBeNull();visuals.dispose();expect(visuals.group.parent).toBeNull();
  });
  it('does not resurrect asynchronous models after disposal',async()=>{
    const {p,camera,visuals}=fixture();visuals.update([p],state(),'local',camera,0,16);const root=visuals.group.children[0];visuals.dispose();await loaded();expect(root.getObjectByName('marshmallow-holding-hand')).toBeUndefined();
  });
  it('gives chairs fixed separated roasting spots and resolves standing players sharing the same side',()=>{
    const {camera,visuals}=fixture(),crew=Array.from({length:5},(_,i)=>player('roaster-'+i,i));
    const roasting:CampfireSnapshot={fuelSeconds:100,equipped:crew.map(p=>p.id),roasts:Object.fromEntries(crew.map(p=>[p.id,{toast:.5,roasting:true,charred:false,heat:1,burningMs:0,serial:1}]))};
    const draw=(players:CoopPlayerSnapshot[])=>{visuals.update(players,roasting,'local',camera,0,2000,false);visuals.group.updateMatrixWorld(true);return new Map(players.map(p=>[p.id,mesh(visuals.group.getObjectByName('marshmallow-stick-'+p.id)!,'toasting-marshmallow').getWorldPosition(new THREE.Vector3())]));};
    const seated=draw(crew);
    for(let i=0;i<crew.length;i++)expect(seated.get(crew[i].id)!.distanceTo(fireSpot(i))).toBeLessThan(.001);
    for(const a of crew)for(const b of crew)if(a!==b)expect(seated.get(a.id)!.distanceTo(seated.get(b.id)!)).toBeGreaterThan(17);
    draw([...crew].reverse());expect(draw(crew.slice(0,3)).get(crew[0].id)!.distanceTo(seated.get(crew[0].id)!)).toBeLessThan(.001);
    for(const p of crew){delete p.friendsSeat;p.x=FRIENDS_CAMPFIRE.x+110;p.y=FRIENDS_CAMPFIRE.y;p.z=FRIENDS_CAMPFIRE.z;}
    const standing=draw(crew),reordered=draw([...crew].reverse());
    for(const a of crew){expect(standing.get(a.id)!.distanceTo(reordered.get(a.id)!)).toBeLessThan(.001);for(const b of crew)if(a!==b)expect(standing.get(a.id)!.distanceTo(standing.get(b.id)!)).toBeGreaterThan(17);}
    visuals.dispose();
  });
});
