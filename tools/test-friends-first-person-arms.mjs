import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const { chromium } = require(join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const origin = process.env.FRIENDS_TEST_ORIGIN || 'http://localhost:3015';
const directory = 'artifacts/first-person-arms';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal'] });
const report = { errors: [], poses: [], modes: [] };
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', error => report.errors.push(error.message));
  await page.goto(origin + '/tools/friends-character-review.html');
  await page.waitForFunction(() => window.friendsCharacterReview?.gestures.model);
  report.poses = await page.evaluate(() => {
    const r = window.friendsCharacterReview, results = [], vector = r.camera.position.clone();
    r.setMode('hands');
    for (const aspect of [16 / 9, 2.4, 9 / 16]) {
      r.handCamera.aspect = aspect; r.handCamera.updateProjectionMatrix();
      r.gestures.update(0, 0, 10000, true); r.handCamera.updateMatrixWorld(true);
      const shoulders = [2, 3].map(index => r.gestures.model.parts[index].localToWorld(vector.clone().fromArray(r.gestures.model.parts[index].userData.shoulderPivot)));
      for (let mask = 0; mask < 16; mask++) {
        r.gestures.update(mask, 0, 10000, true); r.handCamera.updateMatrixWorld(true);
        for (let side = 0; side < 2; side++) {
          const part = r.gestures.model.parts[side + 2], mesh = part.children[0], positions = mesh.geometry.getAttribute('position');
          const shoulder = part.localToWorld(vector.clone().fromArray(part.userData.shoulderPivot));
          const bounds = { min: [Infinity, Infinity], max: [-Infinity, -Infinity] };
          mesh.skeleton.update();
          for (let i = positions.count - 36; i < positions.count; i++) {
            mesh.getVertexPosition(i, vector).applyMatrix4(mesh.matrixWorld).project(r.handCamera);
            for (let axis = 0; axis < 2; axis++) { bounds.min[axis] = Math.min(bounds.min[axis], vector.getComponent(axis)); bounds.max[axis] = Math.max(bounds.max[axis], vector.getComponent(axis)); }
          }
          results.push({ aspect, mask, side, gap: shoulder.distanceTo(shoulders[side]), shoulderZ: shoulder.clone().applyMatrix4(r.handCamera.matrixWorldInverse).z, active: Boolean(mask & ((1 << side) | (1 << (side + 2)))) && !((mask & (1 << side)) && (mask & (1 << (side + 2)))), bounds });
        }
      }
    }
    r.handCamera.aspect = innerWidth / innerHeight; r.handCamera.updateProjectionMatrix();
    return results;
  });
  for (const pose of report.poses) {
    assert(pose.gap < .0001 && pose.shoulderZ > 0, JSON.stringify(pose));
    if (pose.active) assert(pose.bounds.min[0] < 1 && pose.bounds.max[0] > -1 && pose.bounds.min[1] < 1 && pose.bounds.max[1] > -1, JSON.stringify(pose));
  }
  for (const [mode, mask] of [['hands', 0], ['hands', 12], ['hands', 3], ['hands', 5], ['hands', 10], ['hands', 15], ['axe', 0], ['pickaxe', 0], ['shovel', 0], ['rope', 0], ['flashlight', 0]]) {
    await page.evaluate(([mode, mask]) => { const r = window.friendsCharacterReview; r.setMode(mode); r.setMask(mask); document.querySelector('aside').hidden = true; }, [mode, mask]);
    await page.waitForTimeout(350);
    const gl = await page.evaluate(() => window.friendsCharacterReview.renderer.getContext().getError());
    assert.equal(gl, 0); report.modes.push({ mode, mask, gl });
    await page.screenshot({ path: `${directory}/after-${mode}-${mask}.png` });
  }
  assert.deepEqual(report.errors, []);
  await writeFile(directory + '/report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ shoulderChecks: report.poses.length, visibleHandChecks: report.poses.filter(p => p.active).length, modes: report.modes.length, errors: report.errors }));
} finally { await browser.close(); }
