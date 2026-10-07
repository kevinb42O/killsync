import * as THREE from 'three';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {FriendsScenicRailwayVisuals} from './FriendsScenicRailwayVisuals';
import {scenicStationPoses} from '../world/FriendsScenicRailway';

afterEach(()=>vi.unstubAllGlobals());
describe('finished railway boarding clearance',()=>{
  it('keeps masonry cutting walls outside every actual boarding platform',()=>{
    vi.stubGlobal('document',{createElement:()=>({getContext:()=>({fillRect(){},strokeRect(){},fillText(){}})})});
    const railway=new FriendsScenicRailwayVisuals(new THREE.Scene()),matrix=new THREE.Matrix4(),point=new THREE.Vector3();
    try{
      railway.group.traverse(object=>{
        if(!(object instanceof THREE.InstancedMesh)||!((object.material as THREE.MeshStandardMaterial).color?.getHex()===0x89877b))return;
        object.geometry.computeBoundingBox();const box=object.geometry.boundingBox!;
        for(let i=0;i<object.count;i++){
          object.getMatrixAt(i,matrix);
          for(const station of scenicStationPoses()){
            const bounds=new THREE.Box3(),c=Math.cos(station.angle),s=Math.sin(station.angle);
            for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
              point.set(x,y,z).applyMatrix4(matrix);const dx=point.x-station.x,dy=point.z-station.y;
              bounds.expandByPoint(new THREE.Vector3(dx*c+dy*s,point.y-station.z,-dx*s+dy*c));
            }
            const obstructs=bounds.max.x>-1280&&bounds.min.x<1280&&bounds.max.z>80&&bounds.min.z<384&&bounds.max.y>14&&bounds.min.y<150;
            expect(obstructs,`masonry blocks boarding at ${station.name}: ${JSON.stringify({min:bounds.min,max:bounds.max,centre:new THREE.Vector3().setFromMatrixPosition(matrix)})}`).toBe(false);
          }
        }
      });
    }finally{railway.dispose();}
  },60000);
});
