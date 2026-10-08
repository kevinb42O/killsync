import * as THREE from 'three';

export type FriendsArmHold = 'tool' | 'inward' | 'flashlight';

/** Pose the downloaded rig before its one-time static bake. Hand/socket and
 * shoulder routing are separate: rotating the palm must not swing the upper
 * arm out into the view. All coordinates here are in the fitted grip frame. */
export function poseFriendsArm(
  rig: THREE.Object3D, skin: THREE.SkinnedMesh, frame: THREE.Matrix4,
  side: 'left' | 'right', hold: FriendsArmHold,
) {
  const suffix=side==='right'?'r':'l';
  const bone=(name:string)=>rig.getObjectByName(name+suffix)!;
  const point=(name:string)=>bone(name).getWorldPosition(new THREE.Vector3()).applyMatrix4(frame);
  const original={shoulder:point('shoulder'),bicep:point('bicep'),elbow:point('forearm'),wrist:point('wrist'),socket:point('socket')};
  const joints={...original};
  const handTurn=new THREE.Quaternion();
  if(hold==='inward')handTurn.setFromAxisAngle(new THREE.Vector3(0,1,0),-Math.PI/2+.68);
  const hand=new THREE.Matrix4().makeTranslation(original.socket.x,original.socket.y,original.socket.z)
    .multiply(new THREE.Matrix4().makeRotationFromQuaternion(handTurn))
    .multiply(new THREE.Matrix4().makeTranslation(-original.socket.x,-original.socket.y,-original.socket.z));
  joints.wrist=original.wrist.clone().applyMatrix4(hand);
  if(hold==='flashlight'){
    joints.elbow=new THREE.Vector3(-.24,.33,.35);
    joints.bicep=new THREE.Vector3(-.50,.96,.50);
    joints.shoulder=new THREE.Vector3(-.65,1.25,.48);
  }
  // Keep longitudinal deformation on the existing bones, retaining the
  // original cross section and smoothly skinned wrist/elbow connections.
  function segment(from:THREE.Vector3,to:THREE.Vector3,nextFrom:THREE.Vector3,nextTo:THREE.Vector3,roll=0){
    const oldAxis=to.clone().sub(from),newAxis=nextTo.clone().sub(nextFrom),stretch=newAxis.length()/oldAxis.length();oldAxis.normalize();newAxis.normalize();
    const align=new THREE.Quaternion().setFromUnitVectors(oldAxis,newAxis);
    const r=new THREE.Matrix4().makeRotationFromQuaternion(align),s=new THREE.Matrix4();
    // I + (stretch - 1) aaᵀ stretches only along the bone's existing axis.
    const a=oldAxis,k=stretch-1;s.set(1+k*a.x*a.x,k*a.x*a.y,k*a.x*a.z,0,k*a.y*a.x,1+k*a.y*a.y,k*a.y*a.z,0,k*a.z*a.x,k*a.z*a.y,1+k*a.z*a.z,0,0,0,0,1);
    const transform=new THREE.Matrix4().makeTranslation(nextFrom.x,nextFrom.y,nextFrom.z);
    if(roll)transform.multiply(new THREE.Matrix4().makeRotationAxis(newAxis,roll));
    return transform.multiply(r).multiply(s).multiply(new THREE.Matrix4().makeTranslation(-from.x,-from.y,-from.z));
  }
  const axis=joints.wrist.clone().sub(joints.elbow).normalize();
  const align=new THREE.Quaternion().setFromUnitVectors(original.wrist.clone().sub(original.elbow).normalize(),axis);
  const residual=handTurn.clone().multiply(align.clone().invert()),projection=residual.x*axis.x+residual.y*axis.y+residual.z*axis.z;
  const roll=2*Math.atan2(projection,residual.w);
  const inverse=frame.clone().invert(),originalMatrices=new Map<THREE.Bone,THREE.Matrix4>();
  for(const b of skin.skeleton.bones)originalMatrices.set(b,b.matrixWorld.clone());
  for(const b of skin.skeleton.bones){
    if(!b.name.endsWith(suffix))continue;
    let transform:THREE.Matrix4|undefined;
    if(b.name.startsWith('finger_')||b.name===`wrist${suffix}`)transform=hand;
    else if(b.name.startsWith('forearm'))transform=segment(original.elbow,original.wrist,joints.elbow,joints.wrist,b.name.startsWith('forearmTwist1')?roll*.5:0);
    else if(hold==='flashlight'&&b.name===`bicep${suffix}`)transform=segment(original.bicep,original.elbow,joints.bicep,joints.elbow);
    else if(hold==='flashlight'&&b.name===`shoulder${suffix}`)transform=segment(original.shoulder,original.bicep,joints.shoulder,joints.bicep);
    if(transform)b.matrixWorld.copy(inverse).multiply(transform).multiply(frame).multiply(originalMatrices.get(b)!);
  }
  skin.skeleton.update();
  // Joint landmarks describe the actual bake. Hand facing is checked on the
  // rendered mesh; an assumed palm normal can pass while the grip is reversed.
  return {shoulder:joints.shoulder.toArray(),elbow:joints.elbow.toArray(),wrist:joints.wrist.toArray(),socket:original.socket.toArray()};
}
