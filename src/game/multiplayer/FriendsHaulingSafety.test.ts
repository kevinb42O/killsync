import { describe, expect, it } from 'vitest';
import { FriendsHauling, type HaulingActor, type HaulingEnvironment } from './FriendsHauling';
import { MULTIPLAYER_PROTOCOL_VERSION, type MultiplayerInputFrame } from './protocol';
import { FriendsCargoPhysics } from './FriendsCargoPhysics';

const input:MultiplayerInputFrame={type:'input',version:MULTIPLAYER_PROTOCOL_VERSION,sequence:1,clientTime:0,movement:1,aimAngle:0,aimPitch:0,friendsTool:5,selectedSlot:0,firing:false,sprinting:false,sliding:false,reviving:false,jumpPressed:false,dashPressed:false};
function fixture(){
  const h=new FriendsHauling({version:1,cargo:[{id:'lantern-core',x:1000,y:1000,z:0,angle:0,vx:0,vy:0,vz:0,spin:0}],delivered:false});
  const p:HaulingActor={id:'host',x:1150,y:1000,z:0,lifeState:'alive',velocityX:0,velocityY:0,verticalVelocity:0};
  const env:HaulingEnvironment={revision:'1',floor:()=>0,collide:()=>false,blocked:()=>false,vehicles:[]};
  h.shoot(p,{x:-1,y:0,z:0},env,0);
  return {h,p,env,cargo:h.getCargo()[0],inputs:new Map([[p.id,input]])};
}
describe('rope operator safety',()=>{
  it('does not snap a grounded operator sideways when a load falls below the available cable length',()=>{
    const {h,p,env,cargo,inputs}=fixture();cargo.z=-220;
    h.update(50,50,[p],inputs,{...env,floor:()=>-400});
    expect(Math.hypot(p.x-1150,p.y-1000)).toBeLessThanOrEqual(8.01);
    expect(p.z).toBe(0);
  });
  it('cannot shortcut the operator through a wall below the rope when the load drops',()=>{
    const {h,p,env,cargo,inputs}=fixture();cargo.z=-220;
    h.update(50,50,[p],inputs,{...env,floor:()=>-400,collide:point=>point.x>=1070&&point.x<=1100});
    expect(p.x).toBeGreaterThan(1100);
  });
  it('does not transfer a penetrating cargo contact impulse into player movement velocity',()=>{
    const {h,p,env,inputs}=fixture();
    h.update(50,0,[p],inputs,env);
    h.update(50,50,[p],inputs,{...env,revision:'new obstacle',colliders:()=>[{x:1000,y:1000,z:0,w:160,d:160,h:320}]});
    expect(Math.hypot(p.velocityX??0,p.velocityY??0)).toBeLessThanOrEqual(160);
    expect(Math.hypot(p.x-1150,p.y-1000)).toBeLessThanOrEqual(8.01);
  });
  it('does not collapse the operator onto a corner when wrapped legs exceed the cable budget',()=>{
    const {h,p,env,inputs}=fixture();
    h.update(50,50,[p],inputs,{...env,routeRope:()=>[{x:1050,y:1140,z:26},{x:1000,y:1140,z:26}]});
    expect(Math.hypot(p.x-1150,p.y-1000)).toBeLessThanOrEqual(8.01);
  });
  it('publishes bounded cargo velocity after a real penetrating contact is solved',()=>{
    const {cargo,env}=fixture(),physics=new FriendsCargoPhysics();
    physics.prepare(cargo,{...env,colliders:()=>[{x:1016,y:1000,z:0,w:64,d:300,h:96}]});
    physics.step(1/120,cargo);
    expect(Math.hypot(cargo.vx,cargo.vy,cargo.vz)).toBeLessThanOrEqual(512.001);
    expect(Math.hypot(cargo.angularVelocityX??0,cargo.angularVelocityY??0,cargo.spin)).toBeLessThanOrEqual(3.001);
  });
  it('lets a falling load hang on a slipping cable without carrying the operator off a ledge',()=>{
    const {h,p,env,cargo,inputs}=fixture(),length=h.snapshot().ropes[0].length;cargo.z=-220;
    for(let t=50;t<=3000;t+=50){
      const before={x:p.x,y:p.y};h.update(50,t,[p],inputs,{...env,floor:()=>undefined});
      expect(Math.hypot(p.x-before.x,p.y-before.y)).toBeLessThanOrEqual(8.01);
      expect(p.z).toBe(0);expect(Math.hypot(p.velocityX??0,p.velocityY??0)).toBe(0);
    }
    expect(h.snapshot().ropes[0].length).toBeGreaterThan(length);expect(cargo.z).toBeLessThan(0);
  });
  it.each([{z:-1000},{vx:Infinity},{orientation:[NaN,0,0,1] as [number,number,number,number]}])('releases an unsafe cargo state before recovery can affect a player: %j',bad=>{
    const {h,p,env,cargo,inputs}=fixture();Object.assign(cargo,bad);
    h.update(50,50,[p],inputs,env);
    expect(h.snapshot().ropes).toHaveLength(0);expect(p).toMatchObject({x:1150,y:1000,z:0,velocityX:0,velocityY:0});
    expect([cargo.x,cargo.y,cargo.z,cargo.vx,cargo.vy,cargo.vz]).toSatisfy((values:number[])=>values.every(Number.isFinite));
  });
});
