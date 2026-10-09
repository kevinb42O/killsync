# Campfire lighting fix

The campfire's five standard materials now use the existing Friends inactive-light culling. The helper composes with existing shader hooks and reads the live shared lighting chunk at compilation, preserving the retreat interior light boundaries. Material cache keys distinguish the optimized shaders. Both Commons and Saltwind campfires use this code.

The patch keeps the wood grain, procedural gravel, log emissive material, geometry, fire animation, point light and shadow support. It does not lower resolution or change graphics settings.

## Production comparison

Two production builds of the current workspace were created sequentially. The control substitutes the saved pre-fix campfire source through a Vite plugin; the candidate compiles the actual fix. Both use the same remaining source and dependencies. This workspace contains other in-progress edits; these are not a claim about an already deployed revision.

Runs used fresh Chromium/Metal browsers on Apple M1, solo Friends mode, 1100 × 740 CSS pixels at DPR 2 (2200 × 1480 drawing buffer), render scale 1 and sun shadows enabled. Menu rendering was excluded. The noon camera was fixed beside the Commons campfire. Streaming/simulation continued; each run settled for 20 seconds after moving, then recorded two consecutive 10-second samples.

| Build | Sample | FPS | Median frame | Median render submission |
| --- | --- | ---: | ---: | ---: |
| Before | 1 | 6.00 | 166.7 ms | 157.8 ms |
| Before | 2 | 5.97 | 166.7 ms | 161.8 ms |
| After | 1 | 16.94 | 51.0 ms | 52.5 ms |
| After | 2 | 17.43 | 51.0 ms | 52.9 ms |

The first samples ended with identical reported 1,331 draws, 3,060,544 triangles, 637 geometries and 115 textures. Both included all eight campfire draws and the same 1,787 trees in 18 forest buckets. The second candidate sample contained a different scheduled shadow pass, so its triangle/draw totals differed. Rendering itself and the materials remain present.

This is roughly a 2.9× FPS improvement in this local high-resolution view, not a universal player FPS guarantee. A heavy scene still remains after the campfire cost is removed; the tested full-resolution view does not reach 60 FPS. Native render-call timings can include graphics-driver waits and are not an isolated GPU timer.

## Verification

Twenty-four tests passed across campfire material composition, clouds, local and shared flashlights, and night vision. Campfire tests check both constructors, authored wood/gravel patterns, cache keys, inactive-light branches, point/spot shadow code, directional lights and room bounds installed after material creation.

The production comparison completed without captured runtime/console errors or WebGL errors. The candidate's Commons day/night and Saltwind night captures were visually inspected; both fires retain their materials and warm lighting. At the night checks all 106/108 renderer programs were ready and WebGL error was zero. These screenshots are a visual smoke check, not a deterministic pixel-equivalence comparison.

The production control and candidate builds passed. The final ordinary workspace production build and TypeScript check also passed. The existing large JavaScript bundle advisory remains.

Evidence is in `production-comparison.json`, four `.png` captures, the original campfire source snapshot, and the two `.mjs` harnesses. To reproduce, run `node artifacts/campfire-lighting-fix/build-compare.mjs` from the project root to build/serve both variants, then run `node artifacts/campfire-lighting-fix/compare.mjs` in another terminal. The harnesses use temporary build folders and the available bundled Playwright runtime.

No deployment was performed by this task.
