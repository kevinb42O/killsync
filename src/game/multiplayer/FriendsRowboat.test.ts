import { describe, expect, it } from 'vitest';
import { FriendsRowboat, ROWBOAT_ID, rowboatSeatPoint } from './FriendsRowboat';
import { MULTIPLAYER_PROTOCOL_VERSION, type MultiplayerInputFrame } from './protocol';
import { FriendsTerrain } from '../world/FriendsTerrain';
import { FriendsSimulation } from './FriendsSimulation';
import { FRIENDS_RIVERS } from '../world/FriendsHydrology';
import { friendsWaterAt } from '../world/FriendsWaterSurface';
import { vehicleWorldPoint } from './FriendsVehiclePose';
import { friendsVehicleCeiling, friendsVehicleFloor } from './FriendsExpedition';
const command=(sequence:number,extra:Partial<MultiplayerInputFrame>={}):MultiplayerInputFrame=>({type:'input',version:MULTIPLAYER_PROTOCOL_VERSION,sequence,clientTime:0,movement:0,aimAngle:0,aimPitch:32768,selectedSlot:0,firing:false,fireActionId:0,altFireActionId:0,sprinting:false,sliding:false,reviving:false,jumpPressed:false,dashPressed:false,...extra});
const actor=(id:string)=>({id,x:13680,y:22560,z:136.5,angle:0,lifeState:'alive',friendsSeat:undefined as {vehicleId:string;index:number}|undefined,verticalVelocity:0,crouching:false});
function crew(){const boat=new FriendsRowboat({x:12128,y:23600,angle:0}),a=actor('a'),b=actor('b');Object.assign(a,boat.vehicle());a.id='a';Object.assign(b,boat.vehicle());b.id='b';a.y+=20;b.y-=20;boat.update(50,0,[a,b],new Map([['a',command(0)],['b',command(0)]]));boat.interact(a,[a,b]);boat.interact(b,[a,b]);return {boat,a,b};}
function row(boat:FriendsRowboat,a:ReturnType<typeof actor>,b:ReturnType<typeof actor>,left:number,right:number,back=false){for(let n=1;n<=120;n++){const stroke=Math.floor((n-1)/20)+1;boat.update(50,n*50,[a,b],new Map([['a',command(n,back?{altFireActionId:left?stroke:0}:{fireActionId:left?stroke:0})],['b',command(n,back?{altFireActionId:right?stroke:0}:{fireActionId:right?stroke:0})]]));}}
describe('shared manual two-person rowboat',()=>{
  it('centres a solo rower and uses each stroke to drive both oars straight',()=>{
    const boat=new FriendsRowboat({x:12128,y:23600,angle:0}),a=actor('a');
    Object.assign(a,boat.vehicle());a.id='a';
    expect(boat.interact(a,[a])).toBe(true);
    expect(a.friendsSeat?.vehicleId).toBe(ROWBOAT_ID);
    expect(Math.hypot(a.x-rowboatSeatPoint(boat.vehicle(),a.friendsSeat!.index,true).x,a.y-rowboatSeatPoint(boat.vehicle(),a.friendsSeat!.index,true).y)).toBeLessThan(.001);
    for(let n=1;n<=120;n++)boat.update(50,n*50,[a],new Map([['a',command(n,{fireActionId:Math.floor((n-1)/20)+1})]]));
    const v=boat.vehicle();
    expect(v.x).toBeGreaterThan(12128);
    expect(Math.abs(v.angle)).toBeLessThan(.001);
    expect(v.rowing!.left.atMs).toBe(v.rowing!.right.atMs);
    expect(v.rowing!.left.playerId).toBe('a');expect(v.rowing!.right.playerId).toBe('a');
    expect(Math.hypot(a.x-rowboatSeatPoint(v,a.friendsSeat!.index,true).x,a.y-rowboatSeatPoint(v,a.friendsSeat!.index,true).y)).toBeLessThan(.001);
    expect(boat.interact(a,[a])).toBe(true);
    expect(boat.vehicle().rowing!.left.playerId).toBeUndefined();expect(boat.vehicle().rowing!.right.playerId).toBeUndefined();
  });
  it('lets a solo rower tap either side oar to turn independently',()=>{
    const leftBoat=new FriendsRowboat({x:12128,y:23600,angle:0}),leftRower=actor('left');Object.assign(leftRower,leftBoat.vehicle());leftRower.id='left';
    expect(leftBoat.interact(leftRower,[leftRower])).toBe(true);
    for(let n=1;n<=24;n++)leftBoat.update(50,n*50,[leftRower],new Map([['left',command(n,{movement:n===1?4:0})]]));
    const leftStrokes=leftBoat.vehicle().rowing!;
    expect(leftStrokes.left.atMs).toBe(50);expect(leftStrokes.right.atMs).toBe(-10000);expect(leftBoat.vehicle().angle).toBeLessThan(-.1);
    const rightBoat=new FriendsRowboat({x:12128,y:23600,angle:0}),rightRower=actor('right');Object.assign(rightRower,rightBoat.vehicle());rightRower.id='right';
    expect(rightBoat.interact(rightRower,[rightRower])).toBe(true);
    for(let n=1;n<=24;n++)rightBoat.update(50,n*50,[rightRower],new Map([['right',command(n,{movement:n===1?8:0})]]));
    const rightStrokes=rightBoat.vehicle().rowing!;
    expect(rightStrokes.right.atMs).toBe(50);expect(rightStrokes.left.atMs).toBe(-10000);expect(rightBoat.vehicle().angle).toBeGreaterThan(.1);
    const reverseBoat=new FriendsRowboat({x:12128,y:23600,angle:0}),reverseRower=actor('reverse');Object.assign(reverseRower,reverseBoat.vehicle());reverseRower.id='reverse';
    expect(reverseBoat.interact(reverseRower,[reverseRower])).toBe(true);
    reverseBoat.update(50,50,[reverseRower],new Map([['reverse',command(1,{movement:6})]]));
    expect(reverseBoat.vehicle().rowing!.left.direction).toBe(-1);expect(reverseBoat.vehicle().rowing!.right.atMs).toBe(-10000);
  });
  it('splits control when a second rower boards, then recentres the remaining rower when one leaves',()=>{
    const boat=new FriendsRowboat({x:12128,y:23600,angle:0}),a=actor('a'),b=actor('b');
    Object.assign(a,boat.vehicle());a.id='a';Object.assign(b,boat.vehicle());b.id='b';
    expect(boat.interact(a,[a,b])).toBe(true);
    b.x=boat.vehicle().x;b.y=boat.vehicle().y;b.z=boat.vehicle().z;
    expect(boat.interact(b,[a,b])).toBe(true);
    const aIndex=a.friendsSeat!.index,bIndex=b.friendsSeat!.index;
    expect(aIndex).not.toBe(bIndex);
    boat.update(50,50,[a,b],new Map([['a',command(1,{fireActionId:1,movement:4})],['b',command(1)]]));
    const v=boat.vehicle(),aSeat=rowboatSeatPoint(v,aIndex),bSeat=rowboatSeatPoint(v,bIndex);
    expect(Math.hypot(a.x-aSeat.x,a.y-aSeat.y)).toBeLessThan(.001);
    expect(Math.hypot(b.x-bSeat.x,b.y-bSeat.y)).toBeLessThan(.001);
    expect(aIndex===0?v.rowing!.left.atMs:v.rowing!.right.atMs).toBe(50);
    expect(aIndex===0?v.rowing!.right.atMs:v.rowing!.left.atMs).toBe(-10000);
    expect(boat.interact(b,[a,b])).toBe(true);
    boat.update(50,100,[a,b],new Map([['a',command(2)],['b',command(2)]]));
    const centred=rowboatSeatPoint(boat.vehicle(),aIndex,true);
    expect(Math.hypot(a.x-centred.x,a.y-centred.y)).toBeLessThan(.001);
    expect(b.friendsSeat).toBeUndefined();
  });
  it('reserves exactly two opposing seats and releases them onto the clear deck',()=>{
    const {boat,a,b}=crew(),c=actor('c');Object.assign(c,boat.vehicle());c.id='c';
    expect(a.friendsSeat?.index).toBe(0);expect(b.friendsSeat?.index).toBe(1);expect(boat.interact(c,[a,b,c])).toBe(false);
    expect(friendsVehicleCeiling([boat.vehicle()],a.x,a.y,a.z)).toBeUndefined();
    expect(boat.interact(a,[a,b])).toBe(true);expect(a.friendsSeat).toBeUndefined();
    expect(friendsVehicleFloor([boat.vehicle()],a.x,a.y,a.z)).toBeCloseTo(a.z);
    expect(Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)).toBeGreaterThanOrEqual(38);
  });
  it('uses matched strokes for straight propulsion, differential strokes for turning and separate backwater edges',()=>{
    const straight=crew(),turn=crew(),reverse=crew();row(straight.boat,straight.a,straight.b,1,1);row(turn.boat,turn.a,turn.b,1,0);row(reverse.boat,reverse.a,reverse.b,1,1,true);
    expect(straight.boat.vehicle().x).toBeGreaterThan(12300);expect(Math.abs(straight.boat.vehicle().angle)).toBeLessThan(.001);
    expect(turn.boat.vehicle().angle).toBeLessThan(-.5);expect(reverse.boat.vehicle().x).toBeLessThan(11900);
    const v=straight.boat.vehicle(),seat=rowboatSeatPoint(v,0);expect(straight.a.x).toBeCloseTo(seat.x,6);expect(straight.a.z).toBeCloseTo(seat.z,6);
  });
  it('does not turn a held key, held mouse button or replayed action id into a motor',()=>{
    const {boat,a,b}=crew();for(let i=1;i<160;i++)boat.update(50,i*50,[a,b],new Map([['a',command(i,{movement:1,firing:true,fireActionId:1})],['b',command(i,{movement:1,firing:true,fireActionId:1})]]));
    expect(boat.vehicle().rowing!.left.atMs).toBe(50);expect(boat.vehicle().rowing!.right.atMs).toBe(50);expect(boat.vehicle().rowing!.speed).toBeLessThan(.01);
    const x=boat.vehicle().x;for(let i=160;i<200;i++)boat.update(50,i*50,[a,b],new Map());expect(boat.vehicle().x-x).toBeLessThan(.01);
  });
  it('keeps the full hull and crew clear through every route and both existing rail underpasses',()=>{
    const terrain=new FriendsTerrain();
    for(const river of FRIENDS_RIVERS)for(let i=0;i<river.points.length;i+=8){
      const p=river.points[i],angle=Math.atan2(p.ty,p.tx),boat=new FriendsRowboat({x:p.x,y:p.y,angle},terrain),v=boat.vehicle();
      expect(v.x,`${river.id} blocked at ${p.distance}`).toBe(p.x);
      for(const [u,w]of [[0,0],[-68,0],[68,0],[-38,-27],[-38,27],[38,-27],[38,27]]){
        const q=vehicleWorldPoint(v,{x:u,y:w,z:0}),water=friendsWaterAt(q.x,q.y)!;
        expect(water.depth).toBeGreaterThan(22);expect(terrain.ceiling(q.x,q.y,water.level-12)??Infinity).toBeGreaterThan(water.level+66);
      }
    }
  });
  it('stops the hull against banks and player-built walls instead of tunnelling or dragging crew onto land',()=>{
    const {boat,a,b}=crew(),v=boat.vehicle(),terrain=new FriendsTerrain();
    const wall={id:99,x:v.x+170,y:v.y,z:144,rotation:0,shape:'wall' as const,finish:'stone' as const,author:'test',revision:1};
    for(let n=1;n<140;n++){const action=Math.floor((n-1)/20)+1;boat.update(50,n*50,[a,b],new Map([['a',command(n,{fireActionId:action})],['b',command(n,{fireActionId:action})]]),terrain,[wall]);}
    expect(boat.vehicle().x).toBeLessThan(wall.x-65);expect(a.friendsSeat?.vehicleId).toBe(ROWBOAT_ID);expect(friendsWaterAt(a.x,a.y)).toBeDefined();
    const bank=new FriendsRowboat({x:13680,y:22560,angle:0},terrain),c=actor('c'),d=actor('d');c.y+=20;d.y-=20;bank.interact(c,[c,d]);bank.interact(d,[c,d]);
    for(let n=1;n<=400;n++){const action=Math.floor((n-1)/20)+1;bank.update(50,n*50,[c,d],new Map([['c',command(n,{fireActionId:action})],['d',command(n,{fireActionId:action})]]),terrain);expect(friendsWaterAt(bank.vehicle().x,bank.vehicle().y)!.depth).toBeGreaterThan(22);}
    expect(bank.vehicle().x).toBeLessThan(14500);
  });
  it('rejects malformed or dry saved positions and persists no crew or residual forces',()=>{
    const home=new FriendsRowboat().save();expect(new FriendsRowboat({x:NaN,y:0,angle:0}).save()).toEqual(home);expect(new FriendsRowboat({x:5904,y:5712,angle:0}).save()).toEqual(home);
    const {boat,a,b}=crew();row(boat,a,b,1,1);const reload=new FriendsRowboat(boat.save());expect(reload.save()).toEqual(boat.save());expect(reload.vehicle().rowing!.left.playerId).toBeUndefined();expect(reload.vehicle().rowing!.speed).toBe(0);
  });
  it('integrates seats, inputs and boat persistence into the real multiplayer simulation',()=>{
    const simulation=new FriendsSimulation([{id:'host',label:'Host',color:'#fff'},{id:'guest',label:'Guest',color:'#aaa'}]);
    const s=simulation as unknown as {players:Map<string,ReturnType<typeof actor>>},v=simulation.createSnapshot().friends!.vehicles.find(v=>v.id===ROWBOAT_ID)!;
    for(const [id,side]of [['host',1],['guest',-1]] as const){const p=s.players.get(id)!;p.x=v.x;p.y=v.y+side*25;p.z=v.z;simulation.setInput(id,command(1,{interactActionId:1,reviving:true}));}
    simulation.tick(50);expect(simulation.createSnapshot().players.every(p=>p.friendsSeat?.vehicleId===ROWBOAT_ID)).toBe(true);
    for(let i=2;i<82;i++){for(const id of ['host','guest'])simulation.setInput(id,command(i,{fireActionId:Math.floor((i-2)/20)+1}));simulation.tick(50);}
    const after=simulation.createSnapshot();expect(after.friends!.transport!.rowboat).toBeDefined();expect(Math.hypot(after.friends!.vehicles.find(v=>v.id===ROWBOAT_ID)!.x-v.x,after.friends!.vehicles.find(v=>v.id===ROWBOAT_ID)!.y-v.y)).toBeGreaterThan(70);
  });
});
