import { GAME_HEIGHT, GAME_WIDTH } from '../../constants';

export const WORLD_IDS = ['neon_bastion', 'cinderworks', 'white_silence', 'null_garden'] as const;
export type WorldId = typeof WORLD_IDS[number];
export type WorldSurfaceKind = 'solid' | 'burning' | 'thin_ice' | 'energy' | 'void';

export interface WorldBounds { width: number; height: number; }
export interface WorldPoint { x: number; y: number; }
export interface WorldSurfaceSample {
  kind: WorldSurfaceKind;
  walkable: boolean;
  damagePerSecond: number;
  /** Grounded traversal identity shared by host movement and prediction. */
  movementMultiplier: number;
  jetRechargeMultiplier: number;
}
export interface WorldDifficultyProfile {
  threatMultiplier: number;
  healthMultiplier: number;
  damageMultiplier: number;
  rewardMultiplier: number;
}
export interface WorldInsertionPackage {
  minimumWeaponLevel: number;
  credits: number;
  armorTier: number;
}
export interface WorldVisualTheme {
  clearColor: number;
  fogColor: number;
  zenithColor: number;
  horizonColor: number;
  underglowColor: number;
  groundColor: number;
  accentColor: number;
  dangerColor: number;
  ambientColor: number;
  sunColor: number;
}
export interface WorldDefinition {
  id: WorldId;
  tier: number;
  name: string;
  subtitle: string;
  description: string;
  bounds: WorldBounds;
  bridgehead: WorldPoint;
  difficulty: WorldDifficultyProfile;
  insertion: WorldInsertionPackage;
  theme: WorldVisualTheme;
  movementGravity: number;
}

const bounds = Object.freeze({ width: GAME_WIDTH, height: GAME_HEIGHT });

export const WORLD_DEFINITIONS: Readonly<Record<WorldId, WorldDefinition>> = Object.freeze({
  neon_bastion: {
    id: 'neon_bastion', tier: 1, name: 'NEON BASTION', subtitle: 'THE LAST SIGNAL CITY',
    description: 'A stable cyber-city suspended above the storm void.', bounds,
    bridgehead: { x: GAME_WIDTH - 250, y: GAME_HEIGHT / 2 },
    difficulty: { threatMultiplier: 1, healthMultiplier: 1, damageMultiplier: 1, rewardMultiplier: 1 },
    insertion: { minimumWeaponLevel: 1, credits: 0, armorTier: 0 }, movementGravity: 1550,
    theme: { clearColor: 0x081329, fogColor: 0x12355c, zenithColor: 0x0b1640, horizonColor: 0x2a6b99, underglowColor: 0x6b2458, groundColor: 0x09182c, accentColor: 0x22d3ee, dangerColor: 0xfbbf24, ambientColor: 0x6ea8d7, sunColor: 0x9ae8ff },
  },
  cinderworks: {
    id: 'cinderworks', tier: 2, name: 'CINDERWORKS', subtitle: 'THE WORLD-FORGE',
    description: 'Shattered foundry plates drift over an ocean of living magma.', bounds,
    bridgehead: { x: GAME_WIDTH - 420, y: GAME_HEIGHT / 2 },
    difficulty: { threatMultiplier: 1.14, healthMultiplier: 1.18, damageMultiplier: 1.1, rewardMultiplier: 1.32 },
    insertion: { minimumWeaponLevel: 2, credits: 260, armorTier: 1 }, movementGravity: 1550,
    theme: { clearColor: 0x170804, fogColor: 0x5b1b0b, zenithColor: 0x1b0704, horizonColor: 0xa52b0b, underglowColor: 0xff5a0a, groundColor: 0x211510, accentColor: 0xff8a1f, dangerColor: 0xff3b0a, ambientColor: 0xff7a38, sunColor: 0xffc06a },
  },
  white_silence: {
    id: 'white_silence', tier: 3, name: 'WHITE SILENCE', subtitle: 'THE CRYOGENIC MOON',
    description: 'A fractured ice shelf beneath an aurora and a ringed planet.', bounds,
    bridgehead: { x: GAME_WIDTH - 720, y: GAME_HEIGHT / 2 },
    difficulty: { threatMultiplier: 1.27, healthMultiplier: 1.38, damageMultiplier: 1.2, rewardMultiplier: 1.68 },
    insertion: { minimumWeaponLevel: 3, credits: 520, armorTier: 1 }, movementGravity: 1420,
    theme: { clearColor: 0x020712, fogColor: 0x28546b, zenithColor: 0x01030a, horizonColor: 0x386f86, underglowColor: 0x071a32, groundColor: 0x24495d, accentColor: 0x67e8f9, dangerColor: 0x38bdf8, ambientColor: 0x72a9bd, sunColor: 0xc8f4ff },
  },
  null_garden: {
    id: 'null_garden', tier: 4, name: 'NULL GARDEN', subtitle: 'BEYOND THE ECLIPSE',
    description: 'Alien islands and luminous roots suspended inside a broken nebula.', bounds,
    bridgehead: { x: GAME_WIDTH - 1_050, y: GAME_HEIGHT / 2 },
    difficulty: { threatMultiplier: 1.42, healthMultiplier: 1.64, damageMultiplier: 1.3, rewardMultiplier: 2.15 },
    insertion: { minimumWeaponLevel: 4, credits: 840, armorTier: 2 }, movementGravity: 1050,
    theme: { clearColor: 0x05020d, fogColor: 0x29134a, zenithColor: 0x020106, horizonColor: 0x3d1762, underglowColor: 0x12052a, groundColor: 0x171024, accentColor: 0xd8b4fe, dangerColor: 0xff4fd8, ambientColor: 0xb794f6, sunColor: 0xffe7a3 },
  },
});

export function normalizeWorldId(value: unknown): WorldId {
  return typeof value === 'string' && (WORLD_IDS as readonly string[]).includes(value) ? value as WorldId : 'neon_bastion';
}

export function getWorldDefinition(worldId: WorldId = 'neon_bastion') { return WORLD_DEFINITIONS[normalizeWorldId(worldId)]; }
export function nextWorldId(worldId: WorldId): WorldId | undefined { return WORLD_IDS[WORLD_IDS.indexOf(worldId) + 1]; }
export function higherWorldIds(worldId: WorldId) { const tier = getWorldDefinition(worldId).tier; return WORLD_IDS.filter(id => getWorldDefinition(id).tier > tier); }

/** Authoritative analytic surface map. Rendering consumes the same shapes, so
 * a visible hole can never secretly be solid and a visible plate can never be
 * an unannounced death volume. Keep samples allocation-free: movement, spawn
 * placement and AI call this in hot paths. */
export function sampleWorldSurface(worldId: WorldId, x: number, y: number): WorldSurfaceSample {
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > GAME_WIDTH || y > GAME_HEIGHT) return VOID;
  if (worldId === 'neon_bastion') return SOLID;
  if (worldId === 'cinderworks') return sampleCinderworks(x, y);
  if (worldId === 'white_silence') return sampleWhiteSilence(x, y);
  return sampleNullGarden(x, y);
}

export function isWorldSurfaceWalkable(worldId: WorldId, x: number, y: number, radius = 0) {
  if (!sampleWorldSurface(worldId, x, y).walkable) return false;
  if (radius <= 0) return true;
  const diagonal = radius * .72;
  return sampleWorldSurface(worldId, x + radius, y).walkable
    && sampleWorldSurface(worldId, x - radius, y).walkable
    && sampleWorldSurface(worldId, x, y + radius).walkable
    && sampleWorldSurface(worldId, x, y - radius).walkable
    && sampleWorldSurface(worldId, x + diagonal, y + diagonal).walkable
    && sampleWorldSurface(worldId, x - diagonal, y + diagonal).walkable
    && sampleWorldSurface(worldId, x + diagonal, y - diagonal).walkable
    && sampleWorldSurface(worldId, x - diagonal, y - diagonal).walkable;
}

const SOLID: WorldSurfaceSample = Object.freeze({ kind: 'solid', walkable: true, damagePerSecond: 0, movementMultiplier: 1, jetRechargeMultiplier: 1 });
const BURNING: WorldSurfaceSample = Object.freeze({ kind: 'burning', walkable: true, damagePerSecond: 18, movementMultiplier: .9, jetRechargeMultiplier: .7 });
const THIN_ICE: WorldSurfaceSample = Object.freeze({ kind: 'thin_ice', walkable: true, damagePerSecond: 0, movementMultiplier: 1.2, jetRechargeMultiplier: .8 });
const ENERGY: WorldSurfaceSample = Object.freeze({ kind: 'energy', walkable: true, damagePerSecond: 0, movementMultiplier: 1.26, jetRechargeMultiplier: 2.4 });
const VOID: WorldSurfaceSample = Object.freeze({ kind: 'void', walkable: false, damagePerSecond: 0, movementMultiplier: 1, jetRechargeMultiplier: 1 });

function insideEllipse(x: number, y: number, cx: number, cy: number, rx: number, ry: number) {
  const dx = (x - cx) / rx, dy = (y - cy) / ry;
  return dx * dx + dy * dy <= 1;
}
function insideRect(x: number, y: number, cx: number, cy: number, width: number, height: number) {
  return Math.abs(x - cx) <= width * .5 && Math.abs(y - cy) <= height * .5;
}

function sampleCinderworks(x: number, y: number): WorldSurfaceSample {
  // The forge remains one navigable landmass, but huge elliptical fractures
  // break its silhouette without creating unavoidable one-way choke points.
  if (x < 180 || y < 180 || x > GAME_WIDTH - 180 || y > GAME_HEIGHT - 180) return VOID;
  const holes = insideEllipse(x, y, 2_000, 2_150, 720, 1_050)
    || insideEllipse(x, y, 4_650, 8_850, 1_050, 690)
    || insideEllipse(x, y, 8_650, 2_900, 910, 760)
    || insideEllipse(x, y, 9_850, 8_950, 760, 1_100)
    || insideEllipse(x, y, 6_250, 3_850, 520, 1_050);
  if (holes) return VOID;
  const lava = insideRect(x, y, 3_050, 6_150, 760, 2_450)
    || insideEllipse(x, y, 7_850, 7_450, 650, 1_250)
    || insideRect(x, y, 8_850, 5_100, 1_800, 430);
  return lava ? BURNING : SOLID;
}

function sampleWhiteSilence(x: number, y: number): WorldSurfaceSample {
  // A broad, irregular ice shelf. The lobes overlap so ordinary enemies never
  // need expensive per-unit global pathfinding to reach the squad.
  const shelf = insideEllipse(x, y, 6_000, 6_000, 5_280, 4_880)
    || insideEllipse(x, y, 3_000, 6_200, 2_250, 2_850)
    || insideEllipse(x, y, 9_050, 5_750, 2_100, 3_050);
  if (!shelf) return VOID;
  const crevasse = insideEllipse(x, y, 2_900, 3_150, 390, 1_180)
    || insideEllipse(x, y, 4_450, 8_300, 1_250, 310)
    || insideEllipse(x, y, 7_900, 3_150, 1_280, 330)
    || insideEllipse(x, y, 9_350, 8_450, 420, 1_180);
  if (crevasse) return VOID;
  const thin = insideEllipse(x, y, 3_850, 5_650, 880, 650)
    || insideEllipse(x, y, 7_000, 7_700, 1_080, 620)
    || insideEllipse(x, y, 8_550, 5_250, 700, 980);
  return thin ? THIN_ICE : SOLID;
}

function sampleNullGarden(x: number, y: number): WorldSurfaceSample {
  // Five organic islands joined by wide energy causeways. This produces a
  // radically different archipelago while retaining several combat-width
  // routes and a connected navigation graph.
  const main = insideEllipse(x, y, 6_000, 6_000, 2_620, 2_350);
  const west = insideEllipse(x, y, 2_200, 6_150, 1_650, 1_850);
  const east = insideEllipse(x, y, 9_850, 5_850, 1_600, 1_900);
  const north = insideEllipse(x, y, 6_100, 2_050, 1_850, 1_450);
  const south = insideEllipse(x, y, 5_850, 9_850, 1_900, 1_480);
  if (main || west || east || north || south) return SOLID;
  const horizontal = insideRect(x, y, 6_000, 6_000, 7_100, 620);
  const vertical = insideRect(x, y, 6_000, 6_000, 620, 7_250);
  const diagonalA = Math.abs((y - 6_000) - (x - 6_000) * .62) < 270 && x > 3_100 && x < 8_950;
  const diagonalB = Math.abs((y - 6_000) + (x - 6_000) * .58) < 270 && x > 3_050 && x < 9_050;
  return horizontal || vertical || diagonalA || diagonalB ? ENERGY : VOID;
}

const WORLD_PROGRESS_KEY = 'killsync.coop.worlds.v1';
export interface CoopWorldProgress { version: 1; unlockedWorldIds: WorldId[]; }

export function normalizeCoopWorldProgress(value: unknown): CoopWorldProgress {
  const record = value && typeof value === 'object' ? value as Partial<CoopWorldProgress> : {};
  const requested = Array.isArray(record.unlockedWorldIds) ? record.unlockedWorldIds.map(normalizeWorldId) : [];
  const unlocked = new Set<WorldId>(['neon_bastion']);
  for (const id of requested) {
    const index = WORLD_IDS.indexOf(id);
    for (let prerequisite = 0; prerequisite <= index; prerequisite++) unlocked.add(WORLD_IDS[prerequisite]);
  }
  return { version: 1, unlockedWorldIds: WORLD_IDS.filter(id => unlocked.has(id)) };
}

export function readCoopWorldProgress(): CoopWorldProgress {
  if (typeof localStorage === 'undefined') return normalizeCoopWorldProgress(undefined);
  try { return normalizeCoopWorldProgress(JSON.parse(localStorage.getItem(WORLD_PROGRESS_KEY) || 'null')); }
  catch { return normalizeCoopWorldProgress(undefined); }
}

export function writeCoopWorldProgress(progress: CoopWorldProgress) {
  const normalized = normalizeCoopWorldProgress(progress);
  if (typeof localStorage !== 'undefined') localStorage.setItem(WORLD_PROGRESS_KEY, JSON.stringify(normalized));
  return normalized;
}

export function unlockCoopWorld(progress: CoopWorldProgress, requestedWorldId: WorldId) {
  const current = normalizeCoopWorldProgress(progress);
  const targetIndex = WORLD_IDS.indexOf(requestedWorldId);
  const highestIndex = Math.max(...current.unlockedWorldIds.map(id => WORLD_IDS.indexOf(id)));
  if (targetIndex > highestIndex + 1) return current;
  return normalizeCoopWorldProgress({ version: 1, unlockedWorldIds: [...current.unlockedWorldIds, requestedWorldId] });
}
