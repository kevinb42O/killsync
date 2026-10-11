import {describe,it,expect,vi} from 'vitest';
import * as THREE from 'three';
import {waterlineViewHeights,waterlineViewRange,FriendsWaterlineComposite} from './FriendsWaterlineComposite';
import {FriendsTerrain} from '../world/FriendsTerrain';
import {FriendsUnderwaterVisuals} from './FriendsUnderwaterVisuals';

function camera(y=154.5){const c=new THREE.PerspectiveCamera(68,1.5,2,15000);c.position.set(12128,y,23600);return c;}
function renderer(){
 let target:THREE.WebGLRenderTarget|null=null;
 return {autoClear:false,capabilities:{maxSamples:4},getRenderTarget:()=>target,setRenderTarget:vi.fn(t=>{target=t;}),
  getViewport:(v:THREE.Vector4)=>v.set(0,0,800,600),getScissor:(v:THREE.Vector4)=>v.set(0,0,800,600),getScissorTest:()=>false,
  setViewport:vi.fn(),setScissor:vi.fn(),setScissorTest:vi.fn(),getDrawingBufferSize:(v:THREE.Vector2)=>v.set(800,600),render:vi.fn()} as unknown as THREE.WebGLRenderer;
}
describe('waterline view composition',()=>{
 it('uses the projected near plane and follows roll and off-axis views',()=>{
  const c=camera(),h=waterlineViewHeights(c,154.5),range=waterlineViewRange(h);
  expect(h.y).toBeCloseTo(0);expect(range.min).toBeLessThan(0);expect(range.max).toBeGreaterThan(0);
  c.rotation.z=.4;c.setViewOffset(1200,800,120,80,1200,800);c.updateProjectionMatrix();
  const tilted=waterlineViewHeights(c,154.5);
  expect(Math.abs(tilted.y)).toBeGreaterThan(.1);
  for(const [x,y] of [[0,0],[1,0],[0,1],[1,1]]){
   const point=new THREE.Vector3(x*2-1,y*2-1,-1).unproject(c);
   expect(tilted.x+x*tilted.y+y*tilted.z).toBeCloseTo(point.y-154.5);
  }
 });
 it('renders dry and submerged scenes with their own fog, sky and effects',()=>{
  const scene=new THREE.Scene(),fog=new THREE.FogExp2('#b5cccf',.000015);scene.fog=fog;
  const sky=new THREE.Group();sky.name='frontier-day-night-sky';scene.add(sky);
  const effect=new FriendsUnderwaterVisuals(scene),c=camera(),r=renderer();
  effect.update(c,1000);const wetFog=scene.fog;
  const states:unknown[]=[];vi.mocked(r.render).mockImplementation(s=>{if(s===scene)states.push([scene.fog,sky.visible,effect.overlay.visible]);});
  expect(effect.render(r,c)).toBe(true);
  expect(states).toEqual([[fog,true,false],[wetFog,false,true]]);
  expect(scene.fog).toBe(wetFog);expect(sky.visible).toBe(false);expect(r.getRenderTarget()).toBeNull();expect(r.autoClear).toBe(false);
  effect.beginFrame();c.position.y=220;effect.update(c,1100);expect(effect.render(r,c)).toBe(false);expect(scene.fog).toBe(fog);expect(sky.visible).toBe(true);
  effect.dispose();
 });
 it('enables a submerged view even when the camera center is above the surface looking down',()=>{
  const scene=new THREE.Scene(),effect=new FriendsUnderwaterVisuals(scene),c=camera(155);
  c.rotation.x=-Math.PI/2;effect.update(c,1000);
  expect(effect.overlay.visible).toBe(true);expect(effect.render(renderer(),c)).toBe(false);effect.dispose();
 });
 it('keeps a dry camera below the natural bed out of underwater fog',()=>{
  const scene=new THREE.Scene(),fog=new THREE.FogExp2('#b5cccf',.000015);scene.fog=fog;
  const effect=new FriendsUnderwaterVisuals(scene),c=camera(-10000);
  effect.update(c,1000,true,1,new FriendsTerrain());
  expect(scene.fog).toBe(fog);expect(effect.overlay.visible).toBe(false);expect(effect.render(renderer(),c)).toBe(false);effect.dispose();
 });
 it('restores caller render state if a scene pass throws',()=>{
  const pass=new FriendsWaterlineComposite(),r=renderer(),target=new THREE.WebGLRenderTarget(400,300);r.setRenderTarget(target);
  expect(()=>pass.render(r,new THREE.Vector3(),()=>{throw Error('test');},()=>{},camera())).toThrow('test');
  expect(r.getRenderTarget()).toBe(target);expect(r.autoClear).toBe(false);pass.dispose();target.dispose();
 });
});
