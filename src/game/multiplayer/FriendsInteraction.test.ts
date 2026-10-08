import { describe, expect, it, vi } from 'vitest';
import { FriendsFrontier } from './FriendsFrontier';
import { FriendsBuilding, type FriendsBuildPiece } from './FriendsBuilding';
import { FriendsToolActions, toolProfile } from './FriendsToolActions';
import { FriendsBuildSpatialIndex, friendsInteractionTarget } from './FriendsInteractionTargeting';
import { FriendsConstructionControls } from './FriendsConstructionControls';
import { FriendsTerrain } from '../world/FriendsTerrain';
import { validFriendsCommand } from './FriendsCommands';

const actor = {id:'host',label:'Host',x:7900,y:8000,z:0,lifeState:'alive'};
const ray = {x:8016,y:8016,z:26,dx:0,dy:0,dz:-1};
const pose = {x:8016,y:8016,z:0,rotation:0};
function frontier() { const f=new FriendsFrontier(undefined,false);f.terrain.addGrade([8000,8000,0,512]);f.terrain.set(250,250,-1,2);f.pack(actor);return f; }
function piece(id:number,x=8016):FriendsBuildPiece{return {...pose,x,id,shape:'block',finish:'stone',author:'Host',revision:1};}

describe('material work and shared targeting',()=>{
  it('skips support samples for distant trees while preserving reachable large trunk corners',()=>{
    const near={id:'planted:1',x:8115,y:8215,z:0,scale:3,kind:'pine' as const},far={...near,id:'planted:2',x:8500,y:8000};
    const f=new FriendsFrontier({...frontier().snapshot(),planted:[near,far]},false),support=vi.spyOn(f.terrain,'supports');
    const aim={x:actor.x,y:actor.y,z:26,dx:Math.SQRT1_2,dy:Math.SQRT1_2,dz:0};
    expect(f.target(actor,1,aim,[])?.id).toBe(near.id);
    expect(support).toHaveBeenCalledWith(near.x,near.y,near.z);
    expect(support).not.toHaveBeenCalledWith(far.x,far.y,far.z);
  });
  it('winds up before contact, damages stone at a regular cadence, and only remeshes/changes durable state on completion',()=>{
    const f=frontier(),revision=f.getRevision(),terrainRevision=f.terrain.revision;
    f.advanceTool(actor,2,ray,0,[],true);f.advanceTool(actor,2,ray,179,[],true);
    expect(f.snapshot().interaction!.contacts).toHaveLength(0);
    for(const t of [180,250,430,500,680])f.advanceTool(actor,2,ray,t,[],true);
    expect(f.snapshot().interaction!.damage[0].value).toBe(3);
    expect(f.getRevision()).toBe(revision);expect(f.terrain.revision).toBe(terrainRevision);
    f.advanceTool(actor,2,ray,750,[],true);f.advanceTool(actor,2,ray,930,[],true);
    expect(f.snapshot().mined).toBe(1);expect(f.pack(actor).stone).toBe(14);
    expect(f.terrain.revision).toBe(terrainRevision+1);expect(f.getRevision()).toBe(revision+1);
    expect(f.snapshot().interaction!.contacts.at(-1)).toMatchObject({broken:true,amount:2,resource:'Stone'});
  });
  it('cancels release/tool/target changes, expires temporary work, and does not resume a stale contact',()=>{
    const f=frontier();f.advanceTool(actor,2,ray,0,[],true);f.advanceTool(actor,2,ray,170,[],false);f.advanceTool(actor,2,ray,200,[],true);
    expect(f.snapshot().interaction!.contacts).toHaveLength(0);
    f.advanceTool(actor,2,ray,380,[],true);expect(f.snapshot().interaction!.damage[0].value).toBe(1);
    f.tickTools(1500,new Set(['host']),new Set());expect(f.snapshot().interaction!.damage).toHaveLength(0);expect(f.snapshot().interaction!.actions).toEqual({});
    f.advanceTool(actor,2,ray,1500,[],true);expect(f.snapshot().interaction!.contacts.filter(c=>c.broken)).toHaveLength(0);
  });
  it('combines two players on one block exactly once while retaining independent work on another',()=>{
    const f=frontier(),guest={...actor,id:'guest',label:'Guest'};f.pack(guest);f.terrain.set(251,250,-1,2);
    for(const [who,t] of [[actor,100],[guest,120],[actor,400],[guest,420]] as const)f.tool(who,2,ray,t,[]);
    expect(f.snapshot().mined).toBe(1);expect(f.pack(actor).stone+f.pack(guest).stone).toBe(26);
    f.tool(actor,2,{...ray,x:8048},700,[]);expect(f.snapshot().interaction!.damage).toHaveLength(1);
    expect(f.snapshot().interaction!.contacts.filter(c=>c.broken)).toHaveLength(1);
  });
  it('stops at a build obstruction, protects support blocks, and indexes distant builds without changing a hit',()=>{
    const f=frontier(),build={...piece(1),z:0};
    const high={...ray,z:100};expect(friendsInteractionTarget(f.terrain,high,2,[build],[])?.kind).toBe('build');
    const side={x:8016,y:8016,z:-16,dx:0,dy:0,dz:-1};expect(friendsInteractionTarget(f.terrain,side,2,[build],[])?.reason).toContain('supports');
    const index=new FriendsBuildSpatialIndex();index.update([build,piece(2,20000)],1);expect(index.near(8000,8000,300).map(p=>p.id)).toEqual([1]);
  });
  it('keeps upgrade cadence faster without removing the stone/ore contact sequence',()=>{
    expect(toolProfile('stone',2,true).hits).toBe(4);expect(toolProfile('ore',2,true).hits).toBe(5);
    expect(toolProfile('stone',2,true).cadence).toBeLessThan(toolProfile('stone',2,false).cadence);
    const actions=new FriendsToolActions();actions.update('host',2,undefined,true,0,false);expect(actions.update('host',2,undefined,true,200,false)).toBe(false);
  });
  it('locks excavation to the selected face and starts fresh after the material changes',()=>{
    const f=frontier();
    expect(friendsInteractionTarget(f.terrain,ray,2,[],[],true,{axis:2,value:0})?.valid).toBe(true);
    expect(friendsInteractionTarget(f.terrain,ray,2,[],[],true,{axis:0,value:8000})?.reason).toContain('Work face locked');
    f.tool(actor,2,ray,0,[]);f.tool(actor,2,ray,300,[]);
    f.terrain.set(250,250,-1,3);f.tool(actor,2,ray,600,[]);
    expect(f.snapshot().interaction!.damage[0]).toMatchObject({value:1,total:5,kind:'ore'});
  });
});

describe('bounded construction gestures and transactions',()=>{
  it('previews a line/rectangle on the selected plane and prevents unchanged held-pose duplicates',()=>{
    const c=new FriendsConstructionControls();c.setMode('line');c.anchor=pose;
    expect(c.footprint({...pose,x:8112},'block').poses).toHaveLength(4);
    c.setMode('rectangle');c.anchor=pose;expect(c.footprint({...pose,x:8080,y:8080},'block').poses).toHaveLength(9);
    expect(c.footprint({...pose,x:12000,y:12000},'block').issue).toContain('64');
    c.anchorAxis=0;expect(c.footprint({...pose,y:8080,z:64},'block').poses).toHaveLength(9);
    c.lock(pose,[0,0,1]);expect(c.adjust(undefined,ray,'block')?.z).toBe(0);
    expect(c.repeat(pose,'block','stone',0)).toBe(true);expect(c.repeat(pose,'block','stone',500)).toBe(false);
    c.release();expect(c.repeat(pose,'block','stone',750)).toBe(true);
  });
  it('commits groups atomically and makes undo/redo one revision-aware transaction',()=>{
    const b=new FriendsBuilding(),poses=[{...pose,x:8016},{...pose,x:8048},{...pose,x:8080}];
    expect(b.request(actor,{requestId:1,action:'place_group',shape:'block',finish:'stone',poses},'host',[]).ok).toBe(true);
    expect(b.snapshot().revision).toBe(1);expect(b.getPieces()).toHaveLength(3);
    expect(b.request(actor,{requestId:2,action:'undo'},'host',[]).ok).toBe(true);expect(b.getPieces()).toHaveLength(0);
    expect(b.request(actor,{requestId:3,action:'redo'},'host',[]).ok).toBe(true);expect(b.getPieces()).toHaveLength(3);
    const changed=b.getPieces()[1];expect(b.request({...actor,id:'guest'},{requestId:1,action:'paint',pieceId:changed.id,expectedRevision:changed.revision,finish:'timber'},'host',[]).ok).toBe(true);
    expect(b.request(actor,{requestId:4,action:'undo'},'host',[]).ok).toBe(false);expect(b.getPieces()).toHaveLength(3);
  });
  it('rejects an invalid cell or insufficient aggregate materials without changing pieces or inventory',()=>{
    const f=frontier(),b=new FriendsBuilding(),pack=f.pack(actor);pack.stone=1;
    const economy=Object.assign((before,after)=>f.buildTransition(actor,before,after),{batch:edits=>f.buildBatchTransition(actor,edits)});
    const poses=[pose,{...pose,x:8048}];
    expect(b.request(actor,{requestId:1,action:'place_group',shape:'block',finish:'stone',poses},'host',[],economy).ok).toBe(false);
    expect(pack.stone).toBe(1);expect(b.getPieces()).toHaveLength(0);
    pack.stone=10;expect(b.request(actor,{requestId:2,action:'place_group',shape:'block',finish:'stone',poses:[pose,pose]},'host',[],economy).ok).toBe(false);
    expect(pack.stone).toBe(10);expect(b.getPieces()).toHaveLength(0);
    expect(b.request(actor,{requestId:3,action:'place_group',shape:'block',finish:'stone',poses},'host',[],economy).ok).toBe(true);
    expect(pack.stone).toBe(8);expect(b.request(actor,{requestId:4,action:'undo'},'host',[],economy).ok).toBe(true);expect(f.snapshot().stock.stone).toBe(2);
  });
  it('validates bounded wire gestures and attached poses before host mutation',()=>{
    expect(validFriendsCommand({requestId:1,action:'place_group',poses:Array(65).fill(pose)},true)).toBe(false);
    expect(validFriendsCommand({requestId:1,action:'place_group',poses:[{...pose,x:NaN}]},true)).toBe(false);
    expect(validFriendsCommand({requestId:1,action:'place_group',poses:[pose]},true)).toBe(true);
  });
  it('records free group construction for expedition milestones without spending the pack',()=>{
    const f=new FriendsFrontier(),b=new FriendsBuilding(),before={...f.pack(actor)};
    const economy=Object.assign((before,after)=>f.buildTransition(actor,before,after),{batch:edits=>f.buildBatchTransition(actor,edits)});
    expect(b.request(actor,{requestId:1,action:'place_group',shape:'block',finish:'stone',poses:[pose,{...pose,x:8048}]},'host',[],economy).ok).toBe(true);
    expect(f.snapshot().built).toBe(2);expect(f.pack(actor)).toEqual(before);
  });
  it('stabilizes a grid boundary briefly and releases it after crossing the tolerance or changing face',()=>{
    const c=new FriendsConstructionControls(),surface={x:8031,y:8016,z:0,nx:0,ny:0,nz:1};
    c.stabilize(pose,'block',surface,'1');
    expect(c.stabilize({...pose,x:8048},'block',{...surface,x:8032.5},'1')?.x).toBe(8016);
    expect(c.stabilize({...pose,x:8048},'block',{...surface,x:8034},'1')?.x).toBe(8048);
    expect(c.stabilize(pose,'block',{...surface,nx:1,nz:0},'1')?.x).toBe(8016);
  });
});
