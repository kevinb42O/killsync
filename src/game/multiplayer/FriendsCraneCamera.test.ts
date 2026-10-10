import {describe,it,expect} from 'vitest';
import {craneCameraPose,dragCraneCamera,DEFAULT_CRANE_CAMERA,CRANE_CAMERA_MIN_ELEVATION,CRANE_CAMERA_MAX_ELEVATION} from './FriendsCraneCamera';
import type {FriendsCraneState} from './FriendsCrane';
const crane:FriendsCraneState={pieceId:1,x:10000,y:10000,z:1000,rotation:0,mastExtension:400,boomExtension:300,length:100,mode:'hold',blocked:false};
describe('crane drag camera',()=>{
  it('orbits both ways and tilts both ways without changing focus or zoom',()=>{
    const right=dragCraneCamera(DEFAULT_CRANE_CAMERA,80,0),left=dragCraneCamera(DEFAULT_CRANE_CAMERA,-80,0),up=dragCraneCamera(DEFAULT_CRANE_CAMERA,0,-80),down=dragCraneCamera(DEFAULT_CRANE_CAMERA,0,80);
    expect(right.orbit).toBeLessThan(DEFAULT_CRANE_CAMERA.orbit);expect(left.orbit).toBeGreaterThan(DEFAULT_CRANE_CAMERA.orbit);
    expect(up.elevation).toBeGreaterThan(DEFAULT_CRANE_CAMERA.elevation!);expect(down.elevation).toBeLessThan(DEFAULT_CRANE_CAMERA.elevation!);
    const original=craneCameraPose(crane,undefined,DEFAULT_CRANE_CAMERA),raised=craneCameraPose(crane,undefined,up);
    expect(raised.target).toEqual(original.target);expect(raised.distance).toBe(original.distance);expect(raised.eye.z).toBeGreaterThan(original.eye.z);
    const radius=(p:typeof original)=>Math.hypot(p.eye.x-p.target.x,p.eye.y-p.target.y,p.eye.z-p.target.z);expect(radius(raised)).toBeCloseTo(radius(original),8);
  });
  it('bounds elevation before the poles and wraps horizontal movement continuously',()=>{
    expect(dragCraneCamera(DEFAULT_CRANE_CAMERA,0,-10000).elevation).toBe(CRANE_CAMERA_MAX_ELEVATION);
    expect(dragCraneCamera(DEFAULT_CRANE_CAMERA,0,10000).elevation).toBe(CRANE_CAMERA_MIN_ELEVATION);
    const a=dragCraneCamera({...DEFAULT_CRANE_CAMERA,orbit:-Math.PI+.01},10,0);expect(a.orbit).toBeGreaterThan(3);
    for(const mode of ['load','overview'] as const){const pose=craneCameraPose(crane,undefined,{...a,mode});expect([pose.eye.x,pose.eye.y,pose.eye.z]).toSatisfy((n:number[])=>n.every(Number.isFinite));}
  });
  it('keeps a far-zoomed downward camera above the ground instead of enforcing an unsafe minimum distance',()=>{
    const low={...crane,z:0,mastExtension:0,boomExtension:0,length:110},options={...dragCraneCamera(DEFAULT_CRANE_CAMERA,0,10000),distance:12000};
    const pose=craneCameraPose(low,undefined,options,(target,eye)=>eye.z<0?Math.hypot(eye.x-target.x,eye.y-target.y,eye.z-target.z)*target.z/(target.z-eye.z):undefined);
    expect(pose.eye.z).toBeGreaterThan(0);expect(pose.distance).toBeLessThan(100);
  });
  it('keeps the chosen manual orbit at obstructions instead of switching to another side',()=>{
    const options=dragCraneCamera(DEFAULT_CRANE_CAMERA,80,-40);let queries=0;
    const clear=craneCameraPose(crane,undefined,options),blocked=craneCameraPose(crane,undefined,options,()=>{queries++;return 90;});
    expect(queries).toBe(1);expect(blocked.distance).toBeLessThan(clear.distance);
    expect(Math.atan2(blocked.eye.y-blocked.target.y,blocked.eye.x-blocked.target.x)).toBeCloseTo(options.orbit,6);
  });
});
