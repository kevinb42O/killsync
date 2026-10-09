import { createHighfallCastle, HIGHFALL_CASTLE } from './FriendsCastle';
import { ISLAND_SEA_LEVEL, ISLAND_LAKES } from './FriendsWaterBodies';
import { hydrologyTerrainHeight, deepmereRadius, riverSampleAt } from './FriendsHydrology';
export { ISLAND_SEA_LEVEL, ISLAND_LAKES } from './FriendsWaterBodies';
/** Authored seed-like landforms. World coordinates and elevations are shared by
 * the voxel field, horizon, atlas and landmark presentation. */
export const ISLAND_ARCH = { x: 15520, y: 10560, radius: 1664, depth: 5200, floor: 608, height: 2848 };
export const ISLAND_PEAKS = [
  { x: 15488, y: 9600, rx: 2752, ry: 2464, height: 4700 },
  { x: 18048, y: 12416, rx: 1728, ry: 2432, height: 3700 },
  { x: 23680, y: 15552, rx: 3456, ry: 2560, height: 5100 },
  { x: 26368, y: 17600, rx: 1920, ry: 1856, height: 3800 },
  { x: 24320, y: 24000, rx: 3328, ry: 2112, height: 4100 },
  { x: 6912, y: 18304, rx: 2336, ry: 3264, height: 4100 },
  { x: 12544, y: 29248, rx: 3328, ry: 2112, height: 3400 },

] as const;
export const ISLAND_SEA_STACKS = [
  {x:33088,y:20160,radius:544,height:2304},
  {x:34816,y:18432,radius:384,height:3008},
  {x:32384,y:22016,radius:672,height:1664},
  {x:1056,y:31360,radius:416,height:1856},
] as const;
export function islandSeaStackHeight(x:number,y:number) {
  let height=-352;
  for(const p of ISLAND_SEA_STACKS){const r=Math.hypot(x-p.x,y-p.y)/p.radius;if(r>=1.35)continue;
    const shoulder=1-islandSmooth((r-.58)/.70),summit=1-islandSmooth(r/.82);
    height=Math.max(height,-352+shoulder*(p.height*.70+summit*p.height*.30+352));
  }
  return height;
}
export const islandSmooth = (t: number) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
/** Smooth union of unequal, rotated lobes: a northern peninsula, the western
 * fjord massif, southern dunes and a hooked eastern coast. No world edge is
 * used to define land. Multi-scale erosion breaks up every shoreline. */
const COAST_LOBES = [
  [22500,24000,16300,16400,.18], [12100,10200,10700,9100,-.36],
  [8500,21700,5800,11200,.20], [15800,34900,11100,7200,-.32],
  [33700,33500,8300,10100,.42],
] as const;
export function islandCoastDistance(x: number, y: number) {
  const wx=x+240*Math.sin(y/710)+160*Math.sin(y/2370+x/1400);
  const wy=y+220*Math.sin(x/870)+130*Math.sin(x/3100-y/1500);
  let d=-100000;
  for(const [cx,cy,rx,ry,angle] of COAST_LOBES){
    const dx=wx-cx,dy=wy-cy,c=Math.cos(angle),s=Math.sin(angle);
    const r=Math.hypot((dx*c-dy*s)/rx,(dx*s+dy*c)/ry);
    const next=(1-r)*Math.min(rx,ry),k=900;
    const h=Math.max(0,1-Math.abs(d-next)/k);
    d=Math.max(d,next)+h*h*k*.25;
  }
  // Inland bites create coves rather than bays against a rectangular border.
  const cove= Math.hypot((wx-32600)/4300,(wy-19600)/5600);
  const fjord=Math.hypot((wx-2900)/2800,(wy-26700)/1900);
  d=Math.min(d,(cove-1)*3800,(fjord-1)*2200);
  return d+90*Math.sin(x/173+y/281)*Math.sin(y/347-x/511);
}
export const ISLAND_VOLCANO={x:34240,y:33792,radius:4300,craterRadius:960,lavaLevel:2714.5};
export function islandVolcanoRadius(x:number,y:number){
  const v=ISLAND_VOLCANO,dx=x-v.x,dy=y-v.y,a=Math.atan2(dy,dx);
  return Math.hypot(dx,dy)/(1+.08*Math.sin(a*5)+.045*Math.sin(a*9+.6));
}
export function islandVolcanoHeight(x:number,y:number){
  const r=islandVolcanoRadius(x,y),v=ISLAND_VOLCANO;
  if(r>v.radius*1.5)return 0;
  const cone=3900*Math.exp(-((r/2950)**1.6));
  const rim=560*Math.exp(-(((r-1220)/400)**2));
  const crater=1-islandSmooth((r-640)/510);
  const angle=Math.atan2(y-ISLAND_VOLCANO.y,x-ISLAND_VOLCANO.x);
  const direction=Math.atan2(Math.sin(angle-1.05),Math.cos(angle-1.05));
  const breach=1700*Math.exp(-((direction/.19)**2)-(((r-1250)/780)**2));
  return (cone+rim)*(1-crater)+1980*crater-breach;
}
/** Distorted bowls determine both solid lakebeds and the water's shoreline. */
export function islandLakeRadius(x:number,y:number,lake:typeof ISLAND_LAKES[number]){
  if(lake.id==='deepmere')return deepmereRadius(x,y);
  const dx=(x-lake.x)/lake.rx,dy=(y-lake.y)/lake.ry,a=Math.atan2(dy,dx);
  return Math.hypot(dx,dy)/(1+.13*Math.sin(a*3+.4)+.065*Math.sin(a*7-1.2))
    +.035*Math.sin(x/170)*Math.sin(y/210);
}
export function islandArchFloor(x:number,y:number){
  const lake=ISLAND_LAKES[1],r=islandLakeRadius(x,y,lake);
  const bank=736+64*Math.sin(y/770)+48*Math.sin(x/510+y/930);
  const natural=bank-(bank-lake.level+192)*(1-islandSmooth((r-.48)/.68));
  return Math.round(hydrologyTerrainHeight(x,y,natural,false)/32)*32;
}
/** Climate channels sampled by the terrain shader and vegetation. Sand and
 * wet soil follow coasts and basins; volcanic rock and ice have real regions. */
export function islandClimate(x:number,y:number):[number,number,number,number]{
  const coast=islandCoastDistance(x,y);
  let wet=Math.exp(-(((x-20500)/5800)**2+((y-30700)/4800)**2))
    *(.65+.35*Math.sin(x/1200)*Math.sin(y/1500));
  const river=riverSampleAt(x,y);if(river)wet=Math.max(wet,.6*(1-islandSmooth((river.side-river.width/2)/160)));
  const volcanic=1-islandSmooth((islandVolcanoRadius(x,y)-3000)/3600);
  const glacier=Math.exp(-(((x-24100)/3600)**2+((y-16800)/4000)**2));
  return [coast,wet,volcanic,glacier];
}
export function islandSurfaceBiome(x:number,y:number,height:number){
  const [coast,wet,volcanic,glacier]=islandClimate(x,y);
  if(volcanic>.5)return islandVolcanoRadius(x,y)<850?'lava':'basalt';
  if(height>3300)return glacier>.3?'ice':'snow';
  if(height>1700)return 'stone';
  if(coast<1200)return 'sand';
  if(wet>.48)return 'mud';
  return 'grass';
}
export function islandMountainHeight(x: number, y: number, noise: (x: number, y: number) => number) {
  let height = 0;
  for (const p of ISLAND_PEAKS) {
    const r = Math.hypot((x - p.x) / p.rx, (y - p.y) / p.ry);
    if (r > 2.2) continue;
    // Tall craggy shoulders and sharper summits, rather than smooth bell hills.
    const ridge = .80 + .20 * (1 - Math.abs(noise(x / 640 + 31, y / 640 + 13) * 2 - 1));
    height = Math.max(height, p.height * Math.exp(-r * r * 1.25) * ridge);
  }
  return height;
}
/** Winding, weathered vault: its centre, width, banks and roof vary all the
 * way through the massif. Each mouth flares naturally into the mountainside. */
export function islandArchRange(x: number, y: number): [number, number] | undefined {
  const a=ISLAND_ARCH;
  const mouthWarp=144*Math.sin((x-a.x)/430)+88*Math.sin((x-a.x)/830+.7);
  const t=(y-a.y-mouthWarp)/a.depth;
  if(Math.abs(t)>=1)return;
  const centre=a.x+240*Math.sin(t*3.8)+112*Math.sin(t*9.1+.2);
  const flare=islandSmooth((Math.abs(t)-.62)/.38);
  const width=a.radius*(.90+.12*Math.sin(t*5.7+.8)+.055*Math.sin(t*13)+.38*flare);
  const dx=(x-centre)/width;
  if(Math.abs(dx)>=1)return;
  const floor=islandArchFloor(x,y);
  const weather=72*Math.sin(x/180+y/330)+48*Math.sin(x/370-y/190);
  const roof=Math.floor((a.floor+a.height*Math.sqrt(1-dx*dx)
    *(.86+.11*Math.sin(t*4.3+.4)) + weather + flare*4200)/32)*32;
  return roof>floor+64?[floor,roof]:undefined;
}
export const ISLAND_LANDMARK_SITES = [
  { id: 'arch', name: 'THE WORLD GATE', x: 16992, y: 11264, detail: 'A colossal natural arch through Highfall. Fly through the mountain or land beneath its stone vault.', color: '#a7d8e5' },
  { id: 'citadel', name: 'CROWN OF HIGHFALL', x: HIGHFALL_CASTLE.x - 256, y: HIGHFALL_CASTLE.y + 800, detail: 'A torchlit mountain fortress with a great hall, open courtyard and battlement walks. Follow the continuous stone viaduct up from the eastern ridge.', color: '#edd6a7' },
  { id: 'portal', name: 'THE TIDAL SANCTUM', x: 27008, y: 19456, detail: 'An ancient stepped monument and a luminous ruined gateway overlooking the eastern ocean.', color: '#83e4dc' },
  { id:'volcano',name:'EMBER CALDERA',x:34240,y:33792,detail:'A fractured volcanic rim above a molten crater, black lava fields and ash beaches.',color:'#ff9560' },
  { id: 'falls', name: 'THE SKYFALLS', x: 6912, y: 19584, detail: 'Twin waterfalls plunge from the western alpine wall into a turquoise hanging basin.', color: '#a0d5e3' },
] as const;
export type IslandStoneBox = { x: number; y: number; z: number; w: number; d: number; h: number; tint: 'stone' | 'dark' | 'copper' | 'glow'; detail?:'stair-core'|'stair-pier' };
/** Solid ruins are voxel-aligned and mineable. The skyline renderer uses these
 * exact boxes until streamed voxel chunks take over. */
export function createIslandRuins(sampleHeight: (x: number, y: number) => number): IslandStoneBox[] {
  const boxes: IslandStoneBox[] = [], snap = (n: number) => Math.round(n / 32) * 32;
  const box = (x: number, y: number, z: number, w: number, d: number, h: number, tint: IslandStoneBox['tint'] = 'stone') => {
    w=Math.max(32,Math.ceil(w/32)*32);d=Math.max(32,Math.ceil(d/32)*32);h=Math.max(32,Math.ceil(h/32)*32);
    boxes.push({x:snap(x-w/2)+w/2,y:snap(y-d/2)+d/2,z:snap(z),w,d,h,tint});
  };
  boxes.push(...createHighfallCastle(sampleHeight).boxes);
  const px=27008,py=19456,pbase=sampleHeight(px,py);
  for(let i=0;i<6;i++)box(px,py,pbase-96+i*64,1152-i*128,1024-i*128,64,i%2?'stone':'dark');
  const top=pbase+288;
  // Ruined portal: asymmetric obsidian uprights, fractured lintel, cyan inlay.
  for(const [dx,height]of[[-224,736],[224,576]]){
    box(px+dx,py,top,128,192,height,'dark');
    box(px+dx,py-112,top+128,32,32,height-192,'glow');
    box(px+dx,py,top+height,192,256,64);
  }
  box(px-32,py,top+736,448,192,96,'dark');
  box(px-96,py-112,top+768,256,32,32,'glow');
  for(const dx of [-448,448])for(const dy of [-384,384]){
    box(px+dx,py+dy,pbase+32,96,96,384,'dark');
    box(px+dx,py+dy,pbase+416,128,128,32,'copper');
  }
  // Walkable stairs ascend the south face of the ocean monument.
  for(let i=0;i<12;i++)box(px,py+672-i*32,pbase-64+i*32,192,32,32);
  return boxes;
}
