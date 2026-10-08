import {describe,expect,it} from 'vitest';
import {FriendsSimulation} from './FriendsSimulation';
import {CoopSimulation,COOP_STALE_INPUT_MS,quantizeAngle,quantizePitch} from './CoopSimulation';
import {clampInputFrame,MULTIPLAYER_PROTOCOL_VERSION,type MultiplayerInputFrame} from './protocol';
import {quantizeFriendsFlashlightCone} from './FriendsFlashlightState';
import {compactSnapshotWirePayload,expandSnapshotWirePayload,SnapshotDecoder,SnapshotReplicator} from './snapshotReplication';
import {CoopSnapshotInterpolator,interpolateCoopSnapshot} from './snapshotInterpolation';

const seeds=[{id:'host',label:'Host',color:'#0ff'},{id:'guest',label:'Guest',color:'#f0f'}];
const input=(sequence:number,extra:Partial<MultiplayerInputFrame>={}):MultiplayerInputFrame=>({
  type:'input',version:MULTIPLAYER_PROTOCOL_VERSION,sequence,clientTime:0,movement:0,aimAngle:quantizeAngle(.8),aimPitch:quantizePitch(.4),
  selectedSlot:0,firing:false,sprinting:false,sliding:false,reviving:false,jumpPressed:false,dashPressed:false,
  friendsFlashlight:true,friendsFlashlightCone:quantizeFriendsFlashlightCone(1.35),...extra,
});

describe('shared Friends flashlight state',()=>{
  it('replicates aim and coverage, bounds malformed input, and rejects lamps in Survival',()=>{
    const sim=new FriendsSimulation(seeds);sim.setInput('guest',input(1));sim.tick(16);
    const player=sim.createSnapshot().players.find(p=>p.id==='guest')!;
    expect(player.angle).toBeCloseTo(.8,3);expect(player.friendsFlashlight?.pitch).toBeCloseTo(.4,3);
    expect(player.friendsFlashlight?.cone).toBeCloseTo(1.35,2);
    expect(player.friendsFlashlight?.yaw).toBeCloseTo(.8,3);
    for(const cone of [NaN,Infinity,-100,999]){
      const frame=clampInputFrame(input(2,{friendsFlashlightCone:cone}));sim.setInput('guest',frame);sim.tick(16);
      const coneAfter=sim.createSnapshot().players[1].friendsFlashlight!.cone;
      expect(coneAfter).toBeGreaterThanOrEqual(.35);expect(coneAfter).toBeLessThanOrEqual(Math.PI*85/180);
    }
    expect(clampInputFrame(input(3,{friendsFlashlight:'true' as unknown as boolean})).friendsFlashlight).toBeUndefined();
    const survival=new CoopSimulation(seeds);survival.setInput('guest',input(1));survival.tick(16);
    expect(survival.createSnapshot().players[1].friendsFlashlight).toBeUndefined();
  });

  it('turns off stale and downed operators without losing their next valid held state',()=>{
    const sim=new FriendsSimulation(seeds);sim.setInput('guest',input(1));sim.tick(16);
    for(let elapsed=0;elapsed<=COOP_STALE_INPUT_MS;elapsed+=50)sim.tick(50);
    expect(sim.createSnapshot().players[1].friendsFlashlight).toBeUndefined();
    sim.setInput('guest',input(2));sim.tick(16);expect(sim.createSnapshot().players[1].friendsFlashlight).toBeDefined();
    sim['players'].get('guest')!.lifeState='downed';sim.tick(16);
    expect(sim.createSnapshot().players[1].friendsFlashlight).toBeUndefined();
  });

  it('survives compact JSON keyframes/deltas, late joins and off transitions',()=>{
    const sim=new FriendsSimulation(seeds),host=new SnapshotReplicator(),guest=new SnapshotDecoder();
    const send=(tick:number)=>guest.decode(expandSnapshotWirePayload(JSON.parse(JSON.stringify(compactSnapshotWirePayload(host.payloadFor('peer',sim.createSnapshot(),tick))))),tick)!;
    expect(send(1).players[1].friendsFlashlight).toBeUndefined();
    sim.setInput('guest',input(1));sim.tick(16);expect(send(2).players[1].friendsFlashlight).toBeDefined();
    host.reset('peer');expect(send(3).players[1].friendsFlashlight).toBeDefined(); // late join while on
    sim.setInput('guest',input(2,{friendsFlashlight:false}));sim.tick(16);
    expect(send(4).players[1].friendsFlashlight).toBeUndefined();
    sim.setInput('guest',input(3));sim.tick(16);expect(send(5).players[1].friendsFlashlight).toBeDefined();
  });

  it('interpolates remote aim without interpolating toggle edges or changing snapshots',()=>{
    const sim=new FriendsSimulation(seeds);sim.setInput('guest',input(1,{aimPitch:quantizePitch(-.5)}));sim.tick(16);
    const before=sim.createSnapshot();sim.setInput('guest',input(2,{aimPitch:quantizePitch(.5),friendsFlashlightCone:quantizeFriendsFlashlightCone(1.1)}));sim.tick(16);
    const after=sim.createSnapshot(),interpolator=new CoopSnapshotInterpolator();
    for(const result of [interpolateCoopSnapshot(before,after,.5),interpolator.interpolate(before,after,.5)]){
      expect(result.players[1].friendsFlashlight!.pitch).toBeCloseTo(0,3);
      expect(result.players[1].friendsFlashlight!.cone).toBeCloseTo(1.225,2);
    }
    expect(before.players[1].friendsFlashlight!.pitch).toBeCloseTo(-.5,3);
    sim.setInput('guest',input(3,{friendsFlashlight:false}));sim.tick(16);
    expect(interpolator.interpolate(after,sim.createSnapshot(),.01).players[1].friendsFlashlight).toBeUndefined();
  });
});
