import * as THREE from 'three';

/** Hold the full silhouette, including the tail, across the palms. The artist's
 * swim clip can curl the tail back onto the body; retain only a small wriggle. */
export function heldFishClip(clip:THREE.AnimationClip,root:THREE.Object3D) {
  const rest=new THREE.Quaternion(),sample=new THREE.Quaternion();
  const tracks=clip.tracks.map(track=>{
    const result=track.clone();
    if(!track.name.endsWith('.quaternion'))return result;
    const bone=root.getObjectByName(track.name.slice(0,-11));
    if(!bone)return result;
    rest.copy(bone.quaternion);
    for(let i=0;i<result.values.length;i+=4){sample.fromArray(result.values,i);sample.copy(rest).slerp(new THREE.Quaternion().fromArray(result.values,i),.055);sample.toArray(result.values,i);}
    return result;
  });
  return new THREE.AnimationClip('Fish_Armature|Held',clip.duration,tracks,clip.blendMode);
}

export function heldFishFraming(size:number,fov=98,aspect=16/9) {
  const tangent=Math.tan(THREE.MathUtils.degToRad(fov/2)),scale=tangent/Math.tan(THREE.MathUtils.degToRad(49)),narrow=Math.min(1,aspect/1.25);
  // Move genuinely larger fish away from the eye rather than clipping or
  // shrinking their identity. The normalized silhouette is 34 units long.
  const depth=1.08+Math.max(0,size-1)*.48;
  const fishScale=.022*size;
  return {depth,scale,narrow,fishScale,spread:Math.max(.07,Math.min(.92,34*fishScale*.30)),lift:.11+Math.max(0,size-1)*.08};
}
