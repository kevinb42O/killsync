import * as THREE from 'three';
import { craneOutlet, craneCargoAnchor, type FriendsCraneState } from '../multiplayer/FriendsCrane';
import type { PhysicalCargo } from '../multiplayer/FriendsHauling';
import { FriendsRopeMesh } from './FriendsRopeMesh';
import { createCraneHookGeometry } from './FriendsCraneGeometry';

export class FriendsCraneVisuals {
  private group=new THREE.Group();
  private ropes=new Map<number,{mesh:FriendsRopeMesh;stamp:string}>();
  private hookGeometry=createCraneHookGeometry();
  private hookMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.64,metalness:.4});
  private hooks?:THREE.InstancedMesh;
  private start=new THREE.Vector3();private end=new THREE.Vector3();
  private down=new THREE.Vector3(0,-1,0);private direction=new THREE.Vector3();private tilt=new THREE.Quaternion();
  private matrix=new THREE.Matrix4();private rotation=new THREE.Quaternion();private scale=new THREE.Vector3(1,1,1);
  constructor(parent:THREE.Group,private ropeMaterial:THREE.MeshStandardMaterial) {this.group.name='freight-crane-cables';parent.add(this.group);}
  update(cranes:readonly FriendsCraneState[],cargo:readonly PhysicalCargo[],viewer?:{x:number;y:number;z:number}) {
    const visible=cranes.filter(c=>{
      if(!viewer||c.hasWinch===false||c.vehicleId&&c.length===0)return false;
      const outlet=craneOutlet(c),bottom=outlet.z-c.length;
      return c.mastExtension!==undefined&&Math.hypot(viewer.x-c.x,viewer.y-c.y,viewer.z-c.z)<2600 || Math.hypot(viewer.x-outlet.x,viewer.y-outlet.y,Math.max(0,bottom-viewer.z,viewer.z-outlet.z))<2600;
    });
    const ids=new Set(visible.map(c=>c.pieceId));
    for(const [id,rope]of this.ropes)if(!ids.has(id)){rope.mesh.geometry.dispose();rope.mesh.removeFromParent();this.ropes.delete(id);}
    if(!visible.length){if(this.hooks)this.hooks.visible=false;return;}
    if(!this.hooks || this.hooks.instanceMatrix.count<visible.length) {
      this.hooks?.removeFromParent();this.hooks?.dispose();
      this.hooks=new THREE.InstancedMesh(this.hookGeometry,this.hookMaterial,Math.max(8,2**Math.ceil(Math.log2(visible.length))));
      this.hooks.name='freight-crane-hooks';this.hooks.castShadow=false;this.group.add(this.hooks);
    }
    this.hooks.visible=true;this.hooks.count=visible.length;
    visible.forEach((crane,i)=>{
      const outlet=craneOutlet(crane),load=cargo.find(c=>c.id===crane.cargoId),anchor=load?craneCargoAnchor(load,crane):{...outlet,z:outlet.z-crane.length};
      this.start.set(outlet.x,outlet.z,outlet.y);this.end.set(anchor.x,anchor.z,anchor.y);
      let rope=this.ropes.get(crane.pieceId);
      if(!rope){const mesh=new FriendsRopeMesh(this.ropeMaterial);mesh.castShadow=false;this.group.add(mesh);rope={mesh,stamp:''};this.ropes.set(crane.pieceId,rope);}
      // Stationary lifts retain their GPU buffers. Use actual end distance and
      // full tension so the existing three-strand braid stays perfectly straight.
      const stamp=`${outlet.x}:${outlet.y}:${outlet.z}:${anchor.x}:${anchor.y}:${anchor.z}`;
      if(stamp!==rope.stamp){rope.mesh.update(this.start,this.end,this.start.distanceTo(this.end),1);rope.stamp=stamp;}
      this.rotation.setFromAxisAngle(THREE.Object3D.DEFAULT_UP,-(crane.rotation*Math.PI/2+(crane.angle??0)));
      this.direction.subVectors(this.end,this.start).normalize();this.tilt.setFromUnitVectors(this.down,this.direction);this.rotation.premultiply(this.tilt);
      this.matrix.compose(this.end,this.rotation,this.scale);this.hooks!.setMatrixAt(i,this.matrix);
    });
    this.hooks.instanceMatrix.needsUpdate=true;this.hooks.computeBoundingSphere();
  }
  dispose(){for(const rope of this.ropes.values())rope.mesh.geometry.dispose();this.ropes.clear();this.hooks?.dispose();this.hookGeometry.dispose();this.hookMaterial.dispose();this.ropeMaterial.dispose();this.group.removeFromParent();}
}
