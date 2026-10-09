import {describe,expect,it,vi} from 'vitest';
import * as THREE from 'three';
import type {CoopPlayerSnapshot} from '../multiplayer/CoopSimulation';
import {FriendsSharedFlashlights} from './FriendsSharedFlashlights';
import {FRIENDS_FLASHLIGHT_MAX_ANGLE} from './FriendsFlashlight';

const actor=(id:string,extra:Partial<CoopPlayerSnapshot>={}):CoopPlayerSnapshot=>({
  id,x:0,y:-500,z:0,angle:Math.PI/2,lifeState:'alive',friendsFlashlight:{pitch:0,cone:1.35},...extra,
} as CoopPlayerSnapshot);
function fixture(mobile=false){
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(108,16/9,2,10000);
  camera.position.set(0,26,0);camera.updateMatrixWorld(true);
  let target:THREE.WebGLRenderTarget|null=null;
  const renderer={
    shadowMap:{needsUpdate:false,render:vi.fn((lights:THREE.SpotLight[])=>{
      for(const light of lights){renderer.setRenderTarget(light.shadow.map as THREE.WebGLRenderTarget);renderer.clear();light.shadow.needsUpdate=false;}
    })},
    getRenderTarget:()=>target,setRenderTarget:(next:THREE.WebGLRenderTarget|null)=>{target=next;},
    getViewport:(v:THREE.Vector4)=>v.set(0,0,960,540),getScissor:(v:THREE.Vector4)=>v.set(0,0,960,540),getScissorTest:()=>false,
    setViewport:vi.fn(),setScissor:vi.fn(),setScissorTest:vi.fn(),clear:vi.fn(),initRenderTarget:vi.fn(),
  } as unknown as THREE.WebGLRenderer;
  const lamps=new FriendsSharedFlashlights(scene,renderer,mobile),lights=scene.children.filter(o=>o instanceof THREE.SpotLight) as THREE.SpotLight[];
  const render=()=>scene.onAfterRender(renderer,scene,camera,undefined!,undefined!,undefined!);
  const warm=()=>{for(let i=0;i<4;i++){lamps.update([],'self',camera,-100+i*16,16,()=>false);render();}vi.mocked(renderer.shadowMap.render).mockClear();};
  return {scene,camera,renderer,lamps,lights,render,warm};
}

describe('shared Friends flashlight rendering',()=>{
  it('projects glare from the rendered lens and checks occlusion again as the hand moves',()=>{
    const f=fixture(),p=actor('guest'),source=new THREE.Vector3(25,35,-400),blocked=vi.fn((_source:THREE.Vector3,_eye:THREE.Vector3)=>false);
    f.warm();const emission=(_id:string,out:THREE.Vector3)=>{out.copy(source);return true;};
    f.lamps.update([p],'self',f.camera,0,16,blocked,'',true,emission);
    const projected=source.clone().project(f.camera),flare=f.lamps.presentation.flares.find(v=>v.z>0)!;
    expect(flare.x).toBeCloseTo(projected.x*.5+.5);expect(flare.y).toBeCloseTo(projected.y*.5+.5);
    expect(blocked.mock.calls[0][0].distanceTo(source)).toBe(0);
    source.x+=10;blocked.mockReturnValue(true);
    f.lamps.update([p],'self',f.camera,16,16,blocked,'',true,emission);
    expect(blocked).toHaveBeenCalledTimes(2);expect(f.lamps.presentation.flares.every(v=>v.z===0)).toBe(true);
    f.lamps.update([p],'self',f.camera,32,16,blocked,'',true,()=>false);f.render();
    expect(f.lights.every(l=>l.intensity===0)).toBe(true);f.lamps.dispose();
  });
  it('blinds at conversational distance when the sender aims at standing eyes',()=>{
    const f=fixture();f.camera.position.y=50;f.camera.updateMatrixWorld(true);f.warm();
    const p=actor('guest',{y:-55});
    for(let i=0;i<45;i++)f.lamps.update([p],'self',f.camera,i*16,16,()=>false);
    expect(f.lamps.presentation.glare).toBeGreaterThan(.8);
    f.lamps.dispose();
  });
  it('scales with distance and alignment, including pitched aim at different eye heights',()=>{
    const sample=(distance:number,miss=0,height=50)=>{
      const f=fixture();f.camera.position.y=height;f.camera.lookAt(0,50,-distance);f.camera.updateMatrixWorld(true);f.warm();
      const p=actor('guest',{y:-distance,friendsFlashlight:{pitch:Math.atan2(height-50,distance),yaw:Math.PI/2+miss,cone:1.35}});
      for(let i=0;i<60;i++)f.lamps.update([p],'self',f.camera,i*16,16,()=>false);
      const glare=f.lamps.presentation.glare;f.lamps.dispose();return glare;
    };
    expect(sample(80)).toBeGreaterThan(sample(500));
    expect(sample(500)).toBeGreaterThan(sample(1200));
    expect(sample(2200)).toBe(0);
    expect(sample(500,.18)).toBeGreaterThan(.4);
    expect(sample(500,.5)).toBe(0);
    expect(sample(80,0,90)).toBeGreaterThan(.8);
  });
  it('builds a brief retinal imprint under sustained exposure and clears it on recovery or spectator views',()=>{
    const f=fixture();f.camera.position.y=50;f.camera.updateMatrixWorld(true);f.warm();
    const p=actor('guest',{y:-80});
    f.lamps.update([p],'self',f.camera,0,16,()=>false);
    const initial=f.lamps.presentation.glare;
    expect(f.lamps.presentation.afterimage.z).toBe(0);
    for(let i=1;i<=60;i++)f.lamps.update([p],'self',f.camera,i*16,16,()=>false);
    expect(f.lamps.presentation.glare).toBeGreaterThan(initial);
    expect(f.lamps.presentation.afterimage.z).toBeGreaterThan(.3);
    const position=f.lamps.presentation.afterimage.clone();
    f.camera.lookAt(0,50,100);f.camera.updateMatrixWorld(true);
    for(let i=1;i<=15;i++)f.lamps.update([p],'self',f.camera,960+i*16,16,()=>false);
    expect(f.lamps.presentation.flares.every(v=>v.z===0)).toBe(true);
    expect(f.lamps.presentation.afterimage.z).toBeGreaterThan(.05);
    expect(f.lamps.presentation.afterimage.x).toBe(position.x);expect(f.lamps.presentation.afterimage.y).toBe(position.y);
    for(let i=16;i<=100;i++)f.lamps.update([],'self',f.camera,960+i*16,16,()=>false);
    expect(f.lamps.presentation.glare).toBe(0);expect(f.lamps.presentation.afterimage.z).toBe(0);
    f.camera.lookAt(0,50,-100);f.camera.updateMatrixWorld(true);
    for(let i=0;i<60;i++)f.lamps.update([p],'self',f.camera,2600+i*16,16,()=>false);
    f.lamps.update([p],'self',f.camera,3600,16,()=>false,'',false);
    expect(f.lamps.presentation.glare).toBe(0);expect(f.lamps.presentation.afterimage.z).toBe(0);
    f.lamps.dispose();
  });
  it('keeps four fixed shadowed slots, excludes self/dead/distant lamps, and restores them after toggling',()=>{
    const f=fixture();expect(f.lights).toHaveLength(4);expect(f.lights.every(l=>l.visible&&l.intensity===0&&!l.castShadow)).toBe(true);
    expect(f.lights.every(l=>l.shadow.mapSize.x===512&&!l.shadow.autoUpdate&&l.map===null)).toBe(true);
    expect(new Set(f.lights.map(l=>l.shadow.map)).size).toBe(1);f.warm();
    const players=[actor('self'),actor('guest'),actor('dead',{lifeState:'downed'}),actor('far',{y:-9000})];
    f.lamps.update(players,'self',f.camera,0,16,()=>false);f.render();expect(f.lights.filter(l=>l.intensity>0)).toHaveLength(1);
    const light=f.lights.find(l=>l.intensity>0)!;expect(light.target.position.clone().sub(light.position).normalize().z).toBeCloseTo(1);
    players[1].friendsFlashlight=undefined;f.lamps.update(players,'self',f.camera,150,16,()=>false);f.render();
    expect(f.lights.every(l=>l.intensity===0&&l.visible)).toBe(true);expect(f.renderer.shadowMap.needsUpdate).toBe(false);
    players[1].angle=0;players[1].friendsFlashlight={pitch:.4,cone:1,yaw:Math.PI/2};
    f.lamps.update(players,'self',f.camera,300,16,()=>false);f.render();
    expect(f.lights.find(l=>l.intensity>0)).toBe(light);expect(light.angle).toBe(FRIENDS_FLASHLIGHT_MAX_ANGLE);
    expect(light.target.position.clone().sub(light.position).normalize().y).toBeCloseTo(Math.sin(.4));
    expect(light.target.position.clone().sub(light.position).normalize().z).toBeCloseTo(Math.cos(.4));
    f.lamps.dispose();expect(f.scene.children).toHaveLength(0);
  });

  it('stagger-refreshes at most one remote shadow per display frame, then skips all off work',()=>{
    const f=fixture(),players=Array.from({length:4},(_,i)=>actor(`guest-${i}`));f.warm();
    let updates=0;
    for(let frame=0;frame<60;frame++){
      f.lamps.update(players,'self',f.camera,frame*1000/60,16,()=>false);
      const before=vi.mocked(f.renderer.shadowMap.render).mock.calls.length;f.render();
      const refreshed=vi.mocked(f.renderer.shadowMap.render).mock.calls.length-before;expect(refreshed).toBeLessThanOrEqual(1);updates+=refreshed;
    }
    expect(updates).toBeLessThanOrEqual(40);expect(f.lights.every(l=>l.intensity>0)).toBe(true);
    for(const p of players)p.friendsFlashlight=undefined;
    for(let frame=0;frame<60;frame++){
      f.lamps.update(players,'self',f.camera,1100+frame*16,16,()=>false);f.render();expect(f.renderer.shadowMap.needsUpdate).toBe(false);
    }
    f.lamps.dispose();
  });

  it('adds a bounded flare/veil only with eye contact and an unblocked line of sight, with fast recovery',()=>{
    const f=fixture(),blocked=vi.fn(()=>false),p=actor('guest');f.warm();
    for(let i=0;i<30;i++)f.lamps.update([p],'self',f.camera,i*16,16,blocked);
    expect(f.lamps.presentation.glare).toBeGreaterThan(.5);expect(f.lamps.presentation.glare).toBeLessThan(1);
    expect(f.lamps.presentation.flares.some(v=>v.z>0)).toBe(true);expect(blocked.mock.calls.length).toBeLessThanOrEqual(7);
    // A placed wall invalidates occlusion immediately, before its next sample.
    f.lamps.update([p],'self',f.camera,480,16,()=>true,'wall-placed');
    expect(f.lamps.presentation.flares.every(v=>v.z===0)).toBe(true);
    for(let i=1;i<=40;i++)f.lamps.update([p],'self',f.camera,480+i*16,16,()=>true,'wall-placed');
    expect(f.lamps.presentation.glare).toBeLessThan(.01);
    f.camera.lookAt(0,26,100);f.camera.updateMatrixWorld(true);
    f.lamps.update([p],'self',f.camera,1300,16,blocked,'clear');expect(f.lamps.presentation.flares.every(v=>v.z===0)).toBe(true);
    f.lamps.update([p],'self',f.camera,1400,16,blocked,'clear',false);expect(f.lamps.presentation.glare).toBe(0);
    f.lamps.dispose();
  });

  it('bounds mobile shadow resolution and releases joined/departed slots without adding lights',()=>{
    const f=fixture(true);expect(f.lights.every(l=>l.shadow.mapSize.x===256)).toBe(true);f.warm();
    f.lamps.update([actor('guest')],'self',f.camera,0,16,()=>false);f.render();
    f.lamps.update([],'self',f.camera,100,16,()=>false);f.render();expect(f.lights.every(l=>l.intensity===0)).toBe(true);
    f.lamps.update([actor('late')],'self',f.camera,200,16,()=>false);f.render();expect(f.lights.filter(l=>l.intensity>0)).toHaveLength(1);
    expect(f.scene.children.filter(o=>o instanceof THREE.SpotLight)).toHaveLength(4);
    f.lamps.dispose();f.lamps.dispose();expect(f.scene.children).toHaveLength(0);
  });

  it('shares live atlas uniforms across material clones and restores renderer state after a failed shadow draw',()=>{
    const f=fixture();f.warm();
    const cloned=THREE.UniformsUtils.clone(THREE.ShaderLib.standard.uniforms);
    expect(cloned.friendsFlashlightAtlas.value[0]).toBe(f.lights[0].shadow.map!.depthTexture);
    expect(cloned.friendsFlashlightShadowView.value).toBe(THREE.ShaderLib.standard.uniforms.friendsFlashlightShadowView.value);
    const destination=new THREE.WebGLRenderTarget(20,20);f.renderer.setRenderTarget(destination);
    const clear=f.renderer.clear,previous=f.scene.onAfterRender;
    f.lamps.update([actor('guest')],'self',f.camera,0,16,()=>false);
    vi.mocked(f.renderer.shadowMap.render).mockImplementationOnce(()=>{f.renderer.setRenderTarget(f.lights[0].shadow.map as THREE.WebGLRenderTarget);f.renderer.clear();throw new Error('failed shadow');});
    expect(()=>f.render()).toThrow('failed shadow');expect(f.renderer.clear).toBe(clear);
    expect(f.renderer.getRenderTarget()).toBe(destination);expect(f.renderer.setViewport).toHaveBeenLastCalledWith(new THREE.Vector4(0,0,960,540));
    expect(f.renderer.setScissorTest).toHaveBeenLastCalledWith(false);
    expect(f.renderer.shadowMap.needsUpdate).toBe(false);
    f.lamps.dispose();expect(f.scene.onAfterRender).not.toBe(previous);destination.dispose();
  });
});
