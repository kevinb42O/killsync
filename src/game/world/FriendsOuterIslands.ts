import { ISLAND_SEA_LEVEL } from './FriendsWaterBodies';
export const DISTANT_ISLANDS = [
  { name: 'Crownreach', x: -14500, z: -6500, rx: 6200, rz: 3900, height: 2900, seed: 3, kind: 'castle' },
  { name: 'Silverpine', x: -6500, z: -20500, rx: 7300, rz: 4300, height: 4800, seed: 7, kind: 'snow' },
  { name: 'Emberwake', x: -17500, z: 21500, rx: 9400, rz: 6900, height: 6100, seed: 11, kind: 'volcano' },
  { name: 'Dawnspire', x: 64500, z: 18500, rx: 6900, rz: 4500, height: 4400, seed: 17, kind: 'snow' },
  { name: 'Verdant Keys', x: 29000, z: 64000, rx: 8200, rz: 3600, height: 2300, seed: 23, kind: 'forest' },
] as const;
export const OUTER_CASTLE_SITE = { x: 1400, z: 1250, top: 820 };
export type Island = typeof DISTANT_ISLANDS[number];
export const distantIslandHash = (n: number, seed: number) => { const h = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453; return h - Math.floor(h); };
const smooth = (a:number,b:number,n:number) => {const t=Math.max(0,Math.min(1,(n-a)/(b-a)));return t*t*(3-2*t);};
export function distantIslandOutline(a: number, seed: number) {
  // Unequal headlands and deep coves break the oval outline. Broad terms
  // dominate so the coastline remains readable from a distant beach.
  const bayAngle = Math.atan2(Math.sin(a - seed * .73), Math.cos(a - seed * .73));
  return 1 + .18 * Math.sin(a * 3 + seed) + .10 * Math.cos(a * 2 - seed)
    + .07 * Math.cos(a * 5 - seed) + .025 * Math.sin(a * 9 + seed)
    - .22 * Math.exp(-((bayAngle / .30) ** 2));
}
export function distantIslandHeightAt(x: number, z: number, island: Island) {
  const a = Math.atan2(z / island.rz, x / island.rx);
  const r = Math.hypot(x / island.rx, z / island.rz) / distantIslandOutline(a, island.seed);
  const land = 1 - smooth(.68, 1, r);
  if (island.kind === 'volcano') {
    const q = Math.hypot(x / island.rx, z / island.rz);
    const ridge = 1 + .12 * Math.sin(a * 5 + 1.4) + .07 * Math.cos(a * 9 - .8);
    const rim = Math.exp(-(((q - .245) / .14) ** 2)) * .29 * ridge;
    const cone = .72 * Math.max(0, 1 - q / .94) ** 1.3;
    const spillAngle = Math.atan2(Math.sin(a + .5), Math.cos(a + .5));
    const breach = Math.exp(-((spillAngle / .20) ** 2)) * smooth(.12, .25, q) * (1 - smooth(.38, .85, q));
    const bowl = 1 - smooth(.09, .20, q);
    const h = island.height * ((cone + rim) * (1 - bowl) + .32 * bowl - .16 * breach);
    const foothills = 500 * Math.max(0, 1 - q) * (1 + .4 * Math.sin(a * 3 + q * 8));
    return land * (100 + h + foothills) - smooth(.96, 1, r) * 35 - smooth(1.02, 1.45, r) * 500;
  }
  // A long, weathered mountain spine sits within rolling foothills. Seeded
  // offsets change the summit spacing and valleys for each island.
  const turn=island.name==='Dawnspire'?1.1:island.kind==='forest'?.18:0;
  const px=x/island.rx,pz=z/island.rz;
  const u=px*Math.cos(turn)+pz*Math.sin(turn),v=-px*Math.sin(turn)+pz*Math.cos(turn);
  const spine = .08 * Math.sin(u * 5 + island.seed) - .09 * Math.cos(u * 2 - island.seed);
  const shoulder = Math.exp(-(((v - spine) / .44) ** 2)) * Math.max(0, 1 - (u / .95) ** 2);
  const ridgeWidth = island.kind === 'forest' ? .48 : .31;
  const ridge = Math.max(0, 1 - Math.abs(v-spine)/ridgeWidth) ** 1.15;
  const peak = (cx:number, width:number, h:number) => h * Math.max(0,1-Math.abs((u-cx)/width)) ** .85;
  const summits = peak(-.47, .34, .56 + .15 * Math.sin(island.seed))
    + peak(.04 + .08 * Math.sin(island.seed), .38, .72)
    + peak(.49, .32, .42 + .12 * Math.cos(island.seed));
  const erosion = 1 + .08 * Math.sin(u * 19 + v * 12 + island.seed)
    + .035 * Math.sin(v * 33 - u * 8);
  const foothills = island.height * .18 * shoulder * (1 + .16 * Math.sin(u * 11 + v * 7));
  const mountain = island.height * ridge * summits * erosion * (island.kind==='forest'?.52:1);
  const coastHeight = 55 + 110 * Math.max(0, 1-r) + 50 * Math.sin(a * 3 + island.seed) ** 2;
  let terrain = land * (coastHeight + foothills + mountain)
    - smooth(.94, 1.05, r) * 65 - smooth(1.05, 1.45, r) * 500;
  if(island.kind==='castle'){
    const site=OUTER_CASTLE_SITE,distance=Math.hypot(x-site.x,(z-site.z)*1.1);
    terrain=site.top+(terrain-site.top)*smooth(520,1150,distance);
  }
  return terrain;
}

/** Continue the same ocean bed into the formerly decorative islands. */
export function outerIslandTerrain(x:number,y:number,bed:number) {
  for(const island of DISTANT_ISLANDS){
    const dx=x-island.x,dy=y-island.z;
    if(Math.abs(dx)>island.rx*1.7||Math.abs(dy)>island.rz*1.7)continue;
    const a=Math.atan2(dy/island.rz,dx/island.rx);
    const r=Math.hypot(dx/island.rx,dy/island.rz)/distantIslandOutline(a,island.seed);
    if(r>=1.6)continue;
    const land=ISLAND_SEA_LEVEL+distantIslandHeightAt(dx,dy,island);
    return land+(bed-land)*smooth(1,1.6,r);
  }
  return bed;
}

/** Solid masonry matches the visible Crownreach tower and battlements. */
export const OUTER_ISLAND_MASONRY = (()=>{
  const island=DISTANT_ISLANDS.find(i=>i.kind==='castle')!;
  const site=OUTER_CASTLE_SITE,ground=ISLAND_SEA_LEVEL+site.top-100;
  const boxes:{x:number;y:number;z:number;w:number;d:number;h:number;tint:'stone'}[]=[];
  const add=(dx:number,dy:number,w:number,h:number,d:number,z:number)=>boxes.push({x:island.x+site.x+dx,y:island.z+site.z+dy,z,w,d,h,tint:'stone'});
  add(0,0,840,330,520,ground);
  for(const dx of [-410,410])for(const dy of [-255,255]){
    const h=dx>0&&dy>0?760:500;
    add(dx,dy,190,h,190,ground);
    for(const tx of [-65,65])for(const ty of [-65,65])add(dx+tx,dy+ty,60,65,60,ground+h);
  }
  add(100,10,230,920,220,ground);
  return boxes;
})();
