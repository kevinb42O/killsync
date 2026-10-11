import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const { chromium } = require(join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const directory = 'artifacts/distant-islands'; await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', message => { if(message.type()==='error' && /THREE.WebGLProgram|VALIDATE_STATUS|shader.*ERROR/i.test(message.text())) errors.push(message.text()); });
  await page.goto((process.env.FRIENDS_TEST_ORIGIN || 'http://localhost:3014') + '/tools/friends-coastal-pier-review.html');
  await page.waitForFunction(() => window.coastalPierReview?.scene.getObjectByName('friends-distant-islands'));
  await page.locator('aside').evaluate(el => el.style.display = 'none');
  await page.evaluate(() => { const r = window.coastalPierReview; r.camera.far = 110000; r.camera.updateProjectionMatrix(); r.camera.position.set(1200, 80, 6200); r.camera.lookAt(-15500, 1400, -6500); });
  await page.waitForTimeout(7000);
  await page.screenshot({ path: directory + '/coastal-castle.png' });
  await page.evaluate(() => { const r = window.coastalPierReview; r.camera.position.set(1200, 80, 6200); r.camera.lookAt(-17500, 2500, 21500); });
  await page.waitForTimeout(2000); await page.screenshot({ path: directory + '/coastal-volcano.png' });
  for (const [hour, name] of [[18, 'dusk'], [0, 'night']]) {
    await page.evaluate(hour => window.coastalPierReview.world.setEnvironment({ hour, speed: 0 }), hour);
    await page.waitForTimeout(1500); await page.screenshot({ path: directory + '/volcano-' + name + '.png' });
  }
  await page.evaluate(() => window.coastalPierReview.world.setEnvironment({ hour: 12, speed: 0 }));
  await page.evaluate(() => { const r = window.coastalPierReview; r.camera.position.set(1000, 900, 1500); r.camera.lookAt(-6500, 1550, -20500); });
  await page.waitForTimeout(2000); await page.screenshot({ path: directory + '/snow-ridges.png' });
  for (const [name, eye, look] of [
    ['eastern-ridge', [42000, 1000, 19000], [64500, 1200, 18500]],
    ['verdant-keys', [29000, 450, 45500], [29000, 550, 64000]],
    ['castle-coast', [-9000, 1400, -3500], [-14500, 850, -6500]],
  ]) {
    await page.evaluate(({eye,look})=>{const r=window.coastalPierReview;r.camera.position.set(...eye);r.camera.lookAt(...look);},{eye,look});
    await page.waitForTimeout(1500);await page.screenshot({path:directory+'/'+name+'.png'});
  }
  await page.evaluate(() => { const r = window.coastalPierReview; r.camera.position.set(1200, 80, 6200); r.camera.lookAt(-17500, 2500, 21500); });
  // Freeze streaming and atmosphere before alternating identical views.
  const report = await page.evaluate(() => {
    const r = window.coastalPierReview; r.pause(); const g = r.scene.getObjectByName('friends-distant-islands'), gl = r.renderer.getContext();
    const samples = [];
    for (let cycle = 0; cycle < 8; cycle++) for (const visible of cycle % 2 ? [true, false] : [false, true]) {
      g.visible = visible; r.scene.getObjectByName('the-surrounding-ocean').traverse(o=>{if(o.isMesh&&o.material.uniforms?.outerCoastEnabled)o.material.uniforms.outerCoastEnabled.value=visible?1:0;}); for (let n = 0; n < 10; n++) r.renderer.render(r.scene, r.camera); gl.finish();
      const start = performance.now(); for (let n = 0; n < 35; n++) r.renderer.render(r.scene, r.camera); gl.finish();
      samples.push({ visible, renderMs: (performance.now() - start) / 35, calls: r.renderer.info.render.calls, triangles: r.renderer.info.render.triangles });
    }
    g.visible = true;r.scene.getObjectByName('the-surrounding-ocean').traverse(o=>{if(o.isMesh&&o.material.uniforms?.outerCoastEnabled)o.material.uniforms.outerCoastEnabled.value=1;});
    let triangles = 0, bytes = 0, meshes = 0; g.traverse(o => { if (o.isMesh) { meshes++; triangles += o.geometry.attributes.position.count / 3; for (const a of Object.values(o.geometry.attributes)) bytes += a.array.byteLength; } });
    return { samples, meshes, triangles, bytes, gl: gl.getError(), measurement: 'GPU-synchronized paired static rendering of islands plus their shoreline atlas in a coastal view; excludes simulation and streaming. Hardware-specific, not an FPS guarantee.' };
  });
  // Streaming coverage separates each island's dressing from its land mesh.
  assert.equal(report.meshes, 11); assert.equal(report.gl, 0); assert.deepEqual(errors, []);
  const median = values => { values.sort((a,b) => a-b); return (values[3] + values[4]) / 2; };
  report.medianVisibleMs = median(report.samples.filter(s => s.visible).map(s => s.renderMs));
  report.medianHiddenMs = median(report.samples.filter(s => !s.visible).map(s => s.renderMs));
  report.deltaMs = report.medianVisibleMs - report.medianHiddenMs; report.errors = errors;
  await writeFile(directory + '/validation.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
