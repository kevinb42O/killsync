import { describe, expect, it } from 'vitest';
import { FriendsHauling, cargoAnchor, collidePhysicalCargo, cargoFitsVehicle, cargoInDeliveryBay, haulingInteraction, securedCargoPose, ROPE_MAX_PULL, ROPE_MIN_LENGTH, type PhysicalCargo, type HaulingActor, type HaulingEnvironment } from './FriendsHauling';
import { FRIENDS_DELIVERY_BAY as goal } from '../world/FriendsHaulingGoal';
import type { FriendsVehicle } from './FriendsExpedition';
import { MULTIPLAYER_PROTOCOL_VERSION, clampInputFrame, type MultiplayerInputFrame } from './protocol';

const core = (extra:Partial<PhysicalCargo>={}):PhysicalCargo => ({id:'lantern-core',x:1000,y:1000,z:0,angle:0,vx:0,vy:0,vz:0,spin:0,...extra});
const actor = (id='host',extra:Partial<HaulingActor>={}):HaulingActor => ({id,x:1150,y:1000,z:0,lifeState:'alive',...extra});
const input = (extra:Partial<MultiplayerInputFrame>={}):MultiplayerInputFrame => ({type:'input',version:MULTIPLAYER_PROTOCOL_VERSION,sequence:1,clientTime:0,movement:0,aimAngle:0,aimPitch:0,friendsTool:5,selectedSlot:0,firing:false,sprinting:false,sliding:false,reviving:false,jumpPressed:false,dashPressed:false,...extra});
const environment = (extra:Partial<HaulingEnvironment>={}):HaulingEnvironment => ({revision:'1',floor:()=>0,collide:()=>false,blocked:()=>false,vehicles:[],...extra});
const system = (cargo=core(),delivered=false) => new FriendsHauling({version:1,cargo:[cargo],delivered});
const deck = (extra:Partial<FriendsVehicle>={}):FriendsVehicle => ({id:'sunline-0',kind:'train',x:1000,y:1000,z:14,angle:0,length:180,width:112,...extra});

describe('physical salvage hauling',()=>{
  it('adds the rope tool to the sanitized network schema',()=>{
    expect(clampInputFrame(input()).friendsTool).toBe(5);
    expect(clampInputFrame(input({friendsTool:99 as 5})).friendsTool).toBe(6);
  });
  it('attaches at the hit surface and releases on another primary action',()=>{
    const h=system(),p=actor();h.shoot(p,{x:-1,y:0,z:0},environment(),0);
    const r=h.snapshot().ropes[0];expect(r.anchorX).toBe(36);expect(r.anchorZ).toBe(26);
    expect(cargoAnchor(h.getCargo()[0],r).x).toBe(1036);
    h.shoot(p,{x:-1,y:0,z:0},environment(),1);expect(h.snapshot().ropes).toHaveLength(0);
  });
  it('does not push with a slack rope and never exceeds player pulling strength',()=>{
    const h=system(),p=actor(),env=environment();h.shoot(p,{x:-1,y:0,z:0},env,0);
    h.update(50,50,[p],new Map([[p.id,input()]]),env);
    expect(h.getCargo()[0].x).toBeCloseTo(1000,1);expect(h.snapshot().ropes[0].tension).toBe(0);
    p.x+=100;h.update(50,100,[p],new Map([[p.id,input({sprinting:true})]]),env);
    const r=h.snapshot().ropes[0];expect(r.tension*ROPE_MAX_PULL).toBeLessThanOrEqual(ROPE_MAX_PULL);
    // A large movement correction must settle over time, not snap the player
    // backwards across an entire cable span in one update.
    expect(p.x).toBeGreaterThanOrEqual(1242);
    for(let t=150;t<=1150;t+=50)h.update(50,t,[p],new Map([[p.id,input()]]),env);
    expect(p.x-cargoAnchor(h.getCargo()[0],r).x).toBeLessThanOrEqual(r.length+24.01);
  });
  it('makes aligned teammates haul substantially faster than one player',()=>{
    const pull=(count:number)=>{
      const h=system(),env=environment(),players=Array.from({length:count},(_,i)=>actor(String(i),{y:1000+(count===1?0:i===0?-14:14)}));
      for(const p of players)h.shoot(p,{x:-1,y:0,z:0},env,0);
      for(let t=0;t<2000;t+=50){for(const p of players)p.x+=18;h.update(50,t,players,new Map(players.map(p=>[p.id,input()])),env);}
      return h.getCargo()[0].x-1000;
    };
    const solo=pull(1),team=pull(2);expect(solo).toBeGreaterThan(10);expect(team).toBeGreaterThan(solo*1.25);
  });
  it('cancels opposing pulls and turns when attached off centre',()=>{
    const h=system(),env=environment(),a=actor('a'),b=actor('b',{x:850});
    h.shoot(a,{x:-1,y:0,z:0},env,0);h.shoot(b,{x:1,y:0,z:0},env,0);a.x+=40;b.x-=40;
    h.update(50,50,[a,b],new Map([[a.id,input()],[b.id,input()]]),env);expect(h.getCargo()[0].x).toBeCloseTo(1000,1);
    const turn=system(),p=actor('c',{y:1020});turn.shoot(p,{x:-1,y:0,z:0},env,0);p.x+=40;
    for(let t=0;t<500;t+=50){p.x+=12;turn.update(50,t,[p],new Map([[p.id,input()]]),env);}expect(Math.abs(turn.getCargo()[0].angle)).toBeGreaterThan(.001);
  });
  it('reels while aiming and keeps a positive minimum rope length',()=>{
    const h=system(),p=actor(),env=environment();h.shoot(p,{x:-1,y:0,z:0},env,0);
    const initial=h.snapshot().ropes[0].length;
    for(let t=0;t<3000;t+=50)h.update(50,t,[p],new Map([[p.id,input({aiming:true})]]),env);
    expect(h.snapshot().ropes[0].length).toBeLessThan(initial);expect(h.snapshot().ropes[0].length).toBeGreaterThanOrEqual(ROPE_MIN_LENGTH);
    const close=system();close.shoot(actor('near',{x:1040}),{x:-1,y:0,z:0},env,0);expect(close.snapshot().ropes[0].length).toBe(ROPE_MIN_LENGTH);
  });
  it('feeds rope out while crouching and aiming, without exceeding its reach',()=>{
    const h=system(),p=actor(),env=environment();h.shoot(p,{x:-1,y:0,z:0},env,0);const before=h.snapshot().ropes[0].length;
    h.update(50,50,[p],new Map([[p.id,input({aiming:true,sliding:true})]]),env);expect(h.snapshot().ropes[0].length).toBeGreaterThan(before);
    for(let t=100;t<8000;t+=50)h.update(50,t,[p],new Map([[p.id,input({aiming:true,sliding:true})]]),env);expect(h.snapshot().ropes[0].length).toBe(480);
  });
  it('stalls the reel under obstruction without winding up unlimited stretch or displacing a braced operator',()=>{
    const h=system(),p=actor(),env=environment();h.shoot(p,{x:-1,y:0,z:0},env,0);
    const obstructed=environment({blocked:()=>true});
    for(let t=0;t<5000;t+=50)h.update(50,t,[p],new Map([[p.id,input({aiming:true})]]),obstructed);
    const rope=h.snapshot().ropes[0],anchor=cargoAnchor(h.getCargo()[0],rope);
    expect(Math.hypot(p.x-anchor.x,p.y-anchor.y,p.z+26-anchor.z)-rope.length).toBeLessThanOrEqual(24.01);
    expect(p.x).toBe(1150);expect(rope.tension).toBe(0);
  });
  it('can strap a tipped load to the deck without standing it upright or teleporting it',()=>{
    const h=system(core({z:42,orientation:[Math.sin(Math.PI/4),0,0,Math.cos(Math.PI/4)]})),p=actor('host',{x:1100,z:14}),v=deck(),env=environment({vehicles:[v]}),before=h.getCargo()[0];
    h.interact(p,env,0);expect(before.secured?.vehicleId).toBe(v.id);expect(before.z).toBe(42);
    h.update(50,50,[p],new Map(),environment({vehicles:[{...v,x:1050,z:46,angle:Math.PI/2}]}));
    expect(before.z).toBe(74);expect(before.orientation![0]).not.toBe(0);expect(before.orientation![1]).not.toBe(0);
    h.interact({...p,x:before.x,y:before.y,z:46},environment({vehicles:[{...v,x:1050,z:46,angle:Math.PI/2}]}),100);expect(before.secured).toBeUndefined();
  });
  it('rejects shots through terrain and stops force when an attached rope is obstructed',()=>{
    const h=system(),p=actor();h.shoot(p,{x:-1,y:0,z:0},environment({blocked:()=>true}),0);expect(h.snapshot().ropes).toHaveLength(0);
    h.shoot(p,{x:-1,y:0,z:0},environment(),1);p.x+=40;
    h.update(50,50,[p],new Map([[p.id,input()]]),environment({blocked:()=>true}));
    expect(h.getCargo()[0].x).toBeCloseTo(1000,1);expect(h.snapshot().ropes[0]).toMatchObject({blocked:true,tension:0});
  });
  it('cannot tow a load through a solid wall',()=>{
    const h=system(),p=actor(),env=environment({collide:point=>point.x>1040,colliders:()=>[{x:1056,y:1000,z:0,w:32,d:600,h:320}]});h.shoot(p,{x:-1,y:0,z:0},env,0);
    for(let t=0;t<2000;t+=50){p.x+=20;h.update(50,t,[p],new Map([[p.id,input()]]),env);}
    expect(h.getCargo()[0].x).toBeLessThanOrEqual(1005);
  });
  it('falls onto lower support without teleporting onto the surface above a cave',()=>{
    const h=system(core({z:120})),env=environment({floor:(_x,_y,z)=>z>=40?40:undefined});
    for(let t=0;t<1000;t+=50)h.update(50,t,[],new Map(),env);
    expect(h.getCargo()[0].z).toBeCloseTo(40,1);expect(Math.abs(h.getCargo()[0].vz)).toBeLessThan(.1);
  });
  it('wakes a resting load after terrain support is removed',()=>{
    const h=system(),env=environment();h.update(50,0,[],new Map(),env);
    const changed=environment({revision:'2',floor:()=>-64});
    for(let t=0;t<1000;t+=50)h.update(50,t,[],new Map(),changed);
    expect(h.getCargo()[0].z).toBeCloseTo(-64,1);
  });
  it.each(['stale','disconnected','dead','flight','tool change','pilot'])('releases ropes for %s players',reason=>{
    const h=system(),p=actor(),env=environment();h.shoot(p,{x:-1,y:0,z:0},env,0);
    if(reason==='dead')p.lifeState='eliminated';if(reason==='flight')p.friendsDevFlight=true;
    if(reason==='pilot')env.vehicles=[deck({kind:'aircraft',pilotId:p.id})];
    h.update(50,50,reason==='disconnected'?[]:[p],reason==='stale'?new Map():new Map([[p.id,input({friendsTool:reason==='tool change'?0:5})]]),env);
    expect(h.snapshot().ropes).toHaveLength(0);
  });
  it('only secures settled cargo fully inside a deck and never teleports a ground load aboard',()=>{
    const h=system(),p=actor('host',{x:1100}),v=deck(),env=environment({vehicles:[v]});
    h.interact(p,env,0);expect(h.getCargo()[0].secured).toBeUndefined();
    h.getCargo()[0].z=14;h.getCargo()[0].vx=50;h.interact(p,env,1);expect(h.getCargo()[0].secured).toBeUndefined();
    h.getCargo()[0].vx=0;h.interact(p,env,2);expect(h.getCargo()[0].secured?.vehicleId).toBe(v.id);
    expect(cargoFitsVehicle(core({x:1080,z:14}),v)).toBe(false);expect(cargoFitsVehicle(core(),deck({closed:true}))).toBe(false);
  });
  it('carries secured cargo through vehicle turns and elevation, then releases it in place',()=>{
    const h=system(core({x:1020,z:14})),p=actor(),v=deck(),env=environment({vehicles:[v]});h.interact(p,env,0);
    const moved=deck({x:2000,y:2000,z:300,angle:Math.PI/2});env.vehicles=[moved];
    h.update(50,50,[p],new Map(),env);expect(h.getCargo()[0]).toMatchObject({x:2000,y:2020,z:300,angle:Math.PI/2});
    Object.assign(p,{x:2000,y:2120,z:300});h.interact(p,env,100);expect(h.getCargo()[0].secured).toBeUndefined();expect(h.getCargo()[0].y).toBe(2020);
  });
  it('supports aircraft cargo while reserving cockpit space',()=>{
    const v=deck({id:'sunskiff',kind:'aircraft',length:280,width:160});
    expect(cargoFitsVehicle(core({x:960}),v)).toBe(true);expect(cargoFitsVehicle(core({x:1050}),v)).toBe(false);
  });
  it('persists positions, delivery and vehicle-local attachments, but never live player ropes',()=>{
    const c=core({secured:{vehicleId:'sunline-0',x:20,y:4,angle:.2}}),h=system(c,true),save=JSON.parse(JSON.stringify(h.save()));
    expect(new FriendsHauling(save).save()).toEqual(h.save());expect(new FriendsHauling(save).snapshot().ropes).toHaveLength(0);
    const pose=securedCargoPose(c,[deck({angle:Math.PI})]);expect(pose.x).toBeCloseTo(980);expect(pose.y).toBeCloseTo(996);
    save.cargo[0].x=NaN;expect(new FriendsHauling(save).getCargo()[0].x).not.toBeNaN();
  });
  it('registers one delivery in the marked bay and keeps the recovered core in the world',()=>{
    const h=system(core({x:goal.x,y:goal.y,z:goal.z})),p=actor('host',{x:goal.x+100,y:goal.y,z:goal.z}),env=environment({floor:()=>goal.z});
    expect(haulingInteraction(h.getCargo(),p,[],false)?.label).toBe('Deliver core · Delivery Bay');
    h.interact(p,env,0);expect(h.save().delivered).toBe(true);expect(h.getCargo()).toHaveLength(1);
    expect(h.snapshot().feedback.host.message).toContain('DELIVERY COMPLETE');
    h.interact(p,env,100);expect(h.snapshot().feedback.host.message).not.toContain('DELIVERY COMPLETE');
  });
  it('delivers a tipped load resting on its side, while rejecting a load still above the surface',()=>{
    const c=core({x:goal.x,y:goal.y,z:goal.z+28,orientation:[Math.sin(Math.PI/4),0,0,Math.cos(Math.PI/4)]}),p=actor('host',{x:goal.x+100,y:goal.y,z:goal.z}),env=environment({floor:()=>goal.z});
    const tipped=system(c);tipped.interact(p,env,0);expect(tipped.save().delivered).toBe(true);
    const raised=system({...c,z:goal.z+80});raised.interact(p,env,0);expect(raised.save().delivered).toBe(false);
  });
  it('requires the entire rotated hull in the bay, at deck height, settled and unstrapped',()=>{
    const c=core({x:goal.x,y:goal.y,z:goal.z}),env=environment({floor:()=>goal.z});
    const invalid=[{x:goal.x+50},{y:goal.y+55},{x:goal.x+36,angle:Math.PI/4},{z:goal.z-64},{z:goal.z+20},{vx:30},{spin:1},{angularVelocityX:1},{secured:{vehicleId:'sunline-0',x:0,y:0,angle:0}}];
    for(const extra of invalid){
      const load={...c,...extra},h=system(load),p=actor('host',{x:load.x+80,y:load.y,z:load.z});
      Object.assign(h.getCargo()[0],load);
      h.interact(p,env,0);expect(h.save().delivered,JSON.stringify(extra)).toBe(false);
    }
    expect(cargoInDeliveryBay({...c,x:goal.x+34,angle:Math.PI/4})).toBe(true);
    const h=system(c);h.interact(actor('host',{x:goal.x+80,y:goal.y,z:goal.z}),environment({floor:()=>goal.z-64}),0);expect(h.save().delivered).toBe(false);
  });
  it('requires a clear path to the core for the delivery interaction',()=>{
    const h=system(core({x:goal.x,y:goal.y,z:goal.z}));
    expect(h.interact(actor('host',{x:goal.x+100,y:goal.y,z:goal.z}),environment({floor:()=>goal.z,blocked:()=>true}),0)).toBe(false);
    expect(h.save().delivered).toBe(false);
  });
  it('resolves player collision in the cargo orientation',()=>{
    const point={x:1000,y:1000};expect(collidePhysicalCargo([core({angle:Math.PI/2})],point,0,18)).toBe(true);
    expect(Math.abs(point.x-1000)).toBeGreaterThanOrEqual(46);
    expect(collidePhysicalCargo([core()],{x:1000,y:1000},48,18)).toBe(false);
  });
});
