import { describe,it,expect } from 'vitest';
import * as THREE from 'three';
import { retreatShellGeometry,retreatPathGeometry } from './FriendsRetreatGeometry';
import { RETREAT_BOXES,RETREAT_SITES,STILLWATER,retreatLocal,retreatPoint } from '../world/FriendsRetreatSites';
import { retreatPaths,retreatPathFloor } from '../world/FriendsRetreatPaths';

describe('quiet-place surfaces',()=>{
  it('draws only the exposed house boundary, without duplicate coplanar faces',()=>{
    const boxes=RETREAT_BOXES.filter(b=>b.siteId===STILLWATER.id&&b.surface!=='glass'&&b.surface!=='couch');
    const geometry=retreatShellGeometry(STILLWATER,boxes),position=geometry.getAttribute('position'),normal=geometry.getAttribute('normal'),faces=new Set<string>();
    const solid=(p:THREE.Vector3)=>boxes.some(b=>{
      const local=retreatLocal(STILLWATER,retreatPoint(STILLWATER,p.x,p.z));
      const centre=retreatLocal(STILLWATER,b);
      return Math.abs(local.u-centre.u)<b.w/2&&Math.abs(local.v-centre.v)<b.d/2&&p.y>b.z-STILLWATER.z&&p.y<b.z-STILLWATER.z+b.h;
    });
    for(let i=0;i<position.count;i+=3){
      const vertices=[0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(position,i+j)),key=vertices.map(v=>v.toArray().join(',')).sort().join('|');
      expect(faces.has(key),key).toBe(false);faces.add(key);
      const centre=vertices.reduce((sum,v)=>sum.add(v),new THREE.Vector3()).multiplyScalar(1/3),out=new THREE.Vector3().fromBufferAttribute(normal,i);
      expect(solid(centre.clone().addScaledVector(out,.01)),`outward ${key}`).toBe(false);
      expect(solid(centre.clone().addScaledVector(out,-.01)),`inward ${key}`).toBe(true);
      expect(new THREE.Vector3().subVectors(vertices[1],vertices[0]).cross(new THREE.Vector3().subVectors(vertices[2],vertices[0])).dot(out)).toBeGreaterThan(0);
    }
    geometry.dispose();
  });
  it('keeps the joined approach floor aligned with its rendered triangles and landing',()=>{
    const active=RETREAT_SITES.map(s=>s.id);
    for(const path of retreatPaths()){
      const site=RETREAT_SITES.find(s=>s.id===path.siteId)!,geometry=retreatPathGeometry(site,path),position=geometry.getAttribute('position'),index=geometry.getIndex()!;
      for(let i=0;i<index.count;i+=3){
        const triangle=[0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(position,index.getX(i+j)));
        const cross=new THREE.Vector3().subVectors(triangle[1],triangle[0]).cross(new THREE.Vector3().subVectors(triangle[2],triangle[0]));
        if(cross.y<=0)continue;
        const centre=triangle.reduce((sum,p)=>sum.add(p),new THREE.Vector3()).multiplyScalar(1/3),world=retreatPoint(site,centre.x,centre.z,centre.y);
        expect(retreatPathFloor(world,active),`${path.siteId} top triangle ${i}`).toBeCloseTo(world.z,3);
      }
      if(site.kind==='house'){
        const final=Array.from({length:4},(_,i)=>new THREE.Vector3().fromBufferAttribute(position,position.count-4+i));
        expect(final.every(p=>Math.abs(p.x+100)<.001)).toBe(true);
        expect(path.points.at(-1)!.z).toBe(site.z);
      }
      geometry.dispose();
    }
  });
});
