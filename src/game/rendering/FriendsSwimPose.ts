import * as THREE from 'three';
import type { CoopPlayerSnapshot } from '../multiplayer/CoopSimulation';
import type { FriendsCharacterModel } from './FriendsCharacterModel';

export type FriendsSwimPose = { blend:number; effort:number; submerged:number; pitch:number; phase:number };
export function createFriendsSwimPose(id:string):FriendsSwimPose {
  let seed=0;for(const c of id)seed=(seed*31+c.charCodeAt(0))>>>0;
  return {blend:0,effort:0,submerged:0,pitch:0,phase:(seed%997)/997*Math.PI*2};
}
const pivot=new THREE.Vector3(),attachment=new THREE.Vector3();

/** Render-only aquatic locomotion. The CPM basis turns source -Z into forward
 * +Z; positive avatar pitch lays the character face down. Keep the chest at
 * the swimmer's eye-height anchor rather than rotating around their feet. */
export function applyFriendsSwimPose(model:FriendsCharacterModel,avatar:THREE.Group,player:CoopPlayerSnapshot,dt:number,state:FriendsSwimPose,falling=false) {
  const swimming=Boolean(player.motion?.swimming&&player.lifeState==='alive'&&!player.friendsSeat&&!falling&&!player.friendsDevFlight);
  if(falling||player.friendsSeat||player.lifeState!=='alive'||player.friendsDevFlight){state.blend=0;return;}
  const alpha=1-Math.exp(-dt*.009),motion=player.motion;
  const horizontal=Math.hypot(motion?.velocityX??0,motion?.velocityY??0),vertical=motion?.verticalVelocity??0;
  state.blend+=(Number(swimming)-state.blend)*alpha;
  const effort=swimming?THREE.MathUtils.smoothstep(Math.hypot(horizontal,vertical),12,140):0;
  state.effort+=(effort-state.effort)*alpha;
  state.submerged+=(Number(swimming&&motion?.swimSubmerged)-state.submerged)*alpha;
  // Vertical-only ascent/descent keeps a readable upright tread. Forward dives
  // follow the actual replicated trajectory, even without an aim-pitch field.
  const travelPitch=Math.atan2(vertical,Math.max(35,horizontal));
  const pitch=(.18+state.effort*1.13)-state.submerged*state.effort*THREE.MathUtils.clamp(travelPitch,-.95,.95);
  state.pitch+=(pitch-state.pitch)*alpha;
  state.phase+=dt*.001*(2.5+state.effort*3.2);
  if(state.blend<.0001){state.blend=0;return;}
  const b=state.blend,e=state.effort,phase=state.phase;
  // A wide, paired breaststroke: reach, outward catch, pull, recover. Idle
  // sculling is smaller and slower; flutter kicks alternate under propulsion.
  const pull=(1-Math.cos(phase))*.5,scull=Math.sin(phase),kick=Math.sin(phase*2.4);
  for(let side=0;side<2;side++){
    const arm=model.parts[side+2],sign=side===0?1:-1;
    pivot.fromArray(arm.userData.shoulderPivot);
    attachment.copy(pivot).applyQuaternion(arm.quaternion).add(arm.position);
    arm.rotation.x=THREE.MathUtils.lerp(arm.rotation.x,model.baseRotations[side+2].x-.35-e*(1.2-pull*1.25)+scull*.12*(1-e),b);
    arm.rotation.z=THREE.MathUtils.lerp(arm.rotation.z,model.baseRotations[side+2].z+sign*(.38+Math.sin(phase)*.16+e*pull*.65),b);
    arm.rotation.y=THREE.MathUtils.lerp(arm.rotation.y,model.baseRotations[side+2].y,b);
    // Retain the authored shoulder contact; rotation about the part origin
    // makes these long, thin arms visibly detach from the torso.
    arm.position.copy(attachment).sub(pivot.applyQuaternion(arm.quaternion));
    const leg=model.parts[side+4];
    leg.rotation.x=THREE.MathUtils.lerp(leg.rotation.x,model.baseRotations[side+4].x+sign*kick*(.10+e*.26),b);
    leg.rotation.z=THREE.MathUtils.lerp(leg.rotation.z,model.baseRotations[side+4].z-sign*(.08+(1-e)*pull*.12),b);
  }
  model.parts[0].rotation.x+=b*(-.20-e*.35); // Lift the face to breathe at the surface.
  const tilt=state.pitch*b;
  avatar.rotation.set(tilt,0,scull*e*b*.045);
  avatar.position.set(0,b*(27-27*Math.cos(state.pitch)-18*(1-e)+Math.sin(phase*2)*.65),-27*Math.sin(tilt));
}
