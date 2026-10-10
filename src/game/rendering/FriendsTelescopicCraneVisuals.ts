import * as THREE from 'three';
import { telescopicCraneSections, telescopicCraneOutlet, CRANE_MAX_BOOM_EXTENSION } from '../multiplayer/FriendsTelescopicCrane';
import type { FriendsBuildPiece } from '../multiplayer/FriendsBuilding';
import { createCranePartGeometry } from './FriendsCraneGeometry';

/** Two shared instanced draws, independent of crane size. No per-frame geometry. */
export class FriendsTelescopicCraneVisuals {
  readonly group=new THREE.Group();
  private steel=new THREE.BoxGeometry(1,1,1);
  private winchGeometry=createCranePartGeometry('crane_winch');
  private material=new THREE.MeshStandardMaterial({color:'#ffffff',roughness:.58,metalness:.48});
  private winchMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.65,metalness:.4});
  private sections?:THREE.InstancedMesh;
  private winches?:THREE.InstancedMesh;
  private stamp='';
  constructor(parent:THREE.Group){this.group.name='telescopic-freight-cranes';parent.add(this.group);}
  update(pieces:readonly FriendsBuildPiece[]) {
    const cranes=pieces.filter(p=>p.shape==='crane'),stamp=cranes.map(p=>[p.id,p.x,p.y,p.z,p.rotation,p.craneAngle??0,p.mastExtension??0,p.boomExtension??0].join(':')).join(',');
    if(this.stamp===stamp)return;this.stamp=stamp;
    const capacity=Math.max(1,cranes.length)*128;
    if(!this.sections||this.sections.instanceMatrix.count<capacity){this.sections?.removeFromParent();this.sections?.dispose();this.sections=new THREE.InstancedMesh(this.steel,this.material,capacity);this.sections.name='telescopic-crane-steel';this.sections.castShadow=true;this.sections.receiveShadow=true;this.group.add(this.sections);}
    if(!this.winches||this.winches.instanceMatrix.count<cranes.length){this.winches?.removeFromParent();this.winches?.dispose();this.winches=new THREE.InstancedMesh(this.winchGeometry,this.winchMaterial,Math.max(1,cranes.length));this.winches.name='telescopic-crane-winches';this.winches.castShadow=true;this.group.add(this.winches);}
    const matrix=new THREE.Matrix4(),q=new THREE.Quaternion(),pos=new THREE.Vector3(),scale=new THREE.Vector3(),color=new THREE.Color();let index=0;
    cranes.forEach((p,i)=>{
      const fixed=p.rotation*Math.PI/2,c=Math.cos(fixed),s=Math.sin(fixed);
      const add=(x:number,y:number,z:number,w:number,d:number,h:number,a:number,tint:string)=>{
        pos.set(p.x+x*c-y*s,p.z+z+h/2,p.y+x*s+y*c);q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP,-(fixed+a));scale.set(w,h,d);matrix.compose(pos,q,scale);
        this.sections!.setMatrixAt(index,matrix);this.sections!.setColorAt(index++,color.set(tint));
      };
      for(const b of telescopicCraneSections(p)){
        add(b.x,b.y,b.z,b.w,b.d,b.h,b.angle,b.color);
        // Dark recessed side panels and narrow brass guide strips accent stages.
        if(b.moving&&b.w>20&&b.h>10){
          const side=b.d/2+.15,dx=-Math.sin(b.angle)*side,dy=Math.cos(b.angle)*side;
          for(const sign of [-1,1])add(b.x+dx*sign,b.y+dy*sign,b.z+4,Math.max(4,b.w-6),.6,Math.max(2,b.h-8),b.angle,'#315c59');
        }
      }
      for(const x of [-96,-32])for(const y of [-32,32])add(x,y,8,5,5,4,0,'#e4b879');
      add(-64,-33,39,20,2,18,0,'#172d2e');add(-64,-35,46,12,1,6,0,'#a7d9b6');
      const outlet=telescopicCraneOutlet({...p,mastExtension:p.mastExtension??0});
      pos.set(outlet.x,outlet.z+4,outlet.y);q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP,-(fixed+(p.craneAngle??0)));const winchScale=1+2*(p.boomExtension??0)/CRANE_MAX_BOOM_EXTENSION;matrix.compose(pos,q,new THREE.Vector3(winchScale,.625*winchScale,winchScale));this.winches!.setMatrixAt(i,matrix);
    });
    this.sections.count=index;this.sections.visible=index>0;this.sections.instanceMatrix.needsUpdate=true;if(this.sections.instanceColor)this.sections.instanceColor.needsUpdate=true;this.sections.computeBoundingSphere();
    this.winches.count=cranes.length;this.winches.visible=cranes.length>0;this.winches.instanceMatrix.needsUpdate=true;this.winches.computeBoundingSphere();
  }
  dispose(){this.sections?.dispose();this.winches?.dispose();this.steel.dispose();this.winchGeometry.dispose();this.material.dispose();this.winchMaterial.dispose();this.group.removeFromParent();}
}
