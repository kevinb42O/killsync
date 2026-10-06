import { FRIENDS_AIRFIELD_HEIGHT, FRIENDS_ARRIVAL_HEIGHT } from '../world/FriendsTerrain';
import { railSimulation, railExpedition } from './friendsRailTestFixtures';
import type { FriendsBuildPiece } from './FriendsBuilding';
import { describe, expect, it } from 'vitest';
import { FriendsSimulation } from './FriendsSimulation';
import { CoopSimulation, quantizeAngle, quantizePitch } from './CoopSimulation';
import { MULTIPLAYER_PROTOCOL_VERSION, type MultiplayerInputFrame } from './protocol';
import { FRIENDS_AIRPAD, FRIENDS_HUB, FRIENDS_SIGNALS, FRIENDS_MARKETS } from '../world/FriendsRegion';
import { FriendsExpedition, carryOnVehicle, friendsVehicleFloor, normalizeFriendsProgress, resolveFriendsVehicleCollisions, sampleTrainRoute, TRAIN_LOOP_LENGTH, vehicleLocal, trainGangways, FRIENDS_FLIGHT_CEILING } from './FriendsExpedition';
import { CoopSnapshotInterpolator } from './snapshotInterpolation';
import { compactSnapshotWirePayload, createSnapshotDelta, SnapshotDecoder } from './snapshotReplication';
import { LocalPlayerPrediction } from './LocalPlayerPrediction';
import { COOP_STEP_MS } from './playerMovement';

const seeds = [{ id: 'host', label: 'Host', color: '#8de6ce' }, { id: 'guest', label: 'Friend', color: '#d4b3ff' }];
const input = (sequence: number, extra: Partial<MultiplayerInputFrame> = {}): MultiplayerInputFrame => ({ type: 'input', version: MULTIPLAYER_PROTOCOL_VERSION, sequence, clientTime: 0, movement: 0, aimAngle: quantizeAngle(0), aimPitch: quantizePitch(0), selectedSlot: 0, firing: false, fireActionId: 0, interactActionId: 0, sprinting: false, sliding: false, reviving: false, jumpPressed: false, dashPressed: false, ...extra });
const run = (s: CoopSimulation, ms: number) => { for (let elapsed = 0; elapsed < ms; elapsed += 50) s.tick(50); };

describe('separate Friends expedition', () => {
  it('stays safe and active for ten idle minutes, without a prebuilt settlement or train', () => {
    const s = new FriendsSimulation(seeds);
    run(s, 600000);
    const frame = s.createSnapshot();
    expect(frame.mode).toBe('friends'); expect(frame.world?.id).toBe('friends_frontier');
    expect(frame.enemies).toHaveLength(0); expect(frame.gasZone).toBeUndefined(); expect(frame.realityBreach).toBeUndefined(); expect(frame.fieldMissions).toBeUndefined();
    expect(frame.matchState).toBe('active'); expect(frame.results).toBeUndefined(); expect(frame.run.phase).toBe('insertion');
    expect(frame.buyStations).toHaveLength(0); expect(frame.weaponFoundry).toBeUndefined(); expect(frame.friends!.vehicles.filter(v=>v.kind==='train')).toHaveLength(0);
    expect(frame.players.every(p => p.health === p.maxHealth && p.coins === 750)).toBe(true);
 }, 60000);
  it('leaves default survival directors, starting resources and spawning intact', () => {
    const s = new CoopSimulation(seeds); const initial = s.createSnapshot();
    expect(initial.mode).toBe('survival'); expect(initial.friends).toBeUndefined(); expect(initial.world?.id).toBe('neon_bastion');
    expect(initial.players[0].coins).toBe(0); expect(initial.buyStations[0].state).toBe('available');
    run(s, 19000); const frame = s.createSnapshot();
    expect(frame.realityBreach?.phase).toBe('linking'); expect(frame.enemies.length).toBeGreaterThan(0); expect(frame.gasZone).toBeDefined();
  });
  it('carries train passengers through a corner, allows walking and stepping off, and never tethers airborne players', () => {
    const s = railSimulation(seeds, false), p = s['players'].get('host')!;
    const train = s.createSnapshot().friends!.vehicles[0]; p.x = train.x; p.y = train.y; p.z = train.z;
    run(s, 13000); const moving = s.createSnapshot().friends!.vehicles[0];
    expect(p.x - moving.x).toBeCloseTo(0, 5); expect(p.y - moving.y).toBeCloseTo(0, 5); expect(p.z).toBe(14);
    for (let i = 1; i <= 25; i++) { s.setInput('host', input(i, { movement: 8 })); s.tick(50); }
    expect(Math.abs(p.y - s.createSnapshot().friends!.vehicles[0].y)).toBeGreaterThan(100); expect(p.z).toBe(0);
    const a = sampleTrainRoute(2980), b = sampleTrainRoute(3040);
    const before = { ...train, ...a }, after = { ...train, ...b };
    const rider = { x: before.x, y: before.y, z: 14 }; expect(carryOnVehicle(rider, before, after)).toBe(true); expect(rider.x).toBeCloseTo(after.x);
    const jumper = { x: before.x, y: before.y, z: 70 }; expect(carryOnVehicle(jumper, before, after)).toBe(false); expect(jumper.x).toBe(before.x);
  });
  it('boards from the ground with a real jump and supports train roofs', () => {
    const s = railSimulation(seeds, false), p = s['players'].get('host')!, v = s.createSnapshot().friends!.vehicles[1];
    p.x = v.x; p.y = v.y; p.z = 0;
    s.setInput('host', input(1, { jumpPressed: true })); run(s, 800);
    expect(p.z).toBe(14); expect(friendsVehicleFloor([v], v.x, v.y, 129)).toBe(129);
  });
  it('keeps a jumping crew member below the cabin roof while allowing jumps outside its edge', () => {
    const s = new FriendsSimulation(seeds), p = s['players'].get('host')!, v = s.createSnapshot().friends!.vehicles.find(v=>v.kind==='aircraft')!;
    p.x = v.x - 50; p.y = v.y; p.z = v.z;
    for (let i = 1; i < 10; i++) { s.setInput('host', input(i, { jumpPressed: i === 1, jetHeld: true })); s.tick(50); expect(p.z + 50).toBeLessThanOrEqual(v.z + 101); }
    expect(p.z).toBeGreaterThan(v.z);
    // Leave toward the clear side of the airpad, rather than the adjacent
    // railway's canopy, which is also correctly solid overhead.
    for (let i = 10; i < 30; i++) { s.setInput('host', input(i, { movement: 4, jetHeld: true })); s.tick(50); }
    expect(v.y - p.y).toBeGreaterThan(v.width / 2); expect(p.z).toBeGreaterThan(v.z + 101);
  });
  it('inherits train momentum when jumping, lands back on the moving deck and can deliberately jump off', () => {
    const s = railSimulation(seeds, false), p = s['players'].get('host')!, v = s.createSnapshot().friends!.vehicles[0];
    p.x = v.x; p.y = v.y; p.z = v.z; run(s, 13000);
    s.setInput('host', input(1, { jumpPressed: true })); s.tick(50);
    expect(p.z).toBeGreaterThan(14); expect(Math.hypot(p.platformVelocityX, p.platformVelocityY)).toBeCloseTo(180, 1);
    for (let i = 2; i <= 17; i++) { s.setInput('host', input(i)); s.tick(50); }
    const moving = s.createSnapshot().friends!.vehicles[0]; expect(p.z).toBe(14); expect(Math.abs(p.x - moving.x)).toBeLessThan(10);
    s.setInput('host', input(18, { jumpPressed: true, movement: 8 })); s.tick(50);
    for (let i = 19; i < 40; i++) { s.setInput('host', input(i, { movement: 8 })); s.tick(50); }
    expect(p.z).toBe(0); expect(p.y - moving.y).toBeGreaterThan(300); expect(p.platformVelocityX).toBe(0);
  });
  it('rotates and elevates free crew, transfers angular momentum to a jumper and holds position when the pilot leaves', () => {
    const e = new FriendsExpedition(), v = e.vehicles().find(v=>v.kind==='aircraft')!;
    const pilot = { id: 'host', x: v.x + 100, y: v.y, z: v.z, lifeState: 'alive' };
    const crew = { id: 'guest', x: v.x - 45, y: v.y + 35, z: v.z, lifeState: 'alive', platformVelocityX: 0, platformVelocityY: 0, platformVelocityZ: 0 };
    expect(e.interact(pilot, 0)).toBe('pilot');
    for (let i = 1; i <= 20; i++) e.update(50, i * 50, [pilot, crew], new Map([['host', input(i, { movement: 1, aimAngle: quantizeAngle(Math.PI / 2), jetHeld: true })]]));
    const flying = e.vehicles().find(v=>v.kind==='aircraft')!, local = vehicleLocal(flying, crew.x, crew.y);
    expect(local.x).toBeCloseTo(-45); expect(local.y).toBeCloseTo(35); expect(crew.z).toBe(flying.z);
    expect(flying.angle).toBeCloseTo(1.2); expect(crew.platformVelocityZ).toBeCloseTo(300); expect(Math.hypot(crew.platformVelocityX, crew.platformVelocityY)).toBeGreaterThan(350);
    // A passenger above the deck follows their own physics, never the deck transform.
    crew.z += 40; const detached = { ...crew }; e.update(50, 1050, [pilot, crew], new Map([['host', input(21, { movement: 1, jetHeld: true })]]));
    expect(crew.x).toBe(detached.x); expect(crew.y).toBe(detached.y); expect(crew.z).toBe(detached.z);
    e.update(50, 1100, [crew], new Map()); const abandoned = e.vehicles().find(v=>v.kind==='aircraft')!; expect(abandoned.pilotId).toBeUndefined();
    e.update(1000, 2100, [crew], new Map()); expect(e.vehicles().find(v=>v.kind==='aircraft')!).toEqual(abandoned);
  });
  it('keeps locomotive hulls solid at any heading while their roofs remain walkable', () => {
    const v = { ...railExpedition().vehicles().find(v => v.closed)!, angle: Math.PI / 3 };
    const p = { x: v.x, y: v.y }; expect(resolveFriendsVehicleCollisions([v], p, 14, 19)).toBe(true);
    expect(Math.abs(vehicleLocal(v, p.x, p.y).y)).toBeCloseTo(v.width / 2 + 19);
    expect(resolveFriendsVehicleCollisions([v], { x: v.x, y: v.y }, 129, 19)).toBe(false);
    expect(friendsVehicleFloor([v], v.x, v.y, 14)).toBeUndefined(); expect(friendsVehicleFloor([v], v.x, v.y, 129)).toBe(129);
  });
  it('blocks low flight beside a tall tower without teleporting to its roof, and supports intentional roof landings', () => {
    const e = new FriendsExpedition(), plane = e['aircraft']; plane.x = 6250; plane.y = 8800; plane.z = 250;
    const pilot = { id: 'host', x: plane.x + 100, y: plane.y, z: plane.z, lifeState: 'alive' };
    const tower:FriendsBuildPiece[]=Array.from({length:13},(_,i)=>({id:i+1,shape:'cube',finish:'stone',author:'Host',revision:1,x:6500,y:8800,z:i*64,rotation:0}));
    e.interact(pilot, 0);
    for (let i = 1; i <= 25; i++) e.update(50, i * 50, [pilot], new Map([['host', input(i, { movement: 1 })]]),tower);
    expect(e.vehicles().find(v=>v.kind==='aircraft')!.z).toBe(250);
    plane.x = 6500; plane.y = 8800; plane.z = 850;
    for (let i = 26; i < 36; i++) e.update(50, i * 50, [pilot], new Map([['host', input(i, { sliding: true })]]),tower);
    expect(e.vehicles().find(v=>v.kind==='aircraft')!.z).toBe(846); expect(pilot.z).toBe(846);
  });
  it('releases a defeated pilot and keeps the aircraft available for another friend', () => {
    const s = new FriendsSimulation(seeds), p = s['players'].get('host')!, v = s.createSnapshot().friends!.vehicles.find(v=>v.kind==='aircraft')!;
    p.x = v.x + 100; p.y = v.y; p.z = v.z; s.setInput('host', input(1, { interactActionId: 1 })); s.tick(50);
    s['downPlayer'](p); s.tick(50);
    expect(s.createSnapshot().friends!.vehicles.find(v=>v.kind==='aircraft')!.pilotId).toBeUndefined(); expect(p.x).toBe(FRIENDS_HUB.x); expect(p.z).toBe(FRIENDS_ARRIVAL_HEIGHT);
  });
  it('takes and releases cockpit controls before collecting nearby loot, even over a market', () => {
    const s = new FriendsSimulation(seeds), p = s['players'].get('host')!, v = s['friends']!['aircraft'];
    v.x = FRIENDS_MARKETS[0].x - 100; v.y = FRIENDS_MARKETS[0].y;
    p.x = v.x + 100; p.y = v.y; p.z = v.z;
    s['items'].push({ id: 99999, x: p.x, y: p.y, type: 'coin_gold', value: 100, color: '#facc15', manualDropKind: 'cash' });
    s.setInput('host', input(1, { interactActionId: 1 })); s.tick(COOP_STEP_MS);
    expect(s.createSnapshot().friends!.vehicles.find(v=>v.kind==='aircraft')!.pilotId).toBe('host'); expect(p.coins).toBe(750);
    s.setInput('host', input(2, { interactActionId: 2 })); s.tick(COOP_STEP_MS);
    expect(s.createSnapshot().friends!.vehicles.find(v=>v.kind==='aircraft')!.pilotId).toBeUndefined(); expect(p.z).toBe(FRIENDS_AIRFIELD_HEIGHT+14);
    expect(p.coins).toBe(750); expect(s.createSnapshot().items).toHaveLength(1);
  });
  it('pilots the aircraft with validated inputs, carries crew, releases controls, and stops on stale input', () => {
    const s = new FriendsSimulation(seeds), p = s['players'].get('host')!, crew = s['players'].get('guest')!;
    p.x = FRIENDS_AIRPAD.x + 100; p.y = FRIENDS_AIRPAD.y; p.z = FRIENDS_AIRFIELD_HEIGHT+14;
    crew.x = FRIENDS_AIRPAD.x - 45; crew.y = FRIENDS_AIRPAD.y + 35; crew.z = FRIENDS_AIRFIELD_HEIGHT+14;
    s.setInput('host', input(1, { interactActionId: 1 })); s.tick(50);
    expect(s.createSnapshot().friends!.vehicles.find(v=>v.kind==='aircraft')!.pilotId).toBe('host');
    for (let i = 2; i < 32; i++) { s.setInput('host', input(i, { movement: 1, jetHeld: true })); s.tick(50); }
    const flying = s.createSnapshot().friends!.vehicles.find(v=>v.kind==='aircraft')!;
    expect(flying.z).toBeGreaterThan(250); expect(crew.z).toBe(flying.z); expect(crew.x - flying.x).toBeCloseTo(-45); expect(crew.y - flying.y).toBeCloseTo(35);
    run(s, 3000); const stopped = s.createSnapshot().friends!.vehicles.find(v=>v.kind==='aircraft')!; run(s, 1000);
    expect(s.createSnapshot().friends!.vehicles.find(v=>v.kind==='aircraft')!).toEqual(stopped);
    s.setInput('host', input(40, { interactActionId: 2 })); s.tick(50); expect(s.createSnapshot().friends!.vehicles.find(v=>v.kind==='aircraft')!.pilotId).toBeUndefined(); expect(p.z).toBe(stopped.z);
  });
  it('steps onto the cabin deck without a jump, hovers after release and allows another passenger to pilot at high altitude', () => {
    const s = new FriendsSimulation(seeds), p = s['players'].get('host')!, crew = s['players'].get('guest')!, v = s.createSnapshot().friends!.vehicles.find(v=>v.kind==='aircraft')!;
    p.x = v.x - 50; p.y = v.y; p.z = FRIENDS_AIRFIELD_HEIGHT; s.tick(50); expect(p.z).toBe(v.z);
    p.x = v.x + 100; s.setInput('host', input(1, { interactActionId: 1 })); s.tick(50);
    crew.x = v.x - 45; crew.y = v.y + 20; crew.z = v.z;
    for (let i = 2; i <= 210; i++) { s.setInput('host', input(i, { jetHeld: true })); s.tick(50); }
    const high = s.createSnapshot().friends!.vehicles.find(v=>v.kind==='aircraft')!; expect(high.z).toBeGreaterThan(3000); expect(crew.z).toBe(high.z); expect(p.z).toBe(high.z);
    s.setInput('host', input(211, { interactActionId: 2 })); s.tick(50); run(s, 2000);
    expect(s.createSnapshot().friends!.vehicles.find(v=>v.kind==='aircraft')!.z).toBe(high.z); expect(p.z).toBe(high.z);
    crew.x = high.x + 100; crew.y = high.y;
    s.setInput('guest', input(1, { interactActionId: 1 })); s.tick(50); expect(s.createSnapshot().friends!.vehicles.find(v=>v.kind==='aircraft')!.pilotId).toBe('guest');
    for (let i = 2; i < 260; i++) { s.setInput('guest', input(i, { jetHeld: true })); s.tick(50); }
    expect(s.createSnapshot().friends!.vehicles.find(v=>v.kind==='aircraft')!.z).toBe(FRIENDS_FLIGHT_CEILING); expect(p.z).toBe(FRIENDS_FLIGHT_CEILING);
  });
  it('provides continuous gangway floors and lets players walk through all carriages, including a turning train', () => {
    for (const distance of [1300, 3450, 5800, 9000]) {
      const e = railExpedition(true); e['trainDistance'] = distance;
      for (const link of trainGangways(e.vehicles())) for (let i = 0; i <= 20; i++) {
        const x = link.ax + (link.bx - link.ax) * i / 20, y = link.ay + (link.by - link.ay) * i / 20;
        const angle = Math.atan2(link.by - link.ay, link.bx - link.ax);
        for (const side of [-52, 0, 52]) expect(friendsVehicleFloor(e.vehicles(), x - Math.sin(angle) * side, y + Math.cos(angle) * side, 14)).toBe(14);
      }
    }
    for (const distance of [1000, 1800, 3000, 4000]) {
      const s = railSimulation(seeds, false), p = s['players'].get('host')!;
      s['friends']!['trainDistance'] = distance; s['friends']!['trainStoppedMs'] = 0;
      const rear = s.createSnapshot().friends!.vehicles[2];
      p.x = rear.x - 60 * Math.cos(rear.angle); p.y = rear.y - 60 * Math.sin(rear.angle); p.z = 14;
      for (let i = 1; i <= Math.ceil(1350 / COOP_STEP_MS); i++) {
        const cars = s.createSnapshot().friends!.vehicles.filter(v => v.kind === 'train' && !v.closed);
        const nearest = cars.sort((a, b) => Math.hypot(p.x - a.x, p.y - a.y) - Math.hypot(p.x - b.x, p.y - b.y))[0];
        s.setInput('host', input(i, { movement: 1, aimAngle: quantizeAngle(nearest.angle) })); s.tick(COOP_STEP_MS); expect(p.z, `route distance ${distance}, step ${i}`).toBe(14);
      }
      expect(vehicleLocal(s.createSnapshot().friends!.vehicles[0], p.x, p.y).x).toBeGreaterThan(-80);
      for (let i = 100; i < 100 + Math.ceil(12000 / COOP_STEP_MS); i++) { s.setInput('host', input(i)); s.tick(COOP_STEP_MS); expect(p.z, `idle route ${distance}, step ${i}, player ${p.x},${p.y}`).toBe(14); }
    }
  });
  it('keeps idle riders aboard for a full railway circuit, including every curve and station', () => {
    const s = railSimulation(seeds, true), riders = seeds.map((seed, i) => ({ player: s['players'].get(seed.id)!, carIndex: i * 2, offsetY: i === 0 ? 44 : -44 }));
    for (const { player, carIndex, offsetY } of riders) {
      const car = s.createSnapshot().friends!.vehicles[carIndex];
      player.x = car.x + 20 * Math.cos(car.angle) - offsetY * Math.sin(car.angle);
      player.y = car.y + 20 * Math.sin(car.angle) + offsetY * Math.cos(car.angle); player.z = car.z;
    }
    for (let elapsed = 0; elapsed < 400000; elapsed += 50) {
      for (const { player } of riders) s.setInput(player.id, input(elapsed / 50 + 1));
      s.tick(50);
      for (const { player, carIndex, offsetY } of riders) {
        const car = s['friends']!.vehicles()[carIndex], local = vehicleLocal(car, player.x, player.y);
        expect(player.z, `car ${carIndex}, time ${elapsed}`).toBe(14);
        expect(local.x, `car ${carIndex}, time ${elapsed}, position ${player.x},${player.y}, vehicle ${car.x},${car.y}`).toBeCloseTo(20, 5); expect(local.y).toBeCloseTo(offsetY, 5);
      }
    }
  }, 60000);
  it('has no invisible salvage interaction in the removed settlement', () => {
    const s = new FriendsSimulation(seeds), p=s['players'].get('host')!;p.x=4260;p.y=7050;
    s.setInput('host',input(1,{interactActionId:1}));s.tick(50);
    expect(s.createSnapshot().enemies).toHaveLength(0);expect(s.createSnapshot().friends!.salvageState).toBe('idle');
  });
  it('keeps shooting and grenades operational in Friends mode', () => {
    const s = new FriendsSimulation(seeds), p = s['players'].get('host')!;
    s.setInput('host', input(1, { firing: true, fireActionId: 1, grenadeActionId: 1 })); s.tick(50);
    expect(s.createSnapshot().projectiles.length).toBeGreaterThan(0); expect(s.createSnapshot().grenades).toHaveLength(1); expect(p.grenades).toBe(1);
  });
  it('keeps passenger shots visible at the aircraft flight ceiling', () => {
    const s = new FriendsSimulation(seeds), p = s['players'].get('host')!, v = s['friends']!['aircraft'];
    v.z = FRIENDS_FLIGHT_CEILING; p.x = v.x - 40; p.y = v.y; p.z = v.z;
    s.setInput('host', input(1, { firing: true, fireActionId: 1 })); s.tick(50);
    expect(s.createSnapshot().projectiles.some(projectile => projectile.z >= FRIENDS_FLIGHT_CEILING)).toBe(true);
  });
  it('recovers a defeated or fallen friend without losing inventory, credits or ending the expedition', () => {
    const s = new FriendsSimulation(seeds), p = s['players'].get('host')!; p.coins = 1234;
    s['damagePlayer'](p, 10000, p.x, p.y); expect(p.lifeState).toBe('alive'); expect(p.health).toBe(p.maxHealth); expect(p.coins).toBe(1234);
    p.x = -10; s.setInput('host', input(1)); s.tick(50);
    expect(p.x).toBe(FRIENDS_HUB.x); expect(p.coins).toBe(1234); expect(s.createSnapshot().results).toBeUndefined();
  });
  it('preserves legacy progress on load without restoring the removed settlement', () => {
    const progress=normalizeFriendsProgress({signals:['garden','archive','wreck'],discovered:['depot'],restored:true});
    const s=new FriendsSimulation(seeds,22,progress);expect(s.createSnapshot().friends!.progress).toEqual(progress);
    expect(s.createSnapshot().friends!.vehicles).toHaveLength(1);
  });
  it('replicates expedition state through compact keyframes and deltas; interpolates decks with passengers', () => {
    const s = railSimulation(seeds, false), p = s['players'].get('host')!, v = s.createSnapshot().friends!.vehicles[0]; p.x = v.x; p.y = v.y; p.z = v.z;
    run(s, 12000); const a = s.createSnapshot(); s.tick(50); const b = s.createSnapshot();
    const decoder = new SnapshotDecoder(); decoder.decode(compactSnapshotWirePayload({ format: 'coop_snapshot_full', snapshot: a }), 1);
    const decoded = decoder.decode(compactSnapshotWirePayload(createSnapshotDelta(a, b, 1)), 2)!; expect(decoded.friends).toEqual(b.friends);
    const mid = new CoopSnapshotInterpolator().interpolate(a, b, .5); expect(mid.players[0].x).toBeCloseTo(mid.friends!.vehicles[0].x);
    expect(a.friends!.vehicles[0].x).not.toBe(b.friends!.vehicles[0].x);
    const prediction = new LocalPlayerPrediction('host'); prediction.reconcile(b); prediction.step(input(10, { movement: 1 }));
    expect(prediction.present(mid, input(11), 16, 16)).toBe(mid);
  });
  it('keeps the full railway circuit continuous and landing floors agree with visible decks', () => {
    for (let distance = 0; distance < TRAIN_LOOP_LENGTH; distance += 7) {
      const a = sampleTrainRoute(distance), b = sampleTrainRoute(distance + 7); expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThanOrEqual(7.001);
    }
    expect(sampleTrainRoute(0)).toEqual(sampleTrainRoute(TRAIN_LOOP_LENGTH));
    const e = new FriendsExpedition(); expect(friendsVehicleFloor(e.vehicles(), FRIENDS_AIRPAD.x, FRIENDS_AIRPAD.y, FRIENDS_AIRFIELD_HEIGHT)).toBe(FRIENDS_AIRFIELD_HEIGHT+14); expect(friendsVehicleFloor(e.vehicles(), FRIENDS_AIRPAD.x, FRIENDS_AIRPAD.y, FRIENDS_AIRFIELD_HEIGHT+14)).toBe(FRIENDS_AIRFIELD_HEIGHT+14);
  });
});
