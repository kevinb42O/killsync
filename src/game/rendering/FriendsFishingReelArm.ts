import * as THREE from 'three';

/** Keep the grip at the crank, but route its connected limb back to the
 * camera's left shoulder instead of inheriting the rod's right shoulder. */
export class FriendsFishingReelArm {
  readonly mesh:THREE.Mesh;
  private rest:Float32Array;
  private weights:Float32Array;
  private shoulder:THREE.Vector3;
  private target=new THREE.Vector3();
  private delta=new THREE.Vector3();
  private point=new THREE.Vector3();
  constructor(source:THREE.Mesh){
    this.mesh=source.clone();this.mesh.geometry=source.geometry.clone();
    this.mesh.geometry.userData.friendsShared=false;
    this.mesh.visible=false;this.mesh.frustumCulled=false;
    const positions=this.mesh.geometry.getAttribute('position');
    this.rest=new Float32Array(positions.array);
    this.shoulder=new THREE.Vector3();
    for(let i=0;i<36;i++)this.shoulder.add(this.point.fromBufferAttribute(positions,i));
    this.shoulder.divideScalar(36);
    const axis=this.shoulder.clone().normalize();
    this.weights=new Float32Array(positions.count);
    // The final block is the artist's hand. Preserve it and the short wrist
    // section; distribute the shoulder displacement over the connected limb.
    let wrist=0,shoulderStart=Infinity;
    for(let i=0;i<36;i++)shoulderStart=Math.min(shoulderStart,this.point.fromBufferAttribute(positions,i).dot(axis));
    for(let i=Math.max(0,positions.count-36);i<positions.count;i++)wrist=Math.max(wrist,this.point.fromBufferAttribute(positions,i).dot(axis));
    for(let i=0;i<positions.count;i++)this.weights[i]=THREE.MathUtils.clamp((this.point.fromBufferAttribute(positions,i).dot(axis)-wrist)/(shoulderStart-wrist),0,1);
  }
  update(rod:THREE.Group,camera:THREE.PerspectiveCamera|undefined,now:number){
    const mesh=this.mesh,phase=now*.010;
    mesh.position.set(-.16+Math.sin(phase)*.045,.20+Math.cos(phase)*.045,.10);
    mesh.rotation.set(.35,1.0,-.35+Math.sin(phase)*.12);
    const tangent=Math.tan(THREE.MathUtils.degToRad((camera?.fov??98)/2)),aspect=camera?.aspect??16/9;
    // This anchor is in the camera rig's frame and remains fixed through the
    // crank cycle and rod flex. It lies behind the visible left edge.
    this.target.set(-.65*tangent*aspect,-.20*tangent,.25);
    rod.parent!.updateWorldMatrix(true,false);
    rod.parent!.localToWorld(this.target);mesh.updateWorldMatrix(true,false);mesh.worldToLocal(this.target);
    this.delta.copy(this.target).sub(this.shoulder);
    const positions=mesh.geometry.getAttribute('position');
    for(let i=0;i<positions.count;i++){
      this.point.fromArray(this.rest,i*3).addScaledVector(this.delta,this.weights[i]);
      positions.setXYZ(i,this.point.x,this.point.y,this.point.z);
    }
    positions.needsUpdate=true;mesh.geometry.computeVertexNormals();
    mesh.visible=true;
  }
  dispose(){this.mesh.geometry.dispose();}
}
