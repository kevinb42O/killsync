import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { FriendsFlashlight, FRIENDS_FLASHLIGHT_INTENSITY, friendsFlashlightAngle } from './FriendsFlashlight';

describe('held Friends flashlight', () => {
  it('starts unequipped, equips on request, and preserves the toggle across tool changes', () => {
    const scene=new THREE.Scene(),viewmodel=new THREE.Scene(),camera=new THREE.PerspectiveCamera();
    const handCamera=new THREE.PerspectiveCamera();viewmodel.add(handCamera);
    const renderer={shadowMap:{needsUpdate:false}} as unknown as THREE.WebGLRenderer;
    const flashlight=new FriendsFlashlight(scene,viewmodel,camera,renderer);
    const hand=viewmodel.getObjectByName('held-flashlight')!;
    const light=scene.getObjectByName('held-flashlight-beam') as THREE.SpotLight;
    expect(light.shadow.needsUpdate).toBe(true);
    expect(light.shadow.autoUpdate).toBe(false);
    // Simulate the initial world render consuming the one-time shadow warmup.
    light.shadow.needsUpdate=false;renderer.shadowMap.needsUpdate=false;
    flashlight.update(0,true);expect(hand.visible).toBe(false);expect(light.visible).toBe(true);expect(light.intensity).toBe(0);
    expect(renderer.shadowMap.needsUpdate).toBe(false);
    expect(light.shadow.needsUpdate).toBe(false);
    flashlight.toggle();flashlight.update(.5,true);expect(hand.visible).toBe(true);expect(light.intensity).toBe(FRIENDS_FLASHLIGHT_INTENSITY);
    flashlight.toggle();expect(hand.visible).toBe(false);expect(light.intensity).toBe(0);
    flashlight.update(1,false);flashlight.update(2,true);
    expect(hand.visible).toBe(false);expect(light.intensity).toBe(0);
    flashlight.toggle();flashlight.update(3,true);
    expect(hand.visible).toBe(true);expect(light.intensity).toBe(FRIENDS_FLASHLIGHT_INTENSITY);
    flashlight.update(4,false);expect(hand.visible).toBe(false);expect(light.intensity).toBe(0);
    expect(light.visible).toBe(true);expect(light.castShadow).toBe(true);expect(light.map).not.toBeNull();
    flashlight.dispose();expect(hand.parent).toBeNull();expect(light.parent).toBeNull();expect(light.target.parent).toBeNull();
  });
  it('keeps a focused cone with dark screen edges at wide walking and sprint FOV', () => {
    const camera=new THREE.PerspectiveCamera();
    const scene=new THREE.Scene();
    const renderer={shadowMap:{needsUpdate:false}} as unknown as THREE.WebGLRenderer;
    const flashlight=new FriendsFlashlight(scene,new THREE.Scene(),camera,renderer);
    const light=scene.getObjectByName('held-flashlight-beam') as THREE.SpotLight;
    for(const aspect of [9/16,16/9,21/9])for(const fov of [70,108,115,120]){
      camera.aspect=aspect;camera.fov=fov;camera.updateProjectionMatrix();
      flashlight.syncWithCamera();
      const cornerAngle=Math.atan(Math.tan(THREE.MathUtils.degToRad(fov/2))*Math.hypot(1,aspect));
      expect(light.angle).toBeLessThan(cornerAngle);
      expect(light.angle).toBeGreaterThanOrEqual(THREE.MathUtils.degToRad(38));
      expect(light.angle).toBeLessThanOrEqual(THREE.MathUtils.degToRad(56));
      // Wide screens keep the beam shape instead of stretching it to the edges.
      const edgeAngle=Math.atan(Math.tan(THREE.MathUtils.degToRad(fov/2))*aspect);
      const weight=THREE.MathUtils.smoothstep(Math.cos(edgeAngle),Math.cos(light.angle),Math.cos(light.angle*(1-light.penumbra)));
      if(aspect>=16/9)expect(weight).toBe(0);
      const halfSpill=THREE.MathUtils.smoothstep(Math.cos(light.angle*.75),Math.cos(light.angle),Math.cos(light.angle*(1-light.penumbra)));
      expect(halfSpill).toBeGreaterThan(.2);expect(halfSpill).toBeLessThan(.8);
      const angle=light.angle;camera.aspect=1;
      expect(friendsFlashlightAngle(camera)).toBe(angle);
    }
    camera.zoom=2;
    expect(friendsFlashlightAngle(camera)).toBeLessThan(light.angle);
    flashlight.dispose();
  });
  it('keeps the beam aligned with look direction after moving and looking up', () => {
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();
    const renderer={shadowMap:{needsUpdate:false}} as unknown as THREE.WebGLRenderer;
    const flashlight=new FriendsFlashlight(scene,new THREE.Scene(),camera,renderer);
    flashlight.toggle();camera.position.set(12000,-160,5000);camera.lookAt(12500,0,4600);
    flashlight.update(1,true);
    const light=scene.getObjectByName('held-flashlight-beam') as THREE.SpotLight;
    const forward=camera.getWorldDirection(new THREE.Vector3());
    expect(light.target.position.clone().sub(light.position).normalize().dot(forward)).toBeCloseTo(1);
    expect(light.position.distanceTo(camera.position)).toBeLessThan(20);
    expect(renderer.shadowMap.needsUpdate).toBe(true);
    flashlight.dispose();
  });
  it('uses the final camera pose on every running frame, including camera-parent motion', () => {
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),rig=new THREE.Group();
    rig.add(camera);scene.add(rig);
    const renderer={shadowMap:{needsUpdate:false}} as unknown as THREE.WebGLRenderer;
    const flashlight=new FriendsFlashlight(scene,new THREE.Scene(),camera,renderer);
    const light=scene.getObjectByName('held-flashlight-beam') as THREE.SpotLight;
    flashlight.toggle();
    for(let frame=0;frame<120;frame++){
      // World update precedes the final movement/bob/look in prepareFrame.
      flashlight.update(frame/60,true);
      rig.position.set(12000+frame*9,-160,5000-frame*12);rig.rotation.y=frame*.003;
      camera.position.y=Math.sin(frame*.2)*2;
      camera.rotation.set(Math.sin(frame*.03)*.4,frame*.008,Math.sin(frame*.2)*.01,'YXZ');
      renderer.shadowMap.needsUpdate=false;light.shadow.needsUpdate=false;
      flashlight.syncWithCamera();
      const position=camera.getWorldPosition(new THREE.Vector3());
      const offset=new THREE.Vector3(-8,-6,-8).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()));
      expect(light.position.distanceTo(position.add(offset))).toBeLessThan(1e-8);
      expect(light.target.position.clone().sub(light.position).normalize().dot(camera.getWorldDirection(new THREE.Vector3()))).toBeCloseTo(1,12);
      expect(light.shadow.needsUpdate).toBe(true);expect(renderer.shadowMap.needsUpdate).toBe(true);
    }
    flashlight.dispose();
  });
});

describe('crane camera illumination',()=>{
 it('reuses the world beam, hides the hand and restores the equipped preference',()=>{
  const scene=new THREE.Scene(),viewmodel=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),renderer={shadowMap:{needsUpdate:false}} as unknown as THREE.WebGLRenderer;
  const flashlight=new FriendsFlashlight(scene,viewmodel,camera,renderer),beam=scene.getObjectByName('held-flashlight-beam') as THREE.SpotLight,hand=viewmodel.getObjectByName('held-flashlight')!;
  flashlight.update(0,true);flashlight.setMonitor(true);expect(beam.intensity).toBe(FRIENDS_FLASHLIGHT_INTENSITY);expect(hand.visible).toBe(false);expect(flashlight.equipped).toBe(false);
  flashlight.setMonitor(false);expect(beam.intensity).toBe(0);flashlight.toggle();flashlight.setMonitor(true);expect(hand.visible).toBe(false);flashlight.setMonitor(false);expect(hand.visible).toBe(true);expect(flashlight.equipped).toBe(true);flashlight.dispose();
 });
});
