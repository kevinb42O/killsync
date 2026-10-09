import { boxOBB, overlapOBB } from './FriendsOrientedBox';
import { orientedBuildBox, resolveAssemblyPose, type CraneAttachment, type AssemblyFrame } from './FriendsAssemblyPose';
import { craneSocketPose, craneAssemblyError, craneTopologyError, isCranePart } from './FriendsCraneAssemblies';
import { scenicCargoWagon, SCENIC_WAGONS, SCENIC_CAR_LENGTH } from '../world/FriendsTrainLayout';
import { vehicleLocalPoint, vehicleWorldPoint, vehiclePlaneHeight } from './FriendsVehiclePose';
import type { FriendsVehicle } from './FriendsExpedition';
import { scenicTransitProtected } from '../world/FriendsRailInfrastructure';
import { FRIENDS_TERRAIN_SURFACES } from '../world/FriendsTerrainAppearance';
import { FriendsTerrain, FRONTIER_SIZE, TERRAIN_BOTTOM, FRIENDS_STEP_HEIGHT, VOXEL_SIZE, FRIENDS_SPAWN_PLATFORM, FRIENDS_HAULING_PLATFORMS } from '../world/FriendsTerrain';
import { FRIENDS_CAMPFIRE } from '../world/FriendsRegion';
import { getNearbyWorldObstacles } from '../world/WorldLayout';
import { FRIENDS_AIRPAD, FRIENDS_HUB } from '../world/FriendsRegion';
import { isPlayerRail, railSamples, railOverlapError, snapRailPose } from '../world/FriendsPlayerRail';

export const FRIENDS_BUILD_LIMIT = 1024;
export const FRIENDS_BUILD_REACH = 520;
export const FRIENDS_BUILD_HEIGHT = 1024;
export const FRIENDS_BUILD_SHAPES = ['block', 'half_block', 'floor_tile', 'voxel_ramp', 'voxel_stairs', 'cube', 'half', 'slab', 'ramp', 'long_ramp', 'stairs', 'wall', 'window', 'doorway', 'pillar', 'beam', 'railing', 'roof', 'glass', 'lamp', 'planter', 'bench', 'table', 'sign', 'survey_lens', 'gathering_beacon', 'workbench', 'furnace', 'storage', 'landing_pad', 'crane', 'crane_joint', 'crane_boom', 'crane_winch', 'crane_console', 'rail_straight', 'rail_curve'] as const;
export type FriendsBuildShape = typeof FRIENDS_BUILD_SHAPES[number];
export const FRIENDS_FINISHES = {
  stone: { name: 'Stone', color: FRIENDS_TERRAIN_SURFACES.stone.color, roughness: .95, metalness: 0 },
  grass: { name: 'Grass & soil', color: FRIENDS_TERRAIN_SURFACES.grass.color, roughness: .95, metalness: 0 },
  soil: { name: 'Soil', color: FRIENDS_TERRAIN_SURFACES.soil.color, roughness: .95, metalness: 0 },
  copper: { name: 'Copper ore', color: FRIENDS_TERRAIN_SURFACES.copper.color, roughness: .95, metalness: 0 },
  iron: { name: 'Iron ore', color: FRIENDS_TERRAIN_SURFACES.iron.color, roughness: .95, metalness: 0 },
  timber: { name: 'Warm timber', color: '#a5734f', roughness: .86, metalness: 0 },
  teal: { name: 'Teal alloy', color: '#498b88', roughness: .48, metalness: .42 },
  plaster: { name: 'Soft plaster', color: '#f0e8d3', roughness: .96, metalness: 0 },
  rose: { name: 'Terracotta', color: '#ca8672', roughness: .9, metalness: .04 },
} as const;
export type FriendsBuildFinish = keyof typeof FRIENDS_FINISHES;
export type BuildBox = { x: number; y: number; z: number; w: number; d: number; h: number };
export type FriendsBuildDefinition = { name: string; group: 'Shapes' | 'Architecture' | 'Garden & social' | 'Utilities' | 'Railway'; w: number; d: number; h: number; description: string };
export const FRIENDS_BUILD_CATALOG: Record<FriendsBuildShape, FriendsBuildDefinition> = {
  block: { name: 'Block', group: 'Shapes', w: VOXEL_SIZE, d: VOXEL_SIZE, h: VOXEL_SIZE, description: 'One terrain block. Fits the world grid exactly.' },
  half_block: { name: 'Half block', group: 'Shapes', w: VOXEL_SIZE, d: VOXEL_SIZE, h: VOXEL_SIZE / 2, description: 'Half-height block for finer shapes and ledges.' },
  floor_tile: { name: 'Floor tile', group: 'Shapes', w: VOXEL_SIZE, d: VOXEL_SIZE, h: 8, description: 'A thin, walkable floor on the terrain grid.' },
  voxel_ramp: { name: 'Ramp', group: 'Shapes', w: VOXEL_SIZE, d: VOXEL_SIZE, h: VOXEL_SIZE / 2, description: 'A gentle half-block incline. Link two to climb a full block.' },
  voxel_stairs: { name: 'Steps', group: 'Shapes', w: VOXEL_SIZE, d: VOXEL_SIZE, h: VOXEL_SIZE / 2, description: 'Eight small steps in one block footprint.' },
  rail_straight: { name: 'Straight track', group: 'Railway', w: 256, d: 112, h: 8, description: 'A 21m rail section. Aim near a matching end to snap. Build on level ground or a bridge.' },
  rail_curve: { name: 'Curved track', group: 'Railway', w: 256, d: 256, h: 8, description: 'A quarter turn. Rotate to align the ends, then connect your own railway.' },
  crane_joint: { name:'Slewing joint',group:'Utilities',w:80,d:80,h:128,description:'The powered pivot of your custom crane. Build on a tower or ledge, snap boom sections onto its top, then attach a freight winch. F opens combined arm and winch controls.' },
  crane_boom: { name:'Crane boom',group:'Utilities',w:96,d:24,h:24,description:'An 8m truss section. Aim at a joint or free boom end to snap. R turns the next section; extend your own arm up to 32m.' },
  crane_winch: { name:'Freight winch',group:'Utilities',w:32,d:40,h:32,description:'Snap to a crane arm end for a rotating lift, or mount alone over a drop. Its cable descends from beneath the housing. F operates the linked pivot and winch.' },
  crane_console: { name:'Crane console',group:'Utilities',w:32,d:24,h:40,description:'A remote operator station. Links to the nearest fixed pivot or winch within 20m when placed. F opens that crane’s controls and load camera.' },
  crane: { name: 'Freight crane', group: 'Utilities', w: 288, d: 80, h: 160, description: 'Mount on a high ledge; rotate the boom over the edge. A straight vertical rope lifts salvage solo. Stand beside the base and press F for connect, raise, lower, brake and release.' },
  workbench: { name: 'Field workbench', group: 'Utilities', w: 96, d: 64, h: 64, description: 'Craft and access shared storage anywhere you establish a workshop.' },
  furnace: { name: 'Ore furnace', group: 'Utilities', w: 64, d: 64, h: 96, description: 'Smelt copper and iron beside your mine.' },
  storage: { name: 'Supply chest', group: 'Utilities', w: 64, d: 48, h: 48, description: 'Deposit and withdraw shared construction materials.' },
  landing_pad: { name: 'Landing platform', group: 'Utilities', w: 256, d: 256, h: 8, description: 'A broad, solid aircraft landing surface for remote outposts.' },
  cube: { name: 'Large block (2×2)', group: 'Shapes', w: 64, d: 64, h: 64, description: 'The beginning of a house, a terrace or a tower.' },
  half: { name: 'Large half block', group: 'Shapes', w: 64, d: 64, h: 32, description: 'Low ledges and a finer silhouette.' },
  slab: { name: 'Floor slab', group: 'Shapes', w: 64, d: 64, h: 8, description: 'Floors, bridges and balconies.' },
  ramp: { name: 'Gentle ramp', group: 'Shapes', w: 64, d: 64, h: 32, description: 'Walk up a comfortable incline.' },
  long_ramp: { name: 'Long ramp', group: 'Shapes', w: 128, d: 64, h: 64, description: 'Connect one full floor to the next.' },
  stairs: { name: 'Stairs', group: 'Shapes', w: 64, d: 64, h: 32, description: 'Eight small, walkable steps.' },
  wall: { name: 'Wall', group: 'Architecture', w: 64, d: 8, h: 128, description: 'A room with space to breathe.' },
  window: { name: 'Window frame', group: 'Architecture', w: 64, d: 8, h: 128, description: 'An open view across your valley.' },
  doorway: { name: 'Doorway', group: 'Architecture', w: 128, d: 8, h: 128, description: 'An open, generous entrance.' },
  pillar: { name: 'Pillar', group: 'Architecture', w: 16, d: 16, h: 128, description: 'Supports for porches and pavilions.' },
  beam: { name: 'Beam', group: 'Architecture', w: 128, d: 16, h: 16, description: 'Pergolas, bridge frames and roof lines.' },
  railing: { name: 'Railing', group: 'Architecture', w: 64, d: 8, h: 48, description: 'A finished edge to your balcony.' },
  roof: { name: 'Roof slope', group: 'Architecture', w: 64, d: 64, h: 32, description: 'A pitched roof or another inclined surface.' },
  glass: { name: 'Glass panel', group: 'Architecture', w: 64, d: 8, h: 128, description: 'A mint-tinted conservatory.' },
  lamp: { name: 'Lantern', group: 'Garden & social', w: 16, d: 16, h: 64, description: 'Warm light without a power bill.' },
  planter: { name: 'Flower planter', group: 'Garden & social', w: 48, d: 48, h: 24, description: 'A little garden wherever you want one.' },
  bench: { name: 'Bench', group: 'Garden & social', w: 64, d: 24, h: 32, description: 'Give your terrace somewhere to gather.' },
  table: { name: 'Table', group: 'Garden & social', w: 64, d: 48, h: 32, description: 'Your station-side café starts here.' },
  sign: { name: 'Sunline sign', group: 'Garden & social', w: 64, d: 8, h: 64, description: 'A welcoming marker for your creation.' },
  survey_lens: { name: 'Survey lens', group: 'Utilities', w: 32, d: 32, h: 64, description: 'Mount high on your own tower to establish an observatory.' },
  gathering_beacon: { name: 'Gathering beacon', group: 'Utilities', w: 32, d: 32, h: 64, description: 'Mark a shared meeting place on the map.' },
};
export type FriendsBuildPose = { x: number; y: number; z: number; rotation: number; attachment?:{vehicleId:string;x:number;y:number;z:number}; vehicleFrame?:{angle:number;pitch:number}; assembly?:CraneAttachment; assemblyFrame?:AssemblyFrame; craneRootId?:number; craneAngle?:number };
export function resolveFriendsBuildPose<T extends FriendsBuildPose>(p:T,vehicles:readonly FriendsVehicle[]):T{
  const a=p.attachment,v=a&&vehicles.find(v=>v.id===a.vehicleId&&scenicCargoWagon(v));
  return v&&a?{...p,...vehicleWorldPoint(v,a),vehicleFrame:{angle:v.angle,pitch:v.pitch||0}}:p;
}
export function resolveFriendsBuildPieces(pieces:readonly FriendsBuildPiece[],vehicles:readonly FriendsVehicle[],angles:ReadonlyMap<number,number>=new Map()){if(!pieces.some(p=>p.assembly))return pieces.map(p=>resolveFriendsBuildPose(p,vehicles));const roots=new Map(pieces.filter(p=>p.shape==='crane_joint'&&!p.assembly&&!p.attachment).map(p=>[p.id,p]));return pieces.map(p=>resolveAssemblyPose(resolveFriendsBuildPose(p,vehicles),pieces,angles,roots));}
const pieceFrame=(p:FriendsBuildPose)=>({x:p.x,y:p.y,z:p.z,angle:(p.assemblyFrame??p.vehicleFrame)!.angle,pitch:(p.assemblyFrame??p.vehicleFrame)!.pitch});
const unframed=<T extends FriendsBuildPose>(p:T):T=>({...p,x:0,y:0,z:0,attachment:undefined,vehicleFrame:undefined,assembly:undefined,assemblyFrame:undefined});
export type FriendsBuildPiece = FriendsBuildPose & { id: number; shape: FriendsBuildShape; finish: FriendsBuildFinish; author: string; revision: number };
export type FriendsBuildingSnapshot = { revision: number; pieces: FriendsBuildPiece[]; guestsCanBuild: boolean };
export type FriendsBuildActor = { id: string; label?: string; x: number; y: number; z: number; lifeState: string; bodyWidth?: number; bodyDepth?: number; bodyHeight?: number };
/** Reserve the moving aircraft's hull as well as the fixed bay during edits. */
export function friendsVehicleBuildBodies(vehicles: readonly { kind: string; x: number; y: number; z: number; angle: number; length: number; width: number }[] = []): FriendsBuildActor[] {
  return vehicles.filter(v => v.kind === 'aircraft').map(v => ({ id: 'aircraft', x: v.x, y: v.y, z: v.z - 14, lifeState: 'alive', bodyWidth: Math.abs(Math.cos(v.angle)) * v.length + Math.abs(Math.sin(v.angle)) * v.width + 50, bodyDepth: Math.abs(Math.sin(v.angle)) * v.length + Math.abs(Math.cos(v.angle)) * v.width + 50, bodyHeight: 125 }));
}
export type FriendsBuildRequest = { requestId: number; action: 'place' | 'place_group' | 'remove' | 'paint' | 'move' | 'undo' | 'redo' | 'permissions'; shape?: FriendsBuildShape; finish?: FriendsBuildFinish; pose?: FriendsBuildPose; poses?: FriendsBuildPose[]; pieceId?: number; expectedRevision?: number; allowed?: boolean };
export type FriendsBuildResult = { playerId: string; requestId: number; ok: boolean; message: string; revision: number };
export const isFriendsShape = (v: unknown): v is FriendsBuildShape => typeof v === 'string' && (FRIENDS_BUILD_SHAPES as readonly string[]).includes(v);
export const isFriendsFinish = (v: unknown): v is FriendsBuildFinish => typeof v === 'string' && Object.hasOwn(FRIENDS_FINISHES, v);
const box = (x: number, y: number, z: number, w: number, d: number, h: number): BuildBox => ({ x, y, z, w, d, h });
/** Local shape boxes are consumed by both collision and visible geometry. */
export function friendsShapeBoxes(shape: FriendsBuildShape): BuildBox[] {
  const s = FRIENDS_BUILD_CATALOG[shape];
  switch (shape) {
    case 'rail_straight': return Array.from({ length: 8 }, (_, i) => box(-112+i*32, 0, 0, 12, 108, 8));
    case 'rail_curve': return railSamples({x:0,y:0,z:0,rotation:0,shape},32).map(p => box(p.x,p.y,0,12+Math.abs(Math.sin(p.angle))*96,12+Math.abs(Math.cos(p.angle))*96,8));
    case 'window': return [box(-28, 0, 0, 8, 8, 128), box(28, 0, 0, 8, 8, 128), box(0, 0, 0, 48, 8, 32), box(0, 0, 112, 48, 8, 16)];
    case 'doorway': return [box(-56, 0, 0, 16, 8, 128), box(56, 0, 0, 16, 8, 128), box(0, 0, 112, 96, 8, 16)];
    case 'stairs': case 'voxel_stairs': return Array.from({ length: 8 }, (_, i) => box(-s.w / 2 + s.w / 16 + i * s.w / 8, 0, 0, s.w / 8, s.d, (i + 1) * s.h / 8));
    case 'railing': return [box(-28, 0, 0, 8, 8, 48), box(28, 0, 0, 8, 8, 48), box(0, 0, 40, 48, 8, 8), box(0, 0, 16, 48, 8, 8)];
    case 'bench': return [box(-24, 0, 0, 8, 20, 16), box(24, 0, 0, 8, 20, 16), box(0, 0, 16, 64, 24, 8), box(0, 10, 24, 64, 4, 8)];
    case 'crane_joint': return [box(0,0,0,80,80,8),box(0,0,8,16,16,88),box(0,0,96,48,48,32)];
    case 'crane_boom': return [box(0,0,0,96,20,20)];
    case 'crane_winch': return [box(0,0,0,32,40,24),box(0,0,24,24,32,8)];
    case 'crane_console': return [box(0,0,0,28,24,8),box(0,0,8,12,12,20),box(0,0,28,32,24,12)];
    case 'crane': return [box(-64,0,0,80,80,8),box(-64,0,8,16,16,136),box(32,0,140,224,18,20),box(-64,-24,24,48,16,36)];
    case 'workbench': return [box(-38, -22, 0, 10, 10, 52), box(38, -22, 0, 10, 10, 52), box(-38, 22, 0, 10, 10, 52), box(38, 22, 0, 10, 10, 52), box(0, 0, 52, 96, 64, 12)];
    case 'furnace': return [box(0,0,0,64,64,64),box(18,18,64,22,22,32)];
    case 'table': return [box(-24, -16, 0, 8, 8, 24), box(24, -16, 0, 8, 8, 24), box(-24, 16, 0, 8, 8, 24), box(24, 16, 0, 8, 8, 24), box(0, 0, 24, 64, 48, 8)];
    case 'lamp': return [box(0, 0, 0, 8, 8, 48), box(0, 0, 48, 16, 16, 16)];
    case 'sign': return [box(0, 0, 0, 8, 8, 32), box(0, 0, 32, 64, 8, 32)];
    case 'survey_lens': case 'gathering_beacon': return [box(0, 0, 0, 24, 24, 8), box(0, 0, 8, 8, 8, 40), box(0, 0, 48, 32, 32, 16)];
    default: return [box(0, 0, 0, s.w, s.d, s.h)];
  }
}
export const isSlope = (shape: FriendsBuildShape) => shape === 'voxel_ramp' || shape === 'ramp' || shape === 'long_ramp' || shape === 'roof';
export const isVoxelBuildShape = (shape: FriendsBuildShape) => ['block', 'half_block', 'floor_tile', 'voxel_ramp', 'voxel_stairs'].includes(shape);
export function buildLocal(p: FriendsBuildPose, x: number, y: number) {
  const a = p.rotation * Math.PI / 2, c = Math.cos(a), s = Math.sin(a);
  return { x: (x - p.x) * c + (y - p.y) * s, y: -(x - p.x) * s + (y - p.y) * c };
}
export function worldBox(p: FriendsBuildPose, b: BuildBox): BuildBox {
  if(p.vehicleFrame||p.assemblyFrame){
    const b0=worldBox(unframed(p),b),points=[];
    for(const x of [-1,1])for(const y of [-1,1])for(const z of [0,1])points.push(vehicleWorldPoint(pieceFrame(p),{x:b0.x+x*b0.w/2,y:b0.y+y*b0.d/2,z:b0.z+z*b0.h}));
    const lo=(key:'x'|'y'|'z')=>Math.min(...points.map(p=>p[key])),hi=(key:'x'|'y'|'z')=>Math.max(...points.map(p=>p[key]));
    return box((lo('x')+hi('x'))/2,(lo('y')+hi('y'))/2,lo('z'),hi('x')-lo('x'),hi('y')-lo('y'),hi('z')-lo('z'));
  }
  const a = p.rotation * Math.PI / 2, c = Math.round(Math.cos(a)), s = Math.round(Math.sin(a));
  return box(p.x + b.x * c - b.y * s, p.y + b.x * s + b.y * c, p.z + b.z, p.rotation % 2 ? b.d : b.w, p.rotation % 2 ? b.w : b.d, b.h);
}
const contains = (b: BuildBox, x: number, y: number, padding = 0) => Math.abs(x - b.x) <= b.w / 2 + padding + .00001 && Math.abs(y - b.y) <= b.d / 2 + padding + .00001;
export function friendsBuildFloor(pieces: readonly FriendsBuildPiece[], x: number, y: number, z: number, step = FRIENDS_STEP_HEIGHT) {
  let floor: number | undefined;
  for (const p of pieces) {
    if(p.vehicleFrame||p.assemblyFrame){
      const frame=pieceFrame(p),q=vehicleLocalPoint(frame,{x,y,z});
      let top=friendsBuildFloor([unframed(p)],q.x,q.y,q.z,step);
      if(top!==undefined){const height=vehiclePlaneHeight(frame,x,y,top),at=vehicleLocalPoint(frame,{x,y,z:height});top=friendsBuildFloor([unframed(p)],at.x,at.y,at.z,0.01);if(top!==undefined&&height<=z+step+.00001)floor=Math.max(floor??-Infinity,height);}
      continue;
    }
    const q = buildLocal(p, x, y), def = FRIENDS_BUILD_CATALOG[p.shape];
    const padding = isPlayerRail(p.shape) ? 64 : 0;
    if (Math.abs(q.x) > def.w / 2 + padding + .00001 || Math.abs(q.y) > def.d / 2 + padding + .00001) continue;
    if (isSlope(p.shape)) {
      const top = p.z + (q.x / def.w + .5) * def.h;
      if (top <= z + step + .00001) floor = Math.max(floor ?? -Infinity, top);
    } else for (const b of friendsShapeBoxes(p.shape)) {
      const top = p.z + b.z + b.h;
      if (contains(b, q.x, q.y) && top <= z + step + .00001) floor = Math.max(floor ?? -Infinity, top);
    }
  }
  return floor;
}
const isWalkIncline=(shape:FriendsBuildShape)=>isSlope(shape)||shape==='stairs'||shape==='voxel_stairs';
/** Only a supported incline may remove the entrance face of its upper landing. */
export function friendsInclineConnects(pieces:readonly FriendsBuildPiece[],position:{x:number;y:number},z:number,x:number,y:number,top:number,step=FRIENDS_STEP_HEIGHT){
  return pieces.some(p=>{
    if(!isWalkIncline(p.shape))return false;
    const feet=friendsBuildFloor([p],position.x,position.y,z,FRIENDS_STEP_HEIGHT);
    if(feet===undefined||Math.abs(feet-z)>FRIENDS_STEP_HEIGHT+.00001)return false;
    const edge=friendsBuildFloor([p],x,y,top,0);
    return edge!==undefined&&top-edge>=-.00001&&top-edge<=step+.00001;
  });
}
/** Blend a permitted small landing lip across the capsule's approach to a crest.
 * Point-only floor samples otherwise miss the lip until the cylinder is already
 * blocked by it. Large steps and walls retain their ordinary collision. */
export function friendsWalkFloor(pieces:readonly FriendsBuildPiece[],x:number,y:number,z:number,radius:number,terrain?:FriendsTerrain,step=FRIENDS_STEP_HEIGHT){
  let floor=friendsBuildFloor(pieces,x,y,z,step);
  if(radius<=0)return floor;
  for(const p of pieces){
    if(!isWalkIncline(p.shape)||p.vehicleFrame||('assemblyFrame' in p&&p.assemblyFrame))continue;
    const q=buildLocal(p,x,y),def=FRIENDS_BUILD_CATALOG[p.shape],remaining=def.w/2-q.x;
    if(remaining<-.00001||remaining>radius||Math.abs(q.y)>def.d/2+.00001)continue;
    const feet=friendsBuildFloor([p],x,y,z,step);
    if(feet===undefined||Math.abs(feet-z)>step+.00001)continue;
    const a=p.rotation*Math.PI/2,c=Math.cos(a),s=Math.sin(a),edgeX=p.x+(def.w/2+.001)*c-q.y*s,edgeY=p.y+(def.w/2+.001)*s+q.y*c,crest=p.z+def.h;
    const surfaces=[friendsBuildFloor(pieces.filter(other=>!isWalkIncline(other.shape)),edgeX,edgeY,crest,step),terrain?.floor(edgeX,edgeY,crest,step)];
    for(const top of surfaces){
      if(top===undefined||top<crest-.00001||top>crest+step+.00001)continue;
      const height=feet+(top-crest)*(1-Math.max(0,remaining)/radius);
      if(height<=z+step+.00001)floor=Math.max(floor??-Infinity,height);
    }
  }
  return floor;
}
export function friendsBuildCeiling(pieces: readonly FriendsBuildPiece[], x: number, y: number, z: number) {
  let ceiling: number | undefined;
  for (const p of pieces) {
    if(p.vehicleFrame||p.assemblyFrame){const f=pieceFrame(p),q=vehicleLocalPoint(f,{x,y,z}),h=friendsBuildCeiling([unframed(p)],q.x,q.y,q.z);if(h!==undefined)ceiling=Math.min(ceiling??Infinity,vehiclePlaneHeight(f,x,y,h));continue;}
    const q = buildLocal(p, x, y);
    const def = FRIENDS_BUILD_CATALOG[p.shape];
    const padding = isPlayerRail(p.shape) ? 64 : 10;
    if (Math.abs(q.x) > def.w / 2 + padding || Math.abs(q.y) > def.d / 2 + padding) continue;
    for (const b of friendsShapeBoxes(p.shape)) if (contains(b, q.x, q.y, 10) && p.z + b.z > z + .1) ceiling = Math.min(ceiling ?? Infinity, p.z + b.z);
  }
  return ceiling;
}
export function resolveFriendsBuildCollisions(pieces: readonly FriendsBuildPiece[], position: { x: number; y: number }, z: number, radius: number, bodyHeight = 50, step = FRIENDS_STEP_HEIGHT) {
  let collided = false;
  for (const p of pieces) {
    if(p.vehicleFrame||p.assemblyFrame){const f=pieceFrame(p),q=vehicleLocalPoint(f,{...position,z});if(resolveFriendsBuildCollisions([unframed(p)],q,q.z,radius,bodyHeight,step)){const world=vehicleWorldPoint(f,q);position.x=world.x;position.y=world.y;collided=true;}continue;}
    const q = buildLocal(p, position.x, position.y), def = FRIENDS_BUILD_CATALOG[p.shape];
    const padding = radius + (isPlayerRail(p.shape) ? 64 : 0);
    if (Math.abs(q.x) >= def.w / 2 + padding || Math.abs(q.y) >= def.d / 2 + padding) continue;
    // Resolve stairs as an incline envelope: individual risers otherwise
    // catch the cylinder's leading edge several steps ahead of its feet.
    const incline = isSlope(p.shape) || (p.shape === 'stairs' || p.shape === 'voxel_stairs');
    const boxes = (p.shape === 'stairs' || p.shape === 'voxel_stairs') ? [box(0, 0, 0, def.w, def.d, def.h)] : friendsShapeBoxes(p.shape);
    for (const b of boxes) {
      let top = b.z + b.h;
      // Extend only the low approach plane by the body's contact radius.
      // Clamping it at zero makes consecutive ramps present a false wall
      // while the player's feet are still on the preceding incline.
      if (incline) top = Math.min(1, (q.x + radius * .25) / def.w + .5) * def.h;
      if (z >= p.z + top - step || z + bodyHeight <= p.z + b.z + .01) continue;
      const nx = Math.max(b.x - b.w / 2, Math.min(b.x + b.w / 2, q.x)), ny = Math.max(b.y - b.d / 2, Math.min(b.y + b.d / 2, q.y));
      const dx = q.x - nx, dy = q.y - ny, dist = Math.hypot(dx, dy);
      if (dist >= radius) continue;
      if(!incline&&dist>.00001){
        const a=p.rotation*Math.PI/2,c=Math.cos(a),s=Math.sin(a),contact={x:p.x+nx*c-ny*s,y:p.y+nx*s+ny*c};
        // A joined landing, including a walkable lip, has no entrance wall.
        // The cylinder may overlap that face while its feet follow the incline.
        const connected=friendsInclineConnects(pieces,position,z,contact.x,contact.y,p.z+top,step);
        if(connected)continue;
      }
      if (dist > .00001) { q.x += dx / dist * (radius - dist); q.y += dy / dist * (radius - dist); }
      else if (b.w / 2 + radius - Math.abs(q.x - b.x) < b.d / 2 + radius - Math.abs(q.y - b.y)) q.x = b.x + (q.x < b.x ? -1 : 1) * (b.w / 2 + radius);
      else q.y = b.y + (q.y < b.y ? -1 : 1) * (b.d / 2 + radius);
      collided = true;
    }
    const a = p.rotation * Math.PI / 2; position.x = p.x + q.x * Math.cos(a) - q.y * Math.sin(a); position.y = p.y + q.x * Math.sin(a) + q.y * Math.cos(a);
  }
  return collided;
}
export type FriendsBuildRay = { x: number; y: number; z: number; dx: number; dy: number; dz: number };
export type FriendsBuildHit = { piece: FriendsBuildPiece; distance: number; x: number; y: number; z: number; nx: number; ny: number; nz: number };
export function raycastFriendsBuild(pieces: readonly FriendsBuildPiece[], ray: FriendsBuildRay, maxDistance = FRIENDS_BUILD_REACH): FriendsBuildHit | undefined {
  let best: FriendsBuildHit | undefined;
  for (const p of pieces) {
    if(p.vehicleFrame||p.assemblyFrame){
      const f=pieceFrame(p),o=vehicleLocalPoint(f,ray),d=vehicleLocalPoint({...f,x:0,y:0,z:0},{x:ray.dx,y:ray.dy,z:ray.dz});
      const hit=raycastFriendsBuild([unframed(p)],{...o,dx:d.x,dy:d.y,dz:d.z},maxDistance);
      if(hit&&(!best||hit.distance<best.distance)){const point=vehicleWorldPoint(f,hit),normal=vehicleWorldPoint({...f,x:0,y:0,z:0},{x:hit.nx,y:hit.ny,z:hit.nz});best={...hit,...point,piece:p,nx:normal.x,ny:normal.y,nz:normal.z};}continue;
    }
    const origin = buildLocal(p, ray.x, ray.y), a = p.rotation * Math.PI / 2, c = Math.cos(a), s = Math.sin(a);
    const dirs = [ray.dx * c + ray.dy * s, -ray.dx * s + ray.dy * c, ray.dz], origins = [origin.x, origin.y, ray.z - p.z];
    for (const b of friendsShapeBoxes(p.shape)) {
      let enter = 0, leave = maxDistance, normal = [0, 0, 0], hit = true;
      const mins = [b.x - b.w / 2, b.y - b.d / 2, b.z], maxs = [b.x + b.w / 2, b.y + b.d / 2, b.z + b.h];
      // The ramp is a convex wedge: three slab axes plus its inclined plane.
      const planes = [
        { n: [1, 0, 0], d: maxs[0] }, { n: [-1, 0, 0], d: -mins[0] },
        { n: [0, 1, 0], d: maxs[1] }, { n: [0, -1, 0], d: -mins[1] },
        { n: [0, 0, -1], d: -mins[2] },
        isSlope(p.shape) ? { n: [-b.h / b.w, 0, 1], d: b.h / 2 } : { n: [0, 0, 1], d: maxs[2] },
      ];
      for (const plane of planes) {
        const dot = plane.n.reduce((sum, n, i) => sum + n * dirs[i], 0), offset = plane.d - plane.n.reduce((sum, n, i) => sum + n * origins[i], 0);
        if (Math.abs(dot) < .000001) { if (offset < 0) { hit = false; break; } continue; }
        const t = offset / dot;
        if (dot < 0 && t > enter) { enter = t; normal = plane.n; } else if (dot > 0) leave = Math.min(leave, t);
        if (enter > leave) { hit = false; break; }
      }
      if (!hit || enter <= .001 || enter > maxDistance || (best && enter >= best.distance)) continue;
      best = { piece: p, distance: enter, x: ray.x + ray.dx * enter, y: ray.y + ray.dy * enter, z: ray.z + ray.dz * enter, nx: normal[0] * c - normal[1] * s, ny: normal[0] * s + normal[1] * c, nz: normal[2] };
    }
  }
  return best;
}
export function getFriendsBuildPose(pieces: readonly FriendsBuildPiece[], ray: FriendsBuildRay, shape: FriendsBuildShape, rotation: number, terrain?: FriendsTerrain, vehicles:readonly FriendsVehicle[]=[]): FriendsBuildPose | undefined {
  const def = FRIENDS_BUILD_CATALOG[shape], r = ((Math.round(rotation) % 4) + 4) % 4;
  // Snapshot pieces already carry a live assembly frame; preserve it for socket previews.
  pieces=pieces.map(p=>resolveFriendsBuildPose(p,vehicles));
  const obstruction=raycastFriendsBuild(pieces.filter(p=>!p.attachment),ray)?.distance??Infinity,groundDistance=terrain?.raycast(ray,FRIENDS_BUILD_REACH)?.distance??Infinity;
  let cargoPose:FriendsBuildPose|undefined,nearest=Math.min(obstruction,groundDistance,FRIENDS_BUILD_REACH);
  for(const v of vehicles.filter(scenicCargoWagon)){
    const o=vehicleLocalPoint(v,ray),d=vehicleLocalPoint({...v,x:0,y:0,z:0},{x:ray.dx,y:ray.dy,z:ray.dz});
    const localPieces=pieces.filter(p=>p.attachment?.vehicleId===v.id).map(p=>({...p,...p.attachment!,attachment:undefined,vehicleFrame:undefined}));
    const hit=raycastFriendsBuild(localPieces,{...o,dx:d.x,dy:d.y,dz:d.z}),t=d.z<-.025?-o.z/d.z:Infinity;
    const deck=t>0&&t<FRIENDS_BUILD_REACH&&Math.abs(o.x+d.x*t)<v.length/2&&Math.abs(o.y+d.y*t)<v.width/2;
    const distance=hit?.distance??(deck?t:Infinity);if(distance>=nearest)continue;
    const local=hit?getFriendsBuildPose(localPieces,{...o,dx:d.x,dy:d.y,dz:d.z},shape,rotation):{x:Math.round((o.x+d.x*t)/4)*4,y:Math.round((o.y+d.y*t)/4)*4,z:0,rotation:r};
    if(local){nearest=distance;cargoPose={...vehicleWorldPoint(v,local),rotation:r,attachment:{vehicleId:v.id,x:local.x,y:local.y,z:local.z},vehicleFrame:{angle:v.angle,pitch:v.pitch||0}};}
  }
  if(cargoPose)return cargoPose;
  const socketHit=raycastFriendsBuild(pieces,ray);
  if(socketHit && isCranePart(shape)) {const pose=craneSocketPose(pieces,socketHit.piece,shape,r);if(pose)return pose;}
  const buildHit = raycastFriendsBuild(pieces, ray), groundHit = terrain?.raycast(ray, FRIENDS_BUILD_REACH);
  const hit = buildHit && (!groundHit || buildHit.distance < groundHit.distance) ? buildHit : groundHit, snap = (n: number) => Math.round(n / 4) * 4;
  if (hit) {
    const w = r % 2 ? def.d : def.w, d = r % 2 ? def.w : def.d;
    if (isPlayerRail(shape)) return snapRailPose(pieces, shape, {x:snap(hit.x),y:snap(hit.y),z:snap(hit.z),rotation:r});
    if (isVoxelBuildShape(shape)) {
      const centre = (n: number) => Math.floor(n / VOXEL_SIZE) * VOXEL_SIZE + VOXEL_SIZE / 2;
      const verticalGrid = shape === 'block' ? VOXEL_SIZE : 8;
      const z = hit.nz > .1 ? snap(hit.z) : hit.nz < -.1 ? snap(hit.z - def.h)
        : Math.floor(hit.z / verticalGrid) * verticalGrid;
      // A tiny face-normal bias selects the adjacent cell at an exact boundary.
      return { x: centre(hit.x + hit.nx * .01), y: centre(hit.y + hit.ny * .01), z, rotation: r };
    }
    if (hit.nz > .1) {const pose={x:snap(hit.x),y:snap(hit.y),z:snap(hit.z),rotation:r};if(shape==='crane_console'){const root=pieces.filter(p=>['crane_joint','crane','crane_winch'].includes(p.shape)&&!p.assembly&&!p.attachment).map(p=>({p,d:Math.hypot(p.x-pose.x,p.y-pose.y,p.z-pose.z)})).filter(p=>p.d<240).sort((a,b)=>a.d-b.d)[0]?.p;if(root)return {...pose,craneRootId:root.id};}return pose;}
    if (hit.nz < -.1) return { x: snap(hit.x), y: snap(hit.y), z: snap(hit.z - def.h), rotation: r };
    return { x: snap(hit.x + hit.nx * w / 2), y: snap(hit.y + hit.ny * d / 2), z: snap(hit.z - def.h / 2), rotation: r };
  }
  if (ray.dz >= -.025) return undefined;
  const t = -ray.z / ray.dz;
  if (isVoxelBuildShape(shape) && t > 0 && t <= FRIENDS_BUILD_REACH) return {
    x: Math.floor((ray.x + ray.dx * t) / VOXEL_SIZE) * VOXEL_SIZE + VOXEL_SIZE / 2,
    y: Math.floor((ray.y + ray.dy * t) / VOXEL_SIZE) * VOXEL_SIZE + VOXEL_SIZE / 2, z: 0, rotation: r,
  };
  return t > 0 && t <= FRIENDS_BUILD_REACH ? { x: Math.round((ray.x + ray.dx * t) / 32) * 32, y: Math.round((ray.y + ray.dy * t) / 32) * 32, z: 0, rotation: r } : undefined;
}
function overlaps(a: BuildBox, b: BuildBox, margin = .1) {
  return Math.abs(a.x - b.x) < (a.w + b.w) / 2 - margin && Math.abs(a.y - b.y) < (a.d + b.d) / 2 - margin && a.z < b.z + b.h - margin && b.z < a.z + a.h - margin;
}
export function friendsPlacementError(pieces: readonly FriendsBuildPiece[], shape: unknown, pose: FriendsBuildPose | undefined, actor?: FriendsBuildActor, bodies: readonly FriendsBuildActor[] = [], ignoringId?: number, restoring = false, terrain?: FriendsTerrain, vehicles:readonly FriendsVehicle[]=[]): string | undefined {
  if(pose?.craneRootId!==undefined&&shape!=='crane_console')return 'Only a crane console can link to a controller.';
  if(pose?.craneAngle!==undefined&&(!Number.isFinite(pose.craneAngle)||Math.abs(pose.craneAngle)>Math.PI*2))return 'Choose a valid pivot angle.';
  if(pose?.assembly){
    if(!isFriendsShape(shape))return 'Choose a valid crane part.';
    const error=craneAssemblyError(pieces,shape,pose,ignoringId);if(error)return error;
    const resolved=resolveAssemblyPose(pose,pieces,new Map(pieces.filter(p=>p.assemblyFrame&&p.assembly).map(p=>[p.assembly!.rootId,p.assemblyFrame!.angle-(pieces.find(q=>q.id===p.assembly!.rootId)?.rotation??0)*Math.PI/2])));
    const other=pieces.filter(p=>p.id!==ignoringId&&p.id!==pose.assembly!.parentId);
    // Socket topology provides support. Test authored geometry against the world
    // at its actual continuous orientation, including occupants.
    for(const localBox of friendsShapeBoxes(shape)){
      const b=worldBox(resolved,localBox),exact=boxOBB(orientedBuildBox({...resolved,id:ignoringId??-1,shape,finish:'teal',author:'',revision:0},localBox));
      if(b.z< TERRAIN_BOTTOM+32||b.z+b.h>6000)return 'Keep the arm inside the building height limit.';
      if(actor&&Math.hypot(resolved.x-actor.x,resolved.y-actor.y,resolved.z-actor.z)>FRIENDS_BUILD_REACH+64)return 'Move closer to that crane socket.';
      if(bodies.some(p=>p.lifeState==='alive'&&overlapOBB(exact,boxOBB(box(p.x,p.y,p.z,p.bodyWidth??38,p.bodyDepth??38,p.bodyHeight??50)),.1)))return 'A friend or load is in the way.';
      if(other.some(p=>friendsShapeBoxes(p.shape).some(q=>overlapOBB(exact,boxOBB(orientedBuildBox(p,q)),.5))))return 'That arm section overlaps another piece.';
      if(b.x-b.w/2<128||b.x+b.w/2>FRONTIER_SIZE-128||b.y-b.d/2<128||b.y+b.d/2>FRONTIER_SIZE-128)return 'Keep the arm inside the valley.';
      if(terrain)for(let x=Math.floor((b.x-b.w/2)/32);x<=Math.floor((b.x+b.w/2)/32);x++)for(let y=Math.floor((b.y-b.d/2)/32);y<=Math.floor((b.y+b.d/2)/32);y++)for(let z=Math.floor(b.z/32);z<=Math.floor((b.z+b.h)/32);z++)if(terrain.material(x,y,z)&&overlapOBB(exact,boxOBB(box(x*32+16,y*32+16,z*32,32,32,32))))return 'Excavate a clear space for the arm.';
    }
    return;
  }
  if(shape==='crane_boom')return 'Snap a boom section onto a slewing joint or another boom.';
  if(shape==='crane_console'&&(!pose?.craneRootId||!pieces.some(p=>p.id===pose.craneRootId&&['crane_joint','crane','crane_winch'].includes(p.shape)&&!p.assembly&&Math.hypot(p.x-pose.x,p.y-pose.y,p.z-pose.z)<240)))return 'Place the console within 20m of the crane to link it.';
  if(pose?.attachment){
    const a=pose.attachment;if(typeof a.vehicleId!=='string'||![pose.x,pose.y,pose.z].every(Number.isFinite))return 'Choose a valid freight deck placement.';const index=Number(a.vehicleId.replace('grand-',''));
    if(!isFriendsShape(shape)||!Number.isInteger(index)||a.vehicleId!==`grand-${index}`||!SCENIC_WAGONS[index]||SCENIC_WAGONS[index]==='touring'||![a.x,a.y,a.z,pose.rotation].every(Number.isFinite)||![a.x,a.y,a.z].every(n=>n%4===0)||!Number.isInteger(pose.rotation)||pose.rotation<0||pose.rotation>3)return 'Choose a valid freight deck placement.';
    const def=FRIENDS_BUILD_CATALOG[shape],w=pose.rotation%2?def.d:def.w,d=pose.rotation%2?def.w:def.d;
    if(Math.abs(a.x)+w/2>SCENIC_CAR_LENGTH/2-14||Math.abs(a.y)+d/2>44||a.z<0||a.z+def.h>96||isPlayerRail(shape))return 'Keep cargo inside the deck and below tunnel clearance (8 m).';
    const v=vehicles.find(v=>v.id===a.vehicleId&&scenicCargoWagon(v));if(!v&&!restoring)return 'This freight wagon is unavailable.';
    const resolved=v?resolveFriendsBuildPose(pose,vehicles):pose;
    if(actor&&(actor.lifeState!=='alive'||Math.hypot(resolved.x-actor.x,resolved.y-actor.y,resolved.z-actor.z)>FRIENDS_BUILD_REACH+64))return 'Move closer to the freight deck.';
    if(['crane','crane_joint','crane_winch','crane_console'].includes(String(shape)))return 'Mount a freight crane on fixed ground or a player-built platform.';
    const localPose={...pose,x:a.x,y:a.y,z:a.z,attachment:undefined,vehicleFrame:undefined},boxes=friendsShapeBoxes(shape).map(b=>worldBox(localPose,b));
    const localPieces=pieces.filter(p=>p.id!==ignoringId&&p.attachment?.vehicleId===a.vehicleId).map(p=>({...p,...p.attachment!,attachment:undefined,vehicleFrame:undefined}));
    if(boxes.some(b=>localPieces.some(p=>friendsShapeBoxes(p.shape).some(q=>overlaps(b,worldBox(p,q))))))return 'That freight space already contains a piece.';
    if(v&&boxes.some(b=>bodies.some(body=>{const q=vehicleLocalPoint(v,body);return body.lifeState==='alive'&&overlaps(b,box(q.x,q.y,q.z,body.bodyWidth??38,body.bodyDepth??38,body.bodyHeight??50),0);})))return 'A friend or load is standing in the way.';
    if(!restoring&&a.z!==0&&!boxes.some(b=>localPieces.some(p=>friendsShapeBoxes(p.shape).some(q=>overlaps(b,worldBox(p,q),-1)))))return 'Place cargo on the deck or on another secured piece.';
    return;
  }
  if (!isFriendsShape(shape) || !pose || ![pose.x, pose.y, pose.z, pose.rotation].every(Number.isFinite) || !Number.isInteger(pose.rotation) || pose.rotation < 0 || pose.rotation > 3 || ![pose.x, pose.y, pose.z].every(n => n % 4 === 0)) return 'Choose a valid snapped piece.';
  if (actor && (actor.lifeState !== 'alive' || Math.hypot(pose.x - actor.x, pose.y - actor.y, pose.z - actor.z) > FRIENDS_BUILD_REACH + 64)) return 'Move closer to the placement.';
  const def = FRIENDS_BUILD_CATALOG[shape], extent = Math.hypot(def.w, def.d) / 2;
  if (pose.z < TERRAIN_BOTTOM + 32 || pose.z + def.h > 6000 || pose.x - extent < 128 || pose.x + extent > FRONTIER_SIZE - 128 || pose.y - extent < 128 || pose.y + extent > FRONTIER_SIZE - 128) return 'Keep your build inside the valley and below the height limit.';
  if (Math.hypot(pose.x - FRIENDS_AIRPAD.x, pose.y - FRIENDS_AIRPAD.y) < 260 + extent) return 'Leave the aircraft bay clear.';
  const spawn = FRIENDS_SPAWN_PLATFORM;
  if(!restoring&&friendsShapeBoxes(shape).some(local=>{
    const b=worldBox(pose,local),camp=FRIENDS_CAMPFIRE;
    const dx=Math.max(0,Math.abs(b.x-camp.x)-b.w/2),dy=Math.max(0,Math.abs(b.y-camp.y)-b.d/2);
    return Math.hypot(dx,dy)<camp.radius&&b.z<camp.z+128&&b.z+b.h>camp.z-64;
  }))return 'Keep the campfire gathering spot clear.';
  if (friendsShapeBoxes(shape).some(local => {
    const b = worldBox(pose, local);
    return Math.abs(b.x - spawn.x) < (b.w + spawn.size) / 2
      && Math.abs(b.y - spawn.y) < (b.d + spawn.size) / 2
      && b.z < spawn.top + spawn.clearance && b.z + b.h > spawn.top - spawn.thickness;
  })) return 'Keep the player spawn platform clear.';
  // Preserve existing saved builds; new construction must leave the hauling bay free.
  if (!restoring && friendsShapeBoxes(shape).some(local=>{
    const b=worldBox(pose,local);
    return FRIENDS_HAULING_PLATFORMS.some(p=>Math.abs(b.x-p.x)<(b.w+p.size)/2&&Math.abs(b.y-p.y)<(b.d+p.size)/2
      &&b.z<p.top+p.clearance&&b.z+b.h>p.top-p.thickness);
  })) return 'Keep the hauling platform clear.';
  if (!restoring && pose.z < 160 && Math.hypot(pose.x-FRIENDS_HUB.x,pose.y-FRIENDS_HUB.y-90)<90+extent) return 'Leave room to spawn safely.';
  if (isPlayerRail(shape)) {
    const candidate = {...pose,shape}, overlap=railOverlapError(pieces,candidate,ignoringId); if(overlap)return overlap;
    if (!restoring) for(const q of railSamples(candidate,24)) for(const offset of [-44,0,44]) {
      const x=q.x-Math.sin(q.angle)*offset,y=q.y+Math.cos(q.angle)*offset;
      const ground=terrain?.floor(x,y,pose.z,0) ?? (terrain ? -Infinity : 0);
      const support=friendsBuildFloor(pieces.filter(p=>p.id!==ignoringId && !isPlayerRail(p.shape)),x,y,pose.z,0);
      if(Math.abs(Math.max(ground,support??-Infinity)-pose.z)>1)return 'Level the ground or build a bridge beneath the entire track.';
      if(terrain?.material(Math.floor(x/32),Math.floor(y/32),Math.floor((pose.z+1)/32)))return 'Excavate the ground before laying track.';
    }
  }
  const boxes = friendsShapeBoxes(shape).map(b => worldBox(pose, b));
  for (const b of boxes) {
    if(!restoring)for(let dx=-b.w/2;dx<=b.w/2;dx+=32)for(let dy=-b.d/2;dy<=b.d/2;dy+=32)for(let z=b.z;z<=b.z+b.h;z+=32)
      if(scenicTransitProtected(b.x+dx,b.y+dy,z))return 'Leave the Grand Traverse railway clearance free. Build beside or below the line.';
    if (terrain) {
      for (const dx of [-b.w / 2 + 1, 0, b.w / 2 - 1]) for (const dy of [-b.d / 2 + 1, 0, b.d / 2 - 1]) for (let z = b.z + 1; z < b.z + b.h; z += 32) if (terrain.material(Math.floor((b.x + dx) / 32), Math.floor((b.y + dy) / 32), Math.floor(z / 32))) return 'Excavate the ground before placing a piece there.';
    }
    const obstruction=bodies.find(p => p.lifeState === 'alive' && overlaps(b, box(p.x, p.y, p.z, p.bodyWidth ?? 38, p.bodyDepth ?? 38, p.bodyHeight ?? 50), 0));
    if(obstruction)return obstruction.id===actor?.id?'Leave space for your operator.':'A friend or load is standing in the way.';
    if (getNearbyWorldObstacles(b.x, b.y, Math.max(b.w, b.d), 'friends_frontier').some(o => overlaps(b, box(o.x + o.width / 2, o.y + o.height / 2, 0, o.width, o.height, o.elevation)))) return 'That space overlaps a landmark.';
    if (pieces.some(p => p.id !== ignoringId && !(isPlayerRail(shape) && isPlayerRail(p.shape)) && friendsShapeBoxes(p.shape).some(other => overlaps(b, worldBox(p, other))))) return 'That space already contains a piece.';
  }
  if (!restoring && !isPlayerRail(shape) && !(pose.z === 0 && !terrain) && !(terrain && Math.abs((terrain.floor(pose.x, pose.y, pose.z, 1) ?? -Infinity) - pose.z) <= 1) && !pieces.some(p => p.id !== ignoringId && boxes.some(b => friendsShapeBoxes(p.shape).some(other => overlaps(b, worldBox(p, other), -1)))) && !boxes.some(b => getNearbyWorldObstacles(b.x, b.y, extent + 8, 'friends_frontier').some(o => Math.abs(b.z - o.elevation) <= 1 && contains(box(o.x + o.width / 2, o.y + o.height / 2, 0, o.width, o.height, 0), b.x, b.y)))) return 'Attach this piece to your build or a landmark roof.';
  return undefined;
}
export type FriendsBuildEdit = { before?: FriendsBuildPiece; after?: FriendsBuildPiece };
type Edit = FriendsBuildEdit;
export type FriendsBuildEconomy = ((before?: FriendsBuildPiece, after?: Pick<FriendsBuildPiece, 'shape' | 'finish'>) => string | undefined) & {
  batch?: (edits: readonly FriendsBuildEdit[]) => string | undefined;
};
export class FriendsBuilding {
  placementGuard?:(shape:FriendsBuildShape,pose:FriendsBuildPose)=>string|undefined;
  private reserved(shape:FriendsBuildShape|undefined,pose:FriendsBuildPose|undefined){return shape&&pose?this.placementGuard?.(shape,resolveFriendsBuildPose(pose,this.vehicleProvider())):undefined;}
  vehicleProvider:()=>readonly FriendsVehicle[]=()=>[];
  craneAngleProvider:()=>ReadonlyMap<number,number>=()=>new Map();
  parkCrane(id:number,angle:number){const p=this.pieces.find(p=>p.id===id&&p.shape==='crane_joint');if(p&&Math.abs((p.craneAngle??0)-angle)>.0001){p.craneAngle=angle;p.revision=++this.revision;}}
  private revision = 0;
  private nextId = 1;
  private pieces: FriendsBuildPiece[] = [];
  private guestsCanBuild = true;
  private consumed = new Map<string, number>();
  private undo = new Map<string, Edit[][]>();
  private redo = new Map<string, Edit[][]>();
  constructor(saved?: Partial<FriendsBuildingSnapshot>, minimumRevision = 0, private terrain?: FriendsTerrain) {
    if (!saved || !Array.isArray(saved.pieces)) { this.revision = minimumRevision; return; }
    this.guestsCanBuild = saved.guestsCanBuild !== false;
    for (const original of saved.pieces.slice(0, FRIENDS_BUILD_LIMIT).filter(p=>p&&typeof p==='object').sort((a,b)=>Number(Boolean(a.assembly))-Number(Boolean(b.assembly))||(a.assembly?a.id-b.id:0))) {const p=resolveAssemblyPose({...original,assemblyFrame:undefined},this.pieces);if(p.craneAngle!==undefined&&(!Number.isFinite(p.craneAngle)||Math.abs(p.craneAngle)>Math.PI*2))p.craneAngle=0; if (p && isFriendsShape(p.shape) && isFriendsFinish(p.finish) && Number.isSafeInteger(p.id) && p.id > 0 && p.id < 1000000000 && !this.pieces.some(q => q.id === p.id) && !friendsPlacementError(this.pieces, p.shape, p, undefined, [], undefined, true)) {
      this.pieces.push({ ...p, vehicleFrame:undefined, author: String(p.author || 'Friend').slice(0, 24), revision: 1 }); this.nextId = Math.max(this.nextId, p.id + 1);
    }
    }
    this.revision = Math.max(this.pieces.length ? 1 : 0, minimumRevision);
    this.pieces.forEach(p => { p.revision = this.revision; });
  }
  setGuestAccess(allowed: boolean) { this.guestsCanBuild = allowed; this.revision++; }
  getGuestAccess() { return this.guestsCanBuild; }
  getRevision() { return this.revision; }
  getPieces(): readonly FriendsBuildPiece[] { return this.pieces.some(p=>p.attachment||p.assembly)?resolveFriendsBuildPieces(this.pieces,this.vehicleProvider(),this.craneAngleProvider()):this.pieces; }
  snapshot(): FriendsBuildingSnapshot { return { revision: this.revision, pieces: this.getPieces().map(p => ({ ...p })), guestsCanBuild: this.guestsCanBuild }; }
  private record(actor: string, edits: Edit[]) {
    const history = this.undo.get(actor) || []; history.push(edits); if (history.length > 64) history.shift();
    this.undo.set(actor, history); this.redo.delete(actor);
  }
  /** Pickaxe demolition removes dependent crane sockets in the same transaction. */
  demolish(actor: FriendsBuildActor, pieceId: number, expectedRevision: number, hostId: string, economy?: FriendsBuildEconomy): string | undefined {
    if (actor.lifeState !== 'alive') return 'Return to the valley to build.';
    if (actor.id !== hostId && !this.guestsCanBuild) return 'The host needs to press C and enable Friends can build.';
    const piece = this.pieces.find(p => p.id === pieceId && p.revision === expectedRevision);
    if (!piece) return 'The piece changed. Aim at it again.';
    const live = this.getPieces().find(p => p.id === pieceId)!;
    if (!friendsShapeBoxes(live.shape).some(local => {
      const b = worldBox(live, local);
      return Math.hypot(Math.max(0, Math.abs(actor.x - b.x) - b.w / 2), Math.max(0, Math.abs(actor.y - b.y) - b.d / 2), Math.max(0, b.z - (actor.z + 26), actor.z + 26 - b.z - b.h)) <= FRIENDS_BUILD_REACH;
    })) return 'Move closer to that piece.';
    return this.removePieces(actor, new Set([pieceId]), economy);
  }
  blast(actor: FriendsBuildActor, center: {x:number;y:number;z:number}, radius: number, hostId: string, economy?: FriendsBuildEconomy): number {
    if (actor.id !== hostId && !this.guestsCanBuild) return 0;
    const removed = new Set(this.getPieces().filter(p => friendsShapeBoxes(p.shape).some(local => {
      const b = worldBox(p, local);
      return Math.hypot(Math.max(0, Math.abs(center.x-b.x)-b.w/2), Math.max(0, Math.abs(center.y-b.y)-b.d/2), Math.max(0,b.z-center.z,center.z-b.z-b.h)) <= radius;
    })).map(p => p.id));
    if (!removed.size) return 0;
    const before = this.pieces.length;
    return this.removePieces(actor, removed, economy) ? 0 : before - this.pieces.length;
  }
  private removePieces(actor: FriendsBuildActor, removed: Set<number>, economy?: FriendsBuildEconomy): string | undefined {
    let added = true;
    while (added) {
      added = false;
      for (const p of this.pieces) if (!removed.has(p.id) && (p.assembly && (removed.has(p.assembly.parentId) || removed.has(p.assembly.rootId)) || p.craneRootId !== undefined && removed.has(p.craneRootId))) {
        removed.add(p.id); added = true;
      }
    }
    const edits = this.pieces.filter(p => removed.has(p.id)).map(before => ({ before }));
    const error = edits.length === 1 ? economy?.(edits[0].before, undefined) : economy ? economy.batch?.(edits) ?? (economy.batch ? undefined : 'Group economy is unavailable.') : undefined;
    if (error) return error;
    this.pieces = this.pieces.filter(p => !removed.has(p.id)); this.revision++;
    this.record(actor.id, edits);
  }
  request(actor: FriendsBuildActor, request: FriendsBuildRequest, hostId: string, bodies: readonly FriendsBuildActor[], economy?: FriendsBuildEconomy): FriendsBuildResult {
    if(request.pose){request={...request,pose:resolveAssemblyPose(resolveFriendsBuildPose({...request.pose,vehicleFrame:undefined,assemblyFrame:undefined},this.vehicleProvider()),this.pieces,this.craneAngleProvider())};}
    const result = (ok: boolean, message: string): FriendsBuildResult => ({ playerId: actor.id, requestId: request.requestId, ok, message, revision: this.revision });
    if (!Number.isSafeInteger(request.requestId) || request.requestId <= (this.consumed.get(actor.id) || 0)) return result(false, 'This edit was already handled.');
    this.consumed.set(actor.id, request.requestId);
    if (actor.lifeState !== 'alive') return result(false, 'Return to the valley to build.');
    if (request.action === 'permissions') {
      if (actor.id !== hostId || typeof request.allowed !== 'boolean') return result(false, 'Only the host can change building access.');
      this.guestsCanBuild = request.allowed; this.revision++; return result(true, request.allowed ? 'Friends can edit this world.' : 'Visitors can explore; only the host can edit.');
    }
    if (actor.id !== hostId && !this.guestsCanBuild) return result(false, 'The host needs to press C and enable Friends can build.');
    if (request.action === 'undo' || request.action === 'redo') {
      const from = request.action === 'undo' ? this.undo : this.redo, to = request.action === 'undo' ? this.redo : this.undo;
      const history = from.get(actor.id), edits = history?.at(-1); if (!edits) return result(false, 'There is no edit to reverse.');
      const excluded = new Set(edits.flatMap(edit => edit.after ? [edit.after.id] : []));
      const candidates = this.getPieces().filter(p => !excluded.has(p.id));
      const reversals: Edit[] = [];
      for (const edit of edits) {
        const current = edit.after && this.pieces.find(p => p.id === edit.after!.id);
        if ((edit.after && (!current || current.revision !== edit.after.revision)) || (!edit.after && edit.before && this.pieces.some(p => p.id === edit.before!.id)))
          return result(false, 'A friend changed this piece. Their edit is protected.');
        if (edit.before) {
          const restoredPose = resolveFriendsBuildPose(edit.before,this.vehicleProvider());
          const issue = friendsPlacementError(candidates, edit.before.shape, restoredPose, undefined, bodies, undefined, true, this.terrain,this.vehicleProvider())||this.reserved(edit.before.shape,restoredPose);
          if (issue) return result(false, issue);
          candidates.push(restoredPose);
        }
        reversals.push({ before: current, after: edit.before });
      }
      const topology=craneTopologyError(candidates);if(topology)return result(false,topology);
      if (candidates.length > FRIENDS_BUILD_LIMIT) return result(false, 'The world piece budget is full.');
      const economicIssue = edits.length === 1 ? economy?.(reversals[0].before, reversals[0].after)
        : economy ? economy.batch?.(reversals) ?? (economy.batch ? undefined : 'Group economy is unavailable.') : undefined;
      if (economicIssue) return result(false, economicIssue);
      history!.pop(); this.revision++;
      this.pieces = this.pieces.filter(p => !excluded.has(p.id));
      const reverse: Edit[] = edits.map(edit => {
        const restored = edit.before ? { ...edit.before, revision: this.revision } : undefined;
        if (restored) this.pieces.push(restored);
        return { before: edit.after, after: restored };
      });
      const stack = to.get(actor.id) || []; stack.push(reverse); to.set(actor.id, stack);
      return result(true, request.action === 'undo' ? 'Edit undone.' : 'Edit restored.');
    }
    if (request.action === 'place_group') {
      if (!isFriendsShape(request.shape) || !isFriendsFinish(request.finish) || !Array.isArray(request.poses) || request.poses.length < 1 || request.poses.length > 64)
        return result(false, 'Choose a valid group of up to 64 pieces.');
      if(isCranePart(request.shape)||request.shape==='crane_console')return result(false,'Place crane socket parts individually.');
      if (isPlayerRail(request.shape)) return result(false, 'Place railway segments individually to preserve track connections.');
      if (this.pieces.length + request.poses.length > FRIENDS_BUILD_LIMIT) return result(false, 'The group exceeds the world piece budget.');
      const candidates = [...this.getPieces()], group: Edit[] = [];
      for (let i = 0; i < request.poses.length; i++) {
        const pose = resolveFriendsBuildPose({...request.poses[i],vehicleFrame:undefined},this.vehicleProvider());
        const issue = friendsPlacementError(candidates, request.shape, pose, actor, bodies, undefined, false, this.terrain,this.vehicleProvider())||this.reserved(request.shape,pose);
        if (issue) return result(false, 'Piece ' + (i + 1) + ': ' + issue);
        const after: FriendsBuildPiece = { ...pose, shape: request.shape, finish: request.finish, id: this.nextId + i, author: (actor.label || 'Friend').slice(0,24), revision: this.revision + 1 };
        candidates.push(after); group.push({after});
      }
      const economicIssue = economy ? economy.batch?.(group) ?? (economy.batch ? undefined : 'Group economy is unavailable.') : undefined;
      if (economicIssue) return result(false, economicIssue);
      this.revision++; this.nextId += group.length; this.pieces.push(...group.map(edit => edit.after!));
      this.record(actor.id, group);
      return result(true, group.length + ' pieces placed. Undo reverses the whole group.');
    }
    let edit: Edit;
    if (request.action === 'place') {
      if (this.pieces.length >= FRIENDS_BUILD_LIMIT) return result(false, `World budget: ${FRIENDS_BUILD_LIMIT} pieces. Remove a piece to make room.`);
      if (!isFriendsFinish(request.finish)) return result(false, 'Choose a finish.');
      const issue = friendsPlacementError(this.getPieces(), request.shape, request.pose, actor, bodies, undefined, false, this.terrain,this.vehicleProvider())||this.reserved(request.shape,request.pose); if (issue) return result(false, issue);
      const economicIssue = economy?.(undefined, { shape: request.shape!, finish: request.finish! }); if (economicIssue) return result(false, economicIssue);
      const after: FriendsBuildPiece = { ...request.pose!, id: this.nextId++, shape: request.shape!, finish: request.finish, author: (actor.label || 'Friend').slice(0, 24), revision: ++this.revision };
      this.pieces.push(after); edit = { after };
    } else if (request.action === 'remove' || request.action === 'paint' || request.action === 'move') {
      const before = this.pieces.find(p => p.id === request.pieceId);
      if (!before || before.revision !== request.expectedRevision) return result(false, 'The piece changed. Aim at it again.');
      if (Math.hypot(resolveAssemblyPose(resolveFriendsBuildPose(before,this.vehicleProvider()),this.pieces,this.craneAngleProvider()).x - actor.x, resolveAssemblyPose(resolveFriendsBuildPose(before,this.vehicleProvider()),this.pieces,this.craneAngleProvider()).y - actor.y, resolveAssemblyPose(resolveFriendsBuildPose(before,this.vehicleProvider()),this.pieces,this.craneAngleProvider()).z - actor.z) > FRIENDS_BUILD_REACH + 64) return result(false, 'Move closer to that piece.');
      if(['move','remove'].includes(request.action)&&this.pieces.some(p=>p.assembly?.parentId===before.id||p.craneRootId===before.id))return result(false,'Dismantle connected arm pieces and consoles from the end before moving or removing their parent.');
      if (request.action === 'paint' && !isFriendsFinish(request.finish)) return result(false, 'Choose a finish.');
      if (request.action === 'move') { const issue = friendsPlacementError(this.getPieces(), before.shape, request.pose, actor, bodies, before.id, false, this.terrain,this.vehicleProvider())||this.reserved(before.shape,request.pose); if (issue) return result(false, issue); }
      const economicIssue = economy?.(before, request.action === 'remove' ? undefined : { shape: before.shape, finish: request.action === 'paint' ? request.finish! : before.finish }); if (economicIssue) return result(false, economicIssue);
      this.revision++; this.pieces = this.pieces.filter(p => p.id !== before.id);
      const after = request.action === 'remove' ? undefined : { ...before, ...(request.action==='move'?{attachment:undefined,vehicleFrame:undefined,assembly:undefined,assemblyFrame:undefined,craneRootId:undefined}:{}), ...(request.action === 'move' ? request.pose : { finish: request.finish! }), revision: this.revision };
      if (after) this.pieces.push(after); edit = { before, after };
    } else return result(false, 'Unknown building action.');
    this.record(actor.id, [edit]);
    return result(true, request.action === 'place' ? `${FRIENDS_BUILD_CATALOG[request.shape!].name} placed.` : request.action === 'paint' ? 'Finish applied.' : request.action === 'move' ? 'Piece moved.' : 'Piece removed.');
  }
}
