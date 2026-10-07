# Friends mode freeze investigation

Investigated 7 October 2026 against `9314c24`; the follow-up fixes below are implemented in the working tree.

## Implemented fixes and validation

- Railway and cave point lights retain a fixed shader configuration. Their intensity becomes zero outside their useful range, preserving darkness without compiling different light counts while exploring.
- Friends prepares scene, viewmodel, HDR arrival, wireframe, and final-pass shaders before their first draw. Parallel compilation polls stable GPU program handles and cancels on arena exit. This also fixes a browser-observed lifecycle error in Three.js's material-based async polling when switching tools disposes a material that is still being prepared.
- Texture uploads are limited to one new texture per frame. After initial preparation, new props and tools prepare in the background while the existing world continues drawing. Temporary visibility changes are restored after all rendering passes.
- Production Friends rendering omits development shader-log checks. Development builds retain shader validation.
- Wheel down selects the next tool; wheel up selects the previous tool. Both directions wrap through Axe, Pickaxe, Shovel, Earthwork, Combat, and Rope. The UI, keyboard shortcuts, and wheel share that order. Trackpad deltas accumulate; pinch, horizontal, and zero-delta events do not select tools. Menu scrolling is preserved, and build-mode wheel behavior remains intact.
- The performance overlay now receives actual frame elapsed time rather than the 100 ms simulation clamp.

Validation: **875 tests / 141 files passed**, TypeScript passed, and the production build passed with its existing bundle-size advisory. A fresh actual React/browser run completed preparation and terrain streaming, cycled through all six tools in both directions with wraparound, preserved the selected tool and scroll handling in the field-pack dialog, and reported no runtime or shader errors. The capture includes 138 renderer updates. This remains local software-GPU evidence, not a measurement on the affected PC.

Follow-up evidence: `artifacts/friends-freeze-investigation/fixed-browser.json`, `browser-checks.log`, `tests.log`, `lint.log`, and `build.log` in the same directory.

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
