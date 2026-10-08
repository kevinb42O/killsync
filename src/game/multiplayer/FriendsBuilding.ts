import { scenicCargoWagon, SCENIC_WAGONS, SCENIC_CAR_LENGTH } from '../world/FriendsTrainLayout';
import { vehicleLocalPoint, vehicleWorldPoint, vehiclePlaneHeight } from './FriendsVehiclePose';
import type { FriendsVehicle } from './FriendsExpedition';
import { scenicTransitProtected } from '../world/FriendsRailInfrastructure';
import { FRIENDS_TERRAIN_SURFACES } from '../world/FriendsTerrainAppearance';
import { FriendsTerrain, FRONTIER_SIZE, TERRAIN_BOTTOM, FRIENDS_STEP_HEIGHT, VOXEL_SIZE, FRIENDS_SPAWN_PLATFORM, FRIENDS_HAULING_PLATFORMS } from '../world/FriendsTerrain';
import { getNearbyWorldObstacles } from '../world/WorldLayout';
import { FRIENDS_AIRPAD, FRIENDS_HUB } from '../world/FriendsRegion';
import { isPlayerRail, railSamples, railOverlapError, snapRailPose } from '../world/FriendsPlayerRail';

export const FRIENDS_BUILD_LIMIT = 1024;
export const FRIENDS_BUILD_REACH = 520;
export const FRIENDS_BUILD_HEIGHT = 1024;
export const FRIENDS_BUILD_SHAPES = ['block', 'half_block', 'floor_tile', 'voxel_ramp', 'voxel_stairs', 'cube', 'half', 'slab', 'ramp', 'long_ramp', 'stairs', 'wall', 'window', 'doorway', 'pillar', 'beam', 'railing', 'roof', 'glass', 'lamp', 'planter', 'bench', 'table', 'sign', 'survey_lens', 'gathering_beacon', 'workbench', 'furnace', 'storage', 'landing_pad', 'rail_straight', 'rail_curve'] as const;
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
export type FriendsBuildPose = { x: number; y: number; z: number; rotation: number; attachment?:{vehicleId:string;x:number;y:number;z:number}; vehicleFrame?:{angle:number;pitch:number} };
export function resolveFriendsBuildPose<T extends FriendsBuildPose>(p:T,vehicles:readonly FriendsVehicle[]):T{
  const a=p.attachment,v=a&&vehicles.find(v=>v.id===a.vehicleId&&scenicCargoWagon(v));
  return v&&a?{...p,...vehicleWorldPoint(v,a),vehicleFrame:{angle:v.angle,pitch:v.pitch||0}}:p;
}
export function resolveFriendsBuildPieces(pieces:readonly FriendsBuildPiece[],vehicles:readonly FriendsVehicle[]){return pieces.map(p=>resolveFriendsBuildPose(p,vehicles));}
const pieceFrame=(p:FriendsBuildPose)=>({x:p.x,y:p.y,z:p.z,angle:p.vehicleFrame!.angle,pitch:p.vehicleFrame!.pitch});
const unframed=<T extends FriendsBuildPose>(p:T):T=>({...p,x:0,y:0,z:0,attachment:undefined,vehicleFrame:undefined});
export type FriendsBuildPiece = FriendsBuildPose & { id: number; shape: FriendsBuildShape; finish: FriendsBuildFinish; author: string; revision: number };
export type FriendsBuildingSnapshot = { revision: number; pieces: FriendsBuildPiece[]; guestsCanBuild: boolean };
export type FriendsBuildActor = { id: string; label?: string; x: number; y: number; z: number; lifeState: string; bodyWidth?: number; bodyDepth?: number; bodyHeight?: number };
/** Reserve the moving aircraft's hull as well as the fixed bay during edits. */
export function friendsVehicleBuildBodies(vehicles: readonly { kind: string; x: number; y: number; z: number; angle: number; length: number; width: number }[] = []): FriendsBuildActor[] {
  return vehicles.filter(v => v.kind === 'aircraft').map(v => ({ id: 'aircraft', x: v.x, y: v.y, z: v.z - 14, lifeState: 'alive', bodyWidth: Math.abs(Math.cos(v.angle)) * v.length + Math.abs(Math.sin(v.angle)) * v.width + 50, bodyDepth: Math.abs(Math.sin(v.angle)) * v.length + Math.abs(Math.cos(v.angle)) * v.width + 50, bodyHeight: 125 }));
}
export type FriendsBuildRequest = { requestId: number; action: 'place' | 'remove' | 'paint' | 'move' | 'undo' | 'redo' | 'permissions'; shape?: FriendsBuildShape; finish?: FriendsBuildFinish; pose?: FriendsBuildPose; pieceId?: number; expectedRevision?: number; allowed?: boolean };
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
  if(p.vehicleFrame){
    const b0=worldBox(unframed(p),b),points=[];
    for(const x of [-1,1])for(const y of [-1,1])for(const z of [0,1])points.push(vehicleWorldPoint(pieceFrame(p),{x:b0.x+x*b0.w/2,y:b0.y+y*b0.d/2,z:b0.z+z*b0.h}));
    const lo=(key:'x'|'y'|'z')=>Math.min(...points.map(p=>p[key])),hi=(key:'x'|'y'|'z')=>Math.max(...points.map(p=>p[key]));
    return box((lo('x')+hi('x'))/2,(lo('y')+hi('y'))/2,lo('z'),hi('x')-lo('x'),hi('y')-lo('y'),hi('z')-lo('z'));
  }
  const a = p.rotation * Math.PI / 2, c = Math.round(Math.cos(a)), s = Math.round(Math.sin(a));
  return box(p.x + b.x * c - b.y * s, p.y + b.x * s + b.y * c, p.z + b.z, p.rotation % 2 ? b.d : b.w, p.rotation % 2 ? b.w : b.d, b.h);
}
const contains = (b: BuildBox, x: number, y: number, padding = 0) => Math.abs(x - b.x) <= b.w / 2 + padding && Math.abs(y - b.y) <= b.d / 2 + padding;
export function friendsBuildFloor(pieces: readonly FriendsBuildPiece[], x: number, y: number, z: number, step = FRIENDS_STEP_HEIGHT) {
  let floor: number | undefined;
  for (const p of pieces) {
    if(p.vehicleFrame){
      const frame=pieceFrame(p),q=vehicleLocalPoint(frame,{x,y,z});
      let top=friendsBuildFloor([unframed(p)],q.x,q.y,q.z,step);
      if(top!==undefined){const height=vehiclePlaneHeight(frame,x,y,top),at=vehicleLocalPoint(frame,{x,y,z:height});top=friendsBuildFloor([unframed(p)],at.x,at.y,at.z,0.01);if(top!==undefined&&height<=z+step+.00001)floor=Math.max(floor??-Infinity,height);}
      continue;
    }
    const q = buildLocal(p, x, y), def = FRIENDS_BUILD_CATALOG[p.shape];
    const padding = isPlayerRail(p.shape) ? 64 : 0;
    if (Math.abs(q.x) > def.w / 2 + padding || Math.abs(q.y) > def.d / 2 + padding) continue;
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
export function friendsBuildCeiling(pieces: readonly FriendsBuildPiece[], x: number, y: number, z: number) {
  let ceiling: number | undefined;
  for (const p of pieces) {
    if(p.vehicleFrame){const f=pieceFrame(p),q=vehicleLocalPoint(f,{x,y,z}),h=friendsBuildCeiling([unframed(p)],q.x,q.y,q.z);if(h!==undefined)ceiling=Math.min(ceiling??Infinity,vehiclePlaneHeight(f,x,y,h));continue;}
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
    if(p.vehicleFrame){const f=pieceFrame(p),q=vehicleLocalPoint(f,{...position,z});if(resolveFriendsBuildCollisions([unframed(p)],q,q.z,radius,bodyHeight,step)){const world=vehicleWorldPoint(f,q);position.x=world.x;position.y=world.y;collided=true;}continue;}
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
        // A landing attached flush to a ramp has no exposed entrance wall.
        // The cylinder may overlap that face while its feet follow the ramp.
        const connected=pieces.some(other=>other!==p&&isSlope(other.shape)&&
          Math.abs((friendsBuildFloor([other],position.x,position.y,z,step)??Infinity)-z)<=step&&
          Math.abs((friendsBuildFloor([other],contact.x,contact.y,p.z+top,.01)??Infinity)-(p.z+top))<.01);
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
    if(p.vehicleFrame){
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
  pieces=resolveFriendsBuildPieces(pieces,vehicles);
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
    if (hit.nz > .1) return { x: snap(hit.x), y: snap(hit.y), z: snap(hit.z), rotation: r };
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
  if(pose?.attachment){
    const a=pose.attachment;if(typeof a.vehicleId!=='string'||![pose.x,pose.y,pose.z].every(Number.isFinite))return 'Choose a valid freight deck placement.';const index=Number(a.vehicleId.replace('grand-',''));
    if(!isFriendsShape(shape)||!Number.isInteger(index)||a.vehicleId!==`grand-${index}`||!SCENIC_WAGONS[index]||SCENIC_WAGONS[index]==='touring'||![a.x,a.y,a.z,pose.rotation].every(Number.isFinite)||![a.x,a.y,a.z].every(n=>n%4===0)||!Number.isInteger(pose.rotation)||pose.rotation<0||pose.rotation>3)return 'Choose a valid freight deck placement.';
    const def=FRIENDS_BUILD_CATALOG[shape],w=pose.rotation%2?def.d:def.w,d=pose.rotation%2?def.w:def.d;
    if(Math.abs(a.x)+w/2>SCENIC_CAR_LENGTH/2-14||Math.abs(a.y)+d/2>44||a.z<0||a.z+def.h>96||isPlayerRail(shape))return 'Keep cargo inside the deck and below tunnel clearance (8 m).';
    const v=vehicles.find(v=>v.id===a.vehicleId&&scenicCargoWagon(v));if(!v&&!restoring)return 'This freight wagon is unavailable.';
    const resolved=v?resolveFriendsBuildPose(pose,vehicles):pose;
    if(actor&&(actor.lifeState!=='alive'||Math.hypot(resolved.x-actor.x,resolved.y-actor.y,resolved.z-actor.z)>FRIENDS_BUILD_REACH+64))return 'Move closer to the freight deck.';
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
    if (bodies.some(p => p.lifeState === 'alive' && overlaps(b, box(p.x, p.y, p.z, p.bodyWidth ?? 38, p.bodyDepth ?? 38, p.bodyHeight ?? 50), 0))) return 'A friend is standing in the way.';
    if (getNearbyWorldObstacles(b.x, b.y, Math.max(b.w, b.d), 'friends_frontier').some(o => overlaps(b, box(o.x + o.width / 2, o.y + o.height / 2, 0, o.width, o.height, o.elevation)))) return 'That space overlaps a landmark.';
    if (pieces.some(p => p.id !== ignoringId && !(isPlayerRail(shape) && isPlayerRail(p.shape)) && friendsShapeBoxes(p.shape).some(other => overlaps(b, worldBox(p, other))))) return 'That space already contains a piece.';
  }
  if (!restoring && !isPlayerRail(shape) && !(pose.z === 0 && !terrain) && !(terrain && Math.abs((terrain.floor(pose.x, pose.y, pose.z, 1) ?? -Infinity) - pose.z) <= 1) && !pieces.some(p => p.id !== ignoringId && boxes.some(b => friendsShapeBoxes(p.shape).some(other => overlaps(b, worldBox(p, other), -1)))) && !boxes.some(b => getNearbyWorldObstacles(b.x, b.y, extent + 8, 'friends_frontier').some(o => Math.abs(b.z - o.elevation) <= 1 && contains(box(o.x + o.width / 2, o.y + o.height / 2, 0, o.width, o.height, 0), b.x, b.y)))) return 'Attach this piece to your build or a landmark roof.';
  return undefined;
}
type Edit = { before?: FriendsBuildPiece; after?: FriendsBuildPiece };
export class FriendsBuilding {
  vehicleProvider:()=>readonly FriendsVehicle[]=()=>[];
  private revision = 0;
  private nextId = 1;
  private pieces: FriendsBuildPiece[] = [];
  private guestsCanBuild = true;
  private consumed = new Map<string, number>();
  private undo = new Map<string, Edit[]>();
  private redo = new Map<string, Edit[]>();
  constructor(saved?: Partial<FriendsBuildingSnapshot>, minimumRevision = 0, private terrain?: FriendsTerrain) {
    if (!saved || !Array.isArray(saved.pieces)) { this.revision = minimumRevision; return; }
    this.guestsCanBuild = saved.guestsCanBuild !== false;
    for (const p of saved.pieces.slice(0, FRIENDS_BUILD_LIMIT)) if (p && isFriendsShape(p.shape) && isFriendsFinish(p.finish) && Number.isSafeInteger(p.id) && p.id > 0 && p.id < 1000000000 && !this.pieces.some(q => q.id === p.id) && !friendsPlacementError(this.pieces, p.shape, p, undefined, [], undefined, true)) {
      this.pieces.push({ ...p, vehicleFrame:undefined, author: String(p.author || 'Friend').slice(0, 24), revision: 1 }); this.nextId = Math.max(this.nextId, p.id + 1);
    }
    this.revision = Math.max(this.pieces.length ? 1 : 0, minimumRevision);
    this.pieces.forEach(p => { p.revision = this.revision; });
  }
  setGuestAccess(allowed: boolean) { this.guestsCanBuild = allowed; this.revision++; }
  getGuestAccess() { return this.guestsCanBuild; }
  getRevision() { return this.revision; }
  getPieces(): readonly FriendsBuildPiece[] { return this.pieces.some(p=>p.attachment)?resolveFriendsBuildPieces(this.pieces,this.vehicleProvider()):this.pieces; }
  snapshot(): FriendsBuildingSnapshot { return { revision: this.revision, pieces: this.getPieces().map(p => ({ ...p })), guestsCanBuild: this.guestsCanBuild }; }
  request(actor: FriendsBuildActor, request: FriendsBuildRequest, hostId: string, bodies: readonly FriendsBuildActor[], economy?: (before?: FriendsBuildPiece, after?: Pick<FriendsBuildPiece, 'shape' | 'finish'>) => string | undefined): FriendsBuildResult {
    if(request.pose){request={...request,pose:resolveFriendsBuildPose({...request.pose,vehicleFrame:undefined},this.vehicleProvider())};}
    const result = (ok: boolean, message: string): FriendsBuildResult => ({ playerId: actor.id, requestId: request.requestId, ok, message, revision: this.revision });
    if (!Number.isSafeInteger(request.requestId) || request.requestId <= (this.consumed.get(actor.id) || 0)) return result(false, 'This edit was already handled.');
    this.consumed.set(actor.id, request.requestId);
    if (actor.lifeState !== 'alive') return result(false, 'Return to the valley to build.');
    if (request.action === 'permissions') {
      if (actor.id !== hostId || typeof request.allowed !== 'boolean') return result(false, 'Only the host can change building access.');
      this.guestsCanBuild = request.allowed; this.revision++; return result(true, request.allowed ? 'Friends can edit this world.' : 'Visitors can explore; only the host can edit.');
    }
    if (actor.id !== hostId && !this.guestsCanBuild) return result(false, 'The host needs to enable building for guests.');
    if (request.action === 'undo' || request.action === 'redo') {
      const from = request.action === 'undo' ? this.undo : this.redo, to = request.action === 'undo' ? this.redo : this.undo;
      const history = from.get(actor.id), edit = history?.at(-1); if (!edit) return result(false, 'There is no edit to reverse.');
      const current = edit.after && this.pieces.find(p => p.id === edit.after!.id);
      if ((edit.after && (!current || current.revision !== edit.after.revision)) || (!edit.after && edit.before && this.pieces.some(p => p.id === edit.before!.id))) return result(false, 'A friend changed this piece. Their edit is protected.');
      if (edit.before) {
        const issue = friendsPlacementError(this.getPieces(), edit.before.shape, edit.before, undefined, bodies, edit.after?.id, true, this.terrain,this.vehicleProvider());
        if (issue || (!current && this.pieces.length >= FRIENDS_BUILD_LIMIT)) return result(false, issue || 'The world piece budget is full.');
      }
      const economicIssue = economy?.(current, edit.before); if (economicIssue) return result(false, economicIssue);
      history!.pop(); if (current) this.pieces = this.pieces.filter(p => p.id !== current.id);
      this.revision++; const restored = edit.before ? { ...edit.before, revision: this.revision } : undefined;
      if (restored) this.pieces.push(restored);
      const reverse = { before: edit.after, after: restored };
      const stack = to.get(actor.id) || []; stack.push(reverse); to.set(actor.id, stack);
      return result(true, request.action === 'undo' ? 'Edit undone.' : 'Edit restored.');
    }
    let edit: Edit;
    if (request.action === 'place') {
      if (this.pieces.length >= FRIENDS_BUILD_LIMIT) return result(false, `World budget: ${FRIENDS_BUILD_LIMIT} pieces. Remove a piece to make room.`);
      if (!isFriendsFinish(request.finish)) return result(false, 'Choose a finish.');
      const issue = friendsPlacementError(this.getPieces(), request.shape, request.pose, actor, bodies, undefined, false, this.terrain,this.vehicleProvider()); if (issue) return result(false, issue);
      const economicIssue = economy?.(undefined, { shape: request.shape!, finish: request.finish! }); if (economicIssue) return result(false, economicIssue);
      const after: FriendsBuildPiece = { ...request.pose!, id: this.nextId++, shape: request.shape!, finish: request.finish, author: (actor.label || 'Friend').slice(0, 24), revision: ++this.revision };
      this.pieces.push(after); edit = { after };
    } else if (request.action === 'remove' || request.action === 'paint' || request.action === 'move') {
      const before = this.pieces.find(p => p.id === request.pieceId);
      if (!before || before.revision !== request.expectedRevision) return result(false, 'The piece changed. Aim at it again.');
      if (Math.hypot(resolveFriendsBuildPose(before,this.vehicleProvider()).x - actor.x, resolveFriendsBuildPose(before,this.vehicleProvider()).y - actor.y, resolveFriendsBuildPose(before,this.vehicleProvider()).z - actor.z) > FRIENDS_BUILD_REACH + 64) return result(false, 'Move closer to that piece.');
      if (request.action === 'paint' && !isFriendsFinish(request.finish)) return result(false, 'Choose a finish.');
      if (request.action === 'move') { const issue = friendsPlacementError(this.getPieces(), before.shape, request.pose, actor, bodies, before.id, false, this.terrain,this.vehicleProvider()); if (issue) return result(false, issue); }
      const economicIssue = economy?.(before, request.action === 'remove' ? undefined : { shape: before.shape, finish: request.action === 'paint' ? request.finish! : before.finish }); if (economicIssue) return result(false, economicIssue);
      this.revision++; this.pieces = this.pieces.filter(p => p.id !== before.id);
      const after = request.action === 'remove' ? undefined : { ...before, ...(request.action==='move'?{attachment:undefined,vehicleFrame:undefined}:{}), ...(request.action === 'move' ? request.pose : { finish: request.finish! }), revision: this.revision };
      if (after) this.pieces.push(after); edit = { before, after };
    } else return result(false, 'Unknown building action.');
    const history = this.undo.get(actor.id) || []; history.push(edit); if (history.length > 64) history.shift(); this.undo.set(actor.id, history); this.redo.delete(actor.id);
    return result(true, request.action === 'place' ? `${FRIENDS_BUILD_CATALOG[request.shape!].name} placed.` : request.action === 'paint' ? 'Finish applied.' : request.action === 'move' ? 'Piece moved.' : 'Piece removed.');
  }
}
