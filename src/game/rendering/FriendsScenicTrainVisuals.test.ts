import * as THREE from 'three';
import {describe,it,expect,vi,afterEach} from 'vitest';
import {createScenicTrainVisual,updateScenicTrainVisual} from './FriendsScenicTrainVisuals';
import {scenicVehicles} from '../multiplayer/FriendsScenicService';
import {scenicRailway} from '../world/FriendsScenicRailway';
import {sampleRailAlignment} from '../world/FriendsRailAlignment';
afterEach(()=>vi.unstubAllGlobals());
const canvas=()=>vi.stubGlobal('document',{createElement:()=>({getContext:()=>({fillRect(){},strokeRect(){},fillText(){}})})});
describe('scenic train body and running gear',()=>{
  it('keeps its roof within the surveyed clearance and the walking canopy underside',()=>{
    canvas();for(const closed of [false,true]){const mesh=createScenicTrainVisual(closed,0),bounds=new THREE.Box3().setFromObject(mesh);expect(bounds.max.y).toBeLessThan(132);expect(bounds.min.z).toBeGreaterThan(-61);expect(bounds.max.z).toBeLessThan(61);
      expect(mesh.getObjectByName(closed?'scenic-locomotive-roof':'scenic-carriage-canopy')).toBeDefined();}
  });
  it('has no competing exposed parallel faces on the engine, trim, seats or running gear',()=>{
    canvas();const ray=new THREE.Raycaster(),origin=new THREE.Vector3(),direction=new THREE.Vector3();
    for(const kind of ['engine','touring','flatbed','stake','gondola'] as const)for(const phase of [0,.43,1.11]){
      const closed=kind==='engine';
      const train=createScenicTrainVisual(closed,0,kind==='engine'?'touring':kind);for(const bogie of train.userData.scenicBogies)for(const wheel of bogie.wheels)wheel.rotation.z=phase;train.updateMatrixWorld(true);
      const bounds=new THREE.Box3().setFromObject(train),axes=['x','y','z'] as const;
      for(const axis of axes)for(const sign of [-1,1]){
        const [a,b]=axes.filter(key=>key!==axis);
        for(let u=bounds.min[a]+.137;u<bounds.max[a];u+=4.7)for(let v=bounds.min[b]+.293;v<bounds.max[b];v+=4.7){
          origin.set(0,0,0);origin[axis]=(sign<0?bounds.min[axis]:bounds.max[axis])+sign*60;origin[a]=u;origin[b]=v;
          direction.set(0,0,0);direction[axis]=-sign;ray.set(origin,direction);
          const hits=ray.intersectObject(train,true),first=hits[0],second=first&&hits.find(hit=>hit.object!==first.object||hit.instanceId!==first.instanceId);
          if(!first||!second||second.distance-first.distance>=.25)continue;
          const normal=(hit:THREE.Intersection)=>{const world=hit.object.matrixWorld.clone();if(hit.instanceId!==undefined){const instance=new THREE.Matrix4();(hit.object as THREE.InstancedMesh).getMatrixAt(hit.instanceId,instance);world.multiply(instance);}return hit.face!.normal.clone().applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(world));};
          expect(Math.abs(normal(first).dot(normal(second))),`competing ${kind} at wheel phase ${phase}: ${axis} faces at ${origin.toArray()}: ${JSON.stringify([first,second].map(h=>({distance:h.distance,position:h.object.position,scale:h.object.scale,geometry:(h.object as THREE.Mesh).geometry.type})))}`).toBeLessThan(.9999);
        }
      }
    }
  },120000);
  it('steers the bogies onto the actual centreline through curves, grades and the closing seam',()=>{
    canvas();const route=scenicRailway(),mesh=createScenicTrainVisual(false,0);
    for(const distance of [0,10000,40000,90000,route.length-2,route.length+2]){
      const vehicle=scenicVehicles(distance)[1];mesh.position.set(vehicle.x,vehicle.z,vehicle.y);mesh.rotation.set(0,-vehicle.angle,vehicle.pitch||0,'YXZ');updateScenicTrainVisual(mesh,vehicle);mesh.updateMatrixWorld(true);
      const grainPoint=new THREE.Vector3(20,13,38).applyMatrix4(mesh.matrixWorld).applyMatrix4(mesh.userData.railwayFinishResources.frame);expect(grainPoint.distanceTo(new THREE.Vector3(20,13,38))).toBeLessThan(.00001);
      for(const bogie of mesh.userData.scenicBogies){const p=sampleRailAlignment(route,vehicle.routeDistance!+bogie.offset),centre=bogie.group.getWorldPosition(new THREE.Vector3());expect(centre.distanceTo(new THREE.Vector3(p.x,p.z+14,p.y))).toBeLessThan(.00001);}
    }
    expect(Number.isFinite(mesh.userData.scenicWheelPhase)).toBe(true);
  });
});
