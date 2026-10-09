import * as THREE from 'three';
import type { CoopPlayerSnapshot } from '../multiplayer/CoopSimulation';
import { COOP_MAX_PLAYERS } from '../multiplayer/protocol';
import { firstPersonEyeZ } from '../multiplayer/FirstPersonEye';
import { FRIENDS_FLASHLIGHT_INTENSITY, FRIENDS_FLASHLIGHT_RANGE, FRIENDS_FLASHLIGHT_MAX_ANGLE, FRIENDS_FLASHLIGHT_PENUMBRA } from './FriendsFlashlight';
import { installFriendsFlashlightFalloff, FRIENDS_FLASHLIGHT_SOFT_DISTANCE } from './FriendsFlashlightFalloff';
import { FriendsSharedFlashlightAtlas } from './FriendsSharedFlashlightAtlas';

export type FriendsFlashlightGlare = { flares: readonly THREE.Vector4[]; glare: number; afterimage: THREE.Vector4 };
export type FlashlightOcclusion = (source: THREE.Vector3, eye: THREE.Vector3) => boolean;
export type FlashlightEmission = (id:string,position:THREE.Vector3) => boolean;
const CAPACITY=Math.min(4,COOP_MAX_PLAYERS-1);
const GLARE_DISTANCE=2100;

/** At most four remote beams, permanently in the world's shader layout.
 * Shadows are cached at 10 Hz nearby / 5 Hz far away, with at most one remote
 * shadow refresh per display frame. Off lights skip shadow work.
 * Lens/eye effects reuse the existing Friends HDR composite, without bloom. */
export class FriendsSharedFlashlights {
  private atlas:FriendsSharedFlashlightAtlas;
  private slots: {
    id?:string; light:THREE.SpotLight; target:THREE.Object3D; direction:THREE.Vector3;
    active:boolean; ready:boolean; shadowAt:number; checkedAt:number; occluded:boolean; revision:string;
    checkedSource:THREE.Vector3; checkedEye:THREE.Vector3;
  }[]=[];
  private eye=new THREE.Vector3();
  private view=new THREE.Vector3();
  private toEye=new THREE.Vector3();
  private aimToEye=new THREE.Vector3();
  private screen=new THREE.Vector3();
  private imprintPosition=new THREE.Vector2(.5,.5);
  private exposure=0;
  private disposed=false;
  readonly presentation:FriendsFlashlightGlare={flares:Array.from({length:CAPACITY},()=>new THREE.Vector4()),glare:0,afterimage:new THREE.Vector4(.5,.5,0,0)};

  constructor(scene:THREE.Scene, renderer:THREE.WebGLRenderer, private mobile=false) {
    installFriendsFlashlightFalloff();
    this.atlas=new FriendsSharedFlashlightAtlas(scene,renderer,mobile?256:512);
    for(let i=0;i<CAPACITY;i++){
      const light=new THREE.SpotLight(0xf2f7ff,0,FRIENDS_FLASHLIGHT_RANGE,FRIENDS_FLASHLIGHT_MAX_ANGLE,FRIENDS_FLASHLIGHT_PENUMBRA,-FRIENDS_FLASHLIGHT_SOFT_DISTANCE);
      // Remote spots share the local falloff but use no cookie sampler. Four
      // extra cookies can exceed mobile texture-unit limits alongside terrain.
      const target=new THREE.Object3D();light.target=target;
      light.name=`shared-flashlight-${i}`;light.position.set(0,100,0);target.position.set(0,100,-FRIENDS_FLASHLIGHT_RANGE);
      light.shadow.mapSize.setScalar(mobile?256:512);
      light.shadow.camera.near=4;light.shadow.bias=-.0003;
      light.shadow.autoUpdate=false;light.shadow.needsUpdate=true;
      this.atlas.configure(light,i);
      scene.add(light,target);
      this.slots.push({light,target,direction:new THREE.Vector3(),active:false,ready:false,shadowAt:-Infinity,checkedAt:-Infinity,occluded:true,revision:'',checkedSource:new THREE.Vector3(),checkedEye:new THREE.Vector3()});
    }
  }

  update(players:readonly CoopPlayerSnapshot[],localId:string,camera:THREE.PerspectiveCamera,now:number,deltaMs:number,
    blocked:FlashlightOcclusion,revision='',eyesAvailable=true,emission?:FlashlightEmission) {
    if(this.disposed)return this.presentation;
    camera.getWorldPosition(this.eye);camera.getWorldDirection(this.view);
    // Keep assignments stable across roster order, toggles and late joins.
    for(const s of this.slots)if(s.id && !players.some(p=>p.id===s.id && p.id!==localId)){
      s.id=undefined;s.ready=false;s.checkedAt=-Infinity;
    }
    for(const p of players)if(p.id!==localId && !this.slots.some(s=>s.id===p.id)){
      const slot=this.slots.find(s=>!s.id);if(slot){slot.id=p.id;slot.ready=false;slot.shadowAt=-Infinity;slot.checkedAt=-Infinity;}
    }
    let glare=0,refresh:typeof this.slots[number]|undefined,priority=0;
    for(let i=0;i<CAPACITY;i++){
      const s=this.slots[i],p=players.find(p=>p.id===s.id),state=p?.friendsFlashlight,flare=this.presentation.flares[i];
      flare.set(0,0,0,0);s.active=!!state && p?.lifeState==='alive';
      if(s.active && p && state){
        const pitch=THREE.MathUtils.clamp(state.pitch,-1.45,1.45),cp=Math.cos(pitch),yaw=state.yaw??p.angle;
        s.direction.set(Math.cos(yaw)*cp,Math.sin(pitch),Math.sin(yaw)*cp);
        // Place the torch in front of the operator, clear of their own shadow.
        s.light.position.set(p.x,firstPersonEyeZ(p)-5,p.y)
          .addScaledVector(s.direction,18);
        s.light.position.x+=Math.sin(yaw)*10;s.light.position.z-=Math.cos(yaw)*10;
        // In the live world use the animated torch lens, never an estimate on
        // the character's face. A loading/hidden rig cannot emit floating glare.
        const hasEmission=!emission||emission(p.id,s.light.position);
        s.target.position.copy(s.light.position).addScaledVector(s.direction,FRIENDS_FLASHLIGHT_RANGE);
        s.light.angle=THREE.MathUtils.clamp(state.cone,.35,FRIENDS_FLASHLIGHT_MAX_ANGLE);
        const distance=s.light.position.distanceTo(this.eye);
        s.active=hasEmission&&distance<FRIENDS_FLASHLIGHT_RANGE+1600;
        if(s.active){
          const interval=(this.mobile?150:100)*(distance>1400?2:1),score=(now-s.shadowAt)/interval;
          if(score>=1 && (!refresh || score>priority)){refresh=s;priority=score;}
          this.toEye.copy(this.eye).sub(s.light.position).normalize();
          const beamFacing=s.direction.dot(this.toEye),viewFacing=-this.view.dot(this.toEye);
          const spill=THREE.MathUtils.smoothstep(beamFacing,Math.cos(s.light.angle),Math.cos(s.light.angle*(1-s.light.penumbra)));
          if(eyesAvailable && distance<FRIENDS_FLASHLIGHT_RANGE && distance>5 && viewFacing>0 && spill>0){
            this.screen.copy(s.light.position).project(camera);
            if(this.screen.z>=-1 && this.screen.z<=1 && Math.abs(this.screen.x)<1.15 && Math.abs(this.screen.y)<1.15){
              if(now-s.checkedAt>=75 || s.revision!==revision || s.checkedSource.distanceToSquared(s.light.position)>16 || s.checkedEye.distanceToSquared(this.eye)>16){
                s.occluded=blocked(s.light.position,this.eye);s.checkedAt=now;s.revision=revision;
                s.checkedSource.copy(s.light.position);s.checkedEye.copy(this.eye);
              }
              if(!s.occluded){
                const strength=spill/(1+(distance/750)**2);
                flare.set(this.screen.x*.5+.5,this.screen.y*.5+.5,strength,1);
                // Aim is sent from the player's eyes. Evaluating its tiny old
                // hotspot from the offset torch made close face hits miss.
                // Physical spill and occlusion still use the actual lamp.
                this.aimToEye.set(this.eye.x-p.x,this.eye.y-firstPersonEyeZ(p),this.eye.z-p.y).normalize();
                const hotspot=THREE.MathUtils.smoothstep(s.direction.dot(this.aimToEye),Math.cos(.36),Math.cos(.10));
                const eyeContact=THREE.MathUtils.smoothstep(viewFacing,Math.cos(.95),Math.cos(.18));
                const dazzle=hotspot*eyeContact/(1+(distance/850)**2)
                  *(1-THREE.MathUtils.smoothstep(distance,1100,GLARE_DISTANCE));
                if(dazzle>glare){
                  glare=dazzle;
                  this.imprintPosition.set(flare.x,flare.y);
                }
              }
            }
          }
        }
      }
      if(!s.active && s.light.shadow.needsUpdate){
        // Warm common depth materials from the actual receiving view during
        // startup, even before anyone equips a lamp.
        s.light.position.copy(this.eye);s.target.position.copy(this.eye).addScaledVector(this.view,FRIENDS_FLASHLIGHT_RANGE);
      }
      s.light.intensity=s.active && s.ready ? FRIENDS_FLASHLIGHT_INTENSITY : 0;
      if(!s.active)s.checkedAt=-Infinity;
    }
    if(refresh){
      refresh.shadowAt=now;
    }
    // Warm one unused tile per startup frame; only selected/active lamps are
    // refreshed afterwards. Sampling never touches an uninitialized tile.
    refresh??=this.slots.find(s=>!s.ready && s.light.shadow.needsUpdate);
    if(refresh){
      const slot=refresh;
      this.atlas.request(slot.light,this.slots.indexOf(slot),()=>{
        slot.ready=true;slot.light.intensity=slot.active?FRIENDS_FLASHLIGHT_INTENSITY:0;
      });
    }
    this.atlas.update(camera);
    const dt=Math.min(100,Math.max(0,deltaMs))/1000;
    this.exposure=THREE.MathUtils.damp(this.exposure,eyesAvailable?glare:0,glare>this.exposure?3:4,dt);
    // Immediate dazzle plus a stronger wash as the eyes become saturated.
    const target=glare*(.78+.22*this.exposure);
    this.presentation.glare=THREE.MathUtils.damp(this.presentation.glare,eyesAvailable?target:0,target>this.presentation.glare?16:8,dt);
    const imprint=this.presentation.afterimage;
    imprint.z*=Math.exp(-4*dt);
    const deposit=glare*Math.max(0,this.exposure-.12)*.55;
    if(deposit>imprint.z){
      // Retinal imprint stays in screen space when you look away, and a weak
      // second lamp cannot relocate an existing stronger imprint.
      imprint.set(this.imprintPosition.x,this.imprintPosition.y,deposit,0);
    }
    if(imprint.z<.003)imprint.z=0;
    if(!eyesAvailable){this.exposure=0;imprint.z=0;}
    if(!eyesAvailable || this.presentation.glare<.001)this.presentation.glare=0;
    return this.presentation;
  }

  dispose(){
    if(this.disposed)return;this.disposed=true;
    for(const s of this.slots){s.light.shadow.map=null;s.light.shadow.dispose();s.light.removeFromParent();s.target.removeFromParent();}
    this.atlas.dispose();
    this.presentation.glare=0;this.presentation.afterimage.z=0;this.exposure=0;for(const f of this.presentation.flares)f.set(0,0,0,0);
  }
}
