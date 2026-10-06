import { describe, expect, it } from 'vitest';
import { WORLD_IDS, getWorldDefinition } from '../world/WorldDefinitions';
import { isWorldPositionClear } from '../world/WorldLayout';
import { CoopSimulation } from './CoopSimulation';
import { CoopRealityBreach, BREACH_FIRST_AT_MS, BREACH_LINK_MS, BREACH_WINDOW_MS, BREACH_ANCHOR_RADIUS, type BreachOperator } from './CoopRealityBreach';
import { createSnapshotDelta, SnapshotDecoder, compactSnapshotWirePayload, expandSnapshotWirePayload } from './snapshotReplication';
import { createInterestSnapshot } from './snapshotInterest';

const operators = (count: number): BreachOperator[] => Array.from({ length: count }, (_, index) => ({ id: `p${index}`, x: 6000 + index * 30, y: 6000, z: 0, lifeState: 'alive' }));
function connect(director: CoopRealityBreach, players: BreachOperator[], at = BREACH_FIRST_AT_MS) {
  const anchors = director.snapshot(at).anchors;
  players.forEach((player, index) => { if (anchors[index]) Object.assign(player, anchors[index]); });
}
function charge(director: CoopRealityBreach, players: BreachOperator[], start = BREACH_FIRST_AT_MS) {
  let result: string | undefined;
  for (let step = 1; step <= BREACH_LINK_MS / 50; step++) result = director.update(50, start + step * 50, players);
  return result;
}

describe('host-owned Reality Breach', () => {
  it('opens after insertion, requires distinct operators and pays one completion', () => {
    const director = new CoopRealityBreach('neon_bastion'), players = operators(3);
    expect(director.update(50, BREACH_FIRST_AT_MS - 50, players)).toBeUndefined();
    expect(director.update(50, BREACH_FIRST_AT_MS, players)).toBe('opened');
    connect(director, players);
    expect(charge(director, players)).toBe('sealed');
    expect(director.snapshot(26_000)).toMatchObject({ phase: 'overdrive', linkedAnchors: 3, reward: 160, progressMs: BREACH_LINK_MS });
    expect(director.update(50, 26_050, players)).toBeUndefined();
    expect(director.movementScale(6000, 6000)).toBe(.4);
    expect(director.movementScale(100, 100)).toBe(1);
    director.update(50, 38_000, players);
    expect(director.snapshot(38_000).phase).toBe('dormant');
    expect(director.movementScale(6000, 6000)).toBe(1);
  });

  it('cannot substitute one player for a squad, and airborne players do not power rings', () => {
    const director = new CoopRealityBreach('neon_bastion'), players = operators(3);
    director.update(50, BREACH_FIRST_AT_MS, players);
    const anchors = director.snapshot(BREACH_FIRST_AT_MS).anchors;
    Object.assign(players[0], anchors[0]);
    director.update(50, 18_050, players);
    expect(director.snapshot(18_050)).toMatchObject({ linkedAnchors: 1, progressMs: 0 });
    connect(director, players); players[1].z = 150;
    director.update(50, 18_100, players);
    expect(director.snapshot(18_100)).toMatchObject({ linkedAnchors: 2, progressMs: 0 });
  });

  it('supports solo play, adapts to a disconnect, and decays a broken link gently', () => {
    const solo = new CoopRealityBreach('neon_bastion'), one = operators(1);
    solo.update(50, BREACH_FIRST_AT_MS, one); connect(solo, one);
    expect(solo.snapshot(BREACH_FIRST_AT_MS).anchors).toHaveLength(1);
    expect(charge(solo, one)).toBe('sealed');
    const director = new CoopRealityBreach('neon_bastion'), players = operators(3);
    director.update(50, BREACH_FIRST_AT_MS, players); connect(director, players);
    director.update(50, 18_050, players);
    players[0].x += 400;
    director.update(50, 18_100, players);
    expect(director.snapshot(18_100).progressMs).toBe(32.5);
    director.update(50, 18_150, players.slice(1));
    expect(director.snapshot(18_150)).toMatchObject({ requiredAnchors: 2, linkedAnchors: 2, progressMs: 82.5 });
  });

  it('expires into one bounded hostile surge and suppresses new breaches during extraction', () => {
    const director = new CoopRealityBreach('neon_bastion'), players = operators(2);
    expect(director.update(50, BREACH_FIRST_AT_MS, players, false)).toBeUndefined();
    director.update(50, BREACH_FIRST_AT_MS, players);
    expect(director.update(50, BREACH_FIRST_AT_MS + BREACH_WINDOW_MS, players)).toBe('failed');
    const failed = director.snapshot(73_000);
    expect(director.movementScale(failed.x, failed.y)).toBe(1.3);
    director.update(50, 85_000, players, false);
    expect(director.movementScale(failed.x, failed.y)).toBe(1);
    expect(director.snapshot(85_000).phase).toBe('dormant');
  });

  it.each(WORLD_IDS)('places clear, separate rings on %s, including its authored edge', worldId => {
    for (const centre of [{ x: 6000, y: 6000 }, getWorldDefinition(worldId).bridgehead]) {
      const players = operators(5).map(player => ({ ...player, ...centre }));
      const director = new CoopRealityBreach(worldId);
      director.update(50, BREACH_FIRST_AT_MS, players);
      const anchors = director.snapshot(BREACH_FIRST_AT_MS).anchors;
      expect(anchors).toHaveLength(3);
      for (const anchor of anchors) expect(isWorldPositionClear(anchor.x, anchor.y, BREACH_ANCHOR_RADIUS + 20, worldId)).toBe(true);
      for (let index = 1; index < anchors.length; index++) expect(Math.hypot(anchors[index].x - anchors[index - 1].x, anchors[index].y - anchors[index - 1].y)).toBeGreaterThan(280);
    }
  });
});

describe('Reality Breach simulation and transport', () => {
  const simulation = () => new CoopSimulation(operators(3).map(player => ({ id: player.id, label: player.id, color: '#22d3ee' })));
  function open(sim: CoopSimulation) {
    const runtime = sim as any;
    runtime.elapsedMs = BREACH_FIRST_AT_MS;
    runtime.updateRealityBreach(50);
    const breach = sim.createSnapshot().realityBreach!;
    breach.anchors.forEach((anchor, index) => Object.assign(runtime.players.get(`p${index}`), { x: anchor.x, y: anchor.y, health: 50 }));
    return runtime;
  }

  it('rewards once, heals the living squad, bounds boss damage and publishes the pulse', () => {
    const sim = simulation(), runtime = open(sim);
    const breach = sim.createSnapshot().realityBreach!;
    runtime.enemies = [];
    runtime.spawnEnemy('basic', 'p0', -1, { x: breach.x, y: breach.y });
    runtime.spawnEnemy('elite', 'p0', -1, { x: breach.x + 300, y: breach.y });
    const boss = runtime.enemies[1]; boss.health = boss.maxHealth = 100_000; runtime.bossEnemyId = boss.id;
    for (let step = 0; step < BREACH_LINK_MS / 50; step++) { runtime.elapsedMs += 50; runtime.updateRealityBreach(50); }
    const complete = sim.createSnapshot();
    expect(complete.realityBreach!.phase).toBe('overdrive');
    expect(complete.players.every(player => player.coins === 160 && player.health === 75)).toBe(true);
    expect(complete.combatEvents.filter(event => event.kind === 'breach_sealed')).toHaveLength(1);
    expect(boss.health).toBeGreaterThanOrEqual(96_450);
    runtime.elapsedMs += 50; runtime.updateRealityBreach(50);
    expect(sim.createSnapshot().players[0].coins).toBe(160);
    expect(runtime.runStats.get('p0').shotsHit).toBe(0);
  });

  it('damages enemies crossing the connected circuit without hitting distant enemies', () => {
    const sim = simulation(), runtime = open(sim);
    const [a, b] = sim.createSnapshot().realityBreach!.anchors;
    runtime.enemies = [];
    runtime.spawnEnemy('elite', 'p0', -1, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    runtime.spawnEnemy('elite', 'p0', -1, { x: 9000, y: 9000 });
    const [crossing, distant] = runtime.enemies;
    const before = [crossing.health, distant.health];
    runtime.elapsedMs += 500; runtime.updateRealityBreach(50);
    expect(crossing.health).toBe(before[0] - 75);
    expect(distant.health).toBe(before[1]);
  });

  it('replicates anchor ownership through compact keyframes/deltas and preserves distant milestones', () => {
    const sim = simulation();
    const base = sim.createSnapshot();
    const runtime = open(sim);
    runtime.elapsedMs += 500; runtime.updateRealityBreach(50);
    const current = sim.createSnapshot();
    const delta = createSnapshotDelta(base, current, 10);
    const decoder = new SnapshotDecoder();
    decoder.decode({ format: 'coop_snapshot_full', snapshot: base }, 10);
    const wire = expandSnapshotWirePayload(compactSnapshotWirePayload(delta)) as typeof delta;
    expect(decoder.decode(wire, 11)?.realityBreach).toEqual(current.realityBreach);
    const far = { ...current, players: current.players.map(player => ({ ...player, x: 100, y: 100 })) };
    const interested = createInterestSnapshot(far, 'p0');
    expect(interested.realityBreach).toEqual(current.realityBreach);
    expect(interested.combatEvents.some(event => event.kind === 'breach_opened')).toBe(true);
  });
});
