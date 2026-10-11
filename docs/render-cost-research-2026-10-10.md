# Rendering cost research — 10 October 2026

**Status — 11 October 2026:** The adaptive point-light budget has been withdrawn from live gameplay after reproducing multi-second shader-compilation stalls when nearby lamps activate. The FPS gains below describe the withdrawn experiment, not the current production renderer. See the freeze investigation at the end of this report.

The largest demonstrated costs in the current Friends island are high pixel density, excessive inactive light slots in shader layouts, and forest foliage. The clearest structural inefficiency in CPU draw submission is fragmented terrain and prop rendering. Improving simulation microseconds cannot remove these graphics costs.

This audit examined the shared renderer and Friends rendering systems, existing GPU/CPU reports, the installed Three.js 0.185.1 source, original tree GLBs, and current engine/browser guidance. Fresh measurements cover the actual Friends arena at spawn on Apple M1 / Chromium ANGLE Metal. Survival/combat mode, other GPUs, caves, flight, construction stress scenes and five-player lighting were not newly benchmarked. Prior measurements elsewhere in the repository are supporting context, not interchangeable benchmark results.

## Evidence and measurement boundaries

The first fresh run freezes the actual arena at 9 AM with wind paused and camera yaw −2.3 / pitch −0.3, position (5965, 786, 5710), FOV 108°. The viewport is 1600×900. The existing HDR target is used with two MSAA samples. Gameplay presentation updates stop during measurement; the world, materials and animation uniforms remain fixed. The menu is omitted. Each sequential diagnostic variant warms 24 renders and records 40 asynchronous GPU queries, rejecting disjoint results. The first harness ends its GPU query before switching render targets, so MSAA resolve and the final composite are excluded. A second harness includes target switching. A follow-up lighting harness explicitly invalidates materials when shadow support changes and measures lighting layouts and the composite independently. Neither measures end-to-end gameplay FPS.

An instrumented actual draw records the renderer statistics delta for each `renderBufferDirect` invocation, distinguishing the world camera from shadow cameras. It accounts for material groups and instancing rather than equating scene objects with draw calls.

Diagnostic removals change the image. Their timing differences describe the opportunity in that subsystem; they are not achieved optimisation savings. Effects interact, so the differences must not be added together. Forty ordered samples and a repeated baseline support large differences in this one scene; they do not establish tiny differences, thermal stability, hardware generality or shipping FPS.

| First run, world pass only | GPU mean | Draw calls | Submitted triangles |
| --- | ---: | ---: | ---: |
| Current scene, DPR 1 | 34.14 ms | 1,552 | 5,131,778 |
| Same packed geometry, DPR 2 | 69.32 ms | 1,552 | 5,131,778 |
| Leaves hidden | 23.75 ms | 1,546 | 2,212,502 |
| Entire forest hidden | 21.77 ms | 1,537 | 1,501,460 |
| Island monuments/water/effects group hidden | 28.46 ms | 1,464 | 4,960,000 |
| Visible clouds hidden | 34.11 ms | 1,551 | 5,130,986 |
| MSAA disabled, existing foliage coverage setting retained | 29.42 ms | 1,552 | 5,131,778 |
| Force a sun shadow refresh on every sample | 34.45 ms | 1,802 | 5,229,305 |
| Baseline repeated | 34.17 ms | 1,552 | 5,131,778 |

The no-MSAA experiment isolates target sampling. It does not reproduce the complete graphics-setting change: production also disables foliage alpha-to-coverage when samples reach zero. Its image and timing therefore need a separate production-settings test.

The source's earlier end-to-end profile observed approximately 21.45 FPS at DPR 1 and 10.92 FPS at DPR 2. Those figures come from `artifacts/friends-cpu-optimisation/optimised-render-warm.json`, not from these frozen renders. The two kinds of measurement consistently identify the graphics bottleneck but must not be treated as the same timing experiment.

## Where draw calls and triangles actually come from

| Top-level owner, world camera | Draw calls | Triangles |
| --- | ---: | ---: |
| Streamed world, including terrain/island/cave props | 830 | 1,203,306 |
| Railway | 300 | 222,224 |
| Vehicles | 253 | 41,180 |
| Hauling objects | 57 | 700 |
| Retreats | 32 | 28,292 |
| Ambient inhabitants | 28 | 1,096 |
| Base environment | 27 | 408 |
| Forest | 15 | 3,630,318 |
| Main campfire | 7 | 1,950 |
| Sky | 1 | 2,208 |
| Other world draws | 2 | 96 |

These world-camera totals are 1,552 calls and 5,131,778 triangles. The attribution capture also contains seven non-world-camera draws; they are excluded here. Forest geometry accounts for approximately 71% of submitted world triangles and under 1% of calls. This is why further forest instancing alone will not fix the dominant forest cost.

Within the streamed world, near voxel chunk meshes account for 446 calls but only 36,662 triangles, the persistent horizon accounts for 142 calls and 834,279 triangles, and block surface shells account for 31 calls and 109,506 triangles. Cave treasure children add 72 calls. Railway portal arches account for 96 calls. Small props and vehicle parts can be costly despite modest geometry.

## 1. Pixel density: the largest immediate quality/performance control

**Current policy:** `Renderer3D.ts:479` caps desktop DPR at 2 and mobile DPR at 1.15. `LocalGamePreferences.ts:6` defaults to render scale 1. The bridge multiplies that preference by native DPR at `MultiplayerRendererBridge.ts:350`. Consequently, on a DPR-2 display, “100%” renders four times the CSS pixel count.

At a 1600×900 CSS viewport:

| Effective DPR | Drawing buffer | Pixels | Relative to DPR 1 |
| --- | --- | ---: | ---: |
| 1 | 1600×900 | 1.44 million | 1× |
| 1.25 | 2000×1125 | 2.25 million | 1.56× |
| 1.5 | 2400×1350 | 3.24 million | 2.25× |
| 2 | 3200×1800 | 5.76 million | 4× |

On DPR 2, the existing 85%, 70% and 50% options correspond to effective DPR 1.7, 1.4 and 1.0, or 72.25%, 49% and 25% of full-resolution pixels respectively. Desktop policy is based on display density, not a GPU budget. A retina laptop can receive four times the shading and attachment work despite having an integrated GPU.

**Better approach:** use a drawing-buffer pixel budget and an adaptive world scale with hysteresis and a user quality override. Keep React HUD text at display resolution. Consider a separate crisp viewmodel pass only after measuring the extra target/composite cost. Prefer a modest stable scale over rapidly oscillating resolution. Reduce scale only after sustained overload and restore it more slowly. Use asynchronous timing where available, with frame-time fallback and appropriate treatment of hidden tabs and CPU stalls.

**Tradeoff:** this changes image sampling and can soften distant leaves. It is not an exact-image optimisation. Fresh measurements establish that DPR 2 costs roughly twice the GPU time in this scene, not that DPR 1 universally gives exactly twice the FPS. Official guidance recommends controlling expensive high-DPI rendering and considering a smaller back buffer: [Three.js responsive design](https://threejs.org/manual/pages/responsive.html), [MDN WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices).

## 2. Foliage: full detail is retained at every distance

**Current policy:** `FriendsForestLOD.ts:117` preserves foliage geometry, UVs and alpha masks. Only wood receives simplified index buffers. The level choice near line 236 is explicitly conditional on `part.bark`. Leaves remain double-sided alpha-tested, depth-writing geometry, with alpha-to-coverage under MSAA. These are sensible rendering settings, but they do not eliminate the cost of thousands of overlapping detailed canopies.

The original GLB primitives contain:

| Species | Original wood triangles | Foliage triangles |
| --- | ---: | ---: |
| Pine | 1,496 | 632 |
| Birch | 2,688 | 1,910 |
| Maple | 2,984 | 864 |

In the measured view, 3,474 submitted trees use 15 draws and 3.63 million triangles. Leaves alone account for 2.92 million submitted triangles. Hiding leaves removes about 10.4 ms of GPU work; hiding the entire forest removes about 12.4 ms. This strongly prioritises foliage geometry and shading/coverage work over further draw-call reduction for trees. The experiment does not distinguish vertex cost from alpha coverage, overdraw, lighting and texture cost within foliage.

**Better approach:** author actual canopy LODs, choose them by projected screen size and silhouette error, keep full detail close to the camera, and reduce internal overlapping leaf layers for midrange and distant trees. Preserve normal/UV attributes, alpha coverage through mip levels, canopy colour and silhouette. Use hysteresis at transitions. Far 3D clusters may be enough; multiview/octahedral impostors are a later option if their lighting, flight views, parallax and transitions are acceptable. Avoid applying ordinary opaque-mesh decimation blindly to disconnected alpha cards.

Attribute-aware simplification is supported by [meshoptimizer's primary documentation](https://github.com/zeux/meshoptimizer/blob/master/js/README.md), but it does not by itself guarantee an alpha-tested canopy's perceived density or silhouette. Validate real daytime, dusk/night, flashlight, flight and harvest/falling-tree views.

**Tradeoff:** foliage LOD and impostors alter the image. Preserve nearby assets and quantify distant differences. The earlier exact-image optimisation project expressly excluded such changes, which explains why it could not materially reduce these millions of triangles.

## 3. Draw-call fragmentation: terrain, railway and vehicles

**Terrain:** `FriendsTerrainMesh.ts` greedily merges voxel faces and emits up to 14 material buckets; `FriendsFrontierVisuals.ts:185` attaches them as geometry groups to one material-array mesh per chunk. One chunk object can therefore produce several actual draws. The measured 446 draws for 36,662 triangles average only about 82 triangles per draw. Greedy meshing is already helping geometry; material/chunk fragmentation remains.

Evaluate regional per-material batches with bounded rebuilding when terrain changes, or a unified terrain shader using a material selector and texture atlas/array. Separate surface and underground lighting semantics where required. Maintain chunk-level edit ownership, coverage masks and local culling. A single material per chunk can reduce group overhead; regional batching can reduce calls further. Texture-array compatibility, sampler limits, UV repetition, normal/roughness data and cave glow all matter.

**Railway:** structural parts are already instanced by 2048-unit sector, material and primitive at `FriendsScenicRailwayVisuals.ts:239`. This is a good foundation. Portal arches, some canopies/signs and different primitive/material buckets still create many draws. Use shared geometry instances for repeated arches, reduce material variants where physically equivalent, and add a distant representation for sleepers/fasteners/rail profiles. Keep the sector culling rather than creating one island-wide mesh. The 96 portal-arch draws are a concrete repeat-geometry target.

**Vehicles/hauling:** 253 vehicle draws for about 41,000 triangles and 57 hauling draws for 700 triangles indicate highly fragmented models. Bake immutable body panels/fittings per material into each vehicle's local frame; keep doors, wheels, rotors, bogies, hooks and ropes articulated. Some scenic-train fittings/running gear are already batched, so extend that pattern to the remaining parts. Apply distance LOD to detail invisible from the measured camera.

`FriendsStaticBatch.ts` exists but has no production caller. Do not simply invoke it over the entire world. Its material key does not capture every shader hook/cache key, texture input, attribute semantic or dynamic ownership requirement. It also clears geometry groups. Strengthen equivalence and disposal rules before reusing it, or batch explicitly inside the owner that knows which parts are immutable.

Instancing is appropriate for repeated geometry/materials; spatial merging is appropriate for immutable compatible geometry; `BatchedMesh` can combine distinct geometries with per-object culling, but must be tested on installed Three.js and browsers rather than assumed to be faster. See [Three.js object optimisation](https://threejs.org/manual/pages/optimize-lots-of-objects.html), [InstancedMesh](https://threejs.org/docs/pages/InstancedMesh.html), and [BatchedMesh](https://threejs.org/docs/pages/BatchedMesh.html).

**Tradeoff:** compatible opaque batching can often preserve appearance, but render ordering, shadow eligibility, texture/shader state, moving attachments and ownership/disposal require real regression checks. World-wide merging can increase the GPU work by weakening culling.

## 4. Horizon and terrain overlap

`FriendsBlockHorizon.ts` maintains full-map horizon tiles with roughly 834,000 submitted triangles in the measured view. Near voxel geometry, surface shells and horizon geometry overlap spatially. `FriendsTerrainCoverage.ts:25` selects the appropriate layer using masks and fragment discard.

Those masks are necessary for continuity, but discarded triangles have already been submitted and transformed. Fragment discard is not equivalent to skipping a draw or generating a mesh without those covered areas.

**Better approach:** reject fully replaced horizon regions before drawing; keep complementary masks on partially replaced regions; use coarser distant horizon geometry and preserve coastline/mountain silhouettes; consider camera-centred rings or hierarchical tiles where they reduce measured work. Maintain the guarantee that digging and cave entrances never open a gap between representations.

The second diagnostic includes near terrain and horizon independently:

| Diagnostic, resolve included | GPU mean | Calls | Interpretation |
| --- | ---: | ---: | --- |
| Current world | 34.35 ms | 1,552 | Reference |
| Near voxel chunks hidden | 41.88 ms | 1,106 | Worse despite 446 fewer calls; occlusion matters |
| Horizon hidden | 29.99 ms | 1,410 | Roughly 4.4 ms opportunity, with distant terrain removed |
| Railway hidden | 28.74 ms | 1,252 | Roughly 5.6 ms opportunity, with railway removed |
| Vehicles hidden | 33.60 ms | 1,299 | Strong CPU submission reduction; smaller GPU difference |
| Water hidden | 33.87 ms | 1,518 | Small difference in this view; not a proven primary target |

These are diagnostic removals, not implemented optimisations. Vehicle CPU submission falls from 9.53 ms to 8.05 ms; railway CPU submission falls to 8.08 ms. Improve batch granularity while retaining each subsystem's visible geometry. Removing near geometry can expose expensive background fragments and cave contents. A visible occluder may save more work than its geometry costs. Optimise its material groups and representation while retaining that occlusion.

## 5. Shadows: distinguish map generation from map sampling

The sun uses a 2048² PCF map and a nominal 10 Hz refresh schedule, with exact reuse when light/caster inputs match. The first fresh run forced a refresh every sample and added 250 draws and about 97,500 triangles. Mean GPU time increased only about 0.3 ms in this view, while CPU submission increased by about 1 ms. This does not establish shadow generation as the largest current spawn bottleneck.

Nearby offscreen trees are retained because they may cast shadows, then placed in `frustumCulled=false` forest batches that also draw in the main view. The second harness counts only eight offscreen retained trees and 24,654 offscreen submitted triangles in this view—less than 0.5% of total world triangles. This is a real structural issue but a low priority in the measured spawn view. Separate main-camera and light-camera instance selections where it has a demonstrated benefit, while retaining offscreen casters in shadow renders. This costs extra bookkeeping and may be too small to prioritise at spawn.

PCF sampling in visible materials remains even when the shadow map is reused. The accepted shadow diagnostic disables shadow support and reduces world GPU time from about 34–36 ms to about 29 ms, with unchanged world draw/triangle counts. This includes the effect of removing shadow-related shader support, not solely texture fetch latency. Such a change removes real lighting and does not represent an acceptable default fix by itself.

Night vision and the local flashlight request camera-attached shadow updates while active. Cave point-light shadows involve six cube faces. Remote flashlights already share an atlas, schedule at most one remote refresh per frame and use reduced mobile tiles. Stress-test night vision/local beam/four remote beams before choosing shadow resolution, update cadence or separate simplified caster LODs. Do not remove beam occlusion or apply a slow cadence that makes moving hands/objects visibly lag.

Three.js already uses depth/distance materials for shadow generation. Adding “PBR-free shadow materials” is not a new general optimisation here. The fundamental cost and point-light six-face multiplier are documented in [Three.js shadows](https://threejs.org/manual/pages/shadows.html).

## 6. HDR/MSAA and light shaders

`FriendsNightVision.ts:204` creates a half-float HDR target, normally with two MSAA samples, and keeps that world/composite path active even with goggles off. The off branch skips exposure/grain/neighbour samples, but still renders and tone-maps the image in the final copy. This stabilises shaders when toggling goggles and fuses flashlight glare into the existing pass. It has a legitimate purpose.

The corrected lighting run measures 35.48 ms with the composite, with initial/repeated world-only controls of 35.54 / 34.08 ms. That drift prevents a precise composite cost estimate; it does not reveal a large composite bottleneck. Measure the final composite and MSAA in repeated pairs before replacing this architecture. A direct-to-canvas off path can require shader variants/output-state changes and may shift costs into compile hitches. MSAA off changes foliage edges. Keep quality options, and consider one well-budgeted final AA strategy instead of assuming every target needs maximum sampling. The canvas context's antialiasing and the HDR target's MSAA serve different targets; they are not simply two full-world renders.

The measured scene contains 27 point lights, seven spot lights and four directional lights, many at zero intensity. Stable light slots avoid shader recompilation, but zero intensity does not automatically imply zero shader arithmetic. `FriendsDirectLighting.ts` supplies uniform gates; cloud-shaded terrain/forest, cave materials, retreat materials and campfire materials compose these gates. Plain materials elsewhere do not universally use them. Fresh diagnostics remove the inactive lights and reduce world GPU time to 18.76 ms in the subsystem run and 18.83 ms in an independent lighting run, with **identical 1,552 calls and 5,131,778 triangles**. This is a major shader-layout opportunity. The scene inventory contains 21 zero-intensity point lights, six zero-intensity spotlights and one zero-intensity directional light. The corrected compiled-source audit confirms world layouts with 27 point lights, six spotlights, one point-shadow slot and two spot-shadow slots. The scene inventory includes a seventh spotlight under a hidden owner; it does not enter this world layout. Other compiled programs omit light arrays or use zero-sized lighting layouts.

Importantly, applying the existing uniform-gate helper to every standard material does **not** reproduce the large gain: the prototype measures 34.40 ms between a 35.54 ms initial baseline and 34.08 ms repeated baseline. That change is within the baseline drift and demonstrates no useful general improvement in this run. The large saving depends on reducing the shader light layout, not merely inserting more copies of the existing fragment branch. Vertex shadow coordinates, live shader resources, loop/unroll structure and uncovered work may contribute; the diagnostics do not identify one hardware cause precisely.

The dedicated isolation run (HMR disabled) measures:

| Light-layout diagnostic | GPU mean | Draw calls | Triangles |
| --- | ---: | ---: | ---: |
| Current layout | 34.34 ms | 1,552 | 5,131,778 |
| Exclude inactive point lights | 25.56 ms | 1,552 | 5,131,778 |
| Exclude inactive spotlights | 30.43 ms | 1,552 | 5,131,778 |
| Exclude only dormant native-shadow spotlights | 29.78 ms | 1,552 | 5,131,778 |
| Exclude all inactive lights | 19.39 ms | 1,552 | 5,131,778 |
| Current layout repeated | 36.27 ms | 1,552 | 5,131,778 |

The large point-slot and combined differences exceed the baseline drift; smaller differences between spotlight variants do not support precise relative rankings. The effects are not additive. The dormant shadow spots are the off night-vision IR emitter and held flashlight, both configured with 1024² maps. The diagnostic removes their shader slots; it does not merely skip map updates, which were already cached while off.

**Better approach:** reduce global light capacity to the actually relevant lights, allocate stable bounded pools for nearby lamps, and prepare a small explicit family of day/beam/goggle lighting layouts. Avoid attaching every area's dormant fixture to every world material. Preserve camera-beam and remote-beam occlusion. Prewarm the bounded variants before activation and measure transitions, rather than blindly toggling every light's visibility every frame.

`FriendsSharedFlashlightAtlas.ts` currently uses `NUM_SPOT_LIGHTS >= 4` to include its shared atlas GLSL. Reducing visible spotlight counts without replacing that count-based feature guard can accidentally disable remote-beam shadows when fewer than four slots remain. `FriendsShaderWarmup.ts` also keys its work by light/shadow layout. Both systems need to participate in a reduced-slot implementation.

## 7. Expensive-looking systems that are not demonstrated priorities

- Clouds use 6/8/12 view-ray steps, prebaked 3D density, frustum packing and a separate cached shadow atlas. Hiding visible cloud volumes changes this spawn measurement negligibly. A sky-facing flight view and atlas-update cost remain unmeasured; do not generalise this to all views.
- Water has complex procedural shaders and a moving 128×128 ocean patch. It deserves shoreline/underwater measurements, but the installed `ShaderMaterial` constructor sets `forceSinglePass=true`. The common suggestion to fix double-sided transparent water's two passes is already satisfied here. General `Material` defaults differ, as described in [Three.js Material docs](https://threejs.org/docs/pages/Material.html). We checked the installed implementation before treating this as a finding.
- The forest already uses few instanced draws. More batching without reducing foliage work is unlikely to produce a large improvement.
- Existing CPU movement and matrix-upload caches are valuable but cannot eliminate the measured GPU costs.
- The large JavaScript bundle warning primarily concerns transfer/startup. Bundle splitting does not directly remove steady-state triangles, fragment work or world draws.
- A worker can move meshing/simulation work off the main thread; it cannot make the GPU shade fewer pixels. WebGPU or an engine migration should follow evidence that these specific costs cannot be addressed within the present renderer.

## Implementation order and acceptance

1. Prototype a bounded light-slot layout and prewarm its variants; preserve the shared atlas feature independently of spotlight count. This has the strongest fresh appearance-preserving opportunity, but requires transition and beam-occlusion validation.
2. Make effective resolution and pixel count visible in the graphics UI; add a sensible integrated-GPU world pixel budget/adaptive scale behind a preference. Validate readability and foliage quality.
3. Batch terrain material groups regionally or unify their shader inputs; batch remaining vehicle bodies, repeat arches and tiny immutable props. Compare screenshots and end-to-end frame time, not just call count.
4. Prototype mid/far foliage LOD while retaining full nearby assets. Tune screen-space thresholds and transitions in ground and flight views.
5. Reduce horizon submissions and distant railway detail while retaining terrain occlusion and cave/coverage correctness.
6. Tune shadows and MSAA for night/multiplayer scenes using generation and sampling measurements separately.

For each candidate, use repeated alternating A/B runs with identical world/camera histories, warm shaders, asynchronous disjoint-safe GPU timing, whole-frame CPU/p95 frame intervals, and screenshots. Include spawn, dense woodland, station/train, shore, cave, night vision, five-player flashlights and dense player construction. Test DPR 1/2 and mobile profiles. Record draw counts, submitted triangles, effective buffer dimensions, target samples and active shadow passes. Preserve a baseline and reject changes with visual/gameplay regressions.

An appearance-preserving pass should begin with the light-slot prototype and compatible batching. More uniform branches alone did not establish the desired lighting gain. Pixel density and canopy/horizon LOD provide broader savings but need explicit visual-quality acceptance. Even with the forest completely hidden, the first run remains at roughly 22 ms GPU time; foliage work alone is insufficient to demonstrate a 60 FPS result in this heavy view. No combined FPS multiplier is promised by this research.

## Reproduction and artifacts

Use an isolated server with HMR disabled, since edits in another active chat can otherwise reload and interrupt a benchmark:

```sh
DISABLE_HMR=true npm run dev -- --port=3002
```

In a second terminal, run sequentially:

```sh
FRIENDS_TEST_ORIGIN=http://localhost:3002 node tools/research-render-attribution.mjs
FRIENDS_TEST_ORIGIN=http://localhost:3002 node tools/research-render-lighting.mjs
FRIENDS_TEST_ORIGIN=http://localhost:3002 node tools/research-render-light-slots.mjs
```

The research scripts dispose the point-light budget in their isolated browser to reproduce the original lighting layout. The implementation benchmark keeps it installed and toggles it for A/B comparisons. The scripts use project Playwright when installed, with the existing Codex runtime fallback. They create isolated headless browser sessions and do not alter production renderer code or saved user preferences in the ordinary browser profile.

- `artifacts/render-cost-research/profile.json`: first run, raw draws, lighting inventory and timing summaries.
- `artifacts/render-cost-research/attribution.json`: subsystem diagnostics and offscreen-tree counts. Its final composite/repeated baseline phases are excluded because shadow-support restoration required explicit material invalidation; the lighting harness corrects this.
- `artifacts/render-cost-research/lighting.json`: corrected shadow-layout restoration, broad uniform-gate prototype, inactive-slot removal and composite diagnostics. Initial/repeated baseline drift limits small timing claims.
- `artifacts/render-cost-research/light-slots.json`: isolated point/spot/dormant-shadow-slot diagnostic run. Its initial shader-layout parser looked for macros already expanded by Three.js and returned null; the timing data are unaffected. A corrected parser is recorded separately in `light-layout.json`.
- `artifacts/render-cost-research/light-layout.json`: compiled lighting-array sizes, extracted after Three.js expands light-count macros.
- `artifacts/render-cost-research/manifest.json`: source hashes, baseline commit and installed engine version.
- `artifacts/render-cost-research/summary.json`: grouped world-camera counts and original asset triangle counts.
- `artifacts/render-cost-research/rejected-attribution.json`: rejected experiment retained for traceability. It accidentally assigned the generic Material single-pass default to water ShaderMaterials; it is excluded from conclusions.

The research above did not change production rendering behaviour. The subsequent implementation is documented below. All research harnesses pass JavaScript syntax checks. Browser errors are recorded with each accepted report. A slot-isolation attempt was interrupted by a live development reload and produced no accepted report; it was rerun on a dedicated server with HMR disabled. Full gameplay tests/builds are not needed for these isolated research scripts and Markdown findings; implementation candidates will require their appropriate checks.


## Implemented: compact point-light shader layouts

The follow-up instruction was to implement the change that would make the biggest practical difference. `src/game/rendering/FriendsPointLightBudget.ts` now removes zero-intensity non-shadow point lights from the world render/compile layout and supplies only enough zero-intensity padding to keep a stable eight-slot bucket. The ordinary Friends spawn layout drops from **27 point-light slots to eight**. This is structural shader-work reduction; a new uniform branch alone did not demonstrate a comparable gain in the earlier diagnostics.

All contributing lights are retained, including arbitrarily small nonzero intensities. Shadow-casting points retain their sampler slots even while dormant. Spotlights, beam cookies, the shared remote-light atlas, infrared shadows, geometry, draw batching, DPR and MSAA settings retain their existing behaviour. Authored light visibility is restored after each synchronous operation, including on exceptions. Hidden ancestors and camera layers are respected. The controller wraps world rendering and target-scene compilation, and existing shader-warmup discovery uses the same layout. Renderer disposal removes its padding and restores owned wrappers; crossing into another world disables it.

More active lights grow the bucket in eight-slot steps, capped at the authored light count. The budget shrinks after five seconds at a lower bucket, so visiting a crowded area does not permanently erase the saving. Returning to an already compiled bucket reuses Three's cached programs. First growth into a previously unused bucket can still require shader compilation; this implementation limits the number of layouts rather than promising that every future layout is precompiled.

Final validation used alternating disabled/enabled comparisons on the actual island, at 1600×900 CSS pixels, Apple M1, Chromium ANGLE Metal, with the existing HDR target and MSAA. Each phase discarded 20 warm frames and retained 40 asynchronous, disjoint-checked GPU timings. The table averages two independent phases per condition.

| Rendering scope | Before | After | GPU-time reduction |
|---|---:|---:|---:|
| World, DPR 1 | 35.43 ms | 26.91 ms | 24.0% |
| World, DPR 2 | 68.55 ms | 50.23 ms | 26.7% |
| Full rendering pass, DPR 1 | 38.33 ms | 31.07 ms | 18.9% |

The isolated world comparisons retain identical draw and triangle counts within each DPR series: **1,552 draws / 5,131,778 triangles at DPR 1**, and **1,545 draws / 5,131,504 triangles at DPR 2**. The two series bracket live bridge presentation updates, so their geometry differs slightly from one another; each A/B series is fixed. The full rendering pass includes bridge presentation, periodically refreshed sun shadows, the world, viewmodel and HDR composite; its draw counts vary slightly as normal presentation and cached-shadow updates run. It excludes host simulation CPU work. These are GPU-time reductions on this machine and view, not measured gameplay-FPS gains or promises for every device.

Synchronous RGBA readback after HDR composition was **pixel-identical** in all four final comparisons: normal daylight, flashlight plus infrared illumination, every point light active, and lights switched off after budget growth. Each compared 5,760,000 channels, with zero differing channels. The budget returned to eight slots after the cooldown. No browser exceptions or WebGL readback errors occurred.

The first prototype retained a permanent high-water budget and padded a fully active 27-light scene to 32 slots. Its stress comparison showed a maximum two-level 8-bit difference (RMS 0.0403). That prototype was rejected: the final implementation caps at the authored count and shrinks after settling. Its raw report remains in `artifacts/render-cost-research/point-light-budget-prototype.json` for traceability.

Reproduce the accepted implementation comparison:

```sh
FRIENDS_TEST_ORIGIN=http://localhost:3002 node tools/benchmark-friends-light-budget.mjs
```

Accepted raw timing, draw, pixel-equivalence and slot data: `artifacts/render-cost-research/point-light-budget.json`. Unit coverage in `src/game/rendering/FriendsPointLightBudget.test.ts` checks light preservation, bucket growth/shrink, hidden owners/layers, render/compile agreement, exceptions and disposal. Final checks passed: `npm run lint`, `npm run build`, `git diff --check`, and `npm test -- --maxWorkers=2`. GPU measurements ran separately from the final test/build processes.


## Follow-up audit and live gameplay FPS

Before pushing all pending work to main, the rendering controller and the separate construction/movement caches, grove ordering, and swimming presentation changes were reviewed together. Two additional controller tests cover repeated crossings of an eight-slot boundary (the shrink delay must restart) and wrappers installed after the controller (disposal must preserve them and make retained controller calls harmless).

Live FPS was measured using `tools/profile-friends-cpu.mjs`, with normal host simulation, visual updates, rendering, viewmodel and HDR composition running continuously. All other pending changes remained enabled in both conditions; only `FriendsPointLightBudget.enabled` was toggled. Thus this measures the lighting change's incremental benefit and does not attribute the CPU or swimming changes to it. The CPU report's separate before/after tests describe those changes.

The actual Friends arena ran on Apple M1 / Chromium ANGLE Metal, 1600×900 CSS pixels, paused 9 AM clock/wind, fixed camera yaw −2.3 / pitch −0.3. After initial settling, each condition settled for ten seconds and recorded twelve seconds of requestAnimationFrame intervals plus matching CPU/GPU instrumentation. Two runs per condition alternated in reverse order: baseline, budget, budget, baseline, separately for DPR 1 and DPR 2. No test/build/other benchmark processes ran during measurement windows. Both orders showed a gain, and no browser runtime exceptions occurred.

| Drawing configuration | Before FPS | After FPS | Additional FPS | FPS increase |
|---|---:|---:|---:|---:|
| Normal density (DPR 1) | 20.67 | 25.98 | +5.31 | +25.7% |
| Retina density (DPR 2) | 10.24 | 13.43 | +3.18 | +31.1% |

These values average the two live runs per condition. Expect roughly **20–30% higher FPS in similarly GPU-bound Friends views**; the measured Retina case was about 31%. Absolute gains depend on the starting frame rate and scene. Areas with many contributing point lights retain larger budgets and can benefit less. A CPU-bound or refresh-rate-capped session can show a smaller average-FPS gain. CPU movement/cache improvements can reduce guest prediction/reconciliation stalls in populated worlds; their operation-level percentage savings should not be added to this FPS percentage.

The earlier table of 24–27% lower isolated-world GPU time and 19% lower full-rendering GPU time used frozen/query-driven comparisons; this follow-up measures continuously running gameplay intervals. They are different measures and sampled render workloads, not interchangeable percentages. The normal and Retina drawing-buffer resolutions, MSAA, geometry, shadows and spotlight behaviour were unchanged between live conditions.

Raw live runs and timing distributions: `artifacts/render-cost-research/gameplay-fps.json`. Reproduce with an isolated dev server (HMR disabled):

```sh
FRIENDS_TEST_ORIGIN=http://localhost:3002 FRIENDS_PROFILE_PHASES=baseline-island,budget-island,budget-island-repeat,baseline-island-repeat,baseline-high-dpi,budget-high-dpi,budget-high-dpi-repeat,baseline-high-dpi-repeat node tools/profile-friends-cpu.mjs artifacts/render-cost-research/gameplay-fps.json
```


Final combined push checks: **232 test files / 1,858 tests passed**, including eight point-light budget tests. `npm run lint`, `npm run build`, staged whitespace checks, and the live swimming browser review all passed. The review confirmed that snapshot deltas create replacement arrays/objects, as required by the guest tree cache, and that construction pose keys include the scalar inputs used by vehicle/crane transforms. The empty research placeholder was removed and historical research probes now dispose the budget in their isolated browser before probing the original layout. The compiled-light audit renders that layout before reading shader sources.


## Freeze investigation — stopped train at spawn, 11 October 2026

A player reported freezing while approaching the stopped train near spawn. Inspection found that the adaptive point-light budget invalidated the stable layout intentionally maintained by the six railway lamps and eight castle torches. Increasing the active point count beyond a bucket boundary changes Three.js's shader program key. Background warmup prepared the current bucket only, so the first draw using a larger bucket synchronously compiled the world shader variants. Completion of the current warmup did not prevent this.

Controlled reproduction held the real world camera and HDR target fixed, stopped bridge updates, and activated the six existing railway lamp slots. The approach frame took **1,302.9 ms**, compiling **126 shaders / linking 63 programs**. The repeat frame took 13 ms and compiled nothing. The analogous castle-light transition took **4,636.9 ms**, with the same 63-program burst, despite all 504 background warmup jobs completing successfully. This demonstrates a real multi-second main-thread stall, rather than proving that every reported permanent lockup has the same cause. The stationary FPS tests and pixel-equivalence tests failed to exercise first-use bucket transitions and were insufficient release validation.

The production renderer now retains its authored fixed point-light slots and updates normal background shader warmup without adaptive culling. The experimental budget is available only through explicit opt-in in benchmark tools. Movement caches, grove ordering, swimming presentation, spotlight cookies, infrared and shadow behaviour are retained. The earlier claimed 26–31% FPS improvement is withdrawn from production until a safe strategy can be validated across approaches and cold shader caches.

The fixed production probe uses the actual railway light selector at the home station `(6800, 786, 7500)`, with the train untouched. Both far and near retain fixed slots. It observed zero lamps far and six active lamps near; the approach frame took **16.4 ms**, the near repeat 17.1 ms, and both compiled/linked **zero programs**. The initial far render took 130.3 ms; that separate first scene submission is not hidden in the approach figures.

Evidence:
- `artifacts/render-cost-research/light-budget-train-before.json`: controlled six-lamp activation with the unsafe production controller.
- `artifacts/render-cost-research/light-budget-transitions-before.json`: castle bucket transition and completed warmup statistics.
- `artifacts/render-cost-research/light-budget-train-after.json`: actual home-station selector with fixed production light slots.

Reproduce the fixed regression probe:

```sh
FRIENDS_TEST_ORIGIN=http://localhost:3002 FRIENDS_ASSERT_NO_TRANSITION=true node tools/test-friends-light-budget-transitions.mjs
```

To explicitly reproduce the withdrawn adaptive controller, set `FRIENDS_TEST_ADAPTIVE=true` and choose a separate output with `FRIENDS_TRANSITION_OUTPUT`. The normal production renderer does not install that controller.

Hotfix validation: **235 test files / 1,877 tests passed**, `npm run lint` and `npm run build` passed, and the real-browser station probe reported no page errors or shader compilations during approach.
