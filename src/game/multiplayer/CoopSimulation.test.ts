import { describe, expect, it } from 'vitest';
import { CoopSimulation, COOP_MAX_ENCOUNTER_ENEMIES, COOP_MAX_ENEMIES, COOP_MAX_WORLD_GEMS, COOP_MAX_WORLD_ITEMS, COOP_REVIVE_DURATION_MS, COOP_SAFE_INSERTION_MS, COOP_STALE_INPUT_MS, COOP_WEAPON_SLOTS, quantizeAngle, quantizePitch } from './CoopSimulation';
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
    expect(player.weaponStates.map(weapon => [weapon.magazineAmmo, weapon.reserveAmmo])).toEqual([[12, 72], [60, 240], [8, 40], [5, 25], [60, 240]]);
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

  it('deduplicates redundant trigger actions and acknowledges the action id', () => {
    const simulation = sim();
    simulation.setInput('host', input({ firing: true, fireActionId: 7 })); simulation.tick(50);
    const firstMagazine = simulation.createSnapshot().players[0].weaponStates[0].magazineAmmo;
    for (let index = 0; index < 10; index++) { simulation.setInput('host', input({ firing: false, fireActionId: 7 })); simulation.tick(50); }
    simulation.setInput('host', input({ firing: true, fireActionId: 7 })); simulation.tick(50);
    const snapshot = simulation.createSnapshot();
    expect(snapshot.players[0].weaponStates[0].magazineAmmo).toBe(firstMagazine);
    expect(snapshot.players[0].lastProcessedFireAction).toBe(7);
  });

  it('fast-forwards remote projectiles by a bounded input age', () => {
    const normal = sim(), compensated = sim();
    normal.setInput('host', input({ firing: true, fireActionId: 1 }), 0); normal.tick(50);
    compensated.setInput('host', input({ firing: true, fireActionId: 1 }), 120); compensated.tick(50);
    expect(compensated.createSnapshot().projectiles[0].x).toBeGreaterThan(normal.createSnapshot().projectiles[0].x);
  });

  it('releases abandoned movement and firing input', () => {
    const simulation = sim();
    simulation.setInput('host', input({ movement: 1, firing: true, fireActionId: 1 }));
    for (let elapsed = 0; elapsed <= COOP_STALE_INPUT_MS; elapsed += 50) simulation.tick(50);
    const stoppedAt = simulation.createSnapshot().players[0].x;
    for (let elapsed = 0; elapsed < 500; elapsed += 50) simulation.tick(50);
    expect(simulation.createSnapshot().players[0].x).toBe(stoppedAt);
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

  it('bounds world gem entities without losing earned XP value', () => {
    const simulation = sim();
    for (let index = 0; index < COOP_MAX_WORLD_GEMS + 40; index++) simulation['spawnGem'](1000 + index, 1000, 5, 'host');
    const snapshot = simulation.createSnapshot();
    expect(snapshot.gems).toHaveLength(COOP_MAX_WORLD_GEMS);
    expect(snapshot.gems.reduce((sum, gem) => sum + gem.value, 0)).toBe((COOP_MAX_WORLD_GEMS + 40) * 5);
  });

  it('banks guaranteed elite cores when unrelated pickups fill the world cap', () => {
    const simulation = sim();
    for (let index = 0; index < COOP_MAX_WORLD_ITEMS; index++) simulation['spawnItem'](2_000 + index, 2_000, 'hp');
    simulation['spawnItem'](3_000, 3_000, 'data_core', 'host');
    const snapshot = simulation.createSnapshot();
    expect(snapshot.items).toHaveLength(COOP_MAX_WORLD_ITEMS);
    expect(snapshot.players[0].pendingDataCores).toBe(1);
    expect(snapshot.combatEvents).toContainEqual(expect.objectContaining({ kind: 'pickup_collected', playerId: 'host', itemType: 'data_core', amount: 1 }));
  });

  it('restores full health when collecting an hp heart item', () => {
    const simulation = sim();
    const player = simulation['players'].get('host')!;
    player.health = 14;
    expect(player.health).toBe(14);
    expect(player.maxHealth).toBe(100);

    simulation['spawnItem'](player.x, player.y, 'hp');
    simulation['updateDrops'](0.1);

    expect(player.health).toBe(player.maxHealth);
    const snapshot = simulation.createSnapshot();
    expect(snapshot.combatEvents).toContainEqual(
      expect.objectContaining({
        kind: 'pickup_collected',
        playerId: 'host',
        itemType: 'hp',
        amount: 100,
      })
    );
  });

  it('guarantees an hp heart drop when slaying a boss or titan', () => {
    const simulation = sim();
    const titan = {
      id: 999,
      x: 1000,
      y: 1000,
      health: 1,
      maxHealth: 1000,
      type: 'titan' as const,
      color: '#ffffff',
      radius: 88,
      damage: 40,
      speed: 1,
      experienceValue: 500,
      hitFlashMs: 0,
      hitFlashUntilMs: 0,
      slowMultiplier: 1,
      isHolder: false,
      dying: false,
      deathRemainingMs: 0,
      targetLeaseUntilMs: 0,
    };
    simulation['enemies'].push(titan);
    simulation['killEnemy'](titan, 'host');

    const snapshot = simulation.createSnapshot();
    const heartItem = snapshot.items.find(item => item.type === 'hp');
    expect(heartItem).toBeDefined();
    expect(heartItem!.x).toBe(1000);
    expect(heartItem!.y).toBe(1000);
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
    expect(new Set(enemies.map(enemy => enemy.spawnPacketId)).size).toBe(1);
    for (let left = 0; left < enemies.length; left++) for (let right = left + 1; right < enemies.length; right++) {
      expect(Math.hypot(enemies[left].x - enemies[right].x, enemies[left].y - enemies[right].y)).toBeGreaterThan(enemies[left].radius + enemies[right].radius);
    }
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

  it('keeps an unattended long-run horde finite and leaves scenario capacity reserved', () => {
    const simulation = sim();
    const host = simulation['players'].get('host')!;
    host.health = 1_000_000; host.maxHealth = 1_000_000;
    for (let elapsed = 0; elapsed < 90_000; elapsed += 50) simulation.tick(50);
    const snapshot = simulation.createSnapshot();
    const encounterEnemies = snapshot.enemies.filter(enemy => enemy.spawnPacketId !== undefined);
    expect(snapshot.enemies.length).toBeLessThanOrEqual(COOP_MAX_ENEMIES);
    expect(encounterEnemies.length).toBeLessThanOrEqual(COOP_MAX_ENCOUNTER_ENEMIES);
    expect(snapshot.hazards!.length).toBeLessThanOrEqual(snapshot.enemies.length);
    expect(snapshot.enemies.every(enemy => Number.isFinite(enemy.x) && Number.isFinite(enemy.y))).toBe(true);
    expect(simulation['enemyNavigation'].size).toBeLessThanOrEqual(snapshot.enemies.length);
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

  it('allows purchasing a gas mask at a buy station and protects against toxic gas damage', () => {
    const simulation = sim();
    const station = simulation.createSnapshot().buyStations[0];
    const host = (simulation as any).players.get('host');
    host.coins = 1000;
    expect(host.gasMaskHp).toBe(0);

    // Position host at station
    host.x = station.x;
    host.y = station.y;

    // Purchase gas mask
    const err = simulation.purchase('host', station.id, 'gas_mask');
    expect(err).toBeUndefined();
    expect(host.gasMaskHp).toBe(150);
    expect(host.gasMaskMaxHp).toBe(150);
    expect(host.coins).toBe(1000 - 350);

    // Purchasing again while full returns message
    const err2 = simulation.purchase('host', station.id, 'gas_mask');
    expect(err2).toBe('Gas Mask already at maximum filter capacity.');

    // Teleport player into toxic gas zone
    const gas = (simulation as any).gasZone;
    host.x = gas.x;
    host.y = gas.y;
    const initialHealth = host.health;

    // Tick inside gas for 1 second in 50ms steps: gas mask absorbs damage, health remains 100%
    for (let t = 0; t < 1000; t += 50) simulation.tick(50);
    expect(host.health).toBe(initialHealth);
    expect(host.gasMaskHp).toBeLessThan(150);
    expect(host.gasMaskHp).toBeCloseTo(150 - 3, 0.5);

    // Drain remainder of mask
    host.gasMaskHp = 0.1;
    simulation.tick(50);
    // Mask breaks, emitted event
    expect(host.gasMaskHp).toBe(0);
    const events = simulation.createSnapshot().combatEvents;
    expect(events.some(e => e.kind === 'mask_broken')).toBe(true);

    // Now unprotected in gas: player takes direct health damage at 3 DPS
    const hpBefore = host.health;
    for (let t = 0; t < 1000; t += 50) simulation.tick(50);
    expect(host.health).toBeLessThan(hpBefore);
    expect(host.health).toBeCloseTo(hpBefore - 3, 0.5);
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

describe('CoopSimulation tactical pings', () => {
  it('adds and serializes tactical pings in world snapshot and emits ping combat event', () => {
    const simulation = sim();
    simulation.addPing('host', 250, 400, 0, 'enemy', 'Host pinged Danger');

    const snapshot = simulation.createSnapshot();
    expect(snapshot.pings).toBeDefined();
    expect(snapshot.pings?.length).toBe(1);
    expect(snapshot.pings?.[0]).toMatchObject({
      playerId: 'host',
      x: 250,
      y: 400,
      kind: 'enemy',
      label: 'Host pinged Danger',
    });
    expect(snapshot.pings?.[0].remainingMs).toBeGreaterThan(6000);

    expect(snapshot.combatEvents).toContainEqual(
      expect.objectContaining({
        kind: 'ping',
        playerId: 'host',
        x: 250,
        y: 400,
      })
    );
  });

  it('removes previous ping when a player places a new ping', () => {
    const simulation = sim();
    simulation.addPing('host', 100, 100, 0, 'location', 'Old Waypoint');
    expect(simulation.createSnapshot().pings?.length).toBe(1);
    expect(simulation.createSnapshot().pings?.[0].label).toBe('Old Waypoint');

    // Placing a new ping replaces the old one
    simulation.addPing('host', 300, 450, 0, 'enemy', 'Danger');
    const snapshot = simulation.createSnapshot();
    expect(snapshot.pings?.length).toBe(1);
    expect(snapshot.pings?.[0]).toMatchObject({
      x: 300,
      y: 450,
      kind: 'enemy',
      label: 'Danger',
    });
  });

  it('expires pings over simulation tick time', () => {
    const simulation = sim();
    simulation.addPing('host', 100, 100, 0, 'location', 'Waypoint');
    expect(simulation.createSnapshot().pings?.length).toBe(1);

    // Advance simulation past 6.5s expiration duration (tick clamps at 50ms)
    for (let elapsed = 0; elapsed < 7000; elapsed += 50) {
      simulation.tick(50);
    }

    const snapshot = simulation.createSnapshot();
    expect(snapshot.pings?.length).toBe(0);
  });
});

