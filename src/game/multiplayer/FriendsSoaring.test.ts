import { describe,it,expect } from 'vitest';
import { createSoaringState,advanceFriendsSoaring,interpolateSoaringState } from './FriendsSoaring';
import { advancePlayerMovement,type PlayerMotionState,type PlayerMovementEnvironment } from './playerMovement';
import { MULTIPLAYER_PROTOCOL_VERSION,clampInputFrame,type MultiplayerInputFrame } from './protocol';
import { sampleSoaringAir,soaringWind,soaringAtmosphere } from '../world/FriendsSoaringWeather';
const input=(extra:Partial<MultiplayerInputFrame>={}):MultiplayerInputFrame=>({type:'input',version:MULTIPLAYER_PROTOCOL_VERSION,sequence:1,clientTime:0,movement:0,aimAngle:0,aimPitch:32767,selectedSlot:0,firing:false,sprinting:false,sliding:false,reviving:false,jumpPressed:false,dashPressed:false,friendsGlider:true,...extra});
const player=(extra:Partial<PlayerMotionState>={}):PlayerMotionState=>({x:1000,y:1000,z:1200,angle:0,sprinting:false,sliding:false,crouching:false,verticalVelocity:0,lastJumpSequence:-1,slideAngle:0,...extra});
const env=(height=(x:number,y:number)=>0):PlayerMovementEnvironment=>({elevationAware:true,volumetric:true,ceiling:10000,soaring:{timeMs:0,height}});
function fly(p:PlayerMotionState,frame=input(),duration=10,e=env()){
  for(let t=0;t<duration;t+=1/120){e.soaring.timeMs=t*1000;advanceFriendsSoaring(p,frame,1/120,e,undefined,q=>e.soaring.height(q.x,q.y));}
}
const airborne=()=>{const p=player();p.friendsSoaring={...createSoaringState(0),phase:'flying',inflation:1,airspeed:9.5};return p;};
describe('soaring airflow',()=>{
  it('creates windward lift, lee sink and altitude falloff without voxel spikes',()=>{
    const slope=(x:number)=>x*.8;
    const near=sampleSoaringAir(1000,1000,850,0,slope),high=sampleSoaringAir(1000,1000,3200,0,slope);
    expect(near.ridge).toBeGreaterThan(2);expect(high.ridge).toBeLessThan(near.ridge*.2);
    expect(sampleSoaringAir(1000,1000,850,0,x=>1600-x*.8).ridge).toBeLessThan(-1);
    expect(sampleSoaringAir(1000,1000,0,0,slope).up).toBe(0);
  });
  it('respects the shared night preset and zero wind without NaN or phantom ridge lift',()=>{
    const environment={enabled:true,speed:0,resumeSpeed:1,windSpeed:0,timeAnchor:900000,sourceAnchor:0,windAnchor:0,windSourceAnchor:0};
    const atmosphere=soaringAtmosphere(1000,1000,environment),air=sampleSoaringAir(1000,1000,850,1000,x=>x*.8,atmosphere);
    expect(air.x).toBe(0);expect(air.y).toBe(0);expect(air.ridge).toBe(0);expect(air.up).toBeCloseTo(0,6);expect(Number.isFinite(air.turbulence)).toBe(true);
  });
  it('deploys in the air with an inflation delay and preserves a descending flight',()=>{
    const p=player({verticalVelocity:-40}),e=env();
    for(let i=0;i<50;i++)advanceFriendsSoaring(p,input(),1/120,e,undefined,()=>0);
    expect(p.friendsSoaring.phase).toBe('inflating');expect(p.z).toBeLessThan(1200);expect(p.verticalVelocity).toBeLessThan(0);
    for(let i=0;i<100;i++)advanceFriendsSoaring(p,input(),1/120,e,undefined,()=>0);
    expect(p.friendsSoaring.phase).toBe('flying');expect(p.verticalVelocity).toBeLessThan(0);
  });
  it('has a drifting thermal core that weakens away from the column and at night',()=>{
    const time=120000,wind=soaringWind(time),altitude=100,tilt=altitude*.22+120*.12;
    const x=13200+wind.x*tilt*12,y=8800+wind.y*tilt*12;
    const core=sampleSoaringAir(x,y,altitude*12,time,()=>0);
    const outside=sampleSoaringAir(x+3600,y,altitude*12,time,()=>0);
    const night=sampleSoaringAir(x,y,altitude*12,time,()=>0,{dayTimeMs:900000,windTimeMs:time,windScale:1});
    expect(core.thermal).toBeGreaterThan(3);expect(outside.thermal).toBeLessThan(.5);expect(night.thermal).toBeCloseTo(0,5);
  });
  it('is deterministic and includes finite volcanic lift',()=>{
    const a=sampleSoaringAir(34240,33792,100,0,()=>0);
    expect(a).toEqual(sampleSoaringAir(34240,33792,100,0,()=>0));expect(a.thermal).toBeGreaterThan(3);
    expect(sampleSoaringAir(34240,33792,9000,0,()=>0).thermal).toBe(0);
  });
});
describe('paraglider flight',()=>{
  it('sinks in still vertical air and moves without held forward input',()=>{
    const p=airborne();fly(p);expect(p.z).toBeLessThan(1150);expect(p.x).toBeGreaterThan(2000);expect(p.friendsSoaring.phase).toBe('flying');
  });
  it('keeps camera look independent of wing heading and steering',()=>{
    const p=airborne();fly(p,input({aimAngle:32768}),2);expect(p.angle).toBeCloseTo(Math.PI,3);expect(p.friendsSoaring.heading).toBe(0);
    fly(p,input({movement:8}),3);expect(p.friendsSoaring.bank).toBeGreaterThan(.5);expect(p.friendsSoaring.heading).toBeGreaterThan(1);
  });
  it('climbs in windward lift and sinks when returning to flat air',()=>{
    const p=airborne();p.friendsSoaring.heading=Math.PI/2;p.z=850;const e=env(x=>x*.8);fly(p,input({aimAngle:0}),2,e);expect(p.friendsSoaring.climb).toBeGreaterThan(1);
    fly(p,input(),5,env());expect(p.friendsSoaring.climb).toBeLessThan(-.8);
  });
  it('penalizes tight turns and speeding up',()=>{
    const a=airborne(),b=airborne();fly(a,input(),4);fly(b,input({movement:8}),4);expect(b.friendsSoaring.sink).toBeGreaterThan(a.friendsSoaring.sink+.4);
    const fast=airborne();fly(fast,input({sprinting:true}),4);expect(fast.friendsSoaring.airspeed).toBeGreaterThan(13);expect(fast.friendsSoaring.sink).toBeGreaterThan(1.6);
  });
  it('stalls after prolonged deep brake, then recovers when released',()=>{
    const p=airborne();fly(p,input({jetHeld:true}),5);expect(p.friendsSoaring.message).toContain('STALL');expect(p.friendsSoaring.sink).toBeGreaterThan(5);
    fly(p,input(),4);expect(p.friendsSoaring.stall).toBe(0);expect(p.friendsSoaring.airspeed).toBeGreaterThan(9);
  });
  it('never cuts the wing because equipment input stops or goes stale',()=>{
    const p=airborne();fly(p,input({friendsGlider:false}),2);expect(p.friendsSoaring.phase).toBe('flying');
    advanceFriendsSoaring(p,undefined,.05,env(),undefined,()=>0);expect(p.friendsSoaring.phase).toBe('flying');
  });
  it('lands, stays landed, and requires stowing before another launch',()=>{
    const p=airborne();p.z=20;p.verticalVelocity=-18;fly(p,input(),4);expect(p.z).toBe(0);expect(p.friendsSoaring.phase).toBe('landed');
    advanceFriendsSoaring(p,input({friendsGlider:false}),.01,env(),undefined,()=>0);expect(p.friendsSoaring).toBeUndefined();
  });
  it('requires overhead clearance and refuses near-ground air deployment',()=>{
    const p=player({z:0});advanceFriendsSoaring(p,input(),.05,{...env(),overhead:()=>80},undefined,()=>0);expect(p.friendsSoaring).toBeUndefined();
    p.z=60;advanceFriendsSoaring(p,input(),.05,env(),undefined,()=>0);expect(p.friendsSoaring).toBeUndefined();
  });
  it('inflates before launching and refuses a tailwind launch',()=>{
    const height=(x:number)=>x*.8,p=player({z:800,velocityX:-180});const e=env(height),f=input({aimAngle:32768,movement:1});
    advanceFriendsSoaring(p,f,1,e,undefined,q=>height(q.x));expect(p.friendsSoaring.phase).toBe('inflating');
    advanceFriendsSoaring(p,f,1,e,undefined,q=>height(q.x));expect(p.friendsSoaring.phase).toBe('flying');
    const bad=player({z:800,velocityX:180});advanceFriendsSoaring(bad,input({movement:1}),2,e,undefined,q=>height(q.x));expect(bad.friendsSoaring.phase).toBe('ready');expect(bad.friendsSoaring.message).toContain('into wind');
  });
  it('preparation disables normal jump and jet thrust',()=>{
    const p=player({z:0});advancePlayerMovement(p,input({jumpPressed:true,jetHeld:true}),33,undefined,undefined,()=>0,'friends_frontier',env());expect(p.z).toBe(0);expect(p.jetActive).toBe(false);
  });
  it('stows on water entry and resolves terrain impacts without tunnelling',()=>{
    const p=airborne();p.z=10;p.verticalVelocity=-40;advanceFriendsSoaring(p,input(),.5,{...env(),waterAt:()=>({level:0})},undefined,()=>-100);expect(p.z).toBe(0);expect(p.friendsSoaring).toBeUndefined();
    const q=airborne();advanceFriendsSoaring(q,input(),.05,env(),position=>position.x>1003,()=>0);expect(q.x).toBeLessThanOrEqual(1003);expect(q.friendsSoaring.phase).toBe('collapsed');
  });
  it('sanitizes equipment intent and interpolates heading over the wrap',()=>{
    expect(clampInputFrame(input({friendsGlider:true})).friendsGlider).toBe(true);
    const a={...createSoaringState(3.1),phase:'flying' as const},b={...a,heading:-3.1};expect(Math.abs(interpolateSoaringState(a,b,.5).heading)).toBeCloseTo(Math.PI,3);
  });
});
