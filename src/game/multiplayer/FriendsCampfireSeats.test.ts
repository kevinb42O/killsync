import { describe,it,expect } from 'vitest';
import { CAMPFIRE_SEATS,campfireSeatPrompt,interactCampfireSeat,updateCampfireSeats } from './FriendsCampfireSeats';
import { FRIENDS_CAMPFIRE } from '../world/FriendsRegion';
import { FriendsTerrain,FRIENDS_SPAWN_PLATFORM,TERRAIN_GENERATION } from '../world/FriendsTerrain';
import { FriendsSimulation } from './FriendsSimulation';
import { friendsPlacementError } from './FriendsBuilding';
import { MULTIPLAYER_PROTOCOL_VERSION } from './protocol';
import { compactSnapshotWirePayload,SnapshotDecoder } from './snapshotReplication';
import type { ScenicActor } from './FriendsScenicService';
const actor=(id:string,index=0):ScenicActor=>({id,...CAMPFIRE_SEATS[index],z:FRIENDS_CAMPFIRE.z,lifeState:'alive'});
describe('Commons campfire gathering',()=>{
  it('is a short walk off the spawn deck and keeps the complete seating circle level through saved edits and grades',()=>{
    expect(Math.hypot(FRIENDS_CAMPFIRE.x-FRIENDS_SPAWN_PLATFORM.x,FRIENDS_CAMPFIRE.y-FRIENDS_SPAWN_PLATFORM.y)).toBeGreaterThan(600);
    const terrain=new FriendsTerrain({generation:TERRAIN_GENERATION,revision:1,grades:[[FRIENDS_CAMPFIRE.x,FRIENDS_CAMPFIRE.y,1200,200]],edits:[[206,173,21,0]]});
    for(const seat of CAMPFIRE_SEATS){expect(terrain.surfaceHeight(seat.x,seat.y)).toBe(FRIENDS_CAMPFIRE.z);expect(terrain.floor(seat.x,seat.y,FRIENDS_CAMPFIRE.z)).toBe(FRIENDS_CAMPFIRE.z);}
    expect(terrain.set(206,173,21,0)).toBe(false);
    expect(friendsPlacementError([], 'cube', {x:FRIENDS_CAMPFIRE.x,y:FRIENDS_CAMPFIRE.y,z:FRIENDS_CAMPFIRE.z,rotation:0})).toBe('Keep the campfire gathering spot clear.');
  });
  it('reserves eight unique seats, rejects occupied seats and releases with interact or jump',()=>{
    const players=Array.from({length:8},(_,i)=>actor(`${i}`,i));
    for(const p of players)expect(interactCampfireSeat(p,players)).toBe(true);
    expect(new Set(players.map(p=>p.friendsSeat!.index)).size).toBe(8);
    expect(campfireSeatPrompt(actor('extra'),players)).toBeUndefined();
    expect(interactCampfireSeat(players[0],players)).toBe(true);expect(players[0].friendsSeat).toBeUndefined();expect(players[0].z).toBe(FRIENDS_CAMPFIRE.z);
    updateCampfireSeats(players,new Set(['1']));expect(players[1].friendsSeat).toBeUndefined();
    players[2].friendsDevFlight=true;updateCampfireSeats(players,new Set());expect(players[2].friendsSeat).toBeUndefined();
    expect(campfireSeatPrompt({...actor('dead'),lifeState:'downed'},players)).toBeUndefined();
  });
  it('seats through the authoritative F input, stays fixed while trains move, replicates and stands on jump',()=>{
    const sim=new FriendsSimulation([{id:'host',label:'Host',color:'#fff'}]),p=sim['players'].get('host')!;
    Object.assign(p,actor('host'));
    const input={type:'input' as const,version:MULTIPLAYER_PROTOCOL_VERSION,sequence:1,clientTime:0,movement:0,aimAngle:0,aimPitch:0,selectedSlot:0,firing:false,sprinting:false,sliding:false,reviving:false,jumpPressed:false,dashPressed:false,interactActionId:1};
    sim.setInput('host',input);sim.tick(50);expect(p.friendsSeat).toEqual({vehicleId:FRIENDS_CAMPFIRE.id,index:0});
    sim.setInput('host',{...input,sequence:2,movement:1});
    for(let i=0;i<15;i++)sim.tick(50);
    expect(p.x).toBe(CAMPFIRE_SEATS[0].x);expect(p.y).toBe(CAMPFIRE_SEATS[0].y);expect(p.z).toBe(CAMPFIRE_SEATS[0].z);
    const snapshot=sim.createSnapshot();expect(snapshot.friends!.scenicRailway!.seats).toEqual([]);
    expect(new SnapshotDecoder().decode(compactSnapshotWirePayload(snapshot),1)?.players[0].friendsSeat).toEqual(p.friendsSeat);
    sim.setInput('host',{...input,sequence:3,jumpPressed:true});sim.tick(50);expect(p.friendsSeat).toBeUndefined();expect(p.crouching).toBe(false);
  });
});
