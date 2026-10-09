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

Existing materials bind during construction. Newly streamed materials are discovered by an amortized scan while underwater. Material disposal releases the binding, and effect disposal restores shader hooks and disposes owned geometry/materials. `beginFrame()` restores outdoor fog/background and prior sky/cloud visibility before the daylight update.

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
```

Unit tests cover restoration when surfacing, roof/night shaft suppression, bounded reusable geometry, shader-hook cleanup and independent scene state. Browser checks compile actual terrain/prop/water shaders and capture controlled and real island views; compare GPU timing; and repeat 120 surface/dive transitions to check GPU memory stability. The integration check verifies that a point lamp lights roofed water and that a flooded excavation enables the effect, sealing it disables the effect, and reopening restores it.

In the final local controlled 1440×900 run, median GPU time changed from 6.28 to 6.62 ms for the bottom view, 7.61 to 7.47 ms for the overhead view (within timing variability), and 6.53 to 7.03 ms for the covered view. Bottom p95 changed from 8.46 to 10.05 ms. Each version had 64 valid GPU samples per view. These are fixture measurements, not a full-game FPS guarantee. Geometry and texture counts remained at 10 and 2 across the transition stress test.

Screenshots and detailed timings are saved in `artifacts/underwater-polish/checks.json`; lamp and live-flood checks are in `integration-checks.json`.
