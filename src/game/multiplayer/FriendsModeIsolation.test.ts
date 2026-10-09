import { describe, expect, it, vi } from 'vitest';
import { FriendsSimulation } from './FriendsSimulation';
import { CoopSimulation, quantizeAngle, quantizePitch } from './CoopSimulation';
import { MULTIPLAYER_PROTOCOL_VERSION, type MultiplayerInputFrame } from './protocol';
import { compactSnapshotWirePayload, expandSnapshotWirePayload, createSnapshotDelta, SnapshotDecoder } from './snapshotReplication';
const seeds=[{id:'host',label:'Host',color:'#8de6ce'},{id:'guest',label:'Friend',color:'#d4b3ff'}];
const input=(sequence:number,friendsTool: NonNullable<MultiplayerInputFrame['friendsTool']>=6):MultiplayerInputFrame=>({type:'input',version:MULTIPLAYER_PROTOCOL_VERSION,sequence,clientTime:0,movement:0,aimAngle:quantizeAngle(0),aimPitch:quantizePitch(0),selectedSlot:0,firing:false,sprinting:false,sliding:false,reviving:false,jumpPressed:false,dashPressed:false,friendsTool});
const routines=['updateOrdnance','updateArtifactEffects','updateArtifactStatuses','updatePassiveModules','updateStructures','updateRevives','advanceWeaponActions'];
describe('Friends mode isolation',()=>{
  it('does not initialize survival world directors or tick unused survival systems with Friends tools',()=>{
    const s=new FriendsSimulation(seeds),internal=s as any;
    const spies=routines.map(name=>vi.spyOn(internal,name));
    for(let sequence=1;sequence<=10;sequence++){
      s.setInput('host',input(sequence));s.setInput('guest',input(sequence,sequence%2?1:3));s.tick(50);
    }
    for(const spy of spies)expect(spy).not.toHaveBeenCalled();
    for(const name of ['encounterDirector','spawnTopology','gasZone','stationDirector','weaponFoundry','fieldMissionDirector','runDirector','realityBreach'])expect(internal[name]).toBeUndefined();
    expect(s.createSnapshot().players.every(p=>p.weaponStates.length===0)).toBe(true);
    expect(s.createSnapshot().players.every(p=>p.fabricatorCharges===undefined&&p.privateExfilAvailable===undefined)).toBe(true);
    expect(s.addMissionPing('host',1)).toBeUndefined();
    expect(s.redeployPlayer('host',1,'guest')).toEqual({code:'station_range'});
    expect(s.removePlayer('guest')).toBe(true);
  });
  it('retains survival updates and loadouts in survival mode',()=>{
    const s=new CoopSimulation(seeds),internal=s as any;
    const spies=routines.map(name=>vi.spyOn(internal,name));
    s.setInput('host',input(1,0));s.tick(50);
    for(const spy of spies)expect(spy).toHaveBeenCalled();
    expect(s.createSnapshot().players[0].weaponStates).toHaveLength(5);
    expect(s.createSnapshot().gasZone).toBeDefined();
  });
  it('replicates loadout removal and re-equipping across keyframe-based deltas',()=>{
    const s=new FriendsSimulation(seeds),decoder=new SnapshotDecoder();
    const base=s.createSnapshot();decoder.decode({format:'coop_snapshot_full',snapshot:base},1);
    for(const [sequence,tool] of [[1,0],[2,6],[3,0]] as const){
      s.setInput('host',input(sequence,tool));s.tick(50);const next=s.createSnapshot();
      const wire=expandSnapshotWirePayload(JSON.parse(JSON.stringify(compactSnapshotWirePayload(createSnapshotDelta(base,next,1)))));
      const decoded=decoder.decode(wire,sequence+1)!;
      expect(decoded.players[0].friendsWeaponEquipped).toBe(tool===0);
      expect(decoded.players[0].weaponStates).toHaveLength(tool===0?5:0);
      expect(decoded.players[1].weaponStates).toHaveLength(0);
    }
  });
});


it('admits six Friends players, rejects a seventh, and keeps Survival at five',()=>{
  const players=Array.from({length:7},(_,i)=>({id:`cap-${i}`,label:`Player ${i}`,color:'#fff'}));
  const friends=new FriendsSimulation(players.slice(0,5));
  expect(friends.addPlayer(players[5])).toBe(true);
  expect(friends.addPlayer(players[6])).toBe(false);
  expect(friends.getPlayerSeeds()).toHaveLength(6);
  friends.tick(50);expect(friends.createSnapshot().players).toHaveLength(6);
  expect(friends.removePlayer(players[5].id)).toBe(true);
  expect(friends.addPlayer(players[6])).toBe(true);
  const survival=new CoopSimulation(players.slice(0,5));
  expect(survival.addPlayer(players[5])).toBe(false);
  expect(survival.getPlayerSeeds()).toHaveLength(5);
});
