import { describe, expect, it } from 'vitest';
import { FriendsSimulation } from './FriendsSimulation';
import { FriendsBuilding, type FriendsBuildPiece } from './FriendsBuilding';
import { FriendsDynamite, DYNAMITE_RADIUS, DYNAMITE_TOOL, pushDynamitePlayers } from './FriendsDynamite';
import { FriendsFrontier } from './FriendsFrontier';
import { FriendsWorldHost, FriendsWorldGuest } from './FriendsWorldReplication';
import { exportFriendsWorld } from './FriendsWorldStorage';
import { craneSocketPose, craneTopologyError } from './FriendsCraneAssemblies';
import { MULTIPLAYER_PROTOCOL_VERSION, clampInputFrame, type MultiplayerInputFrame } from './protocol';
import { quantizeAngle, quantizePitch } from './CoopSimulation';
import { railSimulation } from './friendsRailTestFixtures';

const actor={id:'host',angle:0,x:7940,y:8000,z:0,lifeState:'alive'};
const block:FriendsBuildPiece={id:1,x:8000,y:8000,z:0,rotation:0,shape:'block',finish:'stone',author:'Host',revision:1};
const pieces=[block,{...block,id:2,x:8032},{...block,id:3,x:8256}];
const env={floor:()=>0,blocked:()=>false};
function input(sequence=1,action=1):MultiplayerInputFrame {return {type:'input',version:MULTIPLAYER_PROTOCOL_VERSION,sequence,clientTime:sequence*50,movement:0,aimAngle:quantizeAngle(0),aimPitch:quantizePitch(-.9),selectedSlot:0,friendsTool:DYNAMITE_TOOL,fireActionId:action,firing:false,sprinting:false,sliding:false,reviving:false,jumpPressed:false,dashPressed:false};}
function fixture(){const sim=new FriendsSimulation([{id:'host',label:'Host',color:'#fff'},{id:'guest',label:'Guest',color:'#fff'}],undefined,undefined,{revision:1,guestsCanBuild:true,pieces});Object.assign(sim['players'].get('host')!,actor);Object.assign(sim['players'].get('guest')!,{...actor,id:'guest',x:7900});sim['friendsFrontier']!.terrain.addGrade([8000,8000,0,512]);return sim;}
function advance(sim:FriendsSimulation,count:number,id='host',start=1){for(let i=start;i<start+count;i++){sim.setInput(id,input(i));sim.tick(50);}}

describe('throwable Friends dynamite',()=>{
  it('throws once per click, shares the fuse and destruction, saves terrain and construction',()=>{
    const sim=fixture();advance(sim,1);
    expect(sim.createSnapshot().friends!.dynamite!.charges).toHaveLength(1);
    const host=new FriendsWorldHost();const guest=new FriendsWorldGuest((m:any)=>{if(m.kind==='ack')host.acknowledge('guest',m.epoch,m.revision);},()=>{});
    const transfer=()=>{const s=sim.createSnapshot();host.update(s);host.pump(['guest'],s.elapsedMs,(_id,packet)=>{guest.receive(packet,s.elapsedMs);return true;},m=>{throw new Error(m);});return guest.decode(host.motion('guest',s))!;};
    expect(transfer().friends!.dynamite!.charges).toHaveLength(1);
    advance(sim,59,'host',2);expect(sim.createSnapshot().friends!.building!.pieces).toHaveLength(3);
    advance(sim,1,'host',61);const snapshot=transfer();
    expect(snapshot.friends!.building!.pieces.map(p=>p.id)).toEqual([3]);
    expect(snapshot.friends!.dynamite!.blasts[0]).toMatchObject({destroyed:2});expect(snapshot.friends!.dynamite!.blasts[0].terrainDestroyed).toBeGreaterThan(0);
    expect(snapshot.friends!.dynamite!.charges).toHaveLength(0);
    const revision=snapshot.friends!.building!.revision;advance(sim,1,'host',62);expect(sim.createSnapshot().friends!.building!.revision).toBe(revision);
    const saved=JSON.parse(exportFriendsWorld({building:snapshot.friends!.building!,frontier:snapshot.friends!.frontier!,progress:snapshot.friends!.progress}));
    expect(saved.building.pieces.map((p:FriendsBuildPiece)=>p.id)).toEqual([3]);expect(saved.frontier.terrain.edits.length).toBeGreaterThan(0);expect(saved.dynamite).toBeUndefined();
  });
  it('accepts tool 12, respects guest editing permission, living players and placement cooldown',()=>{
    expect(clampInputFrame(input()).friendsTool).toBe(DYNAMITE_TOOL);
    const d=new FriendsDynamite();const players=[actor];
    d.update(50,0,players,new Map([['host',input()]]),env,()=>false);expect(d.snapshot().charges).toHaveLength(0);
    d.update(50,50,players,new Map([['host',input(2,2)]]),env,()=>true);expect(d.snapshot().charges).toHaveLength(1);
    d.update(50,100,players,new Map([['host',input(3,3)]]),env,()=>true);expect(d.snapshot().charges).toHaveLength(1);
    d.update(50,800,players,new Map([['host',input(4,4)]]),env,()=>true);expect(d.snapshot().charges).toHaveLength(2);
    d.update(50,1600,[{...actor,lifeState:'downed'}],new Map([['host',input(5,5)]]),env,()=>true);expect(d.snapshot().charges).toHaveLength(2);
    const sim=fixture();sim['friendsBuilding']!.setGuestAccess(false);advance(sim,1,'guest');expect(sim.createSnapshot().friends!.dynamite!.charges).toHaveLength(0);
  });
  it('collides with walls, falls and settles without tunnelling, and caps active charges',()=>{
    const d=new FriendsDynamite(),p={...actor,x:0,y:0};let wallHits=0;
    const wall={floor:()=>0,blocked:(from:{x:number},to:{x:number})=>{const hit=from.x<100&&to.x>=100;if(hit)wallHits++;return hit;}};
    for(let i=0;i<60;i++)d.update(50,i*50,[p],new Map([['host',{...input(i+1),aimPitch:quantizePitch(0)}]]),wall,()=>true);
    expect(d.snapshot().charges).toHaveLength(1);expect(d.snapshot().charges[0].x).toBeLessThan(100);expect(d.snapshot().charges[0].z).toBeGreaterThanOrEqual(7);expect(wallHits).toBeGreaterThan(0);
    const many=new FriendsDynamite(),players=Array.from({length:9},(_,i)=>({...p,id:String(i)}));many.update(50,0,players,new Map(players.map(p=>[p.id,input()])),env,()=>true);expect(many.snapshot().charges).toHaveLength(8);
    many.tick(3000,()=>({destroyed:0,terrainDestroyed:0}));expect(many.snapshot().blasts).toHaveLength(8);many.tick(5500,()=>({destroyed:0,terrainDestroyed:0}));expect(many.snapshot().blasts).toHaveLength(0);
  });
  it('breaks soil, stone, copper and iron terrain through the durable edit path',()=>{
    const frontier=new FriendsFrontier(undefined,false);frontier.terrain.addGrade([8000,8000,0,512]);
    const voxels=([1,2,3,4] as const).map((material,i)=>({x:249+i%2,y:249+Math.floor(i/2),z:0,material}));
    for(const v of voxels)expect(frontier.terrain.set(v.x,v.y,v.z,v.material)).toBe(true);
    const far={x:260,y:260,z:0};frontier.terrain.set(far.x,far.y,far.z,4);
    expect(frontier.blastTerrain({x:8000,y:8000,z:16},DYNAMITE_RADIUS)).toBeGreaterThanOrEqual(4);
    for(const v of voxels)expect(frontier.terrain.material(v.x,v.y,v.z)).toBe(0);expect(frontier.terrain.material(far.x,far.y,far.z)).toBe(4);
    const restored=new FriendsFrontier(frontier.snapshot(),false);for(const v of voxels)expect(restored.terrain.material(v.x,v.y,v.z)).toBe(0);
  });
  it('pushes nearby players outward and upward with distance falloff, including the thrower',()=>{
    const near={...actor,x:40,y:0,z:0},farther={...actor,id:'guest',x:180,y:0,z:0},outside={...actor,id:'far',x:400,y:0,z:0};
    pushDynamitePlayers({x:0,y:0,z:7},[near,farther,outside]);
    expect((near as any).velocityX).toBeGreaterThan((farther as any).velocityX);expect((near as any).velocityX).toBeGreaterThan(300);expect((near as any).verticalVelocity).toBeGreaterThan(200);expect(near.z).toBe(3);expect((outside as any).velocityX).toBeUndefined();
    const opposite={...actor,x:-40,y:0,z:0};pushDynamitePlayers({x:0,y:0,z:7},[opposite]);expect((opposite as any).velocityX).toBeLessThan(0);
  });
  it('removes crane dependencies in one construction undo entry',()=>{
    const root={...block,shape:'crane_joint' as const},boom={...root,...craneSocketPose([root],root,'crane_boom',0)!,id:2,shape:'crane_boom' as const};
    const b=new FriendsBuilding({pieces:[root,boom,pieces[2]],guestsCanBuild:true});expect(b.blast(actor,{x:8000,y:8000,z:16},DYNAMITE_RADIUS,'host')).toBe(2);expect(craneTopologyError(b.getPieces())).toBeUndefined();
    expect(b.request(actor,{requestId:1,action:'undo'},'host',[]).ok).toBe(true);expect(b.getPieces()).toHaveLength(3);expect(craneTopologyError(b.getPieces())).toBeUndefined();
  });
  it('dismantles a train when its track is blasted and rechecks guest access at detonation',()=>{
    const sim=railSimulation([{id:'host',label:'Host',color:'#fff'}]),piece=sim['friendsBuilding']!.getPieces()[0];Object.assign(sim['players'].get('host')!,{x:piece.x-60,y:piece.y,z:piece.z});expect(sim['friends']!.hasTrain()).toBe(true);advance(sim,61);expect(sim['friendsBuilding']!.getPieces().some(p=>p.id===piece.id)).toBe(false);expect(sim['friends']!.hasTrain()).toBe(false);
    const denied=fixture();advance(denied,1,'guest');denied['friendsBuilding']!.setGuestAccess(false);advance(denied,60,'guest',2);expect(denied.createSnapshot().friends!.building!.pieces).toHaveLength(3);expect(denied.createSnapshot().friends!.dynamite!.blasts[0].terrainDestroyed).toBe(0);
  });
});
