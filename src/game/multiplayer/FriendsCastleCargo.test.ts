import { describe, expect, it } from 'vitest';
import { CASTLE_STAIRS, FriendsTerrain } from '../world/FriendsTerrain';
import { castleCargoColliders } from './FriendsCastleCargo';
import { FriendsCargoPhysics } from './FriendsCargoPhysics';
import { cargoBounds, cargoHullPoints } from './FriendsCargoPose';
import { cargoInDeliveryBay, type HaulingEnvironment, type PhysicalCargo } from './FriendsHauling';
import { FriendsSimulation } from './FriendsSimulation';
import { quantizeAngle, quantizePitch } from './CoopSimulation';
import { MULTIPLAYER_PROTOCOL_VERSION, type MultiplayerInputFrame } from './protocol';
import { FRIENDS_HAULING_JOBS } from '../world/FriendsHaulingGoal';

const input=(sequence:number,extra:Partial<MultiplayerInputFrame>={}):MultiplayerInputFrame=>({type:'input',version:MULTIPLAYER_PROTOCOL_VERSION,sequence,clientTime:0,movement:0,aimAngle:0,aimPitch:quantizePitch(0),friendsTool:5,selectedSlot:0,firing:false,fireActionId:0,interactActionId:0,sprinting:false,sliding:false,reviving:false,jumpPressed:false,dashPressed:false,...extra});

describe('exact castle cargo support',()=>{
  it('lands on a fan tread at its authored elevation, rather than sinking to the recessed voxel core',()=>{
    const t=CASTLE_STAIRS.treads.find(t=>t.flight==='approach'&&t.z%32===8)!,x=(t.a.x+t.b.x)/2,y=(t.a.y+t.b.y)/2;
    const terrain=new FriendsTerrain(),cargo:PhysicalCargo={id:'lantern-core',x,y,z:t.z+4,angle:Math.atan2(t.b.y-t.a.y,t.b.x-t.a.x),vx:0,vy:0,vz:0,spin:0};
    // Spawn above the whole footprint, not embedded in adjacent uphill treads.
    cargo.z=Math.max(...cargoHullPoints(cargo).map(p=>terrain.floor(p.x,p.y,6000,0)??t.z))+4;
    const env:HaulingEnvironment={revision:'1',solid:(x,y,z)=>Boolean(terrain.exposedMaterial(x,y,z)),floor:(x,y,z,step)=>terrain.floor(x,y,z,step),collide:()=>false,blocked:()=>false,vehicles:[],colliders:castleCargoColliders};
    const physics=new FriendsCargoPhysics();
    for(let i=0;i<10;i++){physics.prepare(cargo,env);for(let n=0;n<6;n++)physics.step(1/120,cargo);}
    expect(cargoBounds(cargo).minZ).toBeGreaterThanOrEqual(t.z-8.1);
    expect(Math.abs(cargo.x-x)).toBeLessThan(40);expect(Math.abs(cargo.y-y)).toBeLessThan(40);
    expect(physics.world.bodies.length).toBeLessThan(400);
  });
  it('solo hauls the Watchfire core up the entire castle approach, through the gate and into its courtyard bay',()=>{
    const sim=new FriendsSimulation([{id:'host',label:'Host',color:'#fff'}]);
    const cargo=sim['friends']!.hauling.getCargo()[1],player=sim['players'].get('host')!;
    const points=CASTLE_STAIRS.approach,from=points.length-20,goal=FRIENDS_HAULING_JOBS[1].goal;
    Object.assign(cargo,{...points[from],angle:Math.atan2(points[from-1].y-points[from].y,points[from-1].x-points[from].x)});
    Object.assign(player,{...points[from-14],verticalVelocity:0});
    sim.setInput('host',input(1,{firing:true,fireActionId:1,aimAngle:quantizeAngle(Math.atan2(cargo.y-player.y,cargo.x-player.x)),aimPitch:quantizePitch(Math.atan2(cargo.z-player.z,Math.hypot(cargo.x-player.x,cargo.y-player.y)))}));sim.tick(50);
    expect(sim.createSnapshot().friends!.hauling!.ropes[0]?.cargoId).toBe('ridge-core');
    let target=from-17;
    for(let i=2;i<3602;i++){
      while(target>0&&Math.hypot(player.x-points[target].x,player.y-points[target].y)<28)target--;
      const p=target===0&&player.y<points[0].y+35?{x:goal.x,y:goal.y-68}:points[target];
      const distance=Math.hypot(p.x-player.x,p.y-player.y),ahead=Math.hypot(cargo.x-player.x,cargo.y-player.y);
      // Stop and brace when the load falls behind; follow each broad turn.
      sim.setInput('host',input(i,{aimAngle:quantizeAngle(Math.atan2(p.y-player.y,p.x-player.x)),movement:distance>20&&ahead<160?1:0,aiming:true}));sim.tick(50);
    }
    expect(target).toBe(0);
    expect(cargoBounds(cargo).minZ).toBeCloseTo(goal.z,0);
    expect(cargoInDeliveryBay(cargo)).toBe(true);
    expect(sim.createSnapshot().friends!.hauling!.ropes).toHaveLength(1);
    sim.setInput('host',input(3602,{interactActionId:1}));sim.tick(50);
    expect(sim.createSnapshot().friends!.hauling!.completedCargoIds).toEqual(['ridge-core']);
    expect(sim.createSnapshot().friends!.hauling!.delivered).toBe(false);
  },20000);
});
