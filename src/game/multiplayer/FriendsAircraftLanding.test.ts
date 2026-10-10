import { describe, expect, it } from 'vitest';
import { FriendsExpedition } from './FriendsExpedition';
import { FriendsTerrain } from '../world/FriendsTerrain';
import { aircraftDescentSpeed, FriendsAircraftLanding } from './FriendsAircraftLanding';
import { MULTIPLAYER_PROTOCOL_VERSION, type MultiplayerInputFrame } from './protocol';
const input=(extra:Partial<MultiplayerInputFrame>={}):MultiplayerInputFrame=>({type:'input',version:MULTIPLAYER_PROTOCOL_VERSION,sequence:1,clientTime:0,movement:0,aimAngle:0,aimPitch:32768,selectedSlot:0,firing:false,sprinting:false,sliding:true,reviving:false,jumpPressed:false,dashPressed:false,...extra});
function fixture() {
  const terrain=new FriendsTerrain();terrain.addGrade([8000,8000,0,512]);
  const e=new FriendsExpedition(),a=e['aircraft'];Object.assign(a,{x:8000,y:8000,z:240,pilotId:'host'});
  const p={id:'host',lifeState:'alive',x:8100,y:8000,z:240,verticalVelocity:0};
  let elapsed=0;const step=(extra:Partial<MultiplayerInputFrame>={},dt=25)=>{elapsed+=dt;e.update(dt,elapsed,[p],new Map([['host',input(extra)]]),[],terrain);};
  return {terrain,e,a,p,step};
}
describe('helicopter touchdown',()=>{
  it('settles on the entire footprint and remains stationary while descent stays held',()=>{
    const f=fixture();f.terrain.set(254,250,0,2);
    const descent:number[]=[];
    for(let i=0;i<240;i++){const z=f.a.z;f.step();descent.push(z-f.a.z);expect(f.a.x).toBe(8000);expect(f.a.y).toBe(8000);expect(f.a.z).toBeGreaterThanOrEqual(46);}
    expect(f.a.z).toBe(46);expect(f.a.groundZ).toBe(32);
    expect(descent[0]).toBe(7.5);expect(descent.some(d=>d>0&&d<.3)).toBe(true);
    expect(f.p.z).toBe(46);f.step({jetHeld:true});expect(f.a.z).toBe(53.5);
  });
  it('rejects a wall collision without shoving the craft, and never lifts onto a taller wall',()=>{
    const f=fixture();for(let z=0;z<12;z++)f.terrain.set(255,250,z,2);
    f.step({movement:1,sliding:false});expect(f.a.x).toBe(8000);expect(f.a.y).toBe(8000);expect(f.a.z).toBe(240);
  });
  it('invalidates stationary support after terrain is edited',()=>{
    const f=fixture(),landing=new FriendsAircraftLanding();expect(landing.floor(f.terrain,8000,8000,226)).toBe(0);
    f.terrain.set(254,250,0,2);expect(landing.floor(f.terrain,8000,8000,200)).toBe(32);
    f.terrain.set(254,250,0,0);expect(landing.floor(f.terrain,8000,8000,200)).toBe(0);
  });
  it('lands at different tick rates without bouncing or creeping',()=>{
    for(const dt of [16,50,100]){const f=fixture();for(let t=0;t<8000;t+=dt)f.step({},dt);expect(f.a.z).toBe(14);expect(f.a.x).toBe(8000);expect(f.a.y).toBe(8000);}
    expect(aircraftDescentSpeed(500)).toBe(300);expect(aircraftDescentSpeed(5)).toBe(12);
  });
});
