import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { updateFrontierSunShadow } from './FriendsSunShadow';
const sunlight=()=>{
  const light=new THREE.DirectionalLight();light.shadow.mapSize.set(2048,2048);
  Object.assign(light.shadow.camera,{left:-1700,right:1700,top:1700,bottom:-1700,near:10,far:6500});
  light.shadow.camera.updateProjectionMatrix();return light;
};
describe('stable frontier sunlight shadows',()=>{
  it('keeps a fixed world point at the same shadow UV through subtexel camera movement',()=>{
    const light=sunlight(),forward=new THREE.Vector3(1800,2300,-1200).normalize(),right=new THREE.Vector3(0,1,0).cross(forward).normalize(),texel=3400/2048;
    updateFrontierSunShadow(light,new THREE.Vector3(6000,670,5600));
    const anchored=light.target.position.clone(),position=light.position.clone();light.shadow.updateMatrices(light);
    const point=new THREE.Vector3(6048,640,5696),before=point.clone().applyMatrix4(light.shadow.matrix);
    updateFrontierSunShadow(light,anchored.clone().addScaledVector(right,texel*.24));light.shadow.updateMatrices(light);
    expect(light.position.distanceTo(position)).toBeLessThan(1e-9);
    expect(point.clone().applyMatrix4(light.shadow.matrix).distanceTo(before)).toBeLessThan(1e-9);
  });
  it('repositions in whole texels while retaining the sun direction',()=>{
    const light=sunlight(),forward=new THREE.Vector3(1800,2300,-1200).normalize(),right=new THREE.Vector3(0,1,0).cross(forward).normalize(),texel=3400/2048;
    updateFrontierSunShadow(light,new THREE.Vector3(6000,670,5600));const anchored=light.target.position.clone();
    updateFrontierSunShadow(light,anchored.clone().addScaledVector(right,texel*3.1));
    expect(light.target.position.clone().sub(anchored).dot(right)).toBeCloseTo(texel*3,9);
    expect(light.position.clone().sub(light.target.position).normalize().distanceTo(forward)).toBeLessThan(1e-9);
  });
});
