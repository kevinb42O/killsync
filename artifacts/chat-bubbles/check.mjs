import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const { chromium } = require('/Users/kevin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal'] });
const report = { errors: [] };
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', error => report.errors.push(error.message));
  await page.goto('http://localhost:3000/tools/friends-character-review.html');
  await page.waitForFunction(() => window.friendsCharacterReview?.frames > 5);
  report.review = await page.evaluate(async () => {
    const { FriendsChatBubbles } = await import('/src/game/rendering/FriendsChatBubbles.ts');
    const r = window.friendsCharacterReview, bubbles = new FriendsChatBubbles(r.scene);
    const rigs = new Map(r.crew.slice(0, 3).map(c => [c.player.id, c.rig]));
    const texts = ['Found a nice spot by the water ✨', 'Bring the boat — I’ll grab the supplies.', 'meet me at the campfire when you’re ready, we can take the scenic route together and stop by the castle on the way back 🔥'];
    r.crew.slice(0, 3).forEach((c, i) => bubbles.show({ id: String(i), playerId: c.player.id, playerLabel: c.player.label, playerColor: c.player.color, text: texts[i], sentAt: 1 }, performance.now()));
    window.chatReview = { bubbles, r, rigs };
    const loop = () => { r.camera.updateMatrixWorld(true); bubbles.update(r.camera, 900, rigs, r.crew.map(c => c.player)); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    return { speakers: rigs.size };
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'artifacts/chat-bubbles/crew.png' });
  report.review.bubbles = await page.evaluate(() => window.chatReview.r.scene.children.filter(c => c.name === 'friends-chat-bubble').map(s => ({ visible: s.visible, width: s.material.map.image.width, height: s.material.map.image.height, depthTest: s.material.depthTest })));
  assert.equal(report.review.bubbles.length, 3);
  assert.ok(report.review.bubbles.every(b => b.visible && b.depthTest));

  await page.addInitScript(() => {
    localStorage.setItem('sunline.preferences.v1', JSON.stringify({ renderScale: 1, shadows: false }));
    localStorage.setItem('killsync.friends.menu.pause', 'true');
  });
  await page.routeWebSocket(url => url.searchParams.has('token'), socket => {
    const server = socket.connectToServer();
    server.onMessage(message => { try { if (JSON.parse(String(message)).type === 'connected') socket.send(message); } catch {} });
  });
  await page.goto('http://localhost:3000/?mode=friends', { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Your name', { exact: true }).fill('Chat review');
  await page.getByRole('button', { name: 'Play on my own', exact: true }).click({ noWaitAfter: true });
  await page.locator('.coop-arena').waitFor({ state: 'attached', timeout: 120000 });
  await page.waitForFunction(() => !document.body.innerText.includes('OPERATOR LINK / SUNLINE COMMONS'), undefined, { timeout: 120000 });
  await page.evaluate(() => {
    const element = document.querySelector('.coop-arena'), key = Object.keys(element).find(k => k.startsWith('__reactFiber'));
    let fiber = element[key], simulation, bridge;
    while (fiber) {
      let hook = fiber.memoizedState;
      while (hook) {
        const value = hook.memoizedState?.current;
        if (value?.createSnapshot && value?.setInput) simulation = value;
        if (value?.showChatMessage && value?.getFriendsTerrain) bridge = value;
        hook = hook.next;
      }
      fiber = fiber.return;
    }
    if (!simulation || !bridge) throw new Error('Arena refs unavailable');
    const host = [...simulation.players.values()][0], camera = bridge.renderer.camera;
    const direction = camera.getWorldDirection(camera.position.clone());
    simulation.addPlayer({ id: 'chat-friend', label: 'River', color: '#67e8f9' });
    const guest = simulation.players.get('chat-friend');
    Object.assign(guest, { x: host.x + direction.x * 180, y: host.y + direction.z * 180, z: host.z, angle: host.angle + Math.PI, verticalVelocity: 0 });
    bridge.showChatMessage({ id: 'guest-1', playerId: guest.id, playerLabel: guest.label, playerColor: guest.color, text: 'Ready when you are ✨', sentAt: 1 });
    window.liveChatReview = { simulation, bridge, guest };
  });
  await page.waitForTimeout(1000);
  await page.waitForFunction(() => window.liveChatReview.bridge.renderer.scene.getObjectByName('friends-chat-bubble')?.visible, undefined, {timeout:3000});
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'artifacts/chat-bubbles/island.png' });
  report.production = await page.evaluate(() => {
    const r = window.liveChatReview, scene = r.bridge.renderer.scene, sprite = scene.getObjectByName('friends-chat-bubble');
    const old = sprite.material.map;
    let textureDisposals = 0;
    old.addEventListener('dispose', () => textureDisposals++);
    r.bridge.showChatMessage({ id: 'guest-2', playerId: r.guest.id, playerLabel: r.guest.label, playerColor: r.guest.color, text: 'Let’s go!', sentAt: 2 });
    return { count: scene.children.filter(s => s.name === 'friends-chat-bubble').length, textureDisposals, glError: r.bridge.renderer.renderer.getContext().getError(), pixelWidth: old.image.width / 2 };
  });
  assert.equal(report.production.count, 1);
  assert.equal(report.production.textureDisposals, 1);
  assert.equal(report.production.glError, 0);
  await page.waitForFunction(() => !window.liveChatReview.bridge.renderer.scene.getObjectByName('friends-chat-bubble'), undefined, { timeout: 12000 });
  await page.keyboard.press('Enter');
  await page.locator('.coop-chat__composer input').fill('Chat still works ✨');
  await page.locator('.coop-chat__composer input').press('Enter');
  await page.locator('.coop-chat__message').filter({hasText:'Chat still works ✨'}).waitFor();
  report.chatFeed = await page.evaluate(() => ({
    message: document.querySelector('.coop-chat__messages').textContent,
    localBubble: !!window.liveChatReview.bridge.renderer.scene.getObjectByName('friends-chat-bubble')
  }));
  assert.ok(report.chatFeed.localBubble);
  assert.deepEqual(report.errors, []);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await writeFile('artifacts/chat-bubbles/report.json', JSON.stringify(report, null, 2));
  await browser.close();
}
