import { describe, expect, it } from 'vitest';
import { isWorldPositionClear } from '../world/WorldLayout';
import { CoopSimulation } from './CoopSimulation';
import {
  COOP_STRUCTURE_DEFINITIONS,
  COOP_RECOVERY_RELAY_HEAL_PER_SECOND,
  COOP_FABRICATOR_RECHARGE_MS,
  COOP_MAX_FABRICATOR_CHARGES,
  arcFenceShock,
  getBarricadeWallContact,
  hardlightBastionSegmentHit,
  isStructurePlacementClear,
  resolveBarricadeCollision,
  structureContainsCircle,
  snapCoopStructurePose,
  validateCoopBuildPreview,
  type CoopStructureSnapshot,
  type CoopStructureType,
} from './CoopFieldEngineering';

const structure = (type: CoopStructureType, overrides: Partial<CoopStructureSnapshot> = {}): CoopStructureSnapshot => ({
  id: 1, type, ownerId: 'host', ownerColor: '#22d3ee', x: 1_000, y: 1_000, angle: 0,
  health: COOP_STRUCTURE_DEFINITIONS[type].maxHealth, maxHealth: COOP_STRUCTURE_DEFINITIONS[type].maxHealth,
  state: 'active', createdAtMs: 0, expiresAtMs: 120_000, ...overrides,
});

function validPose(simulation: CoopSimulation, type: CoopStructureType) {
  const snapshot = simulation.createSnapshot();
  const player = snapshot.players[0];
  for (let ring = 145; ring <= 270; ring += 25) for (let step = 0; step < 32; step++) {
    const angle = step / 32 * Math.PI * 2;
    const pose = { x: player.x + Math.cos(angle) * ring, y: player.y + Math.sin(angle) * ring, angle };
    if (!validateCoopBuildPreview(snapshot, player.id, type, pose.x, pose.y, pose.angle)) return pose;
  }
  throw new Error(`No valid ${type} pose found near deterministic spawn`);
}

describe('Coop Field Engineering', () => {
  it('resolves a circle out of an oriented hardlight barricade', () => {
    const body = { x: 1_000, y: 1_010 };
    expect(resolveBarricadeCollision(body, 19, structure('barricade'))).toBe(true);
    expect(structureContainsCircle(structure('barricade'), body.x, body.y, 18)).toBe(false);
  });

  it('detects resting wall contact without moving the player', () => {
    const barricade = structure('barricade', { angle: Math.PI / 2 });
    const body = { x: barricade.x - 17 - 19, y: barricade.y };
    const contact = getBarricadeWallContact(body, 19, barricade);
    expect(contact?.normalX).toBeCloseTo(-1);
    expect(contact?.normalY).toBeCloseTo(0);
    expect(body).toEqual({ x: barricade.x - 36, y: barricade.y });
  });

  it('keeps fences soft while exposing their complete shock line', () => {
    const fence = structure('arc_fence', { angle: Math.PI / 4 });
    const body = { x: fence.x, y: fence.y };
    expect(structureContainsCircle(fence, body.x, body.y, 14)).toBe(true);
    expect(resolveBarricadeCollision(body, 19, fence)).toBe(false);
    expect(body).toEqual({ x: fence.x, y: fence.y });
  });

  it('treats a Bastion as one sealed four-wall shell with a usable interior', () => {
    const bastion = structure('hardlight_bastion');
    const inside = { x: bastion.x, y: bastion.y };
    const wall = { x: bastion.x, y: bastion.y - 133 };
    expect(structureContainsCircle(bastion, inside.x, inside.y, 19)).toBe(false);
    expect(resolveBarricadeCollision(inside, 19, bastion)).toBe(false);
    expect(resolveBarricadeCollision(wall, 19, bastion)).toBe(true);
    expect(hardlightBastionSegmentHit(bastion, bastion.x, bastion.y - 220, bastion.x, bastion.y)).toMatchObject({ normalX: 0, normalY: -1 });
  });

  it('builds a two-charge Bastion with its short emergency lifetime', () => {
    const simulation = new CoopSimulation([{ id: 'host', label: 'Host', color: '#22d3ee' }], 0x51a7);
    const pose = validPose(simulation, 'hardlight_bastion');
    expect(simulation.buildStructure('host', 'hardlight_bastion', pose.x, pose.y, pose.angle, 1)).toBeUndefined();
    const snapshot = simulation.createSnapshot();
    const bastion = snapshot.structures?.[0];
    expect(bastion).toMatchObject({ type: 'hardlight_bastion', health: 1_050, maxHealth: 1_050 });
    expect(bastion!.expiresAtMs - bastion!.createdAtMs).toBe(14_000);
    expect(snapshot.players[0].fabricatorCharges).toBe(0);
  });

  it('gives the arc fence a meaningful control profile with explicit resistances', () => {
    expect(arcFenceShock('basic', 100)).toEqual({ damage: 28, stunMs: 460 });
    expect(arcFenceShock('fast', 100).stunMs).toBeGreaterThan(arcFenceShock('tank', 1_000).stunMs);
    expect(arcFenceShock('elite', 2_000).damage).toBeGreaterThan(40);
    expect(arcFenceShock('titan', 20_000).stunMs).toBe(0);
    expect(arcFenceShock('phantom', 500)).toEqual({ damage: 0, stunMs: 0 });
  });

  it('authoritatively damages, stuns, and emits a visible arc when a fence triggers', () => {
    const simulation = new CoopSimulation([{ id: 'host', label: 'Host', color: '#22d3ee' }], 0x51a7);
    const pose = validPose(simulation, 'arc_fence');
    expect(simulation.buildStructure('host', 'arc_fence', pose.x, pose.y, pose.angle, 1)).toBeUndefined();
    const fence = (simulation as any).structures[0];
    const enemy = {
      id: 990, x: fence.x, y: fence.y, health: 100, maxHealth: 100, type: 'basic', color: '#f00', radius: 16,
      damage: 10, speed: 100, experienceValue: 1, hitFlashMs: 0, hitFlashUntilMs: 0, slowMultiplier: 1,
      isHolder: false, dying: false, deathRemainingMs: 0, targetLeaseUntilMs: 0,
    };
    (simulation as any).updateEnemyStructureInteractions(enemy, 50);
    expect(enemy.health).toBe(72);
    expect((enemy as any).structureStunUntilMs).toBe(460);
    expect(fence.pulseAtMs).toBe(0);
    expect(simulation.createSnapshot().combatEvents.some(event => event.kind === 'fence_triggered' && event.targetX === enemy.x)).toBe(true);
  });

  it('rejects occupied footprints before the host spends a charge', () => {
    let clear = { x: 0, y: 0 };
    outer: for (let y = 200; y < 11_800; y += 200) for (let x = 200; x < 11_800; x += 200) {
      if (isWorldPositionClear(x, y, 140)) { clear = { x, y }; break outer; }
    }
    expect(clear.x).toBeGreaterThan(0);
    expect(isStructurePlacementClear('barricade', clear.x, clear.y, 0, [{ ...clear, radius: 19 }], [])).toBe(false);
  });

  it('validates range and blueprint on the host and spends personal charges on success', () => {
    const simulation = new CoopSimulation([{ id: 'host', label: 'Host', color: '#22d3ee' }], 0x51a7);
    const player = simulation.createSnapshot().players[0];
    expect(simulation.buildStructure('host', 'unknown', player.x + 180, player.y, 0)?.code).toBe('invalid_blueprint');
    expect(simulation.buildStructure('host', 'barricade', player.x + 2_000, player.y, 0)?.code).toBe('range');

    let built = false;
    for (let ring = 150; ring <= 380 && !built; ring += 35) {
      for (let step = 0; step < 24 && !built; step++) {
        const angle = step / 24 * Math.PI * 2;
        built = simulation.buildStructure('host', 'recovery_relay', player.x + Math.cos(angle) * ring, player.y + Math.sin(angle) * ring, 0) === undefined;
      }
    }
    expect(built).toBe(true);
    const snapshot = simulation.createSnapshot();
    expect(snapshot.structures).toHaveLength(1);
    expect(snapshot.structures?.[0].type).toBe('recovery_relay');
    expect(snapshot.players[0].fabricatorCharges).toBe(0);
    expect(simulation.buildStructure('host', 'barricade', player.x + 200, player.y, 0)).toEqual({ code: 'charges', amount: 1 });
  });

  it('uses the same placement contract for the hologram and authoritative host', () => {
    const simulation = new CoopSimulation([{ id: 'host', label: 'Host', color: '#22d3ee' }], 0x51a7);
    const pose = validPose(simulation, 'barricade');
    expect(validateCoopBuildPreview(simulation.createSnapshot(), 'host', 'barricade', pose.x, pose.y, pose.angle)).toBeUndefined();
    expect(simulation.buildStructure('host', 'barricade', pose.x, pose.y, pose.angle, 4)).toBeUndefined();
    expect(validateCoopBuildPreview(simulation.createSnapshot(), 'host', 'barricade', pose.x, pose.y, pose.angle)?.code).toBe('obstructed');
  });

  it('allows valid field construction without a nearby tactical anchor', () => {
    const simulation = new CoopSimulation([{ id: 'host', label: 'Host', color: '#22d3ee' }], 0x51a7);
    const pose = validPose(simulation, 'barricade');
    (simulation as any).closestBuildAnchor = () => undefined;
    expect(simulation.buildStructure('host', 'barricade', pose.x, pose.y, pose.angle, 1)).toBeUndefined();
    expect(simulation.createSnapshot().structures?.[0].tacticalBonus).toBe(false);
  });

  it('rejects replayed build requests without spending another charge', () => {
    const simulation = new CoopSimulation([{ id: 'host', label: 'Host', color: '#22d3ee' }], 0x51a7);
    const pose = validPose(simulation, 'barricade');
    expect(simulation.buildStructure('host', 'barricade', pose.x, pose.y, pose.angle, 7)).toBeUndefined();
    expect(simulation.buildStructure('host', 'barricade', pose.x, pose.y, pose.angle, 7)).toEqual({ code: 'stale_request' });
    expect(simulation.createSnapshot().structures).toHaveLength(1);
    expect(simulation.createSnapshot().players[0].fabricatorCharges).toBe(1);
  });

  it('refunds a pristine, safe structure dismantled immediately by its owner', () => {
    const simulation = new CoopSimulation([{ id: 'host', label: 'Host', color: '#22d3ee' }], 0x51a7);
    const pose = validPose(simulation, 'barricade');
    expect(simulation.buildStructure('host', 'barricade', pose.x, pose.y, pose.angle, 1)).toBeUndefined();
    const built = simulation.createSnapshot().structures?.[0];
    expect(built).toBeDefined();
    expect(simulation.dismantleStructure('host', built!.id, 1)).toBeUndefined();
    const snapshot = simulation.createSnapshot();
    expect(snapshot.players[0].fabricatorCharges).toBe(2);
    expect(snapshot.structures?.[0].state).toBe('destroying');
  });

  it('restores living squad HP inside a recovery relay without overhealing', () => {
    const simulation = new CoopSimulation([{ id: 'host', label: 'Host', color: '#22d3ee' }], 0x51a7);
    const pose = validPose(simulation, 'recovery_relay');
    expect(simulation.buildStructure('host', 'recovery_relay', pose.x, pose.y, pose.angle, 1)).toBeUndefined();
    const player = (simulation as any).players.get('host');
    player.x = pose.x;
    player.y = pose.y;
    player.health = player.maxHealth - 4;
    (simulation as any).elapsedMs = 900;
    (simulation as any).updateStructures(900);
    expect(player.health).toBe(player.maxHealth);
    expect((simulation as any).runStats.get('host').engineeringHealing).toBe(4);
    expect(simulation.createSnapshot().combatEvents.find(event => event.kind === 'structure_healed')).toMatchObject({ playerId: 'host', amount: 4 });
    expect(COOP_RECOVERY_RELAY_HEAL_PER_SECOND).toBeGreaterThan(0);
  });

  it('renews fabricator charges on a deterministic timer up to the four-charge cap', () => {
    const simulation = new CoopSimulation([{ id: 'host', label: 'Host', color: '#22d3ee' }], 0x51a7);
    const pose = validPose(simulation, 'barricade');
    expect(simulation.buildStructure('host', 'barricade', pose.x, pose.y, pose.angle, 1)).toBeUndefined();
    (simulation as any).elapsedMs = COOP_FABRICATOR_RECHARGE_MS;
    (simulation as any).updateStructures(50);
    expect(simulation.createSnapshot().players[0].fabricatorCharges).toBe(2);
    const player = (simulation as any).players.get('host');
    player.fabricatorCharges = COOP_MAX_FABRICATOR_CHARGES;
    (simulation as any).elapsedMs += COOP_FABRICATOR_RECHARGE_MS;
    (simulation as any).updateStructures(50);
    expect(player.fabricatorCharges).toBe(COOP_MAX_FABRICATOR_CHARGES);
  });

  it('reinforces barricades and lets teammates operate shared structures', () => {
    const simulation = new CoopSimulation([
      { id: 'host', label: 'Host', color: '#22d3ee' },
      { id: 'guest', label: 'Guest', color: '#f472b6' },
    ], 0x51a7);
    const pose = validPose(simulation, 'barricade');
    expect(simulation.buildStructure('host', 'barricade', pose.x, pose.y, pose.angle, 1)).toBeUndefined();
    const guest = (simulation as any).players.get('guest');
    guest.x = pose.x; guest.y = pose.y;
    const built = (simulation as any).structures[0];
    const oldMaximum = built.maxHealth;
    expect(simulation.structureAction('guest', built.id, 'activate', 1)).toBeUndefined();
    expect(built).toMatchObject({ reinforced: true, maxHealth: oldMaximum + 320, health: oldMaximum + 320 });
    expect(guest.fabricatorCharges).toBe(1);
  });

  it('repairs the nearest damaged structure while holding the interaction key', () => {
    const simulation = new CoopSimulation([{ id: 'host', label: 'Host', color: '#22d3ee' }], 0x51a7);
    const pose = validPose(simulation, 'barricade');
    simulation.buildStructure('host', 'barricade', pose.x, pose.y, pose.angle, 1);
    const player = (simulation as any).players.get('host');
    const built = (simulation as any).structures[0];
    player.x = built.x; player.y = built.y;
    built.health -= 100; built.state = 'damaged';
    (simulation as any).inputByPlayer.set('host', { reviving: true });
    (simulation as any).updateStructures(1_000);
    expect(built.health).toBe(built.maxHealth - 45);
    expect(built.repairingPlayerId).toBe('host');
  });

  it('snaps compatible linear structures into a clean powered run', () => {
    const existing = structure('barricade', { x: 1_000, y: 1_000, angle: 0 });
    const snapped = snapCoopStructurePose('arc_fence', 1_210, 1_080, .7, [existing]);
    expect(snapped.angle).toBe(.7);
    const candidateEnd = { x: snapped.x - Math.cos(snapped.angle) * 130, y: snapped.y - Math.sin(snapped.angle) * 130 };
    expect(candidateEnd.x).toBeCloseTo(1_110, 0);
    expect(candidateEnd.y).toBeCloseTo(1_000, 0);
  });

  it('draws ordinary enemies to a Specter Decoy but not Phantoms', () => {
    const simulation = new CoopSimulation([{ id: 'host', label: 'Host', color: '#22d3ee' }], 0x51a7);
    const pose = validPose(simulation, 'decoy_beacon');
    expect(simulation.buildStructure('host', 'decoy_beacon', pose.x, pose.y, 0, 1)).toBeUndefined();
    const enemy = { type: 'basic', x: pose.x + 300, y: pose.y, targetLeaseUntilMs: 0 };
    const phantom = { type: 'phantom', x: pose.x + 300, y: pose.y, targetLeaseUntilMs: 0 };
    expect((simulation as any).resolveEnemyTarget(enemy).type).toBe('decoy_beacon');
    expect((simulation as any).resolveEnemyTarget(phantom).id).toBe('host');
  });

  it('turns relay activation into a charge-powered squad healing surge', () => {
    const simulation = new CoopSimulation([{ id: 'host', label: 'Host', color: '#22d3ee' }], 0x51a7);
    const pose = validPose(simulation, 'recovery_relay');
    simulation.buildStructure('host', 'recovery_relay', pose.x, pose.y, 0, 1);
    const player = (simulation as any).players.get('host');
    const relay = (simulation as any).structures[0];
    player.x = relay.x; player.y = relay.y; player.health = 40; player.fabricatorCharges = 1;
    expect(simulation.structureAction('host', relay.id, 'activate', 1)).toBeUndefined();
    expect(player.health).toBe(68);
    expect(player.fabricatorCharges).toBe(0);
    expect(simulation.createSnapshot().combatEvents.find(event => event.kind === 'structure_healed')).toMatchObject({ playerId: 'host', amount: 28 });
    expect(simulation.structureAction('host', relay.id, 'activate', 2)?.code).toBe('charges');
  });

  it('derives relay repair links without requiring persistent graph state', () => {
    const simulation = new CoopSimulation([{ id: 'host', label: 'Host', color: '#22d3ee' }], 0x51a7);
    const player = (simulation as any).players.get('host');
    const barricade = { ...structure('barricade', { id: 101, x: player.x + 120, y: player.y, health: 400 }), contextKey: 'field:101' };
    const relay = { ...structure('recovery_relay', { id: 102, x: player.x + 180, y: player.y }), contextKey: 'field:102' };
    (simulation as any).structures = [barricade, relay];
    (simulation as any).updateStructures(1_000);
    expect(barricade.linkedStructureIds).toContain(relay.id);
    expect(relay.linkedStructureIds).toContain(barricade.id);
    expect(barricade.health).toBe(409);
  });
});
