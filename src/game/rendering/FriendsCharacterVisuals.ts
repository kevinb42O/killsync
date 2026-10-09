import { finishFriendsCharacter } from './FriendsCharacterFinish';
import { applyFriendsArmPose } from './FriendsGesturePose';
import * as THREE from 'three';
import type { CoopOperatorRig } from './coopOperatorVisuals';
import type { CoopPlayerSnapshot } from '../multiplayer/CoopSimulation';
import type { ToolAction } from '../multiplayer/FriendsToolActions';
import { cloneFriendsCharacterModel, loadFriendsCharacterModel, type FriendsCharacterModel } from './FriendsCharacterModel';

type Actor = { model:FriendsCharacterModel; previousTime:number; stride:number; movement:number; arms:number[] };
const actors=new WeakMap<CoopOperatorRig,Actor>();

export function mountFriendsCharacter(rig:CoopOperatorRig, color:string) {
  rig.root.userData.friendsCharacter=true;
  void loadFriendsCharacterModel().then(source=>{
    if(rig.root.userData.disposed)return;
    const model=cloneFriendsCharacterModel(source);finishFriendsCharacter(model,color);
    for(const part of [model.parts[2],model.parts[3]]){const socket=new THREE.Object3D();socket.name='big-walk-hand-socket';const wrist=part.getObjectByName('arm-wrist');if(wrist)wrist.add(socket);else{socket.position.fromArray(part.userData.palm);part.add(socket);};}
    actors.set(rig,{model,previousTime:0,stride:0,movement:0,arms:[0,0,0,0]});rig.avatar.add(model.root);
  }).catch(error=>{console.warn('Friends character load failed; retaining the existing avatar.',error);});
}

/** Apply after the shared co-op presentation. Gameplay/collision positions stay
 * authoritative; this only changes the Friends character's articulated pose. */
export function updateFriendsCharacter(rig:CoopOperatorRig, player:CoopPlayerSnapshot, time:number, action?:ToolAction, falling=false) {
  const actor=actors.get(rig);if(!actor)return;
  const {model}=actor,dt=Math.max(0,Math.min(100,time-actor.previousTime));actor.previousTime=time;
  const speed=Math.hypot((player.motion?.velocityX??0)-(player.platformVelocityX??0),(player.motion?.velocityY??0)-(player.platformVelocityY??0));
  const seated=Boolean(player.friendsSeat),downed=player.lifeState==='downed';
  const movement=seated||downed||falling||player.friendsDevFlight?0:Math.min(1,speed/120);
  actor.movement+=(movement-actor.movement)*(1-Math.exp(-dt*.014));actor.stride+=dt*.001*Math.min(12,speed*.07);
  for(let i=0;i<6;i++){model.parts[i].position.copy(model.basePositions[i]);model.parts[i].rotation.copy(model.baseRotations[i]);model.parts[i].scale.setScalar(1);}
  if(seated||player.crouching||player.sliding){
    const pose=model.data.animations.find(a=>a.name==='sitting');
    if(pose)for(const [id,track]of Object.entries(pose.tracks)){
      const index=Number(id);if(index>5)continue;const part=model.parts[index];
      if(track.position)part.position.fromArray(track.position[0]);
      if(track.rotation)part.rotation.set(...track.rotation[0],'ZYX');
    }
  }else{
    const breath=Math.sin(time*Math.PI*2/3000)*.18,step=Math.sin(actor.stride)*actor.movement*(player.sprinting?.72:.48);
    model.parts[0].position.y+=breath;model.parts[1].position.y+=breath;
    model.parts[2].rotation.x+=step*.65;model.parts[3].rotation.x-=step*.65;
    model.parts[4].rotation.x-=step;model.parts[5].rotation.x+=step;
  }
  const hands=player.lifeState==='alive'&&!falling ? player.friendsHands : undefined;
  const delta=hands?Math.atan2(Math.sin(hands.yaw-player.angle),Math.cos(hands.yaw-player.angle)):0;
  applyFriendsArmPose(model,hands?.mask??0,hands?.pitch??0,dt,actor.arms,seated,delta);
  if(hands){
    model.parts[0].rotation.y-=delta*.5;
  }
  model.parts[0].rotation.x-=THREE.MathUtils.clamp(hands?.pitch??player.friendsFlashlight?.pitch??0,-1.1,1.1)*.55;
  if(action&&!seated&&!downed&&time>=action.start&&time<=action.end){
    const windup=THREE.MathUtils.clamp((time-action.start)/Math.max(1,action.contact-action.start),0,1),recovery=THREE.MathUtils.clamp((time-action.contact)/Math.max(1,action.end-action.contact),0,1);
    model.parts[3].rotation.x=time<action.contact?-.45-.8*Math.sin(windup*Math.PI/2):.7*(1-recovery)**2;
    model.parts[3].rotation.z=.12;
  }
  rig.root.scale.set(1,1,1);
  // The old chassis is centred at y=29. Our model already stands on its feet.
  rig.avatar.position.set(0,downed?12:0,0);
  if(!falling)rig.avatar.rotation.set(0,0,downed?Math.PI/2:0);
  for(const child of rig.avatar.children)child.visible=child===model.root;
  rig.seatedLegs.visible=false;
  if(hands)rig.firearm.group.visible=false;
  rig.nameplate.position.y=downed?32:seated||player.crouching?47:62;
  rig.avatar.updateWorldMatrix(true,true);
}

export function friendsCharacterHandPoint(rig:CoopOperatorRig, out:THREE.Vector3) {
  const socket=actors.get(rig)?.model.parts[3].getObjectByName('big-walk-hand-socket');
  if(!socket)return false;
  socket.getWorldPosition(out);rig.root.worldToLocal(out);return true;
}
