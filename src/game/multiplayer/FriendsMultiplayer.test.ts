import { describe, it, expect, vi } from 'vitest';
import { FriendsSimulation } from './FriendsSimulation';
import { CoopSimulation } from './CoopSimulation';
import { FriendsCrewRegistry, newFriendsCrew } from './FriendsCrewIdentity';
import { FriendsCommandOutbox, FriendsCommandResults, nextFriendsRequestId } from './FriendsCommands';
import { FriendsWorldHost, FriendsWorldGuest, friendsWorldPackets, worldDiff, worldPatch } from './FriendsWorldReplication';
import { FriendsFrontier, packKey } from './FriendsFrontier';
import { ManualWebRTCSession } from './ManualWebRTCSession';
const player={id:'host',label:'Host',color:'#fff'};

describe('Friends multiplayer completion',()=>{
  it('keeps both modes constructible on LAN origins without crypto.randomUUID',()=>{
    const getRandomValues=crypto.getRandomValues.bind(crypto);vi.stubGlobal('crypto',{getRandomValues});
    try {expect(()=>new ManualWebRTCSession({role:'host'})).not.toThrow();expect(()=>new ManualWebRTCSession({role:'host',friends:true})).not.toThrow();const crew=newFriendsCrew();expect(crew.worldId).toMatch(/^world-[a-f0-9]{32}$/);const world=new FriendsWorldHost(),epoch=world.epoch;world.reset();expect(world.epoch).not.toBe(epoch);}
    finally{vi.unstubAllGlobals();}
  });
  it('clears the transport tick watermark for a new island epoch while preserving ordinary revisions',()=>{
    const host=new FriendsWorldHost(),guest=new ManualWebRTCSession({role:'guest',friends:true});
    const snapshot=new FriendsSimulation([player]).createSnapshot();
    guest['latestStateTick']=200;guest.friendsStateReceivedAt=123;
    host.update(snapshot);host.pump(['guest'],1000,(_id,packet)=>{guest['receiveMessage']('host','friends-world',packet);return true;},message=>{throw new Error(message);});
    expect(guest['latestStateTick']).toBe(-1);expect(guest.friendsStateReceivedAt).toBe(0);
    guest['latestStateTick']=250;host.pump(['guest'],2000,(_id,packet)=>{guest['receiveMessage']('host','friends-world',packet);return true;},()=>{});expect(guest['latestStateTick']).toBe(250);
    host.reset();host.update(snapshot);host.pump(['guest'],3000,(_id,packet)=>{guest['receiveMessage']('host','friends-world',packet);return true;},()=>{});expect(guest['latestStateTick']).toBe(-1);
  });
  it('keeps request ids increasing through clock rollback and browser reload',async()=>{
    const values=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(key:string)=>values.get(key)||null,setItem:(key:string,value:string)=>values.set(key,value)});
    const clock=vi.spyOn(Date,'now').mockReturnValue(100000);
    try {const first=nextFriendsRequestId();clock.mockReturnValue(100);const next=nextFriendsRequestId();expect(next).toBeGreaterThan(first);vi.resetModules();const reloaded=await import('./FriendsCommands');expect(reloaded.nextFriendsRequestId()).toBeGreaterThan(next);}
    finally {clock.mockRestore();vi.unstubAllGlobals();}
  });
  it('assigns distinct same-name packs, resumes only with the credential and migrates a legacy pack once',()=>{
    const registry=new FriendsCrewRegistry(newFriendsCrew());
    const a=registry.admit(player,undefined,[]),b=registry.admit(player,undefined,[a.player.id]);
    expect(a.player.id).not.toBe(b.player.id);
    const resumed=registry.admit({...player,label:'Renamed'},a.credential,[]);expect(resumed.player.id).toBe(a.player.id);
    expect(()=>registry.admit(player,{...a.credential,token:'wrong'},[])).toThrow('verified');
    expect(()=>registry.admit(player,a.credential,[a.player.id])).toThrow('already connected');
    const f=new FriendsFrontier();f.pack({...player,x:0,y:0,z:0,lifeState:'alive'}).wood=123;
    expect(f.pack({...a.player,x:0,y:0,z:0,lifeState:'alive'}).wood).toBe(123);
    expect(f.pack({...b.player,x:0,y:0,z:0,lifeState:'alive'}).wood).toBe(18);
    expect(Object.keys(f.snapshot().packs)).toEqual([packKey({...a.player,x:0,y:0,z:0,lifeState:'alive'}),packKey({...b.player,x:0,y:0,z:0,lifeState:'alive'})]);
  });
  it('replays an acknowledged command result without repeating its mutation',()=>{
    const results=new FriendsCommandResults(),execute=vi.fn(()=>({ok:true,paid:24}));
    expect(results.run('crew','action',1,execute)).toEqual({ok:true,paid:24});
    expect(results.run('crew','action',1,execute)).toEqual({ok:true,paid:24});expect(execute).toHaveBeenCalledOnce();
    const send=vi.fn((_event:unknown)=>false),outbox=new FriendsCommandOutbox(send,vi.fn());
    outbox.submit('friends_action',{requestId:4,action:'deposit'},'epoch',0);outbox.tick(1001);expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][0]).toEqual(send.mock.calls[0][0]);outbox.acknowledge('friends_action',4);outbox.tick(4000);expect(outbox.size).toBe(0);
  });
  it('preserves resume credentials on another host device and keeps active identities when restoring the same island',()=>{
    const source=new FriendsCrewRegistry(),member=source.admit(player,undefined,[]),backup=structuredClone(source.saved);
    const current=new FriendsCrewRegistry(),hostId=current.saved.hostId;
    expect(current.restore(backup,hostId)).toBe(true);expect(current.saved.hostId).toBe(hostId);
    expect(current.admit({...player,label:'Renamed'},member.credential,[]).player.id).toBe(member.player.id);
    const recent=current.admit({...player,label:'Recent'},undefined,[]);
    expect(current.restore(backup,hostId)).toBe(false);
    expect(current.admit(player,recent.credential,[]).player.id).toBe(recent.player.id);
  });
  it('requires resynchronization after an unresolved command instead of issuing another spend',()=>{
    const send=vi.fn(()=>true),notice=vi.fn(),outbox=new FriendsCommandOutbox(send,notice);
    expect(outbox.submit('friends_action',{requestId:1,action:'planks'},'world',0)).toBe(true);
    outbox.tick(30001);expect(outbox.requiresRejoin).toBe(true);expect(outbox.size).toBe(0);
    expect(outbox.submit('friends_action',{requestId:2,action:'planks'},'world',31000)).toBe(false);
    expect(send).toHaveBeenCalledOnce();outbox.clear();expect(outbox.requiresRejoin).toBe(false);
  });
  it('does not move flying crew or aircraft when another friend joins or recovers',()=>{
    const simulation=new FriendsSimulation([player]);const aircraft=simulation['friends']!['aircraft'];
    Object.assign(aircraft,{x:10000,y:12000,z:4000,pilotId:'host'});
    const host=simulation['players'].get('host')!;Object.assign(host,{x:10000,y:12000,z:4000});
    expect(simulation.addPlayer({...player,id:'guest',label:'Guest'})).toBe(true);
    expect(aircraft).toMatchObject({x:10000,y:12000,z:4000,pilotId:'host'});expect(host.z).toBe(4000);
    simulation.friendsAction('guest',{requestId:1,action:'home'});expect(aircraft.z).toBe(4000);
    simulation.removePlayer('host');expect(aircraft.pilotId).toBeUndefined();expect(aircraft.z).toBe(4000);
    const survival=new CoopSimulation([player]);expect(survival.addPlayer({...player,id:'other'})).toBe(true);expect(survival.createSnapshot().friends).toBeUndefined();
  });
  it('preserves length-changing terrain edits through patches without resending the full array',()=>{
    const a={edits:Array.from({length:6000},(_,i)=>[i,1,2,0])};const b={edits:[...a.edits,[6000,1,2,0]]};
    const patch=worldDiff(a,b);expect(JSON.stringify(patch).length).toBeLessThan(200);expect(worldPatch(a,patch)).toEqual(b);
    expect(worldPatch(b,worldDiff(b,{edits:b.edits.slice(0,10)}))).toEqual({edits:b.edits.slice(0,10)});
  });
  it('installs a slow populated world atomically, catches up edits during transfer and survives a lost acknowledgement',()=>{
    const simulation=new FriendsSimulation([player]);const first=simulation.createSnapshot();
    first.friends!.frontier!.terrain.edits=Array.from({length:5999},(_,i)=>[800+i%600,1200+Math.floor(i/600),-10,0]);
    const host=new FriendsWorldHost();let now=0,dropAck=true;let installs=0;
    const guest=new FriendsWorldGuest(m=>{const c=m as any;if(c.kind==='ack'){if(dropAck){dropAck=false;return;}host.acknowledge('peer',c.epoch,c.revision);}else host.request('peer');},()=>installs++);
    host.update(first);expect(host.motion('peer',first)).toBeUndefined();
    for(now=0;now<17000;now+=100)host.pump(['peer'],now,(_,p)=>{guest.receive(p,now);return true;},m=>{throw new Error(m);});
    expect(installs).toBe(1);expect(guest.decode(host.motion('peer',first))!.friends!.frontier!.terrain.edits).toHaveLength(5999);
    const next=structuredClone(first);next.friends!.frontier!.terrain.edits.push([1499,1300,-10,0]);next.friends!.frontier!.revision++;
    host.update(next);for(;now<19000;now+=100)host.pump(['peer'],now,(_,p)=>{guest.receive(p,now);return true;},m=>{throw new Error(m);});
    expect(guest.decode(host.motion('peer',next))!.friends!.frontier!.terrain.edits).toHaveLength(6000);
    host.reset();host.update(next);for(;now<22000;now+=100)host.pump(['peer'],now,(_,p)=>{guest.receive(p,now);return true;},m=>{throw new Error(m);});expect(installs).toBe(2);
  });
  it('bounds transfer size and rejects corrupted bulk data without installing it',()=>{
    expect(()=>friendsWorldPackets('a'.repeat(4000001),1)).toThrow('transfer size');
    const ack=vi.fn(),installed=vi.fn(),guest=new FriendsWorldGuest(ack,installed);const packets=friendsWorldPackets(JSON.stringify({schema:1,epoch:'x',revision:1,world:{building:{pieces:[]},frontier:{terrain:{edits:[]}}}}),1);
    new Uint8Array(packets[0])[30]^=1;guest.receive(packets[0],0);expect(installed).not.toHaveBeenCalled();expect(ack).not.toHaveBeenCalled();
  });
  it('finishes four paced large baselines even when initial transmission takes longer than the ack retry interval',()=>{
    const snapshot=new FriendsSimulation([player]).createSnapshot();
    // An inert extension stresses framing and pacing without invalid terrain.
    (snapshot.friends!.progress as any).fixturePadding='x'.repeat(650000);
    const host=new FriendsWorldHost(),guests=new Map<string,FriendsWorldGuest>();
    for(let i=0;i<4;i++){const id=`peer-${i}`;guests.set(id,new FriendsWorldGuest(m=>{const c=m as any;if(c.kind==='ack')host.acknowledge(id,c.epoch,c.revision);},()=>{}));}
    host.update(snapshot);
    for(let now=0;now<40000;now+=100)host.pump([...guests.keys()],now,(id,p)=>{guests.get(id)!.receive(p,now);return true;},m=>{throw new Error(m);});
    for(const [id,guest]of guests){const received=guest.decode(host.motion(id,snapshot));expect(received?.friends?.vehicles).toEqual(snapshot.friends!.vehicles);expect(received?.friends?.transport).toBeUndefined();expect((received?.friends?.progress as any).fixturePadding).toHaveLength(650000);}
  });
  it('rejects patches that can allocate unbounded arrays or write prototypes',()=>{
    expect(()=>worldPatch([], {array:{},length:2**32})).toThrow('Invalid world array');
    expect(()=>worldPatch([], {array:{'-1':{value:1}},length:1})).toThrow('Invalid world index');
    expect(()=>worldPatch({}, JSON.parse('{"object":{"__proto__":{"value":{}}}}'))).toThrow('Invalid world key');
  });
});
