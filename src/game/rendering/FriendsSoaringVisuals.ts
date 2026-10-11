import { type FriendsSoaringState, soaringSuspended } from '../multiplayer/FriendsSoaring';
import type { FriendsEnvironmentSnapshot } from '../world/FriendsEnvironmentPreview';
import * as THREE from 'three';
import type { CoopPlayerSnapshot } from '../multiplayer/CoopSimulation';
import { SOARING_LAUNCHES, soaringWind, soaringAtmosphere } from '../world/FriendsSoaringWeather';
import { baseTerrainHeight } from '../world/FriendsTerrain';

/** Double surface airfoil with scalloped trailing edge and curved span. */
export function createSoaringWingGeometry(){
  const vertices:number[]=[],indices:number[]=[],uv:number[]=[];
  const span=32,chord=10;
  for(let layer=0;layer<2;layer++)for(let i=0;i<=span;i++)for(let j=0;j<=chord;j++){
    const u=i/span*2-1,v=j/chord,arch=Math.sqrt(Math.max(0,1-u*u));
    const thickness=Math.sin(Math.PI*v)*(layer===0?6:-2.2);
    vertices.push(23-v*46-Math.abs(u)*12,121+arch*29+thickness, u*82);
    uv.push(i/span,v);
  }
  const plane=(span+1)*(chord+1);
  for(let layer=0;layer<2;layer++)for(let i=0;i<span;i++)for(let j=0;j<chord;j++){
    const a=layer*plane+i*(chord+1)+j,b=a+chord+1;
    if(layer===0)indices.push(a,a+1,b,b,a+1,b+1);else indices.push(a,b,a+1,b,b+1,a+1);
  }
  // Close tips and trailing edge. The leading edge remains an air intake.
  for(const i of [0,span])for(let j=0;j<chord;j++){const a=i*(chord+1)+j;indices.push(a,a+plane,a+1,a+1,a+plane,a+plane+1);}
  for(let i=0;i<span;i++){const a=i*(chord+1)+chord,b=a+chord+1;indices.push(a,b,a+plane,b,b+plane,a+plane);}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingSphere();return geometry;
}
function meshBox(root:THREE.Object3D,size:number[],position:number[],material:THREE.Material,name:string){const m=new THREE.Mesh(new THREE.BoxGeometry(...size as [number,number,number]),material);m.position.fromArray(position);m.name=name;root.add(m);return m;}
export function createSoaringRig(color:string,firstPerson=false){
  const root=new THREE.Group();root.name=firstPerson?'first-person-paraglider':'crew-paraglider';root.userData.firstPerson=firstPerson;
  const fabric=new THREE.MeshStandardMaterial({color,roughness:.92,side:THREE.DoubleSide});
  const wing=new THREE.Mesh(createSoaringWingGeometry(),fabric);wing.name='inflated-paraglider-canopy';wing.castShadow=true;root.add(wing);
  const thread=new THREE.LineBasicMaterial({color:0xdce6cf,transparent:true,opacity:.8});
  const ribs:number[]=[],lines:number[]=[];
  for(let i=0;i<=24;i++){
    const u=i/24*2-1,z=u*82,h=121+Math.sqrt(Math.max(0,1-u*u))*29;
    for(let j=0;j<10;j++){const a=j/10,b=(j+1)/10;ribs.push(23-a*46-Math.abs(u)*12,h+Math.sin(Math.PI*a)*6+.15,z,23-b*46-Math.abs(u)*12,h+Math.sin(Math.PI*b)*6+.15,z);}
    if(i%3===0)for(const chord of [15,-15])lines.push(-4,58.5,Math.sign(u||1)*12,chord-Math.abs(u)*12,h+2,z);
  }
  const ribMesh=new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(ribs,3)),new THREE.LineBasicMaterial({color:0xf4f0dc,transparent:true,opacity:.45}));ribMesh.name='canopy-cell-seams';root.add(ribMesh);
  const lineMesh=new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(lines,3)),thread);lineMesh.name='paraglider-suspension-lines';root.add(lineMesh);
  const dark=new THREE.MeshStandardMaterial({color:0x203943,roughness:.95}),trim=new THREE.MeshStandardMaterial({color:0xc6b087,roughness:.9}),skin=new THREE.MeshStandardMaterial({color:0xd9af8f,roughness:.95});
  meshBox(root,[22,8,24],[0,23,0],dark,'seated-flight-harness');
  meshBox(root,[8,24,26],[-9,37,0],dark,'harness-back');
  for(const side of [-1,1]){
    meshBox(root,[3,27,3],[-4,45,side*12],trim,'harness-riser');
    const toggle=meshBox(root,[2,1.4,6],firstPerson?[34,52,side*23]:[8,51,side*16],dark,'brake-toggle');toggle.userData.brakeHeight=toggle.position.y;toggle.userData.side=side;
    if(firstPerson){
      const sleeve=meshBox(root,[1,3,3],[19,23,side*18],dark,'soaring-sleeve');sleeve.userData.side=side;
      const hand=meshBox(root,[5,4,4],[34,52,side*23],skin,'soaring-hand');hand.userData.brakeHeight=52;hand.userData.side=side;
      meshBox(root,[22,5,6],[14,12,side*7],dark,'soaring-pilot-leg');
      meshBox(root,[6,9,7],[27,7,side*7],dark,'soaring-pilot-boot');
    }
  }
  // Brake lines are separate from the load-bearing risers. Mesh cords remain
  // visible on WebGL implementations whose line width is fixed to one pixel.
  const cordMaterial=new THREE.MeshStandardMaterial({color:0xffdc88,roughness:1});
  const cordGeometry=new THREE.CylinderGeometry(.10,.10,1,6);
  for(const side of [-1,1])for(let branch=0;branch<4;branch++){
    const cord=new THREE.Mesh(cordGeometry,cordMaterial);cord.name='paraglider-brake-cord';cord.userData.side=side;cord.userData.branch=branch;root.add(cord);
  }
  root.userData.suspensionRest=Float32Array.from(lines);
  root.userData.wing=wing;root.userData.ribs=ribMesh;root.userData.lines=lineMesh;return root;
}
const cordAxis=new THREE.Vector3(0,1,0);
function connectSegment(mesh:THREE.Mesh,from:THREE.Vector3,to:THREE.Vector3){
  const delta=new THREE.Vector3().subVectors(to,from),length=delta.length();
  mesh.position.copy(from).add(to).multiplyScalar(.5);mesh.scale.y=length;
  mesh.quaternion.setFromUnitVectors(cordAxis,delta.normalize());
  mesh.userData.from=from;mesh.userData.to=to;
}
export function updateSoaringRigPose(rig:THREE.Group,s:FriendsSoaringState,handPoint?:(side:'left'|'right',out:THREE.Vector3)=>boolean,aspect=16/9){
  const inflation=Math.max(.015,s.inflation),span=.15+.85*inflation;
  for(const name of ['wing','ribs']){const part=rig.userData[name] as THREE.Object3D;part.scale.set(1,inflation,span);}
  const lines=rig.userData.lines as THREE.LineSegments,positions=lines.geometry.getAttribute('position'),rest=rig.userData.suspensionRest as Float32Array;
  // Only the canopy ends shrink during inflation. Harness sockets stay fixed.
  for(let i=0;i<positions.count;i++)positions.setXYZ(i,rest[i*3],rest[i*3+1]*(i%2?inflation:1),rest[i*3+2]*(i%2?span:1));
  positions.needsUpdate=true;lines.geometry.computeBoundingSphere();lines.visible=s.inflation>.5;
  rig.visible=s.phase!=='landed'||s.inflation>.05;
  const suspended=soaringSuspended(s),gripSpan=rig.userData.firstPerson?Math.min(23,Math.max(.4,aspect)*15):16;
  for(const child of rig.children){
    if(child.name.includes('harness')||child.name.startsWith('soaring-pilot')||['soaring-sleeve','soaring-hand','brake-toggle','paraglider-brake-cord'].includes(child.name))child.visible=suspended;
    if(child.name==='brake-toggle'||child.name==='soaring-hand'){
      const pull=Math.min(1,s.brake+Math.max(0,-child.userData.side*s.bank)*.65);
      child.position.y=child.userData.brakeHeight-pull*11;
      child.position.z=child.userData.side*gripSpan;
    }
  }
  for(const side of [-1,1]){
    const toggle=rig.children.find(c=>c.name==='brake-toggle'&&c.userData.side===side)!;
    if(handPoint){const world=new THREE.Vector3();if(handPoint(side===-1?'left':'right',world)){rig.updateWorldMatrix(true,false);toggle.position.copy(rig.worldToLocal(world));}}
    const wrist=toggle.position.clone(),junction=new THREE.Vector3(12,94*inflation,side*(rig.userData.firstPerson?Math.min(30,Math.max(.4,aspect)*24):30)*span);
    const sleeve=rig.children.find(c=>c.name==='soaring-sleeve'&&c.userData.side===side) as THREE.Mesh|undefined;
    if(sleeve){const shoulder=new THREE.Vector3(10,25,side*Math.min(19,Math.max(.4,aspect)*12)),delta=wrist.clone().sub(shoulder);sleeve.position.copy(shoulder).add(wrist).multiplyScalar(.5);sleeve.scale.x=delta.length();sleeve.quaternion.setFromUnitVectors(new THREE.Vector3(1,0,0),delta.normalize());}
    for(const cord of rig.children.filter(c=>c.name==='paraglider-brake-cord'&&c.userData.side===side) as THREE.Mesh[]){
      const branch=cord.userData.branch as number;
      const u=side*(.30+(branch-1)*.24),top=new THREE.Vector3(-23-Math.abs(u)*12,(121+Math.sqrt(1-u*u)*29)*inflation,u*82*span);
      connectSegment(cord,branch===0?wrist:junction,branch===0?junction:top);
      cord.visible=suspended&&s.inflation>.5;
    }
  }
}
function dispose(root:THREE.Object3D){const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();root.traverse(o=>{if(o instanceof THREE.Mesh||o instanceof THREE.LineSegments){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);}});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());root.removeFromParent();}
export class FriendsSoaringVisuals {
  readonly group=new THREE.Group();private rigs=new Map<string,THREE.Group>();private windsocks:THREE.Group[]=[];
  constructor(scene:THREE.Scene){this.group.name='friends-soaring';scene.add(this.group);
    for(const launch of SOARING_LAUNCHES){const g=new THREE.Group();g.name=launch.id+'-launch-windsock';g.position.set(launch.x,baseTerrainHeight(launch.x,launch.y),launch.y);
      const pole=new THREE.Mesh(new THREE.CylinderGeometry(1.4,1.6,96,8),new THREE.MeshStandardMaterial({color:0xded6bb}));pole.position.y=48;g.add(pole);
      const sock=new THREE.Mesh(new THREE.CylinderGeometry(2,7,42,12,1,true),new THREE.MeshStandardMaterial({color:0xf0a565,side:THREE.DoubleSide}));sock.rotation.z=Math.PI/2;sock.position.set(21,91,0);sock.name='wind-direction-sock';g.add(sock);this.windsocks.push(g);this.group.add(g);
    }
  }
  update(players:CoopPlayerSnapshot[],localId:string,timeMs:number,enabled=true,environment?:FriendsEnvironmentSnapshot,handPoint?:(id:string,side:'left'|'right',out:THREE.Vector3)=>boolean,aspect=16/9){
    this.group.visible=enabled;if(!enabled)return;
    const active=new Set<string>();
    for(const p of players){const s=p.friendsSoaring;if(!s||p.lifeState!=='alive')continue;active.add(p.id);
      let rig=this.rigs.get(p.id);if(rig&&rig.userData.firstPerson!==(p.id===localId)){dispose(rig);this.rigs.delete(p.id);rig=undefined;}if(!rig){rig=createSoaringRig(p.color,p.id===localId);this.rigs.set(p.id,rig);this.group.add(rig);}
      rig.position.set(p.x,p.z,p.y);rig.rotation.set(s.phase==='flying'?s.bank*.75:0,-s.heading,0,'YXZ');
      updateSoaringRigPose(rig,s,p.id!==localId&&handPoint?(side,out)=>handPoint(p.id,side,out):undefined,aspect);
    }
    for(const [id,rig] of this.rigs)if(!active.has(id)){dispose(rig);this.rigs.delete(id);}
    const atmosphere=soaringAtmosphere(timeMs,timeMs,environment),w=soaringWind(atmosphere.windTimeMs,atmosphere.windScale);for(const sock of this.windsocks){sock.rotation.y=-w.angle;const m=sock.getObjectByName('wind-direction-sock')!;m.rotation.z=Math.PI/2+.08*Math.sin(timeMs*.004+sock.position.x);}
  }
  dispose(){dispose(this.group);this.rigs.clear();this.windsocks=[];}
}
