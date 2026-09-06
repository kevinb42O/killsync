import { GAME_HEIGHT, GAME_WIDTH } from '../../constants';

export type WorldDistrictId = 'signal_plaza' | 'neon_bazaar' | 'redline_foundry' | 'violet_archive' | 'storm_drain' | 'exfill_spire';

export interface WorldDistrict {
  id: WorldDistrictId;
  label: string;
  floorColor: number;
  buildingColor: number;
  emissiveColor: number;
  skyColor: number;
}

export interface WorldObstacle {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  elevation: number;
  district: WorldDistrictId;
  kind: 'tower' | 'arcade' | 'service_block' | 'transit_pylon' | 'bridge_pylon';
}

export interface WorldCollisionResult {
  collided: boolean;
  blockedX: boolean;
  blockedY: boolean;
}

export interface WorldWallContact {
  normalX: number;
  normalY: number;
}

export interface WorldRayHit {
  x: number;
  y: number;
  z: number;
  distance: number;
  obstacle: WorldObstacle;
}

export const WORLD_SECTOR_SIZE = 500;
const WORLD_CENTER_SECTOR_X = (Math.ceil(GAME_WIDTH / WORLD_SECTOR_SIZE) - 1) / 2;
const WORLD_CENTER_SECTOR_Y = (Math.ceil(GAME_HEIGHT / WORLD_SECTOR_SIZE) - 1) / 2;
const WORLD_EDGE_MARGIN = 620;

export interface WorldTransitLine {
  id: string;
  axis: 'x' | 'y';
  coordinate: number;
  start: number;
  end: number;
  elevation: number;
  color: number;
}

/** The lowest authored overhead surface must remain comfortably above the
 * highest legal first-person jump camera. Keep this shared with rendering and
 * the movement clearance regression test instead of scattering magic heights. */
export const WORLD_SKYBRIDGE_ELEVATION = 320;

// These routes deliberately span almost the full arena. They make the city
// feel larger than a collection of nearby blocks while their ground supports
// remain real collision objects.
export const WORLD_TRANSIT_LINES: WorldTransitLine[] = [
  { id: 'aurora-line', axis: 'x', coordinate: Math.round(GAME_HEIGHT * 0.56), start: WORLD_EDGE_MARGIN, end: GAME_WIDTH - WORLD_EDGE_MARGIN, elevation: 320, color: 0x38bdf8 },
  { id: 'violet-line', axis: 'y', coordinate: Math.round(GAME_WIDTH * 0.76), start: WORLD_EDGE_MARGIN, end: GAME_HEIGHT - WORLD_EDGE_MARGIN, elevation: 360, color: 0xc084fc },
];

export const WORLD_DISTRICTS: Record<WorldDistrictId, WorldDistrict> = {
  signal_plaza: { id: 'signal_plaza', label: 'SIGNAL PLAZA', floorColor: 0x10233a, buildingColor: 0x142d46, emissiveColor: 0x22d3ee, skyColor: 0x12355c },
  neon_bazaar: { id: 'neon_bazaar', label: 'NEON BAZAAR', floorColor: 0x17313b, buildingColor: 0x144052, emissiveColor: 0x2dd4bf, skyColor: 0x0f5258 },
  redline_foundry: { id: 'redline_foundry', label: 'REDLINE FOUNDRY', floorColor: 0x35191e, buildingColor: 0x4a2024, emissiveColor: 0xfb7185, skyColor: 0x581d28 },
  violet_archive: { id: 'violet_archive', label: 'VIOLET ARCHIVE', floorColor: 0x25183d, buildingColor: 0x34204f, emissiveColor: 0xc084fc, skyColor: 0x442060 },
  storm_drain: { id: 'storm_drain', label: 'STORM DRAIN', floorColor: 0x102d35, buildingColor: 0x153f48, emissiveColor: 0x38bdf8, skyColor: 0x174660 },
  exfill_spire: { id: 'exfill_spire', label: 'EXFILL SPIRE', floorColor: 0x3a2c12, buildingColor: 0x4b3813, emissiveColor: 0xfbbf24, skyColor: 0x604111 },
};

const districts: WorldDistrictId[] = ['signal_plaza', 'neon_bazaar', 'redline_foundry', 'violet_archive', 'storm_drain', 'exfill_spire'];
let cachedObstacles: WorldObstacle[] | null = null;
const obstacleBuckets = new Map<string, WorldObstacle[]>();

function sectorKey(sx: number, sy: number) {
  return `${sx}:${sy}`;
}

function hash2D(x: number, y: number) {
  let value = Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return (value ^ (value >>> 16)) >>> 0;
}

export function getWorldDistrictAt(x: number, y: number): WorldDistrict {
  const sx = Math.max(0, Math.min(Math.floor(x / WORLD_SECTOR_SIZE), Math.ceil(GAME_WIDTH / WORLD_SECTOR_SIZE) - 1));
  const sy = Math.max(0, Math.min(Math.floor(y / WORLD_SECTOR_SIZE), Math.ceil(GAME_HEIGHT / WORLD_SECTOR_SIZE) - 1));
  // The centre remains legible and calm; outer sectors progressively vary.
  const ring = Math.max(Math.abs(sx - WORLD_CENTER_SECTOR_X), Math.abs(sy - WORLD_CENTER_SECTOR_Y));
  const index = ring < 1 ? 0 : (hash2D(sx, sy) + sx + sy * 3) % districts.length;
  return WORLD_DISTRICTS[districts[index]];
}

/** Buildings are deliberately placed beside broad 180-unit combat corridors.
 * Their exact AABBs are the authoritative collision source for both Engine
 * and Three.js—there are no visual-only solid props. */
export function getWorldObstacles(): WorldObstacle[] {
  if (cachedObstacles) return cachedObstacles;
  const result: WorldObstacle[] = [];
  const sectorsX = Math.ceil(GAME_WIDTH / WORLD_SECTOR_SIZE);
  const sectorsY = Math.ceil(GAME_HEIGHT / WORLD_SECTOR_SIZE);

  for (let sy = 0; sy < sectorsY; sy++) {
    for (let sx = 0; sx < sectorsX; sx++) {
      // Keep Signal Plaza completely open for onboarding and boss readability.
      if (Math.abs(sx - WORLD_CENTER_SECTOR_X) <= 0.5 && Math.abs(sy - WORLD_CENTER_SECTOR_Y) <= 0.5) continue;
      const random = hash2D(sx, sy);
      // Most sectors stay open. A city should be a sequence of landmarks and
      // lanes, not a continuous wall of procedural buildings.
      if ((random & 1) === 0) continue;
      const district = getWorldDistrictAt((sx + 0.5) * WORLD_SECTOR_SIZE, (sy + 0.5) * WORLD_SECTOR_SIZE).id;
      const baseX = sx * WORLD_SECTOR_SIZE;
      const baseY = sy * WORLD_SECTOR_SIZE;
      const westSide = (random & 1) === 0;
      const firstWidth = 66 + (random % 42);
      const firstHeight = 160 + ((random >>> 8) % 110);
      result.push({
        id: `building:${sx}:${sy}:a`,
        x: baseX + (westSide ? 44 : WORLD_SECTOR_SIZE - firstWidth - 44),
        y: baseY + 48 + ((random >>> 16) % 72),
        width: firstWidth,
        height: firstHeight,
        elevation: 105 + ((random >>> 4) % 220),
        district,
        kind: (random % 3 === 0 ? 'tower' : 'arcade'),
      });
      if ((random % 5) === 1) {
        const secondWidth = 120 + ((random >>> 10) % 86);
        const secondHeight = 52 + ((random >>> 18) % 40);
        result.push({
          id: `building:${sx}:${sy}:b`,
          x: baseX + 150 + ((random >>> 22) % 125),
          y: baseY + WORLD_SECTOR_SIZE - secondHeight - 52,
          width: secondWidth,
          height: secondHeight,
          elevation: 48 + ((random >>> 6) % 80),
          district,
          kind: 'service_block',
        });
      }
    }
  }

  for (const line of WORLD_TRANSIT_LINES) {
    for (let distance = line.start + 240; distance < line.end; distance += 720) {
      const x = line.axis === 'x' ? distance : line.coordinate;
      const y = line.axis === 'x' ? line.coordinate : distance;
      result.push({
        id: `${line.id}:pylon:${distance}`,
        x: x - 22,
        y: y - 22,
        width: 44,
        height: 44,
        elevation: line.elevation,
        district: getWorldDistrictAt(x, y).id,
        kind: 'transit_pylon',
      });
    }
  }

  // One shorter pedestrian bridge frames the central horizon. Only its two
  // foundation pylons are solid; the bridge deck remains safely overhead.
  for (const x of [Math.round(GAME_WIDTH * 0.2), Math.round(GAME_WIDTH * 0.8)]) {
    result.push({
      id: `skybridge:pylon:${x}`,
      x: x - 28,
      y: GAME_HEIGHT / 2 - 28,
      width: 56,
      height: 56,
      elevation: WORLD_SKYBRIDGE_ELEVATION,
      district: getWorldDistrictAt(x, GAME_HEIGHT / 2).id,
      kind: 'bridge_pylon',
    });
  }

  cachedObstacles = result;
  obstacleBuckets.clear();
  for (const obstacle of result) {
    const minX = Math.floor(obstacle.x / WORLD_SECTOR_SIZE);
    const maxX = Math.floor((obstacle.x + obstacle.width) / WORLD_SECTOR_SIZE);
    const minY = Math.floor(obstacle.y / WORLD_SECTOR_SIZE);
    const maxY = Math.floor((obstacle.y + obstacle.height) / WORLD_SECTOR_SIZE);
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const key = sectorKey(x, y);
        const bucket = obstacleBuckets.get(key) || [];
        bucket.push(obstacle);
        obstacleBuckets.set(key, bucket);
      }
    }
  }
  return result;
}

export function getNearbyWorldObstacles(x: number, y: number, radius: number): WorldObstacle[] {
  getWorldObstacles();
  const minX = Math.floor((x - radius) / WORLD_SECTOR_SIZE);
  const maxX = Math.floor((x + radius) / WORLD_SECTOR_SIZE);
  const minY = Math.floor((y - radius) / WORLD_SECTOR_SIZE);
  const maxY = Math.floor((y + radius) / WORLD_SECTOR_SIZE);
  const nearby = new Set<WorldObstacle>();
  for (let sy = minY; sy <= maxY; sy++) {
    for (let sx = minX; sx <= maxX; sx++) {
      for (const obstacle of obstacleBuckets.get(sectorKey(sx, sy)) || []) nearby.add(obstacle);
    }
  }
  return [...nearby];
}

export function isWorldPositionClear(x: number, y: number, radius: number): boolean {
  return !getNearbyWorldObstacles(x, y, radius + 4).some((obstacle) =>
    x + radius > obstacle.x && x - radius < obstacle.x + obstacle.width
    && y + radius > obstacle.y && y - radius < obstacle.y + obstacle.height
  );
}

/** Returns the outward normal of a nearby solid surface without moving the
 * body. Unlike collision resolution, this remains true at resting contact, so
 * a player can jump away from a wall without continuing to press into it. */
export function getWorldWallContact(x: number, y: number, radius: number, tolerance = 3): WorldWallContact | undefined {
  let nearest: WorldWallContact | undefined;
  let nearestDistance = Infinity;
  for (const obstacle of getNearbyWorldObstacles(x, y, radius + tolerance + 4)) {
    const nearestX = Math.max(obstacle.x, Math.min(x, obstacle.x + obstacle.width));
    const nearestY = Math.max(obstacle.y, Math.min(y, obstacle.y + obstacle.height));
    const dx = x - nearestX, dy = y - nearestY;
    const distance = Math.hypot(dx, dy);
    if (distance > radius + tolerance || distance >= nearestDistance) continue;
    if (distance > .0001) {
      nearest = { normalX: dx / distance, normalY: dy / distance };
    } else {
      const sides = [
        { distance: Math.abs(x - obstacle.x), normalX: -1, normalY: 0 },
        { distance: Math.abs(obstacle.x + obstacle.width - x), normalX: 1, normalY: 0 },
        { distance: Math.abs(y - obstacle.y), normalX: 0, normalY: -1 },
        { distance: Math.abs(obstacle.y + obstacle.height - y), normalX: 0, normalY: 1 },
      ];
      nearest = sides.reduce((best, side) => side.distance < best.distance ? side : best);
    }
    nearestDistance = distance;
  }
  return nearest;
}

/** Returns the first solid city obstacle struck by a sightline. Distances are
 * measured across the ground plane, matching the simulation's x/y space, and
 * verticalSlope is the change in elevation per unit of horizontal travel. */
export function raycastWorldObstacles(
  originX: number,
  originY: number,
  originZ: number,
  directionX: number,
  directionY: number,
  verticalSlope: number,
  maxDistance: number,
): WorldRayHit | undefined {
  const directionLength = Math.hypot(directionX, directionY);
  if (directionLength < .0001 || maxDistance <= 0) return undefined;
  const dx = directionX / directionLength;
  const dy = directionY / directionLength;
  const centerX = originX + dx * maxDistance * .5;
  const centerY = originY + dy * maxDistance * .5;
  let nearest: WorldRayHit | undefined;

  for (const obstacle of getNearbyWorldObstacles(centerX, centerY, maxDistance * .5 + 8)) {
    const xInterval = raySlabInterval(originX, dx, obstacle.x, obstacle.x + obstacle.width);
    const yInterval = raySlabInterval(originY, dy, obstacle.y, obstacle.y + obstacle.height);
    if (!xInterval || !yInterval) continue;
    const entry = Math.max(0, xInterval[0], yInterval[0]);
    const exit = Math.min(maxDistance, xInterval[1], yInterval[1]);
    if (entry > exit || entry >= (nearest?.distance ?? Infinity)) continue;

    const entryZ = originZ + verticalSlope * entry;
    let distance: number | undefined;
    if (entryZ >= 0 && entryZ <= obstacle.elevation) {
      distance = entry;
    } else if (verticalSlope < 0 && entryZ > obstacle.elevation) {
      const roofDistance = (obstacle.elevation - originZ) / verticalSlope;
      if (roofDistance >= entry && roofDistance <= exit) distance = roofDistance;
    }
    if (distance === undefined || distance >= (nearest?.distance ?? Infinity)) continue;
    nearest = {
      x: originX + dx * distance,
      y: originY + dy * distance,
      z: Math.max(0, Math.min(obstacle.elevation, originZ + verticalSlope * distance)),
      distance,
      obstacle,
    };
  }
  return nearest;
}

function raySlabInterval(origin: number, direction: number, minimum: number, maximum: number): [number, number] | undefined {
  if (Math.abs(direction) < .000001) return origin >= minimum && origin <= maximum ? [-Infinity, Infinity] : undefined;
  const first = (minimum - origin) / direction;
  const second = (maximum - origin) / direction;
  return first < second ? [first, second] : [second, first];
}

export function resolveWorldCollisions(
  position: { x: number; y: number },
  radius: number,
  clampToWorld = true,
): WorldCollisionResult {
  let collided = false;
  let blockedX = false;
  let blockedY = false;
  // Two iterations resolve a corner cleanly without a per-frame physics cost.
  for (let pass = 0; pass < 2; pass++) {
    let resolvedSomething = false;
    for (const obstacle of getNearbyWorldObstacles(position.x, position.y, radius + 20)) {
      const nearestX = Math.max(obstacle.x, Math.min(position.x, obstacle.x + obstacle.width));
      const nearestY = Math.max(obstacle.y, Math.min(position.y, obstacle.y + obstacle.height));
      let dx = position.x - nearestX;
      let dy = position.y - nearestY;
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq >= radius * radius) continue;
      collided = true;
      resolvedSomething = true;
      if (distanceSq > 0.0001) {
        const distance = Math.sqrt(distanceSq);
        const push = radius - distance + 0.05;
        position.x += (dx / distance) * push;
        position.y += (dy / distance) * push;
        blockedX ||= Math.abs(dx) >= Math.abs(dy) * 0.6;
        blockedY ||= Math.abs(dy) >= Math.abs(dx) * 0.6;
      } else {
        const left = Math.abs(position.x - obstacle.x);
        const right = Math.abs(obstacle.x + obstacle.width - position.x);
        const top = Math.abs(position.y - obstacle.y);
        const bottom = Math.abs(obstacle.y + obstacle.height - position.y);
        const min = Math.min(left, right, top, bottom);
        if (min === left) { position.x = obstacle.x - radius - 0.05; blockedX = true; }
        else if (min === right) { position.x = obstacle.x + obstacle.width + radius + 0.05; blockedX = true; }
        else if (min === top) { position.y = obstacle.y - radius - 0.05; blockedY = true; }
        else { position.y = obstacle.y + obstacle.height + radius + 0.05; blockedY = true; }
      }
    }
    if (!resolvedSomething) break;
  }
  if (clampToWorld) {
    position.x = Math.max(radius, Math.min(GAME_WIDTH - radius, position.x));
    position.y = Math.max(radius, Math.min(GAME_HEIGHT - radius, position.y));
  }
  return { collided, blockedX, blockedY };
}
