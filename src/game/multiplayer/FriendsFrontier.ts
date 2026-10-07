import { scenicTransitProtected } from '../world/FriendsRailInfrastructure';
import { FRIENDS_TREE_CANDIDATES } from '../world/FriendsVegetationAppearance';
import { islandClimate, islandCoastDistance } from '../world/FriendsIsland';
import { FriendsTerrain, VOXEL_SIZE, TERRAIN_CHUNK, terrainHash, terrainNoise, terrainProtected, friendsSpawnProtected, friendsFixedPlatformProtected, FRIENDS_SPAWN_PLATFORM, baseTerrainHeight, frontierSiteElevation, islandRuinsAt, FRONTIER_SIZE, FRONTIER_SITES, validTerrainEdit, validTerrainGrade, TERRAIN_GENERATION, type TerrainSnapshot, type TerrainRay } from '../world/FriendsTerrain';
import { FRIENDS_HUB } from '../world/FriendsRegion';
import { PLAYER_TRAIN_COST } from '../world/FriendsPlayerRail';
import { friendsVehicleFloor, type FriendsVehicle } from './FriendsExpedition';
import { FRIENDS_BUILD_CATALOG, friendsShapeBoxes, worldBox, type FriendsBuildPiece, type FriendsBuildShape, type FriendsBuildFinish } from './FriendsBuilding';

export const MATERIAL_NAMES = { wood: 'Timber', soil: 'Soil', stone: 'Stone', copper: 'Copper ore', iron: 'Iron ore', planks: 'Planks', ingots: 'Ingots', saplings: 'Saplings' } as const;
export type Resource = keyof typeof MATERIAL_NAMES;
export type Materials = Record<Resource, number>;
export type FrontierTool = 0 | 1 | 2 | 3 | 4 | 5;
export const FRONTIER_TOOLS = ['Combat', 'Axe', 'Pickaxe', 'Shovel', 'Earthwork', 'Rope'] as const;
export const PACK_CAPACITY = 160;
export const FRIENDS_TEST_MODE = true; // Temporary playtest rules: free construction and uncapped inventories.
export const emptyMaterials = (): Materials => ({ wood: 0, soil: 0, stone: 0, copper: 0, iron: 0, planks: 0, ingots: 0, saplings: 0 });
export type FrontierActor = { id: string; label?: string; x: number; y: number; z: number; lifeState: string };
export type FrontierTree = { id: string; x: number; y: number; z: number; kind: 'pine' | 'oak' | 'autumnOak'; scale: number };
export type FrontierSnapshot = {
  testing?: boolean;
  version: 1; revision: number; terrain: TerrainSnapshot; packs: Record<string, Materials>; stock: Materials; cargo: Materials;
  harvested: string[]; planted: FrontierTree[]; upgrades: number; contracts: number; built: number; mined: number; chopped: number;
  discovered?: string[]; feedback: Record<string, { message: string; until: number }>; damage?: { id: string; value: number; total: number; until?: number; by?: string; kind?: 'wood' | 'soil' | 'stone' | 'ore' };
};
export type FrontierRequest = { requestId: number; action: 'scenic_speed' | 'scenic_hold' | 'scenic_depart' | 'train_place' | 'train_remove' | 'train_hold' | 'train_depart' | 'planks' | 'smelt_copper' | 'smelt_iron' | 'upgrade' | 'deposit' | 'withdraw' | 'load' | 'unload' | 'contract' | 'plant' | 'home'; resource?: Resource;speedKmh?:number;stopAtStations?:boolean };
export type FrontierResult = { playerId: string; requestId: number; ok: boolean; message: string };
/** Broad woodland regions with irregular edges; most land remains meadow. */
export function frontierForestDensity(x: number, y: number) {
  const regional = terrainNoise(x / 3600 + 17, y / 3600 + 9);
  const edge = terrainNoise(x / 850, y / 850) * .15;
  const cedar = Math.exp(-(((x - 10700) / 2200) ** 2 + ((y - 4200) / 1700) ** 2));
  const west = Math.exp(-(((x - 2900) / 1300) ** 2 + ((y - 7800) / 1900) ** 2));
  const mask = Math.max(regional + edge, cedar * .9, west * .85);
  return mask > .71 ? Math.min(1, (mask - .71) * 6) : 0;
}
const treeCache = new Map<string, FrontierTree[]>();
export function frontierTrees(cx: number, cy: number) {
  const cacheKey = `${cx},${cy}`; const existing = treeCache.get(cacheKey); if (existing) return existing;
  const trees: FrontierTree[] = [];
  for (let i = 0; i < FRIENDS_TREE_CANDIDATES; i++) {
    const x = (cx + terrainHash(cx, cy, i * 3)) * TERRAIN_CHUNK, y = (cy + terrainHash(cx, cy, i * 3 + 1)) * TERRAIN_CHUNK;
    if (terrainHash(cx, cy, i + 500) > frontierForestDensity(x,y)) continue;
    if (islandCoastDistance(x,y)<1250 || islandClimate(x,y)[2]>.35) continue;
    if (FRONTIER_SITES.some(site => Math.hypot(x-site.x, y-site.y) < 140) || x < 180 || y < 180 || x > 47800 || y > 47800 || islandRuinsAt(x,y).length || terrainProtected(x, y) || baseTerrainHeight(x, y) < 0 || baseTerrainHeight(x, y) > 1900) continue;
    if (x < 10400 && y < 11000) {
      if (x > 5910 && x < 6900 && Math.abs(y - 6192) < 120) continue;
    }
    if(scenicTransitProtected(x,y,baseTerrainHeight(x,y))||scenicTransitProtected(x,y,baseTerrainHeight(x,y)+360))continue;
    trees.push({ id: `${cx}:${cy}:${i}`, x, y, z: baseTerrainHeight(Math.floor(x / 32) * 32 + 16, Math.floor(y / 32) * 32 + 16), kind: terrainHash(cx, cy, i) > .72 ? 'autumnOak' : x > 11000 || terrainHash(cx, cy, i + 70) > .4 ? 'pine' : 'oak', scale: .7 + terrainHash(cx, cy, i + 40) * .9 });
  }
  if (cx === 11 && cy === 11) trees.push({ id: 'starter:cedar', x: 6080, y: 5860, z: baseTerrainHeight(6096,5872), kind: 'pine', scale: 1 });
  treeCache.set(cacheKey, trees); if (treeCache.size > 512) treeCache.delete(treeCache.keys().next().value!); return trees;
}
export const packKey = (actor: FrontierActor) => actor.id.startsWith('friend-') ? `crew:${actor.id}` : ('crew:' + (actor.label || actor.id).trim()).toLowerCase().slice(0, 32);
export const packWeight = (pack: Partial<Materials>) => Object.values(pack).reduce((a, b) => a + (b || 0), 0);
export function buildCost(shape: FriendsBuildShape, finish: FriendsBuildFinish): Partial<Materials> {
  if (shape === 'rail_straight') return {wood:2,stone:1};
  if (shape === 'rail_curve') return {wood:4,stone:2};
  if (shape === 'workbench') return { wood: 10, stone: 4 };
  if (shape === 'furnace') return { stone: 16, copper: 4 };
  if (shape === 'storage') return { planks: 8 };
  if (shape === 'landing_pad') return { stone: 20, ingots: 6 };
  const units = Math.max(1, Math.ceil(FRIENDS_BUILD_CATALOG[shape].w * FRIENDS_BUILD_CATALOG[shape].d * FRIENDS_BUILD_CATALOG[shape].h / 131072));
  return finish === 'grass' || finish === 'soil' ? { soil: Math.min(6, units) } : finish === 'copper' ? { copper: Math.min(6, units) } : finish === 'iron' ? { iron: Math.min(6, units) } : finish === 'teal' ? { ingots: Math.min(6, units) } : finish === 'timber' ? { wood: Math.min(6, units) } : { stone: Math.min(6, units) };
}
export function canAfford(materials: Partial<Materials>, cost: Partial<Materials>) { return Object.entries(cost).every(([k, amount]) => (materials[k as Resource] || 0) >= amount); }
export function frontierContract(index: number) {
  const region = index % 5, multiplier = 1 + Math.min(2, Math.floor(index / 5));
  const costs: Partial<Materials>[] = [{ wood: 24, stone: 12 }, { wood: 16, stone: 8 }, { planks: 12, ingots: 4 }, { stone: 24, planks: 8 }, { wood: 24, ingots: 6 }];
  return { destination: region ? FRONTIER_SITES[region - 1] : undefined, cost: Object.fromEntries(Object.entries(costs[region]).map(([r, n]) => [r, n * multiplier])) as Partial<Materials>, reward: 3 + multiplier * 2 };
}
export class FriendsFrontier {
  readonly terrain: FriendsTerrain;
  private state: FrontierSnapshot;
  private handled = new Map<string, number>();
  private nextHit = new Map<string, number>();
  private damage = new Map<string, number>();
  private harvested = new Set<string>();
  private snapshotCache?: FrontierSnapshot;
  constructor(saved?: FrontierSnapshot, private readonly testing = FRIENDS_TEST_MODE) {
    this.terrain = new FriendsTerrain(saved && isFrontierSave(saved) ? saved.terrain : undefined);
    this.state = { version: 1, revision: 0, terrain: this.terrain.snapshot(), packs: {}, stock: emptyMaterials(), cargo: emptyMaterials(), harvested: [], planted: [], upgrades: 0, contracts: 0, built: 0, mined: 0, chopped: 0, feedback: {}, discovered: [] };
    if (saved && isFrontierSave(saved)) {
      this.state = { ...this.state, ...structuredClone(saved), feedback: {}, damage: undefined };
      this.harvested = new Set(saved.harvested);
    }
  }
  private get capacity() { return this.testing ? Infinity : PACK_CAPACITY; }
  preserveTerrainWork(_pieces: readonly FriendsBuildPiece[], _previous?: TerrainSnapshot) {
    // Generation 4 deliberately removes the previous settlement's flat grades.
    // Authored caves remain in the natural field; new player edits still persist.
  }
  adaptLegacyBuildings(pieces: readonly FriendsBuildPiece[]) {
    // Preserve settlements from the previous flat world when the mining hill is introduced.
    for (const p of pieces) if(!p.attachment)for (const local of friendsShapeBoxes(p.shape)) {
      const b = worldBox(p, local);
      for (let x = Math.floor((b.x-b.w/2+.01)/32); x <= Math.floor((b.x+b.w/2-.01)/32); x++) for (let y = Math.floor((b.y-b.d/2+.01)/32); y <= Math.floor((b.y+b.d/2-.01)/32); y++) for (let z = Math.floor((b.z+.01)/32); z <= Math.floor((b.z+b.h-.01)/32); z++) if (this.terrain.material(x,y,z)) this.terrain.set(x,y,z,0);
    }
    this.changed();
  }
  pack(actor: FrontierActor) {
    const k = packKey(actor);
    const legacy=('crew:'+(actor.label||actor.id).trim()).toLowerCase().slice(0,32);
    if(k!==legacy&&!Object.hasOwn(this.state.packs,k)&&Object.hasOwn(this.state.packs,legacy)){this.state.packs[k]=this.state.packs[legacy];delete this.state.packs[legacy];this.changed();}
    if (!Object.hasOwn(this.state.packs, k)) { if (Object.keys(this.state.packs).length >= 128) return emptyMaterials(); this.state.packs[k] = { ...emptyMaterials(), wood: 18, stone: 12, saplings: 3 }; this.changed(); }
    return this.state.packs[k];
  }
  private changed() { this.state.revision++; this.snapshotCache = undefined; }
  getRevision() { return this.state.revision; }
  private tell(actor: FrontierActor, message: string, elapsed: number) { this.state.feedback[actor.id] = { message, until: elapsed + 4200 }; this.changed(); }
  treesNear(x: number, y: number) {
    const cx = Math.floor(x / TERRAIN_CHUNK), cy = Math.floor(y / TERRAIN_CHUNK);
    const result = this.state.planted.filter(p => Math.hypot(x - p.x, y - p.y) < 900);
    for (let a = cx - 1; a <= cx + 1; a++) for (let b = cy - 1; b <= cy + 1; b++) result.push(...frontierTrees(a, b));
    return result.filter(t => !this.harvested.has(t.id) && this.terrain.supports(t.x,t.y,t.z));
  }
  tool(actor: FrontierActor, tool: FrontierTool, ray: TerrainRay, elapsed: number, pieces: readonly FriendsBuildPiece[], canEdit = true, bodies: readonly FrontierActor[] = []) {
    if (!tool || tool === 5 || actor.lifeState !== 'alive' || elapsed < (this.nextHit.get(actor.id) || 0)) return;
    this.nextHit.set(actor.id, elapsed + (this.state.upgrades ? 190 : 330));
    if (!canEdit) { this.tell(actor, 'The host needs to grant building access before you can harvest or dig.', elapsed); return; }
    const pack = this.pack(actor), ground = this.terrain.raycast(ray, 240);
    if (tool === 1) {
      let target: FrontierTree | undefined, nearest = ground?.distance ?? 240;
      for (const tree of this.treesNear(actor.x, actor.y)) {
        const dx = tree.x - ray.x, dy = tree.y - ray.y, along = (dx * ray.dx + dy * ray.dy) / Math.max(.01, ray.dx ** 2 + ray.dy ** 2);
        const z = ray.z + ray.dz * along;
        if (along > 0 && along < nearest && z > tree.z && z < tree.z + 230 * tree.scale && Math.hypot(ray.x + ray.dx * along - tree.x, ray.y + ray.dy * along - tree.y) < 30 * tree.scale) { target = tree; nearest = along; }
      }
      if (!target) { this.tell(actor, 'Aim at a tree trunk within reach.', elapsed); return; }
      if (packWeight(pack) + 12 > this.capacity) { this.tell(actor, 'Pack full. Deposit at a workshop or load the train.', elapsed); return; }
      const hits = (this.damage.get(target.id) || 0) + 1, total = this.state.upgrades ? 2 : 4;
      this.damage.set(target.id, hits); this.state.damage = { id: target.id, value: hits, total, until: elapsed + 1400, by: actor.id, kind: 'wood' }; this.changed();
      if (hits >= total && !target.id.startsWith('planted:') && this.harvested.size >= 12000) { this.tell(actor, 'This world has reached its forestry budget.', elapsed); return; }
      if (hits >= total) { if (target.id.startsWith('planted:')) this.state.planted = this.state.planted.filter(t => t.id !== target!.id); else this.harvested.add(target.id); this.damage.delete(target.id); this.state.chopped++; pack.wood += 10; pack.saplings += 1; this.tell(actor, '+10 timber · +1 sapling. Replant from your field pack.', elapsed); }
      return;
    }
    if (!ground) { this.tell(actor, 'Aim at earth or an exposed rock face within reach.', elapsed); return; }
    const { vx, vy, vz, material } = ground, x = (vx + .5) * 32, y = (vy + .5) * 32;
    if (friendsFixedPlatformProtected(x, y, (vz+.5)*32) && tool !== 4) { this.tell(actor, friendsSpawnProtected(x,y,(vz+.5)*32)?'The player spawn platform is indestructible.':'The hauling platform is indestructible.', elapsed); return; }
    const overlapsVoxel=(p:FriendsBuildPiece,nx:number,ny:number,nz:number,support:boolean)=>friendsShapeBoxes(p.shape).some(local=>{
      const b=worldBox(p,local),cx=(nx+.5)*32,cy=(ny+.5)*32;
      return Math.abs(cx-b.x)<b.w/2+16-.01&&Math.abs(cy-b.y)<b.d/2+16-.01&&
        (support?Math.abs((nz+1)*32-b.z)<.1:nz*32<b.z+b.h&&(nz+1)*32>b.z);
    });
    if(scenicTransitProtected(x,y,(vz+.5)*32)){this.tell(actor,'The Grand Traverse rail corridor is protected. Excavate beside the line.',elapsed);return;}
    if (tool!==4&&pieces.some(p=>overlapsVoxel(p,vx,vy,vz,true))) { this.tell(actor, 'This block supports a saved build. Remove or move the piece first.', elapsed); return; }
    if (tool === 4) {
      const nx = vx + ground.nx, ny = vy + ground.ny, nz = vz + ground.nz, tx = (nx + .5) * 32, ty = (ny + .5) * 32;
      if (friendsFixedPlatformProtected(tx, ty, (nz+.5)*32)) { this.tell(actor, friendsSpawnProtected(tx,ty,(nz+.5)*32)?'Keep the player spawn platform clear.':'Keep the hauling platform clear.', elapsed); return; }
      if(scenicTransitProtected(tx,ty,(nz+.5)*32)){this.tell(actor,'Keep the Grand Traverse railway clear.',elapsed);return;}
      if (pieces.some(p=>overlapsVoxel(p,nx,ny,nz,false))) { this.tell(actor, 'Keep structures clear.', elapsed); return; }
      if (!this.testing && !pack.soil) { this.tell(actor, 'Gather soil with the shovel first.', elapsed); return; }
      if (nz < -16 || nz >= 192 || this.terrain.material(nx, ny, nz) || [actor, ...bodies].some(p => Math.hypot((nx + .5) * 32 - p.x, (ny + .5) * 32 - p.y) < 44 && nz * 32 < p.z + 50 && (nz + 1) * 32 > p.z)) { this.tell(actor, 'Leave space for your operator.', elapsed); return; }
      if (!this.terrain.set(nx, ny, nz, 1)) { this.tell(actor, 'This world has reached its excavation budget. Export a backup before starting another frontier.', elapsed); return; } if(!this.testing)pack.soil--; this.tell(actor, 'Soil placed. Shape paths, steps and foundations.', elapsed); return;
    }
    if (vz <= -16) { this.tell(actor, 'Bedrock. Explore sideways for another seam.', elapsed); return; }
    if (tool === 3 && material !== 1) { this.tell(actor, 'Stone needs the pickaxe. Select 2.', elapsed); return; }
    if (packWeight(pack) + 2 > this.capacity) { this.tell(actor, 'Pack full. Use shared storage or a cargo carriage.', elapsed); return; }
    const id = `${vx},${vy},${vz}`, total = tool === 3 || material === 1 ? 1 : this.state.upgrades ? 1 : 2, hits = (this.damage.get(id) || 0) + 1;
    this.damage.set(id, hits); this.state.damage = { id, value: hits, total, until: elapsed + 1400, by: actor.id, kind: material === 1 ? 'soil' : material > 2 ? 'ore' : 'stone' }; this.changed();
    if (hits < total) return;
    const resource: Resource = material === 1 ? 'soil' : material === 3 ? 'copper' : material === 4 ? 'iron' : 'stone';
    if (!this.terrain.set(vx, vy, vz, 0)) { this.tell(actor, 'This world has reached its excavation budget. Export a backup before starting another frontier.', elapsed); return; } pack[resource] += material === 1 ? 1 : 2; this.state.mined++;
    this.damage.delete(id);
    this.tell(actor, `+${material === 1 ? 1 : 2} ${MATERIAL_NAMES[resource].toLowerCase()}`, elapsed);
  }
  collideTrees(position: { x: number; y: number }, z: number, radius: number) {
    let collided = false;
    for (const tree of this.treesNear(position.x, position.y)) {
      if (z >= tree.z + 180 * tree.scale || z + 50 < tree.z) continue;
      const dx = position.x - tree.x, dy = position.y - tree.y, d = Math.hypot(dx, dy), extent = radius + 10 * tree.scale;
      if (d < extent) { position.x = tree.x + (d > .001 ? dx / d : 1) * extent; position.y = tree.y + (d > .001 ? dy / d : 0) * extent; collided = true; }
    }
    return collided;
  }
  explore(actor: FrontierActor, elapsed: number) {
    if (actor.lifeState !== 'alive') return;
    for (const site of FRONTIER_SITES) if (!this.state.discovered?.includes(site.id) && Math.hypot(actor.x-site.x, actor.y-site.y) < 200 && Math.abs(actor.z-frontierSiteElevation(site)) < 280) {
      (this.state.discovered ||= []).push(site.id); this.state.stock.ingots += 2; this.state.stock.saplings += 2;
      this.tell(actor, `${site.name} charted · supply cache: +2 ingots and +2 saplings in storage.`, elapsed);
    }
  }
  nearWorkshop(actor: FrontierActor, pieces: readonly FriendsBuildPiece[]) { return pieces.some(p => ['workbench', 'storage', 'furnace'].includes(p.shape) && Math.hypot(actor.x - p.x, actor.y - p.y, actor.z - p.z) < 220); }
  acceptRequest(actor: FrontierActor, requestId: number) {
    if (!Number.isSafeInteger(requestId) || requestId <= (this.handled.get(actor.id) || 0)) return false;
    this.handled.set(actor.id, requestId); return true;
  }
  request(actor: FrontierActor, request: FrontierRequest, elapsed: number, pieces: readonly FriendsBuildPiece[], vehicles: readonly FriendsVehicle[], canEdit = true): FrontierResult {
    const result = (ok: boolean, message: string) => { this.tell(actor, message, elapsed); return { playerId: actor.id, requestId: request.requestId, ok, message }; };
    if (!request || !this.acceptRequest(actor, request.requestId)) return { playerId: actor.id, requestId: request?.requestId || 0, ok: false, message: 'This operation was already handled.' };
    if (actor.lifeState !== 'alive') return result(false, 'Return to your expedition first.');
    if (request.action === 'home') { actor.x = FRIENDS_HUB.x; actor.y = FRIENDS_HUB.y + 90; actor.z = FRIENDS_SPAWN_PLATFORM.top; return result(true, 'Returned to the spawn platform.'); }
    if (!canEdit) return result(false, 'The host needs to enable world editing.');
    const pack = this.pack(actor), workshop = this.nearWorkshop(actor, pieces);
    const train = vehicles.find(v => v.kind === 'train' && !v.closed && !v.scenic && (Math.hypot(actor.x - v.x, actor.y - v.y, actor.z - v.z) < 240 || Math.abs((friendsVehicleFloor([v], actor.x, actor.y, actor.z) ?? Infinity) - actor.z) < 2));
    if (request.action === 'load' || request.action === 'unload') {
      if (!train) return result(false, 'Board or stand beside a cargo carriage.');
      const from = request.action === 'load' ? pack : this.state.cargo, to = request.action === 'load' ? this.state.cargo : pack;
      const capacity = this.testing ? Infinity : request.action === 'load' ? 2000 : PACK_CAPACITY;
      if (!packWeight(from)) return result(false, 'There is no cargo to transfer.');
      let available = capacity - packWeight(to); for (const r of Object.keys(MATERIAL_NAMES) as Resource[]) { const amount = Math.min(from[r], Math.max(0, available)); from[r] -= amount; to[r] += amount; available -= amount; }
      return result(true, request.action === 'load' ? 'Materials loaded onto Sunline. Cargo travels with the train.' : 'Cargo collected into your field pack.');
    }
    if (request.action === 'plant') {
      if (!pack.saplings) return result(false, 'Cut a tree to collect a sapling.');
      const x = actor.x + 100, y = actor.y, z = this.terrain.floor(x, y, actor.z + 64);
      if (z === undefined || z < 0 || scenicTransitProtected(x,y,z) || scenicTransitProtected(x,y,z+360) || terrainProtected(x, y) || this.treesNear(x, y).some(t => Math.hypot(t.x - x, t.y - y) < 90) || pieces.some(p => Math.hypot(p.x - x, p.y - y) < 100) || this.state.planted.length >= 256) return result(false, 'Find an open patch of earth away from your builds.');
      pack.saplings--; this.state.planted.push({ id: `planted:${this.state.revision}`, x, y, z, kind: 'pine', scale: .75 }); return result(true, 'A new cedar planted. Your forest can grow again.');
    }
    if (request.action === 'contract') {
      const order = frontierContract(this.state.contracts), site = order.destination;
      if (site && (Math.hypot(actor.x-site.x, actor.y-site.y) > 280 || Math.abs(actor.z-frontierSiteElevation(site)) > 300)) return result(false, `Carry this order to ${site.name}. Locate it on the atlas.`);
      if (!site && !workshop) return result(false, 'Deliver this order to the home workshop.');
      const source = site ? pack : this.state.stock;
      if (!canAfford(source, order.cost)) return result(false, site ? 'Carry the requested materials in your field pack.' : 'Deposit the requested materials in shared storage first.');
      this.spend(source, order.cost); this.state.stock.ingots += order.reward; this.state.stock.saplings += 2; this.state.contracts++;
      return result(true, `Supply order completed · +${order.reward} ingots and +2 saplings in storage. The next destination is in your journal.`);
    }
    if (!workshop && !pieces.some(p => p.shape === 'furnace' && Math.hypot(actor.x - p.x, actor.y - p.y, actor.z - p.z) < 220)) return result(false, 'Return to the home workshop or build one nearby.');
    if (request.action === 'deposit') { for (const r of Object.keys(MATERIAL_NAMES) as Resource[]) { this.state.stock[r] += pack[r]; pack[r] = 0; } return result(true, 'Field pack deposited in shared storage.'); }
    if (request.action === 'withdraw') {
      if (!(request.resource && Object.hasOwn(MATERIAL_NAMES, request.resource))) return result(false, 'Choose a material.');
      const amount = Math.min(24, this.state.stock[request.resource], this.capacity - packWeight(pack)); if (amount <= 0) return result(false, 'Storage is empty or your pack is full.');
      this.state.stock[request.resource] -= amount; pack[request.resource] += amount; return result(true, `Collected ${amount} ${MATERIAL_NAMES[request.resource].toLowerCase()}.`);
    }
    const recipes: Partial<Record<FrontierRequest['action'], { cost: Partial<Materials>; output?: Partial<Materials> }>> = {
      planks: { cost: { wood: 2 }, output: { planks: 4 } }, smelt_copper: { cost: { copper: 2, wood: 1 }, output: { ingots: 1 } }, smelt_iron: { cost: { iron: 2, wood: 1 }, output: { ingots: 2 } }, upgrade: { cost: { ingots: 4, planks: 8 } },
    };
    const recipe = Object.hasOwn(recipes, request.action) ? recipes[request.action] : undefined; if (!recipe) return result(false, 'Choose a valid workshop operation.');
    const source = canAfford(pack, recipe.cost) ? pack : this.state.stock;
    if (!canAfford(source, recipe.cost)) return result(false, 'Gather or withdraw the recipe materials first.');
    if (recipe.output && packWeight(source) - packWeight(recipe.cost) + packWeight(recipe.output) > (this.testing ? Infinity : source === pack ? PACK_CAPACITY : 100000)) return result(false, 'Make room in your field pack first.');
    if (request.action === 'upgrade' && this.state.upgrades) return result(false, 'Your crew already has reinforced tools.');
    this.spend(source, recipe.cost); if (recipe.output) for (const [r, n] of Object.entries(recipe.output)) source[r as Resource] += n;
    else this.state.upgrades = 1;
    return result(true, request.action === 'upgrade' ? 'Reinforced tools unlocked for the whole crew.' : request.action === 'planks' ? 'Crafted 4 planks.' : 'Ore smelted into useful ingots.');
  }
  contractCost(): Partial<Materials> { return frontierContract(this.state.contracts).cost; }
  purchaseTrain(actor: FrontierActor) { if(this.testing)return;const pack=this.pack(actor),source=canAfford(pack,PLAYER_TRAIN_COST)?pack:this.state.stock; if(!canAfford(source,PLAYER_TRAIN_COST))return 'A train needs 8 timber, 12 planks and 4 ingots in your pack or shared storage.'; this.spend(source,PLAYER_TRAIN_COST); }
  spend(source: Materials, cost: Partial<Materials>) { for (const [r, n] of Object.entries(cost)) source[r as Resource] -= n; this.changed(); }
  refund(actor: FrontierActor, cost: Partial<Materials>) { if(this.testing)return;this.pack(actor); for (const [r, n] of Object.entries(cost)) this.state.stock[r as Resource] += n; this.changed(); }
  buildTransition(actor: FrontierActor, before?: FriendsBuildPiece, after?: Pick<FriendsBuildPiece, 'shape' | 'finish'>) {
    if(this.testing){this.pack(actor);if(!before && after)this.state.built++;this.changed();return;}
    const oldCost = before ? buildCost(before.shape, before.finish) : {}, newCost = after ? buildCost(after.shape, after.finish) : {};
    const charge: Partial<Materials> = {}, refund: Partial<Materials> = {};
    for (const r of Object.keys(MATERIAL_NAMES) as Resource[]) { const n = (newCost[r] || 0) - (oldCost[r] || 0); if (n > 0) charge[r] = n; if (n < 0) refund[r] = -n; }
    const pack = this.pack(actor);
    if (!canAfford(pack, charge)) return 'Gather materials or withdraw them from storage before building.';
    this.spend(pack, charge); for (const [r, n] of Object.entries(refund)) this.state.stock[r as Resource] += n;
    if (!before && after) this.state.built++; this.changed(); return undefined;
  }
  snapshot(): FrontierSnapshot {
    if (this.snapshotCache?.terrain.revision !== this.terrain.revision) this.snapshotCache = undefined;
    if (!this.snapshotCache) this.snapshotCache = { ...this.state, testing:this.testing, terrain: this.terrain.snapshot(), harvested: [...this.harvested], packs: Object.fromEntries(Object.entries(this.state.packs).map(([k, p]) => [k, { ...p }])), discovered: [...(this.state.discovered || [])], stock: { ...this.state.stock }, cargo: { ...this.state.cargo }, planted: this.state.planted.map(p => ({ ...p })), feedback: { ...this.state.feedback } };
    return this.snapshotCache;
  }
}
export function isFrontierSave(value: unknown): value is FrontierSnapshot {
  const f = value as FrontierSnapshot;
  if (!f || f.testing!==undefined && typeof f.testing!=='boolean' || f.version !== 1 || !f.terrain || !Array.isArray(f.terrain.edits) || f.terrain.edits.length > 6000 || !f.terrain.edits.every(validTerrainEdit) || f.terrain.generation!==undefined && f.terrain.generation!==2 && f.terrain.generation!==3 && f.terrain.generation!==TERRAIN_GENERATION || f.terrain.grades!==undefined && (!Array.isArray(f.terrain.grades) || f.terrain.grades.length>8192 || !f.terrain.grades.every(validTerrainGrade)) || !Number.isSafeInteger(f.terrain.revision) || f.terrain.revision < 0 || !Array.isArray(f.harvested) || f.harvested.length > 12000 || !Array.isArray(f.planted) || f.planted.length > 256 || !f.packs || typeof f.packs !== 'object' || Object.keys(f.packs).length > 128) return false;
  const valid = (p: Materials) => p && Object.keys(MATERIAL_NAMES).every(k => Number.isSafeInteger(p[k as Resource]) && p[k as Resource] >= 0 && p[k as Resource] <= Number.MAX_SAFE_INTEGER);
  if (f.discovered && (!Array.isArray(f.discovered) || f.discovered.length > FRONTIER_SITES.length || !f.discovered.every(id => FRONTIER_SITES.some(s => s.id === id)))) return false;
  if (!f.harvested.every(id => typeof id === 'string' && /^(?:[0-9]{1,2}:[0-9]{1,2}:[0-9]{1,2}|starter:cedar|planted:[0-9]{1,12})$/.test(id)) || !f.planted.every(t => t && typeof t.id === 'string' && t.id.length <= 64 && ['pine', 'oak', 'autumnOak'].includes(t.kind) && [t.x, t.y, t.z, t.scale].every(Number.isFinite) && t.x >= 0 && t.x < FRONTIER_SIZE && t.y >= 0 && t.y < FRONTIER_SIZE && t.z >= -512 && t.z <= 6000 && t.scale >= .1 && t.scale <= 3) || !Object.keys(f.packs).every(k => k.startsWith('crew:') && (k.length <= 32 || /^crew:friend-[a-f0-9]{32}$/.test(k)))) return false;
  return valid(f.stock) && valid(f.cargo) && Object.values(f.packs).every(valid) && [f.revision, f.upgrades, f.contracts, f.built, f.mined, f.chopped].every(n => Number.isSafeInteger(n) && n >= 0);
}
