import { CAVE_TREASURES, nearbyCaveTreasure } from '../world/FriendsCave';
import { isPlayerRail, playerRailRoute, samplePlayerRail, nearestRailDistance, type PlayerRailRoute } from '../world/FriendsPlayerRail';
import { FRONTIER_SIZE, FRIENDS_AIRFIELD_HEIGHT, type FriendsTerrain } from '../world/FriendsTerrain';
import type { FrontierSnapshot } from './FriendsFrontier';
import { resolveFriendsBuildCollisions, worldBox, friendsShapeBoxes, type FriendsBuildPiece, type FriendsBuildingSnapshot } from './FriendsBuilding';
import type { FriendsProjectSnapshot } from './FriendsProjects';
import { getNearbyWorldObstacles, resolveWorldCollisions } from '../world/WorldLayout';
import { FRIENDS_AIRPAD, FRIENDS_PLACES, FRIENDS_SIGNALS, insideFriendsCombat } from '../world/FriendsRegion';
import type { MultiplayerInputFrame } from './protocol';

export type FriendsVehicle = { id: string; kind: 'train' | 'aircraft'; x: number; y: number; z: number; angle: number; length: number; width: number; pilotId?: string; closed?: boolean };
export type FriendsProgress = { version: 1; discovered: string[]; signals: string[]; salvageCleared: boolean; restored: boolean; openedTreasures?: string[]; caveGold?: number };
export type FriendsTransportSave = { trainDistance: number; trainStoppedMs: number; lastStop: number; held: boolean; aircraft: FriendsVehicle; railTrain?: { anchor: number; distance: number; direction: 1 | -1; held: boolean } };
export type FriendsSnapshot = { transport?: FriendsTransportSave; frontier?: FrontierSnapshot; building?: FriendsBuildingSnapshot; projects?: FriendsProjectSnapshot; vehicles: FriendsVehicle[]; trainDistance: number; trainStoppedMs: number; progress: FriendsProgress; salvageState: 'idle' | 'active' | 'cleared'; notice: string; noticeUntilMs: number };
export const FRIENDS_SAVE_KEY = 'killsync.friends.expedition.v1';
export const TRAIN_SPEED = 180;
export const FRIENDS_FLIGHT_CEILING = 6000;
export { TRAIN_LOOP_LENGTH, TRAIN_STOPS, INITIAL_TRAIN_DISTANCE, sampleTrainRoute } from '../world/FriendsRailway';

export function normalizeFriendsProgress(value: unknown): FriendsProgress {
  const p = value && typeof value === 'object' ? value as Partial<FriendsProgress> : {};
  const discovered = Array.isArray(p.discovered) ? p.discovered : [];
  const signals = Array.isArray(p.signals) ? p.signals : [];
  return { version: 1,
    discovered: FRIENDS_PLACES.filter(place => discovered.includes(place.id)).map(place => place.id),
    signals: FRIENDS_SIGNALS.filter(signal => signals.includes(signal.id)).map(signal => signal.id),
    openedTreasures: CAVE_TREASURES.filter(t=>Array.isArray(p.openedTreasures)&&p.openedTreasures.includes(t.id)).map(t=>t.id),
    // Derive the wallet from the fixed rewards so malformed saves cannot mint gold.
    caveGold: CAVE_TREASURES.reduce((sum,t)=>sum+(Array.isArray(p.openedTreasures)&&p.openedTreasures.includes(t.id)?t.gold:0),0),
    salvageCleared: p.salvageCleared === true, restored: p.restored === true && FRIENDS_SIGNALS.every(signal => signals.includes(signal.id)),
  };
}
export function readFriendsProgress(): FriendsProgress {
  try { return normalizeFriendsProgress(JSON.parse(localStorage.getItem(FRIENDS_SAVE_KEY) || '{}')); } catch { return normalizeFriendsProgress({}); }
}
export function saveFriendsProgress(progress: FriendsProgress) {
  try { localStorage.setItem(FRIENDS_SAVE_KEY, JSON.stringify(normalizeFriendsProgress(progress))); } catch { /* A full storage quota must not interrupt play. */ }
}

export function vehicleLocal(v: FriendsVehicle, x: number, y: number) {
  const dx = x - v.x, dy = y - v.y, c = Math.cos(v.angle), s = Math.sin(v.angle);
  return { x: dx * c + dy * s, y: -dx * s + dy * c };
}
export function vehicleContains(v: FriendsVehicle, x: number, y: number, margin = 0) {
  const p = vehicleLocal(v, x, y);
  return Math.abs(p.x) <= v.length / 2 - margin && Math.abs(p.y) <= v.width / 2 - margin;
}
/** Cockpit controls take precedence over menus and loot underneath the craft. */
export function friendsCockpitInteraction(vehicles: readonly FriendsVehicle[], player: { id: string; x: number; y: number; z: number }) {
  const v = vehicles.find(v => v.kind === 'aircraft');
  if (!v) return false;
  if (v.pilotId === player.id) return true;
  const local = vehicleLocal(v, player.x, player.y);
  return !v.pilotId && Math.abs(player.z - v.z) < 22 && local.x > 55 && local.x < 165 && Math.abs(local.y) < 55;
}
export function friendsVehicleFloor(vehicles: readonly FriendsVehicle[], x: number, y: number, z: number) {
  let floor: number | undefined;
  for (const v of vehicles) {
    const canStepAboard = !v.closed && z >= v.z - 18;
    if (!vehicleContains(v, x, y, 0) || (z < v.z - 1 && !canStepAboard)) continue;
    if (!v.closed) floor = Math.max(floor ?? 0, v.z);
    const local = vehicleLocal(v, x, y);
    const roof = v.z + (v.kind === 'train' ? 115 : local.x < 67 ? 109 : 106.5);
    if (z >= roof - 1 && (v.kind === 'train' || local.x > -123)) floor = Math.max(floor ?? 0, roof);
  }
  for (const link of trainGangways(vehicles)) if (z >= link.z - 18 && pointOnGangway(link, x, y)) floor = Math.max(floor ?? 0, link.z);
  return floor;
}
export type TrainGangway = { from: FriendsVehicle; to: FriendsVehicle; ax: number; ay: number; bx: number; by: number; z: number; width: number };
export function trainGangways(vehicles: readonly FriendsVehicle[]): TrainGangway[] {
  const cars = vehicles.filter(v => v.kind === 'train' && !v.closed).sort((a, b) => a.id.localeCompare(b.id));
  return cars.slice(1).map((rear, i) => {
    const front = cars[i];
    return { from: front, to: rear, ax: front.x - Math.cos(front.angle) * (front.length / 2 - 12), ay: front.y - Math.sin(front.angle) * (front.length / 2 - 12), bx: rear.x + Math.cos(rear.angle) * (rear.length / 2 - 12), by: rear.y + Math.sin(rear.angle) * (rear.length / 2 - 12), z: Math.max(front.z, rear.z), width: Math.min(front.width, rear.width) + 8 };
  });
}
export function pointOnGangway(link: TrainGangway, x: number, y: number) {
  const dx = link.bx - link.ax, dy = link.by - link.ay, lengthSq = dx * dx + dy * dy;
  const t = lengthSq > .001 ? ((x - link.ax) * dx + (y - link.ay) * dy) / lengthSq : 0;
  return t >= -.000001 && t <= 1.000001 && Math.hypot(x - link.ax - dx * t, y - link.ay - dy * t) <= link.width / 2 + .000001;
}
export function carryOnVehicle(actor: { x: number; y: number; z: number }, before: FriendsVehicle, after: FriendsVehicle) {
  const floor = friendsVehicleFloor([before], actor.x, actor.y, actor.z);
  if (floor === undefined || Math.abs(actor.z - floor) > 1) return false;
  const local = vehicleLocal(before, actor.x, actor.y), c = Math.cos(after.angle), s = Math.sin(after.angle);
  actor.x = after.x + local.x * c - local.y * s; actor.y = after.y + local.x * s + local.y * c; actor.z += after.z - before.z;
  return true;
}
/** Solid locomotive hull; open passenger decks deliberately have no invisible
 * perimeter wall. Resolve in vehicle coordinates so turns keep the same hull. */
export function resolveFriendsVehicleCollisions(vehicles: readonly FriendsVehicle[], position: { x: number; y: number }, z: number, radius: number) {
  let collided = false;
  for (const v of vehicles) {
    if (!v.closed || z >= v.z + 114 || z + 26 < v.z - 14) continue;
    const local = vehicleLocal(v, position.x, position.y);
    const extentX = v.length / 2 + radius, extentY = v.width / 2 + radius;
    if (Math.abs(local.x) >= extentX || Math.abs(local.y) >= extentY) continue;
    if (extentX - Math.abs(local.x) < extentY - Math.abs(local.y)) local.x = (local.x < 0 ? -1 : 1) * extentX;
    else local.y = (local.y < 0 ? -1 : 1) * extentY;
    const c = Math.cos(v.angle), s = Math.sin(v.angle);
    position.x = v.x + local.x * c - local.y * s; position.y = v.y + local.x * s + local.y * c; collided = true;
  }
  return collided;
}
export function friendsWorldFloor(vehicles: readonly FriendsVehicle[], x: number, y: number, z: number) {
  let floor = friendsVehicleFloor(vehicles, x, y, z);
  for (const o of getNearbyWorldObstacles(x, y, 1, 'friends_frontier')) {
    if (x >= o.x && x <= o.x + o.width && y >= o.y && y <= o.y + o.height && z >= o.elevation - 1) floor = Math.max(floor ?? 0, o.elevation);
  }
  return floor;
}
export function friendsVehicleCeiling(vehicles: readonly FriendsVehicle[], x: number, y: number, z: number) {
  let ceiling: number | undefined;
  for (const v of vehicles) {
    if (v.closed || !vehicleContains(v, x, y, 2) || z < v.z - 1) continue;
    const local = vehicleLocal(v, x, y);
    if (v.kind === 'aircraft' && local.x < -123) continue;
    const underside = v.z + (v.kind === 'train' ? 109 : local.x < 67 ? 101 : 99.5);
    if (z < underside) ceiling = Math.min(ceiling ?? Infinity, underside);
  }
  return ceiling;
}

type Actor = { id: string; x: number; y: number; z: number; lifeState: string; platformVelocityX?: number; platformVelocityY?: number; platformVelocityZ?: number };

export class FriendsExpedition {
  readonly progress: FriendsProgress;
  private trainDistance = 0;
  private route?: PlayerRailRoute;
  private railTrain?: NonNullable<FriendsTransportSave['railTrain']>;
  private railRevision = -1;
  private trainStoppedMs = 0;
  private lastStop = 0;
  private held = true;
  private aircraft: FriendsVehicle = { id: 'sunskiff', kind: 'aircraft', ...FRIENDS_AIRPAD, z: 14, angle: 0, length: 280, width: 160 };
  private salvageState: FriendsSnapshot['salvageState'];
  private notice = 'An open frontier. B builds your tracks and workshop; G assembles a train beside your track. The helicopter waits at its ground spawn.';
  private noticeUntilMs = 18000;
  constructor(progress?: FriendsProgress, transport?: FriendsTransportSave, private terrain?: FriendsTerrain) {
    this.progress = normalizeFriendsProgress(progress); this.salvageState = 'idle';
    const saved=transport?.railTrain;
    if(saved && Number.isSafeInteger(saved.anchor) && saved.anchor>0 && Number.isFinite(saved.distance) && saved.distance>=0 && (saved.direction===1 || saved.direction===-1)) { this.railTrain={...saved}; this.held=saved.held===true; this.trainDistance=saved.distance; }
    this.resetAircraft(terrain);
  }
  resetAircraft(terrain?: FriendsTerrain, players: readonly Actor[] = []) {
    const before={...this.aircraft};
    this.aircraft={id:'sunskiff',kind:'aircraft',...FRIENDS_AIRPAD,z:(terrain?.floor(FRIENDS_AIRPAD.x,FRIENDS_AIRPAD.y,6000,0)??FRIENDS_AIRFIELD_HEIGHT)+14,angle:0,length:280,width:160};
    for(const p of players) if(carryOnVehicle(p,before,this.aircraft) || before.pilotId===p.id) {
      if(before.pilotId===p.id) {p.x=this.aircraft.x+40;p.y=this.aircraft.y;p.z=this.aircraft.z;}
      p.platformVelocityX=0;p.platformVelocityY=0;p.platformVelocityZ=0;
    }
  }
  setRailway(pieces: readonly FriendsBuildPiece[], revision: number, players: readonly Actor[] = []) {
    if(this.railRevision===revision)return;
    this.railRevision=revision;
    const before=this.vehicles();
    const old=this.route && this.railTrain ? samplePlayerRail(this.route,this.trainDistance) : undefined;
    this.route=this.railTrain ? playerRailRoute(pieces,this.railTrain.anchor) : undefined;
    if(this.route && old) this.trainDistance=nearestRailDistance(this.route,old).distance;
    if(this.route) this.trainDistance=this.clampTrainDistance(this.trainDistance);
    else this.railTrain=undefined;
    const after=this.vehicles();
    for(const p of players)for(const v of before){const next=after.find(n=>n.id===v.id);if(next && carryOnVehicle(p,v,next))break;}
  }
  hasTrain() {return Boolean(this.railTrain);}
  trackInUse(id: number) {return Boolean(this.railTrain && this.route?.entries.some(e=>e.piece.id===id));}
  trainPlacement(pieces: readonly FriendsBuildPiece[], actor: Actor) {
    if(this.railTrain)return {error:'A train is already assembled. Dismantle it before moving it to another line.'};
    const considered=new Set<number>(), candidates:{p:FriendsBuildPiece;route:PlayerRailRoute;nearest:{distance:number;error:number}}[]=[];
    for(const p of pieces)if(isPlayerRail(p.shape) && !considered.has(p.id)) {
      const route=playerRailRoute(pieces,p.id);if(!route || route.length<256)continue;
      for(const e of route.entries)considered.add(e.piece.id);
      candidates.push({p,route,nearest:nearestRailDistance(route,actor)});
    }
    const candidate=candidates.sort((a,b)=>a.nearest.error-b.nearest.error)[0];
    if(!candidate || candidate.nearest.error>280)return {error:'Build a connected track, then stand beside it to assemble your train.'};
    return {anchor:candidate.p.id,route:candidate.route!,distance:candidate.nearest.distance};
  }
  placeTrain(pieces: readonly FriendsBuildPiece[], actor: Actor) {
    const placement=this.trainPlacement(pieces,actor); if(placement.error)return placement.error;
    this.route=placement.route; this.railTrain={anchor:placement.anchor!,distance:placement.distance!,direction:1,held:true}; this.held=true; this.trainDistance=this.clampTrainDistance(placement.distance!);
  }
  removeTrain(players: readonly Actor[]) {
    if(!this.held)return 'Hold the train before dismantling it.';
    if(players.some(p=>p.lifeState==='alive' && friendsVehicleFloor(this.vehicles().filter(v=>v.kind==='train'),p.x,p.y,p.z)!==undefined))return 'Everyone must step off the train before dismantling it.';
    this.railTrain=undefined;this.route=undefined;this.trainDistance=0;
  }
  private carCount() {return this.route ? Math.min(3,Math.max(0,Math.floor((this.route.length-(this.route.closed?180:256))/195))) : 0;}
  private clampTrainDistance(d:number) { if(!this.route)return 0;return this.route.closed ? (d%this.route.length+this.route.length)%this.route.length : Math.max(90+this.carCount()*195,Math.min(this.route.length-90,d)); }
  vehicles(): FriendsVehicle[] {
    if(!this.route || !this.railTrain)return [{...this.aircraft}];
    const train=(id:string,distance:number,closed=false):FriendsVehicle=>{const p=samplePlayerRail(this.route!,distance);return {id,kind:'train',...p,z:p.z+14,length:180,width:112,closed};};
    return [...Array.from({length:this.carCount()},(_,i)=>train(`sunline-${i}`,this.trainDistance-(i+1)*195)),{...this.aircraft},train('sunline-engine',this.trainDistance,true)];
  }
  update(dt: number, elapsed: number, players: readonly Actor[], inputs: ReadonlyMap<string, MultiplayerInputFrame>, pieces: readonly FriendsBuildPiece[] = [], terrain?: FriendsTerrain) {
    const before=this.vehicles();
    if(this.route && this.railTrain && !this.held) {
      const travel=TRAIN_SPEED*dt/1000,lo=90+this.carCount()*195,hi=this.route.length-90;
      if(this.route.closed)this.trainDistance=this.clampTrainDistance(this.trainDistance+travel);
      else {this.trainDistance+=travel*this.railTrain.direction; if(this.trainDistance>=hi){this.trainDistance=hi;this.railTrain.direction=-1;} else if(this.trainDistance<=lo){this.trainDistance=lo;this.railTrain.direction=1;} }
    }
    const pilot = players.find(p => p.id === this.aircraft.pilotId && p.lifeState === 'alive');
    if (!pilot) this.aircraft.pilotId = undefined;
    const input = pilot && inputs.get(pilot.id);
    if (input) {
      const angle = input.aimAngle / 65535 * Math.PI * 2;
      const turn = Math.atan2(Math.sin(angle - this.aircraft.angle), Math.cos(angle - this.aircraft.angle));
      this.aircraft.angle += Math.max(-dt * .0012, Math.min(dt * .0012, turn));
      const forward = Number(Boolean(input.movement & 1)) - Number(Boolean(input.movement & 2));
      const strafe = Number(Boolean(input.movement & 8)) - Number(Boolean(input.movement & 4));
      const magnitude = Math.max(1, Math.hypot(forward, strafe)), speed = input.sprinting ? 650 : 420;
      const heading = this.aircraft.angle;
      const dx = (Math.cos(heading) * forward - Math.sin(heading) * strafe) / magnitude * speed * dt / 1000;
      const dy = (Math.sin(heading) * forward + Math.cos(heading) * strafe) / magnitude * speed * dt / 1000;
      const position = { x: Math.max(256, Math.min(FRONTIER_SIZE - 256, this.aircraft.x + dx)), y: Math.max(256, Math.min(FRONTIER_SIZE - 256, this.aircraft.y + dy)) };
      if (this.salvageState === 'active' && insideFriendsCombat(position.x, position.y, this.aircraft.z - 14)) { position.x = this.aircraft.x; position.y = this.aircraft.y; }
      terrain?.collide(position, this.aircraft.z - 14, 175, 125, 0);
      resolveWorldCollisions(position, 175, false, 'friends_frontier', this.aircraft.z - 14);
      resolveFriendsBuildCollisions(pieces, position, this.aircraft.z - 14, 175, 125, 0);
      this.aircraft.x = position.x; this.aircraft.y = position.y;
      let landingFloor = (terrain?.floor(this.aircraft.x, this.aircraft.y, this.aircraft.z - 14, 0) ?? 0) + 14;
      for (const o of getNearbyWorldObstacles(this.aircraft.x, this.aircraft.y, 175, 'friends_frontier')) {
        const nearX = Math.max(o.x, Math.min(o.x + o.width, this.aircraft.x)), nearY = Math.max(o.y, Math.min(o.y + o.height, this.aircraft.y));
        // Only descend onto a roof already below the hull. A corner collision
        // beside a tall tower must never teleport the aircraft onto its top.
        if (o.elevation <= this.aircraft.z - 14 + .01 && Math.hypot(this.aircraft.x - nearX, this.aircraft.y - nearY) < 175 - .01) landingFloor = Math.max(landingFloor, o.elevation + 14);
      }
      for (const p of pieces) for (const local of friendsShapeBoxes(p.shape)) { const b = worldBox(p, local), top = b.z + b.h; const nx = Math.max(b.x - b.w / 2, Math.min(b.x + b.w / 2, this.aircraft.x)), ny = Math.max(b.y - b.d / 2, Math.min(b.y + b.d / 2, this.aircraft.y)); if (top <= this.aircraft.z - 14 + .01 && Math.hypot(this.aircraft.x - nx, this.aircraft.y - ny) < 175 - .01) landingFloor = Math.max(landingFloor, top + 14); }
      if (this.salvageState === 'active' && insideFriendsCombat(this.aircraft.x, this.aircraft.y, 0)) landingFloor = Math.max(landingFloor, 330);
      this.aircraft.z = Math.max(landingFloor, Math.min(FRIENDS_FLIGHT_CEILING, this.aircraft.z + (input.jetHeld ? 1 : input.sliding ? -1 : 0) * 300 * dt / 1000));
    }
    const after = this.vehicles();
    for (const p of players) {
      if (p.lifeState !== 'alive') continue;
      const oldPosition = { x: p.x, y: p.y, z: p.z };
      let carried = false;
      for (let i = 0; i < before.length; i++) {
        const next=after.find(v=>v.id===before[i].id);
        if (!next || !carryOnVehicle(p, before[i], next)) continue;
        carried = true; break;
      }
      if (!carried) {
        const link = trainGangways(before).find(link => Math.abs(p.z - link.z) <= 1 && pointOnGangway(link, p.x, p.y));
        if (link) {
          const index = before.findIndex(v => v.id === link.from.id), local = vehicleLocal(before[index], p.x, p.y), next = after.find(v=>v.id===before[index].id)!;
          p.x = next.x + local.x * Math.cos(next.angle) - local.y * Math.sin(next.angle); p.y = next.y + local.x * Math.sin(next.angle) + local.y * Math.cos(next.angle); carried = true;
        }
      }
      if (carried) { const seconds = Math.max(.001, dt / 1000); p.platformVelocityX = (p.x - oldPosition.x) / seconds; p.platformVelocityY = (p.y - oldPosition.y) / seconds; p.platformVelocityZ = (p.z - oldPosition.z) / seconds; }

    }
    if (pilot) { const v = this.aircraft; pilot.x = v.x + Math.cos(v.angle) * 100; pilot.y = v.y + Math.sin(v.angle) * 100; pilot.z = v.z; }
  }
  interact(player: Actor, elapsed: number): 'salvage' | 'signal' | 'pilot' | 'restore' | 'treasure' | undefined {
    if(player.lifeState!=='alive')return;
    const v = this.aircraft;
    if (v.pilotId === player.id) { v.pilotId = undefined; player.x = v.x + Math.cos(v.angle) * 40; player.y = v.y + Math.sin(v.angle) * 40; this.say('Pilot controls released. The Sunskiff holds its position.', elapsed); return 'pilot'; }
    if (friendsCockpitInteraction([v], player)) { v.pilotId = player.id; this.say('Sunskiff: move to fly · jump to ascend · crouch to descend · interact to release controls.', elapsed); return 'pilot'; }
    const treasure=nearbyCaveTreasure(player,this.progress.openedTreasures,this.terrain?(x,y,z)=>!this.terrain!.material(Math.floor(x/32),Math.floor(y/32),Math.floor(z/32)):undefined);
    if(treasure){
      this.progress.openedTreasures=[...(this.progress.openedTreasures||[]),treasure.id];
      this.progress.caveGold=(this.progress.caveGold||0)+treasure.gold;
      this.say(`${treasure.name} opened · +${treasure.gold.toLocaleString('en-US')} gold! Crew treasury: ${this.progress.caveGold.toLocaleString('en-US')} gold.`,elapsed);
      return 'treasure';
    }
  }
  controlTrain(action: 'train_hold' | 'train_depart') { this.held = action === 'train_hold'; this.trainStoppedMs=this.held?1:0; }
  resetSalvage(elapsed: number) { if (this.salvageState === 'active') { this.salvageState = 'idle'; this.say('Rustwater has reset. The safe valley is yours; return when you want another try.', elapsed); } }
  finishSalvage(elapsed: number) { if (this.salvageState !== 'active') return false; this.salvageState = 'cleared'; this.progress.salvageCleared = true; this.say('Rustwater cleared. Everyone receives 600 credits. The wreck is yours to explore.', elapsed); return true; }
  private say(message: string, elapsed: number) { this.notice = message; this.noticeUntilMs = elapsed + 16000; }
  snapshot(): FriendsSnapshot { return { transport: { trainDistance: this.trainDistance, trainStoppedMs: this.trainStoppedMs, lastStop: this.lastStop, held: this.held, aircraft: { ...this.aircraft, pilotId: undefined }, railTrain: this.railTrain ? {...this.railTrain,distance:this.trainDistance,held:this.held} : undefined }, vehicles: this.vehicles(), trainDistance: this.trainDistance, trainStoppedMs: this.trainStoppedMs, progress: normalizeFriendsProgress(this.progress), salvageState: this.salvageState, notice: this.notice, noticeUntilMs: this.noticeUntilMs }; }
}
