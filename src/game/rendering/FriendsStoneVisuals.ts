import * as THREE from 'three';
import type { StonesSnapshot } from '../multiplayer/FriendsStones';
import { STONE_CHARGE_MS, STONE_TOOL } from '../multiplayer/FriendsStones';
import type { CoopPlayerSnapshot } from '../multiplayer/CoopSimulation';
import { acquireEquipmentLighting, frameHeldEquipment, loadFriendsGrip } from './FriendsHeldEquipment';
import { friendsAudio } from '../FriendsAudio';

/** A smooth flattened pebble, the shipped character hand, and shared ripple geometry. */
export class FriendsStoneVisuals {
  readonly group=new THREE.Group();
  readonly held=new THREE.Group();
  private geometry=new THREE.SphereGeometry(1,14,9).scale(1,.52,.78);
  private material=new THREE.MeshStandardMaterial({color:'#85877e',roughness:.88});
  private pebble=new THREE.Mesh(this.geometry,this.material);
  private meshes=new Map<string,THREE.Mesh>();
  private ringGeometry=new THREE.RingGeometry(.82,1,32).rotateX(-Math.PI/2);
  private ringMaterial=new THREE.MeshBasicMaterial({color:'#d9ede3',transparent:true,opacity:.55,depthWrite:false,side:THREE.DoubleSide});
  private rings=new Map<number,THREE.Mesh>();
  private droplets=new THREE.InstancedMesh(new THREE.SphereGeometry(.7,6,4),new THREE.MeshBasicMaterial({color:'#d9ede3',transparent:true,opacity:.8}),160);
  private matrix=new THREE.Matrix4();
  private point=new THREE.Vector3();
  private scale=new THREE.Vector3();
  private turn=new THREE.Quaternion();
  private cameraPoint=new THREE.Vector3();
  private camera?:THREE.PerspectiveCamera;
  private lighting:ReturnType<typeof acquireEquipmentLighting>;
  private disposed=false;
  private heard=new Set<number>();
  private lastThrowAt=new Map<string,number>();
  private lastStones=new Map<number,{x:number;y:number;z:number;atMs:number}>();
  constructor(scene:THREE.Scene,viewmodel:THREE.Scene){
    this.group.name='friends-stones';scene.add(this.group);this.held.name='stone-in-your-hand';this.held.visible=false;
    const parent=viewmodel.getObjectByProperty('type','PerspectiveCamera')||viewmodel;
    if(parent instanceof THREE.PerspectiveCamera)this.camera=parent;parent.add(this.held);
    // Keep the pebble comfortably larger than the palm's small grip geometry,
    // and lift it just above the hand so the held pose reads as a stone resting
    // on the palm instead of disappearing inside it.
    this.pebble.scale.setScalar(.14);this.pebble.position.set(0,.14,.012);this.held.add(this.pebble);
    this.lighting=acquireEquipmentLighting(viewmodel);
    void loadFriendsGrip('right').then(arm=>{if(!this.disposed)this.held.add(arm.clone());}).catch(()=>{});
    this.droplets.frustumCulled=false;this.droplets.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.group.add(this.droplets);
  }
  update(state:StonesSnapshot|undefined,players:readonly CoopPlayerSnapshot[],localId:string,tool:number,camera:THREE.Camera,now:number,firstPerson:boolean,blocked:boolean,handPoint:(id:string,out:THREE.Vector3)=>boolean){
    camera.getWorldPosition(this.cameraPoint);
    const hand=state?.equipped.find(h=>h.playerId===localId);
    const equippedIds=new Set<string>();
    for(const equipped of state?.equipped??[]){
      equippedIds.add(equipped.playerId);
      const throwAt=equipped.throwAt??-1,previous=this.lastThrowAt.get(equipped.playerId);
      if(previous!==undefined&&throwAt>=0&&throwAt!==previous){
        const player=players.find(p=>p.id===equipped.playerId);
        if(player){
          const distance=this.cameraPoint.distanceTo(this.point.set(player.x,player.z,player.y));
          if(distance<900)friendsAudio.play('stoneThrow',.2*(1-distance/900),70,.94+Math.random()*.12,.32);
        }
      }
      this.lastThrowAt.set(equipped.playerId,throwAt);
    }
    for(const id of this.lastThrowAt.keys())if(!equippedIds.has(id))this.lastThrowAt.delete(id);
    this.held.visible=Boolean(firstPerson&&!blocked&&tool===STONE_TOOL&&hand);
    this.lighting.setVisible(this.held.visible);
    if(this.held.visible&&hand){
      frameHeldEquipment(this.held,this.camera);
      // The wrist is the origin of the authored grip; draw the pebble in its palm.
      this.held.position.x*=.7;this.held.position.y+=.10;
      const charge=hand.chargeAt===undefined?0:Math.min(1,(now-hand.chargeAt)/STONE_CHARGE_MS);
      const release=hand.throwAt===undefined?1:Math.min(1,(now-hand.throwAt)/350);
      const flick=Math.sin(release*Math.PI)*(1-release);
      this.held.rotation.set(-charge*.55-flick*1.4,charge*.25,-.12-charge*.15);
      this.held.position.z+=charge*.15-flick*.24;
      this.pebble.visible=now>=hand.readyAt;
    }
    const active=new Set<string>();
    const mesh=(key:string)=>{active.add(key);let m=this.meshes.get(key);if(!m){m=new THREE.Mesh(this.geometry,this.material);this.meshes.set(key,m);this.group.add(m);}m.visible=true;return m;};
    for(const h of state?.equipped??[]){
      if(h.playerId===localId&&firstPerson||now<h.readyAt)continue;
      const p=players.find(p=>p.id===h.playerId);if(!p)continue;
      const m=mesh('hand:'+h.playerId);if(!handPoint(h.playerId,this.point))this.point.set(p.x,p.z+26,p.y);
      m.position.copy(this.point);m.position.y+=2.5;m.scale.setScalar(3);m.rotation.set(.15,-p.angle,.15);
    }
    const currentStones=new Map<number,{x:number;y:number;z:number;atMs:number}>();
    for(const s of state?.stones??[]){
      currentStones.set(s.id,{x:s.x,y:s.y,z:s.z,atMs:s.atMs});
      const m=mesh('air:'+s.id);m.position.set(s.x,s.z,s.y);m.scale.setScalar(3);m.rotation.set((now-s.atMs)*.014,0,(now-s.atMs)*.009);
    }
    for(const s of state?.landed??[]){
      const m=mesh('landed:'+s.id);m.position.set(s.x,s.z,s.y);m.scale.setScalar(3);m.rotation.set(.12,s.id*.73,.08);
    }
    for(const [id,stone]of this.lastStones){
      if(currentStones.has(id)||now-stone.atMs>5500)continue;
      const position=this.point.set(stone.x,stone.z,stone.y),distance=this.cameraPoint.distanceTo(position);
      if(distance<1000)friendsAudio.play('stoneImpact',.22*(1-distance/1000),25,.88+Math.random()*.24,.7);
    }
    this.lastStones=currentStones;
    for(const [key,m]of this.meshes)if(!active.has(key)){m.removeFromParent();this.meshes.delete(key);}
    let drops=0;const splashIds=new Set<number>();
    for(const s of state?.splashes??[]){
      splashIds.add(s.id);const t=Math.max(0,(now-s.atMs)/800);if(t>=1)continue;
      let ring=this.rings.get(s.id);if(!ring){ring=new THREE.Mesh(this.ringGeometry,this.ringMaterial.clone());this.rings.set(s.id,ring);this.group.add(ring);}
      ring.position.set(s.x,s.z+.6,s.y);ring.scale.setScalar(3+t*(s.skip?28:40));(ring.material as THREE.MeshBasicMaterial).opacity=.55*(1-t);
      for(let i=0;i<4;i++){const angle=i*Math.PI/2+s.id;this.point.set(s.x+Math.cos(angle)*t*12,s.z+Math.sin(Math.PI*t)*(s.skip?8:16),s.y+Math.sin(angle)*t*12);this.scale.setScalar(1-t);this.matrix.compose(this.point,this.turn,this.scale);this.droplets.setMatrixAt(drops++,this.matrix);}
      if(!this.heard.has(s.id)){this.heard.add(s.id);const distance=this.cameraPoint.distanceTo(ring.position);if(distance<1000)friendsAudio.play('waterStep',.16*(1-distance/1000),35,s.skip?1.4:1);}
    }
    for(const [id,ring]of this.rings)if(!splashIds.has(id)){ring.removeFromParent();(ring.material as THREE.Material).dispose();this.rings.delete(id);}
    for(const id of this.heard)if(!splashIds.has(id))this.heard.delete(id);
    this.droplets.count=drops;this.droplets.visible=drops>0;if(drops)this.droplets.instanceMatrix.needsUpdate=true;
  }
  dispose(){this.disposed=true;this.group.removeFromParent();this.held.removeFromParent();this.geometry.dispose();this.material.dispose();this.ringGeometry.dispose();this.ringMaterial.dispose();for(const ring of this.rings.values())(ring.material as THREE.Material).dispose();this.droplets.geometry.dispose();(this.droplets.material as THREE.Material).dispose();this.lighting.dispose();}
}
