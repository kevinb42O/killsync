import { describe, expect, it } from 'vitest';
import { isWorldPositionClear } from '../world/WorldLayout';
import { CoopSimulation } from './CoopSimulation';
import { CoopGasZone, GAS_MAX_RADIUS } from './CoopGasZone';
import { CoopStationDirector } from './CoopStationDirector';
import { COOP_FOUNDRY_CAPTURE_MS, COOP_FOUNDRY_STATION_CLEARANCE, generateCoopWeaponFoundrySite } from './CoopWeaponFoundry';

const insertion = { x: 6000, y: 6000 };

describe('Weapon Foundry authority', () => {
  it('places the same safe, street-accessible Foundry across hundreds of repeated seeds', () => {
    for (let seed = 0; seed < 400; seed++) {
      const gas = new CoopGasZone(insertion, seed);
      const stations = new CoopStationDirector(seed, insertion, gas).positions;
      const first = generateCoopWeaponFoundrySite(seed, insertion, gas, stations);
      const repeated = generateCoopWeaponFoundrySite(seed, insertion, gas, stations);
      expect(repeated).toEqual(first);
      expect(isWorldPositionClear(first.x, first.y, 180)).toBe(true);
      expect(Math.hypot(first.x - gas.x, first.y - gas.y)).toBeGreaterThanOrEqual(GAS_MAX_RADIUS + 420);
      expect(stations.every(station => Math.hypot(first.x - station.x, first.y - station.y) >= COOP_FOUNDRY_STATION_CLEARANCE)).toBe(true);
    }
  });

  it('requires its own capture and spends only the requesting player credits on any selected firearm', () => {
    const simulation = new CoopSimulation([{ id: 'host', label: 'Host', color: '#0ff' }, { id: 'guest', label: 'Guest', color: '#f0f' }], 42);
    const foundry = simulation['weaponFoundry'];
    const site = foundry.snapshot();
    const host = simulation['players'].get('host')!, guest = simulation['players'].get('guest')!;
    host.coins = 1000; guest.coins = 1000;
    host.x = site.x; host.y = site.y;
    expect(simulation.forgeWeapon('host', site.id, 'assault_rifle')).toEqual({ code: 'foundry_inactive' });
    foundry.unlock();
    foundry.update(COOP_FOUNDRY_CAPTURE_MS, [{ ...host, radius: 19 }], []);
    expect(foundry.snapshot().state).toBe('active');
    expect(simulation.forgeWeapon('host', site.id, 'smg')).toBeUndefined();
    expect(host.weaponStates.find(weapon => weapon.weaponId === 'smg')?.level).toBe(2);
    expect(host.weaponStates.find(weapon => weapon.weaponId === 'plasma_gun')?.level).toBe(1);
    expect(host.coins).toBe(775);
    expect(guest.coins).toBe(1000);
    expect(simulation.forgeWeapon('guest', site.id, 'smg')).toEqual({ code: 'foundry_range' });
    guest.x = site.x; guest.y = site.y; guest.coins = 100;
    expect(simulation.forgeWeapon('guest', site.id, 'assault_rifle')).toEqual({ code: 'credits', amount: 125 });
    expect(host.coins).toBe(775);
    guest.coins = 1000;
    expect(simulation.forgeWeapon('guest', site.id, 'assault_rifle')).toBeUndefined();
    expect(guest.coins).toBe(775);
    expect(guest.weaponStates.find(weapon => weapon.weaponId === 'assault_rifle')?.level).toBe(2);
    expect(host.weaponStates.find(weapon => weapon.weaponId === 'assault_rifle')?.level).toBe(1);
  });

  it('replicates a separate locked entity instead of adding Foundry stock to Buy Stations', () => {
    const snapshot = new CoopSimulation([{ id: 'host', label: 'Host', color: '#0ff' }], 3).createSnapshot();
    expect(snapshot.buyStations).toHaveLength(3);
    expect(snapshot.weaponFoundry).toMatchObject({ id: 4, state: 'locked', pricingStatus: 'provisional_pending_credit_telemetry' });
    expect(snapshot.buyStations.every(station => !('pricingStatus' in station))).toBe(true);
  });

  it('hard-caps firearm forging at level eight', () => {
    const simulation = new CoopSimulation([{ id: 'host', label: 'Host', color: '#0ff' }], 9);
    const foundry = simulation['weaponFoundry']; const site = foundry.snapshot(); const host = simulation['players'].get('host')!;
    host.x = site.x; host.y = site.y; host.coins = 100_000;
    foundry.unlock(); foundry.update(COOP_FOUNDRY_CAPTURE_MS, [{ ...host, radius: 19 }], []);
    for (let level = 1; level < 8; level++) expect(simulation.forgeWeapon('host', site.id, 'arc_launcher')).toBeUndefined();
    expect(host.weaponStates.find(weapon => weapon.weaponId === 'arc_launcher')?.level).toBe(8);
    expect(simulation.forgeWeapon('host', site.id, 'arc_launcher')).toEqual({ code: 'weapon_max' });
  });
});
