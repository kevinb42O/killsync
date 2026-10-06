import { caveColumn, caveEntranceFloor, explorationCave } from './FriendsCave';
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
export const TERRAIN_GENERATION = 2;
export type TerrainSnapshot = { revision: number; edits: TerrainEdit[]; generation?: number; grades?: TerrainGrade[] };
export type TerrainRay = { x: number; y: number; z: number; dx: number; dy: number; dz: number };
export type TerrainHit = { x: number; y: number; z: number; vx: number; vy: number; vz: number; nx: number; ny: number; nz: number; distance: number; material: TerrainMaterial };
export const FRONTIER_SITES = [
  { id: 'mine', name: 'COPPER HOLLOW', x: 6260, y: 6190, detail: 'Walk into the hillside. Mine the copper seams and smelt your cargo.', color: '#e4a16b' },
  { id: 'forest', name: 'CEDAR REACH', x: 10700, y: 4200, detail: 'A deep woodland. Bring timber home and plant the next forest.', color: '#95b989' },
  { id: 'ridge', name: 'HIGHFALL RIDGE', x: 15600, y: 8700, detail: 'An alpine landing site above rich iron deposits.', color: '#c2d4df' },
  { id: 'coast', name: 'THE LONG SHORE', x: 28700, y: 19000, detail: 'A distant coast of salt water, ridges and scattered salvage.', color: '#82c9cc' },
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
export const FRIENDS_AIRFIELD_HEIGHT = gridHeight(rollingGround(4704,5728));
export const FRIENDS_ARRIVAL_HEIGHT = gridHeight(rollingGround(5904,5712));
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
export function baseTerrainHeight(x: number, y: number) {
  // The same terrain field covers the whole world. No rectangular basin mask.
  let h=landmarks(rollingGround(x,y),x,y,false);
  h=grade(h,x,y,4704,5728,FRIENDS_AIRFIELD_HEIGHT,220,420);
  h=grade(h,x,y,5904,5712,FRIENDS_ARRIVAL_HEIGHT,160,380);
  // A dry hollow keeps existing construction at its saved elevation. Water
  // is absent; removing it must not raise terrain into older player builds.
  const hollow=Math.hypot((x-7440)/1040,(y-6520)/710);
  if(hollow<1.25)h=FRIENDS_LAKE_LEVEL-64+(h-FRIENDS_LAKE_LEVEL+64)*smooth((hollow-.8)/.45);
  h+=Math.max(0,1-Math.hypot((x-6610)/600,(y-6190)/410))*320;
  const mouth=caveEntranceFloor(x,y);
  return mouth===undefined?gridHeight(h):Math.min(gridHeight(h),mouth);
}
export function terrainProtected(x: number, y: number) {
  // Vegetation clearance around arrival and the aircraft. This is not an
  // excavation reserve: players may reshape this ground.
  return Math.hypot(x - 5900, y - 5630) < 180 || Math.hypot(x - 4700, y - 5720) < 300;
}
export function naturalCave(x: number, y: number, z: number, roofLimit=Infinity) {
  if(z<roofLimit&&explorationCave(x,y,z))return true;
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
    for(const g of saved.grades || [])if(validTerrainGrade(g))this.addGrade(g,false);
    if(saved.generation!==TERRAIN_GENERATION)for(const e of saved.edits || [])if(validTerrainEdit(e)) {const x=(e[0]+.5)*32,y=(e[1]+.5)*32; if(legacyTerrainHeight(x,y)!==baseTerrainHeight(x,y))this.addGrade([x,y,legacyTerrainHeight(x,y),48],false);}
    for (const e of (saved.edits || []).slice(0, 6000)) if (validTerrainEdit(e)) this.write(e[0], e[1], e[2], e[3]);
    this.revision = Number.isSafeInteger(saved.revision) ? saved.revision : 0;
  }
  snapshot(): TerrainSnapshot { return { generation:TERRAIN_GENERATION, grades:this.grades.map(g=>[...g] as TerrainGrade), revision: this.revision, edits: [...this.edits].map(([k, m]) => [...k.split(',').map(Number), m] as TerrainEdit) }; }
  height(vx: number, vy: number) { const k = `${vx},${vy}`; let h = this.heights.get(k); if (h === undefined) { h = this.surfaceHeight((vx + .5) * VOXEL_SIZE, (vy + .5) * VOXEL_SIZE); if (this.heights.size > 100000) this.heights.clear(); this.heights.set(k, h); } return h; }
  surfaceHeight(x: number,y: number) {
    const natural=baseTerrainHeight(x,y);let h=natural;
    for(const g of this.gradeTiles.get(`${Math.floor(x/512)},${Math.floor(y/512)}`) || [])h=Math.min(h,grade(natural,x,y,g[0],g[1],g[2],g[3],320));
    return gridHeight(h);
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
    const edit = this.edits.get(key(vx, vy, vz)); return edit ?? this.naturalMaterial(vx,vy,vz);
  }
  private naturalMaterial(vx: number, vy: number, vz: number): TerrainMaterial {
    const x = (vx + .5) * VOXEL_SIZE, y = (vy + .5) * VOXEL_SIZE, z = (vz + .5) * VOXEL_SIZE;
    const top=this.height(vx,vy);
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
    if (!validTerrainEdit([vx, vy, vz, material])) return false;
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
    for(const [floor]of caveColumn(x,y))bottom=Math.min(bottom,Math.floor(floor/32)-1);
    return { bottom: Math.max(-16, bottom), top };
  }
  floor(x: number, y: number, z: number, step = FRIENDS_STEP_HEIGHT): number | undefined {
    const vx = Math.floor(x / VOXEL_SIZE), vy = Math.floor(y / VOXEL_SIZE);
    for (let vz = Math.floor((z + step) / VOXEL_SIZE) - 1; vz >= -16; vz--) {
      if (this.material(vx, vy, vz) && !this.material(vx, vy, vz + 1)) return (vz + 1) * VOXEL_SIZE;
    }
    return undefined;
  }
  supports(x: number, y: number, z: number) {
    const top=Math.round(z/VOXEL_SIZE);if(Math.abs(top*VOXEL_SIZE-z)>=1)return false;
    const vx=Math.floor(x/VOXEL_SIZE),vy=Math.floor(y/VOXEL_SIZE);
    return Boolean(this.material(vx,vy,top-1)) && !this.material(vx,vy,top);
  }
  ceiling(x: number, y: number, z: number): number | undefined {
    const vx = Math.floor(x / VOXEL_SIZE), vy = Math.floor(y / VOXEL_SIZE);
    const max = Math.ceil(this.height(vx, vy) / VOXEL_SIZE) + 2;
    for (let vz = Math.floor((z + .1) / VOXEL_SIZE); vz <= max; vz++) if (vz * VOXEL_SIZE > z + .1 && this.material(vx, vy, vz)) return vz * VOXEL_SIZE;
    return undefined;
  }
  collide(p: { x: number; y: number }, z: number, radius: number, bodyHeight = 50, step = FRIENDS_STEP_HEIGHT) {
    let collided = false;
    for (let pass = 0; pass < 2; pass++) {
      const xmin = Math.floor((p.x - radius) / VOXEL_SIZE), xmax = Math.floor((p.x + radius) / VOXEL_SIZE), ymin = Math.floor((p.y - radius) / VOXEL_SIZE), ymax = Math.floor((p.y + radius) / VOXEL_SIZE);
      for (let vx = xmin; vx <= xmax; vx++) for (let vy = ymin; vy <= ymax; vy++) {
        let solid = false;
        for (let vz = Math.floor((z + step + .1) / VOXEL_SIZE); vz * VOXEL_SIZE < z + bodyHeight - .1; vz++) if (this.material(vx, vy, vz)) { solid = true; break; }
        if (!solid) continue;
        const cx = (vx + .5) * VOXEL_SIZE, cy = (vy + .5) * VOXEL_SIZE, nearX = Math.max(cx - 16, Math.min(cx + 16, p.x)), nearY = Math.max(cy - 16, Math.min(cy + 16, p.y));
        const dx = p.x - nearX, dy = p.y - nearY, distance = Math.hypot(dx, dy);
        if (distance >= radius) continue;
        if (distance > .001) { p.x += dx / distance * (radius - distance); p.y += dy / distance * (radius - distance); }
        else if (Math.abs(p.x - cx) > Math.abs(p.y - cy)) p.x = cx + (p.x < cx ? -1 : 1) * (16 + radius);
        else p.y = cy + (p.y < cy ? -1 : 1) * (16 + radius);
        collided = true;
      }
    }
    return collided;
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
      const m = this.material(cell[0], cell[1], cell[2]);
      if (m) return { x: ray.x + ray.dx * distance, y: ray.y + ray.dy * distance, z: ray.z + ray.dz * distance, vx: cell[0], vy: cell[1], vz: cell[2], nx: normal[0], ny: normal[1], nz: normal[2], distance, material: m };
      const axis = next[0] < next[1] ? next[0] < next[2] ? 0 : 2 : next[1] < next[2] ? 1 : 2;
      distance = next[axis]; if (!Number.isFinite(distance)) break;
      cell[axis] += steps[axis]; next[axis] += delta[axis]; normal = [0, 0, 0]; normal[axis] = -steps[axis];
    }
    return undefined;
  }
}
export function validTerrainEdit(e: unknown): e is TerrainEdit {
  return Array.isArray(e) && e.length === 4 && e.every(Number.isSafeInteger) && e[0] >= 0 && e[0] < FRONTIER_SIZE / VOXEL_SIZE && e[1] >= 0 && e[1] < FRONTIER_SIZE / VOXEL_SIZE && e[2] >= -16 && e[2] < 192 && e[3] >= 0 && e[3] <= 4;
}

export function validTerrainGrade(g: unknown): g is TerrainGrade {return Array.isArray(g) && g.length===4 && g.every(Number.isFinite) && g[0]>=0 && g[0]<FRONTIER_SIZE && g[1]>=0 && g[1]<FRONTIER_SIZE && g[2]>=TERRAIN_BOTTOM+96 && g[2]<=6000 && g[2]%32===0 && g[3]>=32 && g[3]<=512;}
