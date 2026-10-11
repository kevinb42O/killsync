import { describe,it,expect } from 'vitest';
import * as THREE from 'three';
import { FriendsFishingBobber } from './FriendsFishingBobber';

describe('hanging fishing bobber',()=>{
  it('hangs at a fixed length, lags movement and settles after stopping',()=>{
    const bobber=new FriendsFishingBobber(),tip=new THREE.Vector3(0,2,0),carrier=new THREE.Vector3();
    bobber.update(tip,carrier,.7,16);
    expect(bobber.position.y).toBeCloseTo(1.3);
    for(let i=0;i<30;i++){tip.x+=.01;bobber.update(tip,carrier,.7,16);expect(bobber.position.distanceTo(tip)).toBeCloseTo(.7,8);}
    expect(Math.abs(bobber.direction.x)).toBeGreaterThan(.02);
    for(let i=0;i<600;i++)bobber.update(tip,carrier,.7,16);
    expect(bobber.direction.y).toBeCloseTo(-1,5);
    expect(Math.abs(bobber.direction.x)).toBeLessThan(.001);
  });
  it('responds consistently across frame rates and bounds hitches and teleports',()=>{
    const directions=[];
    for(const hz of [30,60,144]){
      const bobber=new FriendsFishingBobber(),tip=new THREE.Vector3(0,2,0),carrier=new THREE.Vector3();
      bobber.update(tip,carrier,.7,1000/hz);
      for(let i=1;i<=hz*2;i++){tip.x=Math.sin(i/hz*3)*.15;bobber.update(tip,carrier,.7,1000/hz);}
      directions.push(bobber.direction.clone());
      tip.set(1000,-100,500);bobber.update(tip,carrier,.7,5000);
      expect(bobber.position.distanceTo(tip)).toBeCloseTo(.7,8);
      expect(bobber.direction.y).toBe(-1);
      bobber.update(tip,carrier,.7,0);expect(bobber.position.toArray().every(Number.isFinite)).toBe(true);
    }
    expect(directions[0].distanceTo(directions[2])).toBeLessThan(.04);
  });
  it('scales first-person walking while preserving rotation around the camera',()=>{
    const bobber=new FriendsFishingBobber(),tip=new THREE.Vector3(0,2,-1),camera=new THREE.Vector3();
    bobber.update(tip,camera,.7,16,1/32);
    for(let i=0;i<30;i++){camera.x+=.32;tip.x+=.32;bobber.update(tip,camera,.7,16,1/32);}
    expect(Math.abs(bobber.direction.x)).toBeGreaterThan(.02);
    expect(bobber.direction.y).toBeLessThan(-.8);
    tip.x+=.1;bobber.update(tip,camera,.7,16,1/32);
    expect(bobber.direction.x).toBeLessThan(-.1);
  });
});
