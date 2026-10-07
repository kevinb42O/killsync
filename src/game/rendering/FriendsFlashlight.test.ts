import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { FriendsFlashlight } from './FriendsFlashlight';

describe('held Friends flashlight', () => {
  it('removes the entire second arm on toggle and preserves that choice across tool changes', () => {
    const scene=new THREE.Scene(),viewmodel=new THREE.Scene(),camera=new THREE.PerspectiveCamera();
    const handCamera=new THREE.PerspectiveCamera();viewmodel.add(handCamera);
    const renderer={shadowMap:{needsUpdate:false}} as unknown as THREE.WebGLRenderer;
    const flashlight=new FriendsFlashlight(scene,viewmodel,camera,renderer);
    const hand=viewmodel.getObjectByName('held-flashlight')!;
    const light=scene.getObjectByName('held-flashlight-beam') as THREE.SpotLight;
    flashlight.update(0,true);expect(hand.visible).toBe(true);expect(light.visible).toBe(true);
    flashlight.toggle();expect(hand.visible).toBe(false);expect(light.visible).toBe(false);
    flashlight.update(1,false);flashlight.update(2,true);
    expect(hand.visible).toBe(false);expect(light.visible).toBe(false);
    flashlight.toggle();flashlight.update(3,true);
    expect(hand.visible).toBe(true);expect(light.visible).toBe(true);
    flashlight.update(4,false);expect(hand.visible).toBe(false);expect(light.visible).toBe(false);
    flashlight.dispose();expect(hand.parent).toBeNull();expect(light.parent).toBeNull();expect(light.target.parent).toBeNull();
  });
  it('keeps the beam aligned with look direction after moving and looking up', () => {
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();
    const renderer={shadowMap:{needsUpdate:false}} as unknown as THREE.WebGLRenderer;
    const flashlight=new FriendsFlashlight(scene,new THREE.Scene(),camera,renderer);
    camera.position.set(12000,-160,5000);camera.lookAt(12500,0,4600);
    flashlight.update(1,true);
    const light=scene.getObjectByName('held-flashlight-beam') as THREE.SpotLight;
    const forward=camera.getWorldDirection(new THREE.Vector3());
    expect(light.target.position.clone().sub(camera.position).normalize().dot(forward)).toBeCloseTo(1);
    expect(light.position.distanceTo(camera.position)).toBeLessThan(20);
    expect(renderer.shadowMap.needsUpdate).toBe(true);
    flashlight.dispose();
  });
});
