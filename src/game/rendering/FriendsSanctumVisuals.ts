import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TIDAL_SANCTUM } from '../world/FriendsSanctum';

/** Fine inlays and reliefs sit on the solid, editable sanctuary. The suspended
 * tideglass crest is above the hauling lane; nothing covers the delivery bay. */
export function createSanctumDetails(){
  const group=new THREE.Group();group.name='tidal-sanctum-carved-inlays';
  group.position.set(TIDAL_SANCTUM.x,0,TIDAL_SANCTUM.y);
  const pearl=new THREE.MeshStandardMaterial({color:'#f5ebd7',roughness:.7});
  const bronze=new THREE.MeshStandardMaterial({color:'#d1a465',metalness:.65,roughness:.36});
  const turquoise=new THREE.MeshStandardMaterial({color:'#57c9c3',emissive:'#22998e',emissiveIntensity:.35,roughness:.3,metalness:.25});
  const parts=new Map<THREE.Material,THREE.BufferGeometry[]>();
  const add=(geometry:THREE.BufferGeometry,material:THREE.Material,x:number,y:number,z:number,rotateX=0)=>{
    const matrix=new THREE.Matrix4().compose(new THREE.Vector3(x,y,z),new THREE.Quaternion().setFromEuler(new THREE.Euler(rotateX,0,0)),new THREE.Vector3(1,1,1));
    const compatible=geometry.index?geometry.toNonIndexed():geometry;
    if(compatible!==geometry)geometry.dispose();
    compatible.applyMatrix4(matrix);const list=parts.get(material)??[];list.push(compatible);parts.set(material,list);
  };
  // A maritime rose in the arch: ring, compass spokes and faceted tideglass.
  add(new THREE.TorusGeometry(108,7,8,48),bronze,0,820,-110);
  add(new THREE.TorusGeometry(92,3,6,48),turquoise,0,820,-108);
  add(new THREE.OctahedronGeometry(34),turquoise,0,820,-108);
  for(let i=0;i<8;i++){
    const a=i*Math.PI/4;
    add(new THREE.SphereGeometry(8,6,4),pearl,Math.sin(a)*108,820+Math.cos(a)*108,-108);
  }
  // Fine mouldings and capital reliefs on both colonnades.
  for(const x of [-352,352])for(const z of [-320,-64,192]){
    for(const y of [430,786])add(new THREE.BoxGeometry(104,10,104),bronze,x+16,y,z+16);
    for(const dx of [-30,0,30])add(new THREE.BoxGeometry(5,310,3),pearl,x+16+dx,608,z+65);
    add(new THREE.TorusGeometry(18,3,6,24),bronze,x+16,850,z+97);
    add(new THREE.OctahedronGeometry(9),turquoise,x+16,850,z+98);
  }
  // Recessed wave medallions on the parapets and stair-side finials.
  for(const x of [-480,480])for(const z of [-416,416]){
    add(new THREE.TorusGeometry(22,4,6,24),bronze,x+16,461,z+65);
    add(new THREE.OctahedronGeometry(10),turquoise,x+16,461,z+67);
  }
  for(const [material,geometries] of parts){
    const mesh=new THREE.Mesh(mergeGeometries(geometries)!,material);mesh.receiveShadow=true;
    group.add(mesh);geometries.forEach(g=>g.dispose());
  }
  return group;
}
