import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { fitFriendsAsset, loadFriendsAsset } from './FriendsAssets';
import type { FriendsVehicle } from '../multiplayer/FriendsExpedition';
import { fishingBoatHeave, fishingBoatPitch, FISHING_BOAT_DECK, FISHING_BOAT_HOME, FISHING_BOAT_MOORINGS } from '../world/FriendsFishingBoat';
import { ISLAND_SEA_LEVEL } from '../world/FriendsWaterBodies';
const ROPE_STEPS=12,ROPE_SIDES=5;
function ropeGeometry(){
  const g=new THREE.BufferGeometry(),count=(ROPE_STEPS+1)*(ROPE_SIDES+1);
  g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(count*3),3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('normal',new THREE.BufferAttribute(new Float32Array(count*3),3).setUsage(THREE.DynamicDrawUsage));
  const indices=[];for(let i=0;i<ROPE_STEPS;i++)for(let j=0;j<ROPE_SIDES;j++){const a=i*(ROPE_SIDES+1)+j,b=a+ROPE_SIDES+1;indices.push(a,b,a+1,b,b+1,a+1);}g.setIndex(indices);return g;
}
function batched(body:THREE.Group,geometries:THREE.BufferGeometry[],material:THREE.Material,name:string){
  const mesh=new THREE.Mesh(mergeGeometries(geometries)!,material);mesh.name=name;body.add(mesh);geometries.forEach(g=>g.dispose());return mesh;
}
function box(w:number,h:number,d:number,x:number,y:number,z:number){return new THREE.BoxGeometry(w,h,d).translate(x,y,z);}
/** Shared pose, open window frames and a compact working helm. */
export function createFriendsFishingBoat(){
  const group=new THREE.Group();group.name='west-beach-fishing-boat';group.userData.landmark=true;
  group.position.set(FISHING_BOAT_HOME.x,ISLAND_SEA_LEVEL+FISHING_BOAT_DECK,FISHING_BOAT_HOME.y);
  const body=new THREE.Group();body.name='fishing-boat-floating-body';group.add(body);
  const rubber=new THREE.MeshStandardMaterial({color:'#253a3e',roughness:.88});
  batched(body,[-130,0,130].map(z=>new THREE.CapsuleGeometry(7,22,3,6).translate(86,18-FISHING_BOAT_DECK,z)),rubber,'fishing-boat-fenders');
  const ropeMaterial=new THREE.MeshStandardMaterial({color:'#b59d76',roughness:1});
  batched(body,[-130,0,130].map(z=>new THREE.CylinderGeometry(.9,.9,34,5).translate(86,48-FISHING_BOAT_DECK,z)),ropeMaterial,'fender-suspension-lines');
  const cream=new THREE.MeshStandardMaterial({color:'#d9ded1',roughness:.65});
  // Open 64-unit rear entrance, matching the shared collision doorway.
  batched(body,[box(16,108,3,-40,54,6),box(16,108,3,40,54,6),box(64,16,3,0,100,6),box(42,26,22,-22,13,-107)],cream,'open-cabin-frame-and-console');
  const dark=new THREE.MeshStandardMaterial({color:'#17343a',metalness:.35,roughness:.5});
  batched(body,[box(35,2,19,-22,27,-107),new THREE.CylinderGeometry(1.6,1.6,12,8).rotateX(Math.PI/2).translate(-22,32,-100)],dark,'helm-instruments');
  const bronze=new THREE.MeshStandardMaterial({color:'#bc9c62',metalness:.65,roughness:.35});
  const wheel=new THREE.Group();wheel.name='fishing-boat-steering-wheel';wheel.position.set(-22,32,-94);body.add(wheel);
  const spokes=[new THREE.TorusGeometry(10.5,1.1,6,24),new THREE.CylinderGeometry(2.4,2.4,3,10).rotateX(Math.PI/2)];
  for(let i=0;i<3;i++){const a=i*Math.PI*2/3;spokes.push(new THREE.CylinderGeometry(.65,.65,9,6).rotateZ(-a).translate(Math.sin(a)*4.5,Math.cos(a)*4.5,0));}
  batched(wheel,spokes,bronze,'brass-helm-wheel');
  const ropes=FISHING_BOAT_MOORINGS.map((_,i)=>{const mesh=new THREE.Mesh(ropeGeometry(),ropeMaterial);mesh.name=`dock-mooring-line-${i}`;group.add(mesh);return mesh;});
  const collars=new THREE.InstancedMesh(new THREE.TorusGeometry(6.2,1.2,5,16),ropeMaterial,2);collars.name='rope-wraps-on-dock-posts';group.add(collars);
  group.userData.boatMotion={body,wheel,ropes,collars,start:new THREE.Vector3(),end:new THREE.Vector3(),middle:new THREE.Vector3(),point:new THREE.Vector3(),tangent:new THREE.Vector3(),normal:new THREE.Vector3(),binormal:new THREE.Vector3(),up:new THREE.Vector3(0,1,0),matrix:new THREE.Matrix4(),ringRotation:new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),Math.PI/2),unit:new THREE.Vector3(1,1,1)};
  void loadFriendsAsset('fishingBoat').then(source=>{
    if(group.userData.disposed)return;
    const model=fitFriendsAsset(source,{x:480,y:240,z:200},0,'contain');model.rotation.y=Math.PI/2;model.position.y=-42-FISHING_BOAT_DECK;body.add(model);
    model.traverse(o=>{if(!(o instanceof THREE.Mesh))return;o.receiveShadow=true;
      const materials=Array.isArray(o.material)?o.material:[o.material];
      // Defensive fallback for an older cached model; panes cost two transparent passes.
      if(materials.some(m=>m.name.includes('glazing'))){o.visible=false;o.userData.boatGlass=true;return;}
      o.castShadow=Boolean(group.userData.nearShadows);
    });group.userData.modelReady=true;
  }).catch(()=>{group.userData.modelFailed=true;body.visible=false;ropes.forEach(r=>r.visible=false);collars.visible=false;});
  updateFriendsFishingBoat(group,0,group.position);return group;
}
export function updateFriendsFishingBoat(group:THREE.Group,seconds:number,camera:THREE.Vector3,vehicle?:FriendsVehicle){
  const m=group.userData.boatMotion;if(!m)return;
  const {body,wheel,ropes,collars,start,end,middle,point,tangent,normal,binormal,up,matrix,ringRotation,unit}=m;
  if(vehicle){group.position.set(vehicle.x,vehicle.z,vehicle.y);group.rotation.y=-vehicle.angle-Math.PI/2;}
  const distance=group.position.distanceToSquared(camera);group.visible=distance<12000*12000;if(!group.visible)return;
  body.position.y=vehicle?0:fishingBoatHeave(group.position.x,group.position.z,seconds);
  body.rotation.set(vehicle?.pitch??fishingBoatPitch(seconds),0,0);body.updateMatrix();
  wheel.rotation.z=-(vehicle?.rudder??0)*Math.PI*.65;
  const moored=(vehicle?.moored??true)&&!group.userData.modelFailed;
  collars.visible=moored;group.updateMatrixWorld(true);
  for(let i=0;i<ropes.length;i++){
    const rope=ropes[i];rope.visible=moored;if(!moored)continue;
    const attachment=FISHING_BOAT_MOORINGS[i];
    start.set(attachment.dock.x,attachment.dock.z,attachment.dock.y);group.worldToLocal(start);
    end.set(attachment.boat.y,attachment.boat.z,-attachment.boat.x).applyMatrix4(body.matrix);
    middle.copy(start).lerp(end,.5);middle.y-=Math.min(9,start.distanceTo(end)*.08);
    const positions=rope.geometry.attributes.position,normals=rope.geometry.attributes.normal;
    for(let step=0;step<=ROPE_STEPS;step++){
      const t=step/ROPE_STEPS,a=1-t;
      point.copy(start).multiplyScalar(a*a).addScaledVector(middle,2*a*t).addScaledVector(end,t*t);
      tangent.copy(middle).sub(start).multiplyScalar(a).addScaledVector(end,t).addScaledVector(middle,-t).normalize();
      normal.crossVectors(tangent,up).normalize();binormal.crossVectors(tangent,normal).normalize();
      for(let side=0;side<=ROPE_SIDES;side++){
        const angle=side/ROPE_SIDES*Math.PI*2,c=Math.cos(angle),s=Math.sin(angle),index=step*(ROPE_SIDES+1)+side;
        const nx=normal.x*c+binormal.x*s,ny=normal.y*c+binormal.y*s,nz=normal.z*c+binormal.z*s;
        positions.setXYZ(index,point.x+nx*1.15,point.y+ny*1.15,point.z+nz*1.15);normals.setXYZ(index,nx,ny,nz);
      }
    }
    positions.needsUpdate=normals.needsUpdate=true;rope.geometry.computeBoundingSphere();
    point.set(attachment.post.x,attachment.post.z,attachment.post.y);group.worldToLocal(point);matrix.compose(point,ringRotation,unit);collars.setMatrixAt(i,matrix);
  }
  if(moored){collars.instanceMatrix.needsUpdate=true;collars.computeBoundingSphere();}
  const shadows=distance<1800*1800;
  if(group.userData.nearShadows!==shadows){body.traverse((o:THREE.Object3D)=>{if(o instanceof THREE.Mesh)o.castShadow=shadows&&!o.userData.boatGlass;});group.userData.nearShadows=shadows;}
}
