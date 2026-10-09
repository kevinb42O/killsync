import { RETREAT_SITES,RETREAT_SEATS } from '../world/FriendsRetreatSites';
import { describe,it,expect } from 'vitest';
import { FriendsCampfireSimulation, CAMPFIRE_MAX_FUEL, campfireHeat, MARSHMALLOW_TOOL, marshmallowReachTip } from './FriendsCampfireSimulation';
import { CAMPFIRE_SEATS } from './FriendsCampfireSeats';
import { FRIENDS_CAMPFIRE } from '../world/FriendsRegion';
import { FriendsSimulation } from './FriendsSimulation';
import { quantizeAngle,quantizePitch } from './CoopSimulation';
import { MULTIPLAYER_PROTOCOL_VERSION } from './protocol';
import { packKey } from './FriendsFrontier';
import { SnapshotDecoder, compactSnapshotWirePayload } from './snapshotReplication';
import { validFriendsCommand } from './FriendsCommands';
const player=(id='host')=>({...CAMPFIRE_SEATS[0],id,label:id,lifeState:'alive',friendsSeat:{vehicleId:FRIENDS_CAMPFIRE.id,index:0}});
const input=(firing=true,angle=CAMPFIRE_SEATS[0].angle+Math.PI)=>({type:'input' as const,version:MULTIPLAYER_PROTOCOL_VERSION,sequence:1,clientTime:0,movement:0,aimAngle:quantizeAngle(angle),aimPitch:quantizePitch(0),selectedSlot:0,firing,sprinting:false,sliding:false,reviving:false,jumpPressed:false,dashPressed:false,friendsTool:MARSHMALLOW_TOOL});
function advance(fire:FriendsCampfireSimulation,seconds:number,held=true){const p=player();for(let i=0;i<seconds*20;i++)fire.update(50,[p],new Map([[p.id,input(held)]]));return fire.snapshot().roasts.host;}
describe('timber fuel and marshmallow roasting',()=>{
  it.each([0,Math.PI/2,Math.PI,Math.PI*1.5])('roasts the standing tip over the fire from angle %s, and retracts on release',angle=>{
    const fire=new FriendsCampfireSimulation(),p={...player(),friendsSeat:undefined,x:FRIENDS_CAMPFIRE.x-Math.cos(angle)*124,y:FRIENDS_CAMPFIRE.y-Math.sin(angle)*124,z:FRIENDS_CAMPFIRE.z};
    const held={...input(true,angle),aimPitch:quantizePitch(Math.atan2(-2,124))};
    for(let i=0;i<160;i++)fire.update(50,[p],new Map([[p.id,held]]));
    expect(fire.snapshot().roasts.host).toMatchObject({roasting:true});
    expect(fire.snapshot().roasts.host.toast).toBeGreaterThan(.3);
    const tip=fire.snapshot().roasts.host.reach!;
    expect(Math.hypot(tip.x-FRIENDS_CAMPFIRE.x,tip.y-FRIENDS_CAMPFIRE.y,tip.z-FRIENDS_CAMPFIRE.z-48)).toBeLessThan(1);
    fire.update(50,[p],new Map([[p.id,{...held,firing:false}]]));
    expect(fire.snapshot().roasts.host.roasting).toBe(false);expect(fire.snapshot().roasts.host.reach).toBeUndefined();
  });
  it('extends while walking or looking away, but cooks only when the finite standing tip reaches the flames',()=>{
    const fire=new FriendsCampfireSimulation(),p={...player(),friendsSeat:undefined,x:FRIENDS_CAMPFIRE.x-240,y:FRIENDS_CAMPFIRE.y,z:FRIENDS_CAMPFIRE.z};
    const check=(actor:typeof p,frame= input(true,0))=>{fire.update(50,[actor],new Map([[p.id,frame]]));return fire.snapshot().roasts.host;};
    expect(check(p)).toMatchObject({roasting:false,toast:0}); // A ray hits, but the stick cannot reach.
    expect(check(p).reach).toEqual(marshmallowReachTip(p,0,quantizePitch(0)/65535*Math.PI*.88-Math.PI*.44));
    const nearby={...p,x:FRIENDS_CAMPFIRE.x-124};
    expect(check(nearby,input(true,Math.PI))).toMatchObject({roasting:false,toast:0});
    expect(check(nearby,{...input(true,0),aimPitch:quantizePitch(.8)})).toMatchObject({roasting:false,toast:0});
    expect(check({...nearby,x:FRIENDS_CAMPFIRE.x-10})).toMatchObject({roasting:false,toast:0});
    const roasting=check(nearby);expect(roasting.roasting).toBe(true);
    const sim=new FriendsSimulation([{id:'host',label:'host',color:'#fff'}]);Object.assign(sim['players'].get('host')!,nearby);
    sim.setInput('host',input(true,0));sim.tick(50);
    expect(new SnapshotDecoder().decode(compactSnapshotWirePayload(sim.createSnapshot()),1)!.friends!.campfire!.roasts.host.reach).toEqual(roasting.reach);
    expect(fire.eat(nearby)).toBe(true);expect(fire.snapshot().roasts.host.reach).toBeUndefined();
    expect(check(nearby).reach).toBeUndefined();
  });
  it.each([['raw',0],['golden',10],['dark',16],['burning',20],['charred',26]] as const)('eats a %s marshmallow and waits five seconds before refilling',(_stage,seconds)=>{
    const fire=new FriendsCampfireSimulation(),p=player();advance(fire,seconds);
    const before=fire.snapshot().roasts.host;
    expect(fire.eat(p)).toBe(true);
    expect(fire.snapshot().roasts.host).toMatchObject({eatingMs:1000,roasting:false,burningMs:0});
    fire.update(100,[p],new Map([[p.id,input(true)]]));
    expect(fire.snapshot().roasts.host.eatingMs).toBe(900);
    expect(fire.snapshot().roasts.host.toast).toBe(before?.toast??0);
    expect(fire.eat(p)).toBe(false);
    for(let i=0;i<9;i++)fire.update(100,[p],new Map([[p.id,input(true)]]));
    expect(fire.snapshot().roasts.host.refillMs).toBe(5000);
    expect(fire.snapshot().roasts.host.eatingMs).toBeUndefined();
    expect(fire.eat(p)).toBe(false);expect(fire.replace(p)).toBe(false);
    for(let i=0;i<49;i++)fire.update(100,[p],new Map([[p.id,input(true)]]));
    expect(fire.snapshot().roasts.host).toMatchObject({refillMs:100,toast:before?.toast??0,roasting:false,serial:before?.serial??1});
    fire.update(100,[p],new Map([[p.id,input(true)]]));
    expect(fire.snapshot().roasts.host).toEqual({toast:0,heat:0,roasting:false,burningMs:0,charred:false,serial:(before?.serial??1)+1});
    expect(fire.eat({...p,friendsSeat:undefined},MARSHMALLOW_TOOL)).toBe(true);
    expect(fire.eat({...p,lifeState:'downed'})).toBe(false);
    expect(fire.eat({...p,friendsDevFlight:true})).toBe(false);
  });
  it('replicates eating per player and does not restart a bite when a command is retried',()=>{
    const sim=new FriendsSimulation([{id:'host',label:'host',color:'#fff'},{id:'guest',label:'guest',color:'#fc0'}]);
    Object.assign(sim['players'].get('host')!,player());Object.assign(sim['players'].get('guest')!,player('guest'));
    sim.tick(50);const guestBefore=sim.createSnapshot().friends!.campfire!.roasts.guest;
    const request={requestId:1,action:'campfire_eat' as const};
    expect(validFriendsCommand(request,false)).toBe(true);
    expect(sim.friendsAction('host',request).ok).toBe(true);
    sim.tick(100);const before=sim.createSnapshot().friends!.campfire!;
    expect(sim.friendsAction('host',request).ok).toBe(true);
    expect(sim.createSnapshot().friends!.campfire!.roasts.host.eatingMs).toBe(before.roasts.host.eatingMs);
    expect(before.roasts.guest).toEqual(guestBefore);
    expect(new SnapshotDecoder().decode(compactSnapshotWirePayload(sim.createSnapshot()),1)!.friends!.campfire).toEqual(before);
    for(let i=0;i<19;i++)sim.tick(50);
    const waiting=sim.createSnapshot();expect(waiting.friends!.campfire!.roasts.host.refillMs).toBe(5000);
    expect(new SnapshotDecoder().decode(compactSnapshotWirePayload(waiting),2)!.friends!.campfire).toEqual(waiting.friends!.campfire);
    delete sim['players'].get('host')!.friendsSeat;sim.tick(50);
    expect(sim.createSnapshot().friends!.campfire!.roasts.host).toBeDefined();
  });
  it('keeps a toasted stick across standing, other Fun slots and walking; only roasts within fire reach',()=>{
    const fire=new FriendsCampfireSimulation(),p=player();advance(fire,10);const toast=fire.snapshot().roasts.host.toast;
    const standing={...p,friendsSeat:undefined};
    fire.update(50,[standing],new Map([[p.id,input(false)]]));expect(fire.snapshot().equipped).toEqual(['host']);expect(fire.snapshot().roasts.host.toast).toBeGreaterThanOrEqual(toast);
    for(let i=0;i<60;i++)fire.update(50,[p],new Map([[p.id,{...input(),friendsTool:9}]]));
    expect(fire.snapshot().equipped).toEqual([]);const cooled=fire.snapshot().roasts.host.toast;
    fire.update(50,[{...standing,x:p.x+1000}],new Map([[p.id,input(true)]]));
    expect(fire.snapshot().equipped).toEqual(['host']);expect(fire.snapshot().roasts.host).toMatchObject({toast:cooled,roasting:false});
    expect(fire.eat(standing,9)).toBe(false);expect(fire.replace(standing,9)).toBe(false);
    expect(fire.eat(standing,MARSHMALLOW_TOOL)).toBe(true);
    for(let i=0;i<60;i++)fire.update(100,[standing],new Map([[p.id,{...input(false),friendsTool:8}]]));
    expect(fire.snapshot().roasts.host.toast).toBe(0);expect(fire.replace(standing,MARSHMALLOW_TOOL)).toBe(true);
    fire.update(50,[{...standing,lifeState:'dead'}],new Map());expect(fire.snapshot().roasts).toEqual({});
  });
  it('eats with secondary input once while standing and replicates the equipped stick',()=>{
    const sim=new FriendsSimulation([{id:'host',label:'host',color:'#fff'}]),p=sim['players'].get('host')!;
    for(let i=0;i<4;i++){sim.setInput(p.id,{...input(false),sequence:i+1,altFireActionId:1});sim.tick(50);}
    const frame=sim.createSnapshot();expect(frame.friends!.campfire!.equipped).toEqual(['host']);
    expect(frame.friends!.campfire!.roasts.host.eatingMs).toBe(850);
    expect(new SnapshotDecoder().decode(compactSnapshotWirePayload(frame),1)!.friends!.campfire).toEqual(frame.friends!.campfire);
  });
  it('spends real carried timber even in creative tests, rejects empty/far/dead players and replays a request without spending twice',()=>{
    const sim=new FriendsSimulation([{id:'host',label:'host',color:'#fff'}]),p=sim['players'].get('host')!;
    Object.assign(p,player());const frontier=sim['friendsFrontier']!,pack=frontier.pack(p),before=pack.wood;
    const request={requestId:1,action:'campfire_fuel' as const};expect(sim.friendsAction(p.id,request).ok).toBe(true);
    expect(pack.wood).toBe(before-1);expect(sim['friends']!.campfire.fuelSeconds).toBe(30);
    expect(sim.friendsAction(p.id,request).ok).toBe(true);expect(pack.wood).toBe(before-1);
    pack.wood=0;expect(sim.friendsAction(p.id,{...request,requestId:2}).ok).toBe(false);
    pack.wood=4;p.x+=600;expect(sim.friendsAction(p.id,{...request,requestId:3}).ok).toBe(false);expect(pack.wood).toBe(4);
    Object.assign(p,player(),{lifeState:'downed'});expect(sim.friendsAction(p.id,{...request,requestId:4}).ok).toBe(false);
    const decoded=new SnapshotDecoder().decode(compactSnapshotWirePayload(sim.createSnapshot()),1)!;
    expect(decoded.friends!.campfire!.fuelSeconds).toBe(30);expect(decoded.friends!.frontier!.packs[packKey(p)].wood).toBe(4);
  });
  it('caps the bonfire, saves remaining fuel and burns added logs back down to a cozy base fire',()=>{
    const fire=new FriendsCampfireSimulation(CAMPFIRE_MAX_FUEL);expect(fire.fuelError(player())).toMatch(/plenty/);
    fire.update(100,[player()],new Map());expect(fire.fuelSeconds).toBeCloseTo(179.9);
    expect(new FriendsCampfireSimulation(fire.fuelSeconds).fuelSeconds).toBe(fire.fuelSeconds);
    expect(new FriendsCampfireSimulation(Infinity).fuelSeconds).toBe(0);
    const low=new FriendsCampfireSimulation(1);advance(low,2,false);expect(low.fuelSeconds).toBe(0);expect(campfireHeat(0)).toBe(1);
  });
  it('requires a held roasting action aimed at the fire and lets a pulled-back marshmallow cool',()=>{
    const fire=new FriendsCampfireSimulation(),p=player();
    for(let i=0;i<100;i++)fire.update(50,[p],new Map([[p.id,input(true,CAMPFIRE_SEATS[0].angle)]]));
    expect(fire.snapshot().roasts.host.toast).toBe(0);
    expect(advance(fire,8).toast).toBeGreaterThan(.3);
    advance(fire,3,false);const cooled=fire.snapshot().roasts.host.toast;
    advance(fire,4,false);expect(fire.snapshot().roasts.host.toast).toBe(cooled);expect(fire.snapshot().roasts.host.roasting).toBe(false);
  });
  it('browns, catches fire, burns out to char and can be replaced; hotter wood-fed fires roast faster',()=>{
    const fire=new FriendsCampfireSimulation();const golden=advance(fire,10);expect(golden.toast).toBeGreaterThan(.4);expect(golden.burningMs).toBe(0);
    const burning=advance(fire,10);expect(burning.burningMs).toBeGreaterThan(0);
    const charred=advance(fire,6,false);expect(charred.charred).toBe(true);expect(charred.burningMs).toBe(0);
    expect(fire.replace(player())).toBe(true);expect(fire.snapshot().roasts.host.toast).toBe(0);
    const hot=new FriendsCampfireSimulation(180),cold=new FriendsCampfireSimulation();expect(advance(hot,10).toast).toBeGreaterThan(advance(cold,10).toast);
    fire.update(50,[{...player(),friendsSeat:undefined}],new Map());expect(fire.snapshot().roasts.host).toMatchObject({toast:0,roasting:false});expect(fire.snapshot().equipped).toEqual([]);
  });
  it('keeps cooking per player, replicates it, suppresses tool/weapon fire while seated, and keeps the selected marshmallow after standing',()=>{
    const sim=new FriendsSimulation([{id:'host',label:'host',color:'#fff'},{id:'guest',label:'guest',color:'#fc0'}]),p=sim['players'].get('host')!,guest=sim['players'].get('guest')!;
    Object.assign(p,player());Object.assign(guest,player('guest'),CAMPFIRE_SEATS[1],{friendsSeat:{vehicleId:FRIENDS_CAMPFIRE.id,index:1}});
    const weapon=p.weaponStates[0],ammo=weapon.magazineAmmo;
    for(let i=0;i<180;i++){sim.setInput(p.id,{...input(),sequence:i+1,friendsTool:MARSHMALLOW_TOOL});sim.tick(50);}
    const snapshot=sim.createSnapshot();expect(snapshot.friends!.campfire!.roasts.host.toast).toBeGreaterThan(.3);expect(snapshot.friends!.campfire!.roasts.guest.toast).toBe(0);
    expect(weapon.magazineAmmo).toBe(ammo);expect(snapshot.projectiles).toEqual([]);
    expect(new SnapshotDecoder().decode(compactSnapshotWirePayload(snapshot),1)!.friends!.campfire).toEqual(snapshot.friends!.campfire);
    sim.setInput(p.id,{...input(false),sequence:181,jumpPressed:true});sim.tick(50);expect(p.friendsSeat).toBeUndefined();expect(sim.createSnapshot().friends!.campfire!.roasts.host).toBeDefined();
  });
});

describe('Ember campfire roasting',()=>{
  const camp=RETREAT_SITES.find(s=>s.id==='ember-camp')!;
  function emberInput(p:{x:number;y:number;z:number}){
    const dx=camp.x-p.x,dy=camp.y-p.y;
    return {...input(true,Math.atan2(dy,dx)),aimPitch:quantizePitch(Math.atan2(camp.z+42*.27-p.z-45,Math.hypot(dx,dy)))};
  }
  it.each(RETREAT_SEATS.filter(s=>s.siteId==='ember-camp'))('roasts from Ember seat $index without aiming at the distant commons',seat=>{
    const fire=new FriendsCampfireSimulation(),p={...player(),...seat,friendsSeat:{vehicleId:camp.id,index:seat.index}};
    for(let i=0;i<240;i++)fire.update(50,[p],new Map([[p.id,emberInput(p)]]));
    expect(fire.snapshot().roasts.host).toMatchObject({roasting:true,charred:false});expect(fire.snapshot().roasts.host.toast).toBeGreaterThan(.4);
    const away={...emberInput(p),aimAngle:quantizeAngle(Math.atan2(camp.y-p.y,camp.x-p.x)+Math.PI)};
    fire.update(50,[p],new Map([[p.id,away]]));expect(fire.snapshot().roasts.host.roasting).toBe(false);
    expect(fire.eat(p)).toBe(true);
  });
  it('cooks a standing marshmallow only where the visible finite tip reaches the small flame',()=>{
    const fire=new FriendsCampfireSimulation(),pitch=Math.asin((48*.27-50)/124),p={...player(),friendsSeat:undefined,x:camp.x-124*Math.cos(pitch),y:camp.y,z:camp.z};
    const frame={...input(true,0),aimPitch:quantizePitch(pitch)};
    for(let i=0;i<100;i++)fire.update(50,[p],new Map([[p.id,frame]]));expect(fire.snapshot().roasts.host.roasting).toBe(true);
    fire.update(50,[{...p,x:p.x-150}],new Map([[p.id,frame]]));expect(fire.snapshot().roasts.host.roasting).toBe(false);
  });
  it('spends timber locally, replicates the new fuel and restores it independently of the commons',()=>{
    const sim=new FriendsSimulation([{id:'host',label:'host',color:'#fff'}]),p=sim['players'].get('host')!;
    Object.assign(p,{x:camp.x+60,y:camp.y,z:camp.z});const pack=sim['friendsFrontier']!.pack(p),before=pack.wood;
    expect(sim.friendsAction(p.id,{requestId:90,action:'campfire_fuel'}).ok).toBe(true);expect(pack.wood).toBe(before-1);
    expect(sim['friends']!.campfire.fuelSeconds).toBe(0);expect(sim['friends']!.campfire.snapshot().siteFuelSeconds?.[camp.id]).toBe(30);
    const snapshot=sim.createSnapshot();expect(new SnapshotDecoder().decode(compactSnapshotWirePayload(snapshot),1)!.friends!.campfire!.siteFuelSeconds?.[camp.id]).toBe(30);
    const restored=new FriendsCampfireSimulation(0,sim['friends']!.campfire.siteFuelSave());expect(restored.snapshot().siteFuelSeconds?.[camp.id]).toBe(30);
    restored.setActiveSites([]);expect(restored.fuelError(p)).toBeDefined();restored.update(50,[p],new Map([[p.id,emberInput(p)]]));expect(restored.snapshot().roasts.host.roasting).toBe(false);
  });
});
