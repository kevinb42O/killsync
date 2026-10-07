import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { FriendsDayNightCycle } from './FriendsDayNightCycle';

describe('Frontier atmosphere and shadow integration',()=>{
  it('twinkles on frame time while night progresses at 60 times normal speed',()=>{
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();
    const sun=new THREE.DirectionalLight(),ambient=new THREE.AmbientLight(),fill=new THREE.HemisphereLight();
    const renderer={shadowMap:{needsUpdate:false},toneMappingExposure:1} as THREE.WebGLRenderer;
    const cycle=new FriendsDayNightCycle(scene,renderer,camera,{sun,ambient,fill});
    cycle.update(900000,15000);
    expect(cycle.state.phase).toBe('Night');
    expect(cycle.sky.material.uniforms.time.value).toBe(15);
    cycle.update(900960,15016);
    expect(cycle.sky.material.uniforms.time.value).toBeCloseTo(15.016);
    // Pausing the shared animation clock also freezes the star shimmer.
    cycle.update(900960,15016);
    expect(cycle.sky.material.uniforms.time.value).toBeCloseTo(15.016);
    cycle.dispose();
  });
  it('aligns visible celestial bodies and shadows, shades the exterior, and restores the background',()=>{
    const scene=new THREE.Scene(),original=new THREE.Texture();scene.background=original;
    const camera=new THREE.PerspectiveCamera();camera.position.set(7000,670,5500);
    const sun=new THREE.DirectionalLight(),ambient=new THREE.AmbientLight(),fill=new THREE.HemisphereLight();
    Object.assign(sun.shadow.camera,{left:-1700,right:1700,top:1700,bottom:-1700,near:10,far:6500});sun.shadow.mapSize.set(2048,2048);
    const renderer={shadowMap:{needsUpdate:false},toneMappingExposure:1} as THREE.WebGLRenderer;
    const cycle=new FriendsDayNightCycle(scene,renderer,camera,{sun,ambient,fill});
    cycle.update(180000); // Noon.
    const daytime=cycle.horizon.clone();
    expect(sun.intensity).toBe(1.85);expect(sun.castShadow).toBe(true);expect(cycle.moon.castShadow).toBe(false);
    expect(sun.position.clone().sub(sun.target.position).normalize().distanceTo(cycle.sky.material.uniforms.sunDirection.value)).toBeLessThan(1e-9);
    cycle.update(900000); // Midnight.
    expect(sun.intensity).toBe(0);expect(sun.castShadow).toBe(false);expect(cycle.moon.castShadow).toBe(true);
    expect(cycle.moon.position.clone().sub(cycle.moon.target.position).normalize().distanceTo(cycle.sky.material.uniforms.moonDirection.value)).toBeLessThan(1e-9);
    expect(cycle.horizon.r).toBeLessThan(daytime.r);expect(cycle.surfaceTint.value.r).toBeLessThan(.1);
    expect(cycle.sky.visible).toBe(true);expect(cycle.sky.position.equals(camera.position)).toBe(true);
    expect(cycle.sky.material.depthWrite).toBe(false);expect(cycle.sky.renderOrder).toBeLessThan(0);
    expect(renderer.shadowMap.needsUpdate).toBe(true);
    // A paused preview clock still refreshes shadows for streaming and movement.
    renderer.shadowMap.needsUpdate=false;
    cycle.update(900000,900010);expect(renderer.shadowMap.needsUpdate).toBe(false);
    camera.position.x+=100;cycle.update(900000,900100);expect(renderer.shadowMap.needsUpdate).toBe(true);
    renderer.shadowMap.needsUpdate=false;
    cycle.update(180000,900101);expect(renderer.shadowMap.needsUpdate).toBe(true); // Scrubbing updates immediately.
    renderer.shadowMap.needsUpdate=false;
    camera.position.x+=1000;cycle.update(180000,900102);expect(renderer.shadowMap.needsUpdate).toBe(true); // Teleporting does too.
    cycle.dispose();expect(scene.background).toBe(original);expect(scene.getObjectByName('frontier-moonlight')).toBeUndefined();
  });
});
