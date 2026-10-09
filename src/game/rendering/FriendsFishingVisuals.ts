import * as THREE from 'three';
import type { CoopPlayerSnapshot } from '../multiplayer/CoopSimulation';
import type { FishingSnapshot, CaughtFish } from '../multiplayer/FriendsFishing';
import { FISH_GROUND_RADIUS } from '../multiplayer/FriendsFishing';
import { friendsAudio } from '../FriendsAudio';
import { acquireEquipmentLighting, frameHeldEquipment, loadFriendsGrip } from './FriendsHeldEquipment';
import { createFishingFish, loadFishingFish, loadFishingRod } from './FriendsFishingAssets';
import { FriendsFishingLine } from './FriendsFishingLine';
import { friendsWaterAt } from '../world/FriendsWaterSurface';
import { groundFishMotion } from './FriendsFishGroundAnimation';

type Rod={root:THREE.Group;tip?:THREE.Object3D;mesh?:THREE.Mesh;arm?:THREE.Mesh;armRequested?:boolean;line:FriendsFishingLine;float:THREE.Group;ring:THREE.Mesh;phase:string;serial:number;local:boolean};
type Fish={root:THREE.Group;model?:ReturnType<typeof createFishingFish>;action?:THREE.AnimationAction;clip?:string;id:number;phase:string;animationAt:number};
function softShadowTexture(){const pixels=new Uint8Array(32*32*4);for(let y=0;y<32;y++)for(let x=0;x<32;x++){const r=Math.hypot((x-15.5)/15.5,(y-15.5)/15.5),v=Math.round(Math.max(0,1-r*r)**2*255),i=(y*32+x)*4;pixels[i]=pixels[i+1]=pixels[i+2]=v;pixels[i+3]=255;}const texture=new THREE.DataTexture(pixels,32,32);texture.magFilter=texture.minFilter=THREE.LinearFilter;texture.needsUpdate=true;return texture;}
/** All world catches share one skinned mesh/material. Only visible fish advance
 * their six-bone animation; transient line buffers are owned by active rods. */
export class FriendsFishingVisuals {
  readonly group=new THREE.Group();
  readonly held=new THREE.Group();
  private rods=new Map<string,Rod>();
  private fishes=new Map<number,Fish>();
  private pool:Fish[]=[];
  private grips:THREE.Group=new THREE.Group();
  private camera?:THREE.PerspectiveCamera;
  private lighting:ReturnType<typeof acquireEquipmentLighting>;
  private floatGeometry=new THREE.SphereGeometry(2.5,10,6);
  private stemGeometry=new THREE.CylinderGeometry(.65,.65,5,6);
  private ringGeometry=new THREE.RingGeometry(.8,1,32);
  private red=new THREE.MeshStandardMaterial({color:'#e8644d',roughness:.55});
  private cream=new THREE.MeshStandardMaterial({color:'#fff2cc',roughness:.6});
  private ringMaterial=new THREE.MeshBasicMaterial({color:'#c7e8df',transparent:true,opacity:.55,side:THREE.DoubleSide,depthWrite:false});
  private splashes=Array.from({length:8},()=>({point:new THREE.Vector3(),atMs:-Infinity,ring:new THREE.Mesh(this.ringGeometry,this.ringMaterial)}));
  private splashIndex=0;
  private droplets=new THREE.InstancedMesh(this.floatGeometry,this.cream,48);
  private dropMatrix=new THREE.Matrix4();
  private dropPosition=new THREE.Vector3();
  private dropScale=new THREE.Vector3();
  private dropRotation=new THREE.Quaternion();
  private shadowTexture=softShadowTexture();
  private shadows=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({color:'#15291e',alphaMap:this.shadowTexture,transparent:true,opacity:.25,depthWrite:false,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}),40);
  private start=new THREE.Vector3();
  private end=new THREE.Vector3();
  private cameraPoint=new THREE.Vector3();
  private disposed=false;
  private rigParent:THREE.Object3D;
  constructor(scene:THREE.Scene,viewmodel:THREE.Scene){
    this.group.name='friends-fishing';scene.add(this.group);this.held.name='fish-in-your-hands';this.held.visible=false;
    this.rigParent=viewmodel.getObjectByProperty('type','PerspectiveCamera')||viewmodel;if(this.rigParent instanceof THREE.PerspectiveCamera)this.camera=this.rigParent;this.rigParent.add(this.held);
    this.held.add(this.grips);this.lighting=acquireEquipmentLighting(viewmodel);
    this.droplets.frustumCulled=false;this.droplets.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.group.add(this.droplets);
    this.shadows.frustumCulled=false;this.shadows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.group.add(this.shadows);
    for(const s of this.splashes){s.ring.rotation.x=-Math.PI/2;s.ring.visible=false;this.group.add(s.ring);}
    for(const side of ['right','left'] as const)void loadFriendsGrip(side).then(arm=>{
      if(this.disposed)return;const copy=arm.clone();copy.position.set(side==='right'?.24:-.24,-.08,.03);copy.rotation.set(.12,side==='right'?.7:-.7,side==='right'?.25:-.25);this.grips.add(copy);
    }).catch(()=>{});
    void loadFishingFish().catch(error=>console.warn('Fishing fish could not load',error));
  }
  private splash(x:number,y:number,z:number,now:number){const s=this.splashes[this.splashIndex++%this.splashes.length];s.point.set(x,y,z);s.atMs=now;}
  private updateSplashes(now:number){
    let count=0;
    for(const s of this.splashes){const t=(now-s.atMs)/700;s.ring.visible=t>=0&&t<1;if(!s.ring.visible)continue;s.ring.position.copy(s.point);s.ring.scale.setScalar(3+t*24);
      for(let i=0;i<6;i++){const angle=i*Math.PI/3;this.dropPosition.copy(s.point);this.dropPosition.x+=Math.cos(angle)*t*15;this.dropPosition.z+=Math.sin(angle)*t*15;this.dropPosition.y+=Math.sin(t*Math.PI)*9;this.dropScale.setScalar(.3*(1-t));this.dropMatrix.compose(this.dropPosition,this.dropRotation,this.dropScale);this.droplets.setMatrixAt(count++,this.dropMatrix);}
    }this.droplets.count=count;this.droplets.visible=count>0;if(count)this.droplets.instanceMatrix.needsUpdate=true;
  }
  private rod(id:string,local:boolean){
    let r=this.rods.get(id);if(r&&r.local!==local){r.root.removeFromParent();r.local=local;(local?this.rigParent:this.group).add(r.root);}
    if(r){this.rodGrip(id,r,local);return r;}
    const root=new THREE.Group(),line=new FriendsFishingLine(),float=new THREE.Group(),ring=new THREE.Mesh(this.ringGeometry,this.ringMaterial);root.name=`fishing-rod-${id}`;
    const ball=new THREE.Mesh(this.floatGeometry,this.cream),cap=new THREE.Mesh(this.floatGeometry,this.red),stem=new THREE.Mesh(this.stemGeometry,this.red);cap.scale.y=.55;cap.position.y=1.6;stem.position.y=4;float.add(ball,cap,stem);ring.rotation.x=-Math.PI/2;
    r={root,line,float,ring,phase:'',serial:0,local};this.rods.set(id,r);(local?this.rigParent:this.group).add(root);this.group.add(line,float,ring);
    const entry=r;
    void loadFishingRod().then(source=>{if(this.disposed||this.rods.get(id)!==entry)return;const model=source.clone(true);root.add(model);entry.tip=model.getObjectByName('fishing-rod-tip');entry.mesh=model.getObjectByName('flexible-fishing-rod') as THREE.Mesh;}).catch(error=>console.warn('Fishing rod could not load',error));
    this.rodGrip(id,r,local);
    return r;
  }
  private rodGrip(id:string,entry:Rod,local:boolean){
    if(entry.arm)entry.arm.visible=local;
    if(local&&!entry.armRequested){entry.armRequested=true;void loadFriendsGrip('right').then(arm=>{if(this.disposed||this.rods.get(id)!==entry)return;entry.arm=arm.clone();entry.arm.visible=entry.local;entry.root.add(entry.arm);}).catch(()=>{});}
  }
  private fish(id:number){
    let f=this.fishes.get(id);if(f)return f;
    f=this.pool.pop()??{root:new THREE.Group(),id,phase:'',animationAt:0};f.id=id;f.phase='';f.animationAt=0;this.fishes.set(id,f);this.group.add(f.root);
    if(!f.model){const entry=f;void loadFishingFish().then(source=>{if(this.disposed)return;entry.model=createFishingFish(source);entry.root.add(entry.model.root);}).catch(()=>{});}
    return f;
  }
  private animate(f:Fish,state:CaughtFish|undefined,dt:number,now:number){
    if(!f.model)return;
    const name=state?.phase==='dry'?'Out_Of_Water':state?.phase==='held'?'Swimming_Normal':'Swimming_Fast';
    if(name!==f.clip){
      const clip=f.model.clips.find(c=>c.name.endsWith('|'+name));if(clip){
        // Stop airborne root motion immediately when the fish lands.
        if(state?.phase==='dry')f.action?.stop();else f.action?.fadeOut(.12);
        f.action=f.model.mixer.clipAction(clip);f.action.reset().setEffectiveWeight(state?.phase==='dry'?.45:1).fadeIn(.2).play();
        f.action.setEffectiveTimeScale(state?.phase==='held'?.32:1);
      }f.clip=name;
    }
    if(state?.phase==='dry')f.action?.setEffectiveTimeScale(groundFishMotion(now,state.id).speed);
    const distance=f.root.parent===this.held?0:f.root.position.distanceTo(this.cameraPoint),interval=distance>900?125:distance>450?66:0;
    if(now-f.animationAt>=interval){f.model.mixer.update(Math.min(250,f.animationAt?now-f.animationAt:dt)/1000);f.animationAt=now;}
  }
  update(state:FishingSnapshot|undefined,players:readonly CoopPlayerSnapshot[],localId:string,tool:number,camera:THREE.Camera,now:number,dt:number,firstPerson:boolean,project:(tip:THREE.Object3D)=>{x:number;y:number;z:number},handPoint:(id:string,out:THREE.Vector3,bothHands?:boolean)=>boolean){
    if(this.disposed)return;camera.getWorldPosition(this.cameraPoint);this.held.visible=false;this.lighting.setVisible(false);
    const active=new Set<string>(),activeFish=new Set<number>();let shadowCount=0;
    for(const id of state?.equipped??[]){
      const player=players.find(p=>p.id===id);if(!player)continue;const local=id===localId&&firstPerson;if(local&&tool!==7)continue;
      if(!local&&Math.hypot(player.x-this.cameraPoint.x,player.y-this.cameraPoint.z)>1800)continue;
      active.add(id);const r=this.rod(id,local),cast=state?.casts.find(c=>c.playerId===id),t=cast?(now-cast.atMs)/1000:0;
      if(local){frameHeldEquipment(r.root,this.camera);r.root.rotation.set(-.48+(cast?.phase==='casting'?.65*Math.sin(Math.min(1,t/.65)*Math.PI):0)-(cast?.phase==='bite'?.045*Math.sin(now*.028):0),0,-.12);this.lighting.setVisible(true);}
      else{if(!handPoint(id,this.start))this.start.set(player.x,player.z+25,player.y);r.root.position.copy(this.start);r.root.scale.setScalar(32);r.root.rotation.set(-.45,Math.PI/2-player.angle,-.12);}
      r.root.visible=true;r.line.visible=r.float.visible=r.ring.visible=Boolean(cast);
      const flex=cast?.phase==='bite'?.65+Math.sin(now*.018)*.15:cast?.phase==='reeling'?.5:cast?.phase==='casting'?.35*Math.sin(Math.min(1,t/.65)*Math.PI):.04;
      if(r.mesh?.morphTargetInfluences)r.mesh.morphTargetInfluences[0]=flex;if(r.tip)r.tip.position.z=-.2*flex;
      if(!cast)continue;
      const bite=cast.phase==='bite',waiting=cast.phase==='waiting';
      this.end.set(cast.x,cast.z,cast.y);
      if(waiting){this.end.y+=Math.sin(now*.004+cast.id)*.9;const before=cast.biteAt-now;if(before<1300)this.end.y-=Math.max(0,Math.sin(now*.019))*2.4;}
      if(bite)this.end.y-=5+Math.sin(now*.013)*.7;
      r.float.position.copy(this.end);r.float.rotation.z=bite?.3:Math.sin(now*.002)*.07;r.float.visible=cast.phase!=='reeling'||Boolean(cast.empty);
      r.ring.position.set(cast.target.x,cast.target.z-.6,cast.target.y);const ripple=((now-cast.atMs)%1100)/1100;r.ring.scale.setScalar(4+ripple*(bite?17:10));r.ring.visible=waiting||bite;
      if(r.tip){r.root.updateWorldMatrix(true,true);if(local){const p=project(r.tip);this.start.set(p.x,p.y,p.z);}else r.tip.getWorldPosition(this.start);}
      else this.start.copy(r.root.position);
      r.line.update(this.start,this.end,cast.phase==='casting'?24:cast.phase==='reeling'?2:bite?3:12,dt,this.cameraPoint);
      if(r.serial!==cast.id||r.phase!==cast.phase){
        if(waiting||bite)this.splash(cast.target.x,cast.target.z,cast.target.y,now);
        if(local){if(cast.phase==='casting')friendsAudio.play('swing',.12,100);else if(waiting)friendsAudio.play('waterStep',.17,100);else if(bite){friendsAudio.play('waterStep',.24,100,1.25);friendsAudio.play('chime',.07,100,1.8);}else friendsAudio.play('reelRatchet',.13,100,1.2,1.2);}
        r.serial=cast.id;r.phase=cast.phase;
      }
      if(cast.phase==='reeling'&&!cast.empty){
        activeFish.add(cast.id);const f=this.fish(cast.id);if(f.root.parent!==this.group)this.group.add(f.root);f.root.visible=true;f.root.position.copy(this.end);f.root.rotation.set(0,Math.PI/2-player.angle,.25);f.root.scale.setScalar(cast.size);this.animate(f,undefined,dt,now);
      }
    }
    for(const s of state?.fish??[]){
      const local=s.ownerId===localId&&firstPerson,owner=s.ownerId?players.find(p=>p.id===s.ownerId):undefined;
      if(!local&&Math.hypot(s.x-this.cameraPoint.x,s.y-this.cameraPoint.z)>1800)continue;
      activeFish.add(s.id);const f=this.fish(s.id);f.root.visible=true;
      if(local&&s.phase==='held'){
        if(f.root.parent!==this.held)this.held.add(f.root);this.held.visible=true;this.lighting.setVisible(true);
        const tangent=Math.tan(THREE.MathUtils.degToRad((this.camera?.fov??98)/2)),scale=tangent/Math.tan(THREE.MathUtils.degToRad(49)),narrow=Math.min(1,(this.camera?.aspect??16/9)/1.25);
        this.held.position.set(0,-.46*scale*narrow,-1.08);this.held.scale.set(scale*narrow,scale*narrow,1);f.root.position.set(0,.11+Math.sin(now*.003)*.006,-.02);f.root.scale.setScalar(.022*s.size);f.root.rotation.set(.04,Math.PI/2,.025*Math.sin(now*.004));
      }else{
        if(f.root.parent!==this.group)this.group.add(f.root);
        if(owner){if(!handPoint(owner.id,this.end,true))this.end.set(owner.x,owner.z+25,owner.y);}
        else this.end.set(s.x,s.z,s.y);
        if(s.phase==='dry'||f.phase!==s.phase||f.root.position.distanceTo(this.end)>100)f.root.position.copy(this.end);else f.root.position.lerp(this.end,1-Math.exp(-dt*.018));
        let fade=s.phase==='fading'?Math.max(.001,1-(now-s.atMs)/900):1;
        f.root.scale.setScalar(s.size*fade);f.root.rotation.set(0,Math.PI/2-s.angle,s.phase==='dry'?Math.PI/2+groundFishMotion(now,s.id).roll:s.phase==='air'?Math.sin(now*.012)*.35:0);
        if(s.phase==='dry'&&shadowCount<40){this.dropPosition.set(s.x,s.z-FISH_GROUND_RADIUS*s.size+.2,s.y);this.dropScale.set(28*s.size,1,22*s.size);this.dropMatrix.compose(this.dropPosition,this.dropRotation,this.dropScale);this.shadows.setMatrixAt(shadowCount++,this.dropMatrix);}
      }
      if(f.phase!==s.phase&&local&&s.phase==='held')friendsAudio.play('waterStep',.15,100);
      if(f.phase!==s.phase&&s.phase==='swimming'&&f.root.position.distanceTo(this.cameraPoint)<500)friendsAudio.play('waterStep',.2,100,1.15);
      if(f.phase!==s.phase&&s.phase==='swimming')this.splash(s.x,(friendsWaterAt(s.x,s.y)?.level??s.z)+1,s.y,now);
      this.animate(f,s,dt,now);f.phase=s.phase;
    }
    for(const [id,r]of this.rods)if(!active.has(id)){r.root.removeFromParent();r.float.removeFromParent();r.ring.removeFromParent();r.line.removeFromParent();r.line.dispose();this.rods.delete(id);}
    for(const [id,f]of this.fishes)if(!activeFish.has(id)){f.root.removeFromParent();f.root.visible=false;this.fishes.delete(id);this.pool.push(f);}
    this.updateSplashes(now);
    this.shadows.count=shadowCount;this.shadows.visible=shadowCount>0;if(shadowCount)this.shadows.instanceMatrix.needsUpdate=true;
  }
  dispose(){
    this.disposed=true;for(const r of this.rods.values()){r.root.removeFromParent();r.line.dispose();}this.rods.clear();
    for(const f of [...this.fishes.values(),...this.pool]){f.model?.mixer.stopAllAction();if(f.model)f.model.root.traverse(o=>{if(o instanceof THREE.SkinnedMesh)o.skeleton.dispose();});f.root.removeFromParent();}this.fishes.clear();this.pool=[];
    this.floatGeometry.dispose();this.stemGeometry.dispose();this.ringGeometry.dispose();this.red.dispose();this.cream.dispose();this.ringMaterial.dispose();this.lighting.dispose();this.held.removeFromParent();this.group.removeFromParent();
    this.shadows.geometry.dispose();(this.shadows.material as THREE.Material).dispose();this.shadowTexture.dispose();this.shadows.dispose();this.droplets.dispose();
  }
}
