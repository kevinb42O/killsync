import { describe, expect, it } from 'vitest';
import { advancePlayerMovement, COOP_JET_HARD_CEILING, COOP_STEP_MS, type PlayerMotionState } from './playerMovement';
import { MULTIPLAYER_PROTOCOL_VERSION, type MultiplayerInputFrame } from './protocol';
const frame=(sequence:number):MultiplayerInputFrame=>({type:'input',version:MULTIPLAYER_PROTOCOL_VERSION,sequence,clientTime:0,movement:0,aimAngle:0,aimPitch:0,selectedSlot:0,firing:false,sprinting:false,sliding:false,reviving:false,jumpPressed:false,dashPressed:false,jetHeld:true});
const actor=(z:number):PlayerMotionState=>({x:5900,y:5620,z,angle:0,sprinting:false,sliding:false,crouching:false,verticalVelocity:0,lastJumpSequence:-1,slideAngle:0});
describe('Friends personal jetpack',()=>{
  it.each([0,128,3200,5900])('limits a boost to 150 above its launch surface at %i, with host and prediction sharing the rule',base=>{
    const p=actor(base),floor=()=>base,transport={elevationAware:true,ceiling:6000,stepHeight:18};let peak=base;
    for(let i=0;i<60;i++){advancePlayerMovement(p,frame(i),COOP_STEP_MS,undefined,undefined,floor,'friends_frontier',transport);peak=Math.max(peak,p.z);}
    expect(peak).toBeCloseTo(Math.min(6000,base+COOP_JET_HARD_CEILING));expect(p.jetLaunchFloor).toBe(base);
  });
  it('preserves a real fall off a high deck and lets a new ground landing reset the boost origin',()=>{
    const p=actor(4000);p.jetLaunchFloor=4000;
    advancePlayerMovement(p,undefined,COOP_STEP_MS,undefined,undefined,()=>0,'friends_frontier',{elevationAware:true,ceiling:6000});
    expect(p.z).toBeGreaterThan(3990);expect(p.z).toBeLessThan(4000);
    for(let i=0;i<100;i++)advancePlayerMovement(p,undefined,COOP_STEP_MS,undefined,undefined,()=>0,'friends_frontier',{elevationAware:true,ceiling:6000});
    expect(p.z).toBe(0);expect(p.jetLaunchFloor).toBe(0);
  });
});
