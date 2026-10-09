import * as THREE from 'three';

/** The artist's land clip launches and spins the entire fish via Main1.
 * Keep that bone at rest so only the body and tail can wriggle on the ground. */
export function groundedFishClip(clip:THREE.AnimationClip){
  return new THREE.AnimationClip(clip.name,clip.duration,clip.tracks
    .filter(track=>track.name!=='Main1.position'&&track.name!=='Main1.quaternion')
    .map(track=>track.clone()),clip.blendMode);
}

export function groundFishMotion(now:number,id:number){
  const phase=now*.0017+id*2.399;
  // A soft effort every few seconds, with quieter movement between efforts.
  const effort=Math.max(0,Math.sin(phase))**4;
  return {speed:.06+.38*effort,roll:.025*effort*Math.sin(now*.004+id)};
}
