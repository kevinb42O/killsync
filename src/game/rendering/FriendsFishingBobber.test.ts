import { describe,it,expect } from 'vitest';
import * as THREE from 'three';
import { FriendsFishingBobber, FISHING_BOBBER_WALK_SCALE as WALK, FISHING_BOBBER_TIP_SCALE as LOOK } from './FriendsFishingBobber';

describe('hanging fishing bobber',()=>{
  it('hangs at a fixed length, lags movement and settles after stopping',()=>{
    const bobber=new FriendsFishingBobber(),tip=new THREE.Vector3(0,2,0),carrier=new THREE.Vector3();
    bobber.update(tip,carrier,.7,16);
    expect(bobber.position.y).toBeCloseTo(1.3);
    for(let i=0;i<30;i++){tip.x+=.01;bobber.update(tip,carrier,.7,16);expect(bobber.position.distanceTo(tip)).toBeCloseTo(.7,8);}
    expect(Math.abs(bobber.direction.x)).toBeGreaterThan(.02);
    // Light damping leaves time to play with the swing before it settles.
    for(let i=0;i<1200;i++)bobber.update(tip,carrier,.7,16);
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
  it('lets circular rod motion pump complete loops consistently across frame rates',()=>{
    const results=[];
    for(const hz of [30,60,144]){
      const bobber=new FriendsFishingBobber(),tip=new THREE.Vector3(0,2,0),carrier=new THREE.Vector3();
      bobber.update(tip,carrier,.7,1000/hz);
      let previousAngle=0,rotation=0,highest=-1;
      for(let i=1;i<=hz*4;i++){
        const phase=i/hz*7;
        tip.set(.8*Math.sin(phase),2+.8*(1-Math.cos(phase)),0);
        bobber.update(tip,carrier,.7,1000/hz);
        expect(bobber.position.distanceTo(tip)).toBeCloseTo(.7,8);
        const angle=Math.atan2(bobber.direction.x,-bobber.direction.y);
        rotation+=THREE.MathUtils.euclideanModulo(angle-previousAngle+Math.PI,2*Math.PI)-Math.PI;
        previousAngle=angle;highest=Math.max(highest,bobber.direction.y);
      }
      expect(highest).toBeGreaterThan(.99);
      expect(rotation).toBeGreaterThan(Math.PI*6);
      results.push(bobber.direction.clone());
    }
    expect(results[0].distanceTo(results[2])).toBeLessThan(.05);
  });
  it('responds to forward/backward and strafe reversals without losing momentum on release',()=>{
    for(const axis of ['x','z'] as const){
      const bobber=new FriendsFishingBobber(),tip=new THREE.Vector3(0,2,-1),carrier=new THREE.Vector3();
      bobber.update(tip,carrier,.7,16,1/32);
      for(let i=0;i<8;i++){tip[axis]+=2.88;carrier[axis]+=2.88;bobber.update(tip,carrier,.7,16,1/32);}
      expect(bobber.direction[axis]).toBeLessThan(-.5);
      for(let i=0;i<30;i++){tip[axis]-=2.88;carrier[axis]-=2.88;bobber.update(tip,carrier,.7,16,1/32);}
      expect(bobber.direction[axis]).toBeGreaterThan(.5);
      const released=bobber.direction.clone();
      for(let i=0;i<10;i++)bobber.update(tip,carrier,.7,16,1/32);
      expect(bobber.direction.distanceTo(released)).toBeGreaterThan(.2);
    }
  });
  it('does not consume a mouse flick during a zero-time render',()=>{
    const bobbers=[new FriendsFishingBobber(),new FriendsFishingBobber()],tip=new THREE.Vector3(0,2,-1),carrier=new THREE.Vector3();
    for(const b of bobbers)b.update(tip,carrier,.7,16);
    tip.x+=.2;
    bobbers[0].update(tip,carrier,.7,0);
    for(const b of bobbers)b.update(tip,carrier,.7,16);
    expect(bobbers[0].direction.distanceTo(bobbers[1].direction)).toBeLessThan(1e-8);
  });
  it('keeps everyday mouse turns restrained while allowing deliberate pumping',()=>{
    const peaks=[];
    for(const mode of ['turn','flick','pump']){
      const bobber=new FriendsFishingBobber(),carrier=new THREE.Vector3(),rest=new THREE.Vector3(1,1,-2),tip=rest.clone();
      bobber.update(tip,carrier,.72,1000/60,WALK,LOOK);
      let peak=0;
      for(let i=1;i<=360;i++){
        const t=i/60,yaw=mode==='turn'?.15*Math.min(t/.15,1):mode==='flick'?.35*Math.min(t/.05,1):.65*Math.sin(t*7);
        const pitch=mode==='pump'?.65*(1-Math.cos(t*7)):0;
        tip.copy(rest).applyEuler(new THREE.Euler(pitch,yaw,0,'YXZ'));
        bobber.update(tip,carrier,.72,1000/60,WALK,LOOK);
        peak=Math.max(peak,Math.acos(THREE.MathUtils.clamp(-bobber.direction.y,-1,1)));
      }
      peaks.push(peak);
    }
    // A normal ~9-degree look adjustment should not launch the bobber.
    expect(peaks[0]).toBeGreaterThan(.02);expect(peaks[0]).toBeLessThan(.22);
    expect(peaks[1]).toBeGreaterThan(peaks[0]);expect(peaks[1]).toBeLessThan(.5);
    expect(peaks[2]).toBeGreaterThan(Math.PI/2);
  });
  it('lags signed keyboard and mouse movement correctly at every heading and pitch',()=>{
    for(const yaw of [0,Math.PI/2,Math.PI,-Math.PI/2])for(const pitch of [-1,0,1])for(const input of ['strafe','forward','yaw','pitch'])for(const sign of [-1,1]){
      const bobber=new FriendsFishingBobber(),carrier=new THREE.Vector3(14000,40,23000),rest=new THREE.Vector3(1,1,-2);
      const orientation=new THREE.Euler(pitch,yaw,0,'YXZ');
      const tip=rest.clone().applyEuler(orientation).add(carrier);
      bobber.update(tip,carrier,.72,1000/60,WALK,LOOK);
      const initialTip=tip.clone(),initialCarrier=carrier.clone();
      if(input==='strafe'||input==='forward'){
        const step=new THREE.Vector3(input==='strafe'?sign:0,0,input==='forward'?-sign:0).applyAxisAngle(new THREE.Vector3(0,1,0),yaw);
        carrier.add(step);tip.add(step);
      }else{
        if(input==='yaw')orientation.y+=sign*.025;else orientation.x+=sign*.025;
        tip.copy(rest).applyEuler(orientation).add(carrier);
      }
      const translation=carrier.clone().sub(initialCarrier),motion=tip.clone().sub(initialTip).sub(translation).multiplyScalar(LOOK).addScaledVector(translation,WALK);
      // Inertial deflection opposes the support's horizontal motion. At steep
      // pitch, test the projected tangent rather than a camera-space guess.
      motion.y=0;
      bobber.update(tip,carrier,.72,1000/60,WALK,LOOK);
      expect(new THREE.Vector3(bobber.direction.x,0,bobber.direction.z).dot(motion)).toBeLessThan(0);
      expect(bobber.direction.y).toBeLessThan(-.99);
    }
  });
  it('does not rotate existing momentum when only the camera heading changes',()=>{
    const bobbers=[new FriendsFishingBobber(),new FriendsFishingBobber()],carrier=new THREE.Vector3(),tip=new THREE.Vector3(1,1,-2);
    for(const b of bobbers)b.update(tip,carrier,.72,16,WALK,0);
    for(let i=0;i<10;i++){carrier.x+=2;tip.x+=2;for(const b of bobbers)b.update(tip,carrier,.72,16,WALK,0);}
    const turned=tip.clone().sub(carrier).applyAxisAngle(new THREE.Vector3(0,1,0),Math.PI/2).add(carrier);
    // With look forcing disabled, a view change contributes zero impulse.
    for(let i=0;i<30;i++){
      bobbers[0].update(tip,carrier,.72,16,WALK,0);bobbers[1].update(turned,carrier,.72,16,WALK,0);
      expect(bobbers[0].direction.distanceTo(bobbers[1].direction)).toBeLessThan(1e-8);
    }
  });
  it('keeps the combined walking/look response stable at low and high render rates',()=>{
    const results=[];
    for(const hz of [20,30,60,144,240]){
      const bobber=new FriendsFishingBobber(),carrier=new THREE.Vector3(),tip=new THREE.Vector3(1,1,-2);
      bobber.update(tip,carrier,.72,1000/hz,WALK,LOOK);
      for(let i=1;i<=hz*4;i++){
        const t=i/hz;carrier.set(12*Math.sin(t*3),0,7*Math.sin(t*2));
        tip.set(1,1,-2).applyEuler(new THREE.Euler(.15*Math.sin(t*3),.2*Math.sin(t*4),0,'YXZ')).add(carrier);
        bobber.update(tip,carrier,.72,1000/hz,WALK,LOOK);
      }
      results.push(bobber.direction.clone());
    }
    for(const result of results)expect(result.distanceTo(results.at(-1)!)).toBeLessThan(.04);
  });
});
