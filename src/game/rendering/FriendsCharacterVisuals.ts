import type { SeedHand } from '../multiplayer/FriendsBirds';
import { isRowboatSeat } from '../world/FriendsFishingDock';
import type { StoneHand } from '../multiplayer/FriendsStones';
import { finishFriendsCharacter } from './FriendsCharacterFinish';
import { applyFriendsArmPose } from './FriendsGesturePose';
import * as THREE from 'three';
import { createNameplate, disposeNameplate, type PlayerVisualRig } from './coopOperatorVisuals';
import { CoopFirearmVisualRig } from './coopFirearmVisuals';
import { getCoopSkin, type CoopSkinId } from '../multiplayer/CoopSkins';
import type { CoopPlayerSnapshot } from '../multiplayer/CoopSimulation';
import type { ToolAction } from '../multiplayer/FriendsToolActions';
import { cloneFriendsCharacterModel, loadFriendsCharacterModel, type FriendsCharacterModel } from './FriendsCharacterModel';

type Actor = { model:FriendsCharacterModel; previousTime:number; stride:number; movement:number; arms:number[] };
const actors=new WeakMap<PlayerVisualRig,Actor>();

/** Friends owns only its authored character and caption, with no survival chassis. */
export function createFriendsCharacterRig(color: string, label: string, skinId?: CoopSkinId): PlayerVisualRig {
  const root = new THREE.Group(), avatar = new THREE.Group();
  root.name = 'friends-player-rig'; root.add(avatar);
  const nameplate = createNameplate(label, color, 'friends'); root.add(nameplate);
  const rig: PlayerVisualRig = {root, avatar, nameplate, nameplateScale: nameplate.scale.clone(), skin: getCoopSkin(skinId)};
  mountFriendsCharacter(rig, color);
  return rig;
}

export function disposeFriendsCharacterRig(rig: PlayerVisualRig) {
  rig.root.userData.disposed = true;
  rig.root.traverse(node => { if (node instanceof THREE.SkinnedMesh) node.skeleton.dispose(); });
  rig.firearm?.dispose(); disposeNameplate(rig.nameplate); actors.delete(rig);
  rig.root.removeFromParent(); rig.root.clear();
}

/** Shared placement only; all limb animation belongs to the Friends model. */
export function placeFriendsCharacter(rig: PlayerVisualRig, player: CoopPlayerSnapshot, fallProgress?: number) {
  rig.root.visible = player.lifeState !== 'eliminated' || fallProgress !== undefined;
  rig.root.position.set(player.x, player.z, player.y);
  rig.root.rotation.y = Math.PI / 2 - player.angle + (fallProgress === undefined ? 0 : fallProgress * Math.PI * 2.6);
  rig.avatar.rotation.set(fallProgress === undefined ? 0 : fallProgress * Math.PI * 4.2,
    fallProgress === undefined ? 0 : Math.sin(fallProgress * Math.PI * 3) * .55,
    fallProgress === undefined ? 0 : fallProgress * Math.PI * 2.8);
  rig.nameplate.visible = fallProgress === undefined;
  rig.nameplate.scale.copy(rig.nameplateScale).multiplyScalar(player.friendsSeat ? .45 : 1);
}

export function mountFriendsCharacter(rig:PlayerVisualRig, color:string) {
  rig.root.userData.friendsCharacter=true;
  void loadFriendsCharacterModel().then(source=>{
    if(rig.root.userData.disposed)return;
    const model=cloneFriendsCharacterModel(source);finishFriendsCharacter(model,color);
    for(const part of [model.parts[2],model.parts[3]]){const socket=new THREE.Object3D();socket.name='big-walk-hand-socket';const wrist=part.getObjectByName('arm-wrist');if(wrist)wrist.add(socket);else{socket.position.fromArray(part.userData.palm);part.add(socket);};}
    actors.set(rig,{model,previousTime:0,stride:0,movement:0,arms:[0,0,0,0]});rig.avatar.add(model.root);
  }).catch(error=>{console.warn('Friends character load failed.',error);});
}

/** Apply after the shared co-op presentation. Gameplay/collision positions stay
 * authoritative; this only changes the Friends character's articulated pose. */
export function updateFriendsCharacter(rig:PlayerVisualRig, player:CoopPlayerSnapshot, time:number, action?:ToolAction, falling=false,rowingPhase?:number,fishingHold?:'rod'|'fish'|'stone'|'seeds'|'marshmallow'|'dynamite',stoneHand?:StoneHand,seedHand?:SeedHand) {
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
  const flashlight=player.lifeState==='alive'&&!falling ? player.friendsFlashlight : undefined;
  const aimYaw=hands?.yaw??flashlight?.yaw??player.angle;
  const delta=Math.atan2(Math.sin(aimYaw-player.angle),Math.cos(aimYaw-player.angle));
  // A marshmallow occupies the right hand; the free left hand can still greet.
  const holdMask=fishingHold==='marshmallow'?8|((hands?.mask??0)&1):fishingHold==='fish'?12:fishingHold||player.friendsWeaponEquipped?8:hands?.mask??0;
  applyFriendsArmPose(model,holdMask|(flashlight?4:0),hands?.pitch??flashlight?.pitch??0,dt,actor.arms,seated,delta);
  if(hands){
    model.parts[0].rotation.y-=delta*.5;
  }
  model.parts[0].rotation.x-=THREE.MathUtils.clamp(hands?.pitch??player.friendsFlashlight?.pitch??0,-1.1,1.1)*.55;
  if(action&&!seated&&!downed&&time>=action.start&&time<=action.end){
    const windup=THREE.MathUtils.clamp((time-action.start)/Math.max(1,action.contact-action.start),0,1),recovery=THREE.MathUtils.clamp((time-action.contact)/Math.max(1,action.end-action.contact),0,1);
    model.parts[3].rotation.x=time<action.contact?-.45-.8*Math.sin(windup*Math.PI/2):.7*(1-recovery)**2;
    model.parts[3].rotation.z=.12;
  }
  if(stoneHand){
    const arm=model.parts[3],pivot=new THREE.Vector3().fromArray(arm.userData.shoulderPivot),attachment=pivot.clone().applyQuaternion(arm.quaternion).add(arm.position);
    const charge=stoneHand.chargeAt===undefined?0:Math.min(1,(time-stoneHand.chargeAt)/900),release=stoneHand.throwAt===undefined?1:Math.min(1,(time-stoneHand.throwAt)/350);
    arm.rotation.x=-.85-charge*.8+Math.sin(release*Math.PI)*(1-release)*1.8;
    arm.rotation.z=.12;arm.position.copy(attachment).sub(pivot.applyQuaternion(arm.quaternion));
  }
  if(seedHand){
    const arm=model.parts[3],pivot=new THREE.Vector3().fromArray(arm.userData.shoulderPivot),attachment=pivot.clone().applyQuaternion(arm.quaternion).add(arm.position);
    const toss=seedHand.scatterAt===undefined?1:Math.min(1,(time-seedHand.scatterAt)/500);
    arm.rotation.x=(seedHand.holding?-1.15:-.6)-Math.sin(toss*Math.PI)*(1-toss)*.9;
    arm.rotation.z=.10;arm.position.copy(attachment).sub(pivot.applyQuaternion(arm.quaternion));
  }
  if(rowingPhase!==undefined){
    const drive=rowingPhase<1?Math.sin(rowingPhase*Math.PI*2):0;
    model.parts[1].rotation.x+=drive*.12;
    for(const arm of [model.parts[2],model.parts[3]]){
      const pivot=new THREE.Vector3().fromArray(arm.userData.shoulderPivot),attachment=pivot.clone().applyQuaternion(arm.quaternion).add(arm.position);
      arm.rotation.x=-.8+drive*.35;arm.position.copy(attachment).sub(pivot.applyQuaternion(arm.quaternion));
    }
  }
  if(player.motion?.swimming&&!seated){
    const stroke=Math.sin(time*.005),kick=Math.sin(time*.009);
    model.parts[2].rotation.x=-1.05+stroke*.42;model.parts[3].rotation.x=-1.05-stroke*.42;
    model.parts[4].rotation.x=kick*.22;model.parts[5].rotation.x=-kick*.22;
  }
  rig.root.scale.set(1,1,1);
  // The old chassis is centred at y=29. Our model already stands on its feet.
  rig.avatar.position.set(0,downed?12:0,0);
  if(!falling)rig.avatar.rotation.set(player.motion?.swimSubmerged?-.55:0,0,downed?Math.PI/2:0);
  for(const child of rig.avatar.children)child.visible=child===model.root;
  if ('seatedLegs' in rig) (rig.seatedLegs as THREE.Group).visible=false;
  if(fishingHold||hands||isRowboatSeat(player.friendsSeat)||player.motion?.swimming)rig.firearm && (rig.firearm.group.visible=false);
  rig.nameplate.position.y=downed?32:seated||player.crouching?47:62;
  if (player.friendsWeaponEquipped && player.lifeState === 'alive' && !falling && !seated && !player.motion?.swimming) {
    if (!rig.firearm) { rig.firearm = new CoopFirearmVisualRig(false); rig.root.add(rig.firearm.group); }
    const weapon = player.weaponStates[player.selectedSlot], hand = new THREE.Vector3();
    rig.firearm.group.visible = Boolean(weapon && friendsCharacterHandPoint(rig, hand));
    if (weapon) {
      rig.firearm.update(weapon, time, dt, player.isAiming);
      rig.firearm.group.position.copy(hand);
      rig.firearm.group.rotation.set(-.2, 0, 0);
    }
  } else if (rig.firearm) rig.firearm.group.visible = false;
  rig.avatar.updateWorldMatrix(true,true);
}

const otherHandPoint=new THREE.Vector3();
export function friendsCharacterHandPoint(rig:PlayerVisualRig, out:THREE.Vector3,bothHands=false,side:'left'|'right'='right') {
  const socket=actors.get(rig)?.model.parts[side==='left'?2:3].getObjectByName('big-walk-hand-socket');
  if(!socket)return false;
  socket.getWorldPosition(out);
  const other=bothHands?actors.get(rig)?.model.parts[2].getObjectByName('big-walk-hand-socket'):undefined;
  if(other){other.getWorldPosition(otherHandPoint);out.lerp(otherHandPoint,.5);}
  rig.root.worldToLocal(out);return true;
}
