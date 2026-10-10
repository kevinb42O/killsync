# Underwater appearance

The October 2026 underwater upgrade builds on the surface water and the live flood-water query. It does not change flooding rules, swimming physics, water levels or saves.

## Appearance

- Reduced fog density and screen tint retain close terrain detail while progressively obscuring distant objects. Sea and freshwater use different colour/clarity settings; depth and daylight affect the fog.
- Existing standard-material passes receive distance-based red/green/blue absorption and animated world-space caustic light patterns on submerged terrain and props. Sunlight projection and water depth attenuate these patterns.
- The overhead water surface has darker reflected water around its transmitted sky window, moving light ridges, and greater visibility through that window.
- A fixed pool of 192 GPU-animated motes supplies sparse suspended particles. Points fade near the camera, at distance and above the surface, and use ordinary scene depth testing.
- Nine soft light planes approximate sunlight shafts. These are depth-tested and disabled at night or under terrain cover; they are not volumetric ray-marched lighting.
- A short screen-overlay pulse marks entry into the water, then settles into a thin edge treatment. It does not distort a captured scene image.

Cover is estimated with five cached vertical terrain probes up to just above the source surface, refreshed after camera-cell/terrain changes or a short interval. Covered water loses directional and ambient daylight while point and spot lamps remain active. The cover approximation is local to the camera, not a complete per-fragment sunlight visibility simulation for every overhang or construction piece.

## Ownership and lifecycle

`FriendsUnderwaterVisuals.ts` owns per-scene lighting uniforms, material bindings, fog/sky restoration, the overlay, motes and light planes. Material decoration is implemented in `FriendsUnderwaterLighting.ts`; it preserves existing terrain masks, cloud shading, cave lighting, shadows and shader callbacks.

Existing materials bind during construction. After the Frontier world is built, `prepare()` binds its materials before arrival shader preparation and creates hidden, fixed-size bed scenery for background shader warmup. Newly streamed materials are discovered on land and in water by `beginFrame()`, scanning at most 128 objects or one millisecond per frame. Entering water no longer triggers a full-scene material scan or mass shader invalidation. Placement terrain queries remain gated by swimming/diving. Material disposal releases the binding, and effect disposal restores shader hooks and disposes owned geometry/materials. `beginFrame()` restores outdoor fog/background and prior sky/cloud visibility before the daylight update.

The production renderer continues passing `FriendsFrontierVisuals.terrain` to `update()`. Water occupancy uses `friendsLiveWaterAt`, including connected excavation water. The real-world river review now passes its terrain instance too.

The renderer does not copy the scene or allocate new full-resolution render targets. In sunlit water the new geometry adds two draws: 192 points and 18 light-plane triangles. Covered/dark water adds only the points draw. The screen overlay was already present before this change.

## Review

Open `/tools/underwater-review.html` for Before/After comparisons of shallow water, the bottom, looking up, deeper water, roofed water, and the surface, with Day/Night controls. Its rocks, sand and submerged pillars are controlled review fixtures, not new world assets.

The original underwater effect is retained only in `tools/underwater-baseline.ts` for comparison. Surface and effect snapshots are under `artifacts/underwater-polish/source/`.

Run:

```sh
npm run lint
npm run build
npx vitest run src/game/rendering/FriendsUnderwaterVisuals.test.ts src/game/world/FriendsFloodWater.test.ts src/game/multiplayer/FriendsSwimming.test.ts
npx vitest run src/game/rendering/FriendsIslandWater.test.ts -t 'excludes|keeps|moves'
FRIENDS_TEST_ORIGIN=http://localhost:3014 node tools/test-underwater-polish.mjs
FRIENDS_TEST_ORIGIN=http://localhost:3014 node tools/test-underwater-integration.mjs
FRIENDS_TEST_ORIGIN=http://localhost:3014 node tools/test-water-entry.mjs
```

Unit tests cover restoration when surfacing, roof/night shaft suppression, bounded reusable geometry, shader-hook cleanup and independent scene state. Browser checks compile actual terrain/prop/water shaders and capture controlled and real island views; compare GPU timing; and repeat 120 surface/dive transitions to check GPU memory stability. The integration check verifies that a point lamp lights roofed water and that a flooded excavation enables the effect, sealing it disables the effect, and reopening restores it.

The water-entry regression prepares 24 distinct world shader variants, including production cloud lighting, cave lighting and terrain coverage, plus the hidden underwater effects using the production background warmup, then crosses into a river and the sea. It asserts that entry creates zero additional shader programs, changes no world material versions, and produces no shader or WebGL errors. After each dive it returns above water and checks that fog is restored and the visible land image matches the pre-dive image pixel for pixel. This controlled fixture checks shader reuse and restoration, not full-game FPS or a particular GPU's stall duration.

Underwater depth transmission is declared at the start of the fragment shader's `main`, before lighting uses it. Cloud and cave hooks expand the standard lighting include before the underwater hook runs, so declarations cannot depend on that include still being present. The shader cache key is versioned to prevent reuse of the old invalid composition.

In the final local controlled 1440×900 run, median GPU time changed from 6.28 to 6.62 ms for the bottom view, 7.61 to 7.47 ms for the overhead view (within timing variability), and 6.53 to 7.03 ms for the covered view. Bottom p95 changed from 8.46 to 10.05 ms. Each version had 64 valid GPU samples per view. These are fixture measurements, not a full-game FPS guarantee. Geometry and texture counts remained at 10 and 2 across the transition stress test.

Screenshots and detailed timings are saved in `artifacts/underwater-polish/checks.json`; lamp and live-flood checks are in `integration-checks.json`.

## Continuous depth attenuation

Daylight now attenuates through the full water column. Existing material passes
apply channel-dependent transmission to directional and ambient diffuse light,
while point and spot lights remain local illumination. Red decays fastest,
followed by green and blue. The disabled branch avoids the new exponential work
above water. The underside of the surface attenuates transmitted sky, sun and
reflected volume color by the actual camera-to-surface path, including longer
oblique paths; opacity increases with that path so above-water objects cannot
remain bright through the deep window. The surface also blends into the current
underwater fog color in output color space, hiding both the light and the finite
mesh outline. Path-dependent attenuation works at oblique angles; a smooth final
fade reaches the surrounding water color by a 1,500-unit (125 m) optical path.
Opacity is retained so fading does not reveal bright sky or objects above water.
The underside branch uses camera height, consistently across both ocean passes.

Fog and particle brightness continue decreasing exponentially instead of reaching
a fixed brightness at 900 world units. Lake clarity and sea clarity keep separate
attenuation rates. No extra draw calls, render targets or light passes are added.

`tools/test-underwater-depth.mjs` checks progressively darker upward views at
3.3, 25, 75, 150 and 266.7 metres. The fixed central pixel sample decreases from
153 to 102, 46, 17 and 5 on a 0–255 display scale. Screenshots and measurements
live in `artifacts/underwater-depth`. An additional whole-frame comparison checks
oblique views against the same scene with the surface hidden: the finite sheet
is indistinguishable at 75 m and deeper, and the real ocean's overlapping near
and far surfaces match the surrounding water at 150 m. Point-light visibility and dynamic flooded
cavity transitions still pass the existing browser integration check.
