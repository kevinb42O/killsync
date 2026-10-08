import { describe, expect, it } from 'vitest';
import { FriendsWorldHost, FriendsWorldGuest } from './FriendsWorldReplication';
import { FriendsFrontier } from './FriendsFrontier';
import { FriendsBuilding } from './FriendsBuilding';
import { normalizeFriendsProgress } from './FriendsExpedition';
import { exportFriendsWorld } from './FriendsWorldStorage';
import type { CoopSnapshot } from './CoopSimulation';

describe('transient tool feedback replication',()=>{
  it('sends tool work through motion without scheduling a durable world transfer or saving it',()=>{
    const frontier=new FriendsFrontier(),building=new FriendsBuilding().snapshot(),progress=normalizeFriendsProgress({});
    frontier.terrain.addGrade([8000,8000,0,512]);frontier.terrain.set(250,250,-1,2);
    const actor={id:'host',label:'Host',x:8016,y:8016,z:0,lifeState:'alive'};frontier.pack(actor);
    const snapshot=()=>({elapsedMs:400,friends:{frontier:frontier.snapshot(),building,progress,vehicles:[]}} as unknown as CoopSnapshot);
    const host=new FriendsWorldHost(),controls:unknown[]=[];
    const guest=new FriendsWorldGuest(message=>controls.push(message),()=>{});
    host.update(snapshot());host.pump(['guest'],0,(_id,packet)=>{guest.receive(packet,0);return true;},message=>{throw new Error(message);});
    const ack=controls.at(-1) as {epoch:string;revision:number};host.acknowledge('guest',ack.epoch,ack.revision);
    frontier.tool(actor,2,{x:8016,y:8016,z:26,dx:0,dy:0,dz:-1},200,[]);
    host.update(snapshot());let packets=0;host.pump(['guest'],400,()=>{packets++;return true;},()=>{});
    expect(packets).toBe(0);
    const decoded=guest.decode(host.motion('guest',snapshot()));
    expect(decoded?.friends?.frontier?.interaction?.damage[0].value).toBe(1);
    expect(decoded?.friends?.frontier?.interaction?.contacts).toHaveLength(1);
    const saved=JSON.parse(exportFriendsWorld({frontier:frontier.snapshot(),building,progress}));
    expect(saved.frontier.interaction).toBeUndefined();expect(saved.frontier.damage).toBeUndefined();expect(saved.frontier.feedback).toEqual({});
    expect(saved.frontier.terrain.revision).toBe(frontier.terrain.revision);
  });
});
