import { raycastCaveProps } from '../world/FriendsCaveProps';
import { COOP_PLAYER_RADIUS } from './playerMovement';
import { nearbyCaveLift, caveLavaAt, CAVE_RETURN, type DescentPoint } from '../world/FriendsCaveDescent';
import { FriendsFishingBoat, type FishingBoatSave } from './FriendsFishingBoat';
import { fishingBoatDeckContains, fishingBoatInteraction, FISHING_BOAT_COLLIDERS } from '../world/FriendsFishingBoat';
import { FriendsAircraftLanding, aircraftDescentSpeed } from './FriendsAircraftLanding';
import { FriendsBirds, type BirdsSnapshot } from './FriendsBirds';
import { FriendsStones, type StonesSnapshot } from './FriendsStones';
import { FriendsConfetti, type FriendsConfettiSnapshot } from './FriendsConfetti';
import { FriendsFishing, type FishingSnapshot } from './FriendsFishing';
import { FriendsRowboat, OPPOSITE_ROWBOAT_ID, type RowingSnapshot, type RowboatSave } from './FriendsRowboat';
import { FriendsRetreats } from './FriendsRetreats';
import type { FriendsEnvironmentSnapshot } from '../world/FriendsEnvironmentPreview';
import type { RetreatState, RetreatSave } from '../world/FriendsRetreatSites';
import { scenicCargoWagon, SCENIC_TAIL_DISTANCE, type ScenicWagonKind } from '../world/FriendsTrainLayout';
import { scenicRailway } from '../world/FriendsScenicRailway';
import { interactCampfireSeat, updateCampfireSeats } from './FriendsCampfireSeats';
import { FriendsCampfireSimulation, type CampfireSnapshot } from './FriendsCampfireSimulation';
import { sampleRailAlignment } from '../world/FriendsRailAlignment';
import { FriendsScenicService, type ScenicServiceSave, type ScenicServiceSnapshot, type ScenicSeat } from './FriendsScenicService';
import { vehicleWorldPoint, vehicleLocalPoint, vehiclePlaneHeight } from './FriendsVehiclePose';
import { CAVE_TREASURES, CAVE_REWARD_GOLD, nearbyCaveTreasure } from '../world/FriendsCave';
import { isPlayerRail, playerRailRoute, samplePlayerRail, nearestRailDistance, type PlayerRailRoute } from '../world/FriendsPlayerRail';
import { FRIENDS_AIRFIELD_HEIGHT, type FriendsTerrain } from '../world/FriendsTerrain';
import type { FrontierSnapshot } from './FriendsFrontier';
import { friendsBuildFloor, resolveFriendsBuildCollisions, raycastFriendsBuild, worldBox, friendsShapeBoxes, type FriendsBuildPiece, type FriendsBuildingSnapshot } from './FriendsBuilding';
import type { FriendsProjectSnapshot } from './FriendsProjects';
import { getNearbyWorldObstacles, resolveWorldCollisions } from '../world/WorldLayout';
import { FRIENDS_AIRPAD, FRIENDS_PLACES, FRIENDS_SIGNALS, insideFriendsCombat } from '../world/FriendsRegion';
import type { MultiplayerInputFrame } from './protocol';
import { FriendsHauling, type HaulingSave, type HaulingSnapshot } from './FriendsHauling';
import { FRIENDS_OPPOSITE_BOAT } from '../world/FriendsFishingDock';

export type FriendsVehicle = { id: string; kind: 'train' | 'aircraft' | 'rowboat' | 'fishingBoat'; moored?:boolean; rudder?:number; speed?:number; rowing?:RowingSnapshot; x: number; y: number; z: number; angle: number; length: number; width: number; pilotId?: string; closed?: boolean; pitch?: number; groundZ?: number; scenic?:boolean; wagonKind?:ScenicWagonKind; routeDistance?:number };
export type FriendsProgress = { version: 1; discovered: string[]; signals: string[]; salvageCleared: boolean; restored: boolean; openedTreasures?: string[]; caveGold?: number };
export type FriendsTransportSave = { fishingBoat?:FishingBoatSave; rowboat?:RowboatSave; retreats?:RetreatSave; campfireFuelSeconds?:number; campfireSiteFuelSeconds?:Record<string,number>; scenicRailway?:ScenicServiceSave | boolean; hauling?: HaulingSave; trainDistance: number; trainStoppedMs: number; lastStop: number; held: boolean; aircraft: FriendsVehicle; railTrain?: { anchor: number; distance: number; direction: 1 | -1; held: boolean } };
export type FriendsSnapshot = { dynamite?: import('./FriendsDynamite').DynamiteSnapshot; birds?:BirdsSnapshot; stones?:StonesSnapshot; confetti?:FriendsConfettiSnapshot; fishing?:FishingSnapshot; environment?:FriendsEnvironmentSnapshot; retreats?:RetreatState; campfire?:CampfireSnapshot; trainHorn?: { serial: number; atMs: number; vehicleId: string }; scenicRailway?:ScenicServiceSnapshot; hauling?: HaulingSnapshot; transport?: FriendsTransportSave; frontier?: FrontierSnapshot; building?: FriendsBuildingSnapshot; projects?: FriendsProjectSnapshot; vehicles: FriendsVehicle[]; trainDistance: number; trainStoppedMs: number; progress: FriendsProgress; salvageState: 'idle' | 'active' | 'cleared'; notice: string; noticeUntilMs: number };
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
    openedTreasures: Object.keys(CAVE_REWARD_GOLD).filter(id=>Array.isArray(p.openedTreasures)&&p.openedTreasures.includes(id)),
    // Derive the wallet from the fixed rewards so malformed saves cannot mint gold.
    caveGold: Object.entries(CAVE_REWARD_GOLD).reduce((sum,[id,gold])=>sum+(Array.isArray(p.openedTreasures)&&p.openedTreasures.includes(id)?gold:0),0),
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
export function friendsFishingBoatInteraction(vehicles:readonly FriendsVehicle[],p:{id:string;x:number;y:number;z:number;friendsSeat?:unknown;friendsDevFlight?:boolean}){return vehicles.some(v=>v.kind==='fishingBoat'&&fishingBoatInteraction(v,p));}
export function friendsRowboatInteraction(vehicles:readonly FriendsVehicle[],p:{x:number;y:number;z:number}){
  return vehicles.some(v=>v.kind==='rowboat'&&Math.abs(p.z-v.z)<90&&Math.hypot(p.x-v.x,p.y-v.y)<140);
}
export function friendsVehicleFloor(vehicles: readonly FriendsVehicle[], x: number, y: number, z: number) {
  let floor: number | undefined;
  for (const v of vehicles) {
    if(v.kind==='fishingBoat'){
      const deck=vehiclePlaneHeight(v,x,y);
      if(fishingBoatDeckContains(v,{x,y})&&z>=deck-18)floor=Math.max(floor??-Infinity,deck);
      continue;
    }
    // Rowboat landings sit on the gunwale plane. The authored hull is deep,
    // so using its inner bottom makes small characters look buried in it.
    const deck = vehiclePlaneHeight(v,x,y,v.kind==='rowboat'?10:0);
    const canStepAboard = !v.closed && z >= deck - 18;
    // The rowboat is an open, narrow hull. Give a player's foot collision
    // radius a little overlap at the gunwale so edge landings don't slip
    // between samples and fall into the water.
    const boardingMargin = v.kind === 'rowboat' ? -18 : 0;
    if (!vehicleContains(v, x, y, boardingMargin) || (z < deck - 1 && !canStepAboard)) continue;
    if (!v.closed) floor = Math.max(floor ?? -Infinity, deck);
    const local = vehicleLocal(v, x, y);
    const roof = vehiclePlaneHeight(v,x,y,v.kind === 'train' ? 115 : local.x < 67 ? 109 : 106.5);
    if (v.kind!=='rowboat' && !scenicCargoWagon(v) && z >= roof - 1 && (v.kind === 'train' || local.x > -123)) floor = Math.max(floor ?? 0, roof);
  }
  for (const link of trainGangways(vehicles)) if (z >= gangwayHeight(link,x,y) - 18 && pointOnGangway(link, x, y)) floor = Math.max(floor ?? -Infinity, gangwayHeight(link,x,y));
  return floor;
}
export type TrainGangway = { from: FriendsVehicle; to: FriendsVehicle; ax: number; ay: number; az:number; bx: number; by: number; bz:number; z: number; width: number };
export function trainGangways(vehicles: readonly FriendsVehicle[]): TrainGangway[] {
  const links:TrainGangway[]=[];
  for(const scenic of [false,true]) {
    const cars=vehicles.filter(v=>v.kind==='train'&&!v.closed&&Boolean(v.scenic)===scenic).sort((a,b)=>a.id.localeCompare(b.id, undefined, {numeric:true}));
    for(let i=1;i<cars.length;i++) {
      const front=cars[i-1],rear=cars[i],a=vehicleWorldPoint(front,{x:-front.length/2+12,y:0,z:0}),b=vehicleWorldPoint(rear,{x:rear.length/2-12,y:0,z:0});
      links.push({from:front,to:rear,ax:a.x,ay:a.y,az:a.z,bx:b.x,by:b.y,bz:b.z,z:(a.z+b.z)/2,width:Math.min(front.width,rear.width)+8});
    }
  }
  return links;
}
export function gangwayHeight(link:TrainGangway,x:number,y:number){
  const dx=link.bx-link.ax,dy=link.by-link.ay,t=Math.max(0,Math.min(1,((x-link.ax)*dx+(y-link.ay)*dy)/(dx*dx+dy*dy||1)));
  return link.az+(link.bz-link.az)*t;
}
export function pointOnGangway(link: TrainGangway, x: number, y: number) {
  const dx = link.bx - link.ax, dy = link.by - link.ay, lengthSq = dx * dx + dy * dy;
  const t = lengthSq > .001 ? ((x - link.ax) * dx + (y - link.ay) * dy) / lengthSq : 0;
  return t >= -.000001 && t <= 1.000001 && Math.hypot(x - link.ax - dx * t, y - link.ay - dy * t) <= link.width / 2 + .000001;
}
export function carryOnVehicle(actor: { x: number; y: number; z: number }, before: FriendsVehicle, after: FriendsVehicle) {
  const floor = friendsVehicleFloor([before], actor.x, actor.y, actor.z);
  if (floor === undefined || Math.abs(actor.z - floor) > 1) return false;
  Object.assign(actor,vehicleWorldPoint(after,vehicleLocalPoint(before,actor)));
  return true;
}
/** Solid locomotive hull; open passenger decks deliberately have no invisible
 * perimeter wall. Resolve in vehicle coordinates so turns keep the same hull. */
export function resolveFriendsVehicleCollisions(vehicles: readonly FriendsVehicle[], position: { x: number; y: number }, z: number, radius: number) {
  let collided = false;
  for (const v of vehicles) {
    if(v.kind==='fishingBoat'){
      const deck=vehiclePlaneHeight(v,position.x,position.y),local=vehicleLocal(v,position.x,position.y);
      for(const {x:cx,y:cy,hx,hy,h:height} of FISHING_BOAT_COLLIDERS){
        if(z>=deck+height||z+50<=deck)continue;
        const dx=local.x-cx,dy=local.y-cy,ex=hx+radius,ey=hy+radius;
        if(Math.abs(dx)>=ex||Math.abs(dy)>=ey)continue;
        if(ex-Math.abs(dx)<ey-Math.abs(dy))local.x=cx+(dx<0?-ex:ex);else local.y=cy+(dy<0?-ey:ey);
        const c=Math.cos(v.angle),s=Math.sin(v.angle);position.x=v.x+local.x*c-local.y*s;position.y=v.y+local.x*s+local.y*c;collided=true;
      }
      continue;
    }
    if(v.kind==='rowboat'){
      if(z>=v.z-15||z+50<v.z-24)continue;
      const local=vehicleLocal(v,position.x,position.y),ex=v.length*.46+radius,ey=v.width*.43+radius;
      const d=Math.hypot(local.x/ex,local.y/ey);if(d>=1)continue;
      const scale=1/Math.max(.0001,d),c=Math.cos(v.angle),s=Math.sin(v.angle);
      const u=d<.0001?0:local.x*scale,w=d<.0001?ey:local.y*scale;
      position.x=v.x+u*c-w*s;position.y=v.y+u*s+w*c;collided=true;continue;
    }
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
    if(v.kind==='fishingBoat'){
      const local=vehicleLocal(v,x,y),roof=vehiclePlaneHeight(v,x,y,105);
      if(local.x>-8&&local.x<128&&Math.abs(local.y)<48&&z<roof)ceiling=Math.min(ceiling??Infinity,roof);
      continue;
    }
    if (v.kind==='rowboat' || v.closed || scenicCargoWagon(v) || !vehicleContains(v, x, y, 2) || z < vehiclePlaneHeight(v,x,y) - 1) continue;
    const local = vehicleLocal(v, x, y);
    if (v.kind === 'aircraft' && local.x < -123) continue;
    const underside = vehiclePlaneHeight(v,x,y,v.kind === 'train' ? 109 : local.x < 67 ? 101 : 99.5);
    if (z < underside) ceiling = Math.min(ceiling ?? Infinity, underside);
  }
  return ceiling;
}

/** Shared host/HUD reach test includes solid fixtures and player construction. */
export function nearbyFriendsCaveTreasure(player:DescentPoint,opened:readonly string[]=[],terrain?:FriendsTerrain,pieces:readonly FriendsBuildPiece[]=[]){
  return nearbyCaveTreasure(player,opened,terrain?(x,y,z)=>!terrain.material(Math.floor(x/32),Math.floor(y/32),Math.floor(z/32)):undefined,
    (ray,distance)=>Boolean(raycastCaveProps(ray,distance)||raycastFriendsBuild(pieces,ray,distance)));
}

type Actor = { id: string; x: number; y: number; z: number; lifeState: string; friendsDevFlight?: boolean; friendsSeat?:ScenicSeat; verticalVelocity?:number; crouching?:boolean; platformVelocityX?: number; platformVelocityY?: number; platformVelocityZ?: number };

export class FriendsExpedition {
  readonly birds=new FriendsBirds();
  readonly stones=new FriendsStones();
  readonly confetti=new FriendsConfetti();
  readonly fishing=new FriendsFishing();
  readonly fishingBoat:FriendsFishingBoat;
  readonly rowboat:FriendsRowboat;
  readonly oppositeRowboat:FriendsRowboat;
  readonly campfire:FriendsCampfireSimulation;
  readonly retreats:FriendsRetreats;
  private trainHorn?: FriendsSnapshot['trainHorn'];
  private hornWorldTimeMs = 0;
  soundTrainHorn(actor: { x: number; y: number; z: number }, atMs: number): string | undefined {
    if (this.trainHorn && atMs - this.trainHorn.atMs < 8000) return 'Let the horn settle before sounding it again.';
    const cars = this.vehicles().filter(v => v.kind === 'train');
    const nearest = cars.filter(v => Math.hypot(actor.x-v.x,actor.y-v.y,actor.z-v.z) < 400).sort((a,b) => Math.hypot(actor.x-a.x,actor.y-a.y,actor.z-a.z) - Math.hypot(actor.x-b.x,actor.y-b.y,actor.z-b.z))[0];
    const engine = nearest && cars.find(v => v.closed && Boolean(v.scenic) === Boolean(nearest.scenic));
    if (!engine) return 'Board or stand beside a train to sound its horn.';
    this.trainHorn = { serial: (this.trainHorn?.serial ?? 0) + 1, atMs, vehicleId: engine.id };
  }
  readonly hauling: FriendsHauling;
  readonly scenic?:FriendsScenicService;
  private actors:readonly Actor[]=[];
  private obstructionStamp='';
  private obstructions=new Map<string,{x:number;y:number;z:number;w:number;d:number;h:number}[]>();
  private prepareObstructions(pieces:readonly FriendsBuildPiece[],terrain?:FriendsTerrain){
    const stamp=`${this.railRevision}:${terrain?.revision}:${pieces.length}`;if(stamp===this.obstructionStamp)return;this.obstructionStamp=stamp;this.obstructions.clear();
    const add=(b:{x:number;y:number;z:number;w:number;d:number;h:number})=>{
      for(let x=Math.floor((b.x-b.w/2)/512);x<=Math.floor((b.x+b.w/2)/512);x++)for(let y=Math.floor((b.y-b.d/2)/512);y<=Math.floor((b.y+b.d/2)/512);y++){
        const key=`${x},${y}`,list=this.obstructions.get(key)||[];list.push(b);this.obstructions.set(key,list);
      }
    };
    for(const piece of pieces)if(!piece.attachment)for(const box of friendsShapeBoxes(piece.shape))add(worldBox(piece,box));
    for(const [x,y,z,m]of terrain?.snapshot().edits||[])if(m)add({x:(x+.5)*32,y:(y+.5)*32,z:z*32,w:32,d:32,h:32});
  }
  private scenicBlocked(distance:number){
    if(!this.obstructions.size)return false;
    const horizon=Math.max(512,(this.scenic?.brakingDistance()||0)+768),route=scenicRailway();
    for(let d=-SCENIC_TAIL_DISTANCE-128;d<=horizon;d+=64){
      const p=sampleRailAlignment(route,distance+d);
      for(let x=Math.floor((p.x-96)/512);x<=Math.floor((p.x+96)/512);x++)for(let y=Math.floor((p.y-96)/512);y<=Math.floor((p.y+96)/512);y++)for(const b of this.obstructions.get(`${x},${y}`)||[]){
        const nx=Math.max(b.x-b.w/2,Math.min(b.x+b.w/2,p.x)),ny=Math.max(b.y-b.d/2,Math.min(b.y+b.d/2,p.y));
        if(Math.hypot(p.x-nx,p.y-ny)<88&&b.z<p.z+170&&b.z+b.h>p.z-16)return true;
      }
    }
    return false;
  }
  readonly progress: FriendsProgress;
  private trainDistance = 0;
  private route?: PlayerRailRoute;
  private railTrain?: NonNullable<FriendsTransportSave['railTrain']>;
  private railRevision = -1;
  private trainStoppedMs = 0;
  private lastStop = 0;
  private held = true;
  private readonly aircraftLanding = new FriendsAircraftLanding();
  private aircraft: FriendsVehicle = { id: 'sunskiff', kind: 'aircraft', ...FRIENDS_AIRPAD, z: 14, angle: 0, length: 280, width: 160 };
  private salvageState: FriendsSnapshot['salvageState'];
  private notice = 'Sunline Grand Traverse: walk south from arrival to the level Sunline Commons platform. Board the sightseeing train and F to sit. B builds your own railway; M opens the atlas.';
  private noticeUntilMs = 18000;
  constructor(progress?: FriendsProgress, transport?: FriendsTransportSave, private terrain?: FriendsTerrain) {
    // Shared boats always start moored at their docks when a world is loaded.
    this.fishingBoat=new FriendsFishingBoat(terrain);
    this.rowboat=new FriendsRowboat(undefined,terrain);
    this.oppositeRowboat=new FriendsRowboat(undefined,terrain,OPPOSITE_ROWBOAT_ID,FRIENDS_OPPOSITE_BOAT);
    this.campfire=new FriendsCampfireSimulation(transport?.campfireFuelSeconds,transport?.campfireSiteFuelSeconds);
    this.retreats=new FriendsRetreats(transport?.retreats);
    this.campfire.setActiveSites(this.retreats.state.active);
    this.hauling = new FriendsHauling(transport?.hauling, undefined, true);
    this.progress = normalizeFriendsProgress(progress); this.salvageState = 'idle';
    const saved=transport?.railTrain;
    if(saved && Number.isSafeInteger(saved.anchor) && saved.anchor>0 && Number.isFinite(saved.distance) && saved.distance>=0 && (saved.direction===1 || saved.direction===-1)) { this.railTrain={...saved}; this.held=saved.held===true; this.trainDistance=saved.distance; }
    this.scenic=terrain&&transport?.scenicRailway!==false?new FriendsScenicService():undefined;
    this.resetAircraft(terrain);
  }
  resetAircraft(terrain?: FriendsTerrain, players: readonly Actor[] = []) {
    this.hauling.resetAircraftWinch();
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
  releasePlayer(id:string) { this.fishingBoat.release(id); this.rowboat.release(id);this.oppositeRowboat.release(id); if(this.aircraft.pilotId===id)this.aircraft.pilotId=undefined;this.hauling.detach(id); }
  removeTrain(players: readonly Actor[]) {
    if(!this.held)return 'Hold the train before dismantling it.';
    if(this.hauling.hasSecuredTrainCargo())return 'Unload the salvage core before dismantling the train.';
    if(players.some(p=>p.lifeState==='alive' && friendsVehicleFloor(this.vehicles().filter(v=>v.kind==='train'&&!v.scenic),p.x,p.y,p.z)!==undefined))return 'Everyone must step off the train before dismantling it.';
    this.railTrain=undefined;this.route=undefined;this.trainDistance=0;
  }
  private carCount() {return this.route ? Math.min(3,Math.max(0,Math.floor((this.route.length-(this.route.closed?180:256))/195))) : 0;}
  private clampTrainDistance(d:number) { if(!this.route)return 0;return this.route.closed ? (d%this.route.length+this.route.length)%this.route.length : Math.max(90+this.carCount()*195,Math.min(this.route.length-90,d)); }
  vehicles(): FriendsVehicle[] {
    if(!this.route || !this.railTrain)return [{...this.aircraft},...(this.scenic?.vehicles()||[]),this.rowboat.vehicle(),this.oppositeRowboat.vehicle(),this.fishingBoat.vehicle()];
    const train=(id:string,distance:number,closed=false):FriendsVehicle=>{const p=samplePlayerRail(this.route!,distance);return {id,kind:'train',...p,z:p.z+14,length:180,width:112,closed};};
    return [...Array.from({length:this.carCount()},(_,i)=>train(`sunline-${i}`,this.trainDistance-(i+1)*195)),{...this.aircraft},train('sunline-engine',this.trainDistance,true),...(this.scenic?.vehicles()||[]),this.rowboat.vehicle(),this.oppositeRowboat.vehicle(),this.fishingBoat.vehicle()];
  }
  update(dt: number, elapsed: number, players: readonly Actor[], inputs: ReadonlyMap<string, MultiplayerInputFrame>, pieces: readonly FriendsBuildPiece[] = [], terrain?: FriendsTerrain, allowFlight?:(before:FriendsVehicle,after:FriendsVehicle)=>boolean) {
    this.hornWorldTimeMs = elapsed;
    this.confetti.update(elapsed, players, inputs);
    const before=this.vehicles();
    this.actors=players;
    this.fishingBoat.update(dt,elapsed,players,inputs,terrain,pieces);
    this.rowboat.update(dt,elapsed,players,inputs,terrain,pieces);
    this.oppositeRowboat.update(dt,elapsed,players,inputs,terrain,pieces);
    updateCampfireSeats(players,new Set([...inputs].filter(([,i])=>i.jumpPressed).map(([id])=>id)));
    this.retreats.update(players,new Set([...inputs].filter(([,i])=>i.jumpPressed).map(([id])=>id)),terrain);
    this.campfire.setActiveSites(this.retreats.state.active);
    this.campfire.update(dt,players,inputs,elapsed);
    this.prepareObstructions(pieces,terrain);
    this.scenic?.update(dt,players,new Set([...inputs].filter(([,i])=>i.jumpPressed).map(([id])=>id)),distance=>this.scenicBlocked(distance));
    if(this.route && this.railTrain && !this.held) {
      const travel=TRAIN_SPEED*dt/1000,lo=90+this.carCount()*195,hi=this.route.length-90;
      if(this.route.closed)this.trainDistance=this.clampTrainDistance(this.trainDistance+travel);
      else {this.trainDistance+=travel*this.railTrain.direction; if(this.trainDistance>=hi){this.trainDistance=hi;this.railTrain.direction=-1;} else if(this.trainDistance<=lo){this.trainDistance=lo;this.railTrain.direction=1;} }
    }
    const pilot = players.find(p => p.id === this.aircraft.pilotId && p.lifeState === 'alive'
      && !(inputs.get(p.id)?.friendsDevFlight ?? p.friendsDevFlight));
    if (!pilot) this.aircraft.pilotId = undefined;
    const input = pilot && inputs.get(pilot.id);
    if (input) {
      const previousAircraft={...this.aircraft};
      const angle = input.aimAngle / 65535 * Math.PI * 2;
      const turn = Math.atan2(Math.sin(angle - this.aircraft.angle), Math.cos(angle - this.aircraft.angle));
      this.aircraft.angle += Math.max(-dt * .0012, Math.min(dt * .0012, turn));
      const forward = Number(Boolean(input.movement & 1)) - Number(Boolean(input.movement & 2));
      const strafe = Number(Boolean(input.movement & 8)) - Number(Boolean(input.movement & 4));
      const magnitude = Math.max(1, Math.hypot(forward, strafe)), speed = input.sprinting ? 650 : 420;
      const heading = this.aircraft.angle;
      const dx = (Math.cos(heading) * forward - Math.sin(heading) * strafe) / magnitude * speed * dt / 1000;
      const dy = (Math.sin(heading) * forward + Math.cos(heading) * strafe) / magnitude * speed * dt / 1000;
      const position = { x: this.aircraft.x + dx, y: this.aircraft.y + dy };
      if (this.salvageState === 'active' && insideFriendsCombat(position.x, position.y, this.aircraft.z - 14)) { position.x = this.aircraft.x; position.y = this.aircraft.y; }
      terrain?.collide(position, this.aircraft.z - 14 + .05, 175, 125, 0);
      resolveWorldCollisions(position, 175, false, 'friends_frontier', this.aircraft.z - 14 + .05);
      resolveFriendsBuildCollisions(pieces, position, this.aircraft.z - 14 + .05, 175, 125, 0);
      // Collision resolution may push a wide hull hundreds of units out of a
      // terrain corner. Block that move instead of ejecting the craft.
      if (Math.hypot(position.x - previousAircraft.x - dx, position.y - previousAircraft.y - dy) > .1) { position.x = previousAircraft.x; position.y = previousAircraft.y; }
      this.aircraft.x = position.x; this.aircraft.y = position.y;
      let landingFloor = this.aircraftLanding.floor(terrain, this.aircraft.x, this.aircraft.y, this.aircraft.z - 14) + 14;
      for (const o of getNearbyWorldObstacles(this.aircraft.x, this.aircraft.y, 175, 'friends_frontier')) {
        const nearX = Math.max(o.x, Math.min(o.x + o.width, this.aircraft.x)), nearY = Math.max(o.y, Math.min(o.y + o.height, this.aircraft.y));
        // Only descend onto a roof already below the hull. A corner collision
        // beside a tall tower must never teleport the aircraft onto its top.
        if (o.elevation <= this.aircraft.z - 14 + .01 && Math.hypot(this.aircraft.x - nearX, this.aircraft.y - nearY) < 175 - .01) landingFloor = Math.max(landingFloor, o.elevation + 14);
      }
      for (const p of pieces) for (const local of friendsShapeBoxes(p.shape)) { const b = worldBox(p, local), top = b.z + b.h; const nx = Math.max(b.x - b.w / 2, Math.min(b.x + b.w / 2, this.aircraft.x)), ny = Math.max(b.y - b.d / 2, Math.min(b.y + b.d / 2, this.aircraft.y)); if (top <= this.aircraft.z - 14 + .01 && Math.hypot(this.aircraft.x - nx, this.aircraft.y - ny) < 175 - .01) landingFloor = Math.max(landingFloor, top + 14); }
      if (this.salvageState === 'active' && insideFriendsCombat(this.aircraft.x, this.aircraft.y, 0)) landingFloor = Math.max(landingFloor, 330);
      this.aircraft.z = Math.max(landingFloor, Math.min(FRIENDS_FLIGHT_CEILING, this.aircraft.z + (input.jetHeld ? 300 : input.sliding ? -aircraftDescentSpeed(this.aircraft.z - landingFloor) : 0) * dt / 1000));
      this.aircraft.groundZ = landingFloor - 14;
      if(allowFlight&&!allowFlight(previousAircraft,this.aircraft))Object.assign(this.aircraft,previousAircraft);
    }
    const after = this.vehicles();
    for (const p of players) {
      if (after.some(v=>v.pilotId===p.id) || this.hauling.playerCarry.isCarried(p.id) || p.friendsSeat || p.lifeState !== 'alive' || (inputs.get(p.id)?.friendsDevFlight ?? p.friendsDevFlight)) continue;
      const oldPosition = { x: p.x, y: p.y, z: p.z };
      let carried = false;
      for (let i = 0; i < before.length; i++) {
        const next=after.find(v=>v.id===before[i].id);
        if (!next || !carryOnVehicle(p, before[i], next)) continue;
        carried = true; break;
      }
      if(!carried){const load=pieces.find(piece=>piece.attachment&&Math.abs((friendsBuildFloor([piece],p.x,p.y,p.z,0)??Infinity)-p.z)<=1),old=load&&before.find(v=>v.id===load.attachment!.vehicleId),next=old&&after.find(v=>v.id===old.id);if(old&&next){Object.assign(p,vehicleWorldPoint(next,vehicleLocalPoint(old,p)));carried=true;}}
      if (!carried) {
        const link = trainGangways(before).find(link => Math.abs(p.z - gangwayHeight(link,p.x,p.y)) <= 1 && pointOnGangway(link, p.x, p.y));
        if (link) {
          const index = before.findIndex(v => v.id === link.from.id), local = vehicleLocalPoint(before[index], p), next = after.find(v=>v.id===before[index].id)!;
          Object.assign(p,vehicleWorldPoint(next,local)); carried = true;
        }
      }
      if (carried) { const seconds = Math.max(.001, dt / 1000); p.platformVelocityX = (p.x - oldPosition.x) / seconds; p.platformVelocityY = (p.y - oldPosition.y) / seconds; p.platformVelocityZ = (p.z - oldPosition.z) / seconds; }

    }
    if (pilot) { const v = this.aircraft; pilot.x = v.x + Math.cos(v.angle) * 100; pilot.y = v.y + Math.sin(v.angle) * 100; pilot.z = v.z; }
  }
  interact(player: Actor, elapsed: number, pieces:readonly FriendsBuildPiece[]=[]): 'salvage' | 'signal' | 'pilot' | 'restore' | 'treasure' | 'caveLift' | 'seat' | undefined {
    if(player.lifeState!=='alive')return;
    if(this.fishingBoat.interact(player,this.actors)){this.say(this.fishingBoat.vehicle().pilotId===player.id?'Fishing boat · first-person helm · forward / reverse · left / right turns the wheel · F stops and releases controls.':'Helm released. You stay where you are. Walk through the open cabin door to fish from the deck.',elapsed);return 'pilot';}
    if(this.rowboat.interact(player,this.actors)||this.oppositeRowboat.interact(player,this.actors)){this.say('Reedwater skiff · row alone from the centre with both oars, or share the two seats and control your own side · click or tap forward to stroke · right-click or tap backward to reverse · F / Space to leave.',elapsed);return 'seat';}
    if(this.retreats.interact(player,this.actors,this.terrain))return 'seat';
    if(interactCampfireSeat(player,this.actors))return 'seat';
    if(this.scenic?.interact(player,this.actors))return 'seat';
    const v = this.aircraft;
    if (v.pilotId === player.id) { v.pilotId = undefined; player.x = v.x + Math.cos(v.angle) * 40; player.y = v.y + Math.sin(v.angle) * 40; this.say('Pilot controls released. The Sunskiff holds its position.', elapsed); return 'pilot'; }
    if (friendsCockpitInteraction([v], player)) { v.pilotId = player.id; this.say('Sunskiff: move to fly · jump to ascend · crouch to descend · interact to release controls.', elapsed); return 'pilot'; }
    const treasure=nearbyFriendsCaveTreasure(player,this.progress.openedTreasures,this.terrain,pieces);
    if(treasure){
      this.progress.openedTreasures=[...(this.progress.openedTreasures||[]),treasure.id];
      this.progress.caveGold=(this.progress.caveGold||0)+treasure.gold;
      this.say(`${treasure.name} recovered · ${treasure.description || 'Shared expedition reward'}.${treasure.gold?` +${treasure.gold.toLocaleString('en-US')} gold.`:''}`,elapsed);
      return 'treasure';
    }
    const lift=nearbyCaveLift(player,this.progress.openedTreasures);
    if(lift&&this.terrain){
      const d=lift.destination,landing=this.caveLanding(d,pieces);
      if(!landing){this.say('The lift landing is obstructed. Clear its stone platform first.',elapsed);return;}
      this.relocateCaveActor(player,landing);
      this.say(lift.label,elapsed);return 'caveLift';
    }
  }
  recoverCaveLava(player:Actor,elapsed:number,pieces:readonly FriendsBuildPiece[]=[]){
    const lava=caveLavaAt(player.x,player.y,player.z);
    if(!lava||!this.terrain||player.lifeState!=='alive')return false;
    let landing:DescentPoint|undefined;
    for(const [dx,dy]of [[0,0],[-64,0],[64,0],[0,-64],[0,64],[-96,-64],[96,-64],[0,-128]]){
      const candidate=this.caveLanding({...lava.safe,x:lava.safe.x+dx,y:lava.safe.y+dy},pieces);
      if(candidate&&!caveLavaAt(candidate.x,candidate.y,candidate.z)){landing=candidate;break;}
    }
    const local=Boolean(landing);
    // The campfire gathering apron is already protected from builds/mining.
    // Only use it when every nearby stone ledge has been obstructed.
    landing??=this.caveLanding(CAVE_RETURN.destination,pieces);
    if(!landing)return false;
    this.relocateCaveActor(player,landing);
    this.say(local?'Too hot! Back on the last stone ledge. Your expedition supplies are safe.':'The local ledges are blocked. Back at camp with your expedition supplies.',elapsed);return true;
  }
  private caveLanding(point:DescentPoint,pieces:readonly FriendsBuildPiece[]):DescentPoint|undefined {
    if(!this.terrain)return;
    const floor=this.terrain.floor(point.x,point.y,point.z+8,0);
    if(floor===undefined||Math.abs(floor-point.z)>16)return;
    const probe={x:point.x,y:point.y};
    if(this.terrain.collide(probe,floor,COOP_PLAYER_RADIUS,50,0)||resolveFriendsBuildCollisions(pieces,probe,floor,COOP_PLAYER_RADIUS,50,0))return;
    return {...point,z:floor};
  }
  private relocateCaveActor(player:Actor,landing:DescentPoint){
    Object.assign(player,landing,{verticalVelocity:0,fallPeakZ:undefined,velocityX:0,velocityY:0,platformVelocityX:0,platformVelocityY:0,platformVelocityZ:0,coyoteMs:0,jumpBufferMs:0,bufferedJumpSequence:undefined,slideMs:0,slideHeld:false,sliding:false,airborneMs:0,groundedMs:0,jetActive:false,jetIgnitedThisAirTime:false,jetLaunchFloor:landing.z,airActionConsumedSinceGrounded:false,swimming:false,swimSubmerged:false,friendsSoaring:undefined});
  }
  controlTrain(action: 'train_hold' | 'train_depart') { this.held = action === 'train_hold'; this.trainStoppedMs=this.held?1:0; }
  get salvageStatus() { return this.salvageState; }
  resetSalvage(elapsed: number) { if (this.salvageState === 'active') { this.salvageState = 'idle'; this.say('Rustwater has reset. The safe valley is yours; return when you want another try.', elapsed); } }
  finishSalvage(elapsed: number) { if (this.salvageState !== 'active') return false; this.salvageState = 'cleared'; this.progress.salvageCleared = true; this.say('Rustwater cleared. Everyone receives 600 credits. The wreck is yours to explore.', elapsed); return true; }
  private say(message: string, elapsed: number) { this.notice = message; this.noticeUntilMs = elapsed + 16000; }
  snapshot(): FriendsSnapshot { return { birds:this.birds.snapshot(), stones:this.stones.snapshot(), confetti:this.confetti.snapshot(), fishing:this.fishing.snapshot(), retreats:this.retreats.snapshot(), campfire:this.campfire.snapshot(), trainHorn: this.trainHorn && this.hornWorldTimeMs - this.trainHorn.atMs < 4000 ? { ...this.trainHorn } : undefined, scenicRailway:this.scenic?.snapshot(this.actors), hauling: this.hauling.snapshot(), transport: { fishingBoat:this.fishingBoat.save(), rowboat:this.rowboat.save(), retreats:this.retreats.save(), campfireFuelSeconds:this.campfire.fuelSeconds,campfireSiteFuelSeconds:this.campfire.siteFuelSave(), scenicRailway:Boolean(this.scenic), hauling: this.hauling.save(), trainDistance: this.trainDistance, trainStoppedMs: this.trainStoppedMs, lastStop: this.lastStop, held: this.held, aircraft: { ...this.aircraft, pilotId: undefined }, railTrain: this.railTrain ? {...this.railTrain,distance:this.trainDistance,held:this.held} : undefined }, vehicles: this.vehicles(), trainDistance: this.trainDistance, trainStoppedMs: this.trainStoppedMs, progress: normalizeFriendsProgress(this.progress), salvageState: this.salvageState, notice: this.notice, noticeUntilMs: this.noticeUntilMs }; }
}
