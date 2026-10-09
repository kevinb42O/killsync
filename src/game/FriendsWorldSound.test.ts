import { LAVA_SEA_ENTRY,lavaRiverPoint } from './world/FriendsLavaRiver';
import { describe, expect, it } from 'vitest';
import { FriendsInteractionSound, friendsSurfaceSound, friendsWorldSound, spatialSound } from './FriendsWorldSound';
import { CAVE_ROOMS, CAVE_TREASURES } from './world/FriendsCave';
import { ISLAND_LAKES, ISLAND_SEA_LEVEL, ISLAND_VOLCANO, islandSurfaceBiome } from './world/FriendsIsland';
import { baseTerrainHeight } from './world/FriendsTerrain';
import type { FriendsSnapshot } from './multiplayer/FriendsExpedition';
import type { PhysicalCargo } from './multiplayer/FriendsHauling';
import { cargoBounds } from './multiplayer/FriendsCargoPose';

const listener = { id:'host', x:0, y:0, z:0 };
const cargo = (patch: Partial<PhysicalCargo> = {}): PhysicalCargo => ({id:'crate',x:20,y:0,z:0,angle:0,vx:0,vy:0,vz:0,spin:0,...patch});
const snapshot = (patch: Partial<FriendsSnapshot['hauling']> = {}, opened: string[] = []): FriendsSnapshot => ({
  progress:{openedTreasures:opened}, hauling:{cargo:[],ropes:[],cranes:[],...patch},
} as FriendsSnapshot);
const rope = (length=100, blocked=false, tension=.5) => ({id:'host',cargoId:'crate',anchorX:0,anchorY:0,anchorZ:0,length,blocked,tension});
const contact = (c: PhysicalCargo) => ({floor:cargoBounds(c).minZ,wood:false});

describe('Friends world sound placement', () => {
  it('uses three-dimensional falloff and listener-relative stereo', () => {
    const source = {x:0,y:100,z:0};
    expect(spatialSound(source,listener,0,500,1).pan).toBeCloseTo(.85);
    expect(spatialSound(source,listener,Math.PI,500,1).pan).toBeCloseTo(-.85);
    expect(spatialSound({...source,z:600},listener,0,500,1).volume).toBe(0);
  });
  it('places waterfalls on their rendered paths and muffles terrain occlusion', () => {
    const p={x:6464,y:18976,z:baseTerrainHeight(6464,18976)+18};
    const clear=friendsWorldSound(p,0,false), hidden=friendsWorldSound(p,0,false,()=>false);
    expect(clear.waterfall.volume).toBeCloseTo(.4);
    expect(hidden.waterfall.volume).toBeCloseTo(clear.waterfall.volume*.28);
    expect(hidden.waterfall.cutoff).toBeLessThan(clear.waterfall.cutoff!);
    expect(friendsWorldSound({...p,z:p.z+4000},0,false).waterfall.volume).toBe(0);
  });
  it('keeps cave air and reflections underground, with localized wet-room drips', () => {
    const wet=CAVE_ROOMS.find(r=>r.id==='blue')!, p={x:wet.x,y:wet.y,z:wet.floor+48};
    const cave=friendsWorldSound(p,0,true);
    expect(cave.caveAir.volume).toBeGreaterThan(0); expect(cave.reflection).toBe(.14);
    expect(cave.drip.volume).toBeGreaterThan(0);
    expect(friendsWorldSound(p,0,true,()=>false).drip.volume).toBe(0);
    expect(cave.waterfall.volume+cave.lava.volume+cave.volcano.volume).toBe(0);
    expect(friendsWorldSound(p,0,false).reflection).toBe(0);
  });
  it('limits molten audio to its physical source and suppresses obscured lava', () => {
    const p={...ISLAND_VOLCANO,z:ISLAND_VOLCANO.lavaLevel};
    const near=friendsWorldSound(p,0,false);
    expect(near.lava.volume).toBe(.24); expect(near.steam.volume).toBe(.12);
    expect(near.volcano.volume).toBe(.085);
    expect(friendsWorldSound(p,0,false,()=>false).lava.volume).toBe(0);
    expect(friendsWorldSound(listener,0,false).volcano.volume).toBe(0);
  });
  it('uses shallow water, overrides it on decks, and leaves inland excavations dry', () => {
    const lake=ISLAND_LAKES[0], p={x:lake.x,y:lake.y,z:lake.level-20};
    expect(friendsSurfaceSound(p)).toBe('waterStep');
    expect(friendsSurfaceSound(p,'wood')).toBe('woodStep');
    expect(friendsSurfaceSound(p,'hard')).toBe('stoneStep');
    expect(friendsSurfaceSound(p,undefined,true)).toBe('stoneStep');
    expect(friendsSurfaceSound({x:0,y:0,z:ISLAND_SEA_LEVEL-20})).toBe('waterStep');
    expect(friendsSurfaceSound({x:20000,y:24000,z:ISLAND_SEA_LEVEL-20})).not.toBe('waterStep');
    expect(friendsSurfaceSound({...p,z:lake.level+200})).not.toBe('waterStep');
  });
  it('uses distinct mud and snow samples on those authored biomes', () => {
    const found=new Map<string,{x:number;y:number;z:number}>();
    for(let x=2048;x<46000&&found.size<2;x+=512) for(let y=2048;y<46000;y+=512){
      const z=baseTerrainHeight(x,y), biome=islandSurfaceBiome(x,y,z);
      if((biome==='mud'||biome==='snow')&&friendsSurfaceSound({x,y,z})!=='waterStep') found.set(biome,{x,y,z});
    }
    expect(found.has('mud')).toBe(true); expect(found.has('snow')).toBe(true);
    expect(friendsSurfaceSound(found.get('mud')!)).toBe('mudStep');
    expect(friendsSurfaceSound(found.get('mud')!,undefined,false,2)).toBe('stoneStep');
    expect(friendsSurfaceSound(found.get('snow')!)).toBe('snow');
  });
});

describe('confirmed Friends interaction sounds', () => {
  it('plays nearby treasure once, while joins, distant chests, replay and resets stay quiet', () => {
    const t=CAVE_TREASURES[0], p={...t,id:'host'}, sound=new FriendsInteractionSound();
    expect(sound.sample(snapshot({},[t.id]),p,0,0,contact).events).toEqual([]);
    sound.sample(snapshot(),p,100,0,contact,true);
    const open=snapshot({},[t.id]);
    expect(sound.sample(open,p,200,0,contact).events.map(e=>e.cue)).toEqual(['treasure']);
    expect(sound.sample(open,p,200,0,contact).events).toEqual([]);
    expect(sound.sample(open,p,300,0,contact).events).toEqual([]);
    sound.sample(snapshot(),listener,400,0,contact,true);
    expect(sound.sample(open,listener,500,0,contact).events).toEqual([]);
    expect(sound.sample(open,p,4000,0,contact).events).toEqual([]);
  });
  it('follows rope attach, tension and actual reel motion, stopping when blocked or stationary', () => {
    const sound=new FriendsInteractionSound(); sound.sample(snapshot(),listener,0,0,contact);
    expect(sound.sample(snapshot({ropes:[rope()]}),listener,100,0,contact).events.map(e=>e.cue)).toEqual(['ropeHook']);
    const moving=sound.sample(snapshot({ropes:[rope(90)]}),listener,200,0,contact);
    expect(moving.motor.volume).toBeGreaterThan(0); expect(moving.events.map(e=>e.cue)).toEqual(['ropeCreak']);
    expect(sound.sample(snapshot({ropes:[rope(90)]}),listener,300,0,contact).motor.volume).toBe(0);
    expect(sound.sample(snapshot({ropes:[rope(80,true)]}),listener,400,0,contact).motor.volume).toBe(0);
    expect(sound.sample(snapshot({ropes:[rope(100)]}),listener,500,0,contact).events.map(e=>e.cue)).toEqual(['reelRatchet']);
    expect(sound.sample(snapshot({ropes:[rope(110)]}),listener,600,0,contact).events).toEqual([]);
    expect(sound.sample(snapshot(),listener,700,0,contact).events.map(e=>e.cue)).toEqual(['ropeHook']);
  });
  it('uses one strongest nearby crane motor and ignores far-away cranes', () => {
    const cranes=[{pieceId:1,x:30,y:0,z:0,length:100,angle:0,rotation:0,blocked:false},{pieceId:2,x:3000,y:0,z:0,length:100,angle:0,rotation:0,blocked:false}];
    const sound=new FriendsInteractionSound(); sound.sample(snapshot({cranes:cranes as any}),listener,0,0,contact);
    const moved=cranes.map(c=>({...c,length:94.4}));
    expect(sound.sample(snapshot({cranes:moved as any}),listener,100,0,contact).motor.volume).toBeGreaterThan(0);
    expect(sound.sample(snapshot({cranes:moved as any}),listener,200,0,contact).motor.volume).toBe(0);
  });
  it('uses real cable speed for both crane directions at 240 Hz, with no winch sound for arm rotation or limits',()=>{
    const crane={pieceId:1,x:30,y:0,z:0,length:100,angle:0,rotation:0,blocked:false,hasWinch:true};
    const sound=new FriendsInteractionSound();sound.sample(snapshot({cranes:[crane] as any}),listener,0,0,contact);
    const raising={...crane,length:100-56/240};
    expect(sound.sample(snapshot({cranes:[raising] as any}),listener,1000/240,0,contact).motor.volume).toBeGreaterThan(0);
    expect(sound.sample(snapshot({cranes:[crane] as any}),listener,2000/240,0,contact).motor.volume).toBeGreaterThan(0);
    expect(sound.sample(snapshot({cranes:[{...crane,angle:.05}] as any}),listener,3000/240,0,contact).motor.volume).toBe(0);
    expect(sound.sample(snapshot({cranes:[{...raising,blocked:true}] as any}),listener,4000/240,0,contact).motor.volume).toBe(0);
    expect(sound.sample(snapshot({cranes:[{...crane,hasWinch:false}] as any}),listener,5000/240,0,contact).motor.volume).toBe(0);
  });
  it('plays a hook click beside the cargo even when the winch is high above the listener',()=>{
    const crane={pieceId:1,x:20,y:0,z:1800,length:1886,angle:0,rotation:0,blocked:false};
    const sound=new FriendsInteractionSound();sound.sample(snapshot({cranes:[crane] as any,cargo:[cargo()]}),listener,0,0,contact);
    const result=sound.sample(snapshot({cranes:[{...crane,cargoId:'crate'}] as any,cargo:[cargo()]}),listener,100,0,contact);
    expect(result.motor.volume).toBe(0);expect(result.events.map(e=>e.cue)).toEqual(['ropeHook']);
  });
  it('follows raising, holding and lowering in real crane simulation snapshots',async()=>{
    const {FriendsHauling}=await import('./multiplayer/FriendsHauling');
    const piece={id:77,shape:'crane',finish:'teal',author:'Host',revision:1,x:880,y:1000,z:400,rotation:0} as const;
    const player={id:'host',lifeState:'alive',x:816,y:1060,z:400};
    const hauling=new FriendsHauling({version:1,cargo:[cargo({x:1000,y:1000})],delivered:false});
    const env={revision:'audio-crane',floor:()=>0,collide:()=>false,blocked:()=>false,vehicles:[],builds:[piece]};
    hauling.syncCranes(env);hauling.controlCrane(player,77,'crane_connect',env);
    const sound=new FriendsInteractionSound(), state=()=>({...snapshot(),hauling:hauling.snapshot()});
    sound.sample(state(),player,0,0,contact);
    hauling.controlCrane(player,77,'crane_raise',env);hauling.update(50,0,[player],new Map(),env);
    expect(sound.sample(state(),player,50,0,contact).motor.volume).toBeGreaterThan(0);
    hauling.controlCrane(player,77,'crane_hold',env);hauling.update(50,50,[player],new Map(),env);
    expect(sound.sample(state(),player,100,0,contact).motor.volume).toBe(0);
    hauling.controlCrane(player,77,'crane_lower',env);hauling.update(50,100,[player],new Map(),env);
    expect(sound.sample(state(),player,150,0,contact).motor.volume).toBeGreaterThan(0);
  });
  it('requires a real impact, chooses the contacted material, and rejects air stops and teleports', () => {
    const impact=(after:PhysicalCargo, floor=0, wood=false)=>{
      const sound=new FriendsInteractionSound(); sound.sample(snapshot({cargo:[cargo({vz:-160})]}),listener,0,0,contact);
      return sound.sample(snapshot({cargo:[after]}),listener,100,0,()=>({floor,wood})).events;
    };
    expect(impact(cargo()).map(e=>e.cue)).toEqual(['cargoStone']);
    expect(impact(cargo(),0,true).map(e=>e.cue)).toEqual(['cargoWood']);
    expect(impact(cargo(),-100)).toEqual([]);
    expect(impact(cargo({x:5000}))).toEqual([]);
    expect(impact(cargo({secured:{vehicleId:'wagon',x:0,y:0,angle:0}}))).toEqual([]);
    expect(impact(cargo({vz:-50}))).toEqual([]);
  });
  it('can observe a real simulation treasure reward without replaying it', async () => {
    const {FriendsSimulation}=await import('./multiplayer/FriendsSimulation');
    const sim=new FriendsSimulation([{id:'host',label:'Host',color:'#fff'}]);
    const t=CAVE_TREASURES[0], player=sim['players'].get('host')!;
    Object.assign(player,{x:t.x,y:t.y,z:t.z});
    const sound=new FriendsInteractionSound(); sound.sample(sim.createSnapshot().friends!,player,0,0,contact);
    sim['friends']!.interact(player,0);
    expect(sound.sample(sim.createSnapshot().friends!,player,100,0,contact).events.map(e=>e.cue)).toEqual(['treasure']);
  });
});

describe('continuous lava and ocean-vapor ambience',()=>{
  it('keeps the recorded lava loop audible throughout the river while the ocean hiss stays at its outlet',()=>{
    for(const t of [.15,.35,.55,.75,.90]){const p=lavaRiverPoint(t);expect(friendsWorldSound(p,0,false).lava.volume).toBeGreaterThan(.18);}
    const p={...LAVA_SEA_ENTRY,z:LAVA_SEA_ENTRY.z+100};
    const close=friendsWorldSound(p,0,false),occluded=friendsWorldSound(p,0,false,()=>false);
    expect(close.oceanSteam.volume).toBe(.34);expect(occluded.oceanSteam.volume).toBeLessThan(close.oceanSteam.volume);expect(occluded.oceanSteam.cutoff).toBeLessThan(close.oceanSteam.cutoff!);
    expect(friendsWorldSound({...p,z:p.z+2500},0,false).oceanSteam.volume).toBe(0);
    expect(friendsWorldSound(p,0,true).oceanSteam.volume).toBe(0);
    expect(friendsWorldSound({...ISLAND_VOLCANO,z:ISLAND_VOLCANO.lavaLevel},0,false).oceanSteam.volume).toBe(0);
    const side={...p,x:p.x-120};expect(friendsWorldSound(side,0,false).oceanSteam.pan).toBeCloseTo(-friendsWorldSound(side,Math.PI,false).oceanSteam.pan);
  });
});
