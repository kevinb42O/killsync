import * as THREE from 'three';

/** Same red bundle for the local palm, teammates' hands and thrown charges. */
export function createDynamiteModel() {
  const group=new THREE.Group();group.name='friends-dynamite-bundle';
  const cylinder=new THREE.CylinderGeometry(3.2,3.2,22,10),red=new THREE.MeshStandardMaterial({color:'#c12a27',roughness:.85});
  for(let i=0;i<3;i++){const stick=new THREE.Mesh(cylinder,red);stick.rotation.z=Math.PI/2;stick.position.set(0,i===2?5:0,i===0?-3.5:i===1?3.5:0);group.add(stick);}
  const band=new THREE.Mesh(new THREE.BoxGeometry(4,12,14),new THREE.MeshStandardMaterial({color:'#443126',roughness:1}));band.position.y=2;group.add(band);
  const wick=new THREE.Mesh(new THREE.CylinderGeometry(.6,.6,8,6),new THREE.MeshStandardMaterial({color:'#bfa86e',roughness:1}));wick.name='dynamite-wick';wick.position.set(10,10,0);group.add(wick);
  const ember=new THREE.Mesh(new THREE.SphereGeometry(1.3,8,6),new THREE.MeshBasicMaterial({color:'#ffdf65'}));ember.name='dynamite-ember';ember.position.set(10,14,0);ember.visible=false;group.add(ember);
  return group;
}
export function animateDynamiteFuse(group:THREE.Group,remaining:number,now:number) {
  const wick=group.getObjectByName('dynamite-wick')!,ember=group.getObjectByName('dynamite-ember')!;
  wick.scale.y=Math.max(.02,remaining);ember.visible=true;ember.position.y=10+4*remaining;ember.scale.setScalar(1.1+.7*Math.sin(now*.04));
}
export function disposeDynamiteModel(group:THREE.Group) {
  const resources=new Set<{dispose:()=>void}>();group.traverse(o=>{if(o instanceof THREE.Mesh){resources.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])resources.add(m);}});
  for(const resource of resources)resource.dispose();group.removeFromParent();
}
