import { CAVE_ROOMS, CAVE_TREASURES } from './world/FriendsCave';
import { ISLAND_LAKES, ISLAND_SEA_LEVEL, ISLAND_VOLCANO, islandLakeRadius, islandSurfaceBiome, islandCoastDistance } from './world/FriendsIsland';
import { baseTerrainHeight } from './world/FriendsTerrain';
import type { FriendsSnapshot } from './multiplayer/FriendsExpedition';
import type { PhysicalCargo } from './multiplayer/FriendsHauling';
import { cargoBounds } from './multiplayer/FriendsCargoPose';
import { craneCargoAnchor, craneOutlet, CRANE_SPEED } from './multiplayer/FriendsCrane';
import type { FriendsCue, SurfaceCue } from './FriendsAudio';

export type SoundPoint = { x: number; y: number; z: number };
export type SpatialSound = { volume: number; pan: number; rate?: number; cutoff?: number };
export type WorldLoop = 'caveAir' | 'waterfall' | 'lava' | 'volcano' | 'reel';
export type WorldSoundMix = Record<WorldLoop, SpatialSound> & {
  drip: SpatialSound; dripSource?: string; steam: SpatialSound; reflection: number; reflectionDelay: number;
};
export type FriendsSoundEvent = { cue: FriendsCue | 'treasure'; volume: number; pan: number; rate?: number };
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const smooth = (n: number) => { const t = clamp(n); return t * t * (3 - 2 * t); };
export const SILENT_SPATIAL: SpatialSound = { volume: 0, pan: 0 };
export const QUIET_WORLD_SOUND: WorldSoundMix = {
  caveAir: SILENT_SPATIAL, waterfall: SILENT_SPATIAL, lava: SILENT_SPATIAL,
  volcano: SILENT_SPATIAL, reel: SILENT_SPATIAL, drip: SILENT_SPATIAL, steam: SILENT_SPATIAL,
  reflection: 0, reflectionDelay: .08,
};

export function spatialSound(source: SoundPoint, listener: SoundPoint, yaw: number, range: number, volume: number): SpatialSound {
  const dx = source.x - listener.x, dy = source.y - listener.y;
  return { volume: volume * smooth(1 - Math.hypot(dx, dy, source.z - listener.z) / range),
    pan: Math.sin(Math.atan2(dy, dx) - yaw) * .85 };
}
// The same winding paths and molten breach used by FriendsIslandVisuals.
const FALL_POINTS = [6464, 7360].flatMap(startX => Array.from({ length: 13 }, (_, i) => {
  const t = i / 12, y = 18976 + t * 1312, x = startX + Math.sin(t * Math.PI) * 96 + Math.sin(t * 8) * 40;
  return { x, y, z: baseTerrainHeight(x, y) + 18 };
}));
const LAVA_POINTS = [{ x: ISLAND_VOLCANO.x, y: ISLAND_VOLCANO.y, z: ISLAND_VOLCANO.lavaLevel },
  ...Array.from({ length: 12 }, (_, i) => {
    const t = i / 11, r = 700 + t * 2800, a = 1.05 + .045 * Math.sin(t * 8) + .025 * Math.sin(t * 17);
    const x = ISLAND_VOLCANO.x + Math.cos(a) * r, y = ISLAND_VOLCANO.y + Math.sin(a) * r;
    return { x, y, z: baseTerrainHeight(x, y) + 18 };
  })];
const WET_ROOMS = CAVE_ROOMS.filter(r => ['blue', 'well', 'roots', 'deep-1-2', 'deep-2-4', 'deep-3-1', 'deep-4-3'].includes(r.id));
function nearest<T extends SoundPoint>(points: readonly T[], p: SoundPoint): T {
  return points.reduce((a, b) => Math.hypot(a.x-p.x,a.y-p.y,a.z-p.z) < Math.hypot(b.x-p.x,b.y-p.y,b.z-p.z) ? a : b);
}
/** Bounded geometry checks at 2 Hz. Visibility uses the actual edited terrain. */
export function friendsWorldSound(listener: SoundPoint, yaw: number, underground: boolean,
  clear: (a: SoundPoint, b: SoundPoint) => boolean = () => true): WorldSoundMix {
  const mix = { ...QUIET_WORLD_SOUND };
  if (underground) {
    const room = CAVE_ROOMS.find(r => listener.z >= r.floor - 32 && listener.z < r.roof
      && Math.hypot((listener.x-r.x)/r.rx,(listener.y-r.y)/r.ry) < 1);
    mix.reflection = room ? .14 : .07;
    mix.reflectionDelay = room ? Math.min(.23, Math.max(.10, (room.rx + room.ry) / 6500)) : .065;
    mix.caveAir = { volume: room ? .13 : .075, pan: .15 * Math.sin(yaw), cutoff: 2400 };
    const wet = WET_ROOMS.filter(r => listener.z >= r.floor - 32 && listener.z < r.roof);
    if (wet.length) {
      const drip = nearest(wet.map(r => ({ id:r.id, x:r.x+r.rx*.3, y:r.y-r.ry*.2, z:r.floor+48 })), listener);
      if (clear(listener, drip)) { mix.drip = spatialSound(drip, listener, yaw, 650, .12); mix.dripSource = drip.id; }
    }
    return mix;
  }
  const falls = nearest(FALL_POINTS, listener), fall = spatialSound(falls, listener, yaw, 3200, .4);
  if (fall.volume > .001) {
    const visible = clear({ ...listener, z:listener.z+40 }, { ...falls, z:falls.z+40 });
    mix.waterfall = { ...fall, volume:fall.volume*(visible?1:.28), cutoff:visible?9000:1200 };
  }
  const lava = nearest(LAVA_POINTS, listener);
  const hot = spatialSound(lava, listener, yaw, 1300, .24);
  if (hot.volume > .001 && clear({ ...listener, z:listener.z+40 }, { ...lava, z:lava.z+40 })) {
    mix.lava = hot; mix.steam = { ...hot, volume:hot.volume*.5 };
  }
  mix.volcano = spatialSound(LAVA_POINTS[0], listener, yaw, 4700, .085);
  return mix;
}

/** A built floor always wins over the biome beneath a bridge or deck. */
export function friendsSurfaceSound(point: SoundPoint, supported?: 'wood' | 'hard' | 'soil', underground = false, material?: number): SurfaceCue {
  if (supported === 'wood') return 'woodStep';
  if (supported === 'hard' || underground) return 'stoneStep';
  if (supported === 'soil') return 'grass';
  const water = Math.max(islandCoastDistance(point.x, point.y) < 80 ? ISLAND_SEA_LEVEL : -Infinity, ...ISLAND_LAKES.filter(l => islandLakeRadius(point.x,point.y,l) <= 1).map(l => l.level));
  if (point.z < water+3 && point.z > water-160) return 'waterStep';
  const biome = islandSurfaceBiome(point.x,point.y,point.z);
  if (material && material !== 1 && (biome !== 'snow' || point.z < baseTerrainHeight(point.x,point.y)-32)) return 'stoneStep';
  return biome === 'mud' ? 'mudStep' : biome === 'snow' ? 'snow' : ['stone','ice','basalt','lava'].includes(biome) ? 'stoneStep' : 'grass';
}

/** Observe confirmed snapshots; joins, replay, teleports and save loads are silent. */
export class FriendsInteractionSound {
  private previous?: FriendsSnapshot;
  private previousAt = -Infinity;
  private nextCreak = 0;
  private nextRatchet = 0;
  private cargoCooldown = new Map<string, number>();
  private motor: SpatialSound = SILENT_SPATIAL;
  sample(friends: FriendsSnapshot, listener: SoundPoint & { id: string }, at: number, yaw: number,
    contact: (cargo: PhysicalCargo) => { floor: number; wood: boolean } | undefined, reset = false) {
    const events: FriendsSoundEvent[] = [], old = this.previous, dt = (at-this.previousAt)/1000;
    if (dt === 0 && !reset) return { motor:this.motor, events };
    this.previous = friends; this.previousAt = at; this.motor = SILENT_SPATIAL;
    if (reset || !old || dt <= 0 || dt > 1.5) {
      this.nextCreak = this.nextRatchet = at; this.cargoCooldown.clear();
      return { motor:this.motor, events };
    }
    for (const [id, until] of this.cargoCooldown) if (at >= until) this.cargoCooldown.delete(id);
    const rope = friends.hauling?.ropes.find(r => r.id === listener.id), previousRope = old.hauling?.ropes.find(r => r.id === listener.id);
    if (rope?.cargoId !== previousRope?.cargoId) events.push({ cue:'ropeHook', volume:.18, pan:0, rate:rope?1:.85 });
    if (rope && previousRope && rope.cargoId === previousRope.cargoId) {
      const change = rope.length-previousRope.length;
      const speed = change / dt;
      if (!rope.blocked && speed < -2) this.motor = { volume:.11+.07*clamp(rope.tension), pan:0, rate:.85+.2*clamp(-speed/100) };
      if (!rope.blocked && speed > 2 && at >= this.nextRatchet) {
        events.push({cue:'reelRatchet',volume:.1,pan:0}); this.nextRatchet = at+700;
      }
      if (rope.tension > .3 && at >= this.nextCreak) {
        events.push({cue:'ropeCreak',volume:.06+.14*clamp(rope.tension),pan:0,rate:.9}); this.nextCreak=at+3500;
      }
    }
    for (const crane of friends.hauling?.cranes || []) {
      const before = old.hauling?.cranes?.find(c => c.pieceId === crane.pieceId);
      if (!before) continue;
      const outlet = craneOutlet(crane);
      if (crane.cargoId !== before.cargoId) {
        const load = friends.hauling?.cargo.find(c=>c.id===(crane.cargoId??before.cargoId));
        const hook = load ? craneCargoAnchor(load, crane.cargoId ? crane : before) : {...outlet,z:outlet.z-crane.length};
        const click = spatialSound(hook, listener, yaw, 550, .18);
        if (click.volume > .003) events.push({cue:'ropeHook',...click,rate:crane.cargoId?1:.85});
      }
      const sound = spatialSound(outlet, listener, yaw, 1000, .22);
      if (sound.volume <= .003) continue;
      const speed = Math.abs(crane.length-before.length) / dt;
      // Winch audio comes from the actual outlet, in both cable directions.
      // Angular boom motion alone does not reel cable; distance per second
      // keeps high-refresh interpolation from falling below a frame threshold.
      const winching = speed > 2 && speed < CRANE_SPEED * 3 && crane.hasWinch !== false;
      if (!crane.blocked && winching && sound.volume > this.motor.volume)
        this.motor = {...sound,rate:.88+.16*clamp(speed/CRANE_SPEED)};
    }
    // Shared treasure progress is append-only. Idle frames need no set/allocation.
    if (friends.progress.openedTreasures.length > old.progress.openedTreasures.length) {
      const previousOpened = new Set(old.progress.openedTreasures);
      for (const id of friends.progress.openedTreasures) if (!previousOpened.has(id)) {
        const chest = CAVE_TREASURES.find(t => t.id === id);
        if (chest) {
          const sound = spatialSound(chest,listener,yaw,550,.34);
          if (sound.volume > .005) events.push({cue:'treasure',...sound});
        }
      }
    }
    for (const cargo of friends.hauling?.cargo || []) {
      const before = old.hauling?.cargo.find(c => c.id === cargo.id);
      if (!before || cargo.secured || before.secured || at < (this.cargoCooldown.get(cargo.id) ?? 0)) continue;
      // Reject transport/reset discontinuities and require an actual floor contact.
      if (Math.hypot(cargo.x-before.x,cargo.y-before.y,cargo.z-before.z) > 800*dt+64) continue;
      if (before.vz >= -32 || cargo.vz < -16 || cargo.vz-before.vz < 24) continue;
      const surface = contact(cargo);
      if (!surface || Math.abs(cargoBounds(cargo).minZ-surface.floor) > 12) continue;
      const sound = spatialSound(cargo,listener,yaw,750,.3*clamp(-before.vz/180));
      if (sound.volume > .005) { events.push({cue:surface.wood?'cargoWood':'cargoStone',...sound}); this.cargoCooldown.set(cargo.id,at+800); }
    }
    return { motor:this.motor, events };
  }
}
