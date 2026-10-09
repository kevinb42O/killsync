/** Planning evidence only. Run: npx tsx tools/chill-spots-survey.ts.
 * Samples a fresh island; never reads or modifies a player's saved world.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { baseTerrainHeight, FriendsTerrain, ISLAND_RUINS } from '../src/game/world/FriendsTerrain';
import { ISLAND_LAKES, ISLAND_SEA_LEVEL, islandArchRange, islandSurfaceBiome } from '../src/game/world/FriendsIsland';
import { scenicRailway } from '../src/game/world/FriendsScenicRailway';

const out = resolve('artifacts/chill-spots'), units = 12;
const terrain = new FriendsTerrain(), rail = scenicRailway();
const definitions = [
  { id: 'house', name: 'Stillwater House', x: 7680, y: 21696, width: 96, depth: 72, lake: 0, archFloor: false },
  { id: 'falls', name: 'Skyfalls Bench', x: 8884, y: 21100, width: 48, depth: 36, lake: 0, archFloor: false },
  { id: 'gate', name: 'Gatewater Bench', x: 14116, y: 11308, width: 48, depth: 36, lake: 1, archFloor: true },
  { id: 'tidal', name: 'Saltwind Camp', x: 27248, y: 20704, width: 128, depth: 128, lake: undefined, archFloor: false },
  { id: 'summit', name: 'Last Light Bench', x: 6816, y: 18080, width: 48, depth: 36, lake: undefined, archFloor: false },
];
function segmentDistance(x: number, y: number, a: {x:number;y:number}, b: {x:number;y:number}) {
  const dx=b.x-a.x,dy=b.y-a.y;
  const t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy||1)));
  return Math.hypot(x-a.x-dx*t,y-a.y-dy*t);
}
const sites = definitions.map(s => {
  const ground = (x:number,y:number) => s.archFloor ? islandArchRange(x,y)?.[0] ?? baseTerrainHeight(x,y) : baseTerrainHeight(x,y);
  const heights:number[]=[];
  for(let dx=-s.width/2;dx<=s.width/2;dx+=4)for(let dy=-s.depth/2;dy<=s.depth/2;dy+=4)heights.push(ground(s.x+dx,s.y+dy));
  const minimum=Math.min(...heights),maximum=Math.max(...heights);
  const deck=s.id==='summit'?Math.max(maximum+8,4672):maximum+8,eye=deck+14;
  const nearestRail=Math.min(...rail.points.slice(1).map((p,i)=>segmentDistance(s.x,s.y,rail.points[i],p)));
  const nearestRuin=Math.min(...ISLAND_RUINS.map(b=>Math.hypot(Math.max(0,Math.abs(s.x-b.x)-b.w/2),Math.max(0,Math.abs(s.y-b.y)-b.d/2))));
  function trace(dx:number,dy:number,dz:number,distance:number){
    let blockedSamples=0;
    for(let d=16;d<distance-16;d+=8){
      const f=d/distance,x=s.x+dx*f,y=s.y+dy*f,z=eye+dz*f;
      if(terrain.material(Math.floor(x/32),Math.floor(y/32),Math.floor(z/32)))blockedSamples++;
    }
    return blockedSamples;
  }
  const lake=s.lake===undefined?undefined:ISLAND_LAKES[s.lake];
  const lakeView=lake?{target:lake.id,blockedVoxelSamples:trace(lake.x-s.x,lake.y-s.y,lake.level-eye,Math.hypot(lake.x-s.x,lake.y-s.y))}:undefined;
  const horizon=(dx:number,dy:number)=>{
    let angle=-90;
    for(let d=64;d<=40000;d+=32)angle=Math.max(angle,Math.atan2(baseTerrainHeight(s.x+dx*d,s.y+dy*d)-eye,d)*180/Math.PI);
    return angle;
  };
  return {...s,ground:ground(s.x,s.y),preliminaryDeck:deck,seatedEye:eye,
    footprintReliefMetres:(maximum-minimum)/units,highestFootprintGround:maximum,
    nearestRailCentrelineMetres:nearestRail/units,nearestAuthoredRuinMetres:nearestRuin/units,
    lakeView,
    solarTerrainHorizonDegrees:s.id==='summit'?{dawn:horizon(.832050294,-.554700196),dusk:horizon(-.832050294,.554700196)}:undefined};
});
const report={date:'2026-10-09',status:'Preliminary design candidates, not final placement approval',unitsPerMetre:units,sites,
  limitations:[
    'Footprints are axis-aligned sketches; final orientation, porch and stand-up clearances need a new survey.',
    'Fresh island only: saved terrain, player builds, vegetation, paths, cargo routes and station envelopes are not inspected.',
    'Lake rays sample the fresh volumetric field at 8-unit intervals; they test the lake centre, not the entire panorama or waterfall mesh.',
    'Gatewater ground uses the arch cavity floor rather than the top of the mountain; exact voxel support still needs in-engine review.',
    'Rail distance is to compiled polyline segments, not a vehicle or station clearance envelope.',
    'Solar horizon uses natural surface height at exact dawn/dusk bearings, excluding foliage, infrastructure and the solar disc.',
  ]};
mkdirSync(out,{recursive:true});
writeFileSync(resolve(out,'survey.json'),JSON.stringify(report,null,2)+'\n');

// A terrain-derived map with candidate numbers and a diagram of the proposed room.
const mx=(x:number)=>40+x/48000*640,my=(y:number)=>90+y/48000*640;
const colours={grass:'#52674e',stone:'#858c85',snow:'#dce6e5',ice:'#96beca',sand:'#b2a57e',mud:'#676557',basalt:'#585458',lava:'#bd764b'};
let cells='';
for(let x=0;x<48000;x+=400)for(let y=0;y<48000;y+=400){
  const h=baseTerrainHeight(x+200,y+200),c=h<ISLAND_SEA_LEVEL?'#254b60':colours[islandSurfaceBiome(x+200,y+200,h)];
  cells+=`<rect x="${mx(x)}" y="${my(y)}" width="5.5" height="5.5" fill="${c}"/>`;
}
let lakes='';
for(const lake of ISLAND_LAKES)lakes+=`<ellipse cx="${mx(lake.x)}" cy="${my(lake.y)}" rx="${lake.rx/48000*640}" ry="${lake.ry/48000*640}" fill="#79becb"/>`;
const railway=rail.points.filter((_,i)=>i%8===0).map(p=>`${mx(p.x)},${my(p.y)}`).join(' ');
const pins=sites.map((s,i)=>{
  const dx=i===0?-25:i===1?25:0,dy=i===0?18:i===1?5:0;
  return `<line x1="${mx(s.x)}" y1="${my(s.y)}" x2="${mx(s.x)+dx}" y2="${my(s.y)+dy}" stroke="#eee5ce"/><circle cx="${mx(s.x)+dx}" cy="${my(s.y)+dy}" r="11" fill="${i===0?'#f4c18a':'#eee5ce'}" stroke="#18272b" stroke-width="2"/><text x="${mx(s.x)+dx}" y="${my(s.y)+dy+5}" text-anchor="middle" fill="#18272b" font-size="14" font-weight="bold">${i+1}</text>`;
}).join('');
const legend=sites.map((s,i)=>`<text x="740" y="${100+i*32}">${i+1}. ${s.name}</text>`).join('');
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1220" height="790" viewBox="0 0 1220 790">
<rect width="1220" height="790" fill="#18272b"/>
<g font-family="Arial,sans-serif" font-size="18" fill="#eee5ce">
<text x="40" y="43" font-size="28">Quiet places on Sunline Island</text>
<text x="40" y="70" fill="#b0c0ba">Design proposal • natural terrain survey • 9 October 2026</text>
${cells}${lakes}<polyline points="${railway}" stroke="#ded2a9" stroke-width="1.5" fill="none" opacity=".8"/>${pins}
<text x="55" y="115">N ↑</text>${legend}
<text x="740" y="292" font-size="23">One room. A couch. A view.</text>
<text x="740" y="320" fill="#b0c0ba">8 × 6 m interior • layout, not a render</text>
<rect x="750" y="354" width="400" height="300" fill="#c8b99e" stroke="#8f6949" stroke-width="10"/>
<line x1="780" x2="1100" y1="354" y2="354" stroke="#87bed0" stroke-width="8"/>
<text x="950" y="382" text-anchor="middle" fill="#283938" font-size="16">Panoramic window → lake and falls</text>
<rect x="832" y="530" width="210" height="68" rx="13" fill="#636e64" stroke="#39443b" stroke-width="3"/>
<line x1="902" x2="902" y1="535" y2="592" stroke="#39443b"/><line x1="972" x2="972" y1="535" y2="592" stroke="#39443b"/>
<text x="937" y="574" text-anchor="middle" fill="#eee5ce">Three-seat couch ↑</text>
<line x1="1150" x2="1150" y1="404" y2="474" stroke="#87bed0" stroke-width="8"/>
<line x1="750" x2="750" y1="554" y2="624" stroke="#18272b" stroke-width="12"/>
<path d="M750 624 L810 624 A60 60 0 0 0 750 564" fill="none" stroke="#785a42" stroke-width="2"/>
<rect x="773" y="633" width="12" height="12" fill="#eee5ce" stroke="#283938"/>
<text x="796" y="643" fill="#283938" font-size="16">Switch</text>
<text x="950" y="441" text-anchor="middle" fill="#283938" font-size="16">Open floor • warm light on plaster</text>
<text x="740" y="691" fill="#b0c0ba" font-size="16">Lake shapes are schematic. Numbers mark candidates.</text>
<text x="740" y="716" fill="#b0c0ba" font-size="16">Final seat views and access require in-game checks.</text>
<text x="40" y="760" fill="#b0c0ba" font-size="16">Pale line: existing Grand Traverse • House and seating are proposed; gameplay has not changed.</text>
</g></svg>`;
writeFileSync(resolve(out,'map-and-room.svg'),svg);
await sharp(Buffer.from(svg)).png().toFile(resolve(out,'map-and-room.png'));
console.log(JSON.stringify(report,null,2));
