# Friends mode freeze investigation

Investigated 7 October 2026 against `9314c24`; graphics preparation was added in `c229a93` and removed on 8 October after a reported world-loading regression.

## Train submission optimisation — 8 October

This pass starts from `745226c`. Each scenic carriage previously submitted 42 separate running-gear meshes: eight tyres, eight rims, eight hubs, sixteen spokes and two bogie frames. These now use four articulated instanced batches, keeping the original geometries, materials and individual shadow flags. Original wheel and bogie groups still drive wheel roll, steering and grade alignment; the batches compose their transforms without changing the route or animation. Bounds refresh whenever articulation changes, preserving frustum and shadow visibility. Exactly unchanged poses reuse their instance buffers and bounds. Fixed local mesh transforms are computed once; carriage, bogie and wheel groups remain animated.

| Measured path (mean per frame) | Before | After | Reduction |
| --- | ---: | ---: | ---: |
| island — CPU world render | 7.200 ms | 5.882 ms | 18.3% |
| island — draw calls, including shadows | 1,414.0 | 998.8 | 29.4% |
| high-dpi — CPU world render | 8.779 ms | 7.372 ms | 16.0% |
| high-dpi — draw calls, including shadows | 1,460.5 | 1,050.0 | 28.1% |
| pan — CPU world render | 7.705 ms | 6.153 ms | 20.1% |
| pan — draw calls, including shadows | 1,410.0 | 993.8 | 29.5% |

Method matches the previous pass: fresh Chromium contexts, Apple M1 Metal, actual Friends host arena, 1600 × 900 viewport, DPR 2 high-dpi phase, paused 09:00 clock/wind and identical continuous camera pan. Twelve seconds of measurement follow each five-second settling period. GPU world time did not improve measurably: 21.179 → 21.348 ms, 39.792 → 40.058 ms and 21.143 → 21.305 ms respectively. This is a CPU submission improvement, not a measured FPS improvement on either PC. Forest counts and triangle totals remain identical in all three phases, as do terrain allocation totals. The grouped bounds can submit a few additional original train triangles when part of a batch intersects a frustum; geometry is neither reduced nor duplicated.

Resolution, render distance, forest LOD thresholds, cloud detail, shaders and shadow settings are unchanged. Experiments with skipping the zero-intensity secondary directional light and drawing foliage after terrain did not improve measured GPU time and are omitted. The dense forest remains the main GPU cost in the tested exterior scene.

`tools/profile-friends-rendering.mjs` now compiles historical fixtures through the same Vite pipeline as the current source, including imports between changed files. Run with `FRIENDS_PROFILE_REV=745226c` for this baseline and omit the variable for the working tree, against `DISABLE_HMR=true npm run dev`. Temporary baseline sources never replace originals and are deleted afterward. Raw reports are `artifacts/friends-render-second-pass/before.json` and `after.json`.

`tools/test-friends-train-equivalence.mjs` compares 40 old/new real-WebGL train views: all five carriage types, wheel motion, curves, grades and the route seam, with antialiasing and shadows. Transformed original running-gear vertices retain the same materials, shadow flags and counts, with a maximum coordinate error below 0.00001 world units. Float32 instance composition introduces sparse silhouette/contact rounding: at most four of 264,000 pixels differ in any comparison, maximum channel difference 8/255 and maximum RMS 0.0125/255. These are not claimed to be pixel-identical. An additional 54 standard/cloud/cave lighting cases under day, twilight and night pass within one 8-bit colour step. No runtime or GL errors occurred. Reports and representative train captures are under `artifacts/friends-render-second-pass`. Unit coverage verifies dynamic bounds and unchanged-pose buffer reuse, alongside existing roof clearance, competing-face and steering tests.

## Further rendering optimisation — 8 October

This pass starts from `ed8d623`, which already fixes the day/night shader-compilation freeze. It removes unnecessary rendering work without changing resolution, render distance, forest LOD thresholds, geometry, materials, cloud detail, active lighting or shadow settings.

`FriendsDirectLighting` keeps the existing point/spot light uniforms and shadow samplers in every shader. It adds a uniform branch around a light whose colour is exactly zero, and a per-fragment branch around contributions that Three.js already marks invisible. The stock shader still executes its direct-light BRDF after computing a zero contribution. Twelve inactive cave/railway lamps commonly occupy the exterior shader configuration, so avoiding that work saves GPU time over millions of fragments. Nonzero contributions execute the original lighting, cookies and shadows. Cloud-shaded exterior materials and cave materials share this helper; the global Three.js shader chunks remain unchanged.

`FriendsForestLOD` reuses packed instances only when the camera view matrix, projection matrix, position, drawing-buffer height and world inputs are exactly identical. Even a 0.0000001-unit camera change invalidates the cache. Harvest/regrowth revisions, planted-tree transforms, terrain grades/support edits, and disabling/re-enabling forests also invalidate it. During movement, indexed bucket arrays replace repeated string construction and map lookup, precomputed species capacities replace full-array filtering, indexed loops avoid per-tree closures, and equivalent squared-distance checks avoid square roots. The same trees, wood LODs and nearby offscreen shadow casters remain eligible immediately.

| Measured path (mean per frame) | Before | After | Work reduction |
| --- | ---: | ---: | ---: |
| island — GPU world pass | 35.045 ms | 21.440 ms | 38.8% |
| island — Forest CPU update | 2.926 ms | 0.007 ms | 99.8% |
| high-dpi — GPU world pass | 74.851 ms | 40.551 ms | 45.8% |
| high-dpi — Forest CPU update | 3.691 ms | 0.006 ms | 99.8% |
| pan — GPU world pass | 34.470 ms | 21.289 ms | 38.2% |
| pan — Forest CPU update | 3.353 ms | 2.229 ms | 33.5% |

Forest counts and triangle totals match exactly at the end of every phase: stationary island 3,967 trees / 4,097,656 forest triangles; DPR 2 island 3,967 / 4,140,420; camera pan 4,013 / 4,152,286. These totals include the existing nearby offscreen trees retained for shadows. The train draw path is unchanged.

Method: fresh independent Chromium contexts on Apple M1 Metal; the actual Friends host arena at a 1600 × 900 viewport, with a 3200 × 1800 drawing buffer in the DPR 2 phase. Clock paused at 09:00 and wind paused to compare the same lighting. Each phase has five seconds of settling followed by twelve seconds of measurement, after a twelve-second startup wait. GPU timings use asynchronous WebGL timer queries, with disjoint timings rejected. The menu is omitted to isolate the arena. The camera pan follows the same continuous ±0.2-radian path. This measures these scenes on this Mac, not FPS on either affected PC.

The reproducible benchmark is `tools/profile-friends-rendering.mjs`; run the baseline with `FRIENDS_PROFILE_REV=ed8d623` and omit that variable for the working tree. Both runs require a local Vite server with HMR disabled (`DISABLE_HMR=true npm run dev`). Raw reports are in `artifacts/friends-render-optimisation/before.json` and `after.json`.

Visual validation: `tools/test-friends-render-equivalence.mjs` renders old/new real WebGL fixtures for standard, cloud and cave shading under six lamp configurations each: all off, active point light, active spotlight, all active, outside attenuation range, and a mixture of active/inactive lights. It includes point/spot shadows. All 18 cases pass with a maximum difference of one 8-bit colour step; the worst RMS difference is below 0.0014/255 across all channels. No GL or runtime errors occurred. See `artifacts/friends-render-optimisation/equivalence.json`. Forest regression coverage checks exact cache invalidation for motion, projection, resolution, harvest and terrain edits, plus the existing foliage, LOD, planting, support and shadow cases.

Production validation passed against the built app on Apple M1 Metal: visible world in fresh storage and with delayed textures / readiness forced false; camera movement and repeat arrival; all six tools in both scroll directions with wraparound; normal dialog scrolling; no GL, runtime or shader errors. Every tested clock transition compiled zero shaders. A 30-second run at 120× covered 2.5 full cycles, compiled zero shaders, drew 1,312 frames, and recorded 34.1 ms at the 95th percentile / 35.4 ms maximum, with zero stalls over 500 ms. Reports are `artifacts/friends-render-optimisation/world/browser.json` and `cycle/browser.json`; representative island, noon and midnight screenshots accompany them. The existing headless pointer-capture shim emulates only OS capture; the production handlers and renderer are real.

The complete unit suite passed **868 tests / 139 files**, TypeScript passed, and the production build passed with its existing bundle-size advisory.

## Confirmed day/night transition stall — 8 October

The user reported that pausing the day/night clock stops the freezes on both affected PCs. A fresh browser reproduction on the actual Friends host arena then measured an **8,024.9 ms synchronous world-render call at 18:03**, with **64 shader compilations / 32 additional programs in that frame**. At 18:39, another eight shader compilations accompanied a 131.4 ms render call. The clock was accelerated to 120× to reach both transitions quickly. This reproduces the reported freeze mechanism locally; the timings are from Apple M1 Metal, not either affected PC.

The old cycle enabled and disabled `castShadow` on the sun and moon as their intensities crossed `.01`. At the horizon this changed the directional shadow-light count from one to zero, then back to one. Three.js includes `numDirLightShadows` in its program cache key (`node_modules/three/src/renderers/webgl/WebGLPrograms.js`). Every lit material encountering the zero-shadow configuration could therefore build another shader program synchronously during gameplay. The renderer could stop completely while waiting for those programs.

`FriendsDayNightCycle` now keeps one celestial shadow slot and reuses the same directional light and shadow map for whichever body is dominant. The secondary directional light preserves the other body's intensity, colour and direction through twilight. When neither body is strong enough to cast a shadow, the primary light's shadow intensity becomes zero without removing its shader slot. The sun and moon in the sky still follow their original orbits.

**Rendering quality settings are unchanged:** 2048 × 2048 celestial shadow map, camera coverage, bias, PCF filtering, 10 Hz refresh, 1024 × 1024 cloud atlas, 12 cloud-shadow samples, visible cloud detail and continuous wind. No new graphics readiness gate or visibility gate was added. The cloud atlas was measured separately using asynchronous GPU timer queries: its maximum pass time before the fix was 2.50 ms during the accelerated cycle, versus the multi-second shader stall. Its rendering was therefore left intact.

The same fresh-browser accelerated-cycle reproduction after the fix compiled **zero** new shaders, retained 90 programs instead of growing to 126, and reduced the maximum world-render call to **12.7 ms**. The CPU render-call duration is not the complete displayed frame time. Measurements, startup camera compilation, and the before/after methods are recorded in `artifacts/friends-day-night/profile.json`.

Validation: **867 tests / 139 files passed**, TypeScript passed, and the production build passed with its existing bundle-size advisory. The orbit regression checks every minute of a full day: stable shadow slot and map, full shadow resolution, both bodies' original intensity/colour/direction, and correct dominant-body shadows. `tools/test-friends-day-night.mjs` runs the production app through its real developer controls, checking pixels and GL errors at noon, sunset, the dusk gap, moonrise, midnight, the dawn gap and sunrise. All transitions compiled zero shaders. A further 30 seconds at 120× covered 2.5 full cycles, compiled zero shaders and recorded 1,052 frames, a 34.2 ms 95th percentile and a 49.4 ms maximum, with zero runtime/shader/GL errors. See `artifacts/friends-day-night/browser.json` and the phase screenshots. Headless pointer capture uses the same platform-contract shim as the existing production world-rendering check.

The existing production world-rendering check also passed: visible terrain, camera movement, every tool in both wheel directions, wraparound, menu scrolling, repeat arrival, delayed textures and a parallel-shader readiness signal forced to remain false. Its report for this change is `artifacts/friends-day-night/world-rendering.json`; the earlier loading-regression captures remain under `artifacts/friends-world-loading`.

A separate real-WebGL quality comparison rendered the old and new cycle against identical sky, geometry, materials, camera and 2048 × 2048 PCF shadows at 20 clock positions, including both horizon gaps. All RGBA pixels were **identical** at every position (420 × 300 fixture; `artifacts/friends-day-night/quality-comparison.json`). This fixture verifies the unchanged celestial lighting and shadows; the production phase screenshots additionally cover actual world rendering.

## Implemented fixes and validation

- Railway and cave point lights retain a fixed shader configuration. Their intensity becomes zero outside their useful range, preserving darkness without compiling different light counts while exploring.
- **Confirmed loading regression:** the cave light that casts shadows stayed visible outside the cave after `c229a93`, while its shadow updates remained disabled. Its first shadow map was therefore never created. Three.js still included that light's cube shadow sampler in lit materials, so WebGL rejected their world draws with `GL_INVALID_OPERATION` (1282); the unlit hologram and tool still appeared. Marking this one shadow map and the renderer for an initial update restores terrain, trees, and scenery. Subsequent exterior frames reuse the map, preserving stable shader counts and bounded shadow updates. The before/after browser capture verified the missing map and visibly restored the same scene after requesting its initialization. An isolated real Three.js/WebGL reproduction returned error 1282 with no map, then error 0 after initializing it (`artifacts/friends-world-loading/shadow-sampler.json`).
- World rendering uses the original streaming and arrival path. It no longer waits for a whole-scene graphics readiness check or hides objects while shaders compile. The added compiler, texture-upload scheduler, and opaque preparation overlay were removed. Streaming continuously adds materials, textures, and lighting variants, so making all of these ready at once a condition for rendering could skip world drawing repeatedly.
- Shader error reporting is enabled in production again, so real graphics failures remain diagnosable.
- Wheel down selects the next tool; wheel up selects the previous tool. Both directions wrap through Axe, Pickaxe, Shovel, Combat, and Rope. The UI, keyboard shortcuts, and wheel share that order. Trackpad deltas accumulate; pinch, horizontal, and zero-delta events do not select tools. Menu scrolling is preserved, and build-mode wheel behavior remains intact.
- The performance overlay now receives actual frame elapsed time rather than the 100 ms simulation clamp.

Original validation for `c229a93`: **875 tests / 141 files passed**, TypeScript passed, and the production build passed with its existing bundle-size advisory. The browser check verified preparation and terrain streaming, tool cycling, dialog scroll handling, and no runtime errors. It counted renderer updates but did not inspect the visible world. That was insufficient to catch the reported rendering regression.

Follow-up evidence: `artifacts/friends-freeze-investigation/fixed-browser.json`, `browser-checks.log`, `tests.log`, `lint.log`, and `build.log` in the same directory.

Correction validation: **866 tests / 139 files passed**, TypeScript passed, and the production build passed with the existing bundle-size advisory. `tools/test-friends-world-rendering.mjs` passed against the built production app on Chromium's Apple M1 Metal renderer. It checks actual WebGL draws, GL errors, canvas pixels, camera changes, movement, every tool in both wheel directions, dialog scrolling, and repeat arrival. A second fresh browser context delays textures and forces the parallel-shader readiness signal to remain false. Both contexts displayed textured terrain and scenery with zero GL, runtime, or shader errors. Pointer capture is emulated because headless Chromium cannot capture the OS pointer; production input handlers and WebGL rendering are real. Screenshots and the browser report are saved under `artifacts/friends-world-loading`. The isolated invalid-shadow-sampler reproduction used software WebGL. Neither browser environment is a measurement on the affected PC.

The rest of this document preserves the **original investigation before these fixes**.

## Conclusion and confidence

The leading suspect for whole-client pauses on a new computer is graphics initialization and shader compilation during play. The code contains a concrete trigger for additional shader variants during exploration: railway lamps and cave lights change their `visible` flags according to camera position. Three.js excludes invisible lights and includes the active light counts in its shader program cache key. Entering a newly encountered lighting configuration can therefore compile another set of materials. No game-side calls to `compileAsync` or `initTexture` prewarm these resources.

This is a verified code mechanism, **not confirmation of the reported PC's individual pauses**. No performance capture, browser information, host/guest role, or confirmation that mouse look freezes was available from that PC. Network state stalls remain a different possibility if the camera continues moving. If the same pauses continue in already visited areas after reload, first-use compilation alone is an insufficient explanation.

## Measurements

Fresh independent headless Chromium context, local Vite application, 700 × 500 viewport, software WebGL GPU. The actual React host arena ran with the menu scenery omitted in the isolated arena capture. A separate CPU benchmark used the real forest assets and worker, without drawing the scene.

| Path | Observed result |
| --- | --- |
| Synchronous save, initial world | 1.4 ms |
| Synchronous save, 6,000 terrain records | 1.0 ms |
| First forest setup, 4,081 natural trees | 89 ms in CPU benchmark; 40 ms in isolated arena |
| Subsequent unchanged forest updates | 0–0.2 ms in CPU benchmark |
| Plant/remove one tree | 12 / 11.6 ms in CPU benchmark |
| Simulation step | 0.8–20.1 ms in CPU benchmark; arena maximum 17.6 ms |
| Isolated arena terrain surface update | Maximum 2.3 ms |
| Isolated arena shader programs | 39 linked over 12 rendered frames during arrival |
| Individual first-use shader status read | Maximum 43.1 ms |
| Individual texture upload | Maximum 27.9 ms |
| Terrain worker errors | None |

The isolated arena CPU profile attributes approximately 373 ms cumulatively to shader status reads and 372 ms to texture uploads. These synchronous GPU calls occur on the browser thread. Shader compilation is normally issued asynchronously by WebGL, but querying its status/logs and using a newly linked program can wait for completion. The local Three.js first-use path performs these queries. Friends arrival also draws the actual scene plus a wireframe pass until its reveal finishes, temporarily increasing graphics work.

The software GPU produces large render delays, so its FPS and pause durations must not be extrapolated to the user's high-end PC. The measurements support which paths perform blocking work; they do not establish the user's actual hardware timings. The modest saves and simulation times make those weaker suspects for multi-second freezes in the tested fixtures.

An earlier exploratory capture included menu scenery and its GPU-context teardown. Its timings were excluded from the isolated arena evidence.

## Relevant code

- `FriendsScenicRailwayVisuals.ts:255`: camera-dependent point-light visibility.
- `FriendsCaveVisuals.ts:56`: nearby underground light visibility.
- `FriendsFlashlight.ts:60` and `FriendsNightVision.ts:93`: additional lighting changes when equipped.
- `FriendsWorldArrival.ts:148`: actual scene and wireframe arrival passes.
- `Renderer3D.ts:459`: desktop rendering follows device pixel ratio up to 2, increasing pixel work on dense displays.
- `MultiplayerArena.ts:2279`: frame elapsed time is capped at 100 ms before the performance overlay records it. The existing overlay can hide the real size of a freeze, and is available only in development.

Three.js documentation: https://threejs.org/docs/pages/WebGLRenderer.html (`compileAsync` and `initTexture`).

## Evidence and next discriminating check

- `artifacts/friends-freeze-investigation/cpu-paths.json`
- `artifacts/friends-freeze-investigation/arena-profile.json`
- `artifacts/friends-freeze-investigation/arena.cpuprofile` — load into Chrome DevTools' JavaScript profiler.

Capture a freeze on the affected PC and correlate the long frame with shader first-use calls, texture uploads, terrain work, or stale authoritative state. Record the browser, host/guest role, whether camera look stops, and whether it happens in new areas or while stationary. Compare the same route after reload to test the cold-cache explanation before changing rendering behavior.
