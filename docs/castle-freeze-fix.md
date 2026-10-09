# Castle approach freeze — 9 October 2026

The confirmed trigger is camera-dependent visibility of the eight point lights
in `FriendsCastleTorches`, rather than the stair geometry. The constructor hid
all eight lights; `update` made each light visible when its selected torch was
within 2,800 world units of the camera. Approaching the castle could introduce
multiple previously unseen point-light counts.

Three.js r185 excludes invisible objects while collecting scene lights. Its
`WebGLPrograms` includes `numPointLights` in the shader program cache key. A new
count therefore requests new programs for lit materials throughout the scene.
Compiling and first using those programs can block the browser render call.

## Controlled reproduction

`tools/profile-friends-castle.mjs` opens the actual Friends arena in Chromium
using Apple M1 Metal. After arrival it pauses the game loop, fixes the camera
on the castle, and retains the same geometry and terrain. It changes only the
camera position supplied to the torch selector. This isolates the light-count
transition from camera movement, stair generation, terrain streaming and
simulation work. The first castle-view render warms newly visible materials;
the entry measurement follows another render at the identical view.

| Entering torch range | Before | After |
| --- | ---: | ---: |
| Synchronous render call | 29,689.7 ms | 7.0 ms |
| Shader compilations in that frame | 76 | 0 |
| New linked programs in that frame | 38 | 0 |
| Torch slots visible to Three.js, far → near | 0 → 8 | 8 → 8 |
| Torches contributing light, far → near | 0 → 8 | 0 → 8 |

The original next frame took 27.4 ms and compiled no shaders. With the fix,
leaving and re-entering took 7.1 and 7.8 ms, with zero shader compilations or
links. These are controlled CPU render timings on this Mac, not timings from
the reported PC or a measurement of gameplay FPS. Independent browser runs
can have different streamed content; the decisive measurement is compilation
on the light transition while each run's own scene remains fixed.

Cold first-use graphics work still exists. The initial castle-view warmup
took 24.6 seconds before and 10.4 seconds after in these runs. This change
removes the extra shader configurations introduced by torch activation; it
does not claim to eliminate every possible first-use graphics stall.

## Fix and checks

All eight lights now remain visible from construction, with initial intensity
zero. `update` changes intensity to zero outside the original range, and uses
the original position, colour, attenuation, intensity and flicker within range.
This matches the stable light layout already used by railway and cave lights.
The existing world lighting shaders skip contributions from inactive lights.

The regression test traverses every contributing-light count from zero to
eight and back, checks constant visible-light count, and checks original
positions and flicker intensities. All 21 focused castle, cave, railway and
cloud tests passed. TypeScript and the production build passed; Vite emitted
the existing large-bundle advisory. The built production game also passed:
entry took 8.4 ms, leaving 8.5 ms and re-entry 9.0 ms, with zero shader
compilations or links and no runtime, shader or WebGL errors.

Evidence: `artifacts/castle-freeze/before.json`, `after.json`, and the original
torch source in `FriendsCastleTorches.before.txt`. The built-game check is
saved separately as `production.json`.

Run the fixed-layout regression against a Vite or preview server:

```sh
FRIENDS_TEST_ORIGIN=http://localhost:3000 FRIENDS_CASTLE_ASSERT_STABLE=true node tools/profile-friends-castle.mjs
```

Disable Vite HMR during profiling so unrelated workspace edits cannot reload
the arena mid-capture. The baseline source snapshot is evidence, not a module
loaded by the benchmark.

## Follow-up audit: limits of the fix

The torch light-count trigger is fixed; a blanket claim that the whole castle
approach or entire game is stall-free is not supported. A follow-up built-game
capture uses the actual `friends-vision-hdr` render target, rather than drawing
the scene directly to the canvas. The arrival view renders twice without any
new compilations. Moving the fixed camera to the castle view then compiles 54
shaders / 27 programs and blocks for 13,658.8 ms. After that first view,
switching torch contribution on takes 12.4 ms with zero compilations. See
`artifacts/castle-freeze/pipeline-audit.json`.

A subsequent material audit encounters the same 54 shader compilations / 27
programs but takes 700.1 ms, consistent with driver shader-cache effects.
New program associations include castle standards and masonry, railway
materials, and other first-use scene materials. See `material-audit.json`.
The camera jump is a deliberately broad first-view check, not a measurement
of a full walking route with terrain streaming and simulation running.

The original direct-to-canvas warmup changes the normal gameplay render
target and output colour space, so its warmup duration alone cannot establish
a separate gameplay stall. The HDR follow-up avoids that mismatch and
confirms additional first-view compilation work remains.

Code inspection found stable light slots during ordinary proximity updates
for caves, railway lamps, campfires, retreat lamps, local/shared flashlights,
night vision, volcano lighting and day/night transitions. Parent groups can
still be enabled/disabled when world features change; changing the graphics
shadow preference also changes the shader layout. These are distinct from
castle proximity and have not been certified stall-free by this audit.

The next rendering improvement would prepare dormant material programs in
the background using the final world lighting and actual render target,
before they are first seen. It must be tested with cold caches and delayed
resources, keep normal world drawing active, and avoid reinstating the
whole-scene readiness gate that previously caused a loading regression.
No material-preparation change was introduced in this audit.

The follow-up lighting regression run passed 25 tests across seven files.
