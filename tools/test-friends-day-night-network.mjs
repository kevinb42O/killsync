import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); }
catch { playwright = require(join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const origin = process.env.FRIENDS_TEST_ORIGIN || 'http://localhost:3000';
const directory = process.env.FRIENDS_TEST_ARTIFACT_DIR || 'artifacts/friends-day-night-network';
await mkdir(directory, { recursive: true });
const browser = await playwright.chromium.launch({ headless: true, args: ['--disable-features=WebRtcHideLocalIpsWithMdns', '--allow-loopback-in-peer-connection'] });
const report = { errors: [] };
try {
  const page = await browser.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  await page.route('**/__day_night_network', route => route.fulfill({ contentType: 'text/html', body: '<html></html>' }));
  await page.goto(origin + '/__day_night_network');
  report.network = await page.evaluate(async () => {
    const { ManualWebRTCSession } = await import('/src/game/multiplayer/ManualWebRTCSession.ts');
    const { FriendsSimulation } = await import('/src/game/multiplayer/FriendsSimulation.ts');
    const { FriendsEnvironmentPreview } = await import('/src/game/world/FriendsEnvironmentPreview.ts');
    const { FriendsFrontierVisuals } = await import('/src/game/rendering/FriendsFrontierVisuals.ts');
    const { MULTIPLAYER_PROTOCOL_VERSION } = await import('/src/game/multiplayer/protocol.ts');
    const simulation = new FriendsSimulation([{ id: 'host', label: 'Host', color: '#0ff' }, { id: 'guest', label: 'Guest', color: '#f0f' }]);
    const errors = [], checks = [], sessions = [], states = [];
    const host = new ManualWebRTCSession({ role: 'host', friends: true, iceServers: [], onError: error => errors.push(error) });
    let tick = 0, timer;
    const wait = async test => {
      const deadline = performance.now() + 15000;
      while (!test()) {
        if (performance.now() > deadline) throw new Error('Timed out waiting for day/night synchronization: ' + JSON.stringify({ checks, errors, states: states.map(state => state?.tick) }));
        await new Promise(resolve => setTimeout(resolve, 20));
      }
    };
    const connect = async index => {
      const guest = new ManualWebRTCSession({ role: 'guest', friends: true, iceServers: [], onState: frame => { states[index] = frame.payload; }, onError: error => errors.push(error) });
      sessions.push(guest);
      await host.acceptAnswer(await guest.acceptOffer(await host.createOffer()));
      await wait(() => host.connectedPeerCount === index + 1 && guest.connectedPeerCount === 1);
      for (const peer of host.peerInfo) host.admitFriendsPeer(peer.peerId);
      await wait(() => states[index]?.friends?.environment);
    };
    // Use the same synchronized environment entry point as the live renderer.
    const view = index => {
      const snapshot = states[index];
      const preview = new FriendsEnvironmentPreview();
      const visuals = Object.assign(Object.create(FriendsFrontierVisuals.prototype), { environmentPreview: preview });
      visuals.synchronizeEnvironment(snapshot.friends.environment);
      preview.time(snapshot.world.elapsedMs, snapshot.elapsedMs);
      return visuals.environmentState;
    };
    const change = async settings => {
      simulation.setFriendsEnvironment('host', settings);
      const expected = simulation.createSnapshot().friends.environment;
      await wait(() => states.every(state => JSON.stringify(state.friends.environment) === JSON.stringify(expected)));
    };
    try {
      timer = setInterval(() => {
        simulation.tick(50);
        host.broadcastState({ type: 'state', version: MULTIPLAYER_PROTOCOL_VERSION, tick: ++tick, sentAt: Date.now(), payload: simulation.createSnapshot() });
      }, 50);
      await connect(0);
      await change({ hour: 0, speed: 0 });
      if (view(0).clock !== '00:00' || view(0).phase !== 'Night') throw new Error('Guest did not receive midnight');
      const paused = view(0).elapsedMs, initialTick = states[0].tick;
      await wait(() => states[0].tick >= initialTick + 4);
      if (view(0).elapsedMs !== paused) throw new Error('Guest clock advanced while paused');
      checks.push('Guest sees midnight and stays paused while world snapshots continue');
      await change({ speed: 120, windSpeed: 4 });
      await wait(() => view(0).elapsedMs > paused + 30000);
      checks.push('Guest follows accelerated time and host wind settings');
      await connect(1);
      const late = view(1), first = view(0);
      if (late.speed !== 120 || late.windSpeed !== 4 || Math.abs(late.elapsedMs - first.elapsedMs) > 12000) throw new Error('Late guest received stale environment');
      checks.push('Late joiner receives current accelerated phase');
      await change({ hour: 12, speed: 0 });
      if (states.some((_, index) => view(index).clock !== '12:00' || view(index).phase !== 'Day')) throw new Error('Noon did not synchronize');
      checks.push('Both guests see noon after a host preset change');
      await change({ reset: true });
      if (states.some((_, index) => view(index).enabled || view(index).speed !== 1 || view(index).windSpeed !== 1)) throw new Error('Reset did not synchronize');
      checks.push('Both guests return to normal world time and wind on reset');
      return { checks, receivedSnapshots: states.map(state => state.tick), errors, transport: 'actual local WebRTC + Friends baseline + compact snapshot deltas' };
    } finally { clearInterval(timer); for (const session of sessions) session.close(); host.close(); }
  });
  assert.equal(report.network.checks.length, 5);
  assert.deepEqual(report.network.errors, []);
  assert.deepEqual(report.errors, []);
  console.log(JSON.stringify(report, null, 2));
} catch (error) { report.failure = String(error); throw error; }
finally { await writeFile(directory + '/network-checks.json', JSON.stringify(report, null, 2)); await browser.close(); }
