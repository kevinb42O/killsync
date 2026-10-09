import * as THREE from 'three';
import type { FriendsCharacterModel } from './FriendsCharacterModel';

/** Shared local/remote solver. Four held values blend independently, so pressing
 * or releasing either mouse button never pops the other arm into a new pose. */
export function applyFriendsArmPose(model:FriendsCharacterModel,mask:number,pitch:number,dt:number,blend:number[],_seated=false,yaw=0) {
  const alpha=1-Math.exp(-Math.max(0,dt)*.024);
  for(let i=0;i<4;i++)blend[i]+=(Number(Boolean(mask&(1<<i)))-blend[i])*alpha;
  const raisedPose=model.data.animations.find(clip=>clip.name==='raised arms');
  for(let side=0;side<2;side++){
    const part=model.parts[side+2],raised=blend[side],point=blend[side+2],out=raised*point;
    const up=raised*(1-point),ahead=point*(1-raised),active=Math.max(raised,point);
    const pivot=new THREE.Vector3().fromArray(part.userData.shoulderPivot);
    const attachment=pivot.clone().applyQuaternion(part.quaternion).add(part.position);
    // Source forward is -Z and source down is +Y before the CPM basis flip.
    const authoredRaise=raisedPose?.tracks[String(side+2)]?.rotation?.[0];
    const x=up*(authoredRaise?.[0]??Math.PI)-ahead*(Math.PI/2+THREE.MathUtils.clamp(pitch,-1.25,1.25));
    // A slight OUTWARD V clears the wide head and the full 3×3×3 palms.
    // Aligning the hand vertically over the shoulder puts it inside the head.
    const raisedRoll=authoredRaise?.[2]??(side===0?Math.PI/6:-Math.PI/6);
    const z=out*(side===0?-Math.PI/2:Math.PI/2)+up*raisedRoll;
    part.rotation.x=THREE.MathUtils.lerp(part.rotation.x,model.baseRotations[side+2].x+x,active);
    part.rotation.z=THREE.MathUtils.lerp(part.rotation.z,model.baseRotations[side+2].z+z,active);
    part.rotation.y+=up*(authoredRaise?.[1]??0)-yaw;
    part.position.copy(attachment).sub(pivot.applyQuaternion(part.quaternion));
    // These are deliberately rigid, stepped cuboids in the source design.
    // Extra elbow/wrist bends split their edge contacts and detach the palm.
    const elbow=part.getObjectByName('arm-elbow'),wrist=part.getObjectByName('arm-wrist');
    if(elbow)elbow.rotation.x=0;
    if(wrist)wrist.rotation.x=0;
  }
}
