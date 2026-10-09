import * as THREE from 'three';
import { fitFriendsAsset, loadFriendsAsset } from './FriendsAssets';
import { rowboatStrokePhase } from '../multiplayer/FriendsRowboat';
import type { FriendsVehicle } from '../multiplayer/FriendsExpedition';

const wood=()=>new THREE.MeshStandardMaterial({color:0x95633d,roughness:.84});
function plank(root:THREE.Group,x:number,y:number,z:number,w:number,h:number,d:number,material:THREE.Material){
  const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=false;root.add(m);return m;
}
/** The original CC0 hull is 118 triangles. Its static paddle pair is hidden
 * and replaced with independent articulated oars, two rowlocks and a bench. */
export function createRowboatVisual(){
  const root=new THREE.Group();root.name='two-person-rowboat';
  const timber=wood(),cream=new THREE.MeshStandardMaterial({color:0xd3b58d,roughness:.8});
  const fallback=new THREE.Group();root.add(fallback);
  const shape=new THREE.Shape();shape.moveTo(82,0);shape.lineTo(50,34);shape.lineTo(-42,34);shape.lineTo(-78,21);shape.lineTo(-78,-21);shape.lineTo(-42,-34);shape.lineTo(50,-34);shape.closePath();
  const hole=new THREE.Path();hole.moveTo(65,0);hole.lineTo(43,-28);hole.lineTo(-38,-28);hole.lineTo(-70,-17);hole.lineTo(-70,17);hole.lineTo(-38,28);hole.lineTo(43,28);hole.closePath();shape.holes.push(hole);
  const hull=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:28,bevelEnabled:false}),cream);hull.rotation.x=-Math.PI/2;hull.position.y=-18;hull.castShadow=true;hull.receiveShadow=false;fallback.add(hull);
  plank(fallback,0,-17,0,125,3,48,timber);
  void loadFriendsAsset('rowboat').then(source=>{
    if(root.userData.disposed)return;
    const hullSource=source.clone(true);hullSource.getObjectByName('paddles')?.removeFromParent();
    const model=fitFriendsAsset(hullSource,{x:164,y:34,z:82},Math.PI/2);model.position.y=-20;
    model.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=true;o.receiveShadow=false;(o.material as THREE.MeshStandardMaterial).roughness=.86;}});
    root.add(model);fallback.visible=false;
  }).catch(()=>{/* The watertight authored hull remains available offline. */});
  plank(root,8,15,0,14,4,66,timber);
  // Brass rowlocks remain fixed; only the oars rotate during a stroke.
  for(const side of [-1,1]){
    const ring=new THREE.Mesh(new THREE.TorusGeometry(2.2,.65,5,8),new THREE.MeshStandardMaterial({color:0xb9a474,metalness:.6,roughness:.4}));ring.position.set(8,15,side*38);ring.rotation.y=Math.PI/2;root.add(ring);
    const pivot=new THREE.Group();pivot.name=side===1?'left-oar':'right-oar';pivot.position.set(8,15,side*38);root.add(pivot);
    const shaft=new THREE.Mesh(new THREE.CylinderGeometry(.9,1.2,89,6),timber);shaft.rotation.x=Math.PI/2;shaft.position.z=side*20;pivot.add(shaft);
    const spoon=new THREE.Shape();spoon.moveTo(-2.2,-10);spoon.lineTo(-4,5);spoon.quadraticCurveTo(-4,10,0,10);spoon.quadraticCurveTo(4,10,4,5);spoon.lineTo(2.2,-10);spoon.closePath();
    const blade=new THREE.Mesh(new THREE.ExtrudeGeometry(spoon,{depth:1,bevelEnabled:true,bevelSize:.5,bevelThickness:.35,bevelSegments:1,steps:1,curveSegments:4}),timber);blade.rotation.x=-Math.PI/2;blade.position.z=side*65;pivot.add(blade);
    const grip=new THREE.Mesh(new THREE.CylinderGeometry(1.6,1.6,14,6),cream);grip.rotation.x=Math.PI/2;grip.position.z=-side*18;pivot.add(grip);
  }
  // Reused translucent wake ribbons: no particles, allocations or extra render target.
  const wakeGeometry=new THREE.PlaneGeometry(120,5),wakeMaterial=new THREE.MeshBasicMaterial({color:0xe2efdd,transparent:true,opacity:0,depthWrite:false});
  for(const side of [-1,1]){const wake=new THREE.Mesh(wakeGeometry,wakeMaterial);wake.name='rowboat-wake';wake.rotation.x=-Math.PI/2;wake.rotation.z=side*.13;wake.position.set(-85,-4.2,side*34);root.add(wake);}
  return root;
}
export function updateRowboatVisual(root:THREE.Group,v:FriendsVehicle,elapsed:number){
  if(!v.rowing)return;
  for(const [name,stroke,side]of [['left-oar',v.rowing.left,1],['right-oar',v.rowing.right,-1]] as const){
    const oar=root.getObjectByName(name)!;const phase=rowboatStrokePhase(stroke,elapsed),active=phase<1&&Boolean(stroke.playerId);
    const sweep=active?Math.cos(phase*Math.PI*2)*.58:.58;
    oar.rotation.y=side*sweep*stroke.direction;
    // The blade dips for the drive and feathers clear of water on recovery.
    const dip=active?THREE.MathUtils.smoothstep(phase,.04,.18)*(1-THREE.MathUtils.smoothstep(phase,.62,.78)):0;
    oar.rotation.x=side*(-.04+dip*.38);
    oar.rotation.z=active&&phase>.7?Math.sin((phase-.7)/.3*Math.PI)*.10:0;
  }
  root.traverse(o=>{if(o instanceof THREE.Mesh&&o.name==='rowboat-wake'){
    (o.material as THREE.MeshBasicMaterial).opacity=Math.min(.22,v.rowing!.speed/400);
    o.scale.x=.6+Math.min(1,v.rowing!.speed/90);
  }});
}
