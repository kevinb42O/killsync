import { FriendsRockCollisionCache,rockSurface } from '../world/FriendsRocks';
import { describe,it,expect } from 'vitest';
import { FriendsSimulation } from './FriendsSimulation';
import { quantizeAngle,quantizePitch,type CoopSnapshot } from './CoopSimulation';
import { MULTIPLAYER_PROTOCOL_VERSION,type MultiplayerInputFrame } from './protocol';
import { SOARING_LAUNCHES,soaringWind } from '../world/FriendsSoaringWeather';
import { LocalPlayerPrediction } from './LocalPlayerPrediction';
import { FriendsTerrain } from '../world/FriendsTerrain';
import { createSoaringState } from './FriendsSoaring';
import { interpolateCoopSnapshot,CoopSnapshotInterpolator } from './snapshotInterpolation';
import { worldDiff,worldPatch } from './FriendsWorldReplication';
const command=(n:number,heading:number,extra:Partial<MultiplayerInputFrame>={}):MultiplayerInputFrame=>({type:'input',version:MULTIPLAYER_PROTOCOL_VERSION,sequence:n,clientTime:n*1000/30,movement:0,aimAngle:quantizeAngle(heading),aimPitch:quantizePitch(0),selectedSlot:0,friendsTool:13,friendsGlider:true,firing:false,sprinting:false,sliding:false,reviving:false,jumpPressed:false,dashPressed:false,...extra});
const sim=()=>new FriendsSimulation([{id:'host',label:'Host',color:'#8de6ce'},{id:'guest',label:'Guest',color:'#ff8899'}]);
describe('shared soaring integration',()=>{
  for(const launch of SOARING_LAUNCHES)it(`foot-launches at ${launch.name} using real terrain and collisions`,()=>{
    const s=sim(),terrain=new FriendsTerrain(),p=s['players'].get('guest')!,heading=soaringWind(0).angle+Math.PI;
    Object.assign(p,{x:launch.x,y:launch.y,z:terrain.surfaceHeight(launch.x,launch.y),verticalVelocity:0,velocityX:0,velocityY:0});
    for(let n=1;n<=65;n++){s.setInput('guest',command(n,heading));s.tick(1000/30);}
    expect(p.friendsSoaring?.phase).toBe('ready');
    for(let n=66;n<=130&&p.friendsSoaring.phase!=='flying';n++){s.setInput('guest',command(n,heading,{movement:1}));s.tick(1000/30);}
    expect(p.friendsSoaring.phase).toBe('flying');expect(p.jetActive).toBe(false);
    for(let n=131;n<=220;n++){s.setInput('guest',command(n,heading));s.tick(1000/30);}
    expect(p.friendsSoaring.phase).toBe('flying');expect(p.friendsSoaring.agl).toBeGreaterThan(5);
  });
  it('predicts guest flight, preserves snapshots and replicates state removals',()=>{
    const s=sim(),p=s['players'].get('guest')!,launch=SOARING_LAUNCHES[0],terrain=new FriendsTerrain();
    Object.assign(p,{x:launch.x,y:launch.y,z:terrain.surfaceHeight(launch.x,launch.y)+600,verticalVelocity:0,friendsSoaring:{...createSoaringState(Math.PI/2),phase:'flying',inflation:1,airspeed:9.5}});
    const before=s.createSnapshot(),saved={...before.players[1].friendsSoaring};
    const prediction=new LocalPlayerPrediction('guest');prediction.reconcile(before);
    const f=command(1,0,{movement:8});prediction.step(f);s.setInput('guest',f);s.tick(1000/30);
    const current=s.createSnapshot(),predicted=prediction.present(before,f,0,0).players[1],host=current.players[1];
    expect(predicted.x).toBeCloseTo(host.x,6);expect(predicted.y).toBeCloseTo(host.y,6);expect(predicted.z).toBeCloseTo(host.z,6);
    expect(predicted.friendsSoaring.bank).toBeCloseTo(host.friendsSoaring.bank,6);expect(before.players[1].friendsSoaring).toEqual(saved);
    expect(worldPatch(before,worldDiff(before,current)).players[1].friendsSoaring).toEqual(host.friendsSoaring);
    delete p.friendsSoaring;const removed=s.createSnapshot();expect(worldPatch(current,JSON.parse(JSON.stringify(worldDiff(current,removed)))).players[1].friendsSoaring).toBeUndefined();
  });
  it('continues trimmed flight on stale input and clears equipment on return home',()=>{
    const s=sim(),p=s['players'].get('guest')!;
    Object.assign(p,{x:13000,y:8800,z:5500,verticalVelocity:0,friendsSoaring:{...createSoaringState(Math.PI/2),phase:'flying',inflation:1,airspeed:9.5}});
    s.setInput('guest',command(1,0,{movement:8}));s.tick(33);const start=p.y;
    for(let i=0;i<110;i++)s.tick(33);
    expect(p.friendsSoaring.phase).toBe('flying');expect(p.y).toBeGreaterThan(start);expect(Math.abs(p.friendsSoaring.bank)).toBeLessThan(.1);
    s['recoverFriend'](p);expect(p.friendsSoaring).toBeUndefined();
    s.setInput('guest',command(2,0));s.tick(33);expect(p.friendsSoaring).toBeUndefined();expect(s.createSnapshot().players[1].motion.gliderNeedsStow).toBe(true);
    s.setInput('guest',command(3,0,{friendsGlider:false}));s.tick(33);expect(p.gliderNeedsStow).toBeUndefined();
  });
  it('predicts a glider landing on the same physical grove rock as the host',()=>{
    const s=sim(),p=s['players'].get('guest')!,frontier=s['friendsFrontier']!;
    const cache=new FriendsRockCollisionCache(),forest=frontier.snapshot();
    const rocks=cache.near(10700,4200,forest,frontier.terrain);expect(rocks.length).toBeGreaterThan(0);
    const rock=rocks[0],top=rockSurface(rock,rock.x,rock.y)!;
    const heading=soaringWind(0).angle+Math.PI;
    Object.assign(p,{x:rock.x,y:rock.y,z:top+3,verticalVelocity:-180,friendsSoaring:{...createSoaringState(heading),phase:'flying',inflation:1,airspeed:4.5}});
    const before=s.createSnapshot(),prediction=new LocalPlayerPrediction('guest');prediction.reconcile(before);
    const f=command(1,heading);prediction.step(f);s.setInput('guest',f);s.tick(1000/30);
    const local=prediction.present(before,f,0,0).players[1],host=s.createSnapshot().players[1];
    expect(local.z).toBeCloseTo(host.z,6);expect(local.friendsSoaring.phase).toBe(host.friendsSoaring.phase);
    expect(host.friendsSoaring.phase).toBe('landed');
    const landed=s.createSnapshot();prediction.reconcile(landed);
    const jump=command(2,heading,{jumpPressed:true,jetHeld:true});
    prediction.step(jump);s.setInput('guest',jump);s.tick(1000/30);
    const predictedJump=prediction.present(landed,jump,0,0).players[1],hostJump=s.createSnapshot().players[1];
    expect(hostJump.z).toBeGreaterThan(host.z);expect(hostJump.motion.lastJumpSequence).toBe(2);
    expect(predictedJump.z).toBeCloseTo(hostJump.z,6);
    expect(predictedJump.motion.lastJumpSequence).toBe(2);
  });
  it('interpolates flight pose in both presentation paths',()=>{
    const s=sim(),a=s.createSnapshot(),b=s.createSnapshot();
    a.players[1].friendsSoaring={...createSoaringState(3.1),phase:'flying',bank:0};b.players[1].friendsSoaring={...createSoaringState(-3.1),phase:'flying',bank:.6};
    for(const result of [interpolateCoopSnapshot(a,b,.5),new CoopSnapshotInterpolator().interpolate(a,b,.5)]){
      expect(result.players[1].friendsSoaring.bank).toBeCloseTo(.3);expect(Math.abs(result.players[1].friendsSoaring.heading)).toBeCloseTo(Math.PI,3);
    }
  });
});
