# Connected excavation flooding

Implemented on 10 October 2026. The sea and fixed island lakes feed face-connected player excavations at their existing exact surface elevations. Isolated holes, diagonal contacts, above-head passages and solid lakebeds remain barriers. Closing the last inlet dries the disconnected region immediately. Construction pieces retain their existing collision behaviour and do not become water barriers.

## Implementation

`FriendsFloodWater.ts` owns a sparse, deterministic field per terrain instance through a WeakMap. Natural wet cells are terminal sources, rather than traversal nodes. Highest physically reachable heads win; equal heads use lexicographic body IDs. Natural river and cascade ownership remains unchanged, and these are not new excavation sources.

Terrain maintains a monotonic local water epoch and bounded change journal independently of its replicated revision. This invalidates derived water on digging, filling, grading and restoration, including a same-revision repair. Ordinary changes update cached node adjacency and source contacts only in their six-face neighbourhood. Ownership is then solved synchronously over the sparse domain, bounded by the existing 6,000-edit limit. This conservative ownership pass handles bridge removal and multiple sources without introducing speculative client water. Restoration/grade changes rebuild sparse topology. Queries coalesce terrain batches, including explosions, into one committed solve before the first consumer; unchanged queries do no graph work. Cell depth and exposed surfaces are cached.

Host swimming, local prediction and underwater camera effects use height-aware live occupancy. Fishing, stone throwing, birds and rowboats receive live exposed surfaces where their simulation already accepts a water field. Boats retain hull, floor and ceiling collision checks. Saves and network snapshots continue to carry terrain only; water reconstructs locally with the same solver.

`FriendsFloodWaterVisuals.ts` groups exact exposed surfaces and open lateral/bottom faces by chunk and source. It reuses the existing island water palette, ripple shader and day/night lighting. Flood heads are flat, with ocean shorebreak disabled inside excavations. A world-aligned half-float ownership mask suppresses the natural sheet at matching dynamic surface elevations. Geometry is replaced only for changed chunk/body stamps; replaced textures, geometry and materials are disposed. Natural bathymetry continues to render its original coast; dynamic depth and coverage handle the changed shoreline. The lazily allocated ownership mask uses 4.5 MB and persists until the world renderer is disposed.

## Verification

- Solver tests cover exact partial heights, edited depth, six-face connectivity, isolated/diagonal holes, above-head sills, solid barriers, seal/reopen, second inlets, natural-cave exclusion, multiple sources, stable ties, batch coalescing, zero steady-state solves, sea-bed excavation, real lake-bank excavation, save/late-join reconstruction and same-revision restoration.
- 300 deterministic edit operations compare incremental topology with a fresh full solver after each operation.
- Existing swimming and rowboat tests pass. Castle cargo and incline hauling pass in targeted runs with two workers and an adequate timeout.
- TypeScript and production build pass.
- Browser review checks daylight, nighttime, inside views, WebGL errors and ten seal/reopen cycles. Wet-cell counts return to the same value; geometry and texture counts remain stable. The reviewed trench has 54 wet cells, one flood draw call and 1,728 bytes of geometry attributes.
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
