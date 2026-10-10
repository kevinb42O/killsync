import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const origin = process.env.FRIENDS_TEST_ORIGIN || 'http://localhost:3014';
const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal'] });
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(origin + '/tools/water-polish-review.html');
  await page.waitForFunction(() => window.waterReview);
  const report = await page.evaluate(async () => {
    waterReview.pause();
    const source = await fetch('/src/game/rendering/FriendsUnderwaterVisuals.ts').then(r => r.text());
    const threeUrl = source.match(/from "([^"]*\/three\.js[^"]*)"/)[1];
    const THREE = await import(threeUrl);
    const { FriendsUnderwaterVisuals } = await import('/src/game/rendering/FriendsUnderwaterVisuals.ts');
    const { FriendsShaderWarmup } = await import('/src/game/rendering/FriendsShaderWarmup.ts');
    const { FRIENDS_RIVERS } = await import('/src/game/world/FriendsHydrology.ts');
    const { friendsWaterAt } = await import('/src/game/world/FriendsWaterSurface.ts');
    const { FriendsClouds } = await import('/src/game/rendering/FriendsClouds.ts');
    const { applyFriendsCaveLighting } = await import('/src/game/rendering/FriendsCaveLighting.ts');
    const { configureTerrainCoverage } = await import('/src/game/rendering/FriendsTerrainCoverage.ts');
    const renderer = waterReview.renderer, scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2('#b5cccf', .000015);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1));
    const sun = new THREE.DirectionalLight(0xffffff, 1);sun.position.set(1, 2, 1);scene.add(sun);
    const effect = new FriendsUnderwaterVisuals(scene), geometry = new THREE.BoxGeometry(30, 30, 30);
    // Match production ordering: world materials arrive after the effect.
    const materials = Array.from({ length: 24 }, (_, i) => new THREE.MeshStandardMaterial({ defines: { ENTRY_FIXTURE: i }, roughness: .8 }));
    const clouds = new FriendsClouds(renderer);
    const coverage = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);coverage.needsUpdate = true;
    materials.forEach((material, i) => {
      if (i % 3 === 1) clouds.shade(material);
      if (i % 3 === 2) applyFriendsCaveLighting(material);
      configureTerrainCoverage(material, coverage, 1, 'near');
      scene.add(new THREE.Mesh(geometry, material));
    });
    effect.prepare();
    const camera = new THREE.PerspectiveCamera(65, 1.6, 1, 10000);
    const river = FRIENDS_RIVERS.flatMap(r => r.points).find(p => {
      const water = friendsWaterAt(p.x, p.y);
      return water && FRIENDS_RIVERS.some(r => r.id === water.bodyId) && water.depth > 20;
    });
    if (!river) throw new Error('No river fixture');
    const positions = [{ name: 'river', x: river.x, z: river.y }, { name: 'sea', x: 40000, z: 23852 }];
    camera.position.set(river.x, friendsWaterAt(river.x, river.y).level + 100, river.y);
    camera.lookAt(river.x + 100, camera.position.y - 30, river.y);
    const warmup = new FriendsShaderWarmup(renderer, scene);
    const deadline = performance.now() + 30000;
    do {
      effect.beginFrame();warmup.update(camera);
      if (performance.now() > deadline) throw new Error('Shader warmup timed out');
      await new Promise(requestAnimationFrame);
    } while (!warmup.ready);
    renderer.render(scene, camera);
    const programs = renderer.info.programs.length, versions = materials.map(m => m.version);
    const checks = [];
    for (const location of positions) {
      const water = friendsWaterAt(location.x, location.z);
      const gl = renderer.getContext(), pixels = () => {
        const data = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
        gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, data);return data;
      };
      const land = () => {
        camera.position.set(location.x, water.level + 100, location.z);
        camera.lookAt(location.x + 100, camera.position.y - 10, location.z);
        let i = 0;for (const mesh of scene.children) if (mesh instanceof THREE.Mesh && mesh.geometry === geometry) {
          mesh.position.set(location.x + 100, camera.position.y + (Math.floor(i / 6) - 1.5) * 22, location.z + (i % 6 - 2.5) * 22);i++;
        }
        effect.beginFrame();effect.update(camera, 1000);renderer.render(scene, camera);
      };
      land();const before = pixels(), originalFog = scene.fog;
      camera.position.set(location.x, water.level - Math.min(40, water.depth / 2), location.z);
      camera.lookAt(location.x + 100, camera.position.y - 10, location.z);
      for (const mesh of scene.children) if (mesh instanceof THREE.Mesh && mesh.geometry === geometry) mesh.position.set(location.x + 100, camera.position.y, location.z);
      effect.beginFrame();const start = performance.now();effect.update(camera, 1000);renderer.render(scene, camera);
      const entryCpuMs = performance.now() - start, submerged = effect.overlay.visible;
      land();const after = pixels();let changedPixels = 0, visiblePixels = 0;
      for (let i = 0; i < before.length; i += 4) {
        if (before[i] + before[i+1] + before[i+2] > 15) visiblePixels++;
        if (before[i] !== after[i] || before[i+1] !== after[i+1] || before[i+2] !== after[i+2]) changedPixels++;
      }
      checks.push({ landChangedPixels: changedPixels, visibleLandPixels: visiblePixels, restoredFog: scene.fog === originalFog, surfaced: !effect.overlay.visible, body: location.name, submerged, programs: renderer.info.programs.length, newPrograms: renderer.info.programs.length - programs, changedMaterials: materials.filter((m, i) => m.version !== versions[i]).length, entryCpuMs, gl: renderer.getContext().getError() });
    }
    warmup.dispose();effect.dispose();clouds.release();coverage.dispose();geometry.dispose();materials.forEach(m => m.dispose());
    return { warmedPrograms: programs, checks };
  });
  assert.deepEqual(errors, []);
  for (const check of report.checks) {
    assert.equal(check.landChangedPixels, 0);assert(check.visibleLandPixels > 1000);assert.equal(check.restoredFog, true);assert.equal(check.surfaced, true);
    assert.equal(check.submerged, true);assert.equal(check.newPrograms, 0);assert.equal(check.changedMaterials, 0);assert.equal(check.gl, 0);
  }
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
