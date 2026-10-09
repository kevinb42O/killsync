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
const directory = 'artifacts/cloud-fire';
await mkdir(directory, { recursive: true });
const browser = await playwright.chromium.launch({ headless: true, args: ['--use-angle=metal'] });
const report = { errors: [] };
try {
  const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
  page.on('pageerror', e => report.errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
  await page.route('**/__cloud_fire_review', route => route.fulfill({ contentType: 'text/html', body: '<body style="margin:0"></body>' }));
  await page.goto(`${origin}/__cloud_fire_review`);
  Object.assign(report, await page.evaluate(async () => {
    const THREE = await import('/node_modules/.vite/deps/three.js');
    const { FriendsClouds } = await import('/src/game/rendering/FriendsClouds.ts');
    const { FriendsCampfire } = await import('/src/game/rendering/FriendsCampfire.ts');
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#416789');
    const camera = new THREE.PerspectiveCamera(55, 640 / 480, 1, 10000);
    camera.position.set(0, 25, 160); camera.lookAt(0, 50, 0);
    const renderer = new THREE.WebGLRenderer({ preserveDrawingBuffer: true });
    renderer.setSize(640, 480); document.body.append(renderer.domElement);
    const clouds = new FriendsClouds();
    // Put a real dense cumulus volume behind the production campfire.
    clouds.count = 1;
    clouds.setMatrixAt(0, new THREE.Matrix4().compose(new THREE.Vector3(0, 260, -1350), new THREE.Quaternion(), new THREE.Vector3(2000, 1400, 800)));
    clouds.instanceMatrix.needsUpdate = true;
    clouds.material.uniforms.cloudTint.value.setRGB(.6, .75, 1);
    scene.add(clouds);
    const fire = new FriendsCampfire(scene, { id: 'review', x: 0, y: 0, z: 0, scale: 1, seats: false });
    fire.update(3, camera, 0);
    const gl = renderer.getContext();
    const read = () => { const data = new Uint8Array(640 * 480 * 4); gl.readPixels(0, 0, 640, 480, gl.RGBA, gl.UNSIGNED_BYTE, data); return data; };
    const warmPixels = data => {
      let count = 0;
      // Sample the flames above the logs, excluding the warmly lit ground.
      for (let y = 160; y < 350; y++) for (let x = 260; x < 380; x++) {
        const i = (y * 640 + x) * 4;
        if (data[i] > 100 && data[i] > data[i + 1] * 1.1 && data[i] > data[i + 2] * 1.5) count++;
      }
      return count;
    };
    const fixedOrder = clouds.renderOrder;
    clouds.renderOrder = 5; renderer.render(scene, camera);
    const baselineWarmPixels = warmPixels(read()), baseline = renderer.domElement.toDataURL();
    clouds.renderOrder = fixedOrder; renderer.render(scene, camera);
    const fixedWarmPixels = warmPixels(read()), fixed = renderer.domElement.toDataURL();
    // A solid foreground object must still occlude both the clouds and fire.
    const blocker = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshBasicMaterial({ color: '#354637' }));
    blocker.position.set(0, 50, 100); scene.add(blocker);
    renderer.render(scene, camera); const blocked = read();
    fire.group.visible = false; renderer.render(scene, camera); const hidden = read();
    let occlusionDelta = 0;
    for (let y = 180; y < 300; y++) for (let x = 240; x < 400; x++) for (let c = 0; c < 3; c++) {
      const i = (y * 640 + x) * 4 + c; occlusionDelta += Math.abs(blocked[i] - hidden[i]);
    }
    const glError = gl.getError();
    fire.dispose(); clouds.release(); blocker.geometry.dispose(); blocker.material.dispose(); renderer.dispose();
    return { baselineWarmPixels, fixedWarmPixels, occlusionDelta, glError, baseline, fixed };
  }));
  for (const name of ['baseline', 'fixed']) {
    await writeFile(`${directory}/${name}.png`, Buffer.from(report[name].split(',')[1], 'base64'));
    delete report[name];
  }
  assert.deepEqual(report.errors, []);
  assert.equal(report.glError, 0);
  assert(report.fixedWarmPixels > 1000, 'Flames must remain visible in front of dense clouds');
  assert(report.fixedWarmPixels > report.baselineWarmPixels * 1.5, 'Clouds must no longer wash out foreground flames');
  assert.equal(report.occlusionDelta, 0, 'Solid foreground geometry must still hide fire');
  console.log(JSON.stringify(report, null, 2));
} finally {
  await writeFile(`${directory}/checks.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
