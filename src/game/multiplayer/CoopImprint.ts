export const COOP_IMPRINT_STORAGE_KEY = 'killsync.coop.imprints.v1';
export const COOP_IMPRINT_SCHEMA_VERSION = 2;
export const COOP_BASELINE_CALIBRATION_POINTS = 1;

export type CoopImprintStatId = 'power' | 'vitality' | 'mobility' | 'handling' | 'reach';
export type CoopImprintRanks = Record<CoopImprintStatId, number>;

export interface CoopImprintLoadout {
  operatorId: string;
  generation: number;
  ranks: CoopImprintRanks;
}

export interface CoopOperatorImprint extends CoopImprintLoadout {
  unspentPoints: number;
  successfulExtractions: number;
  highestDepth: number;
}

export interface CoopImprintCareer {
  lifetimeExtractions: number;
  lifetimeWipes: number;
  highestDepth: number;
}

export interface CoopImprintProfile {
  schemaVersion: 2;
  revision: number;
  settledRunIds: string[];
  career: CoopImprintCareer;
  imprints: Record<string, CoopOperatorImprint>;
}

export interface CoopImprintStatDefinition {
  id: CoopImprintStatId;
  name: string;
  description: string;
  maxRank: number;
  valuePerRank: number;
  unit: '%' | 'HP';
}

export const COOP_IMPRINT_STATS: readonly CoopImprintStatDefinition[] = Object.freeze([
  { id: 'power', name: 'Power', description: 'Firearm and offensive support damage.', maxRank: 10, valuePerRank: 4, unit: '%' },
  { id: 'vitality', name: 'Vitality', description: 'Maximum operator health.', maxRank: 10, valuePerRank: 7, unit: 'HP' },
  { id: 'mobility', name: 'Mobility', description: 'Walk, sprint, and slide speed.', maxRank: 8, valuePerRank: 2, unit: '%' },
  { id: 'handling', name: 'Handling', description: 'Reloading and weapon switching speed.', maxRank: 10, valuePerRank: 3, unit: '%' },
  { id: 'reach', name: 'Reach', description: 'Personal pickup attraction distance.', maxRank: 10, valuePerRank: 12, unit: '%' },
]);

const STAT_BY_ID = Object.freeze(Object.fromEntries(COOP_IMPRINT_STATS.map(stat => [stat.id, stat])) as Record<CoopImprintStatId, CoopImprintStatDefinition>);
const EMPTY_RANKS: CoopImprintRanks = Object.freeze({ power: 0, vitality: 0, mobility: 0, handling: 0, reach: 0 });
const RESERVED_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function emptyCoopImprintRanks(): CoopImprintRanks { return { ...EMPTY_RANKS }; }

export function normalizeCoopImprintRanks(value: unknown): CoopImprintRanks {
  const source = value && typeof value === 'object' ? value as Partial<Record<CoopImprintStatId, unknown>> : {};
  return Object.fromEntries(COOP_IMPRINT_STATS.map(stat => {
    const candidate = source[stat.id];
    const rank = typeof candidate === 'number' && Number.isFinite(candidate) ? Math.trunc(candidate) : 0;
    return [stat.id, Math.max(0, Math.min(stat.maxRank, rank))];
  })) as CoopImprintRanks;
}

export function normalizeCoopImprintLoadout(value: unknown, fallbackOperatorId = 'phantom'): CoopImprintLoadout {
  const source = value && typeof value === 'object' ? value as Partial<CoopImprintLoadout> : {};
  return {
    operatorId: isValidOperatorId(source.operatorId) ? source.operatorId : isValidOperatorId(fallbackOperatorId) ? fallbackOperatorId : 'phantom',
    generation: typeof source.generation === 'number' && Number.isFinite(source.generation) ? Math.max(1, Math.min(999_999, Math.trunc(source.generation))) : 1,
    ranks: normalizeCoopImprintRanks(source.ranks),
  };
}

export function coopImprintRating(ranks: CoopImprintRanks) {
  return COOP_IMPRINT_STATS.reduce((total, stat) => total + ranks[stat.id], 0);
}

export function coopImprintRankCost(currentRank: number) {
  const nextRank = Math.max(1, Math.trunc(currentRank) + 1);
  if (nextRank <= 3) return 1;
  if (nextRank <= 6) return 2;
  if (nextRank <= 8) return 3;
  return 4;
}

export function coopImprintModifiers(ranks: CoopImprintRanks) {
  const normalized = normalizeCoopImprintRanks(ranks);
  return {
    damageMultiplier: 1 + normalized.power * .04,
    maxHealth: 100 + normalized.vitality * 7,
    movementMultiplier: 1 + normalized.mobility * .02,
    handlingDurationMultiplier: Math.max(.75, 1 - normalized.handling * .03),
    pickupRadiusMultiplier: 1 + normalized.reach * .12,
  };
}

export function createCoopImprintProfile(): CoopImprintProfile {
  return { schemaVersion: COOP_IMPRINT_SCHEMA_VERSION, revision: 0, settledRunIds: [], career: { lifetimeExtractions: 0, lifetimeWipes: 0, highestDepth: 0 }, imprints: Object.create(null) as Record<string, CoopOperatorImprint> };
}

export function normalizeCoopImprintProfile(value: unknown): CoopImprintProfile {
  if (!value || typeof value !== 'object') return createCoopImprintProfile();
  const source = value as Partial<CoopImprintProfile> & { schemaVersion?: unknown };
  const needsBaselineMigration = typeof source.schemaVersion !== 'number' || source.schemaVersion < COOP_IMPRINT_SCHEMA_VERSION;
  const profile = createCoopImprintProfile();
  profile.revision = finiteInt(source.revision, 0, Number.MAX_SAFE_INTEGER);
  profile.settledRunIds = Array.isArray(source.settledRunIds) ? source.settledRunIds.filter((id): id is string => typeof id === 'string').slice(-50) : [];
  profile.career = {
    lifetimeExtractions: finiteInt(source.career?.lifetimeExtractions, 0, Number.MAX_SAFE_INTEGER),
    lifetimeWipes: finiteInt(source.career?.lifetimeWipes, 0, Number.MAX_SAFE_INTEGER),
    highestDepth: finiteInt(source.career?.highestDepth, 0, 999),
  };
  if (source.imprints && typeof source.imprints === 'object') {
    for (const [operatorId, raw] of Object.entries(source.imprints)) {
      if (!isValidOperatorId(operatorId) || !raw || typeof raw !== 'object') continue;
      const imprint = raw as Partial<CoopOperatorImprint>;
      const loadout = normalizeCoopImprintLoadout({ ...imprint, operatorId }, operatorId);
      profile.imprints[operatorId] = {
        ...loadout,
        // Schema 2 introduced the baseline specialization. Existing careers
        // receive it once too; the normalized schema prevents repeat grants.
        unspentPoints: Math.min(999_999, finiteInt(imprint.unspentPoints, 0, 999_999) + (needsBaselineMigration ? COOP_BASELINE_CALIBRATION_POINTS : 0)),
        successfulExtractions: finiteInt(imprint.successfulExtractions, 0, Number.MAX_SAFE_INTEGER),
        highestDepth: finiteInt(imprint.highestDepth, 0, 999),
      };
    }
  }
  return profile;
}

export function getCoopOperatorImprint(profile: CoopImprintProfile, operatorId: string): CoopOperatorImprint {
  const safeOperatorId = isValidOperatorId(operatorId) ? operatorId : 'phantom';
  const existing = profile.imprints[safeOperatorId];
  return existing ? { ...existing, ranks: { ...existing.ranks } } : {
    operatorId: safeOperatorId, generation: 1, ranks: emptyCoopImprintRanks(), unspentPoints: COOP_BASELINE_CALIBRATION_POINTS, successfulExtractions: 0, highestDepth: 0,
  };
}

export function settleCoopImprintRun(profileValue: unknown, params: { runId: string; operatorId: string; success: boolean; squadWiped: boolean; extractedCores: number; depth: number }) {
  const profile = normalizeCoopImprintProfile(profileValue);
  if (!params.runId || profile.settledRunIds.includes(params.runId)) return profile;
  const imprint = getCoopOperatorImprint(profile, params.operatorId);
  profile.revision++;
  profile.settledRunIds = [...profile.settledRunIds, params.runId].slice(-50);
  profile.career.highestDepth = Math.max(profile.career.highestDepth, finiteInt(params.depth, 0, 999));
  if (params.success) {
    imprint.unspentPoints += finiteInt(params.extractedCores, 0, 999_999);
    imprint.successfulExtractions++;
    imprint.highestDepth = Math.max(imprint.highestDepth, finiteInt(params.depth, 0, 999));
    profile.career.lifetimeExtractions++;
  } else if (params.squadWiped) {
    imprint.generation++;
    imprint.ranks = emptyCoopImprintRanks();
    // Every generation receives one baseline choice. It is a fixed allowance,
    // not retained progress, so repeatedly wiping can never accumulate power.
    imprint.unspentPoints = COOP_BASELINE_CALIBRATION_POINTS;
    imprint.successfulExtractions = 0;
    imprint.highestDepth = 0;
    profile.career.lifetimeWipes++;
  }
  profile.imprints[imprint.operatorId] = imprint;
  return profile;
}

export function purchaseCoopImprintRank(profileValue: unknown, operatorId: string, statId: CoopImprintStatId) {
  const profile = normalizeCoopImprintProfile(profileValue);
  const imprint = getCoopOperatorImprint(profile, operatorId);
  const definition = STAT_BY_ID[statId];
  if (!definition || imprint.ranks[statId] >= definition.maxRank) return profile;
  const cost = coopImprintRankCost(imprint.ranks[statId]);
  if (imprint.unspentPoints < cost) return profile;
  imprint.ranks[statId]++;
  imprint.unspentPoints -= cost;
  profile.revision++;
  profile.imprints[imprint.operatorId] = imprint;
  return profile;
}

export function readCoopImprintProfile(): CoopImprintProfile {
  try { return normalizeCoopImprintProfile(JSON.parse(localStorage.getItem(COOP_IMPRINT_STORAGE_KEY) || 'null')); }
  catch { return createCoopImprintProfile(); }
}

export function writeCoopImprintProfile(profile: CoopImprintProfile) {
  try { localStorage.setItem(COOP_IMPRINT_STORAGE_KEY, JSON.stringify(normalizeCoopImprintProfile(profile))); } catch { /* Storage fallback. */ }
}

export function selectedCoopOperatorId() {
  try {
    const value = localStorage.getItem('selectedOperator') || 'phantom';
    return isValidOperatorId(value) ? value : 'phantom';
  } catch { return 'phantom'; }
}

function finiteInt(value: unknown, minimum: number, maximum: number) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(minimum, Math.min(maximum, Math.trunc(value))) : minimum;
}

function isValidOperatorId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9_-]{1,32}$/.test(value) && !RESERVED_OBJECT_KEYS.has(value);
}
