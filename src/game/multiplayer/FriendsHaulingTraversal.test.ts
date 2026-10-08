import { describe, expect, it } from 'vitest';
import { FriendsSimulation } from './FriendsSimulation';
import { railFixture } from './friendsRailTestFixtures';
import { FRIENDS_BUILD_CATALOG, type FriendsBuildPiece, type FriendsBuildShape } from './FriendsBuilding';
import { cargoBounds } from './FriendsCargoPose';
import { quantizeAngle, quantizePitch } from './CoopSimulation';
import { MULTIPLAYER_PROTOCOL_VERSION, type MultiplayerInputFrame } from './protocol';

const input=(sequence:number,extra:Partial<MultiplayerInputFrame>={}):MultiplayerInputFrame=>({type:'input',version:MULTIPLAYER_PROTOCOL_VERSION,sequence,clientTime:0,movement:0,aimAngle:0,aimPitch:quantizePitch(0),friendsTool:5,selectedSlot:0,firing:false,fireActionId:0,interactActionId:0,sprinting:false,sliding:false,reviving:false,jumpPressed:false,dashPressed:false,...extra});
function incline(shape:FriendsBuildShape,rotation:number){
  const f=railFixture(),def=FRIENDS_BUILD_CATALOG[shape],angle=rotation*Math.PI/2,c=Math.cos(angle),s=Math.sin(angle);
  const at=(x:number,y=0)=>({x:4000+c*x-s*y,y:10800+s*x+c*y});
  const pieces:FriendsBuildPiece[]=Array.from({length:4},(_,i)=>({id:i+1,...at(def.w*(i+.5)),z:def.h*i,rotation,shape,finish:'stone',author:'Host',revision:1}));
  const end=def.w*4,height=def.h*4;
  for(let i=0;i<4;i++)pieces.push({id:5+i,...at(end+32+64*i),z:height-64,rotation,shape:'cube',finish:'stone',author:'Host',revision:1});
  f.building.pieces=pieces;f.frontier.terrain.grades=pieces.map(p=>[p.x,p.y,0,512]);
  const sim=new FriendsSimulation([{id:'host',label:'Host',color:'#fff'}],1,undefined,f.building,undefined,f.frontier,f.transport);
  const cargo=sim['friends']!.hauling.getCargo()[0],player=sim['players'].get('host')!;
  Object.assign(cargo,{...at(-56),z:0,angle,vx:0,vy:0,vz:0,spin:0,orientation:undefined});
  Object.assign(player,{...at(-10),z:0,angle:angle+Math.PI,verticalVelocity:0});
  return {sim,cargo,player,angle,end,height,at};
}
describe('solo rope hauling through authored inclines',()=>{
  it.each(['voxel_ramp','ramp','long_ramp','voxel_stairs','stairs'] as const)('walks a single tethered core up four connected %s pieces',shape=>{
    for(const rotation of [0,1,2,3]){
      const {sim,cargo,player,angle,end,height}=incline(shape,rotation);
      sim.setInput('host',input(1,{aimAngle:quantizeAngle(angle+Math.PI),firing:true,fireActionId:1}));sim.tick(50);
      expect(sim.createSnapshot().friends!.hauling!.ropes).toHaveLength(1);
      for(let i=2;i<602;i++){
        const along=(player.x-4000)*Math.cos(angle)+(player.y-10800)*Math.sin(angle);
        sim.setInput('host',input(i,{aimAngle:quantizeAngle(angle),movement:along<end+100?1:0,aiming:along>=end+100}));sim.tick(50);
      }
      const along=(cargo.x-4000)*Math.cos(angle)+(cargo.y-10800)*Math.sin(angle);
      expect(along,JSON.stringify({shape,rotation,cargo,player:{x:player.x,y:player.y,z:player.z},ropes:sim.createSnapshot().friends!.hauling!.ropes})).toBeGreaterThan(end+20);
      expect(cargoBounds(cargo).minZ,JSON.stringify({cargo,player:{x:player.x,y:player.y,z:player.z},ropes:sim.createSnapshot().friends!.hauling!.ropes})).toBeCloseTo(height,0);
    }
  });
  it.each(['long_ramp','stairs'] as const)('can reel while walking up %s without losing its rope to the structure',shape=>{
    const {sim,cargo,player,angle,end,height}=incline(shape,0);
    sim.setInput('host',input(1,{aimAngle:quantizeAngle(Math.PI),firing:true,fireActionId:1}));sim.tick(50);
    for(let i=2;i<602;i++){
      sim.setInput('host',input(i,{aimAngle:quantizeAngle(angle),movement:player.x<4000+end+100?1:0,aiming:true}));sim.tick(50);
    }
    expect(cargo.x,JSON.stringify({cargo,ropes:sim.createSnapshot().friends!.hauling!.ropes})).toBeGreaterThan(4000+end+20);
    expect(cargoBounds(cargo).minZ,JSON.stringify({cargo,player:{x:player.x,y:player.y,z:player.z},ropes:sim.createSnapshot().friends!.hauling!.ropes})).toBeCloseTo(height,0);
    expect(sim.createSnapshot().friends!.hauling!.ropes).toHaveLength(1);
  });
});
