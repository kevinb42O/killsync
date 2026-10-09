# Island water appearance

Lakes, the ocean and river ribbons share the water material in `src/game/rendering/FriendsIslandVisuals.ts`; river flow and foam are added by `FriendsRiverVisuals.ts`.

The October 2026 water polish adds:

- Depth and viewing-angle dependent transparency. Lakebeds show through shallow water; absorption hides them gradually in deep water and along longer viewing paths.
- Different freshwater and ocean colours, calmer lake foam, and stronger ocean surface ripples.
- Small animated surface normals that fade with distance to limit shimmer, plus shorter ocean swell wavelengths on the existing bounded wave grid.
- Angle-dependent sky reflections, approximate procedural cloud detail and sunlight highlights using the existing day/night uniforms.
- Complementary near/far ocean alpha so overlapping translucent meshes do not create a darker square around the camera.

These are sky approximations, not reflections of actual trees, players or buildings. Bottom visibility uses ordinary transparency, without screen-space refraction. The existing underwater window and rowboat hull cutout remain active.

No additional scene passes, render targets, texture assets, mesh subdivisions or per-frame geometry updates are introduced. More arithmetic is performed for each visible water pixel, so the GPU cost still depends on water coverage, resolution and hardware.

## Review and verification

Start Vite, then open `/tools/water-polish-review.html`. The controlled sand-and-rock shoreline offers lake, overhead and sea views with Before/After and Day/Night controls. The before shader snapshot is stored under `artifacts/water-polish/source/`.

Run:

```sh
npm run lint
npm run build
npx vitest run src/game/rendering/FriendsIslandWater.test.ts src/game/world/FriendsWaterConnectivity.test.ts
FRIENDS_TEST_ORIGIN=http://localhost:3014 node tools/test-water-polish.mjs
```

The browser check captures the controlled comparison and real island views, checks browser/WebGL errors, verifies unchanged geometry and draw counts, and compares overlapping ocean meshes against a single-surface reference. It also measures GPU render time using disjoint timer queries where supported. Results and screenshots are saved in `artifacts/water-polish/`.

In the final local 1440×900 controlled run, median GPU render time changed from 6.59 to 7.21 ms for the lake view and from 7.29 to 7.29 ms for the sea view. Sea p95 rose from 7.85 to 9.38 ms. These are fixture measurements with 64 valid GPU samples per version, not full-game FPS guarantees. The ocean overlap differed from the single-surface reference by at most one 8-bit colour value, consistent with blending rounding.

## Coastal shorebreak

Sea water now steepens toward shallow shores and breaks into irregular white crests. Each crest leaves a wider foam wash that travels toward the wet edge and dissolves between waves. Timing varies gradually along the coastline. Steep banks attenuate the effect; freshwater retains its previous appearance.

The ocean bathymetry texture packs depth, an approximate distance to shore, and seabed slope into four float channels. The coastal field is built once. Smooth sampling is limited to shallow ocean areas, and both the displaced near grid and distant surface use the same world-space phase. Displacement stays within the existing five-unit ocean wave bound. This is visual shorebreak, without curling barrels, particle spray, dry-beach flooding or fluid physics.

The shared 384×384 ocean texture grows from 0.56 MiB to 2.25 MiB (about 1.69 MiB extra); no extra textures, meshes, draw calls or scene passes are added. Both ocean meshes share the same texture.

Open `/tools/water-polish-review.html?view=shorebreak` and use **Previous coast** / **Shorebreak** to compare against the first water upgrade. Run `FRIENDS_TEST_ORIGIN=http://localhost:3014 node tools/test-shorebreak.mjs` for the coastal comparison, wash sequence captures, freshwater pixel regression, ocean-overlap comparison, GPU timing and real-world browser checks. Output is under `artifacts/shorebreak/`.

The final local 1440×900 comparison measured sea median GPU render time at 3.64 ms before and 4.38 ms after, about 0.74 ms additional cost. Sea p95 was 7.38 ms before and 6.84 ms after, showing timing variability. Lake median changed from 5.87 to 6.04 ms, while rendered lake pixels matched exactly. These fixture measurements are not full-game FPS guarantees.
