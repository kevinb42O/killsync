import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const { chromium } = require(join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.route('**/src/main.tsx*', route => route.abort());
  await page.goto(process.env.FRIENDS_TEST_ORIGIN || 'http://localhost:3000');
  const report = await page.evaluate(async () => {
    const { FriendsAudio } = await import('/src/game/FriendsAudio.ts');
    const { FriendsFlightFoliage } = await import('/src/game/FriendsFlightSound.ts');
    const { FriendsForestLOD } = await import('/src/game/rendering/FriendsForestLOD.ts');
    const THREE = await import('/node_modules/three/build/three.module.js');
    const check = (ok, message) => { if (!ok) throw new Error(message); };
    const until = async (condition) => {
      const deadline = performance.now() + 30000;
      while (!condition()) { if (performance.now() > deadline) throw new Error('Timed out loading audio/tree models'); await new Promise(r => setTimeout(r, 50)); }
    };
    const audio = new FriendsAudio(), release = audio.acquire();
    audio.setSettings({ music: 0, effects: .65, muted: false }); audio.activate();
    await until(() => audio.context?.state === 'running');
    audio.setHelicopterSound({ volume: .35, rate: 1.1, pan: .4 });
    audio.prepareFlightFoliage();
    await until(() => audio.helicopterLoop && ['000', '001', '002'].every(n => audio.buffers.has(`/audio/friends/flight_foliage_${n}.ogg`)));
    const decoded = [...audio.buffers].filter(([url]) => /helicopter_rotor|flight_foliage/.test(url)).map(([url, buffer]) => {
      const data = buffer.getChannelData(0), rms = Math.sqrt(data.reduce((s, n) => s + n * n, 0) / data.length);
      check(rms > .005 && buffer.duration > .6, `Silent/short audio: ${url}`);
      return { file: url, duration: buffer.duration, rms };
    });
    const loop = audio.helicopterLoop.source;
    for (let i = 0; i < 50; i++) audio.setHelicopterSound({ volume: .4, rate: 1.15, pan: -.4 });
    check(audio.helicopterLoop.source === loop, 'Rotor loop duplicated during motion');
    await until(() => audio.helicopterLoop.pan?.pan.value < -.1);
    const forest = new FriendsForestLOD(new THREE.Scene(), {});
    await until(() => forest.canopy({ kind: 'oak' }));
    const crowns = Object.fromEntries(['pine', 'oak', 'autumnOak'].map(kind => [kind, forest.canopy({ kind })]));
    for (const crown of Object.values(crowns)) check(crown.radius > 10 && crown.top > crown.bottom, 'Invalid leaf geometry bounds');
    const tree = { id: 'browser-canopy', kind: 'oak', x: 0, y: 0, z: 1000, scale: 1 }, crown = crowns.oak;
    const flight = new FriendsFlightFoliage(), height = tree.z + (crown.bottom + crown.top) / 2 - 30;
    const radius = crown.radius + 20;
    flight.sample({ x: -radius, y: 0, z: height }, 0, true, [tree], () => true, t => forest.canopy(t), 0);
    const brush = flight.sample({ x: radius, y: 0, z: height }, 100, true, [tree], () => true, t => forest.canopy(t), 0);
    check(brush, 'Real canopy crossing did not trigger rustle');
    const before = audio.voices.size;
    audio.play('flightFoliage', brush.volume, 330, brush.rate, .65, { pan: brush.pan });
    check(audio.voices.size === before + 1, 'Native foliage source did not play');
    audio.setSettings({ muted: true }); check(!audio.helicopterLoop, 'Mute retained rotor');
    audio.setSettings({ muted: false }); check(audio.helicopterLoop, 'Unmute did not resume rotor');
    audio.clearSoundscape(); check(!audio.helicopterLoop && !audio.retiringHelicopters.size, 'World exit retained rotor');
    forest.dispose(); release(); audio.dispose();
    return { checks: ['four real assets decode and contain audible samples', 'one rotor loop through repeated movement updates', 'native stereo panning', 'leaf bounds loaded for all three rendered species', 'swept crossing of actual oak canopy plays a native effect', 'mute/unmute and exit cleanup'], decoded, crowns };
  });
  if (errors.length) throw new Error(errors.join('; '));
  await mkdir('artifacts/friends-flight-audio', { recursive: true });
  await writeFile('artifacts/friends-flight-audio/browser.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
