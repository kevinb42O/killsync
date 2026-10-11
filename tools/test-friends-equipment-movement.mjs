import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); }
catch { playwright = require(join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const browser = await playwright.chromium.launch({ headless: true, args: ['--use-angle=metal', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const errors = [], checks = [];
const scheme = process.env.FRIENDS_TEST_CONTROLS || 'QWERTY';
const forward = scheme === 'AZERTY' ? 'z' : 'w';
const gesture = scheme === 'AZERTY' ? 'a' : 'q';
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 740 } });
  page.setDefaultTimeout(30000);
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(scheme => {
    localStorage.setItem('sunline.preferences.v1', JSON.stringify({ renderScale: .5, shadows: false }));
    localStorage.setItem('killsync.friends.menu.pause', 'true');
    localStorage.setItem('controlScheme', scheme);
    let locked = null;
    Object.defineProperty(document, 'pointerLockElement', { get: () => locked });
    HTMLCanvasElement.prototype.requestPointerLock = function () { locked = this; document.dispatchEvent(new Event('pointerlockchange')); return Promise.resolve(); };
    document.exitPointerLock = () => { locked = null; document.dispatchEvent(new Event('pointerlockchange')); };
  }, scheme);
  await page.goto((process.env.FRIENDS_TEST_ORIGIN || 'http://localhost:3015') + '/?mode=friends');
  await page.getByLabel('Your name', { exact: true }).fill('Movement regression');
  await page.getByRole('button', { name: 'Play on my own', exact: true }).click({ noWaitAfter: true });
  await page.locator('.coop-arena').waitFor({ state: 'attached', timeout: 120000 });
  await page.waitForFunction(() => !document.body.innerText.includes('OPERATOR LINK / SUNLINE COMMONS'), undefined, { timeout: 120000 });
  await page.evaluate(() => {
    const arena = document.querySelector('.coop-arena');
    let fiber = arena[Object.keys(arena).find(key => key.startsWith('__reactFiber'))];
    const review = {};
    while (fiber) {
      for (let hook = fiber.memoizedState; hook; hook = hook.next) {
        const value = hook.memoizedState?.current;
        if (value?.createSnapshot && value?.setInput) review.simulation = value;
        if (value?.type === 'input' && 'movement' in value) {
          review.input = hook.memoizedState;
          // The arena keeps its mobile input handler immediately after inputRef.
          review.mobile = hook.next.memoizedState;
        }
      }
      fiber = fiber.return;
    }
    if (!review.input || !review.simulation || typeof review.mobile?.current !== 'function') throw new Error('Arena controls unavailable');
    window.equipmentMovementReview = review;
    document.querySelector('.coop-arena canvas').requestPointerLock();
  });
  const input = () => page.evaluate(() => ({ ...equipmentMovementReview.input.current }));
  await page.keyboard.down(forward);
  await page.keyboard.down('d');
  await page.keyboard.down('Shift');
  let before = await input();
  assert.equal(before.movement, 9);
  assert.equal(before.sprinting, true);
  for (const key of ['2', '3', '4', '5', '6', '7', '1', 't', '2', '3', '4', '5', 't']) {
    await page.keyboard.press(key);
    const after = await input();
    assert.equal(after.movement, 9, `held diagonal movement after ${key}`);
    assert.equal(after.sprinting, true, `held sprint after ${key}`);
  }
  checks.push('number shortcuts and entering, cycling, leaving fun slots preserve held diagonal movement and sprint');
  await page.mouse.wheel(0, 100);
  assert.equal((await input()).movement, 9);
  await page.keyboard.press('t');
  await page.mouse.wheel(0, 100);
  assert.equal((await input()).movement, 9);
  await page.keyboard.press('t');
  checks.push('tool and fun mouse-wheel selection preserve movement');
  await page.keyboard.up('d');
  assert.equal((await input()).movement, 1);
  const distance = await page.evaluate(async () => {
    const sim = equipmentMovementReview.simulation, player = [...sim.players.values()][0];
    const x = player.x, y = player.y;
    await new Promise(resolve => setTimeout(resolve, 250));
    return Math.hypot(player.x - x, player.y - y);
  });
  assert(distance > 1, 'player continues moving in the simulation without a new keydown');
  await page.keyboard.up(forward);
  await page.keyboard.up('Shift');
  assert.equal((await input()).movement, 0);
  checks.push('simulation keeps moving without another keydown; key releases stop the correct directions');
  await page.keyboard.press('2');
  await page.keyboard.down(forward);
  await page.mouse.down();
  await page.mouse.down({ button: 'right' });
  await page.keyboard.press('3');
  before = await input();
  assert.equal(before.movement, 1);
  assert.equal(before.firing, false);
  assert.equal(before.aiming, false);
  await page.keyboard.up(forward);
  assert.equal((await input()).firing, false, 'movement update must not resurrect previous item firing');
  await page.mouse.up();
  await page.mouse.up({ button: 'right' });
  checks.push('old item firing and aiming are released without cancelling movement');
  await page.keyboard.press('1');
  await page.keyboard.down(gesture);
  await page.mouse.down();
  await page.keyboard.press('2');
  await page.keyboard.press('3');
  await page.keyboard.press('1');
  await page.keyboard.down(forward);
  assert.equal((await input()).friendsArms, 0);
  assert.equal((await input()).firing, false);
  await page.keyboard.up(gesture);
  await page.mouse.up();
  await page.keyboard.up(forward);
  checks.push('repeated switches keep held empty-hand gestures released');
  await page.keyboard.press('2');
  await page.evaluate(() => equipmentMovementReview.mobile.current({ type: 'move', x: .8, y: -.8, sprinting: true }));
  await page.evaluate(() => equipmentMovementReview.mobile.current({ type: 'hold', control: 'fire', pressed: true }));
  await page.evaluate(() => equipmentMovementReview.mobile.current({ type: 'tap', control: 'nextWeapon' }));
  before = await input();
  assert.equal(before.movement, 9);
  assert.equal(before.sprinting, true);
  assert.equal(before.firing, false);
  // A subsequent touch action republishes the joystick's stored state.
  await page.evaluate(() => equipmentMovementReview.mobile.current({ type: 'look', deltaX: 1, deltaY: 0 }));
  before = await input();
  assert.equal(before.movement, 9);
  assert.equal(before.sprinting, true);
  assert.equal(before.firing, false);
  checks.push('touch equipment selection preserves joystick and sprint state across subsequent input updates');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  before = await input();
  assert.equal(before.movement, 0);
  assert.equal(before.sprinting, false);
  assert.equal(before.firing, false);
  await page.evaluate(() => equipmentMovementReview.mobile.current({ type: 'look', deltaX: 1, deltaY: 0 }));
  assert.equal((await input()).movement, 0);
  checks.push('focus loss still clears keyboard and stored touch movement');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ scheme, checks, errors }, null, 2));
} finally {
  await browser.close();
}
