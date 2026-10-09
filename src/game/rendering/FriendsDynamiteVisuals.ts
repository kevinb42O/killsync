import { createDynamiteModel, animateDynamiteFuse, disposeDynamiteModel } from './FriendsDynamiteModel';
import * as THREE from 'three';
import { DYNAMITE_RADIUS, type DynamiteSnapshot, type DynamiteCharge } from '../multiplayer/FriendsDynamite';
import { friendsAudio } from '../FriendsAudio';

type Effect = { group: THREE.Group; material: THREE.MeshBasicMaterial; smoke: THREE.MeshBasicMaterial };
/** Bounded world-space effects reconstructed from host timestamps on every peer. */
export class FriendsDynamiteVisuals {
  private charges = new Map<number, THREE.Group>();
  private held=new Map<string,THREE.Group>();
  private fuseVoices=new Map<number,AudioBufferSourceNode>();
  private effects = new Map<number, Effect>();
  private sounded = new Set<number>();
  private sphere = new THREE.SphereGeometry(1, 12, 8);
  private box = new THREE.BoxGeometry(1, 1, 1);
  private ring = new THREE.TorusGeometry(1, .015, 4, 48);
  private debris = new THREE.MeshStandardMaterial({ color: '#887765', roughness: 1 });
  private matrix = new THREE.Matrix4();
  private positionScratch = new THREE.Vector3();
  private rotationScratch = new THREE.Euler();
  private quaternionScratch = new THREE.Quaternion();
  private scaleScratch = new THREE.Vector3();
  constructor(private scene: THREE.Scene) {}
  private position(group: THREE.Group, c: DynamiteCharge) { group.position.set(c.x, c.z, c.y); }
  update(snapshot: DynamiteSnapshot | undefined, now: number, listener: {x:number;y:number;z:number}) {
    const charges = new Set<number>(), blasts = new Set<number>();
    for (const c of snapshot?.charges || []) {
      charges.add(c.id);
      let group = this.charges.get(c.id);
      if (!group) {
        group = createDynamiteModel(); group.name = 'friends-dynamite-charge';
        this.scene.add(group); this.charges.set(c.id, group);
      }
      this.position(group, c);
      const remaining = THREE.MathUtils.clamp((c.explodeAtMs-now)/3000, 0, 1);
      animateDynamiteFuse(group,remaining,now);
      group.rotation.set((now-c.atMs)*.004,(now-c.atMs)*.002,0);
      if(!this.fuseVoices.has(c.id)&&remaining>0) {
        const distance=Math.hypot(listener.x-c.x,listener.y-c.y,listener.z-c.z);
        if(distance<900) {
          const voice=friendsAudio.play('dynamiteFuse',.35*Math.pow(1-distance/900,2),0,1,remaining*3,{loop:true,fadeOutSeconds:.06});
          if(voice)this.fuseVoices.set(c.id,voice);
        }
      }
    }
    for (const b of snapshot?.blasts || []) {
      const age = (now-b.explodeAtMs)/1000;
      if (age < 0 || age > 2.5) continue;
      blasts.add(b.id);
      let effect = this.effects.get(b.id);
      if (!effect) {
        const group = new THREE.Group(); group.name = 'friends-dynamite-explosion';
        const material = new THREE.MeshBasicMaterial({ color: '#ff9b35', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
        const smoke = new THREE.MeshBasicMaterial({ color: '#625b56', transparent: true, depthWrite: false });
        const fireball = new THREE.Group();
        fireball.add(new THREE.Mesh(this.sphere, material));
        for(let i=0;i<7;i++) {
          const flame = new THREE.Mesh(this.sphere, material), angle=i*2.39996;
          flame.position.set(Math.cos(angle)*.7, .2+(i%3)*.3, Math.sin(angle)*.7);
          flame.scale.setScalar(.45+(i%3)*.08); fireball.add(flame);
        }
        group.add(fireball);
        const shockwave = new THREE.Mesh(this.ring, material); shockwave.rotation.x = Math.PI/2; group.add(shockwave);
        for (let i = 0; i < 6; i++) group.add(new THREE.Mesh(this.sphere, smoke));
        const fragments = new THREE.InstancedMesh(this.box, this.debris, 36); fragments.frustumCulled = false; group.add(fragments);
        this.position(group, b); this.scene.add(group); effect = { group, material, smoke }; this.effects.set(b.id, effect);
      }
      if (!this.sounded.has(b.id)) {
        this.sounded.add(b.id);
        const distance = Math.hypot(listener.x-b.x,listener.y-b.y,listener.z-b.z);
        if (age < .8 && distance < 2200) friendsAudio.play('dynamiteExplosion', .8*Math.pow(1-distance/2200,2), 0);
      }
      effect.material.opacity = Math.max(0,.85-age/ .65);
      effect.group.children[0].scale.setScalar(8 + Math.min(1,age/.2)*DYNAMITE_RADIUS*.52);
      effect.group.children[1].scale.setScalar(12+age*340);
      effect.smoke.opacity = Math.min(.5,Math.max(0,age-.15)*.8)*Math.max(0,1-age/2.5);
      for(let i=0;i<6;i++) {
        const p=effect.group.children[i+2], angle=i*Math.PI/3;
        p.position.set(Math.cos(angle)*age*28,age*42+i*6,Math.sin(angle)*age*28);
        p.scale.setScalar(12+age*24+i*2);
      }
      const debris=effect.group.children[8] as THREE.InstancedMesh, matrix=this.matrix;
      for(let i=0;i<36;i++) {
        const angle=i*2.39996, speed=60+(i%7)*15, t=Math.min(age,1.7);
        const p=this.positionScratch.set(Math.cos(angle)*speed*t,Math.max(-6,(75+(i%5)*18)*t-100*t*t),Math.sin(angle)*speed*t);
        matrix.compose(p,this.quaternionScratch.setFromEuler(this.rotationScratch.set(t*(i%3+2),angle+t*3,t*4)),this.scaleScratch.setScalar(Math.max(0,1-age/2.5)*(3+i%4)));
        debris.setMatrixAt(i,matrix);
      }
      debris.instanceMatrix.needsUpdate=true;
    }
    for(const [id,g] of this.charges) if(!charges.has(id)){disposeDynamiteModel(g);this.charges.delete(id);}
    for(const [id,e] of this.effects) if(!blasts.has(id)){this.scene.remove(e.group);e.material.dispose();e.smoke.dispose();(e.group.children[8] as THREE.InstancedMesh).dispose();this.effects.delete(id);}
    for(const [id,voice] of this.fuseVoices)if(!charges.has(id)){try{voice.stop();}catch{}this.fuseVoices.delete(id);}
    for(const id of this.sounded) if(!blasts.has(id)) this.sounded.delete(id);
  }
  updateHeld(state:DynamiteSnapshot|undefined,players:readonly {id:string;angle:number}[],localId:string,now:number,handPoint:(id:string,out:THREE.Vector3)=>boolean) {
    const active=new Set<string>();
    for(const hand of state?.equipped||[]) {
      if(hand.playerId===localId || !handPoint(hand.playerId,this.positionScratch))continue;
      const age=hand.throwAt===undefined?Infinity:now-hand.throwAt;
      if(age>=100&&age<560)continue;
      active.add(hand.playerId);let group=this.held.get(hand.playerId);
      if(!group){group=createDynamiteModel();group.name='friends-remote-held-dynamite';group.scale.setScalar(.6);this.scene.add(group);this.held.set(hand.playerId,group);}
      group.position.copy(this.positionScratch);group.position.y+=3;group.rotation.set(0,-(players.find(p=>p.id===hand.playerId)?.angle||0),Math.PI/2);
    }
    for(const [id,g] of this.held)if(!active.has(id)){disposeDynamiteModel(g);this.held.delete(id);}
  }
  dispose() {
    for(const g of this.charges.values())disposeDynamiteModel(g);
    for(const g of this.held.values())disposeDynamiteModel(g);this.held.clear();
    for(const voice of this.fuseVoices.values())try{voice.stop();}catch{}this.fuseVoices.clear();
    for(const e of this.effects.values()){this.scene.remove(e.group);e.material.dispose();e.smoke.dispose();(e.group.children[8] as THREE.InstancedMesh).dispose();}
    this.charges.clear();this.effects.clear();this.sounded.clear();
    for(const resource of [this.sphere,this.box,this.ring,this.debris])resource.dispose();
  }
}
