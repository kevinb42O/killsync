import { interpolateCoopSnapshot, CoopSnapshotInterpolator } from './snapshotInterpolation';
import { describe, expect, it } from 'vitest';
import { CoopSimulation, quantizeAngle, quantizePitch } from './CoopSimulation';
import { MULTIPLAYER_PROTOCOL_VERSION } from './protocol';
import { COOP_SPELL_SLOTS, COOP_SPELLS } from '../combat/coopSpells';
import { GRENADE_RECHARGE_MS } from '../combat/coopGrenades';
import { createSnapshotDelta, SnapshotDecoder } from './snapshotReplication';
import { getWorldObstacles } from '../world/WorldLayout';

const make = (caster = true) => new CoopSimulation([{ id: 'host', label: 'Host', color: '#fff', operatorId: caster ? 'royal_inferno' : 'neon_vanguard' }]);
const input = (sequence: number, grenadeActionId = 0, extra = {}) => ({ type: 'input' as const, version: MULTIPLAYER_PROTOCOL_VERSION, sequence, clientTime: 0, movement: 0, aimAngle: quantizeAngle(0), aimPitch: quantizePitch(0), selectedSlot: 0, firing: false, sprinting: false, sliding: false, reviving: false, jumpPressed: false, dashPressed: false, grenadeActionId, ...extra });
function target(sim: CoopSimulation, x: number, y: number) {
  sim['spawnEnemy']('basic', 'host', 900, { x, y }, 100);
  const enemy = sim['enemies'].at(-1)!; enemy.speed = 0; enemy.damage = 0;
  sim['enemySpatialIndex'].rebuild(sim['enemies']); return enemy;
}

describe('Hellbinder spell authority', () => {
  it('replaces every firearm with five ammo-free spells and refuses ADS and reload', () => {
    const sim = make(), player = sim['players'].get('host')!;
    expect(player.weaponStates.map(state => state.weaponId)).toEqual(COOP_SPELL_SLOTS);
    expect(player.weaponStates.every(state => state.magazineAmmo === 0 && state.reserveAmmo === 0)).toBe(true);
    sim.setInput('host', input(1, 0, { aiming: true, reloadPressed: true })); sim.tick(50);
    expect(player.isAiming).toBe(false); expect(player.isReloading).toBe(false); expect(player.mana).toBe(100);
  });
  it('charges mana once, rejects exhausted and cooling casts, and regenerates while alive', () => {
    const sim = make(), player = sim['players'].get('host')!;
    sim['castSpell'](player, 'ember_bolt', 1); expect(player.mana).toBe(94);
    sim['castSpell'](player, 'ember_bolt', 2); expect(player.mana).toBe(94);
    expect(sim.createSnapshot().projectiles).toHaveLength(1);
    player.mana = 0; player.weaponStates[0].nextFireAtMs = 0;
    sim['castSpell'](player, 'ember_bolt', 3); expect(sim.createSnapshot().projectiles).toHaveLength(1);
    sim.tick(50); expect(player.mana).toBeCloseTo(.7);
  });
  it('uses independent cooldowns and damages/slows with nova while meteor resolves only after its telegraph', () => {
    const sim = make(), player = sim['players'].get('host')!, enemy = target(sim, player.x + 90, player.y);
    const initial = enemy.health;
    player.selectedSlot = 1; sim['castSpell'](player, 'soul_nova', 1);
    expect(enemy.health).toBe(initial - 85); expect(enemy.slowMultiplier).toBe(.45);
    expect(player.weaponStates[1].nextFireAtMs).toBe(COOP_SPELLS.soul_nova.cooldownMs);
    expect(player.weaponStates[0].nextFireAtMs).toBe(0);
    player.selectedSlot = 2; player.aimPitch = -.3; sim['castSpell'](player, 'rift_meteor', 2);
    const zone = sim.createSnapshot().spellZones![0]; expect(zone).toBeDefined();
    enemy.x = zone.x; enemy.y = zone.y;
    sim['updateOrdnance'](50); expect(enemy.health).toBe(initial - 85);
    sim['elapsedMs'] = zone.resolvesAtMs; sim['updateOrdnance'](0);
    expect(enemy.health).toBe(initial - 85 - 190);
    expect(sim.createSnapshot().spellZones).toHaveLength(0);
    expect(sim.createSnapshot().combatEvents).toContainEqual(expect.objectContaining({ kind: 'spell_impact', weaponId: 'rift_meteor' }));
  });
  it('pierces a line of enemies with Astral Lance and applies burning curse stacks', () => {
    const sim = make(), player = sim['players'].get('host')!;
    const a = target(sim, player.x + 80, player.y), b = target(sim, player.x + 180, player.y);
    player.selectedSlot = 4; sim['castSpell'](player, 'astral_lance', 1);
    for (let i = 0; i < 3; i++) sim.tick(50);
    expect(a.health).toBe(a.maxHealth - 115); expect(b.health).toBe(b.maxHealth - 115);
    player.selectedSlot = 3; sim['castSpell'](player, 'cinderhex_engine', 2);
    for (let i = 0; i < 3; i++) sim.tick(50);
    expect(a.cinderhexStacks).toBeGreaterThan(0);
  });
  it('allows Hellseed from every spell slot but rejects hostage casts', () => {
    for (let slot = 0; slot < 5; slot++) {
      const sim = make(), player = sim['players'].get('host')!; player.selectedSlot = slot; player.artifactResource = 3; target(sim, player.x + 100, player.y);
      sim.setInput('host', input(1, 0, { selectedSlot: slot, altFireActionId: 1 })); sim.tick(50);
      // Switching consumes the action; a cast after the switch is a fresh edge.
      player.isSwitching = false; player.weaponStates[slot].state = 'ready';
      sim.setInput('host', input(2, 0, { selectedSlot: slot, altFireActionId: 2 })); sim.tick(50);
      expect(sim.createSnapshot().artifactEffects?.some(effect => effect.kind === 'hellseed')).toBe(true);
    }
    const sim = make(), player = sim['players'].get('host')!; player.carryingHostage = true; player.artifactResource = 5;
    sim['tryArtifactSpender'](player); sim['throwGrenade'](player);
    expect(sim.createSnapshot().artifactEffects).toHaveLength(0); expect(sim.createSnapshot().grenades).toHaveLength(0);
  });
});

describe('grenade authority and replication', () => {
  it('consumes one charge per monotonic input, never on retransmit or out-of-order frames', () => {
    const sim = make(false), player = sim['players'].get('host')!;
    sim.setInput('host', input(1, 1)); sim.tick(50);
    sim.setInput('host', input(2, 1)); sim.tick(50);
    sim.setInput('host', input(1, 2)); sim.tick(50);
    expect(player.grenades).toBe(1); expect(sim.createSnapshot().grenades).toHaveLength(1);
    sim.setInput('host', input(3, 2)); sim.tick(50);
    sim.setInput('host', input(4, 3)); sim.tick(50);
    expect(player.grenades).toBe(0); expect(sim.createSnapshot().grenades).toHaveLength(2);
  });
  it('recharges sequentially to capacity', () => {
    const sim = make(false), player = sim['players'].get('host')!;
    sim['throwGrenade'](player); sim['throwGrenade'](player);
    sim['elapsedMs'] = GRENADE_RECHARGE_MS; sim['updateOrdnance'](0); expect(player.grenades).toBe(1);
    sim['elapsedMs'] += GRENADE_RECHARGE_MS; sim['updateOrdnance'](0); expect(player.grenades).toBe(2); expect(player.grenadeRechargeRemainingMs).toBe(0);
  });
  it('explodes once, damages enemies with distance falloff, and leaves squad health intact', () => {
    const sim = make(false), player = sim['players'].get('host')!, near = target(sim, player.x + 30, player.y), far = target(sim, player.x + 170, player.y), outside = target(sim, player.x + 300, player.y);
    sim['grenades'].push({ id: 99, ownerId: player.id, x: player.x, y: player.y, z: 24, vx: 0, vy: 0, vz: 0, fuseMs: 0 });
    sim['updateOrdnance'](0);
    expect(near.maxHealth - near.health).toBeGreaterThan(far.maxHealth - far.health); expect(outside.health).toBe(outside.maxHealth); expect(player.health).toBe(player.maxHealth);
    sim['updateOrdnance'](0);
    expect(sim.createSnapshot().combatEvents.filter(event => event.kind === 'grenade_detonated')).toHaveLength(1);
  });
  it('blocks a blast through solid city cover', () => {
    const sim = make(false), player = sim['players'].get('host')!, wall = getWorldObstacles('neon_bastion').find(obstacle => obstacle.width < 150 && obstacle.elevation > 30)!;
    expect(wall).toBeDefined();
    const x = wall.x - 8, y = wall.y + wall.height / 2;
    const enemy = target(sim, wall.x + wall.width + 8, y);
    sim['grenades'].push({ id: 99, ownerId: player.id, x, y, z: 24, vx: 0, vy: 0, vz: 0, fuseMs: 0 });
    sim['updateOrdnance'](0); expect(enemy.health).toBe(enemy.maxHealth);
  });
  it('discards grenade presses while downed instead of queuing a throw on revival', () => {
    const sim = make(false); sim.addPlayer({ id:'ally',label:'Ally',color:'#fff' });
    const player = sim['players'].get('host')!; player.lifeState = 'downed'; player.health = 0; player.downedRemainingMs = 10000;
    sim.setInput('host', input(1,1)); sim.tick(50);
    player.lifeState = 'alive'; player.health = player.maxHealth;
    sim.setInput('host', input(2,1)); sim.tick(50);
    expect(player.grenades).toBe(2); expect(sim.createSnapshot().grenades).toHaveLength(0);
  });
  it('smooths grenade motion for guests without altering host fuse or charge state', () => {
    const sim = make(), player = sim['players'].get('host')!; sim['throwGrenade'](player);
    const previous = sim.createSnapshot(); sim.tick(50); const current = sim.createSnapshot();
    const pooled = new CoopSnapshotInterpolator();
    for (const presentation of [interpolateCoopSnapshot(previous,current,.5), pooled.interpolate(previous,current,.5)]) {
      expect(presentation.grenades![0].x).toBeCloseTo((previous.grenades![0].x + current.grenades![0].x) / 2);
      expect(presentation.grenades![0].fuseMs).toBe(current.grenades![0].fuseMs);
      expect(presentation.players[0].grenades).toBe(current.players[0].grenades);
    }
    expect(previous.grenades![0].fuseMs).toBe(1600);
  });
  it('round-trips grenades, telegraphs, mana and charge timers through independent snapshot deltas', () => {
    const sim = make(), first = sim.createSnapshot(), player = sim['players'].get('host')!;
    sim['throwGrenade'](player); player.selectedSlot = 2; sim['castSpell'](player, 'rift_meteor', 1); sim.tick(50);
    const second = sim.createSnapshot(), delta = createSnapshotDelta(first, second, 100), decoder = new SnapshotDecoder();
    expect(delta.entities?.grenades).toBeDefined(); expect(delta.entities?.spellZones).toBeDefined();
    decoder.decode({ format: 'coop_snapshot_full', snapshot: first }, 100);
    expect(decoder.decode(delta, 101)).toEqual(second);
  });
});
