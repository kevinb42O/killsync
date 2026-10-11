import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); }
catch { playwright = require(join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const origin = process.env.FRIENDS_TEST_ORIGIN || 'http://localhost:3001';
const browser = await playwright.chromium.launch({ headless: true, args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const errors = [];
try {
  const page = await browser.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/__fishing_network_audit', route => route.fulfill({ contentType: 'text/html', body: '<html></html>' }));
  await page.goto(origin + '/__fishing_network_audit');
  const report = await page.evaluate(async () => {
    const { ManualWebRTCSession, decodeSignal } = await import('/src/game/multiplayer/ManualWebRTCSession.ts');
    const { FriendsSimulation } = await import('/src/game/multiplayer/FriendsSimulation.ts');
    const { MULTIPLAYER_PROTOCOL_VERSION } = await import('/src/game/multiplayer/protocol.ts');
    const ids = ['host', 'guest-a', 'guest-b'];
    const sim = new FriendsSimulation(ids.map(id => ({ id, label: id, color: '#fff' })));
    const states = [], received = [0, 0], errors = [], guests = [], mapping = new Map();
    let tick = 0, tool = 0, firing = false, fireActionId = 0, timer, departing = false;
    const expectedDepartureErrors = [];
    const host = new ManualWebRTCSession({ role: 'host', friends: true, iceServers: [],
      onInput: (peerId, input) => { const id = mapping.get(peerId); if (id) sim.setInput(id, input); },
      onError: message => (departing ? expectedDepartureErrors : errors).push(message) });
    const wait = async test => {
      const deadline = performance.now() + 20000;
      while (!test()) {
        if (performance.now() > deadline) throw new Error('Fishing network timeout ' + JSON.stringify({ tick, tool, received, errors }));
        await new Promise(resolve => setTimeout(resolve, 20));
      }
    };
    const frame = () => ({ type: 'input', version: MULTIPLAYER_PROTOCOL_VERSION, sequence: tick + 1,
      clientTime: Date.now(), movement: tick % 40 < 20 ? 1 : 2, aimAngle: tick * 193 % 65536, aimPitch: 32768,
      selectedSlot: 0, friendsTool: tool, firing, fireActionId,
      sprinting: false, sliding: false, reviving: false, jumpPressed: false, dashPressed: false });
    const connect = async index => {
      const guest = new ManualWebRTCSession({ role: 'guest', friends: true, iceServers: [],
        onState: frame => { states[index] = frame.payload; received[index]++; }, onError: message => errors.push(message) });
      guests[index] = guest;
      const offer = await host.createOffer();
      const peerId = decodeSignal(offer, 'offer').peerId;
      mapping.set(peerId, ids[index + 1]);
      await host.acceptAnswer(await guest.acceptOffer(offer));
      await wait(() => guest.connectedPeerCount === 1);
      host.admitFriendsPeer(peerId);
      return guest;
    };
    try {
      await connect(0); await connect(1);
      // Drop 25% of one guest's motion packets and delay the remaining packets.
      const receive = guests[0].receiveMessage.bind(guests[0]); let packets = 0;
      guests[0].receiveMessage = (peerId, kind, raw) => {
        if (kind !== 'state') return receive(peerId, kind, raw);
        if (++packets % 4) setTimeout(() => receive(peerId, kind, raw), 80);
      };
      timer = setInterval(() => {
        sim.setInput('host', frame()); guests.forEach(guest => guest.sendInput(frame()));
        sim.tick(50);
        host.broadcastState({ type: 'state', version: MULTIPLAYER_PROTOCOL_VERSION, tick: ++tick,
          sentAt: Date.now(), payload: sim.createSnapshot() });
      }, 50);
      await wait(() => states.every(s => s?.players.length === 3) && states.length === 2);
      const cycles = 12;
      for (let i = 0; i < cycles; i++) {
        tool = 0;
        await wait(() => states.every(s => s.players.every(p => p.grenades !== undefined)));
        tool = 7; firing = true; fireActionId++;
        await wait(() => states.every(s => s.friends.fishing.charges?.length === 3 && s.players.every(p => p.grenades === undefined)));
        firing = false;
        await wait(() => states.every(s => s.friends.fishing.casts.length === 3));
        const before = received.slice();
        await new Promise(resolve => setTimeout(resolve, 600));
        await wait(() => received.every((count, index) => count > before[index] + 3));
        tool = 6;
        await wait(() => states.every(s => s.friends.fishing.casts.length === 0));
      }
      if (errors.length) throw new Error('Unexpected errors before reconnect: ' + JSON.stringify(errors));
      departing = true;
      guests[0].close(); await wait(() => host.connectedPeerCount === 1);
      departing = false;
      states[0] = undefined;
      await connect(0);
      await wait(() => states[0]?.players.length === 3);
      tool = 7; firing = true; fireActionId++;
      await wait(() => states.every(s => s.friends.fishing.charges?.length === 3));
      firing = false;
      await wait(() => states.every(s => s.friends.fishing.casts.length === 3));
      return { cycles, guestCount: 2, moving: true, motionLoss: .25, delayMs: 80,
        fishingAfterReconnect: true, receivedSnapshots: received, finalTick: tick, errors: errors.slice(), expectedDepartureErrors };
    } finally { clearInterval(timer); guests.forEach(guest => guest.close()); host.close(); }
  });
  assert.deepEqual(errors, []); assert.deepEqual(report.errors, []);
  console.log(JSON.stringify({ ...report, browserErrors: errors }, null, 2));
} finally { await browser.close(); }
