import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { fitFriendsAsset, loadFriendsAsset } from './FriendsAssets';
import { FRIENDS_COASTAL_PIER, coastalPierApproachHeight, coastalPierApproachWidth } from '../world/FriendsCoastalPier';

export function createFriendsCoastalPier() {
  const p = FRIENDS_COASTAL_PIER, group = new THREE.Group();
  group.name = 'west-beach-timber-dock'; group.userData.landmark = true;
  group.position.set(p.x, p.deck, p.y); group.rotation.y = -p.angle;
  // One mesh of individual planks, whose sloped tops match the shared floor.
  const planks:THREE.BufferGeometry[]=[];
  const count=32,length=p.approachLength/count;
  for(let i=0;i<count;i++){
    const along=-p.approachLength+(i+.5)*length;
    const g=new THREE.BoxGeometry(length-.6,9,coastalPierApproachWidth(along));
    const a=g.attributes.position;
    for(let v=0;v<a.count;v++){
      const x=a.getX(v)+along;
      a.setXYZ(v,x,a.getY(v)-4.5+coastalPierApproachHeight(x)-p.deck,a.getZ(v));
    }
    g.computeVertexNormals();planks.push(g);
  }
  const ramp=new THREE.Mesh(mergeGeometries(planks)!,new THREE.MeshStandardMaterial({color:'#7e7261',roughness:.95}));
  planks.forEach(g=>g.dispose());ramp.name='coastal-pier-beach-gangway';ramp.castShadow=true;ramp.receiveShadow=true;group.add(ramp);
  // Keep a walkable visible deck while the local GLB loads, or if loading fails.
  const fallback = new THREE.Mesh(new THREE.BoxGeometry(p.sections * p.sectionLength, 5, p.width),
    new THREE.MeshStandardMaterial({ color: '#7e7261', roughness: .95 }));
  fallback.position.set(p.sections * p.sectionLength / 2, -2.5, 0);
  fallback.receiveShadow = true; group.add(fallback);
  const headFallback = new THREE.Mesh(new THREE.BoxGeometry(p.sectionLength, 5, p.headWidth), fallback.material);
  headFallback.position.set((p.sections - .5) * p.sectionLength, -2.5, 0);
  headFallback.receiveShadow = true; group.add(headFallback);
  void loadFriendsAsset('coastalPier').then(source => {
    if (group.userData.disposed) return;
    // Clone the source resources once; all spans share this pier's resources.
    const owned = fitFriendsAsset(source, { x: 1, y: 1, z: 1 });
    const placements = Array.from({ length: p.sections - 1 }, (_, i) => ({ x: (i + .5) * p.sectionLength, z: 0, rotation: Math.PI / 2, variant: i % 2 }));
    for (const z of [-p.sectionLength, 0, p.sectionLength]) placements.push({ x: (p.sections - .5) * p.sectionLength, z, rotation: 0, variant: 0 });
    for (const placement of placements) {
      const template = owned.getObjectByName(placement.variant ? 'modular_wooden_pier_section_03' : 'modular_wooden_pier_section_02')!;
      const span = new THREE.Group(); span.add(template.clone(true));
      span.scale.set(p.modelScale*(placement.rotation?p.width/112:1),p.modelScale,p.modelScale); span.rotation.y = placement.rotation;
      span.position.set(placement.x, 0, placement.z);
      span.traverse(o => { if (o instanceof THREE.Mesh) { o.castShadow = true; o.receiveShadow = true;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          if (m instanceof THREE.MeshStandardMaterial) { m.map && (m.map.anisotropy = 4); m.normalScale.set(.7, .7); }
        }
      } });
      group.add(span);
    }
    owned.traverse(o=>{
      if(o instanceof THREE.Mesh&&ramp.userData.textured!==true){
        const m=(Array.isArray(o.material)?o.material:[o.material]).find(m=>m instanceof THREE.MeshStandardMaterial&&m.map);
        if(m){(ramp.material as THREE.Material).dispose();ramp.material=m.clone();
          // The source mesh supplies baked vertex colors/occlusion; the new
          // plank geometry uses its own normals and regular box UVs.
          const timber=ramp.material as THREE.MeshStandardMaterial;timber.vertexColors=false;timber.aoMap=null;
          ramp.userData.textured=true;}
      }
    });
    fallback.removeFromParent(); fallback.geometry.dispose(); fallback.material.dispose();
    headFallback.removeFromParent(); headFallback.geometry.dispose();
    group.userData.modelReady = true;
  }).catch(() => { group.userData.modelFailed = true; });
  return group;
}
