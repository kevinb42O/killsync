import { describe, expect, it } from 'vitest';
import { advancePlayerMovement, type PlayerMotionState } from './playerMovement';
import { MULTIPLAYER_PROTOCOL_VERSION, type MultiplayerInputFrame } from './protocol';
import { FRIENDS_RIVERS } from '../world/FriendsHydrology';
import { friendsWaterGround, friendsWaterLevel } from '../world/FriendsWaterSurface';

const input=(sequence:number,extra:Partial<MultiplayerInputFrame>={}):MultiplayerInputFrame=>({
  type:'input',version:MULTIPLAYER_PROTOCOL_VERSION,sequence,clientTime:0,movement:0,aimAngle:0,
  aimPitch:32768,selectedSlot:0,firing:false,sprinting:false,sliding:false,reviving:false,
  jumpPressed:false,dashPressed:false,...extra,
});
const actor=(extra:Partial<PlayerMotionState>={}):PlayerMotionState=>({x:12128,y:23600,z:130,
  angle:0,sprinting:false,sliding:false,crouching:false,verticalVelocity:0,lastJumpSequence:-1,slideAngle:0,...extra});
const move=(p:PlayerMotionState,command=input(1),ms=50,floor=(p:PlayerMotionState)=>friendsWaterGround(p.x,p.y))=>
  advancePlayerMovement(p,command,ms,undefined,undefined,floor,'friends_frontier',{elevationAware:true,volumetric:true,ceiling:6000,stepHeight:8});

describe('frontier swimming',()=>{
  it('recovers from deep water, floats without input and consumes no jet fuel',()=>{
    const p=actor({z:-350,verticalVelocity:-1000,sliding:true,jetActive:true,jetFuel:0});
    for(let i=0;i<60;i++)move(p,input(i));
    expect(p.z).toBeCloseTo(154.5-18,4);
    expect(p.verticalVelocity).toBe(0);
    expect(p.x).toBe(12128);expect(p.y).toBe(23600);
    expect(p.sliding).toBe(false);expect(p.jetActive).toBe(false);expect(p.jetFuel).toBeGreaterThan(0);
  });
  it('lets the player swim and applies a gentle downstream current',()=>{
    const point=FRIENDS_RIVERS[2].points.find(p=>p.distance>1200)!;
    const p=actor({...point,z:point.z-18}),start={x:p.x,y:p.y};
    move(p);
    expect((p.x-start.x)*point.tx+(p.y-start.y)*point.ty).toBeGreaterThan(0);
    const before=p.x;move(p,input(2,{movement:1}));expect(p.x).toBeGreaterThan(before+4);
    expect(friendsWaterLevel(p.x,p.y)).toBeDefined();
  });
  it('jumps out of the water once per press and preserves solid floor priority',()=>{
    const p=actor();move(p,input(2,{jumpPressed:true}));
    expect(p.z).toBeGreaterThan(154.5-12);expect(p.verticalVelocity).toBeGreaterThan(0);
    const velocity=p.verticalVelocity;move(p,input(2,{jumpPressed:true}));
    expect(p.verticalVelocity).toBeLessThan(velocity);expect(p.lastJumpSequence).toBe(2);
    const deck=actor({z:144});move(deck,input(1),50,()=>144);
    expect(deck.z).toBe(144);expect(deck.verticalVelocity).toBe(0);
  });
  it('produces the same movement for host ticks and split prediction ticks',()=>{
    const point=FRIENDS_RIVERS[1].points[300],host=actor({...point,z:point.z-18}),prediction={...host};
    for(let i=1;i<=30;i++){
      const command=input(i,{movement:9,sprinting:true});move(host,command,50);
      move(prediction,command,25);move(prediction,command,25);
    }
    expect(prediction.x).toBeCloseTo(host.x,7);expect(prediction.y).toBeCloseTo(host.y,7);expect(prediction.z).toBeCloseTo(host.z,7);
  });
});
