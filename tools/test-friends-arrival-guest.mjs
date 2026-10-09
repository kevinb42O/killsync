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
const directory = process.env.FRIENDS_ARRIVAL_GUEST_OUTPUT || 'artifacts/friends-arrival/guest-validation';
await mkdir(directory, { recursive: true });
const report = { checks: [], errors: [] };
const browser = await playwright.chromium.launch({ headless: true, args: ['--use-angle=metal', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-features=WebRtcHideLocalIpsWithMdns', '--allow-loopback-in-peer-connection'] });
const pages = [];
try {
  for (const role of ['host', 'guest']) {
    const page = await browser.newPage({ viewport: { width: 900, height: 740 } });
    pages.push(page);
    page.on('pageerror', error => report.errors.push(`${role}: ${error.message}`));
    page.setDefaultTimeout(60000);
    await page.addInitScript(() => {
      window.__vite_plugin_react_preamble_installed__ = true;
      window.$RefreshReg$ = () => {};
      window.$RefreshSig$ = () => type => type;
      localStorage.setItem('sunline.preferences.v1', JSON.stringify({ renderScale: .5, shadows: false }));
      let locked = null;
      Object.defineProperty(document, 'pointerLockElement', { get: () => locked });
      HTMLCanvasElement.prototype.requestPointerLock = function () { locked = this; document.dispatchEvent(new Event('pointerlockchange')); return Promise.resolve(); };
      document.exitPointerLock = () => { locked = null; document.dispatchEvent(new Event('pointerlockchange')); };
    });
    await page.route('**/@vite/client',route=>route.fulfill({contentType:'application/javascript',body:'export function createHotContext(){return {on(){},off(){},prune(){},send(){},acceptExports(){},accept(){},dispose(){},invalidate(){},data:{}}};export function injectQuery(u){return u};export function updateStyle(id,content){let s=document.getElementById(id);if(!s){s=document.createElement("style");s.id=id;document.head.append(s);}s.textContent=content;}export function removeStyle(id){document.getElementById(id)?.remove();}'}));
    await page.route('**/__host_controls', route => route.fulfill({ contentType: 'text/html', body: '<html><body style="margin:0"><div id="root"></div></body></html>' }));
    await page.goto(origin + '/__host_controls');
    await page.evaluate(async role => {
      const { ManualWebRTCSession } = await import('/src/game/multiplayer/ManualWebRTCSession.ts');
      window.reviewSession = new ManualWebRTCSession({ role, friends: true, iceServers: [] });
    }, role);
  }
  const [host, guest] = pages;
  const offer = await host.evaluate(() => window.reviewSession.createOffer());
  const answer = await guest.evaluate(offer => window.reviewSession.acceptOffer(offer), offer);
  await host.evaluate(answer => window.reviewSession.acceptAnswer(answer), answer);
  for (const page of pages) await page.waitForFunction(() => window.reviewSession.connectedPeerCount === 1);
  const peerId = await host.evaluate(() => window.reviewSession.peerInfo[0].peerId);
  await host.evaluate(peerId => window.reviewSession.admitFriendsPeer(peerId), peerId);
  const arenaSource = await (await host.request.get(origin + '/src/components/MultiplayerArena.tsx')).text();
  const bridgeUrl = arenaSource.match(/from ["']([^"']*MultiplayerRendererBridge[^"']*)["']/)[1];
  for (let i = 0; i < pages.length; i++) {
    await pages[i].evaluate(async ({ role, peerId, bridgeUrl }) => {
      const React = (await import('/node_modules/.vite/deps/react.js')).default;
      const { createRoot } = (await import('/node_modules/.vite/deps/react-dom_client.js')).default;
      const { MultiplayerArena } = await import('/src/components/MultiplayerArena.tsx');
      const { FriendsCrewRegistry } = await import('/src/game/multiplayer/FriendsCrewIdentity.ts');
      const { MultiplayerRendererBridge } = await import(bridgeUrl);
      const render = MultiplayerRendererBridge.prototype.render;
      MultiplayerRendererBridge.prototype.render = function (snapshot, ...args) {
        if (snapshot) window.reviewSnapshot = snapshot;
        window.reviewBridge = this;
        return render.call(this, snapshot, ...args);
      };
      const players = [{ id: 'host', label: 'Host', color: '#8de6ce' }, { id: 'guest', label: 'Guest', color: '#f0f' }];
      const launch = { role, session: window.reviewSession, localPlayerId: role, players,
        peerPlayerIds: role === 'host' ? { [peerId]: 'guest' } : {}, friendsCrew: role === 'host' ? new FriendsCrewRegistry() : undefined, language: 'en', worldId: 'friends_frontier', gameMode: 'friends', soloTest: true };
      const root = createRoot(document.getElementById('root'));
      window.reviewMount = scheme => root.render(React.createElement(MultiplayerArena, { launch, controlScheme: scheme, onExit: () => {} }));
      window.reviewMount('QWERTY');
    }, { role: i === 0 ? 'host' : 'guest', peerId, bridgeUrl });
  }
  console.log('Mounted connected host and guest arenas');
  for (const page of pages) {
    await page.waitForFunction(() => window.reviewSnapshot?.players.length === 2, undefined, { timeout: 60000 });
    console.log('Arena received state:', await page.evaluate(() => window.reviewSession.role));
    if (await page.locator('.friends-pause-backdrop').count()) await page.keyboard.press('Escape');
  }
  for (const page of pages) {
    await page.waitForFunction(() => {
      const b=window.reviewBridge;
      return b && !b.friendsWorldArrival.sequence.active && b.renderer.scene.getObjectByName('unified-voxel-masonry')?.geometry.getAttribute('position')?.count>0;
    },undefined,{timeout:90000});
  }
  report.checks.push('Both connected arenas finish arrival and install streamed masonry');
  report.preparation=await Promise.all(pages.map(page=>page.evaluate(()=>({role:window.reviewSession.role,stats:window.reviewBridge.friendsWorldArrival.preparationStats,glError:window.reviewBridge.renderer.renderer.getContext().getError()}))));
  for(const result of report.preparation)assert.equal(result.glError,0,`${result.role} must have no WebGL error after arrival`);
  const before=await guest.evaluate(()=>{const p=window.reviewSnapshot.players.find(p=>p.id==='guest');return {x:p.x,y:p.y,tick:window.reviewSnapshot.tick};});
  await guest.locator('.coop-arena canvas').first().click();
  await guest.keyboard.down('w');await guest.waitForTimeout(1200);await guest.keyboard.up('w');
  await guest.waitForTimeout(500);
  const after=await guest.evaluate(()=>{const p=window.reviewSnapshot.players.find(p=>p.id==='guest');return {x:p.x,y:p.y,tick:window.reviewSnapshot.tick};});
  assert(Math.hypot(after.x-before.x,after.y-before.y)>5,'Guest movement must reach authority after arrival');
  assert(after.tick>before.tick,'Snapshots must continue after arrival');
  report.checks.push('Guest movement and authoritative snapshots continue after arrival');
  report.movement={before,after};
  await guest.screenshot({path:directory+'/guest.png'});
  assert.deepEqual(report.errors,[]);console.log(JSON.stringify(report,null,2));
} catch(error) { report.failure=String(error);throw error; }
finally { await writeFile(directory+'/checks.json',JSON.stringify(report,null,2));await browser.close(); }
