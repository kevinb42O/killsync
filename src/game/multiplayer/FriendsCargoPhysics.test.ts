import { describe, expect, it } from 'vitest';
import { FriendsTerrain } from '../world/FriendsTerrain';
import { FriendsHauling, cargoAnchor, type HaulingEnvironment, type HaulingActor, type PhysicalCargo } from './FriendsHauling';
import { cargoBounds, cargoRotation, cargoWorldPoint, interpolateCargoRotation } from './FriendsCargoPose';
import { cargoTerrainColliders, FriendsCargoPhysics } from './FriendsCargoPhysics';
import { routeHaulingRope } from './FriendsRopePath';
import { MULTIPLAYER_PROTOCOL_VERSION, type MultiplayerInputFrame } from './protocol';

const cargo=(extra:Partial<PhysicalCargo>={}):PhysicalCargo=>({id:'lantern-core',x:960,y:960,z:0,angle:0,vx:0,vy:0,vz:0,spin:0,...extra});
const input=(aiming=false):MultiplayerInputFrame=>({type:'input',version:MULTIPLAYER_PROTOCOL_VERSION,sequence:1,clientTime:0,movement:0,aimAngle:0,aimPitch:0,friendsTool:5,selectedSlot:0,firing:false,sprinting:false,sliding:false,reviving:false,jumpPressed:false,dashPressed:false,aiming});
function world(solid:(x:number,y:number,z:number)=>boolean):HaulingEnvironment{
  const field={material:(x:number,y:number,z:number)=>solid(x,y,z)?2:0,exposedMaterial:(x:number,y:number,z:number)=>solid(x,y,z)?2:0} as unknown as FriendsTerrain;
  const ray=(a:{x:number;y:number;z:number},b:typeof a)=>{const d=Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z);return d<1?undefined:FriendsTerrain.prototype.raycast.call(field,{...a,dx:(b.x-a.x)/d,dy:(b.y-a.y)/d,dz:(b.z-a.z)/d},d-.5);};
  const env:HaulingEnvironment={revision:'1',solid,floor:(x,y,z,step)=>{for(let vz=Math.floor((z+step)/32)-1;vz>=-16;vz--)if(solid(Math.floor(x/32),Math.floor(y/32),vz)&&!solid(Math.floor(x/32),Math.floor(y/32),vz+1))return(vz+1)*32;},collide:()=>false,blocked:(a,b)=>Boolean(ray(a,b)),vehicles:[]};
  env.routeRope=(a,b,old)=>routeHaulingRope(a,b,env.blocked,(r,d)=>FriendsTerrain.prototype.raycast.call(field,r,d),old);return env;
}
function pullOver(solid:(x:number,y:number,z:number)=>boolean,start:PhysicalCargo,playerZ:number,anchorZ:number,playerX=1120){
  const h=new FriendsHauling({version:1,cargo:[start],delivered:false}),env=world(solid);
  const players:HaulingActor[]=[-14,14].map((dy,i)=>({id:String(i),x:playerX,y:960+dy,z:playerZ,lifeState:'alive'}));
  for(const p of players){const target={x:start.x+36,y:start.y+(p.y-start.y)*.2,z:start.z+anchorZ},dx=target.x-p.x,dy=target.y-p.y,dz=target.z-p.z-26,d=Math.hypot(dx,dy,dz);h.shoot(p,{x:dx/d,y:dy/d,z:dz/d},env,0);}
  expect(h.snapshot().ropes).toHaveLength(2);
  let maxTilt=0,bent=false;
  for(let t=0;t<6000;t+=50){if(playerZ<=start.z)for(const p of players)p.x+=12;h.update(50,t,players,new Map(players.map(p=>[p.id,input(playerZ>start.z)])),env);const q=cargoRotation(h.getCargo()[0]);maxTilt=Math.max(maxTilt,Math.hypot(q.x,q.y));bent||=h.snapshot().ropes.some(r=>Boolean(r.bends?.length));}
  return {c:h.getCargo()[0],maxTilt,bent,h,env};
}
describe('cargo rigid-body block traversal',()=>{
  it('bounds friction to skid resistance and keeps averaged contact arms in the correct body frame',()=>{
    const c=cargo(),physics=new FriendsCargoPhysics(),env=world((_x,_y,z)=>z<0);
    physics.prepare(c,env);
    for(let i=0;i<120;i++){
      physics.applyPull({x:1600,y:0,z:0},cargoWorldPoint(c,{x:36,y:0,z:26}));physics.step(1/120,c);
      for(const e of physics.world.frictionEquations){
        expect(Math.abs(e.multiplier)).toBeLessThanOrEqual(.12*8*10+.001);
        // Contacts precede integration; allow the displacement of this tick.
        const motion=(e.bi.velocity.length()+e.bj.velocity.length())/120;
        expect(e.bi.position.vadd(e.ri).distanceTo(e.bj.position.vadd(e.rj))).toBeLessThan(motion+.01);
      }
    }
    expect(c.x-960).toBeGreaterThan(30);
  });
  it('tips and climbs a full 32-unit voxel step with coordinated pulling from above',()=>{
    const {c,maxTilt,h}=pullOver((x,_y,z)=>z<0||x>=32&&z<1||x>=34&&z<2,cargo(),64,26,1088);
    expect(c.x,JSON.stringify({c,ropes:h.snapshot().ropes})).toBeGreaterThan(1024);expect(cargoBounds(c).minZ).toBeGreaterThan(31.5);expect(maxTilt).toBeGreaterThan(.05);
  });
  it('goes down a two-block ledge, falls, rotates and settles on the lower floor',()=>{
    const {c,maxTilt}=pullOver((x,_y,z)=>z<0||x<32&&z<2,cargo({z:64}),0,26);
    expect(c.x,JSON.stringify(c)).toBeGreaterThan(1080);expect(cargoBounds(c).minZ).toBeLessThan(1);expect(cargoBounds(c).minZ).toBeGreaterThan(-.3);expect(maxTilt).toBeGreaterThan(.05);
  });
  it('falls as soon as its centre of mass leaves support, rather than balancing forever on one rear corner',()=>{
    const c=cargo({x:1040,z:64,vx:90}),physics=new FriendsCargoPhysics(),env=world((x,_y,z)=>z<0||x<32&&z<2);
    for(let t=0;t<2500;t+=50){physics.prepare(c,env);for(let i=0;i<6;i++)physics.step(1/120,c);}
    expect(c.x).toBeGreaterThan(1024);expect(cargoBounds(c).minZ).toBeCloseTo(0,0);
  });
  it('does not tunnel through a full wall, even with high incoming velocity',()=>{
    const c=cargo({vx:400}),physics=new FriendsCargoPhysics(),env=world((x,_y,z)=>z<0||x===32&&z<8);
    for(let t=0;t<1000;t+=50){physics.prepare(c,env);for(let i=0;i<6;i++)physics.step(1/120,c);}
    expect(cargoBounds(c).maxX).toBeLessThan(1024.2);
  });
  it('wakes after a supporting voxel is mined away and lands on the cave floor below',()=>{
    const c=cargo({z:64}),physics=new FriendsCargoPhysics();let support=true;
    const env=world((_x,_y,z)=>z<0||support&&z===1);
    for(let t=0;t<1000;t+=50){physics.prepare(c,env);for(let i=0;i<6;i++)physics.step(1/120,c);}
    support=false;env.revision='2';for(let t=0;t<2000;t+=50){physics.prepare(c,env);for(let i=0;i<6;i++)physics.step(1/120,c);}
    expect(cargoBounds(c).minZ).toBeCloseTo(0,0);expect(c.vz).toBe(0);
  });
  it('keeps the local collision island bounded and greedily merges solid ground',()=>{
    let samples=0;const boxes=cargoTerrainColliders({minX:0,maxX:384,minY:0,maxY:384,minZ:-128,maxZ:256},(_x,_y,z)=>{samples++;return z<0;});
    expect(samples).toBe(1728);expect(boxes).toHaveLength(1);expect(boxes[0]).toMatchObject({w:384,d:384,h:128});
  });
  it('rotates the hit anchor with a toppled load and saves its orientation without live momentum',()=>{
    const c=cargo({orientation:[0,Math.sin(Math.PI/4),0,Math.cos(Math.PI/4)]}),anchor=cargoAnchor(c,{id:'a',cargoId:c.id,anchorX:36,anchorY:0,anchorZ:24,length:100,tension:0,blocked:false});
    expect(anchor.x).toBeCloseTo(c.x+24);expect(anchor.z).toBeCloseTo(c.z-36);
    const h=new FriendsHauling({version:1,cargo:[c],delivered:false}),saved=h.save(),restored=new FriendsHauling(saved).getCargo()[0];
    expect(restored.orientation).toEqual(c.orientation);expect(restored.vx).toBe(0);
    saved.cargo[0].orientation![0]=.5;expect(h.getCargo()[0].orientation![0]).toBe(0);
  });
  it('interpolates through a rotation sign flip using the shortest orientation path',()=>{
    const a=cargo({orientation:[0,0,Math.sin(.3),Math.cos(.3)]}),b=cargo({orientation:[0,0,-Math.sin(.3),-Math.cos(.3)]});
    const q=interpolateCargoRotation(a,b,.5),point=cargoWorldPoint({...a,orientation:q},{x:36,y:0,z:24});
    expect(Math.hypot(...q)).toBeCloseTo(1);expect(point.x).toBeCloseTo(a.x+Math.cos(.6)*36);
  });
  it('wraps at a voxel ledge with clear legs and unwraps when the direct path clears',()=>{
    const env=world((x,_y,z)=>z<0||x>=32&&z<1),hand={x:1120,y:960,z:58},anchor={x:1008,y:960,z:26};
    expect(env.blocked(hand,anchor)).toBe(true);const bends=env.routeRope!(hand,anchor,[])!;
    expect(bends.length).toBeGreaterThan(0);expect(bends.length).toBeLessThanOrEqual(2);
    const points=[hand,...bends,anchor];for(let i=1;i<points.length;i++)expect(env.blocked(points[i-1],points[i])).toBe(false);
    expect(env.routeRope!(hand,{...anchor,z:50},bends)).toEqual([]);
  });
  it('caps routing work rather than searching forever through a complex obstruction',()=>{
    let calls=0;const env=world((_x,_y,z)=>z<0);
    const route=routeHaulingRope({x:1120,y:960,z:26},{x:960,y:960,z:26},()=>{calls++;return true;},()=>({vx:32,vy:30,vz:0,x:1024,y:960,z:26,nx:1,ny:0,nz:0,distance:96,material:2}));
    expect(route).toBeUndefined();expect(calls).toBeLessThanOrEqual(96);expect(env.vehicles).toEqual([]);
  });
  it('uses the same fixed substeps across different host update intervals',()=>{
    const run=(dt:number)=>{const h=new FriendsHauling({version:1,cargo:[cargo({vx:90,z:128})],delivered:false}),env=world((_x,_y,z)=>z<0);h.getCargo()[0].vx=90;for(let t=0;t<2000;t+=dt)h.update(dt,t,[],new Map(),env);return h.getCargo()[0];};
    const a=run(50),b=run(20);expect(a.x).toBeCloseTo(b.x,1);expect(a.z).toBeCloseTo(b.z,1);expect(a.angle).toBeCloseTo(b.angle,1);
  });
});
