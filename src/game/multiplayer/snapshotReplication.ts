import type { CoopSnapshot } from './CoopSimulation';

/**
 * A state update is either a self-contained keyframe or a patch against a
 * recent keyframe.  Deltas deliberately never depend on the preceding delta:
 * unordered WebRTC delivery may lose or reorder one and the next update must
 * still be usable.
 */
export type SnapshotWirePayload =
  | { format: 'coop_snapshot_full'; snapshot: CoopSnapshot }
  | {
    format: 'coop_snapshot_delta';
    baseTransportTick: number;
    globals?: JsonPatch;
    entities?: Partial<Record<EntityArrayKey, EntityArrayPatch>>;
  };

type EntityArrayKey = 'players' | 'enemies' | 'projectiles' | 'gems' | 'items' | 'ammoCaches' | 'combatEvents' | 'hazards' | 'pings' | 'structures' | 'artifactEffects';
type IdentifiedEntity = { id: string | number; [key: string]: unknown };

export type JsonPatch = {
  /** Replaces a scalar or array. `undefined` is represented by the parent
   * removing the property, since JSON itself cannot carry undefined. */
  value?: unknown;
  object?: Record<string, JsonPatch>;
  array?: Record<string, JsonPatch>;
  remove?: string[];
};

/**
 * JSON object keys account for a surprising amount of a snapshot delta: a
 * player loadout repeats names such as `remainingCooldownMs` far more often
 * than its values change.  DataChannels do not apply HTTP content encoding,
 * so compact the closed, versioned snapshot schema before transport.  This is
 * deliberately a key-only transform—numeric precision and game semantics are
 * untouched, and unknown future keys still pass through safely.
 */
const COMPACT_KEYS: Readonly<Record<string, string>> = {
  format: 'f', snapshot: 's', baseTransportTick: 'bt', globals: 'g', entities: 'es', value: 'v', object: 'o', array: 'ar', remove: 'rm', upsert: 'u', set: 'st', patch: 'pt',
  tick: 't', elapsedMs: 'em', kills: 'k', world: 'w', bridge: 'b', players: 'pl', enemies: 'en', projectiles: 'pr', gems: 'gm', items: 'it', ammoCaches: 'ac', combatEvents: 'ce', hazards: 'hz', pings: 'pg', structures: 'sr', artifactEffects: 'ae',
  id: 'i', x: 'x', y: 'y', z: 'z', angle: 'a', health: 'h', maxHealth: 'mh', type: 'ty', color: 'c', radius: 'r', damage: 'd', speed: 'sp', experienceValue: 'xp', hitFlashMs: 'hf', hitFlashUntilMs: 'hu', slowMultiplier: 'sm', isHolder: 'ih', dying: 'dy', deathRemainingMs: 'dm', targetPlayerId: 'tp', spawnPacketId: 'si', facingAngle: 'fa', attackWindupUntilMs: 'aw', chillStacks: 'cs', chillRemainingMs: 'cr', cinderhexStacks: 'xs', cinderhexRemainingMs: 'xr', missionId: 'mi', missionRole: 'mr', worldId: 'wi', archetypeName: 'an',
  label: 'l', playerId: 'pi', ownerId: 'oi', weaponId: 'we', actionId: 'ai', lifeState: 'ls', maxHealthBase: 'mb', armorHp: 'ah', maxArmorHp: 'ma', level: 'lv', experience: 'ex', experienceToNext: 'xn', credits: 'cd', cash: 'ca', score: 'sc', deaths: 'de', revives: 'rv', selectedSlot: 'ss', weapons: 'ws', passives: 'ps', motion: 'mo', inventory: 'iv', statusEffects: 'se',
  remainingCooldownMs: 'rc', cooldownMs: 'cm', ammo: 'aa', magazineAmmo: 'mg', reserveAmmo: 'rs', nextFireAtMs: 'nf', weaponStates: 'wt', weaponLevels: 'wl', selectedWeaponId: 'sw', selectedWeaponLevel: 'sv', passiveModules: 'pm', isReloading: 'ir', isSwitching: 'is', isAiming: 'ia', sprinting: 'sn', sliding: 'sd', crouching: 'cu', vitality: 'vt', mobility: 'my', handling: 'hg', armorTier: 'az', gasMaskHp: 'gh', gasMaskMaxHp: 'gx', selfRevives: 'rvv', selfReviveProgressMs: 'rp', reviveProgressMs: 'vp', downedRemainingMs: 'dn', invulnerableRemainingMs: 'in', movementMultiplier: 'mm',
  verticalVelocity: 'vv', lastJumpSequence: 'lj', lastWallJumpSequence: 'wj', lastDoubleJumpSequence: 'dj', wallJumpDirectionX: 'wx', wallJumpDirectionY: 'wy', airActionConsumedSinceGrounded: 'ag', jetIgnitedThisAirTime: 'ji', airborneMs: 'ab', groundedMs: 'gd', jetFuel: 'jf', jetActive: 'ja', slideAngle: 'sg',
  kind: 'ki', atMs: 'at', enemyId: 'ei', killedByPlayerId: 'kp', amount: 'am', itemType: 'ii', ammoType: 'atp', targetX: 'tx', targetY: 'tw', normalX: 'nx', normalY: 'ny', normalZ: 'nz', chainIndex: 'ci', structureId: 'ri', structureType: 'rt',
  velocity: 've', lifeMs: 'lm', pitch: 'ph', presentationOnly: 'po', manualDropKind: 'md', droppedByPlayerId: 'dp', startsAtMs: 'sa', resolvesAtMs: 'ra', remainingMs: 're',
  run: 'rn', objective: 'ob', matchState: 'ms', encounter: 'ec', buyStations: 'bs', fieldMissions: 'fm', administration: 'ad', privateExfil: 'pe', boss: 'bo', noticeKey: 'nk', phase: 'pa', contractIndex: 'co', bossesDefeated: 'bd',
  state: 'q', active: 'av', modified: 'mf', seed: 'ed', round: 'rd', tier: 'tr', roundTotal: 'ro', spawnedThisRound: 'su', enemiesRemaining: 'er', nextSpawnAtMs: 'na', phaseRemainingMs: 'fr', intermissionRemainingMs: 'im', desiredThreat: 'dt', activeThreat: 'th', roundThreatBudget: 'rb', spawnedThreat: 'sh', packetsIssued: 'pu', clusterCount: 'cl',
  artifactResource: 'au', artifactResourceMax: 'ax', artifactResourceKind: 'ak', artifactBarrier: 'ba', fabricatorCharges: 'fc', fabricatorRechargeRemainingMs: 'fcx', privateExfilAvailable: 'pv', privateExfilCalled: 'pc', insertionRemainingMs: 'nr', insertionDurationMs: 'nd', destinationWorldId: 'dw', sourceWorldId: 'ow', warningRemainingMs: 'wr', lastGasNoticeAtMs: 'gn', gasZone: 'gz',
  captureProgressMs: 'cp', captureRequiredMs: 'cq', captureRadius: 'cz', contested: 'ct', occupants: 'oc', reward: 'rw', stock: 'sk', price: 'pp', operatorId: 'op', generation: 'ge', ranks: 'rk', power: 'pw', reach: 'rh', buildX: 'bx', buildY: 'by', startX: 'sx', startY: 'sy', endX: 'xx', endY: 'xy', width: 'wd', name: 'nm', skinId: 'sdx', imprint: 'ip', results: 'rr', exfil: 'ef', sites: 'ts',
};
const EXPANDED_KEYS: Readonly<Record<string, string>> = Object.fromEntries(Object.entries(COMPACT_KEYS).map(([key, compact]) => [compact, key]));

/** Encode just before JSON serialization. See `decodeSnapshotWirePayload`. */
export function compactSnapshotWirePayload(payload: unknown): unknown {
  return transformSnapshotKeys(payload, COMPACT_KEYS);
}

/** Decode a compact payload, while accepting the expanded representation used
 * by manual retry snapshots and older saved/replay data. */
export function expandSnapshotWirePayload(payload: unknown): unknown {
  return transformSnapshotKeys(payload, EXPANDED_KEYS);
}

function transformSnapshotKeys(value: unknown, dictionary: Readonly<Record<string, string>>): unknown {
  if (Array.isArray(value)) return value.map(item => transformSnapshotKeys(item, dictionary));
  if (!isPlainRecord(value)) return value;
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) output[dictionary[key] || key] = transformSnapshotKeys(child, dictionary);
  return output;
}

type EntityPatch = { id: string | number; set?: Record<string, unknown>; patch?: Record<string, JsonPatch>; remove?: string[] };
type EntityArrayPatch = { upsert?: EntityPatch[]; remove?: Array<string | number> };

const ENTITY_ARRAYS: readonly EntityArrayKey[] = [
  'players', 'enemies', 'projectiles', 'gems', 'items', 'ammoCaches',
  'combatEvents', 'hazards', 'pings', 'structures', 'artifactEffects',
];
const ENTITY_ARRAY_SET = new Set<string>(ENTITY_ARRAYS);
const KEYFRAME_INTERVAL = 20;

type PeerBaseline = { snapshot: CoopSnapshot; transportTick: number; sentSinceKeyframe: number; worldId?: string };

/** Host-side per-recipient replication. This is intentionally transport
 * agnostic: the WebRTC adapter only serializes the returned wire payload. */
export class SnapshotReplicator {
  private readonly baselines = new Map<string, PeerBaseline>();

  reset(peerId?: string) {
    if (peerId === undefined) this.baselines.clear();
    else this.baselines.delete(peerId);
  }

  payloadFor(peerId: string, snapshot: CoopSnapshot, transportTick: number): SnapshotWirePayload {
    const previous = this.baselines.get(peerId);
    const worldId = snapshot.world?.id;
    if (!previous || previous.sentSinceKeyframe >= KEYFRAME_INTERVAL || previous.worldId !== worldId) {
      this.baselines.set(peerId, { snapshot, transportTick, sentSinceKeyframe: 0, worldId });
      return { format: 'coop_snapshot_full', snapshot };
    }

    const delta = createSnapshotDelta(previous.snapshot, snapshot, previous.transportTick);
    // A pathological burst can make a patch larger than a keyframe. Never pay
    // both the patching CPU and extra network cost just to preserve cadence.
    const full: SnapshotWirePayload = { format: 'coop_snapshot_full', snapshot };
    if (JSON.stringify(delta).length >= JSON.stringify(full).length) {
      this.baselines.set(peerId, { snapshot, transportTick, sentSinceKeyframe: 0, worldId });
      return full;
    }
    previous.sentSinceKeyframe++;
    return delta;
  }
}

/** Guest-side reconstruction. Keep a few keyframes because an unordered
 * delta may arrive after a newer keyframe but still reference the older one. */
export class SnapshotDecoder {
  private readonly keyframes = new Map<number, CoopSnapshot>();

  reset() { this.keyframes.clear(); }

  decode(payload: unknown, transportTick: number): CoopSnapshot | undefined {
    payload = expandSnapshotWirePayload(payload);
    // A raw snapshot is accepted for retry/backwards compatibility. It also
    // makes direct-host retry snapshots safe.
    if (isCoopSnapshot(payload)) {
      this.store(transportTick, payload);
      return payload;
    }
    if (!payload || typeof payload !== 'object') return undefined;
    const wire = payload as Partial<SnapshotWirePayload>;
    if (wire.format === 'coop_snapshot_full' && isCoopSnapshot(wire.snapshot)) {
      this.store(transportTick, wire.snapshot);
      return wire.snapshot;
    }
    if (wire.format !== 'coop_snapshot_delta' || !Number.isSafeInteger(wire.baseTransportTick)) return undefined;
    const base = this.keyframes.get(wire.baseTransportTick);
    if (!base) return undefined;
    const snapshot = applySnapshotDelta(base, wire as Extract<SnapshotWirePayload, { format: 'coop_snapshot_delta' }>);
    return isCoopSnapshot(snapshot) ? snapshot : undefined;
  }

  private store(tick: number, snapshot: CoopSnapshot) {
    this.keyframes.set(tick, snapshot);
    while (this.keyframes.size > 3) {
      const oldest = Math.min(...this.keyframes.keys());
      this.keyframes.delete(oldest);
    }
  }
}

export function createSnapshotDelta(base: CoopSnapshot, next: CoopSnapshot, baseTransportTick: number): Extract<SnapshotWirePayload, { format: 'coop_snapshot_delta' }> {
  const previousGlobals = withoutEntities(base);
  const nextGlobals = withoutEntities(next);
  const globals = diffJson(previousGlobals, nextGlobals);
  const entities: Partial<Record<EntityArrayKey, EntityArrayPatch>> = {};
  for (const key of ENTITY_ARRAYS) {
    const patch = diffEntityArray(base[key] as unknown as IdentifiedEntity[] | undefined, next[key] as unknown as IdentifiedEntity[] | undefined);
    if (patch) entities[key] = patch;
  }
  return {
    format: 'coop_snapshot_delta',
    baseTransportTick,
    ...(globals ? { globals } : {}),
    ...(Object.keys(entities).length ? { entities } : {}),
  };
}

function applySnapshotDelta(base: CoopSnapshot, delta: Extract<SnapshotWirePayload, { format: 'coop_snapshot_delta' }>): CoopSnapshot {
  const snapshot = applyJsonPatch(withoutEntities(base), delta.globals) as CoopSnapshot;
  for (const key of ENTITY_ARRAYS) {
    const patch = delta.entities?.[key];
    (snapshot as unknown as Record<string, unknown>)[key] = patch
      ? applyEntityArrayPatch(base[key] as unknown as IdentifiedEntity[] | undefined, patch)
      : base[key];
  }
  return snapshot;
}

function withoutEntities(snapshot: CoopSnapshot): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(snapshot)) if (!ENTITY_ARRAY_SET.has(key)) output[key] = value;
  return output;
}

function diffEntityArray(previous: IdentifiedEntity[] | undefined, next: IdentifiedEntity[] | undefined): EntityArrayPatch | undefined {
  const oldById = new Map((previous || []).map(entity => [entity.id, entity]));
  const nextIds = new Set<string | number>();
  const upsert: EntityPatch[] = [];
  for (const entity of next || []) {
    nextIds.add(entity.id);
    const old = oldById.get(entity.id);
    const patch = diffEntity(old, entity);
    if (patch) upsert.push({ id: entity.id, ...patch });
  }
  const remove: Array<string | number> = [];
  for (const id of oldById.keys()) if (!nextIds.has(id)) remove.push(id);
  return upsert.length || remove.length ? { ...(upsert.length ? { upsert } : {}), ...(remove.length ? { remove } : {}) } : undefined;
}

function diffEntity(previous: IdentifiedEntity | undefined, next: IdentifiedEntity): Omit<EntityPatch, 'id'> | undefined {
  if (!previous) return { set: next };
  const set: Record<string, unknown> = {};
  const patch: Record<string, JsonPatch> = {};
  const remove: string[] = [];
  for (const [key, value] of Object.entries(next)) {
    if (key === 'id') continue;
    const nested = diffJson(previous[key], value);
    if (!nested) continue;
    // Weapon runtimes and passive arrays are nested, mostly-static state. A
    // field patch usually changes one ammo/cooldown value instead of copying a
    // player's complete loadout into every 20 Hz packet.
    if (JSON.stringify(nested).length < JSON.stringify(value).length) patch[key] = nested;
    else set[key] = value;
  }
  for (const key of Object.keys(previous)) if (key !== 'id' && !(key in next)) remove.push(key);
  return Object.keys(set).length || Object.keys(patch).length || remove.length
    ? { ...(Object.keys(set).length ? { set } : {}), ...(Object.keys(patch).length ? { patch } : {}), ...(remove.length ? { remove } : {}) }
    : undefined;
}

function applyEntityArrayPatch(previous: IdentifiedEntity[] | undefined, patch: EntityArrayPatch): IdentifiedEntity[] {
  const values = new Map((previous || []).map(entity => [entity.id, entity]));
  for (const id of patch.remove || []) values.delete(id);
  for (const change of patch.upsert || []) {
    const old = values.get(change.id) || { id: change.id };
    const next: IdentifiedEntity = { ...old, ...change.set, id: change.id };
    for (const [key, nested] of Object.entries(change.patch || {})) next[key] = applyJsonPatch(next[key], nested);
    for (const key of change.remove || []) delete next[key];
    values.set(change.id, next);
  }
  // Preserve authoritative snapshot ordering; many presentation routines use
  // it as a deterministic tie-breaker.
  const ordered: IdentifiedEntity[] = [];
  const present = new Set(values.keys());
  for (const entity of previous || []) if (present.delete(entity.id)) ordered.push(values.get(entity.id)!);
  for (const change of patch.upsert || []) if (present.delete(change.id)) ordered.push(values.get(change.id)!);
  return ordered;
}

function diffJson(previous: unknown, next: unknown): JsonPatch | undefined {
  if (jsonEqual(previous, next)) return undefined;
  if (Array.isArray(previous) && Array.isArray(next) && previous.length === next.length) {
    const array: Record<string, JsonPatch> = {};
    for (let index = 0; index < next.length; index++) {
      const patch = diffJson(previous[index], next[index]);
      if (patch) array[String(index)] = patch;
    }
    return Object.keys(array).length ? { array } : undefined;
  }
  if (!isPlainRecord(previous) || !isPlainRecord(next)) return { value: next };
  const object: Record<string, JsonPatch> = {};
  const remove: string[] = [];
  for (const key of Object.keys(next)) {
    const patch = diffJson(previous[key], next[key]);
    if (patch) object[key] = patch;
  }
  for (const key of Object.keys(previous)) if (!(key in next)) remove.push(key);
  return { ...(Object.keys(object).length ? { object } : {}), ...(remove.length ? { remove } : {}) };
}

function applyJsonPatch(base: unknown, patch: JsonPatch | undefined): unknown {
  if (!patch) return base;
  if ('value' in patch) return patch.value;
  if (patch.array) {
    const output = Array.isArray(base) ? [...base] : [];
    for (const [index, child] of Object.entries(patch.array)) output[Number(index)] = applyJsonPatch(output[Number(index)], child);
    return output;
  }
  const output: Record<string, unknown> = isPlainRecord(base) ? { ...base } : {};
  for (const key of patch.remove || []) delete output[key];
  for (const [key, child] of Object.entries(patch.object || {})) output[key] = applyJsonPatch(output[key], child);
  return output;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function jsonEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => jsonEqual(value, right[index]));
  }
  if (!isPlainRecord(left) || !isPlainRecord(right)) return false;
  const leftKeys = Object.keys(left), rightKeys = Object.keys(right);
  return leftKeys.length === rightKeys.length
    && leftKeys.every(key => key in right && jsonEqual(left[key], right[key]));
}

function isCoopSnapshot(value: unknown): value is CoopSnapshot {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as Partial<CoopSnapshot>;
  return typeof snapshot.tick === 'number' && typeof snapshot.kills === 'number'
    && Array.isArray(snapshot.players) && Array.isArray(snapshot.enemies) && Array.isArray(snapshot.projectiles)
    && Array.isArray(snapshot.gems) && Array.isArray(snapshot.items) && Array.isArray(snapshot.ammoCaches) && Array.isArray(snapshot.combatEvents);
}
