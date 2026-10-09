import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { FriendsNightVision } from './FriendsNightVision';
import { FRIENDS_NIGHT_VISION_RANGE, friendsVisionBufferSize } from './FriendsVision';

function setup() {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  const goggles = new FriendsNightVision(scene);
  let currentTarget: THREE.WebGLRenderTarget | null = null;
  let width = 1280, height = 720;
  const renderer = {
    autoClear: false, toneMappingExposure: .9,
    shadowMap: { needsUpdate: false },
    getDrawingBufferSize: (size: THREE.Vector2) => size.set(width, height),
    getRenderTarget: () => currentTarget,
    setRenderTarget: vi.fn((target: THREE.WebGLRenderTarget | null) => { currentTarget = target; }),
    render: vi.fn(),
    initRenderTarget: vi.fn(),
  } as unknown as THREE.WebGLRenderer;
  const infrared = scene.getObjectByName('night-vision-infrared') as THREE.SpotLight;
  return { scene, goggles, camera, renderer, infrared, resize: (w=1920,h=1080) => { width = w; height = h; } };
}

describe('Friends night vision goggles', () => {
  it('switches HDR anti-aliasing at frame boundaries without resetting goggles or leaking targets', () => {
    const { goggles, camera, renderer } = setup();
    goggles.toggle(); goggles.beginFrame(renderer, camera, 100);
    const initial = renderer.getRenderTarget()!;
    const disposed = vi.fn(); initial.addEventListener('dispose', disposed);
    expect(initial.samples).toBe(2);
    goggles.setSamples(0); // Changing the preference cannot invalidate an active frame.
    expect(disposed).not.toHaveBeenCalled();
    goggles.endFrame(renderer);
    const exposure = goggles['exposureTargets'][goggles['exposureIndex']];
    goggles.beginFrame(renderer, camera, 16);
    const singleSample = renderer.getRenderTarget()!;
    expect(disposed).toHaveBeenCalledTimes(1);
    expect(singleSample.samples).toBe(0); expect(singleSample).not.toBe(initial);
    expect(goggles['exposureTargets'][goggles['exposureIndex']]).toBe(exposure);
    expect(goggles['exposureInitialized']).toBe(true); expect(goggles.equipped).toBe(true);
    goggles.endFrame(renderer);
    goggles.setSamples(0); goggles.beginFrame(renderer, camera, 16);
    expect(renderer.getRenderTarget()).toBe(singleSample); goggles.endFrame(renderer);
    const released = vi.fn(); singleSample.addEventListener('dispose', released);
    goggles.setSamples(4); goggles.beginFrame(renderer, camera, 16);
    expect(renderer.getRenderTarget()!.samples).toBe(4); expect(released).toHaveBeenCalledTimes(1);
    goggles.endFrame(renderer);
    expect(renderer.initRenderTarget).toHaveBeenCalledTimes(2);
    expect(renderer.getRenderTarget()).toBeNull(); goggles.dispose();
  });
  it('bounds requested anti-aliasing to the GPU capability', () => {
    const { goggles, camera, renderer } = setup();
    Object.assign(renderer, { capabilities: { maxSamples: 2 } });
    goggles.setSamples(4); goggles.beginFrame(renderer, camera, 16);
    expect(renderer.getRenderTarget()!.samples).toBe(2); goggles.endFrame(renderer); goggles.dispose();
  });
  it('keeps a stable HDR path and zero illumination while unequipped, skipping inactive shadow/meter work', () => {
    const { goggles, camera, renderer, infrared } = setup();
    expect(goggles.equipped).toBe(false);
    expect(goggles.beginFrame(renderer,camera,16)).toBe(true);goggles.endFrame(renderer);
    expect(infrared.intensity).toBe(0);expect(infrared.visible).toBe(true);
    expect(infrared.shadow.autoUpdate).toBe(false);
    // The initial world render consumes the one-time shadow warmup.
    infrared.shadow.needsUpdate=false;renderer.shadowMap.needsUpdate=false;
    vi.mocked(renderer.render).mockClear();
    for(let i=0;i<60;i++){expect(goggles.beginFrame(renderer,camera,16)).toBe(true);goggles.endFrame(renderer);}
    expect(renderer.render).toHaveBeenCalledTimes(60);
    expect(renderer.initRenderTarget).toHaveBeenCalledTimes(2);
    expect(renderer.shadowMap.needsUpdate).toBe(false);
    expect(goggles.toggle()).toBe(true);
    expect(goggles.beginFrame(renderer, camera, 16)).toBe(true);
    expect(infrared.intensity).toBeGreaterThan(0);expect(infrared.shadow.needsUpdate).toBe(true);
    goggles.endFrame(renderer);
    expect(goggles.toggle()).toBe(false);
    for (let i = 0; i < 60; i++) {
      if (goggles.beginFrame(renderer, camera, 16)) goggles.endFrame(renderer);
    }
    expect(goggles.beginFrame(renderer, camera, 16)).toBe(true);goggles.endFrame(renderer);
    expect(infrared.intensity).toBe(0);expect(infrared.visible).toBe(true);
    expect(renderer.initRenderTarget).toHaveBeenCalledTimes(2);
    expect(renderer.getRenderTarget()).toBeNull();
    goggles.dispose();
  });

  it('tracks camera aim, preserves renderer state, and resizes the HDR buffer', () => {
    const { goggles, camera, renderer, infrared, resize } = setup();
    const originalTarget = new THREE.WebGLRenderTarget(100, 100);
    renderer.setRenderTarget(originalTarget);
    camera.position.set(12000, -150, 5000); camera.lookAt(12500, 0, 4600);
    goggles.toggle(); goggles.beginFrame(renderer, camera, 100);
    const buffer = renderer.getRenderTarget()!;
    expect(buffer.width).toBe(1280); expect(buffer.height).toBe(720);
    expect(infrared.position.equals(camera.position)).toBe(true);
    expect(infrared.target.position.clone().sub(camera.position).normalize()
      .dot(camera.getWorldDirection(new THREE.Vector3()))).toBeCloseTo(1);
    goggles.endFrame(renderer);
    expect(renderer.getRenderTarget()).toBe(originalTarget);
    expect(renderer.autoClear).toBe(false); expect(renderer.toneMappingExposure).toBe(.9);
    resize(); goggles.beginFrame(renderer, camera, 16);
    expect(renderer.getRenderTarget()).toBe(buffer);
    expect(buffer.width).toBe(1920); expect(buffer.height).toBe(1080);
    goggles.endFrame(renderer);
    const released = vi.fn(); buffer.addEventListener('dispose', released);
    goggles.dispose(); expect(released).toHaveBeenCalled();
    expect(infrared.parent).toBeNull(); expect(infrared.target.parent).toBeNull();
    originalTarget.dispose();
  });

  it('suspends infrared when spectating and resumes only if already equipped', () => {
    const { goggles, camera, renderer, infrared } = setup();
    goggles.toggle(); goggles.beginFrame(renderer, camera, 100); goggles.endFrame(renderer);
    expect(goggles.beginFrame(renderer, camera, 16, false)).toBe(true);goggles.endFrame(renderer);
    expect(infrared.intensity).toBe(0); expect(goggles.equipped).toBe(true);
    expect(goggles.beginFrame(renderer, camera, 16, true)).toBe(true);
    goggles.endFrame(renderer);
    goggles.toggle(); goggles.beginFrame(renderer, camera, 16, false);goggles.endFrame(renderer);
    expect(goggles.beginFrame(renderer, camera, 16, true)).toBe(true);goggles.endFrame(renderer);
    expect(infrared.intensity).toBe(0);
    goggles.dispose();
  });

  it('uses the final world-space camera pose under a moving/rotating parent and covers widescreen corners', () => {
    const {scene,goggles,camera,renderer,infrared}=setup(),rig=new THREE.Group();scene.add(rig);rig.add(camera);
    goggles.toggle();
    for(const aspect of [9/16,16/9,21/9])for(const fov of [70,108,115,120]){
      rig.position.set(1000,200,500);rig.rotation.y=.4;camera.position.set(10,20,30);camera.rotation.set(.3,.5,0);
      camera.aspect=aspect;camera.fov=fov;camera.updateProjectionMatrix();
      goggles.beginFrame(renderer,camera,16);
      expect(infrared.position.distanceTo(camera.getWorldPosition(new THREE.Vector3()))).toBeLessThan(1e-8);
      expect(infrared.target.position.clone().sub(infrared.position).length()).toBeCloseTo(FRIENDS_NIGHT_VISION_RANGE);
      expect(infrared.target.position.clone().sub(infrared.position).normalize().dot(camera.getWorldDirection(new THREE.Vector3()))).toBeCloseTo(1,12);
      const corner=Math.atan(Math.tan(THREE.MathUtils.degToRad(fov/2))*Math.hypot(1,aspect));
      expect(infrared.angle).toBeGreaterThan(corner);
      const edge=Math.atan(Math.tan(THREE.MathUtils.degToRad(fov/2))*aspect);
      expect(THREE.MathUtils.smoothstep(Math.cos(edge),Math.cos(infrared.angle),Math.cos(infrared.angle*(1-infrared.penumbra)))).toBeGreaterThan(.6);
      goggles.endFrame(renderer);
    }
    goggles.dispose();
  });

  it('bounds HDR resolution at native aspect without reallocating on toggles', () => {
    const {goggles,camera,renderer,resize}=setup();resize(7680,4320);
    goggles.beginFrame(renderer,camera,16);const buffer=renderer.getRenderTarget()!;goggles.endFrame(renderer);
    expect(buffer.width).toBe(3840);expect(buffer.height).toBe(2160);
    for(let i=0;i<10;i++){
      goggles.toggle();goggles.beginFrame(renderer,camera,16);expect(renderer.getRenderTarget()).toBe(buffer);goggles.endFrame(renderer);
    }
    for(const [w,h]of [[3440,1440],[900,1600],[7680,2160]]){
      const size=friendsVisionBufferSize(w,h,1600*900);
      expect(size.x*size.y).toBeLessThanOrEqual(1600*900);
      expect(size.x/size.y).toBeCloseTo(w/h,2);
    }
    goggles.dispose();
  });

  it('restores the destination and autoClear if a compositor render throws, and ignores duplicate end calls', () => {
    const {goggles,camera,renderer}=setup();
    const destination=new THREE.WebGLRenderTarget(100,100);renderer.setRenderTarget(destination);
    goggles.beginFrame(renderer,camera,16);
    vi.mocked(renderer.render).mockImplementationOnce(()=>{throw new Error('lost frame');});
    expect(()=>goggles.endFrame(renderer)).toThrow('lost frame');
    expect(renderer.getRenderTarget()).toBe(destination);expect(renderer.autoClear).toBe(false);
    vi.mocked(renderer.render).mockClear();goggles.endFrame(renderer);expect(renderer.render).not.toHaveBeenCalled();
    goggles.dispose();expect(goggles.beginFrame(renderer,camera,16)).toBe(false);destination.dispose();
  });
});
