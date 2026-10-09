import { retreatClearing } from './FriendsRetreatSites';
import { scenicTransitAir, scenicRailColumns, scenicTransitProtected, scenicTransitSurface, scenicStructureRanges, scenicRailFloor, scenicRailCeiling } from './FriendsRailInfrastructure';
import { ISLAND_SEA_LEVEL, ISLAND_ARCH, ISLAND_LANDMARK_SITES, islandCoastDistance, islandMountainHeight, islandSeaStackHeight, islandVolcanoHeight, ISLAND_LAKES, islandLakeRadius, islandSmooth, islandArchRange, createIslandRuins, type IslandStoneBox } from './FriendsIsland';
import { caveColumn, caveEntranceFloor, explorationCave } from './FriendsCave';
import { FRIENDS_AIRPAD, FRIENDS_CAMPFIRE } from './FriendsRegion';
import { castleTerrainHeight, HIGHFALL_CASTLE } from './FriendsCastle';
import { createCastleStairs, type CastleStairs } from './FriendsCastleStairs';
let castleStairsField:CastleStairs|undefined;
/** Deterministic, editable volumetric ground. Simulation, prediction and mesh
 * generation consume this same field; no invisible plane remains below a dig. */
export const FRONTIER_SIZE = 48_000;
export const VOXEL_SIZE = 32;
/** Small lips are walkable; a full voxel always needs a jump. */
export const FRIENDS_STEP_HEIGHT = 8;
export const TERRAIN_CHUNK = 512;
export const TERRAIN_BOTTOM = -512;
export type TerrainMaterial = 0 | 1 | 2 | 3 | 4; // air, soil, stone, copper, iron
export type TerrainEdit = [number, number, number, TerrainMaterial];
export type TerrainGrade = [number, number, number, number]; // centre x/y, original ground height, core radius
export const TERRAIN_GENERATION = 4;
export type TerrainSnapshot = { revision: number; edits: TerrainEdit[]; generation?: number; grades?: TerrainGrade[] };
export type TerrainRay = { x: number; y: number; z: number; dx: number; dy: number; dz: number };
export type TerrainHit = { x: number; y: number; z: number; vx: number; vy: number; vz: number; nx: number; ny: number; nz: number; distance: number; material: TerrainMaterial };
export const FRONTIER_SITES = [
  { id: 'mine', name: 'COPPER HOLLOW', x: 6260, y: 6190, detail: 'Walk into the hillside. Mine the copper seams and smelt your cargo.', color: '#e4a16b' },
  { id: 'forest', name: 'CEDAR REACH', x: 10700, y: 4200, detail: 'A deep woodland. Bring timber home and plant the next forest.', color: '#95b989' },
  { id: 'ridge', name: 'HIGHFALL RIDGE', x: 15600, y: 8700, detail: 'A towering alpine range above the World Gate and rich iron deposits.', color: '#c2d4df' },
  { id: 'coast', name: 'THE LONG SHORE', x: 27600, y: 19000, detail: 'A distant coast of salt water, ridges and scattered salvage.', color: '#82c9cc' },
  ...ISLAND_LANDMARK_SITES,
] as const;
const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
export function terrainHash(x: number, y: number, z = 0) {
  let n = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 2147483647);
  n = Math.imul(n ^ n >>> 13, 1274126177); return ((n ^ n >>> 16) >>> 0) / 4294967296;
}
const smooth = (t: number) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
export function terrainNoise(x: number, y: number) {
  const ix = Math.floor(x), iy = Math.floor(y), tx = smooth(x - ix), ty = smooth(y - iy);
  const a = terrainHash(ix, iy), b = terrainHash(ix + 1, iy), c = terrainHash(ix, iy + 1), d = terrainHash(ix + 1, iy + 1);
  return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
}
function rollingGround(x: number, y: number) {
  return 96 + terrainNoise(x / 2200, y / 2200) * 760 + terrainNoise(x / 550, y / 550) * 144;
}
const gridHeight = (h: number) => Math.max(TERRAIN_BOTTOM + 96, Math.round(h / VOXEL_SIZE) * VOXEL_SIZE);
const LEGACY_AIRFIELD_HEIGHT = gridHeight(rollingGround(4704,5728));
const LEGACY_ARRIVAL_HEIGHT = gridHeight(rollingGround(5904,5712));
export const FRIENDS_CAVE_HEIGHT = gridHeight(rollingGround(6000,6192));
export const FRIENDS_LAKE_LEVEL = gridHeight(rollingGround(7440,6520)) - 64;
function grade(h: number, x: number, y: number, cx: number, cy: number, top: number, core: number, collar: number) {
  const distance=Math.hypot(x-cx,y-cy);if(distance>=core+collar)return h;
  return top+(h-top)*smooth((distance-core)/collar);
}
function landmarks(h: number, x: number, y: number, miningHill=true) {
  h += 2500 * Math.exp(-(((x - 15600) / 2100) ** 2 + ((y - 8700) / 1900) ** 2));
  h += 1800 * Math.exp(-(((x - 24300) / 3400) ** 2 + ((y - 24000) / 2100) ** 2));
  if(miningHill)h += Math.max(0, 1 - Math.hypot((x - 6610) / 600, (y - 6190) / 410)) * 320;
  h -= smooth((x - 28000) / 1300) * smooth((y - 14000) / 3000) * 720;
  return h;
}
/** Used only to preserve the footprint of existing player work during migration. */
export function legacyTerrainHeight(x: number, y: number) {
  const beyond=smooth(Math.max(x-10500,y-11000,1600-x,2400-y)/1300);
  return gridHeight(landmarks(beyond*rollingGround(x,y),x,y));
}
export function previousTerrainHeight(x: number, y: number) {
  // The same terrain field covers the whole world. No rectangular basin mask.
  let h=landmarks(rollingGround(x,y),x,y,false);
  h=grade(h,x,y,4704,5728,LEGACY_AIRFIELD_HEIGHT,220,420);
  h=grade(h,x,y,5904,5712,LEGACY_ARRIVAL_HEIGHT,160,380);
  // A dry hollow keeps existing construction at its saved elevation. Water
  // is absent; removing it must not raise terrain into older player builds.
  const hollow=Math.hypot((x-7440)/1040,(y-6520)/710);
  if(hollow<1.25)h=FRIENDS_LAKE_LEVEL-64+(h-FRIENDS_LAKE_LEVEL+64)*smooth((hollow-.8)/.45);
  h+=Math.max(0,1-Math.hypot((x-6610)/600,(y-6190)/410))*320;
  const mouth=caveEntranceFloor(x,y);
  return mouth===undefined?gridHeight(h):Math.min(gridHeight(h),mouth);
}
/** Generation 4: an eroded archipelago silhouette, continental shelf, low
 * beaches and dunes. Cave protection follows the authored rooms themselves. */
export function baseTerrainHeight(x: number, y: number) {
  const coast=islandCoastDistance(x,y);
  const mountains=Math.max(islandMountainHeight(x,y,terrainNoise),islandVolcanoHeight(x,y));
  const inland=rollingGround(x,y)+mountains;
  // A submerged shelf rises continuously into the swash zone. Sand spits and
  // dunes undulate above it before blending into hills; no vertical map lip.
  const shelf=ISLAND_SEA_LEVEL+coast*.12;
  const duneEnvelope=islandSmooth(coast/480)*(1-islandSmooth((coast-900)/1200));
  const dune= (28+48*terrainNoise(x/260,y/420)
    +42*Math.pow(.5+.5*Math.sin(coast/150+x/700+y/900),2))*duneEnvelope;
  const beach=ISLAND_SEA_LEVEL+Math.max(0,coast)*.15+dune;
  const beachWidth=1500+600*terrainNoise(x/4200+8,y/4200);
  let h=coast<0?shelf:beach+(inland-beach)*islandSmooth((coast-650)/beachWidth);
  h=Math.max(-416,h);
  // Two small cave approach collars preserve the authored mouths only.
  const mouthBlend=1-islandSmooth((Math.hypot(x-6384,y-5152)-300)/380);
  h=h*(1-mouthBlend)+previousTerrainHeight(x,y)*mouthBlend;
  const copperBlend=1-islandSmooth((Math.hypot((x-6610)/1.2,y-6190)-360)/260);
  h=h*(1-copperBlend)+previousTerrainHeight(x,y)*copperBlend;
  const lake=ISLAND_LAKES[0],r=islandLakeRadius(x,y,lake);
  if(r<1.45){
    const bed=lake.level-224+80*terrainNoise(x/330,y/310);
    h=bed+(h-bed)*islandSmooth((r-.64)/.81);
  }
  // Keep roofs without projecting a rectangular plateau onto the landscape.
  const entrance=caveEntranceFloor(x,y);
  if(entrance===undefined)for(const [,roof] of caveColumn(x,y))h=Math.max(h,roof+64);
  else h=Math.min(h,entrance);
  const mountain=castleTerrainHeight(x,y,Math.min(5856,Math.max(h,islandSeaStackHeight(x,y))));
  let ground=castleStairsField?.terrainHeight(x,y,mountain)??mountain;
  const camp=FRIENDS_CAMPFIRE;
  if(Math.abs(x-camp.x)<camp.radius+160&&Math.abs(y-camp.y)<camp.radius+160)
    ground=grade(ground,x,y,camp.x,camp.y,camp.z,camp.radius,160);
  return gridHeight(ground);
}
// Vehicles and arrivals follow their individual terrain cells, without grading.
export const FRIENDS_AIRFIELD_HEIGHT=baseTerrainHeight(FRIENDS_AIRPAD.x,FRIENDS_AIRPAD.y);
/** A permanent voxel deck shared by rendering, prediction and simulation. */
export const FRIENDS_SPAWN_PLATFORM = {
  x: 5904, y: 5712, size: 288, thickness: 64, clearance: 96,
  top: Math.max(...Array.from({ length: 81 }, (_, i) =>
    baseTerrainHeight(5776 + (i % 9) * 32, 5584 + Math.floor(i / 9) * 32))) + 32,
} as const;
export const FRIENDS_ARRIVAL_HEIGHT=FRIENDS_SPAWN_PLATFORM.top;
function haulingPlatform(x:number,y:number){return {
  x,y,size:288,thickness:64,clearance:128,
  top: Math.max(...Array.from({ length: 81 }, (_, i) =>
    baseTerrainHeight(x-128+(i%9)*32,y-128+Math.floor(i/9)*32)))+32,
} as const;}
/** Separate surveyed staging areas for the three hauling missions. */
export const FRIENDS_HAULING_PLATFORMS = [
  haulingPlatform(14800,4464), // Lantern clearing, east-northeast of arrival.
  haulingPlatform(20784,18544), // Eastern ridge beside the castle approach.
  haulingPlatform(6864,8016), // Freight yard south of Sunline Commons.
] as const;
export const FRIENDS_HAULING_PLATFORM=FRIENDS_HAULING_PLATFORMS[0];
export const FRIENDS_FIXED_PLATFORMS = [FRIENDS_SPAWN_PLATFORM,...FRIENDS_HAULING_PLATFORMS] as const;
export function friendsFixedPlatformAt(x:number,y:number){
  return FRIENDS_FIXED_PLATFORMS.find(p=>x>=p.x-p.size/2&&x<p.x+p.size/2&&y>=p.y-p.size/2&&y<p.y+p.size/2);
}
export function friendsFixedPlatformProtected(x:number,y:number,z:number){
  if(friendsCampfireContains(x,y)&&z>=FRIENDS_CAMPFIRE.z-64&&z<FRIENDS_CAMPFIRE.z+128)return true;
  const p=friendsFixedPlatformAt(x,y);return Boolean(p&&z>=p.top-p.thickness&&z<p.top+p.clearance);
}
export function friendsCampfireContains(x:number,y:number){
  const dx=x-FRIENDS_CAMPFIRE.x,dy=y-FRIENDS_CAMPFIRE.y,r=FRIENDS_CAMPFIRE.radius;
  return Math.abs(dx)<r&&Math.abs(dy)<r&&dx*dx+dy*dy<r*r;
}
export function friendsSpawnPlatformContains(x: number, y: number) {
  const p = FRIENDS_SPAWN_PLATFORM;
  return x >= p.x - p.size / 2 && x < p.x + p.size / 2
    && y >= p.y - p.size / 2 && y < p.y + p.size / 2;
}
export function friendsSpawnProtected(x: number, y: number, z: number) {
  const p = FRIENDS_SPAWN_PLATFORM;
  return friendsSpawnPlatformContains(x, y) && z >= p.top - p.thickness && z < p.top + p.clearance;
}
export function frontierSiteElevation(site: {id:string;x:number;y:number}) {
  if(site.id==='arch')return islandArchRange(site.x,site.y)?.[0]??baseTerrainHeight(site.x,site.y);
  if(site.id==='citadel')return HIGHFALL_CASTLE.floor+64;
  return baseTerrainHeight(site.x,site.y)+(site.id==='portal'?288:0);
}
export const CASTLE_STAIRS = createCastleStairs(baseTerrainHeight);
castleStairsField=CASTLE_STAIRS;
export const ISLAND_RUINS = createIslandRuins(baseTerrainHeight);
const ruinTiles = new Map<string, IslandStoneBox[]>();
for(const b of ISLAND_RUINS)for(let x=Math.floor((b.x-b.w/2)/512);x<=Math.floor((b.x+b.w/2)/512);x++)for(let y=Math.floor((b.y-b.d/2)/512);y<=Math.floor((b.y+b.d/2)/512);y++){
  const k=`${x},${y}`,list=ruinTiles.get(k)||[];list.push(b);ruinTiles.set(k,list);
}
const noRuins:IslandStoneBox[]=[],ruinColumns=new Map<string,IslandStoneBox[]>();
export function islandRuinsAt(x:number,y:number){
  const boxes=ruinTiles.get(`${Math.floor(x/512)},${Math.floor(y/512)}`);if(!boxes)return noRuins;
  const k=`${Math.floor(x/32)},${Math.floor(y/32)}`;let column=ruinColumns.get(k);
  if(!column){const sx=Math.floor(x/32)*32+16,sy=Math.floor(y/32)*32+16;column=boxes.filter(b=>sx>=b.x-b.w/2&&sx<b.x+b.w/2&&sy>=b.y-b.d/2&&sy<b.y+b.d/2);ruinColumns.set(k,column);}
  return column;
}
export function terrainProtected(x: number, y: number) {
  // Vegetation clearance around arrival and the aircraft. This is not an
  // excavation reserve: players may reshape this ground.
  return retreatClearing(x,y) || friendsCampfireContains(x,y) || Boolean(friendsFixedPlatformAt(x,y)) || Math.hypot(x - 5900, y - 5630) < 180 || Math.hypot(x - FRIENDS_AIRPAD.x, y - FRIENDS_AIRPAD.y) < 300;
}
export function naturalCave(x: number, y: number, z: number, roofLimit=Infinity) {
  const arch=islandArchRange(x,y);if(arch&&z>=arch[0]&&z<arch[1])return true;
  if(z<roofLimit&&explorationCave(x,y,z))return true;
  // Preserve authored floors and ramp ledges where random mining seams cross
  // the labyrinth. Player edits still take precedence in material().
  if(caveColumn(x,y).length)return false;
  if (x > 5990 && x < 6820 && Math.abs(y - 6192) < 66 && z >= FRIENDS_CAVE_HEIGHT && z < FRIENDS_CAVE_HEIGHT+96) return true;
  if (((x - 6790) / 185) ** 2 + ((y - 6210) / 150) ** 2 < 1 && z > FRIENDS_CAVE_HEIGHT-64 && z < FRIENDS_CAVE_HEIGHT+128) return true;
  // Deep horizontal seams invite player-made access tunnels throughout the frontier.
  return x > 10000 && z > -224 && z < -96 && terrainNoise(x / 280, y / 280) > .78;
}
export class FriendsTerrain {
  private grades: TerrainGrade[] = [];
  private gradeTiles = new Map<string,TerrainGrade[]>();
  private heights = new Map<string, number>();
  private edits = new Map<string, TerrainMaterial>();
  private columns = new Map<string, Set<number>>();
  revision = 0;
  constructor(saved?: TerrainSnapshot) { if (saved) this.restore(saved); }
  restore(saved: TerrainSnapshot) {
    this.edits.clear(); this.columns.clear();this.heights.clear();this.grades=[];this.gradeTiles.clear();
    // The landscape redesign intentionally retires former flat settlement
    // grades and excavations. New edits persist normally in generation 4.
    if(saved.generation===TERRAIN_GENERATION){
      for(const g of saved.grades || [])if(validTerrainGrade(g))this.addGrade(g,false);
      for(const e of (saved.edits || []).slice(0,6000))if(validTerrainEdit(e) && !friendsFixedPlatformProtected((e[0]+.5)*32,(e[1]+.5)*32,(e[2]+.5)*32))this.write(e[0],e[1],e[2],e[3]);
    }
    this.revision = Number.isSafeInteger(saved.revision) ? saved.revision : 0;
  }
  snapshot(): TerrainSnapshot { return { generation:TERRAIN_GENERATION, grades:this.grades.map(g=>[...g] as TerrainGrade), revision: this.revision, edits: [...this.edits].map(([k, m]) => [...k.split(',').map(Number), m] as TerrainEdit) }; }
  height(vx: number, vy: number) { const k = `${vx},${vy}`; let h = this.heights.get(k); if (h === undefined) { h = this.surfaceHeight((vx + .5) * VOXEL_SIZE, (vy + .5) * VOXEL_SIZE); if (this.heights.size > 100000) this.heights.clear(); this.heights.set(k, h); } return h; }
  surfaceHeight(x: number,y: number) {
    if(friendsCampfireContains(x,y))return FRIENDS_CAMPFIRE.z;
    const platform=friendsFixedPlatformAt(x,y);if(platform)return platform.top;
    const natural=baseTerrainHeight(x,y);let h=natural;
    for(const g of this.gradeTiles.get(`${Math.floor(x/512)},${Math.floor(y/512)}`) || []){const adjusted=grade(natural,x,y,g[0],g[1],g[2],g[3],320);h=natural<g[2]?Math.max(h,adjusted):Math.min(h,adjusted);}
    return scenicTransitSurface(x,y,gridHeight(h));
  }
  addGrade(g: TerrainGrade, revise=true) {
    if(!validTerrainGrade(g))return;
    const stored:TerrainGrade=[Math.min(FRONTIER_SIZE-1,Math.round(g[0])),Math.min(FRONTIER_SIZE-1,Math.round(g[1])),g[2],Math.min(512,Math.ceil(g[3]))];
    if(this.grades.some(p=>p.every((n,i)=>n===stored[i])) || this.grades.length>=8192)return;
    this.grades.push(stored);const r=stored[3]+320;
    for(let x=Math.floor((stored[0]-r)/512);x<=Math.floor((stored[0]+r)/512);x++)for(let y=Math.floor((stored[1]-r)/512);y<=Math.floor((stored[1]+r)/512);y++){const key=`${x},${y}`,list=this.gradeTiles.get(key)||[];list.push(stored);this.gradeTiles.set(key,list);}
    this.heights.clear();if(revise)this.revision++;
  }
  material(vx: number, vy: number, vz: number): TerrainMaterial {
    const x=(vx+.5)*32,y=(vy+.5)*32,z=(vz+.5)*32;
    if(friendsCampfireContains(x,y)&&z>=FRIENDS_CAMPFIRE.z-64&&z<FRIENDS_CAMPFIRE.z+128)return z<FRIENDS_CAMPFIRE.z?2:0;
    if (friendsFixedPlatformProtected(x,y,z)) return z < friendsFixedPlatformAt(x,y)!.top ? 2 : 0;
    const edit = this.edits.get(key(vx, vy, vz));
    if(edit!==undefined)return edit;
    if(scenicTransitAir(x,y,z))return 0;
    return this.naturalMaterial(vx,vy,vz);
  }
  /** Hidden voxel backing remains mineable, but cannot erase the paving
   * beneath a fan stair or become a phantom floor above its exact surface. */
  exposedMaterial(vx:number,vy:number,vz:number):TerrainMaterial {
    const value=this.material(vx,vy,vz);if(!value||this.edits.has(key(vx,vy,vz)))return value;
    const boxes=islandRuinsAt((vx+.5)*32,(vy+.5)*32),z=(vz+.5)*32;
    const owner=boxes.find(b=>z>=b.z&&z<b.z+b.h);
    return owner?.detail==='stair-core'&&!boxes.some(b=>b.detail!=='stair-core'&&z>=b.z&&z<b.z+b.h)?0:value;
  }
  private naturalMaterial(vx: number, vy: number, vz: number): TerrainMaterial {
    const x = (vx + .5) * VOXEL_SIZE, y = (vy + .5) * VOXEL_SIZE, z = (vz + .5) * VOXEL_SIZE;
    const top=this.height(vx,vy);
    if(islandRuinsAt(x,y).some(b=>z>=b.z&&z<b.z+b.h))return 2;
    if (x < 0 || y < 0 || x >= FRONTIER_SIZE || y >= FRONTIER_SIZE || z < TERRAIN_BOTTOM || z >= top) return 0;
    // Keep two solid foundation layers under migrated player work; new caves
    // can continue below them without removing the existing build's support.
    const foundation=z>=top-64&&(this.gradeTiles.get(`${Math.floor(x/512)},${Math.floor(y/512)}`)||[]).some(g=>Math.hypot(x-g[0],y-g[1])<=g[3]);
    if(!foundation&&naturalCave(x,y,z,top-32))return 0;
    const depth = this.height(vx, vy) - z;
    if (depth < 70) return 1;
    const vein = terrainNoise(vx / 5, vy / 5);
    if (vein > .57 && terrainHash(Math.floor(vx / 3), Math.floor(vy / 3), Math.floor(vz / 3)) > .46) return z < -160 || x > 13000 ? 4 : 3;
    // Visible copper at the starter cave lets players read ore rather than guess.
    if (x > 6200 && x < 7000 && Math.abs(y - 6192) < 150 && z < FRIENDS_CAVE_HEIGHT+160 && terrainHash(vx >> 1, vy >> 1, vz >> 1) > .54) return 3;
    return 2;
  }
  set(vx: number, vy: number, vz: number, material: TerrainMaterial) {
    if (!validTerrainEdit([vx, vy, vz, material]) || friendsFixedPlatformProtected((vx+.5)*32,(vy+.5)*32,(vz+.5)*32) || scenicTransitProtected((vx+.5)*32,(vy+.5)*32,(vz+.5)*32)) return false;
    const k = key(vx,vy,vz);
    if (material === this.naturalMaterial(vx,vy,vz)) {
      this.edits.delete(k); const column = this.columns.get(`${vx},${vy}`); column?.delete(vz); if (!column?.size) this.columns.delete(`${vx},${vy}`);
    } else {
      if (!this.edits.has(k) && this.edits.size >= 6000) return false;
      this.write(vx,vy,vz,material);
    }
    this.revision++; return true;
  }
  private write(vx: number, vy: number, vz: number, material: TerrainMaterial) {
    this.edits.set(key(vx, vy, vz), material);
    const k = `${vx},${vy}`, values = this.columns.get(k) || new Set<number>(); values.add(vz); this.columns.set(k, values);
  }
  columnRange(vx: number, vy: number) {
    let bottom = Math.floor(this.height(vx, vy) / VOXEL_SIZE) - 1, top = bottom;
    const changes = this.columns.get(`${vx},${vy}`);
    if (changes) for (const z of changes) { bottom = Math.min(bottom, z - 1); top = Math.max(top, z + 1); }
    const x = (vx + .5) * VOXEL_SIZE, y = (vy + .5) * VOXEL_SIZE;
    if ((x > 5980 && x < 7000 && Math.abs(y - 6192) < 200) || x > 10000) bottom = Math.min(bottom, x>5980 && x<7000 && Math.abs(y-6192)<200 ? FRIENDS_CAVE_HEIGHT/32-3 : -8);
    const arch=islandArchRange(x,y);if(arch)bottom=Math.min(bottom,arch[0]/32-1);
    for(const b of islandRuinsAt(x,y)){bottom=Math.min(bottom,b.z/32-1);top=Math.max(top,(b.z+b.h)/32);}
    for(const [floor]of caveColumn(x,y))bottom=Math.min(bottom,Math.floor(floor/32)-1);
    for(const [lo]of scenicStructureRanges(x,y))bottom=Math.min(bottom,Math.floor((lo-32)/32));
    for(const p of scenicRailColumns(x,y))bottom=Math.min(bottom,Math.floor((p.z-96)/32));
    return { bottom: Math.max(-16, bottom), top };
  }
  floor(x: number, y: number, z: number, step = FRIENDS_STEP_HEIGHT): number | undefined {
    const stair=CASTLE_STAIRS.floor(x,y,z,step);
    const rail=scenicRailFloor(x,y,z,step);
    let best=Math.max(stair??-Infinity,rail??-Infinity);
    const vx = Math.floor(x / VOXEL_SIZE), vy = Math.floor(y / VOXEL_SIZE);
    for (let vz = Math.floor((z + step) / VOXEL_SIZE) - 1; vz >= -16; vz--) {
      if (this.exposedMaterial(vx, vy, vz) && !this.exposedMaterial(vx, vy, vz + 1)) {best=Math.max(best,(vz+1)*VOXEL_SIZE);break;}
    }
    return Number.isFinite(best)?best:undefined;
  }
  supports(x: number, y: number, z: number) {
    const stair=CASTLE_STAIRS.floor(x,y,z,0);if(stair!==undefined&&Math.abs(stair-z)<.001)return true;
    const top=Math.round(z/VOXEL_SIZE);if(Math.abs(top*VOXEL_SIZE-z)>=1)return false;
    const vx=Math.floor(x/VOXEL_SIZE),vy=Math.floor(y/VOXEL_SIZE);
    return Boolean(this.exposedMaterial(vx,vy,top-1)) && !this.exposedMaterial(vx,vy,top);
  }
  ceiling(x: number, y: number, z: number): number | undefined {
    const deck=scenicRailCeiling(x,y,z);
    const vx = Math.floor(x / VOXEL_SIZE), vy = Math.floor(y / VOXEL_SIZE);
    const max = Math.ceil(Math.max(this.height(vx,vy),...islandRuinsAt(x,y).map(b=>b.z+b.h)) / VOXEL_SIZE) + 2;
    for (let vz = Math.floor((z + .1) / VOXEL_SIZE); vz <= max; vz++) if (vz * VOXEL_SIZE > z + .1 && this.exposedMaterial(vx, vy, vz)) return Math.min(deck??Infinity,vz*VOXEL_SIZE);
    return deck;
  }
  collide(p: { x: number; y: number }, z: number, radius: number, bodyHeight = 50, step = FRIENDS_STEP_HEIGHT, inclineConnection?: (x:number,y:number,top:number)=>boolean) {
    let collided = false;
    for (let pass = 0; pass < 2; pass++) {
      const xmin = Math.floor((p.x - radius) / VOXEL_SIZE), xmax = Math.floor((p.x + radius) / VOXEL_SIZE), ymin = Math.floor((p.y - radius) / VOXEL_SIZE), ymax = Math.floor((p.y + radius) / VOXEL_SIZE);
      for (let vx = xmin; vx <= xmax; vx++) for (let vy = ymin; vy <= ymax; vy++) {
        let solid = false, top:number|undefined;
        for (let vz = Math.floor((z + step + .1) / VOXEL_SIZE); vz * VOXEL_SIZE < z + bodyHeight - .1; vz++) if (this.material(vx, vy, vz)) {
          const owner=islandRuinsAt((vx+.5)*32,(vy+.5)*32).find(b=>(vz+.5)*32>=b.z&&(vz+.5)*32<b.z+b.h);
          // Only the recessed stair core yields to the exact fan surface.
          // A wall sharing its cell must retain ordinary solid collision.
          if(owner?.detail==='stair-core')continue;
          solid = true;
          if(!this.material(vx,vy,vz+1))top=(vz+1)*VOXEL_SIZE;
          break;
        }
        if (!solid) continue;
        const cx = (vx + .5) * VOXEL_SIZE, cy = (vy + .5) * VOXEL_SIZE, nearX = Math.max(cx - 16, Math.min(cx + 16, p.x)), nearY = Math.max(cy - 16, Math.min(cy + 16, p.y));
        const dx = p.x - nearX, dy = p.y - nearY, distance = Math.hypot(dx, dy);
        if (distance >= radius) continue;
        // A ramp meeting this exposed top has no entrance wall. Keep every
        // other voxel face solid, including higher blocks beside the ramp.
        if(distance>.001&&top!==undefined&&inclineConnection?.(nearX,nearY,top))continue;
        if (distance > .001) { p.x += dx / distance * (radius - distance); p.y += dy / distance * (radius - distance); }
        else if (Math.abs(p.x - cx) > Math.abs(p.y - cy)) p.x = cx + (p.x < cx ? -1 : 1) * (16 + radius);
        else p.y = cy + (p.y < cy ? -1 : 1) * (16 + radius);
        collided = true;
      }
    }
    return CASTLE_STAIRS.collide(p,z,radius)||collided;
  }
  wallContact(position: { x: number; y: number }, z: number, radius: number) {
    const probe = { ...position };
    if (!this.collide(probe, z, radius + 2, 50, 0)) return undefined;
    const dx = probe.x - position.x, dy = probe.y - position.y, length = Math.hypot(dx, dy);
    return length > .001 ? { normalX: dx / length, normalY: dy / length } : undefined;
  }
  raycast(ray: TerrainRay, maxDistance = 260): TerrainHit | undefined {
    const dirs = [ray.dx, ray.dy, ray.dz], origin = [ray.x, ray.y, ray.z], cell = origin.map(v => Math.floor(v / VOXEL_SIZE));
    const steps = dirs.map(v => v < 0 ? -1 : 1), delta = dirs.map(v => v === 0 ? Infinity : VOXEL_SIZE / Math.abs(v));
    const next = dirs.map((v, i) => v === 0 ? Infinity : (((cell[i] + (v > 0 ? 1 : 0)) * VOXEL_SIZE) - origin[i]) / v);
    let distance = 0, normal = [0, 0, 1];
    while (distance <= maxDistance) {
      const m = this.exposedMaterial(cell[0], cell[1], cell[2]);
      if (m) return { x: ray.x + ray.dx * distance, y: ray.y + ray.dy * distance, z: ray.z + ray.dz * distance, vx: cell[0], vy: cell[1], vz: cell[2], nx: normal[0], ny: normal[1], nz: normal[2], distance, material: m };
      const axis = next[0] < next[1] ? next[0] < next[2] ? 0 : 2 : next[1] < next[2] ? 1 : 2;
      distance = next[axis]; if (!Number.isFinite(distance)) break;
      cell[axis] += steps[axis]; next[axis] += delta[axis]; normal = [0, 0, 0]; normal[axis] = -steps[axis];
    }
    return undefined;
  }
}
export function validTerrainEdit(e: unknown): e is TerrainEdit {
  return Array.isArray(e) && e.length === 4 && e.every(Number.isSafeInteger) && e[0] >= 0 && e[0] < FRONTIER_SIZE / VOXEL_SIZE && e[1] >= 0 && e[1] < FRONTIER_SIZE / VOXEL_SIZE && e[2] >= -16 && e[2] < 256 && e[3] >= 0 && e[3] <= 4;
}

export function validTerrainGrade(g: unknown): g is TerrainGrade {return Array.isArray(g) && g.length===4 && g.every(Number.isFinite) && g[0]>=0 && g[0]<FRONTIER_SIZE && g[1]>=0 && g[1]<FRONTIER_SIZE && g[2]>=TERRAIN_BOTTOM+96 && g[2]<=6000 && g[2]%32===0 && g[3]>=32 && g[3]<=512;}
