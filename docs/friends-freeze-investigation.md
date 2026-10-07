# Friends mode freeze investigation

Investigated 7 October 2026 against `9314c24`; graphics preparation was added in `c229a93` and removed on 8 October after a reported world-loading regression.

## Implemented fixes and validation

- Railway and cave point lights retain a fixed shader configuration. Their intensity becomes zero outside their useful range, preserving darkness without compiling different light counts while exploring.
- **Confirmed loading regression:** the cave light that casts shadows stayed visible outside the cave after `c229a93`, while its shadow updates remained disabled. Its first shadow map was therefore never created. Three.js still included that light's cube shadow sampler in lit materials, so WebGL rejected their world draws with `GL_INVALID_OPERATION` (1282); the unlit hologram and tool still appeared. Marking this one shadow map and the renderer for an initial update restores terrain, trees, and scenery. Subsequent exterior frames reuse the map, preserving stable shader counts and bounded shadow updates. The before/after browser capture verified the missing map and visibly restored the same scene after requesting its initialization. An isolated real Three.js/WebGL reproduction returned error 1282 with no map, then error 0 after initializing it (`artifacts/friends-world-loading/shadow-sampler.json`).
- World rendering uses the original streaming and arrival path. It no longer waits for a whole-scene graphics readiness check or hides objects while shaders compile. The added compiler, texture-upload scheduler, and opaque preparation overlay were removed. Streaming continuously adds materials, textures, and lighting variants, so making all of these ready at once a condition for rendering could skip world drawing repeatedly.
- Shader error reporting is enabled in production again, so real graphics failures remain diagnosable.
- Wheel down selects the next tool; wheel up selects the previous tool. Both directions wrap through Axe, Pickaxe, Shovel, Earthwork, Combat, and Rope. The UI, keyboard shortcuts, and wheel share that order. Trackpad deltas accumulate; pinch, horizontal, and zero-delta events do not select tools. Menu scrolling is preserved, and build-mode wheel behavior remains intact.
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
