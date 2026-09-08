import { describe, expect, it, vi } from 'vitest';
import { COOP_MAX_ENEMIES, CoopSimulation, quantizeAngle, quantizePitch } from './CoopSimulation';
import { COOP_FIELD_MISSION_REWARDS } from './CoopFieldMissions';
import { MULTIPLAYER_PROTOCOL_VERSION, type MultiplayerInputFrame } from './protocol';

let sequence = 0;
const input = (overrides: Partial<MultiplayerInputFrame> = {}): MultiplayerInputFrame => ({
  type: 'input', version: MULTIPLAYER_PROTOCOL_VERSION, sequence: ++sequence, clientTime: 0,
  movement: 0, aimAngle: quantizeAngle(0), aimPitch: quantizePitch(0), selectedSlot: 0,
  firing: false, aiming: false, sprinting: false, sliding: false, reviving: false,
  jumpPressed: false, dashPressed: false, ...overrides,
});

const squad = () => new CoopSimulation([
  { id: 'host', label: 'Host', color: '#22d3ee' },
  { id: 'guest', label: 'Guest', color: '#f472b6' },
], 8128, 'mission-test');

function acceptMission(simulation: CoopSimulation, kind: keyof typeof COOP_FIELD_MISSION_REWARDS) {
  const site = simulation.createSnapshot().fieldMissions!.sites.find(candidate => candidate.kind === kind)!;
  const host = (simulation as any).players.get('host');
  host.x = site.x; host.y = site.y;
  expect(simulation.acceptFieldMission('host', site.id)).toBe(true);
  return (simulation as any).fieldMissionDirector.current;
}

function activateOpeningStation(simulation: CoopSimulation) {
  const station = simulation.createSnapshot().buyStations[0];
  const host = (simulation as any).players.get('host');
  host.x = station.x; host.y = station.y;
  (simulation as any).stationDirector.update(station.captureRequiredMs, [{ ...host, radius: 19 }], []);
  return simulation.createSnapshot().buyStations[0];
}

function holdMissionObjective(simulation: CoopSimulation, x: number, y: number, durationMs: number) {
  const host = (simulation as any).players.get('host');
  host.x = x; host.y = y; host.z = 0;
  simulation.setInput('host', input({ reviving: true }));
  (simulation as any).updateFieldMission(durationMs);
}

function expectSquadPayout(simulation: CoopSimulation, amount: number) {
  const players = simulation.createSnapshot().players;
  expect(players.find(player => player.id === 'host')?.coins).toBe(amount);
  expect(players.find(player => player.id === 'guest')?.coins).toBe(amount);
  expect(simulation.createSnapshot().fieldMissions).toMatchObject({ completedCount: 1, active: undefined });
}

describe('CoopSimulation field missions', () => {
  it('loads the Chem Commander and red enclave inside the gas before Toxic Hunt is accepted', () => {
    const simulation = squad();
    const snapshot = simulation.createSnapshot();
    const toxicSite = snapshot.fieldMissions!.sites.find(site => site.kind === 'toxic_hunt')!;
    const commander = snapshot.enemies.find(enemy => enemy.missionId === toxicSite.id && enemy.missionRole === 'target');
    const guards = snapshot.enemies.filter(enemy => enemy.missionId === toxicSite.id && enemy.missionRole === 'guard');
    expect(snapshot.fieldMissions!.active).toBeUndefined();
    expect(commander).toMatchObject({ archetypeName: 'CHEM COMMANDER', color: '#ef4444' });
    expect(guards).toHaveLength(8);
    expect(guards.every(enemy => enemy.color === '#dc2626')).toBe(true);
    expect([commander!, ...guards].every(enemy => Math.hypot(enemy.x - snapshot.gasZone.x, enemy.y - snapshot.gasZone.y) < snapshot.gasZone.radius)).toBe(true);
  });

  it('moves the unaccepted Chem Commander and all surviving minions with the gas', () => {
    const simulation = squad();
    const internals = simulation as any;
    const enclave = internals.gasEnclave;
    const trackedIds = [enclave.commanderId, ...enclave.guardIds];
    const before = new Map<number, { x: number; y: number }>(internals.enemies.filter((enemy: any) => trackedIds.includes(enemy.id)).map((enemy: any) => [enemy.id, { x: enemy.x, y: enemy.y }]));
    internals.gasZone.x += 140;
    internals.gasZone.y -= 90;
    internals.updateGasEnclave();
    for (const enemy of internals.enemies.filter((candidate: any) => trackedIds.includes(candidate.id))) {
      const origin = before.get(enemy.id)!;
      expect(enemy.x - origin.x).toBeCloseTo(140, 5);
      expect(enemy.y - origin.y).toBeCloseTo(-90, 5);
      expect(Math.hypot(enemy.x - internals.gasZone.x, enemy.y - internals.gasZone.y)).toBeLessThan(internals.gasZone.radius);
    }
  });

  it('removes unaccepted Toxic Hunt with no payout when the commander dies early', () => {
    const simulation = squad();
    const before = simulation.createSnapshot();
    const toxicSite = before.fieldMissions!.sites.find(site => site.kind === 'toxic_hunt')!;
    simulation.addMissionPing('host', toxicSite.id);
    const commander = (simulation as any).enemies.find((enemy: any) => enemy.missionId === toxicSite.id && enemy.missionRole === 'target');
    (simulation as any).applyDamage(commander, commander.health, 'host', 'plasma_gun');

    const after = simulation.createSnapshot();
    expect(after.fieldMissions!.sites.some(site => site.id === toxicSite.id)).toBe(false);
    expect(after.fieldMissions).toMatchObject({ active: undefined, completedCount: 0 });
    expect(after.players.every(player => player.coins === 0)).toBe(true);
    expect(after.pings).toHaveLength(0);
    expect(after.combatEvents.some(event => event.kind === 'mission_expired')).toBe(true);
    expect(after.enemies.filter(enemy => !enemy.dying).every(enemy => enemy.missionId !== toxicSite.id && enemy.missionRole === undefined)).toBe(true);
    expect(simulation.acceptFieldMission('host', toxicSite.id)).toBe(false);
  });

  it('resolves long-lived map pings to the authoritative mission location', () => {
    const simulation = squad();
    const site = simulation.createSnapshot().fieldMissions!.sites.find(candidate => candidate.kind === 'hostage_recovery')!;
    const pickupPing = simulation.addMissionPing('host', site.id)!;
    expect(pickupPing).toMatchObject({ x: site.x, y: site.y, kind: 'objective', labelKey: 'ping.mission', missionSiteId: site.id });
    expect(pickupPing.expiresAtMs - pickupPing.createdAtMs).toBe(45_000);
    expect(simulation.addMissionPing('host', 999_999)).toBeUndefined();

    acceptMission(simulation, 'hostage_recovery');
    const active = simulation.createSnapshot().fieldMissions!.active!;
    const objectivePing = simulation.addMissionPing('host', site.id)!;
    expect(objectivePing).toMatchObject({ x: active.x, y: active.y, missionSiteId: site.id });
    expect(simulation.createSnapshot().pings?.filter(ping => ping.playerId === 'host')).toHaveLength(1);
  });

  it('awards the full toxic-hunt payout to every operator enrolled at pickup', () => {
    const simulation = squad();
    const mission = acceptMission(simulation, 'toxic_hunt');
    simulation.addMissionPing('host', mission.id);
    const target = (simulation as any).enemies.find((enemy: any) => mission.targetEnemyIds.includes(enemy.id));
    (simulation as any).players.get('guest').lifeState = 'eliminated';
    (simulation as any).applyDamage(target, target.health, 'host', 'plasma_gun');

    const players = simulation.createSnapshot().players;
    expect(players.find(player => player.id === 'host')?.coins).toBe(COOP_FIELD_MISSION_REWARDS.toxic_hunt);
    expect(players.find(player => player.id === 'guest')?.coins).toBe(COOP_FIELD_MISSION_REWARDS.toxic_hunt);
    expect(simulation.createSnapshot().fieldMissions).toMatchObject({ completedCount: 1, active: undefined });
    expect(simulation.createSnapshot().pings).toHaveLength(0);
    expect((simulation as any).enemies.filter((enemy: any) => !enemy.dying).every((enemy: any) => enemy.missionId === undefined && enemy.missionRole === undefined)).toBe(true);
  });

  it('does not add a late joiner to a payout that was already locked to the squad', () => {
    const simulation = squad();
    const mission = acceptMission(simulation, 'toxic_hunt');
    expect(simulation.addPlayer({ id: 'late', label: 'Late', color: '#fbbf24' })).toBe(true);
    const target = (simulation as any).enemies.find((enemy: any) => mission.targetEnemyIds.includes(enemy.id));
    (simulation as any).applyDamage(target, target.health, 'host', 'plasma_gun');
    expect(simulation.createSnapshot().players.find(player => player.id === 'late')?.coins).toBe(0);
    expect(simulation.createSnapshot().players.filter(player => player.id !== 'late').every(player => player.coins === COOP_FIELD_MISSION_REWARDS.toxic_hunt)).toBe(true);
  });

  it('completes both demolition sites in order and pays the enrolled squad', () => {
    const simulation = squad();
    const mission = acceptMission(simulation, 'demolition');
    holdMissionObjective(simulation, mission.points[0].x, mission.points[0].y, 4_000);
    expect(mission).toMatchObject({ stage: 'defend_a', progress: 0, required: 20_000 });
    expect(mission.points[0].state).toBe('defending');

    (simulation as any).updateFieldMission(20_000);
    expect(mission).toMatchObject({ stage: 'plant_b', progress: 0, required: 4_000, timerRemainingMs: 90_000 });
    expect(mission.points.map((point: any) => point.state)).toEqual(['completed', 'available']);
    expect(simulation.createSnapshot().combatEvents.some(event => event.kind === 'demolition_charge_detonated' && event.amount === 1)).toBe(true);
    holdMissionObjective(simulation, mission.points[1].x, mission.points[1].y, 4_000);
    expect(mission.stage).toBe('defend_b');
    expect(simulation.createSnapshot().combatEvents.some(event => event.kind === 'demolition_charge_planted' && event.amount === 2)).toBe(true);
    (simulation as any).updateFieldMission(20_000);
    expect(simulation.createSnapshot().combatEvents.some(event => event.kind === 'demolition_charge_detonated' && event.amount === 2)).toBe(true);
    expectSquadPayout(simulation, COOP_FIELD_MISSION_REWARDS.demolition);
  });

  it('replicates interrupted demolition planting and visibly resets after the progress decays', () => {
    const simulation = squad();
    const mission = acceptMission(simulation, 'demolition');
    holdMissionObjective(simulation, mission.points[0].x, mission.points[0].y, 1_500);
    expect(mission).toMatchObject({ stage: 'plant_a', progress: 1_500 });
    expect(mission.points[0].state).toBe('arming');

    simulation.setInput('host', input({ reviving: false }));
    (simulation as any).updateFieldMission(1_000);
    expect(mission.progress).toBe(1_100);
    expect(mission.points[0].state).toBe('arming');
    (simulation as any).updateFieldMission(3_000);
    expect(mission.progress).toBe(0);
    expect(mission.points[0].state).toBe('available');
  });

  it('activates and uploads the signal relay only while the squad controls it', () => {
    const simulation = squad();
    const mission = acceptMission(simulation, 'signal_hijack');
    const relay = mission.points[0];
    holdMissionObjective(simulation, relay.x, relay.y, 3_000);
    expect(mission).toMatchObject({ stage: 'upload', progress: 0, required: 45_000 });
    expect(relay.state).toBe('defending');

    (simulation as any).enemies = [];
    holdMissionObjective(simulation, relay.x, relay.y, 45_000);
    expectSquadPayout(simulation, COOP_FIELD_MISSION_REWARDS.signal_hijack);
  });

  it('rescues, carries, and extracts the hostage before paying the squad', () => {
    const simulation = squad();
    const mission = acceptMission(simulation, 'hostage_recovery');
    for (const guardId of [...mission.guardEnemyIds]) {
      const guard = (simulation as any).enemies.find((enemy: any) => enemy.id === guardId);
      (simulation as any).applyDamage(guard, guard.health, 'host', 'plasma_gun');
    }
    (simulation as any).updateFieldMission(50);
    expect(mission).toMatchObject({ stage: 'escort', progress: 0, required: 1_500 });
    expect(mission.points.map((point: any) => point.state)).toEqual(['arming', 'locked']);

    const host = (simulation as any).players.get('host');
    host.x = mission.hostage.x; host.y = mission.hostage.y;
    (simulation as any).items = [];
    holdMissionObjective(simulation, mission.hostage.x, mission.hostage.y, 1_500);
    expect(mission.hostage).toMatchObject({ state: 'carried', carrierId: 'host' });
    expect(mission.points[1].state).toBe('available');
    holdMissionObjective(simulation, mission.points[1].x, mission.points[1].y, 10_000);
    expect(host.carryingHostage).toBe(false);
    expectSquadPayout(simulation, COOP_FIELD_MISSION_REWARDS.hostage_recovery);
  });

  it('keeps intercepting until all couriers die, recovers every drive, then delivers them', () => {
    const simulation = squad();
    const mission = acceptMission(simulation, 'courier_intercept');
    const courierIds = [...mission.courierEnemyIds];
    for (let index = 0; index < courierIds.length; index++) {
      const courier = (simulation as any).enemies.find((enemy: any) => enemy.id === courierIds[index]);
      (simulation as any).applyDamage(courier, courier.health, 'host', 'plasma_gun');
      expect(mission.stage).toBe(index === courierIds.length - 1 ? 'recover' : 'intercept');
      expect(mission.drives).toHaveLength(index + 1);
    }

    const host = (simulation as any).players.get('host');
    for (const drive of mission.drives) {
      host.x = drive.x; host.y = drive.y;
      (simulation as any).items = [];
      (simulation as any).ammoCaches = [];
      (simulation as any).handleFieldInteraction(host);
    }
    expect(mission).toMatchObject({ stage: 'deliver', progress: 0, required: 3_000 });
    expect(mission.drives.every((drive: any) => drive.collected)).toBe(true);
    holdMissionObjective(simulation, mission.points[3].x, mission.points[3].y, 3_000);
    expectSquadPayout(simulation, COOP_FIELD_MISSION_REWARDS.courier_intercept);
  });

  it('rolls a contract pickup back if its critical targets cannot be spawned', () => {
    const simulation = squad();
    const site = simulation.createSnapshot().fieldMissions!.sites.find(candidate => candidate.kind === 'courier_intercept')!;
    const host = (simulation as any).players.get('host');
    host.x = site.x; host.y = site.y;
    vi.spyOn(simulation as any, 'spawnMissionEnemy').mockReturnValue(undefined);
    expect(simulation.acceptFieldMission('host', site.id)).toBe(false);
    expect(simulation.createSnapshot().fieldMissions!.active).toBeUndefined();
    expect(simulation.createSnapshot().fieldMissions!.sites.find(candidate => candidate.id === site.id)?.state).toBe('available');
  });

  it('reserves room for priority mission enemies without exceeding the global cap', () => {
    const simulation = squad();
    simulation.adminSpawn('basic', 40, 'host');
    simulation.adminSpawn('fast', 40, 'host');
    simulation.adminSpawn('ranged', 40, 'host');
    expect(simulation.createSnapshot().enemies).toHaveLength(COOP_MAX_ENEMIES);
    const mission = acceptMission(simulation, 'toxic_hunt');
    const enemies = simulation.createSnapshot().enemies;
    expect(enemies.length).toBeLessThanOrEqual(COOP_MAX_ENEMIES);
    expect(enemies.some(enemy => mission.targetEnemyIds.includes(enemy.id) && enemy.missionRole === 'target')).toBe(true);
  });

  it('keeps mission guards on their objective until the squad enters engagement range', () => {
    const simulation = squad();
    const mission = acceptMission(simulation, 'toxic_hunt');
    const host = (simulation as any).players.get('host');
    const guest = (simulation as any).players.get('guest');
    host.x = 100; host.y = 100; guest.x = 140; guest.y = 100;
    const guard = (simulation as any).enemies.find((enemy: any) => mission.guardEnemyIds.includes(enemy.id) && enemy.type === 'basic');
    const initialDistance = Math.hypot(guard.x - guard.missionAnchorX, guard.y - guard.missionAnchorY);
    for (let index = 0; index < 20; index++) simulation.tick(50);
    expect(Math.hypot(guard.x - guard.missionAnchorX, guard.y - guard.missionAnchorY)).toBeLessThanOrEqual(initialDistance + 1);
    expect(Math.hypot(guard.x - host.x, guard.y - host.y)).toBeGreaterThan(700);

    (simulation as any).gasZone.x += 120;
    (simulation as any).gasZone.y += 80;
    (simulation as any).updateGasEnclave();
    expect(guard).toMatchObject({ missionAnchorX: (simulation as any).gasZone.x, missionAnchorY: (simulation as any).gasZone.y });
  });

  it('makes the hostage carrier slower, non-sprinting, unable to jet, and unable to fire', () => {
    const simulation = squad();
    const mission = acceptMission(simulation, 'hostage_recovery');
    for (const guardId of [...mission.guardEnemyIds]) {
      const guard = (simulation as any).enemies.find((enemy: any) => enemy.id === guardId);
      (simulation as any).applyDamage(guard, guard.health, 'host', 'plasma_gun');
    }
    simulation.tick(50);
    const hostage = (simulation as any).fieldMissionDirector.current.hostage;
    const host = (simulation as any).players.get('host');
    host.x = hostage.x; host.y = hostage.y;
    const magazineBefore = host.weaponStates[0].magazineAmmo;
    simulation.setInput('host', input({ reviving: true, firing: true, fireActionId: 1 }));
    (simulation as any).updateFieldMission(1_500);
    expect(simulation.createSnapshot().players.find(player => player.id === 'host')).toMatchObject({ carryingHostage: true });
    expect(host.weaponStates[0].magazineAmmo).toBe(magazineBefore);

    simulation.setInput('host', input({ movement: 1, sprinting: true, jetHeld: true, firing: true, fireActionId: 2 }));
    simulation.tick(50);
    expect(simulation.createSnapshot().players.find(player => player.id === 'host')).toMatchObject({ carryingHostage: true, sprinting: false, jetActive: false });
    expect(host.weaponStates[0].magazineAmmo).toBe(magazineBefore);

    (simulation as any).downPlayer(host);
    expect((simulation as any).fieldMissionDirector.current).toMatchObject({
      progress: 0, required: 1_500,
      hostage: { state: 'waiting', carrierId: undefined, x: host.x, y: host.y },
      points: [{ state: 'arming' }, { state: 'locked' }],
    });
    expect(simulation.createSnapshot().combatEvents.some(event => event.kind === 'mission_stage' && event.amount === -2)).toBe(true);
  });

  it('cannot soft-lock hostage security on a stale or externally removed captor', () => {
    const simulation = squad();
    const mission = acceptMission(simulation, 'hostage_recovery');
    (simulation as any).enemies = (simulation as any).enemies.filter((enemy: any) => !mission.guardEnemyIds.includes(enemy.id));
    (simulation as any).updateFieldMission(50);
    expect(mission).toMatchObject({ stage: 'escort', progress: 0, required: 1_500 });
    expect(mission.guardEnemyIds).toHaveLength(0);
    expect(mission.hostage).toMatchObject({ state: 'waiting' });
  });

  it('locks the expensive private exfil until progress, then extracts only operators inside it', () => {
    const simulation = squad();
    const station = activateOpeningStation(simulation);
    const host = (simulation as any).players.get('host');
    host.coins = 2_000;
    expect(simulation.purchase('host', station.id, 'private_exfil')).toEqual({ code: 'exfil_locked' });

    const director = (simulation as any).fieldMissionDirector;
    const firstSite = director.snapshot().sites[0];
    director.accept(firstSite.id, ['host', 'guest'], { x: 2_000, y: 2_000 });
    director.complete();
    expect(simulation.purchase('host', station.id, 'private_exfil')).toBeUndefined();
    expect(host.coins).toBe(500);
    expect(simulation.createSnapshot().privateExfil).toMatchObject({ state: 'inbound', arrivalRemainingMs: 20_000, holdRequiredMs: 10_000 });
    expect(simulation.purchase('host', station.id, 'private_exfil')).toEqual({ code: 'exfil_called' });

    const exfil = (simulation as any).privateExfil;
    exfil.state = 'active'; exfil.arrivalRemainingMs = 0; exfil.holdRequiredMs = 100;
    host.x = exfil.x; host.y = exfil.y;
    const guest = (simulation as any).players.get('guest');
    guest.x = exfil.x + exfil.radius + 500; guest.y = exfil.y;
    simulation.tick(50); simulation.tick(50);
    const players = simulation.createSnapshot().players;
    expect(players.find(player => player.id === 'host')?.lifeState).toBe('extracted');
    expect(players.find(player => player.id === 'guest')?.lifeState).toBe('alive');
    expect(simulation.createSnapshot().results).toBeUndefined();
  });
});
