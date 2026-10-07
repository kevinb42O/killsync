import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { FriendsArrivalSequence, FriendsWorldArrival } from './FriendsWorldArrival';

describe('world arrival loading sequence',()=>{
  it('keeps the world holographic until streaming is ready and briefly settled',()=>{
    const sequence=new FriendsArrivalSequence();sequence.start();
    for(let i=0;i<70;i++)sequence.update(100,false);
    expect(sequence.stage).toBe('assembling');expect(sequence.reveal).toBe(0);
    sequence.update(100,true);expect(sequence.reveal).toBe(0);
    sequence.update(100,false);sequence.update(100,true);expect(sequence.reveal).toBe(0);
    sequence.update(100,true);expect(sequence.stage).toBe('materializing');
    for(let i=0;i<28;i++)sequence.update(100,true);
    expect(sequence.active).toBe(false);expect(sequence.stage).toBe('online');expect(sequence.reveal).toBe(1);
  });
  it('gives cached worlds the same reveal and has a bounded fallback for failed assets',()=>{
    const sequence=new FriendsArrivalSequence();sequence.start();
    for(let i=0;i<9;i++)sequence.update(100,true);
    expect(sequence.reveal).toBe(0);
    sequence.update(100,true);expect(sequence.reveal).toBeGreaterThan(0);
    sequence.start();expect(sequence.stage).toBe('linking');expect(sequence.reveal).toBe(0);
    for(let i=0;i<120;i++)sequence.update(100,false);
    expect(sequence.reveal).toBeGreaterThan(0);
    for(let i=0;i<28;i++)sequence.update(100,false);
    expect(sequence.active).toBe(false);
  });
});

function setup(){
  const arrival=new FriendsWorldArrival(),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(70,16/9,2,110000);
  let current:THREE.WebGLRenderTarget|null=null;
  let size=new THREE.Vector2(1280,720);
  const renderer={autoClear:false,getDrawingBufferSize:(out:THREE.Vector2)=>out.copy(size),getRenderTarget:()=>current,setRenderTarget:(target:THREE.WebGLRenderTarget|null)=>{current=target;},render:vi.fn()} as unknown as THREE.WebGLRenderer;
  return {arrival,scene,camera,renderer,resize:()=>{size.set(1920,1080);}};
}
describe('world materialization rendering',()=>{
  it('precompiles the HDR, wire, and final passes once and restores the target before awaiting shaders',async()=>{
    const {arrival,scene,camera,renderer}=setup();
    const original=new THREE.WebGLRenderTarget(100,100);renderer.setRenderTarget(original);
    const targets:(THREE.WebGLRenderTarget|null)[]=[];
    Object.assign(renderer,{info:{programs:[]},extensions:{get:()=>null}});
    renderer.compile=vi.fn(()=>{targets.push(renderer.getRenderTarget());return new Set<THREE.Material>();});
    const ready=arrival.prepare(renderer,scene,camera);
    expect(renderer.getRenderTarget()).toBe(original);
    await ready;await arrival.prepare(renderer,scene,camera);
    expect(renderer.compile).toHaveBeenCalledTimes(3);
    expect(targets[0]).toBe(arrival['image']);expect(targets.slice(1)).toEqual([original,original]);
    arrival.dispose();original.dispose();
  });
  it('preserves scene and renderer state, resizes captures, and releases them on completion',()=>{
    const {arrival,scene,camera,renderer,resize}=setup();
    const originalTarget=new THREE.WebGLRenderTarget(100,100),background=new THREE.Color('#aacbbc'),fog=new THREE.FogExp2('#aacbbc',.00001);
    renderer.setRenderTarget(originalTarget);scene.background=background;scene.fog=fog;
    const sky=new THREE.Mesh();sky.name='frontier-day-night-sky';scene.add(sky);
    const hiddenClouds=new THREE.Group();hiddenClouds.name='frontier-volumetric-cumulus';hiddenClouds.visible=false;scene.add(hiddenClouds);
    expect(arrival.render(renderer,scene,camera)).toBe(false);expect(renderer.render).not.toHaveBeenCalled();
    arrival.start(5900,5710,736);arrival.update(100,{ready:false,progress:0});
    expect(arrival.render(renderer,scene,camera)).toBe(true);
    expect(renderer.render).toHaveBeenCalledTimes(3);expect(renderer.getRenderTarget()).toBe(originalTarget);expect(renderer.autoClear).toBe(false);
    expect(scene.background).toBe(background);expect(scene.fog).toBe(fog);expect(scene.overrideMaterial).toBeNull();expect(sky.visible).toBe(true);expect(hiddenClouds.visible).toBe(false);
    const image=arrival['image']!,released=vi.fn();image.addEventListener('dispose',released);
    resize();arrival.render(renderer,scene,camera);expect(arrival['image']).toBe(image);expect(image.width).toBe(1600);expect(image.height).toBe(900);
    for(let i=0;i<45;i++)arrival.update(100,{ready:true,progress:1});
    expect(released).toHaveBeenCalled();expect(arrival['image']).toBeUndefined();expect(arrival['wire']).toBeUndefined();
    expect(arrival.render(renderer,scene,camera)).toBe(false);arrival.dispose();originalTarget.dispose();
  });
  it('restores scene materials and visibility if the wire pass fails',()=>{
    const {arrival,scene,camera,renderer}=setup();const original=new THREE.MeshNormalMaterial();scene.overrideMaterial=original;
    const sky=new THREE.Mesh();sky.name='frontier-day-night-sky';scene.add(sky);
    vi.mocked(renderer.render).mockImplementationOnce(()=>{}).mockImplementationOnce(()=>{throw new Error('capture interrupted');});
    arrival.start(5900,5710,736);expect(()=>arrival.render(renderer,scene,camera)).toThrow('capture interrupted');
    expect(scene.overrideMaterial).toBe(original);expect(sky.visible).toBe(true);expect(renderer.getRenderTarget()).toBeNull();expect(renderer.autoClear).toBe(false);
    arrival.dispose();original.dispose();
  });
});
