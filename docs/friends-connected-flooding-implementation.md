# Connected excavation flooding

Implemented on 10 October 2026. The sea and fixed island lakes feed face-connected player excavations at their existing exact surface elevations. Isolated holes, diagonal contacts, above-head passages and solid lakebeds remain barriers. Closing the last inlet dries the disconnected region immediately. Construction pieces retain their existing collision behaviour and do not become water barriers.

## Implementation

`FriendsFloodWater.ts` owns a sparse, deterministic field per terrain instance through a WeakMap. Natural wet cells are terminal sources, rather than traversal nodes. Highest physically reachable heads win; equal heads use lexicographic body IDs. Natural river and cascade ownership remains unchanged, and these are not new excavation sources.

Terrain maintains a monotonic local water epoch and bounded change journal independently of its replicated revision. This invalidates derived water on digging, filling, grading and restoration, including a same-revision repair. Ordinary changes update cached node adjacency and source contacts only in their six-face neighbourhood. Ownership is then solved synchronously over the sparse domain, bounded by the existing 6,000-edit limit. This conservative ownership pass handles bridge removal and multiple sources without introducing speculative client water. Restoration/grade changes rebuild sparse topology. Queries coalesce terrain batches, including explosions, into one committed solve before the first consumer; unchanged queries do no graph work. Cell depth and exposed surfaces are cached.

Host swimming, local prediction and underwater camera effects use height-aware live occupancy. Fishing, stone throwing, birds and rowboats receive live exposed surfaces where their simulation already accepts a water field. Boats retain hull, floor and ceiling collision checks. Saves and network snapshots continue to carry terrain only; water reconstructs locally with the same solver.

`FriendsFloodWaterVisuals.ts` extends existing flat sea/lake meshes into covered excavation tops through a shared fixed-head/depth overlay. Their original waves, palette, reflections, coastal foam, fog and day/night lighting continue through the new opening. Gameplay still uses the source's fixed level. Exact sparse top faces remain for cells beyond a natural mesh's footprint; open lateral/bottom boundaries also use sparse faces grouped by chunk/source. Uncovered cells suppress matching natural fragments to avoid overlap. Changed fallback geometry is replaced and disposed; natural coverage/depth is restored on refill. The lazily allocated two-channel half-float overlay uses 9 MB and persists until world-renderer disposal.

## Verification

- Solver tests cover exact partial heights, edited depth, six-face connectivity, isolated/diagonal holes, above-head sills, solid barriers, seal/reopen, second inlets, natural-cave exclusion, multiple sources, stable ties, batch coalescing, zero steady-state solves, sea-bed excavation, real lake-bank excavation, save/late-join reconstruction and same-revision restoration.
- 300 deterministic edit operations compare incremental topology with a fresh full solver after each operation.
- Existing swimming and rowboat tests pass. Castle cargo and incline hauling pass in targeted runs with two workers and an adequate timeout.
- TypeScript and production build pass.
- Browser review checks daylight, nighttime, inside views, WebGL errors and ten seal/reopen cycles. Wet-cell counts return to the same value; geometry and texture counts remain stable. The reviewed covered sea/lake trench has 54 wet cells and adds no separate flood-top draw calls or geometry buffers.
- `artifacts/connected-flooding/render-checks.json` records render counts and whole-review-scene GPU timing when the browser supports timer queries. It is scene timing, not a measurement of only flood water.
- `artifacts/connected-flooding/solver-benchmark.json` records single-cell, 1,000-cell trench, bridge removal, a 361-cell explosion batch, synthetic 6,000-cell connectivity and a real 6,000-edit snapshot. Measurements vary under concurrent test load. Use 16 ms as an investigation threshold for ordinary warm updates and 350 ms for a cold near-limit restoration; never truncate a region to meet either threshold. Cold reconstruction is synchronous and can cause a short load/repair pause.

The final broad run reports **1,702 passing tests and two failures** across 213 files: the existing Friends-menu capacity assertion, and the castle-cargo case exceeding its explicit 20-second timeout under concurrent load. The menu failure reproduces with the new simulation integrations disabled; castle cargo passes in the targeted run. An earlier retreat-approach failure also reproduced with flooding disabled but passed in the final broad run. The 51 focused solver/swimming/rowboat/expedition tests all pass. The full workspace suite is therefore not completely green.

## Review tools

Run Vite and open `/tools/flood-water-review.html` to inspect the real lake-bank trench. The browser exposes `floodReview` with `dig`, `seal`, `view`, `night`, field, terrain and renderer controls.

```
FRIENDS_TEST_ORIGIN=http://localhost:3015 node tools/test-flood-water.mjs
npx tsx tools/benchmark-flood-water.ts
npx vitest run src/game/world/FriendsFloodWater.test.ts src/game/multiplayer/FriendsSwimming.test.ts src/game/multiplayer/FriendsRowboat.test.ts
```

This version has no trapped-water retention, flowing trench currents, pumps, lake depletion, natural-cave propagation or watertight timber structures.

## Focused polish

A small follow-up removes the temporary 72-by-72 lake grid previously allocated for every flood chunk rebuild. Flood faces now supply their sparse geometry directly to the shared water factory; natural-water callers keep their original grid. This avoids approximately 227 KiB of temporary geometry buffers per rebuilt chunk.

Natural water meshes bound after the first flood now enable the existing overlap mask immediately. Lateral face clipping samples the bottom of the shared face, so a neighbouring lower partial water cell clips the submerged portion correctly. Exposed side faces are ordered consistently before cache comparison, keeping equivalent restored terrain from rebuilding buffers just because edits arrived in a different order.

The polish adds rendering lifecycle checks for late binding, equivalent restoration and single disposal of replaced resources. All 36 focused solver, flood-rendering, underwater, swimming and boat tests pass; TypeScript, production build and the browser seal/reopen review also pass.

## Sea surface regression fix

A reported sea-bank excavation exposed a rendering bug missed by the lake-focused review. The flood solver correctly marked the connected excavation wet, but setting the shared shader's ocean palette also enabled its camera-centred near/far opacity fade. Excavation sheets had no moving ocean-patch centre, so their opacity became zero away from the world origin. Their ownership mask still suppressed the natural sheet, leaving a visible hole.

The shared water shader now exposes `oceanPatchBlend`, enabled by default for natural ocean passes and disabled for excavation sheets. Ocean colours and lighting remain shared; the natural ocean's near/far transition retains its existing behaviour.

The review tool supports `?body=sea` and finds a real editable shoreline bank away from the world origin. The browser check now renders the excavation sheets alone into a transparent target and checks visible pixels and centre alpha, rather than treating wet cells and clean WebGL diagnostics as proof of visibility. This assertion fails before the fix and passes after it: the sea case has 54 wet cells, 4,096 visible pixels and centre alpha 114. Sea and lake daylight/night/inside views and ten seal/reopen cycles pass. All 56 focused tests across seven files, TypeScript and the production build pass.

```
FLOOD_REVIEW_BODY=sea FRIENDS_TEST_ORIGIN=http://localhost:3015 node tools/test-flood-water.mjs
```

Sea screenshots and render measurements are in `artifacts/connected-flooding/sea/`.

## Matching the existing water surface

The separate flat excavation tops were visually different even though they reused the water shader. Covered excavation tops now extend the existing sea/lake mesh itself. A two-channel half-float overlay supplies the fixed source head and current excavation depth to the natural vertex/fragment shader. This preserves its wave animation, reflection normals, sunlight, foam, fog and near/far ocean blending rather than approximating them on a second plane. Natural flat rectangular sheets can cover a whole edited cell; irregular river/cascade geometry is not treated as full rectangular coverage.

Separate top faces remain a fallback for excavations beyond a natural mesh's footprint; exposed lateral/bottom volume boundaries remain sparse geometry. Negative overlay depth reserves uncovered edge cells for that fallback, preventing duplicate translucent tops. Refilling restores the original bathymetry. The overlay is now 9 MB, allocated lazily; the reviewed sea and lake trenches add zero top-water draw calls or top geometry buffers.

The sea review now uses `FriendsIslandOcean`, including its real camera-following wave grid and coastal foam. The pixel visibility test renders natural and excavation meshes together and requires visible water at the centre of an actual flooded cell. Sea/lake day/night/inside reviews and ten seal/reopen cycles retain stable resources.

Latest surface-matching validation: all 41 focused tests across five files, TypeScript and the production build pass.
