import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const sharp = require('sharp');
let playwright;
try { playwright = require('playwright'); }
catch { playwright = require(process.env.PLAYWRIGHT_MODULE || join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const origin = process.env.FRIENDS_TEST_ORIGIN || 'http://localhost:3000';
const directory = process.env.FRIENDS_TEST_ARTIFACT_DIR || 'artifacts/night-sky';
await mkdir(directory, { recursive: true });
const browser = await playwright.chromium.launch({ headless: true, args: [process.env.FRIENDS_TEST_ANGLE ? `--use-angle=${process.env.FRIENDS_TEST_ANGLE}` : '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const report = { errors: [], phases: [], checks: [], bodies: [] };
page.on('pageerror', e => report.errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
await page.addInitScript(() => {
  window.skyCompiles = 0;
  const compile = WebGL2RenderingContext.prototype.compileShader;
  WebGL2RenderingContext.prototype.compileShader = function (...args) { window.skyCompiles++; return compile.apply(this, args); };
});
try {
  await page.goto(`${origin}/tools/night-sky-review.html`);
  await page.waitForFunction(() => window.skyReview);
  await page.locator('#animate').uncheck();
  await page.waitForTimeout(300);
  const compiles = await page.evaluate(() => window.skyCompiles);
  for (const [name, hour] of [['midnight', 0], ['dusk', 18.8], ['noon', 12], ['dawn', 5.3]]) {
    await page.locator('#hour').fill(String(hour));
    await page.waitForTimeout(150);
    const state = await page.evaluate(() => {
      const { renderer, cycle } = window.skyReview;
      return { draws: renderer.info.render.calls, triangles: renderer.info.render.triangles, points: renderer.info.render.points, error: renderer.getContext().getError(), stars: cycle.state.stars, compiles: window.skyCompiles };
    });
    assert.equal(state.draws, state.stars > .001 ? 2 : 1);
    assert.equal(state.points, state.stars > .001 ? 11000 : 0);
    assert.equal(state.triangles, 2208); assert.equal(state.error, 0); assert.equal(state.compiles, compiles);
    if (name === 'noon') assert.equal(state.stars, 0);
    if (name === 'midnight') assert.equal(state.stars, 1);
    report.phases.push({ name, ...state });
    await page.locator('aside').evaluate(e => { e.style.display = 'none'; });
    const pixels = await sharp(await page.screenshot()).removeAlpha().raw().toBuffer();
    let blackPixels = 0;
    for (let i = 0; i < pixels.length; i += 3) if (pixels[i] === 0 && pixels[i + 1] === 0 && pixels[i + 2] === 0) blackPixels++;
    assert.equal(blackPixels, 0, `${name}: invalid black pixels in sky/horizon`);
    await page.locator('aside').evaluate(e => { e.style.display = ''; });
  }
  report.checks.push('one atmosphere draw plus one fixed star batch at night, no star draw at noon, no WebGL errors or shader recompilations');
  await page.locator('#night').click();
  await page.locator('aside').evaluate(e => { e.style.display = 'none'; });
  await page.waitForTimeout(150); await page.screenshot({ path: `${directory}/midnight.png` });
  await page.locator('aside').evaluate(e => { e.style.display = ''; });
  for (const id of ['planet', 'blue', 'rocky', 'moon']) {
    await page.locator(`#${id}`).click();
    await page.locator('aside').evaluate(e => { e.style.display = 'none'; });
    await page.waitForTimeout(150); await page.screenshot({ path: `${directory}/${id}.png` });
    const state = await page.evaluate(() => ({ compiles: window.skyCompiles, error: window.skyReview.renderer.getContext().getError(), draws: window.skyReview.renderer.info.render.calls }));
    assert.equal(state.error, 0); assert.equal(state.compiles, compiles); assert.equal(state.draws, 2);
    report.bodies.push({ id, ...state });
    await page.locator('aside').evaluate(e => { e.style.display = ''; });
  }
  report.checks.push('all three planets and the moon render at close range without shader recompilation; no invalid black horizon pixels at any phase');
  await page.locator('aside').evaluate(e => { e.style.display = 'none'; });
  // Verify actual rendered occlusion, not just a material flag: removing the
  // star batch must change the sky but leave the interior of the moon intact.
  const withStars = await sharp(await page.screenshot()).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const moonRadius = await page.evaluate(() => .014 * window.skyReview.camera.projectionMatrix.elements[5] * innerHeight * .5);
  await page.evaluate(() => {
    window.starOcclusionFixture = window.skyReview.scene.getObjectByName('frontier-random-stars');
    window.skyReview.scene.remove(window.starOcclusionFixture);
  });
  await page.waitForTimeout(150);
  const withoutStars = await sharp(await page.screenshot()).removeAlpha().raw().toBuffer();
  let changedSkyPixels = 0, changedMoonPixels = 0;
  for (let y = 0; y < withStars.info.height; y++) for (let x = 0; x < withStars.info.width; x++) {
    const i = (y * withStars.info.width + x) * 3;
    if (withStars.data[i] !== withoutStars[i] || withStars.data[i + 1] !== withoutStars[i + 1] || withStars.data[i + 2] !== withoutStars[i + 2]) {
      changedSkyPixels++;
      if ((x - withStars.info.width / 2) ** 2 + (y - withStars.info.height / 2) ** 2 < (moonRadius * .7) ** 2) changedMoonPixels++;
    }
  }
  assert(changedSkyPixels > 50, 'the random star batch must actually be visible');
  assert.equal(changedMoonPixels, 0, 'background stars must not shine through the moon');
  report.checks.push('random stars visibly affect the sky but do not shine through the moon');
  await page.evaluate(() => {
    window.skyReview.scene.add(window.starOcclusionFixture);
    delete window.starOcclusionFixture;
  });
  // Cover half the view with ordinary opaque depth, as a roof or terrain
  // would. Star removal must affect only the uncovered half of the image.
  await page.evaluate(() => {
    const { scene, cycle } = window.skyReview;
    const points = scene.getObjectByName('frontier-random-stars');
    const geometry = new points.geometry.constructor();
    const Attribute = points.geometry.getAttribute('position').constructor;
    geometry.setAttribute('position', new Attribute(new Float32Array([-1,-1,0, 0,-1,0, 0,1,0, -1,-1,0, 0,1,0, -1,1,0]), 3));
    const material = new cycle.sky.material.constructor({
      depthTest: true, depthWrite: true,
      vertexShader: 'void main(){gl_Position=vec4(position,1.);}',
      fragmentShader: 'void main(){gl_FragColor=vec4(.05,.07,.09,1.);}',
    });
    window.terrainDepthFixture = new cycle.sky.constructor(geometry, material);
    window.terrainDepthFixture.frustumCulled = false;
    scene.add(window.terrainDepthFixture);
  });
  await page.waitForTimeout(150);
  const withDepthStars = await sharp(await page.screenshot()).removeAlpha().raw().toBuffer();
  await page.evaluate(() => {
    window.starOcclusionFixture = window.skyReview.scene.getObjectByName('frontier-random-stars');
    window.skyReview.scene.remove(window.starOcclusionFixture);
  });
  await page.waitForTimeout(150);
  const withoutDepthStars = await sharp(await page.screenshot()).removeAlpha().raw().toBuffer();
  let coveredChanged = 0, uncoveredChanged = 0;
  for (let y = 0; y < withStars.info.height; y++) for (let x = 0; x < withStars.info.width; x++) {
    const i = (y * withStars.info.width + x) * 3;
    if (withDepthStars[i] !== withoutDepthStars[i] || withDepthStars[i + 1] !== withoutDepthStars[i + 1] || withDepthStars[i + 2] !== withoutDepthStars[i + 2]) {
      if (x < withStars.info.width / 2 - 4) coveredChanged++;
      if (x > withStars.info.width / 2 + 4) uncoveredChanged++;
    }
  }
  await sharp(withDepthStars, { raw: { width: withStars.info.width, height: withStars.info.height, channels: 3 } }).png().toFile(`${directory}/terrain-with-stars.png`);
  await sharp(withoutDepthStars, { raw: { width: withStars.info.width, height: withStars.info.height, channels: 3 } }).png().toFile(`${directory}/terrain-without-stars.png`);
  report.depthFixture = await page.evaluate(() => {
    const { renderer } = window.skyReview, gl = renderer.getContext();
    return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
      vertices: window.terrainDepthFixture.geometry.getAttribute('position').array.toString(),
      error: gl.getError(), depthEnabled: gl.getContextAttributes().depth };
  });
  assert.equal(coveredChanged, 0, 'opaque terrain/roofs must occlude the star batch');
  assert(uncoveredChanged > 50, 'stars must remain visible in unobstructed sky');
  await page.evaluate(() => {
    const { scene } = window.skyReview;
    scene.add(window.starOcclusionFixture);
    scene.remove(window.terrainDepthFixture);
    window.terrainDepthFixture.geometry.dispose(); window.terrainDepthFixture.material.dispose();
    delete window.terrainDepthFixture; delete window.starOcclusionFixture;
  });
  report.checks.push('opaque terrain/roof depth hides stars while unobstructed sky retains them');
  await page.locator('aside').evaluate(e => { e.style.display = ''; });
  await page.locator('#meteor').click();
  await page.locator('aside').evaluate(e => { e.style.display = 'none'; });
  await page.waitForTimeout(150); await page.screenshot({ path: `${directory}/meteor.png` });
  const paused = await page.evaluate(() => {
    const u = window.skyReview.cycle.sky.material.uniforms;
    return { head: u.meteorHead.value.toArray(), tail: u.meteorTail.value.toArray(), strength: u.meteorStrength.value };
  });
  assert(paused.strength > .9);
  await page.waitForTimeout(200);
  assert.deepEqual(await page.evaluate(() => {
    const u = window.skyReview.cycle.sky.material.uniforms;
    return { head: u.meteorHead.value.toArray(), tail: u.meteorTail.value.toArray(), strength: u.meteorStrength.value };
  }), paused);
  report.checks.push('a visible shooting star freezes correctly on the paused animation clock');
  assert.deepEqual(report.errors, []);
  console.log(JSON.stringify(report, null, 2));
} catch (error) { report.failure = String(error); throw error; }
finally { await writeFile(`${directory}/browser.json`, JSON.stringify(report, null, 2)); await browser.close(); }
