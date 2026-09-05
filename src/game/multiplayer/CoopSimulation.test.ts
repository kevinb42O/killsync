import { describe, expect, it } from 'vitest';
import { CoopSimulation, COOP_REVIVE_DURATION_MS, COOP_SAFE_INSERTION_MS, COOP_WEAPON_SLOTS, quantizeAngle, quantizePitch } from './CoopSimulation';
import { MULTIPLAYER_PROTOCOL_VERSION } from './protocol';

let sequence = 0;
const input = (overrides: Record<string, unknown> = {}) => ({ type: 'input' as const, version: MULTIPLAYER_PROTOCOL_VERSION, sequence: ++sequence, clientTime: 0, movement: 0, aimAngle: quantizeAngle(0), aimPitch: quantizePitch(0), selectedSlot: 0, firing: false, reloadPressed: false, aiming: false, sprinting: false, sliding: false, reviving: false, jumpPressed: false, dashPressed: false, ...overrides });
const sim = () => new CoopSimulation([{ id: 'host', label: 'Host', color: '#0ff' }]);

describe('CoopSimulation firearm authority', () => {
  it('deploys a visible, active Buy Station as soon as the match starts', () => {
    const snapshot = sim().createSnapshot();
    const station = snapshot.buyStations[0];
    expect(station).toMatchObject({ active: true, radius: 105 });
    expect(station.stock).toContain('emergency_reboot');
    expect(station.stock).toContain('orbit_drones');
    expect(Math.hypot(station.x - snapshot.players[0].x, station.y - snapshot.players[0].y)).toBeGreaterThan(700);
  });

  it('exposes exactly the five dedicated co-op firearms', () => {
    expect(COOP_WEAPON_SLOTS).toEqual(['plasma_gun', 'assault_rifle', 'combat_shotgun', 'sniper_rifle', 'smg']);
    const player = sim().createSnapshot().players[0];
    expect(player.weaponStates.map(weapon => [weapon.magazineAmmo, weapon.reserveAmmo])).toEqual([[12, 72], [30, 150], [8, 40], [5, 25], [40, 180]]);
  });

  it('uses magazines, auto reload, and host-side fire cadence', () => {
    const simulation = sim();
    const state = (simulation as any).players.get('host').weaponStates[0];
    state.magazineAmmo = 1;
    simulation.setInput('host', input({ firing: true })); simulation.tick(50);
    expect(simulation.createSnapshot().players[0].weaponStates[0]).toMatchObject({ magazineAmmo: 0, state: 'reloading' });
    const firstCount = simulation.createSnapshot().projectiles.length;
    simulation.tick(50); expect(simulation.createSnapshot().projectiles.length).toBe(firstCount);
    for (let i = 0; i < 28; i++) simulation.tick(50);
    expect(simulation.createSnapshot().players[0].weaponStates[0].magazineAmmo).toBeGreaterThan(0);
  });

  it('loads shotgun shells one at a time and lets a trigger interrupt it', () => {
    const simulation = sim();
    const player = (simulation as any).players.get('host'); player.selectedSlot = 2; player.selectedWeaponId = 'combat_shotgun'; player.weaponStates[2].magazineAmmo = 0;
    simulation.setInput('host', input({ selectedSlot: 2, reloadPressed: true })); simulation.tick(50);
    for (let i = 0; i < 10; i++) simulation.tick(50);
    const afterFirstShell = simulation.createSnapshot();
    expect(afterFirstShell.players[0].weaponStates[2].magazineAmmo).toBe(1);
    expect(afterFirstShell.combatEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'reload_shell_loaded', playerId: 'host', weaponId: 'combat_shotgun', amount: 1 }),
    ]));
    simulation.setInput('host', input({ selectedSlot: 2 })); for (let i = 0; i < 6; i++) simulation.tick(50);
    simulation.setInput('host', input({ selectedSlot: 2, firing: true })); simulation.tick(50);
    expect(simulation.createSnapshot().projectiles).toHaveLength(8);
  });

  it('applies deterministic shotgun pellets and host-authoritative ADS spread', () => {
    const simulation = sim();
    simulation.setInput('host', input({ selectedSlot: 2 })); for (let i = 0; i < 6; i++) simulation.tick(50);
    simulation.setInput('host', input({ selectedSlot: 2, firing: true })); simulation.tick(50);
    const pellets = simulation.createSnapshot().projectiles;
    expect(pellets).toHaveLength(8);
    expect(new Set(pellets.map(p => p.angle)).size).toBeGreaterThan(3);
    const sniper = sim(); sniper.setInput('host', input({ selectedSlot: 3, aiming: true })); for (let i = 0; i < 6; i++) sniper.tick(50); sniper.setInput('host', input({ selectedSlot: 3, aiming: true, firing: true })); sniper.tick(50);
    expect(sniper.createSnapshot().players[0]).toMatchObject({ selectedWeaponId: 'sniper_rifle', isAiming: true });
  });

  it('upgrades only the firearm selected at the authoritative XP tick', () => {
    const simulation = sim(); const player = simulation.createSnapshot().players[0];
    (simulation as any).gems.push({ id: 900, x: player.x, y: player.y, value: 120, color: '#0f0' }); simulation.tick(50);
    const result = simulation.createSnapshot().players[0];
    expect(result.weaponStates[0].level).toBe(2); expect(result.weaponStates.slice(1).every(weapon => weapon.level === 1)).toBe(true);
  });
});

describe('CoopSimulation encounter authority', () => {
  it('keeps authoritative entity ids instead of copying topology node ids', () => {
    const simulation = sim();
    const nextId = simulation['nextEntityId'];
    for (let index = 0; index < 20; index++) simulation['spawnEnemy']('basic', 'host', index);
    const ids = simulation.createSnapshot().enemies.map(enemy => enemy.id);
    expect(ids).toEqual(Array.from({ length: 20 }, (_, index) => nextId + index));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps the opening insertion enemy-free, then hands off to round-one topology spawns', () => {
    const simulation = sim();
    const player = simulation.createSnapshot().players[0];
    expect(simulation.createSnapshot().enemies).toHaveLength(0);
    for (let elapsed = 0; elapsed < COOP_SAFE_INSERTION_MS - 50; elapsed += 50) simulation.tick(50);
    expect(simulation.createSnapshot().enemies).toHaveLength(0);
    simulation.tick(50);
    const enemies = simulation.createSnapshot().enemies;
    expect(enemies.length).toBeGreaterThan(0);
    expect(enemies.every(enemy => Math.hypot(enemy.x - player.x, enemy.y - player.y) >= 720)).toBe(true);
  });

  it('keeps spawn cadence and composition independent from movement input', () => {
    const stationary = sim();
    const moving = sim();
    stationary.setInput('host', input({ movement: 0 }));
    moving.setInput('host', input({ movement: 1, aimAngle: quantizeAngle(Math.PI / 2) }));
    for (let elapsed = 0; elapsed < COOP_SAFE_INSERTION_MS; elapsed += 50) {
      stationary.tick(50);
      moving.tick(50);
    }
    const still = stationary.createSnapshot();
    const moved = moving.createSnapshot();
    expect(moved.encounter?.nextSpawnAtMs).toBe(still.encounter?.nextSpawnAtMs);
    expect(moved.enemies.map(enemy => [enemy.spawnPacketId, enemy.type])).toEqual(still.enemies.map(enemy => [enemy.spawnPacketId, enemy.type]));
    expect(moved.enemies[0].targetPlayerId).toBe('host');
  });
});

describe('CoopSimulation player lifecycle', () => {
  it('freezes gameplay after successful extraction', () => {
    const simulation = sim();
    simulation['finishRun'](true);
    const previous = simulation.createSnapshot();
    simulation.setInput('host', input({ movement: 1, firing: true }));
    simulation.tick(50);
    const current = simulation.createSnapshot();
    expect(current.players).toEqual(previous.players);
    expect(current.projectiles).toHaveLength(0);
    expect(current.results?.success).toBe(true);
  });

  it('ends a solo arena instead of leaving a zero-HP frozen match', () => {
    const simulation = sim();
    const host = (simulation as any).players.get('host');
    (simulation as any).damagePlayer(host, 999, host.x - 20, host.y);
    const snapshot = simulation.createSnapshot();
    expect(snapshot.matchState).toBe('solo_defeat');
    expect(snapshot.players[0]).toMatchObject({ health: 0, lifeState: 'eliminated' });
  });

  it('lets a living teammate hold F to revive a downed player at host-validated range', () => {
    const simulation = new CoopSimulation([
      { id: 'host', label: 'Host', color: '#0ff' },
      { id: 'guest', label: 'Guest', color: '#f0f' },
    ]);
    const host = (simulation as any).players.get('host');
    const guest = (simulation as any).players.get('guest');
    guest.x = host.x + 40; guest.y = host.y;
    (simulation as any).damagePlayer(host, 999, host.x - 20, host.y);
    expect(simulation.createSnapshot().players.find(player => player.id === 'host')).toMatchObject({ lifeState: 'downed' });
    simulation.setInput('guest', input({ reviving: true }));
    for (let elapsed = 0; elapsed < COOP_REVIVE_DURATION_MS; elapsed += 50) simulation.tick(50);
    const revived = simulation.createSnapshot().players.find(player => player.id === 'host')!;
    expect(revived.lifeState).toBe('alive');
    expect(revived.health).toBe(35);
    expect(revived.invulnerableRemainingMs).toBeGreaterThan(0);
  });

  it('keeps a downed teammate revivable after their timer while another teammate lives', () => {
    const simulation = new CoopSimulation([
      { id: 'host', label: 'Host', color: '#0ff' },
      { id: 'guest', label: 'Guest', color: '#f0f' },
    ]);
    const host = (simulation as any).players.get('host');
    const guest = (simulation as any).players.get('guest');
    (simulation as any).enemies = [];
    guest.x = host.x + 40; guest.y = host.y;
    (simulation as any).damagePlayer(host, 999, host.x - 20, host.y);
    // Jump to the final authoritative countdown tick—the behaviour at zero
    // matters here, not twenty seconds of unrelated contract simulation.
    host.downedRemainingMs = 50;
    simulation.tick(50);
    const downed = simulation.createSnapshot().players.find(player => player.id === 'host')!;
    expect(downed).toMatchObject({ lifeState: 'downed', downedRemainingMs: 0 });
    simulation.setInput('guest', input({ reviving: true }));
    for (let elapsed = 0; elapsed < COOP_REVIVE_DURATION_MS; elapsed += 50) simulation.tick(50);
    expect(simulation.createSnapshot().players.find(player => player.id === 'host')).toMatchObject({ lifeState: 'alive' });
  });

  it('cancels revive progress when the reviver is damaged or leaves range', () => {
    const simulation = new CoopSimulation([
      { id: 'host', label: 'Host', color: '#0ff' },
      { id: 'guest', label: 'Guest', color: '#f0f' },
    ]);
    const host = (simulation as any).players.get('host');
    const guest = (simulation as any).players.get('guest');
    guest.x = host.x + 40; guest.y = host.y;
    (simulation as any).damagePlayer(host, 999, 0, 0);
    simulation.setInput('guest', input({ reviving: true }));
    simulation.tick(500);
    expect((simulation as any).players.get('host').reviveProgressMs).toBeGreaterThan(0);
    (simulation as any).damagePlayer(guest, 1, 0, 0);
    expect((simulation as any).players.get('host')).toMatchObject({ reviveProgressMs: 0, reviverId: undefined });
    guest.x = host.x + 500;
    simulation.tick(50);
    expect((simulation as any).players.get('host').reviveProgressMs).toBe(0);
  });

  it('wipes a squad when no living operative remains', () => {
    const simulation = new CoopSimulation([
      { id: 'host', label: 'Host', color: '#0ff' },
      { id: 'guest', label: 'Guest', color: '#f0f' },
    ]);
    const players = (simulation as any).players;
    (simulation as any).damagePlayer(players.get('host'), 999, 0, 0);
    (simulation as any).damagePlayer(players.get('guest'), 999, 0, 0);
    expect(simulation.createSnapshot().matchState).toBe('squad_wiped');
  });
});
